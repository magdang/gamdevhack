import * as THREE from 'three';
import type { DamageInfo, DamageResult, EnemyKind, FxKit, Hittable, KitContext, PlayerView, SpawnGate, WorldKit } from '../core/contracts';
import { AttackTokens } from './AttackTokens';
import { COMBAT, ENEMY_CONFIG } from './config';
import { ActorVisual } from './Model';
import { Projectiles } from './Projectiles';
import { overlaps, shapeEnd, type AttackShape } from './Shapes';
import { TelegraphPool, type Telegraph } from './Telegraph';
import { FALLBACKS } from './types';

export type EnemyState = 'spawn' | 'approach' | 'telegraph' | 'strike' | 'recover' | 'hurt' | 'die';

export interface EnemyServices {
  ctx: KitContext;
  world: WorldKit;
  fx: FxKit;
  tokens: AttackTokens;
  telegraphs: TelegraphPool;
  projectiles: Projectiles;
}

export class Enemy implements Hittable {
  readonly visual: ActorVisual;
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly tuning;
  hp: number;
  state: EnemyState = 'spawn';
  disposed = false;
  private stateTime = 0;
  private age = 0;
  private cooldown: number;
  private facing = 0;
  private flashTime = 0;
  private entry = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private movement = new THREE.Vector3();
  private attackStart = new THREE.Vector3();
  private attackEnd = new THREE.Vector3();
  private shape: AttackShape | null = null;
  private decal: Telegraph | null = null;
  private struck = false;
  private entered = false;

  constructor(readonly id: number, readonly kind: EnemyKind, gate: SpawnGate, offset: number,
    private services: EnemyServices) {
    this.tuning = ENEMY_CONFIG[kind];
    this.hp = this.tuning.hp;
    this.radius = this.tuning.radius;
    this.visual = new ActorVisual(services.ctx.scene, services.ctx.assets, kind, FALLBACKS[kind](), this.radius);
    this.position = this.visual.root.position;
    this.position.copy(gate.position).add(new THREE.Vector3(gate.inward.z, 0, -gate.inward.x).multiplyScalar(offset));
    this.position.y = 0;
    this.entry.copy(this.position).addScaledVector(gate.inward, COMBAT.entryDistance);
    services.world.arena.clamp(this.entry, this.radius);
    this.facing = Math.atan2(gate.inward.x, gate.inward.z);
    this.cooldown = services.ctx.rng.range(0.3, this.tuning.cooldown);
    services.ctx.events.emit('enemy:spawned', { id, kind, position: this.position });
  }

  get alive(): boolean { return this.hp > 0 && this.state !== 'die' && !this.disposed; }

