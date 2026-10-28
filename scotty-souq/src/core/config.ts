/** Core owns these tunables. Kits keep their own configuration in their own folders. */
export const CONFIG = {
  player: { maxHp: 5, speed: 7, acceleration: 15, radius: 0.6, hurtIFrames: 1, knockback: 10 },
  slash: { interval: 0.32, acquireRadius: 2.6, radius: 2.8, halfAngle: Math.PI * 150 / 360, damage: 1, duration: 0.2 },
  dash: { distance: 9, duration: 0.16, cooldown: 0.8, radius: 1.5, damage: 3, stagger: 0.012 },
  combo: { thresholds: [10, 25, 50] as readonly number[], multipliers: [1, 2, 3, 5] as readonly number[], decay: 2.5 },
  time: { maxHitstop: 0.12, easeBack: 0.24, maxFrame: 0.05 },
  finisher: { scale: 0.12, duration: 0.55, priority: 40 },
  finalCut: { scale: 0.05, duration: 2.7, impactAt: 1.25, runAt: 0.65, recoverAt: 1.9, priority: 100 },
  death: { duration: 1.2, scale: 0.12 },
  input: { joystickRadius: 70, swipePixels: 50, swipeMs: 250 },
  camera: { pitch: 55 * Math.PI / 180, distance: 21, fov: 48, lead: 1.8, follow: 6 },
} as const;
