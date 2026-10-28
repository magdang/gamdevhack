import type { AudioKit, KitContext } from '../core/contracts';
import { AudioEngine } from './Audio';

export function createAudio(ctx: KitContext): AudioKit {
  return new AudioEngine(ctx);
}
