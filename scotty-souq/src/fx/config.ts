/** All FX budgets and art direction live here. Colours are linear HDR in shaders. */
export const FX = {
  maxDpr: 2,
  bloom: { threshold: 1.18, strength: 0.48, radius: 0.65 },
  quality: { slowFrame: 1 / 43, sustainedSeconds: 4, warmupSeconds: 3 },
  petals: {
    capacity: 1500,
    limits: [1500, 900, 550],
    ambient: [180, 110, 65],
    radius: 15,
    gravity: 4.2,
    drag: 1.25,
    hit: 12,
    kill: 42,
    finisher: 360,
    finalCut: 1100,
    confetti: 900,
  },
  trails: {
    capacity: 12,
    samples: 40,
    subdivisions: 3,
    slash: { life: 0.19, width: 1.05, glow: 3.8 },
    dash: { life: 0.65, width: 1.5, glow: 4.8 },
    finalCut: { life: 1.5, width: 2.8, glow: 7 },
  },
  arcs: 16,
  damage: { capacity: 48, glyphs: 8, life: 0.95 },
  impacts: { debris: 160, sparks: 240, rings: 12 },
  splits: { capacity: 8, life: 1.5, dramaticLife: 3.6 },
} as const;

export function initialQuality(): number {
  const device = navigator as Navigator & { deviceMemory?: number };
  return (device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 4)
    || (device.deviceMemory !== undefined && device.deviceMemory <= 4)
    || window.matchMedia('(pointer: coarse)').matches ? 1 : 0;
}
