// STUB — owned by the UI/Audio workstream, which replaces this file. Keep the factory signature.
import type { AudioKit, KitContext } from '../core/contracts';

export function createAudio(ctx: KitContext): AudioKit {
  let muted = ctx.debug.mute;
  return {
    unlock() {},
    update() {},
    setMuted(m) {
      muted = m;
    },
    get muted() {
      return muted;
    },
  };
}
