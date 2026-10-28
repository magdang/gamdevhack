import { CONFIG } from '../core/config';
import type { EventBus } from '../core/Events';

export class Combo {
  count = 0;
  best = 0;
  score = 0;
  tier = 0;
  private remaining = 0;
  get multiplier(): number { return CONFIG.combo.multipliers[this.tier]; }
  get decay01(): number { return this.remaining / CONFIG.combo.decay; }
  get slashSpeed(): number { return 1 + this.tier * 0.16; }

  constructor(private events: EventBus) {}

  hit(killed: boolean): void {
    this.count++;
    this.best = Math.max(this.best, this.count);
    this.remaining = CONFIG.combo.decay;
    const previous = this.tier;
    this.tier = 0;
    for (const threshold of CONFIG.combo.thresholds) if (this.count >= threshold) this.tier++;
    const delta = (10 + (killed ? 100 : 0)) * this.multiplier;
    this.score += delta;
    this.events.emit('score:changed', { score: this.score, delta });
    this.events.emit('combo:changed', { combo: this.count, tier: this.tier, multiplier: this.multiplier });
    if (previous !== this.tier) this.events.emit('combo:tier', { tier: this.tier, multiplier: this.multiplier });
  }

  update(dt: number): void {
    if (!this.count) return;
    this.remaining = Math.max(0, this.remaining - dt);
    if (!this.remaining) this.lose();
  }

  lose(): void {
    if (this.count) this.events.emit('combo:lost', { combo: this.count });
    this.count = this.tier = this.remaining = 0;
    this.events.emit('combo:changed', { combo: 0, tier: 0, multiplier: 1 });
  }

  reset(): void { this.lose(); this.best = this.score = 0; this.events.emit('score:changed', { score: 0, delta: 0 }); }
}
