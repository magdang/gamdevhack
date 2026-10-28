import * as THREE from 'three';
import type { EnemiesKit, Hittable } from '../contracts';
import type { Player } from '../../player/Player';

/** Uses exactly the same move/dash intents as human input. No scripted damage or wave advancement. */
export class Autoplay {
  readonly move = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private endpoint = new THREE.Vector3();
  private candidate = new THREE.Vector3();
  private hits: Hittable[] = [];
  private decision = 0;
  private age = 0;

  constructor(private player: Player, private enemies: EnemiesKit, private dash: (dir: THREE.Vector3) => void) {}

  update(realDt: number, finalCutReady: boolean): void {
    this.age += realDt; this.decision -= realDt;
    const nearest = this.enemies.nearest(this.player.position, Infinity);
    this.move.set(0, 0, 0);
    if (!nearest) return;
    this.direction.subVectors(nearest.position, this.player.position).setY(0);
    const distance = this.direction.length();
    if (distance > 0.01) this.direction.multiplyScalar(1 / distance);
    else this.direction.set(1, 0, 0);
    if (distance > (nearest.kind === 'boss' ? 2.2 : 1.4)) this.move.copy(this.direction);
    // Keep pressure on a boss and dodge to the far side instead of circling out of range.
    if (this.player.dashing || this.decision > 0) return;
    this.decision = 0.12;
    if (finalCutReady) { this.dash(this.direction); return; }
    if (distance > 8 || this.age < 0.9) return;
    let best = 0;
    let bestAngle = Math.atan2(this.direction.x, this.direction.z);
    for (let i = -2; i <= 2; i++) {
      const angle = Math.atan2(this.direction.x, this.direction.z) + i * 0.23;
      this.candidate.set(Math.sin(angle), 0, Math.cos(angle));
      this.endpoint.copy(this.player.position).addScaledVector(this.candidate, 9);
      const n = this.enemies.querySegment(this.player.position, this.endpoint, 1.5, this.hits).length;
      if (n > best) { best = n; bestAngle = angle; }
    }
    if (best > 0) { this.direction.set(Math.sin(bestAngle), 0, Math.cos(bestAngle)); this.dash(this.direction); }
  }
  reset(): void { this.move.set(0, 0, 0); this.decision = this.age = 0; }
}
