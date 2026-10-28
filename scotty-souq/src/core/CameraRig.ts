import * as THREE from 'three';
import type { EventBus } from './Events';
import type { GameClock, GameState } from './contracts';
import { CONFIG } from './config';
import { damp } from './math';

/** Follow and effects use real time so hit-stop leaves camera feedback alive. */
export class CameraRig {
  private focus = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private cinematicTarget = new THREE.Vector3();
  private cinematicEye = new THREE.Vector3();
  private cinematic = false;
  private shake = 0;
  private shakeLeft = 0;
  private shakeDuration = 1;
  private punch = 0;
  private punchLeft = 0;
  private punchDuration = 1;
  private intro = 0;
  private phase = 0;
  private off: (() => void)[];

  constructor(readonly camera: THREE.PerspectiveCamera, events: EventBus) {
    this.off = [
      events.on('camera:shake', ({ intensity, duration }) => {
        this.shake = Math.max(this.shake, intensity);
        this.shakeLeft = this.shakeDuration = Math.max(0.01, duration);
      }),
      events.on('camera:punch', ({ amount, duration }) => {
        this.punch = Math.max(this.punch, amount);
        this.punchLeft = this.punchDuration = Math.max(0.01, duration);
      }),
    ];
  }

  orbit(center: THREE.Vector3, yaw: number, distance: number, height: number, lookY = 1.5): void {
    this.cinematic = true;
    this.cinematicTarget.copy(center); this.cinematicTarget.y += lookY;
    this.cinematicEye.set(center.x + Math.sin(yaw) * distance, height, center.z + Math.cos(yaw) * distance);
  }

  endCinematic(): void { this.cinematic = false; }

  update(clock: GameClock, position: THREE.Vector3, velocity: THREE.Vector3, state: GameState): void {
    const dt = clock.realDt;
    this.phase += dt;
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    this.punchLeft = Math.max(0, this.punchLeft - dt);
    if (!this.shakeLeft) this.shake = 0;
    if (!this.punchLeft) this.punch = 0;
    this.intro += ((state === 'bossIntro' ? 1 : 0) - this.intro) * damp(3, dt);
    this.desired.copy(position).addScaledVector(velocity, CONFIG.camera.lead / CONFIG.player.speed);
    this.desired.y = 0.5;
    if (state === 'title') this.desired.set(0, 0.5, 0);
    if (this.cinematic) this.desired.copy(this.cinematicTarget);
    this.focus.lerp(this.desired, damp(this.cinematic ? 10 : CONFIG.camera.follow, dt));
    const portrait = Math.max(0, 1 - this.camera.aspect);
    const distance = CONFIG.camera.distance * (1 + portrait * 0.65 + this.intro * 0.38);
    const punchEnvelope = this.punchLeft ? Math.sin(Math.PI * this.punchLeft / this.punchDuration) : 0;
    const zoom = 1 - Math.min(0.3, this.punch * punchEnvelope);
    this.eye.copy(this.focus);
    this.eye.y += Math.sin(CONFIG.camera.pitch) * distance * zoom;
    this.eye.z += Math.cos(CONFIG.camera.pitch) * distance * zoom;
    if (this.cinematic) this.eye.copy(this.cinematicEye);
    this.camera.position.lerp(this.eye, damp(this.cinematic ? 12 : 9, dt));
    const shake = this.shake * this.shakeLeft / this.shakeDuration;
    this.camera.position.x += Math.sin(this.phase * 91) * shake;
    this.camera.position.y += Math.sin(this.phase * 117 + 1) * shake * 0.6;
    this.camera.lookAt(this.focus);
    const fov = CONFIG.camera.fov + portrait * 12;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.updateMatrixWorld();
  }

  reset(position: THREE.Vector3): void {
    this.cinematic = false;
    this.shake = this.punch = this.shakeLeft = this.punchLeft = this.intro = 0;
    this.focus.copy(position); this.focus.y = 0.5;
    this.camera.position.set(position.x, 18, position.z + 12);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
  dispose(): void { for (const off of this.off) off(); }
}
