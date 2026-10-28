import type { EnemyKind } from '../core/contracts';

export interface EnemyTuning {
  hp: number;
  radius: number;
  speed: number;
  range: number;
  windup: number;
  recovery: number;
  cooldown: number;
  strikeTime: number;
  attackRadius: number;
  halfAngle: number;
  length: number;
  width: number;
  hover: number;
  leapHeight: number;
}

const base: EnemyTuning = {
  hp: 3, radius: 0.65, speed: 2.5, range: 2.5, windup: 0.8, recovery: 0.8,
  cooldown: 1.1, strikeTime: 0.24, attackRadius: 1.65, halfAngle: Math.PI,
  length: 6, width: 1.6, hover: 0, leapHeight: 0,
};

export const ENEMY_CONFIG: Record<EnemyKind, EnemyTuning> = {
  beaver: { ...base },
  tree: { ...base, hp: 8, radius: 0.9, speed: 1.55, range: 3.5, windup: 1,
    recovery: 1.1, attackRadius: 3.5, halfAngle: Math.PI * 100 / 180 },
  bear: { ...base, hp: 6, radius: 0.85, speed: 2.25, range: 6, windup: 0.9,
    strikeTime: 0.38, recovery: 1.15, length: 7, width: 1.85 },
  collie: { ...base, hp: 2, radius: 0.5, speed: 4.1, range: 1.9, windup: 0.5,
    recovery: 0.55, cooldown: 0.8, attackRadius: 2.15, halfAngle: Math.PI / 4 },
  wasp: { ...base, radius: 0.55, speed: 2.8, range: 10, windup: 0.85,
    recovery: 0.75, cooldown: 1.65, length: 13, width: 0.65, hover: 1.15 },
  tiger: { ...base, hp: 5, radius: 0.7, speed: 3.2, range: 7, windup: 0.8,
    strikeTime: 0.4, recovery: 1, attackRadius: 1.9, leapHeight: 3 },
};

export const COMBAT = {
  damage: 1,
  attackTokens: 3,
  entryDistance: 4,
  spawnSpacing: 1.4,
  separationPadding: 0.35,
  separationStrength: 3.8,
  hurtDuration: 0.22,
  flashDuration: 0.16,
  knockback: 6,
  knockbackDecay: 12,
  deathDuration: 0.48,
  projectileSpeed: 13,
  projectileRadius: 0.22,
  projectileHeight: 0.8,
  telegraphPulseDuration: 0.22,
  telegraphCapacity: 24,
};

export const WAVES = {
  breakTime: 2.5,
  maxAlive: 18,
  groupSize: 5,
  groupInterval: 2.1,
  tables: [
    { beaver: 8 },
    { beaver: 8, collie: 5 },
    { beaver: 7, collie: 5, tree: 3, wasp: 3 },
    { beaver: 6, collie: 6, tree: 3, wasp: 3, bear: 6 },
    { beaver: 6, collie: 6, tree: 4, wasp: 4, bear: 5, tiger: 5 },
  ] as ReadonlyArray<Partial<Record<EnemyKind, number>>>,
};

export const BOSS = {
  hp: 120,
  radius: 2.1,
  height: 4.5,
  introDuration: 2.5,
  entryDistance: 7,
  phaseThreshold: 0.5,
  finalCutThreshold: 0.08,
  finalCutDuration: 1.2,
  moveSpeed: 1.6,
  engageRange: 7,
  windup: { slam: 1, sweep: 0.95, charge: 1, summon: 0.85 },
  phaseTwoSpeed: 1.25,
  slamRadius: 3.2,
  slamReach: 6,
  sweepRadius: 7,
  sweepHalfAngle: Math.PI * 0.66,
  chargeLength: 15,
  chargeWidth: 4.3,
  chargeDuration: 0.65,
  strikeDuration: 0.3,
  recovery: 1.1,
  cooldown: 0.7,
  staggerDuration: 1.5,
  staggerMultiplier: 2,
  summonMin: 3,
  summonMax: 5,
  splitPower: 15,
  finalPetals: 180,
};
