import type { GameClock } from './contracts';
import type { EventBus } from './Events';
import { CONFIG } from './config';
import { damp } from './math';

interface SlowMotion { scale: number; remaining: number; priority: number }

/** Real seconds drive effects; scaled seconds drive simulation. Requests use a bounded pool. */
export class Time implements GameClock {
  time = 0;
  dt = 0;
  realDt = 0;
  timeScale = 1;
  private last = 0;
  private hitstop = 0;
  private scale = 1;
  private requests: SlowMotion[] = Array.from({ length: 8 }, () => ({ scale: 1, remaining: 0, priority: -1 }));
  private off: (() => void)[];

  constructor(events: EventBus) {
    this.off = [
      events.on('time:hitstop', ({ duration }) => {
        this.hitstop = Math.min(CONFIG.time.maxHitstop, Math.max(this.hitstop, duration));
      }),
      events.on('time:slowmo', (request) => this.slowmo(request.scale, request.duration, request.priority)),
    ];
  }

  slowmo(scale: number, duration: number, priority: number): void {
    if (!Number.isFinite(scale + duration + priority) || duration <= 0) return;
    let slot = this.requests.find((r) => r.remaining <= 0 || r.priority === priority);
    if (!slot) {
      slot = this.requests.reduce((a, b) => a.priority < b.priority ? a : b);
      if (slot.priority > priority) return;
    }
    slot.scale = Math.max(0, Math.min(1, scale));
    slot.remaining = Math.max(slot.priority === priority ? slot.remaining : 0, duration);
    slot.priority = priority;
  }

  tick(now: number, paused = false): void {
    this.realDt = this.last ? Math.max(0, Math.min((now - this.last) / 1000, 0.1)) : 0;
    this.last = now;
    if (paused) { this.dt = 0; this.timeScale = 0; return; }
    let desired = 1;
    let priority = -Infinity;
    for (const r of this.requests) {
      if (r.remaining <= 0) continue;
      if (r.priority >= priority) { priority = r.priority; desired = r.scale; }
      r.remaining -= this.realDt;
    }
    // Enter slow motion immediately. The release is smooth and cannot overshoot.
    this.scale = desired < this.scale ? desired : this.scale + (desired - this.scale) * damp(5 / CONFIG.time.easeBack, this.realDt);
    if (this.scale > 0.999) this.scale = 1;
    const stopped = this.hitstop > 0;
    this.hitstop = Math.max(0, this.hitstop - this.realDt);
    this.timeScale = stopped ? 0 : this.scale;
    this.dt = Math.min(this.realDt, CONFIG.time.maxFrame) * this.timeScale;
    this.time += this.dt;
  }

  reset(): void {
    this.time = this.dt = this.realDt = this.hitstop = this.last = 0;
    this.scale = this.timeScale = 1;
    for (const r of this.requests) r.remaining = 0;
  }

  dispose(): void { for (const off of this.off) off(); }
}
