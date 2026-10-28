// STUB — owned by the FX workstream, which replaces this file. Keep the factory signature.
import type { FxKit, KitContext, TrailHandle } from '../core/contracts';

const NO_TRAIL: TrailHandle = { push() {}, end() {} };

export function createFx(ctx: KitContext): FxKit {
  return {
    update() {},
    render: () => ctx.renderer.render(ctx.scene, ctx.camera),
    resize() {},
    reset() {},
    petalBurst() {},
    slashArc() {},
    beginTrail: () => NO_TRAIL,
    damageNumber() {},
    shockwave() {},
    debris() {},
    splitObject() {},
    flash() {},
    setLetterbox() {},
    setDesaturate() {},
    setSlowMo() {},
  };
}
