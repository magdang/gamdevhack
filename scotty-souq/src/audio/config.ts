import type { AudioKey } from '../core/manifest';

export const AUDIO_CONFIG = {
  muteKey: 'scotty-souq.muted',
  masterVolume: 0.78,
  musicVolume: 0.42,
  titleVolume: 0.16,
  pauseVolume: 0.11,
  ambienceVolume: 0.075,
  finalCutVolume: 0.085,
  bossRate: 1.045,
  bossBassDb: 4,
  minRate: 0.6,
  crossfadeSeconds: 0.8,
  smoothing: 0.12,
  fadeSeconds: 0.8,
  pitchVariation: 0.065,
  volumeVariation: 0.12,
  pendingSoundMaxAgeMs: 350,
  fetchTimeoutMs: 15_000,
} as const;

export const SOUNDS = {
  slash: { volume: 0.42, voices: 3, gap: 0.045 },
  hit: { volume: 0.45, voices: 5, gap: 0.025 },
  enemy_die: { volume: 0.42, voices: 4, gap: 0.04 },
  dash: { volume: 0.64, voices: 2, gap: 0.08 },
  finisher: { volume: 0.78, voices: 1, gap: 0.2 },
  player_hurt: { volume: 0.7, voices: 2, gap: 0.1 },
  wave_start: { volume: 0.68, voices: 1, gap: 0.3 },
  boss_roar: { volume: 0.8, voices: 1, gap: 0.4 },
  boss_slam: { volume: 0.75, voices: 2, gap: 0.12 },
  final_cut: { volume: 0.88, voices: 1, gap: 0.4 },
  combo_tier: { volume: 0.65, voices: 2, gap: 0.15 },
  victory: { volume: 0.8, voices: 1, gap: 0.5 },
  game_over: { volume: 0.72, voices: 1, gap: 0.5 },
} satisfies Partial<Record<AudioKey, { volume: number; voices: number; gap: number }>>;

export type SoundKey = keyof typeof SOUNDS;
