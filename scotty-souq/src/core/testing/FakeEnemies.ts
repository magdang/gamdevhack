import * as THREE from 'three';
import type { ArenaInfo, DamageInfo, DamageResult, EnemiesKit, FxKit, GameClock, Hittable, KitContext, PlayerView } from '../contracts';

interface Target extends Hittable {
  hp: number;
  maxHp: number;
  alive: boolean;
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  timer: number;
  attacking: boolean;
}
interface FakeBoss extends Target { phase: 1 | 2; staggered: boolean; finalCutReady: boolean }

/** Isolated contract harness. Production enemies are never imported or modified here. */
class FakeEnemies implements EnemiesKit {
  wave = 0;
  readonly totalWaves = 5;
  boss: FakeBoss | null = null;
  private targets: Target[] = [];
  private bossTarget: FakeBoss;
  private frozen = false;
  private nextWave = 0;
  private intro = 0;
  private defeated = 0;
  private started = false;
  private result: DamageResult = { applied: false, killed: false, damage: 0 };
  private kinds = ['beaver', 'collie', 'tree', 'bear', 'wasp', 'tiger'] as const;

  constructor(private ctx: KitContext, private arena: ArenaInfo, private fx: FxKit) {
    const geometry = new THREE.CapsuleGeometry(0.5, 0.7, 4, 8);
    const ring = new THREE.RingGeometry(0.9, 1.05, 32).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff405f, transparent: true, opacity: 0.65, depthWrite: false });
    const colors = [0xb2815e, 0xb9ac8a, 0x48975a, 0xcaa33d, 0xf3cd40, 0xec8b34];
    for (let i = 0; i < 30; i++) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.75 }));
      const decal = new THREE.Mesh(ring, ringMat);
      mesh.visible = decal.visible = false; mesh.castShadow = true;
      ctx.scene.add(mesh, decal);
      this.targets.push({ id: i + 1, kind: this.kinds[i % this.kinds.length], position: new THREE.Vector3(), radius: 0.5,
        hp: 3, maxHp: 3, alive: false, mesh, ring: decal, timer: 0, attacking: false });
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(2, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe0b28a, roughness: 0.7 }));
    mesh.visible = false; mesh.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 3.5), new THREE.MeshStandardMaterial({ color: 0x282034 }));
    cap.position.y = 1.85; cap.rotation.y = Math.PI / 4; mesh.add(cap);
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0x241c2b }));
    glasses.position.set(0, 0.3, 1.85); mesh.add(glasses);
    const decal = new THREE.Mesh(ring, ringMat); decal.scale.setScalar(3.5); decal.visible = false;
    ctx.scene.add(mesh, decal);
    this.bossTarget = { id: 1000, kind: 'boss', position: new THREE.Vector3(0, 0, -5), radius: 2, hp: 120, maxHp: 120,
      phase: 1, staggered: false, finalCutReady: false, alive: false, mesh, ring: decal, timer: 1.8, attacking: false };
  }

  start(fromWave: number): void {
    this.started = true;
    this.beginWave(Math.max(1, Math.min(6, Math.trunc(fromWave))));
  }

  private beginWave(wave: number): void {
    this.wave = wave; this.nextWave = 0;
    this.ctx.events.emit('wave:start', { wave, totalWaves: this.totalWaves });
    if (wave === 6) {
      this.intro = 1.4;
      this.ctx.events.emit('boss:intro', { position: this.arena.bossBreach.position });
      return;
    }
    const count = 5 + wave * 2;
    const rotation = this.ctx.rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const target = this.targets[i];
      const angle = rotation + (i / count) * Math.PI * 2;
      const radius = 7 + i % 3;
      target.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      target.alive = target.mesh.visible = true;
      target.hp = target.maxHp = wave < 3 ? 3 : 4;
      target.timer = 0.7 + i * 0.05; target.attacking = false;
      this.syncMesh(target);
      this.ctx.events.emit('enemy:spawned', { id: target.id, kind: target.kind as 'beaver', position: target.position });
    }
  }

  private syncMesh(target: Target): void {
    target.mesh.position.copy(target.position); target.mesh.position.y = target.kind === 'boss' ? 2.6 : 0.85;
    target.ring.position.copy(target.position); target.ring.position.y = 0.035;
  }

  update(clock: GameClock, player: PlayerView): void {
    if (!this.started) return;
    if (this.defeated > 0) {
      this.defeated -= clock.realDt;
      if (this.defeated <= 0) this.ctx.events.emit('boss:defeated', { position: this.bossTarget.position });
    }
    if (this.frozen || clock.dt <= 0) return;
    if (this.intro > 0) {
      this.intro -= clock.dt;
      if (this.intro <= 0) {
        this.boss = this.bossTarget; this.boss.alive = this.boss.mesh.visible = true;
        this.syncMesh(this.boss);
        this.ctx.events.emit('boss:spawned', { hp: this.boss.hp, maxHp: this.boss.maxHp });
      }
      return;
    }
    if (this.nextWave > 0) {
      this.nextWave -= clock.dt;
      if (this.nextWave <= 0) this.beginWave(this.wave + 1);
      return;
    }
    for (const target of this.targets) if (target.alive) this.approach(target, player, clock.dt);
    if (this.boss?.alive && !this.boss.finalCutReady) this.approach(this.boss, player, clock.dt);
    if (this.wave < 6 && this.aliveCount() === 0 && !this.nextWave) {
      this.ctx.events.emit('wave:cleared', { wave: this.wave }); this.nextWave = 2.5;
    }
  }

  private approach(target: Target, player: PlayerView, dt: number): void {
    const dx = player.position.x - target.position.x, dz = player.position.z - target.position.z;
    const distance = Math.hypot(dx, dz);
    const boss = target.kind === 'boss';
    const reach = boss ? 4.5 : 1.65;
    target.timer -= dt;
    if (!target.attacking && distance > target.radius + 0.7) {
      const step = Math.min(distance, dt * (boss ? 1.7 : 2.2 + this.wave * 0.1));
      target.position.x += dx / distance * step; target.position.z += dz / distance * step;
      this.arena.clamp(target.position, target.radius); target.mesh.rotation.y = Math.atan2(dx, dz);
    }
    if (!target.attacking && target.timer <= 0 && distance < reach + 1) {
      target.attacking = true; target.timer = 0.7; target.ring.visible = true;
      if (boss) this.ctx.events.emit('boss:attack', { kind: 'slam', position: target.position });
      else this.ctx.events.emit('enemy:telegraph', { id: target.id, kind: target.kind as 'beaver', position: target.position, duration: 0.7 });
    } else if (target.attacking && target.timer <= 0) {
      target.attacking = false; target.ring.visible = false; target.timer = boss ? 1.8 : 1.3;
      if (distance < reach) player.hurt(1, target.position);
      if (boss) { this.fx.shockwave(target.position, reach); this.ctx.events.emit('boss:slam', { position: target.position, radius: reach }); }
      else this.ctx.events.emit('enemy:strike', { id: target.id, kind: target.kind as 'beaver', position: target.position });
    }
    this.syncMesh(target);
  }

  aliveCount(): number { let n = this.boss?.alive ? 1 : 0; for (const t of this.targets) if (t.alive) n++; return n; }

  nearest(p: THREE.Vector3, maxDist: number): Hittable | null {
    let best: Hittable | null = null;
    let distance = maxDist;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const d = p.distanceTo(t.position);
      if (d <= distance) { distance = d; best = t; }
    }
    if (this.boss?.alive && p.distanceTo(this.boss.position) <= distance) best = this.boss;
    return best;
  }

  queryArc(center: THREE.Vector3, facing: number, radius: number, halfAngle: number, out: Hittable[]): Hittable[] {
    out.length = 0;
    for (const t of this.targets) if (this.inArc(t, center, facing, radius, halfAngle)) out.push(t);
    if (this.boss && this.inArc(this.boss, center, facing, radius, halfAngle)) out.push(this.boss);
    return out;
  }

  private inArc(t: Hittable, center: THREE.Vector3, facing: number, radius: number, half: number): boolean {
    if (!t.alive || t.position.distanceTo(center) > radius + t.radius) return false;
    const angle = Math.atan2(t.position.x - center.x, t.position.z - center.z) - facing;
    return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= half;
  }

  querySegment(a: THREE.Vector3, b: THREE.Vector3, radius: number, out: Hittable[]): Hittable[] {
    out.length = 0;
    const dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz;
    const test = (t: Hittable) => {
      if (!t.alive) return;
      const p = Math.max(0, Math.min(1, ((t.position.x - a.x) * dx + (t.position.z - a.z) * dz) / (len || 1)));
      if (Math.hypot(t.position.x - a.x - p * dx, t.position.z - a.z - p * dz) <= radius + t.radius) out.push(t);
    };
    for (const target of this.targets) test(target);
    if (this.boss) test(this.boss);
    out.sort((x, y) => (x.position.x - y.position.x) * dx + (x.position.z - y.position.z) * dz);
    return out;
  }

  damage(target: Hittable, info: DamageInfo): DamageResult {
    const t = target as Target;
    this.result.applied = this.result.killed = false; this.result.damage = 0;
    if (!t.alive || target === this.boss && this.boss.finalCutReady) return this.result;
    const damage = Math.min(t.hp, info.amount);
    t.hp -= damage;
    if (target === this.boss) {
      if (t.hp <= t.maxHp * 0.08) {
        t.hp = Math.max(1, t.hp); this.boss.finalCutReady = true;
        this.boss.ring.visible = false;
        this.ctx.events.emit('finalcut:ready', { position: t.position });
      }
      if (t.hp <= t.maxHp * 0.5 && this.boss.phase === 1) { this.boss.phase = 2; this.ctx.events.emit('boss:phase', { phase: 2 }); }
      this.ctx.events.emit('boss:hit', { hp: t.hp, maxHp: t.maxHp, damage, staggered: false });
    } else if (t.hp <= 0) {
      t.alive = t.mesh.visible = t.ring.visible = false;
      this.ctx.events.emit('enemy:killed', { id: t.id, kind: t.kind as 'beaver', position: t.position, source: info.source });
    }
    this.fx.petalBurst(t.position, t.alive ? 10 : 35, 1);
    this.ctx.events.emit('enemy:hit', { id: t.id, kind: t.kind, position: t.position, damage, source: info.source, killed: !t.alive });
    this.result.applied = true; this.result.killed = !t.alive; this.result.damage = damage;
    return this.result;
  }

  executeFinalCut(dir: THREE.Vector3): void {
    if (!this.boss?.finalCutReady || !this.boss.alive) return;
    this.boss.hp = 0; this.boss.alive = this.boss.mesh.visible = false;
    this.fx.splitObject(this.boss.mesh, dir, 3); this.defeated = 0.65;
  }

  setFrozen(frozen: boolean): void { this.frozen = frozen; }
  reset(): void {
    this.started = this.frozen = false; this.wave = this.nextWave = this.intro = this.defeated = 0;
    for (const t of this.targets) { t.alive = t.mesh.visible = t.ring.visible = false; t.attacking = false; }
    const b = this.bossTarget;
    b.hp = b.maxHp; b.alive = b.mesh.visible = b.ring.visible = b.finalCutReady = b.staggered = false; b.phase = 1;
    b.position.set(0, 0, -5); b.timer = 1.8; b.attacking = false; this.boss = null;
  }
}

export function createFakeEnemies(ctx: KitContext, deps: { world: { arena: ArenaInfo }; fx: FxKit }): EnemiesKit {
  return new FakeEnemies(ctx, deps.world.arena, deps.fx);
}