  update(dt: number, player: PlayerView, neighbors: readonly Enemy[]): void {
    if (this.disposed || dt <= 0) return;
    this.age += dt;
    this.stateTime += dt;
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.visual.flash(this.flashTime / COMBAT.flashDuration);
    if (this.state === 'die') {
      const t = Math.min(1, this.stateTime / COMBAT.deathDuration);
      this.visual.body.scale.set(1 + t * 0.6, Math.max(0.02, 1 - t), 1 + t * 0.4);
      this.visual.body.rotation.z = t * 1.5;
      if (t >= 1) this.dispose();
      return;
    }
    switch (this.state) {
      case 'spawn':
        this.moveToward(this.entry, dt, neighbors, false);
        if (this.position.distanceToSquared(this.entry) < 0.12) { this.entered = true; this.setState('approach'); }
        break;
      case 'approach': {
        const distance = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z);
        this.face(player.position);
        // Hoverers hold a little distance, but never reverse after committing a shot.
        if (this.kind === 'wasp' && distance < this.tuning.range * 0.48) {
          this.movement.copy(this.position).sub(player.position).setY(0).normalize();
          this.position.addScaledVector(this.movement, this.tuning.speed * dt);
          this.services.world.arena.clamp(this.position, this.radius);
        } else if (distance > this.tuning.range * 0.85) this.moveToward(player.position, dt, neighbors, true);
        else this.separate(dt, neighbors);
        if (distance <= this.tuning.range + player.radius && this.cooldown <= 0 && player.hp > 0
          && this.services.tokens.acquire(this.id)) this.beginAttack(player);
        break;
      }
      case 'telegraph':
        this.decal?.setProgress(this.stateTime / this.tuning.windup);
        if (this.stateTime >= this.tuning.windup) {
          this.setState('strike');
          if (this.kind !== 'tiger') this.strike(player);
        }
        break;
      case 'strike': {
        const t = Math.min(1, this.stateTime / this.tuning.strikeTime);
        if (this.kind === 'bear' || this.kind === 'tiger') {
          this.position.lerpVectors(this.attackStart, this.attackEnd, t);
          this.services.world.arena.clamp(this.position, this.radius);
        }
        if (t >= 1) {
          if (!this.struck) this.strike(player);
          this.services.tokens.release(this.id);
          this.setState('recover');
        }
        break;
      }
      case 'recover':
        if (this.stateTime >= this.tuning.recovery) {
          this.cooldown = this.tuning.cooldown * this.services.ctx.rng.range(0.8, 1.2);
          this.setState('approach');
        }
        break;
      case 'hurt':
        this.position.addScaledVector(this.velocity, dt);
        this.velocity.multiplyScalar(Math.exp(-COMBAT.knockbackDecay * dt));
        if (this.entered) this.services.world.arena.clamp(this.position, this.radius);
        if (this.stateTime >= COMBAT.hurtDuration) this.setState(this.entered ? 'approach' : 'spawn');
        break;
    }
    this.animate();
  }

  private setState(state: EnemyState): void { this.state = state; this.stateTime = 0; }
  private face(target: THREE.Vector3): void { this.facing = Math.atan2(target.x - this.position.x, target.z - this.position.z); }

  private moveToward(target: THREE.Vector3, dt: number, neighbors: readonly Enemy[], clamp: boolean): void {
    this.movement.copy(target).sub(this.position).setY(0);
    const distance = this.movement.length();
    if (distance > 0.01) {
      this.facing = Math.atan2(this.movement.x, this.movement.z);
      this.position.addScaledVector(this.movement, Math.min(distance, this.tuning.speed * dt) / distance);
    }
    this.separate(dt, neighbors);
    if (clamp) this.services.world.arena.clamp(this.position, this.radius);
  }

  private separate(dt: number, neighbors: readonly Enemy[]): void {
    for (const other of neighbors) {
      if (other === this || !other.alive) continue;
      const dx = this.position.x - other.position.x;
      const dz = this.position.z - other.position.z;
      const distance = Math.hypot(dx, dz);
      const desired = this.radius + other.radius + COMBAT.separationPadding;
      if (distance >= desired) continue;
      const angle = (this.id * 2.39996) % (2 * Math.PI);
      const strength = Math.min(desired - distance, COMBAT.separationStrength * dt);
      this.position.x += (distance > 0.001 ? dx / distance : Math.sin(angle)) * strength;
      this.position.z += (distance > 0.001 ? dz / distance : Math.cos(angle)) * strength;
    }
  }

  private beginAttack(player: PlayerView): void {
    this.face(player.position);
    this.attackStart.copy(this.position);
    const center = this.position.clone();
    switch (this.kind) {
      case 'beaver':
        center.add(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(0.85));
        this.shape = { kind: 'circle', center, radius: this.tuning.attackRadius };
        break;
      case 'tree': case 'collie':
        this.shape = { kind: this.kind === 'tree' ? 'arc' : 'cone', center, facing: this.facing,
          radius: this.tuning.attackRadius, halfAngle: this.tuning.halfAngle };
        break;
      case 'bear': case 'wasp':
        this.shape = { kind: 'line', center, facing: this.facing, length: this.tuning.length, width: this.tuning.width };
        break;
      case 'tiger':
        center.copy(player.position).setY(0);
        this.services.world.arena.clamp(center, this.tuning.attackRadius);
        this.shape = { kind: 'circle', center, radius: this.tuning.attackRadius };
        break;
    }
    this.attackEnd.copy(shapeEnd(this.shape));
    this.services.world.arena.clamp(this.attackEnd, this.radius);
    this.struck = false;
    this.decal = this.services.telegraphs.acquire(this.shape);
    this.setState('telegraph');
    this.services.ctx.events.emit('enemy:telegraph', {
      id: this.id, kind: this.kind, position: this.shape.center, duration: this.tuning.windup,
    });
  }

  private strike(player: PlayerView): void {
    if (!this.shape || this.struck) return;
    this.struck = true;
    this.decal?.strike();
    this.decal = null;
    const { ctx, projectiles } = this.services;
    ctx.events.emit('enemy:strike', { id: this.id, kind: this.kind, position: this.shape.center });
    if (this.kind === 'wasp') {
      projectiles.fire(this.attackStart, new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)), this.tuning.length);
    } else if (!player.invulnerable && overlaps(this.shape, player.position, player.radius)) {
      player.hurt(COMBAT.damage, this.attackStart);
    }
  }

  private animate(): void {
    const body = this.visual.body;
    const walking = this.state === 'spawn' || this.state === 'approach';
    const windup = this.state === 'telegraph' ? Math.min(1, this.stateTime / this.tuning.windup) : 0;
    const strike = this.state === 'strike' ? Math.sin(Math.min(1, this.stateTime / this.tuning.strikeTime) * Math.PI) : 0;
    const bob = walking ? Math.abs(Math.sin(this.age * this.tuning.speed * 3.5)) * 0.1 : 0;
    body.position.y = this.tuning.hover + bob + (this.kind === 'wasp' ? Math.sin(this.age * 6) * 0.12 : 0)
      + (this.kind === 'tiger' ? strike * this.tuning.leapHeight : 0);
    body.scale.set(1 + windup * 0.15 - strike * 0.12, 1 - windup * 0.18 + strike * 0.18, 1 + strike * 0.15);
    body.rotation.set(-windup * 0.28 + strike * 0.4, this.facing + windup * (this.kind === 'tree' ? -0.7 : 0),
      this.state === 'hurt' ? Math.sin(this.stateTime * 80) * 0.18 : walking ? Math.sin(this.age * 9) * 0.07 : 0);
    if (this.kind === 'tree' && this.state === 'strike') body.rotation.y += strike * 1.5;
    if (this.kind === 'beaver' && this.state === 'strike') body.rotation.x -= strike * 0.8;
  }

  damage(info: DamageInfo): DamageResult {
    if (!this.alive || !Number.isFinite(info.amount) || info.amount <= 0) return { applied: false, killed: false, damage: 0 };
    const damage = Math.min(this.hp, info.amount);
    this.hp -= damage;
    const killed = this.hp <= 0;
    this.cancelAttack();
    this.flashTime = COMBAT.flashDuration;
    this.velocity.copy(info.dir).setY(0).normalize().multiplyScalar(COMBAT.knockback);
    this.cooldown = this.tuning.cooldown;
    if (killed) {
      this.setState('die');
      if (info.source === 'dash' || info.source === 'finalCut') {
        this.visual.root.updateMatrixWorld(true);
        this.services.fx.splitObject(this.visual.body, info.dir);
        this.visual.body.visible = false;
      }
    } else this.setState('hurt');
    this.services.ctx.events.emit('enemy:hit', { id: this.id, kind: this.kind, position: this.position,
      damage, source: info.source, killed });
    if (killed) this.services.ctx.events.emit('enemy:killed', { id: this.id, kind: this.kind,
      position: this.position, source: info.source });
    return { applied: true, killed, damage };
  }

  private cancelAttack(): void {
    this.services.tokens.release(this.id);
    this.decal?.release();
    this.decal = null;
    this.shape = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelAttack();
    this.visual.dispose();
    this.disposed = true;
  }
}
