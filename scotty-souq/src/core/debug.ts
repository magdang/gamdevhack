import type { DebugFlags } from './contracts';

export function parseDebugFlags(search = window.location.search): DebugFlags {
  const q = new URLSearchParams(search);
  const num = (k: string): number | null => {
    const v = q.get(k);
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const flag = (k: string) => q.get(k) === '1' || q.get(k) === 'true';
  return {
    wave: num('wave'),
    god: flag('god'),
    seed: num('seed'),
    fps: flag('fps'),
    mute: flag('mute'),
    autoplay: flag('autoplay'),
  };
}
