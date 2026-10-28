import * as THREE from 'three';
import type { DamageInfo, DamageResult, DamageSource, EnemiesKit, FxKit, Hittable } from '../core/contracts';
import type { EventBus } from '../core/Events';
import type { Combo } from './Combo';

/** A single path awards combo/score from the authoritative damage result, never from duplicate events. */
export class Damage {
  private info: DamageInfo = { amount: 0, source: 'slash', dir: new THREE.Vector3() };

  constructor(private enemies: EnemiesKit, private fx: FxKit, private events: EventBus, private combo: Combo) {}

  apply(target: Hittable, amount: number, source: DamageSource, direction: THREE.Vector3): DamageResult {
    this.info.amount = amount; this.info.source = source; this.info.dir.copy(direction);
    const result = this.enemies.damage(target, this.info);
    if (!result.applied) return result;
    this.combo.hit(result.killed);
    this.fx.damageNumber(target.position, result.damage, source === 'slash' ? 'normal' : 'big');
    this.events.emit('time:hitstop', { duration: source === 'slash' ? 0.04 : 0.065 });
    return result;
  }
}
