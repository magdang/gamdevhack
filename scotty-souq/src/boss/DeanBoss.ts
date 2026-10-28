import * as THREE from 'three';
import type { BossView, DamageInfo, DamageResult, GameClock, PlayerView } from '../core/contracts';
import { BOSS, COMBAT } from '../enemies/config';
import type { EnemyServices } from '../enemies/Enemy';
import { ActorVisual } from '../enemies/Model';
import { overlaps, shapeEnd, type AttackShape } from '../enemies/Shapes';
import type { Telegraph } from '../enemies/Telegraph';
import { createClub, createDeanFace } from './DeanModel';

type Attack = 'slam' | 'sweep' | 'charge' | 'summon';
type State = 'intro' | 'idle' | 'windup' | 'strike' | 'stagger' | 'recover' | 'stunned' | 'dying' | 'dead';

export class DeanBoss implements BossView {
  readonly kind = 'boss' as const;
  readonly radius = BOSS.radius;
  readonly maxHp = BOSS.hp;
  readonly position: THREE.Vector3;
  readonly visual: ActorVisual;
  hp = BOSS.hp;
  phase: 1 | 2 = 1;
  finalCutReady = false;
  private state: State = 'intro';
  private stateTime = 0;
  private age = 0;
  private flash = 0;
  private attack: Attack = 'slam';
  private attackIndex = 0;
  private duration = 1;
  private facing = 0;
  private shape: AttackShape | null = null;
  private decal: Telegraph | null = null;
  private entryStart: THREE.Vector3;
  private entryEnd: THREE.Vector3;
  private attackStart = new THREE.Vector3();
  private attackEnd = new THREE.Vector3();
  private club = createClub();
  private clubHome = new THREE.Vector3(2.3, 2.3, 0.1);
  private disposed = false;

  constructor(readonly id: number, private services: EnemyServices, private summon: () => void) {
    const { ctx, world } = services;
    this.visual = new ActorVisual(ctx.scene, ctx.assets, 'dean', createDeanFace(), this.radius);
    this.position = this.visual.root.position;
    this.entryStart = world.arena.bossBreach.position.clone().setY(0);
    this.entryEnd = this.entryStart.clone().addScaledVector(world.arena.bossBreach.inward, BOSS.entryDistance);
    world.arena.clamp(this.entryEnd, this.radius);
    this.position.copy(this.entryStart);
    this.facing = Math.atan2(world.arena.bossBreach.inward.x, world.arena.bossBreach.inward.z);
    this.visual.root.add(this.club);
    this.club.position.copy(this.clubHome);
    this.visual.body.rotation.y = this.facing;
    ctx.events.emit('boss:intro', { position: this.position });
    world.breachWall();
    ctx.events.emit('camera:shake', { intensity: 0.8, duration: 0.8 });
  }

  get alive(): boolean { return !this.disposed && this.hp > 0 && this.state !== 'intro' && this.state !== 'dead' && this.state !== 'dying'; }
  get staggered(): boolean { return this.state === 'stagger'; }
  get cinematic(): boolean { return this.state === 'intro' || this.state === 'dying'; }

