export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
export const smoothstep = (n: number): number => { const t = clamp01(n); return t * t * (3 - 2 * t); };
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
export const angleDelta = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));
