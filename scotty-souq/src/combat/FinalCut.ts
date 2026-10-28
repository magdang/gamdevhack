import * as THREE from 'three';
import type { ArenaInfo, EnemiesKit, FxKit, TrailHandle } from '../core/contracts';
import type { EventBus } from '../core/Events';
import type { CameraRig } from '../core/CameraRig';
import { CONFIG } from '../core/config';
import { smoothstep } from '../core/math';
import type { Player } from '../player/Player';

/** The whole sequence runs on real time, independent of its own extreme slow motion. */
export class FinalCut {
  active = false;
  ready = false;
  private elapsed = 0;
  private impacted = false;
  private center = new THREE.Vector3();
  private initial = new THREE.Vector3();
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private tip = new THREE.Vector3();
  private base = new THREE.Vector3();
  private trail: TrailHandle | null = null;
  private off: () => void;

  constructor(private player: Player, private enemies: EnemiesKit, private arena: ArenaInfo,
    private fx: FxKit, private camera: CameraRig, private events: EventBus, private onComplete: () => void) {
    this.off = events.on('finalcut:ready', () => { this.ready = true; });
  }

  get available(): boolean { return !this.active && !!this.enemies.boss?.alive && (this.ready || this.enemies.boss.finalCutReady); }

  start(direction: THREE.Vector3): boolean {
    if (!this.available) return false;
    this.active = true; this.ready = false; this.elapsed = 0; this.impacted = false;
    this.center.copy(this.enemies.boss!.position);
    this.direction.copy(direction).setY(0);
    if (this.direction.lengthSq() < 0.01) this.direction.subVectors(this.center, this.player.position);
    if (this.direction.lengthSq() < 0.01) this.direction.set(1, 0, 0);
    this.direction.normalize();
    this.initial.copy(this.player.position);
    this.from.copy(this.center).addScaledVector(this.direction, -7.5);
    this.to.copy(this.center).addScaledVector(this.direction, 8.5);
    this.arena.clamp(this.from, this.player.radius); this.arena.clamp(this.to, this.player.radius);
    this.player.dashing = false; this.player.cinematic = true; this.player.velocity.set(0, 0, 0);
    this.player.face(this.direction, true);
    this.enemies.setFrozen(true);
    this.fx.setLetterbox(1); this.fx.setDesaturate(0.7); this.fx.setSlowMo(1);
    this.events.emit('time:slowmo', { scale: CONFIG.finalCut.scale, duration: CONFIG.finalCut.recoverAt, priority: CONFIG.finalCut.priority });
    this.trail = this.fx.beginTrail('finalCut');
    this.events.emit('finalcut:start', { from: this.from, to: this.to });
    return true;
  }

  update(realDt: number): void {
    if (!this.active) return;
    this.elapsed += realDt;
    const t = this.elapsed;
    const run = smoothstep((t - CONFIG.finalCut.runAt) / 0.9);
    if (t < CONFIG.finalCut.runAt) this.player.position.lerpVectors(this.initial, this.from, smoothstep(t / CONFIG.finalCut.runAt));
    else if (t < CONFIG.finalCut.impactAt) this.player.position.lerpVectors(this.from, this.center, smoothstep((t - CONFIG.finalCut.runAt) / (CONFIG.finalCut.impactAt - CONFIG.finalCut.runAt)));
    else this.player.position.lerpVectors(this.center, this.to, smoothstep((t - CONFIG.finalCut.impactAt) / 0.45));
    const yaw = Math.atan2(this.direction.x, this.direction.z) + Math.PI / 2 - 0.65 + t * 0.32;
    const recovery = smoothstep((t - CONFIG.finalCut.recoverAt) / (CONFIG.finalCut.duration - CONFIG.finalCut.recoverAt));
    this.camera.orbit(this.center, yaw, 13 + recovery * 6 - Math.sin(run * Math.PI) * 3, 8 + recovery * 8, 1.1);
    if (t >= CONFIG.finalCut.runAt && t < CONFIG.finalCut.recoverAt) {
      this.player.bladeSamples(this.tip, this.base, true); this.trail?.push(this.tip, this.base);
    }
    if (!this.impacted && t >= CONFIG.finalCut.impactAt) {
      this.impacted = true;
      this.enemies.executeFinalCut(this.direction);
      this.fx.flash(0xffffff, 1, 0.4);
      this.fx.shockwave(this.center, 14, 0xfff4bd);
      this.fx.petalBurst(this.center, 650, 3);
      this.events.emit('camera:shake', { intensity: 0.85, duration: 0.55 });
      this.events.emit('camera:punch', { amount: 0.28, duration: 0.7 });
      this.events.emit('finalcut:impact', { position: this.center });
    }
    if (t >= CONFIG.finalCut.recoverAt) {
      this.trail?.end(); this.trail = null;
      this.fx.setLetterbox(1 - recovery); this.fx.setDesaturate(0.7 * (1 - recovery)); this.fx.setSlowMo(1 - recovery);
    }
    if (t < CONFIG.finalCut.duration) return;
    this.active = false; this.player.cinematic = false; this.enemies.setFrozen(false);
    this.camera.endCinematic(); this.fx.setLetterbox(0); this.fx.setDesaturate(0); this.fx.setSlowMo(0);
    this.onComplete();
  }

  reset(): void {
    this.active = this.ready = false; this.elapsed = 0; this.trail?.end(); this.trail = null;
    this.player.cinematic = false; this.camera.endCinematic();
    this.fx.setLetterbox(0); this.fx.setDesaturate(0); this.fx.setSlowMo(0);
  }
  dispose(): void { this.reset(); this.off(); }
}