  update(clock: GameClock, player: PlayerView, frozen: boolean): void {
    if (this.disposed || this.state === 'dead') return;
    // Entrance and Final Cut are cinematics. They finish even while core freezes combat or slows time.
    const dt = this.cinematic ? clock.realDt : frozen ? 0 : clock.dt;
    if (dt <= 0) return;
    this.stateTime += dt;
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.visual.flash(this.flash / COMBAT.flashDuration);
    switch (this.state) {
      case 'intro': {
        const t = Math.min(1, this.stateTime / BOSS.introDuration);
        this.position.lerpVectors(this.entryStart, this.entryEnd, 1 - (1 - t) ** 3);
        if (t >= 1) {
          this.setState('idle');
          this.services.ctx.events.emit('boss:spawned', { hp: this.hp, maxHp: this.maxHp });
        }
        break;
      }
      case 'idle': {
        const delta = player.position.clone().sub(this.position).setY(0);
        this.facing = Math.atan2(delta.x, delta.z);
        const distance = delta.length();
        if (distance > BOSS.engageRange) {
          this.position.addScaledVector(delta.normalize(), Math.min(distance - BOSS.engageRange, dt * BOSS.moveSpeed));
          this.services.world.arena.clamp(this.position, this.radius);
        }
        if (this.stateTime >= BOSS.cooldown && distance <= BOSS.engageRange + player.radius && player.hp > 0
          && this.services.tokens.acquire(this.id)) this.beginAttack(player);
        break;
      }
      case 'windup':
        this.decal?.setProgress(this.stateTime / this.duration);
        if (this.stateTime >= this.duration) this.strike(player);
        break;
      case 'strike':
        if (this.attack === 'charge') {
          this.position.lerpVectors(this.attackStart, this.attackEnd, Math.min(1, this.stateTime / BOSS.chargeDuration));
          this.services.world.arena.clamp(this.position, this.radius);
        }
        if (this.stateTime >= (this.attack === 'charge' ? BOSS.chargeDuration : BOSS.strikeDuration)) this.setState('recover');
        break;
      case 'stagger':
        if (this.stateTime >= BOSS.staggerDuration) this.setState('recover');
        break;
      case 'recover':
        if (this.stateTime >= BOSS.recovery / this.speedMultiplier) this.setState('idle');
        break;
      case 'stunned': break;
      case 'dying':
        if (this.stateTime >= BOSS.finalCutDuration) {
          this.setState('dead');
          this.services.ctx.events.emit('boss:defeated', { position: this.position });
          this.visual.root.visible = false;
        }
        break;
    }
    this.animate();
  }

  private get speedMultiplier(): number { return this.phase === 2 ? BOSS.phaseTwoSpeed : 1; }
  private setState(state: State): void { this.state = state; this.stateTime = 0; }

