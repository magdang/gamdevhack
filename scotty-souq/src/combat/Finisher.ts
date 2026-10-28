import type * as THREE from 'three';
import type { FxKit } from '../core/contracts';
import type { EventBus } from '../core/Events';
import { CONFIG } from '../core/config';

export class Finisher {
  private remaining = 0;
  get active(): boolean { return this.remaining > 0; }

  constructor(private events: EventBus, private fx: FxKit) {}

  trigger(position: THREE.Vector3, kills: number): void {
    this.remaining = CONFIG.finisher.duration;
    this.events.emit('finisher:start', { position, kills });
    this.events.emit('time:slowmo', { scale: CONFIG.finisher.scale, duration: CONFIG.finisher.duration, priority: CONFIG.finisher.priority });
    this.events.emit('camera:punch', { amount: 0.22, duration: 0.6 });
    this.events.emit('camera:shake', { intensity: 0.2, duration: 0.22 });
    this.fx.setSlowMo(1); this.fx.flash(0xffedc2, 0.25, 0.16);
    this.fx.petalBurst(position, 100, 1.5);
  }

  update(realDt: number): void {
    if (!this.active) return;
    this.remaining = Math.max(0, this.remaining - realDt);
    this.fx.setSlowMo(Math.min(1, this.remaining / 0.2));
    if (!this.active) { this.fx.setSlowMo(0); this.events.emit('finisher:end', {}); }
  }
  reset(): void {
    if (this.active) this.events.emit('finisher:end', {});
    this.remaining = 0; this.fx.setSlowMo(0);
  }
}
