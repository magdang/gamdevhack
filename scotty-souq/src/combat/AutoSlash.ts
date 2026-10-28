import * as THREE from 'three';
import type { EnemiesKit, FxKit, GameClock, Hittable, TrailHandle } from '../core/contracts';
import type { EventBus } from '../core/Events';
import { CONFIG } from '../core/config';
import type { Player } from '../player/Player';
import type { Combo } from './Combo';
import type { Damage } from './Damage';

export class AutoSlash {
  private cooldown = 0;
  private side: 1 | -1 = 1;
  private targets: Hittable[] = [];
  private direction = new THREE.Vector3();
  private tip = new THREE.Vector3();
  private base = new THREE.Vector3();
  private trail: TrailHandle | null = null;
  private trailLeft = 0;

  constructor(private player: Player, private enemies: EnemiesKit, private fx: FxKit,
    private events: EventBus, private combo: Combo, private damage: Damage) {}

  update(clock: GameClock, enabled: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - clock.dt);
    if (this.trail) {
      this.player.bladeSamples(this.tip, this.base);
      if (clock.dt > 0) this.trail.push(this.tip, this.base);
      this.trailLeft -= clock.dt;
      if (this.trailLeft <= 0) { this.trail.end(); this.trail = null; }
    }
    if (!enabled || this.cooldown > 0 || this.player.dashing || this.player.cinematic || this.player.hp <= 0) return;
    const nearest = this.enemies.nearest(this.player.position, CONFIG.slash.acquireRadius);
    if (!nearest || nearest.kind === 'boss' && this.enemies.boss?.finalCutReady) return;
    this.direction.subVectors(nearest.position, this.player.position).setY(0).normalize();
    this.player.face(this.direction, true);
    this.cooldown = CONFIG.slash.interval / this.combo.slashSpeed;
    this.side = this.side === 1 ? -1 : 1;
    this.player.swing(this.side);
    this.enemies.queryArc(this.player.position, this.player.facing, CONFIG.slash.radius, CONFIG.slash.halfAngle, this.targets);
    let hits = 0;
    for (const target of this.targets) if (this.damage.apply(target, CONFIG.slash.damage, 'slash', this.direction).applied) hits++;
    this.events.emit('player:slash', { position: this.player.position, facing: this.player.facing, side: this.side,
      radius: CONFIG.slash.radius, halfAngle: CONFIG.slash.halfAngle, hits });
    this.fx.slashArc(this.player.position, this.player.facing, CONFIG.slash.radius, CONFIG.slash.halfAngle, this.side);
    this.trail?.end();
    this.trail = this.fx.beginTrail('slash'); this.trailLeft = CONFIG.slash.duration;
  }

  reset(): void { this.cooldown = 0; this.side = 1; this.targets.length = 0; this.trail?.end(); this.trail = null; }
}
