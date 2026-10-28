// STUB — owned by the Enemies/Waves/Boss workstream, which replaces this file. Keep the factory signature.
import type { EnemiesKit, FxKit, KitContext, WorldKit } from '../core/contracts';

export interface EnemiesDeps {
  world: WorldKit;
  fx: FxKit;
}

export function createEnemies(_ctx: KitContext, _deps: EnemiesDeps): EnemiesKit {
  return {
    wave: 0,
    totalWaves: 5,
    boss: null,
    start() {},
    update() {},
    reset() {},
    aliveCount: () => 0,
    nearest: () => null,
    queryArc: (_c, _f, _r, _h, out) => ((out.length = 0), out),
    querySegment: (_a, _b, _r, out) => ((out.length = 0), out),
    damage: () => ({ applied: false, killed: false, damage: 0 }),
    executeFinalCut() {},
    setFrozen() {},
  };
}