  private beginAttack(player: PlayerView): void {
    const cycle: Attack[] = this.phase === 2 ? ['slam', 'sweep', 'charge', 'summon'] : ['slam', 'sweep', 'charge'];
    this.attack = cycle[this.attackIndex++ % cycle.length];
    this.attackStart.copy(this.position);
    this.facing = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);
    const center = this.position.clone();
    if (this.attack === 'slam') {
      const toward = player.position.clone().sub(center).setY(0);
      center.add(toward.clampLength(0, BOSS.slamReach));
      this.services.world.arena.clamp(center, BOSS.slamRadius);
      this.shape = { kind: 'circle', center, radius: BOSS.slamRadius };
    } else if (this.attack === 'sweep') {
      this.shape = { kind: 'arc', center, facing: this.facing, radius: BOSS.sweepRadius, halfAngle: BOSS.sweepHalfAngle };
    } else if (this.attack === 'charge') {
      this.shape = { kind: 'line', center, facing: this.facing, length: BOSS.chargeLength, width: BOSS.chargeWidth };
    } else this.shape = null;
    if (this.shape) {
      this.decal = this.services.telegraphs.acquire(this.shape);
      this.attackEnd.copy(shapeEnd(this.shape));
      this.services.world.arena.clamp(this.attackEnd, this.radius);
    }
    this.duration = BOSS.windup[this.attack] / this.speedMultiplier;
    this.setState('windup');
    this.services.ctx.events.emit('boss:attack', { kind: this.attack, position: this.shape?.center ?? this.position });
  }

  private strike(player: PlayerView): void {
    this.services.tokens.release(this.id);
    this.decal?.strike();
    this.decal = null;
    const { ctx, fx } = this.services;
    if (this.shape && !player.invulnerable && overlaps(this.shape, player.position, player.radius)) {
      player.hurt(COMBAT.damage, this.attackStart);
    }
    if (this.attack === 'slam' && this.shape) {
      this.setState('stagger');
      ctx.events.emit('boss:slam', { position: this.shape.center, radius: BOSS.slamRadius });
      fx.shockwave(this.shape.center, BOSS.slamRadius, 0xffba52);
      fx.debris(this.shape.center, new THREE.Vector3(0, 1, 0), 18);
      ctx.events.emit('camera:shake', { intensity: 0.9, duration: 0.4 });
      ctx.events.emit('boss:staggered', { duration: BOSS.staggerDuration });
    } else {
      this.setState('strike');
      if (this.attack === 'summon') {
        this.summon();
        fx.shockwave(this.position, 4, 0xb77aff);
      }
    }
  }

  damage(info: DamageInfo): DamageResult {
    if (!this.alive || !Number.isFinite(info.amount) || info.amount <= 0) return { applied: false, killed: false, damage: 0 };
    if (this.finalCutReady) {
      if (info.source !== 'finalCut') return { applied: false, killed: false, damage: 0 };
      const damage = this.hp;
      this.executeFinalCut(info.dir);
      return { applied: true, killed: true, damage };
    }
    const staggered = this.staggered;
    const damage = Math.min(this.hp - this.maxHp * BOSS.finalCutThreshold,
      info.amount * (staggered ? BOSS.staggerMultiplier : 1));
    this.hp -= damage;
    this.flash = COMBAT.flashDuration;
    this.services.ctx.events.emit('enemy:hit', { id: this.id, kind: 'boss', position: this.position,
      damage, source: info.source, killed: false });
    this.services.ctx.events.emit('boss:hit', { hp: this.hp, maxHp: this.maxHp, damage, staggered });
    if (this.phase === 1 && this.hp <= this.maxHp * BOSS.phaseThreshold) {
      this.phase = 2;
      this.services.ctx.events.emit('boss:phase', { phase: 2 });
    }
    if (this.hp <= this.maxHp * BOSS.finalCutThreshold + 1e-6) {
      this.cancelAttack();
      this.setState('stunned');
      this.finalCutReady = true;
      this.services.ctx.events.emit('finalcut:ready', { position: this.position });
    }
    return { applied: true, killed: false, damage };
  }

  executeFinalCut(dir: THREE.Vector3): void {
    if (!this.finalCutReady || this.state !== 'stunned') return;
    this.cancelAttack();
    this.finalCutReady = false;
    const damage = this.hp;
    this.hp = 0;
    this.setState('dying');
    const { fx, ctx } = this.services;
    this.visual.root.updateMatrixWorld(true);
    fx.splitObject(this.visual.body, dir, BOSS.splitPower);
    fx.splitObject(this.club, dir, BOSS.splitPower * 0.65);
    this.visual.body.visible = false;
    this.club.visible = false;
    fx.petalBurst(this.position.clone().add(new THREE.Vector3(0, 2.5, 0)), BOSS.finalPetals, 12);
    fx.shockwave(this.position, 10, 0xffe6e0);
    ctx.events.emit('camera:shake', { intensity: 1.1, duration: 0.65 });
    ctx.events.emit('enemy:hit', { id: this.id, kind: 'boss', position: this.position, damage, source: 'finalCut', killed: true });
    ctx.events.emit('boss:hit', { hp: 0, maxHp: this.maxHp, damage, staggered: false });
  }

  private animate(): void {
    const windup = this.state === 'windup' ? Math.min(1, this.stateTime / this.duration) : 0;
    const stuck = this.state === 'stagger';
    this.visual.body.position.y = 0.4 + Math.sin(this.age * 2.4) * 0.2;
    this.visual.body.rotation.set(stuck ? 0.18 : -windup * 0.16, this.facing,
      this.state === 'stunned' ? Math.sin(this.age * 12) * 0.09 : Math.sin(this.age * 1.7) * 0.04);
    this.visual.body.scale.set(1 + (stuck ? 0.12 : 0), stuck ? 0.86 : 1, 1);
    this.club.position.copy(this.clubHome).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.facing);
    this.club.rotation.set(0, this.facing, -windup * 1.5);
    if (stuck && this.shape) {
      this.club.position.copy(this.shape.center).sub(this.position);
      this.club.position.y = 2.9;
      this.club.rotation.z = Math.PI;
    } else if (this.attack === 'sweep' && this.state === 'strike') {
      this.club.rotation.y += Math.PI * 1.4 * this.stateTime / BOSS.strikeDuration;
      this.club.rotation.z = -1.2;
    }
  }

  private cancelAttack(): void {
    this.services.tokens.release(this.id);
    this.decal?.release();
    this.decal = null;
    this.shape = null;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelAttack();
    // Club is a child of root and is disposed with the visual.
    this.visual.dispose();
  }
}
