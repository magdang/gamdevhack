import * as THREE from 'three';
import type { ArenaInfo, EnemiesKit, FxKit, GameClock, Hittable, TrailHandle } from '../core/contracts';
import type { EventBus } from '../core/Events';
import { CONFIG } from '../core/config';
import type { Player } from '../player/Player';
import type { Damage } from './Damage';
import type { Finisher } from './Finisher';

export class Dash {
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private tip = new THREE.Vector3();
  private base = new THREE.Vector3();
  private targets: Hittable[] = [];
  private hitAt: number[] = [];
  private index = 0;
  private elapsed = 0;
  private cooldown = 0;
  private hits = 0;
  private kills = 0;
  private trail: TrailHandle | null = null;
  get ready01(): number { return 1 - this.cooldown / CONFIG.dash.cooldown; }

  constructor(private player: Player, private arena: ArenaInfo, private enemies: EnemiesKit,
    private fx: FxKit, private events: EventBus, private damage: Damage, private finisher: Finisher) {}

  start(direction: THREE.Vector3): boolean {
    if (this.cooldown > 0 || this.player.dashing || this.player.hp <= 0 || direction.lengthSq() < 0.01) return false;
    this.from.copy(this.player.position);
    this.direction.copy(direction).setY(0).normalize();
    this.to.copy(this.from).addScaledVector(this.direction, CONFIG.dash.distance);
    this.arena.clamp(this.to, this.player.radius);
    const distance = this.to.distanceTo(this.from);
    if (distance < 0.3) return false;
    this.cooldown = CONFIG.dash.cooldown;
    this.elapsed = this.hits = this.kills = this.index = 0;
    this.player.dashing = true; this.player.face(this.direction, true);
    this.player.velocity.copy(this.direction).multiplyScalar(distance / CONFIG.dash.duration);
    this.enemies.querySegment(this.from, this.to, CONFIG.dash.radius, this.targets);
    for (let i = 0; i < this.targets.length; i++) {
      const p = this.targets[i].position;
      const along = (p.x - this.from.x) * this.direction.x + (p.z - this.from.z) * this.direction.z;
      const travel = Math.max(0, along - this.targets[i].radius - CONFIG.dash.radius) / distance * CONFIG.dash.duration;
      this.hitAt[i] = Math.min(CONFIG.dash.duration, Math.max(travel, i * CONFIG.dash.stagger));
    }
    this.trail = this.fx.beginTrail('dash');
    this.events.emit('dash:start', { from: this.from, to: this.to });
    return true;
  }

  update(clock: GameClock): void {
    this.cooldown = Math.max(0, this.cooldown - clock.dt);
    if (!this.player.dashing) return;
    this.elapsed = Math.min(CONFIG.dash.duration, this.elapsed + clock.dt);
    this.player.position.lerpVectors(this.from, this.to, this.elapsed / CONFIG.dash.duration);
    if (clock.dt > 0) {
      this.player.bladeSamples(this.tip, this.base);
      this.trail?.push(this.tip, this.base);
    }
    while (this.index < this.targets.length && this.elapsed >= this.hitAt[this.index]) {
      const target = this.targets[this.index++];
      const result = this.damage.apply(target, CONFIG.dash.damage, 'dash', this.direction);
      if (result.applied) this.hits++;
      if (result.killed) this.kills++;
    }
    if (this.elapsed < CONFIG.dash.duration) return;
    this.player.dashing = false;
    this.player.velocity.copy(this.direction).multiplyScalar(CONFIG.player.speed);
    this.trail?.end(); this.trail = null;
    this.events.emit('dash:end', { from: this.from, to: this.to, hits: this.hits, kills: this.kills });
    if (this.kills >= 3 || this.kills > 0 && this.enemies.aliveCount() === 0 && !this.enemies.boss) this.finisher.trigger(this.player.position, this.kills);
  }

  reset(): void {
    this.player.dashing = false; this.cooldown = this.elapsed = 0;
    this.targets.length = this.hitAt.length = 0; this.trail?.end(); this.trail = null;
  }
}
