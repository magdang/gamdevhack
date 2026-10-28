import type { EnemyKind, KitContext, SpawnGate, WorldKit } from '../core/contracts';
import { COMBAT, WAVES } from '../enemies/config';

export class WaveDirector {
  wave = 0;
  private pending: EnemyKind[] = [];
  private timer = 0;
  private running = false;
  private cleared = false;

  constructor(private ctx: KitContext, private world: WorldKit,
    private spawn: (kind: EnemyKind, gate: SpawnGate, offset: number) => void,
    private startBoss: () => void) {}

  start(fromWave: number): void {
    this.reset();
    this.running = true;
    this.begin(Math.max(1, Math.min(6, Math.floor(Number.isFinite(fromWave) ? fromWave : 1))));
  }

  private begin(wave: number): void {
    this.wave = wave;
    this.cleared = false;
    this.timer = 0;
    if (wave === 6) { this.running = false; this.startBoss(); return; }
    const table = WAVES.tables[wave - 1];
    this.pending = [];
    for (const [kind, count] of Object.entries(table)) {
      for (let i = 0; i < count; i++) this.pending.push(kind as EnemyKind);
    }
    // Seeded Fisher-Yates so neither gate selection nor composition repeats predictably.
    for (let i = this.pending.length - 1; i > 0; i--) {
      const j = this.ctx.rng.int(0, i);
      [this.pending[i], this.pending[j]] = [this.pending[j], this.pending[i]];
    }
    this.ctx.events.emit('wave:start', { wave, totalWaves: WAVES.tables.length });
  }

  update(dt: number, alive: number): void {
    if (!this.running) return;
    this.timer -= dt;
    if (this.cleared) {
      if (this.timer <= 0) this.begin(this.wave + 1);
      return;
    }
    if (this.pending.length === 0 && alive === 0) {
      this.cleared = true;
      this.timer = WAVES.breakTime;
      this.ctx.events.emit('wave:cleared', { wave: this.wave });
      return;
    }
    if (this.pending.length === 0 || alive >= WAVES.maxAlive || this.timer > 0) return;
    const gates = this.pickGates();
    if (gates.length === 0) return;
    const count = Math.min(WAVES.groupSize, this.pending.length, WAVES.maxAlive - alive);
    for (let i = 0; i < count; i++) {
      this.spawn(this.pending.pop()!, gates[i % gates.length],
        (Math.floor(i / gates.length) - 0.5) * COMBAT.spawnSpacing);
    }
    this.timer = WAVES.groupInterval;
  }

  pickGates(): SpawnGate[] {
    const available = [...this.world.arena.gates];
    const result: SpawnGate[] = [];
    const count = Math.min(available.length, this.ctx.rng.int(2, 3));
    for (let i = 0; i < count; i++) result.push(available.splice(this.ctx.rng.int(0, available.length - 1), 1)[0]);
    return result;
  }

  reset(): void {
    this.wave = 0;
    this.pending.length = 0;
    this.timer = 0;
    this.running = false;
    this.cleared = false;
  }
}
