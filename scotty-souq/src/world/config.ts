import type { WorldMood } from '../core/contracts';

/** Metres, seconds and linear light intensities. World owns all of these tunables. */
export const WORLD = {
  radius: 18,
  gateCount: 8,
  gateOffset: Math.PI / 8,
  gateRadius: 19.5,
  facadeRadius: 21.5,
  shopWidth: 4.72,
  shopDepth: 5.8,
  shopAngle: 0.214,
  floorRadius: 130,
  floorTextureRepeat: 54,
  moodSeconds: 1.5,
  skyRadius: 220,
  shadowSize: 1024,
  shadowExtent: 30,
  lanternLightCount: 3,
  lanternLightPower: 18,
  lanternSway: 0.055,
  awningFlutter: 0.035,
  palmSway: 0.018,
  breach: {
    width: 4.65,
    height: 4.5,
    columns: 7,
    rows: 6,
    dustCount: 22,
    dustSeconds: 2.6,
    rubbleSeconds: 7,
    gravity: 12,
  },
  demo: { pitch: 55 * Math.PI / 180, height: 16, overviewHeight: 38, fov: 60 },
} as const;

export interface MoodPalette {
  zenith: number;
  middle: number;
  horizon: number;
  fog: number;
  sun: number;
  sunPower: number;
  ambient: number;
  ground: number;
  ambientPower: number;
  lantern: number;
  fogDensity: number;
  focus: number;
}

export const MOODS: Record<WorldMood, MoodPalette> = {
  title: { zenith: 0x7972af, middle: 0xe8a3b2, horizon: 0xffd398, fog: 0xe8bba0,
    sun: 0xffd499, sunPower: 2.6, ambient: 0xffe3c4, ground: 0x72617f,
    ambientPower: 1.65, lantern: 1, fogDensity: 0.009, focus: 0 },
  battle: { zenith: 0x6b669b, middle: 0xdb8d9c, horizon: 0xffc17e, fog: 0xd7a88f,
    sun: 0xffc786, sunPower: 3.0, ambient: 0xffdbb5, ground: 0x62516e,
    ambientPower: 1.35, lantern: 1.2, fogDensity: 0.010, focus: 0 },
  boss: { zenith: 0x383754, middle: 0x9c525c, horizon: 0xf28a51, fog: 0xa67569,
    sun: 0xff854c, sunPower: 1.4, ambient: 0xd9a8a1, ground: 0x3e344f,
    ambientPower: 0.85, lantern: 1.8, fogDensity: 0.013, focus: 0 },
  finalCut: { zenith: 0x1c2039, middle: 0x54445f, horizon: 0xa4766e, fog: 0x655568,
    sun: 0xc6b4e1, sunPower: 0.30, ambient: 0xaaa6c7, ground: 0x29283b,
    ambientPower: 0.42, lantern: 0.65, fogDensity: 0.018, focus: 700 },
  victory: { zenith: 0x9b8dbe, middle: 0xf0b4bc, horizon: 0xffe1a5, fog: 0xf0c6a1,
    sun: 0xffdfaa, sunPower: 3.2, ambient: 0xffe8c8, ground: 0x8a7484,
    ambientPower: 1.9, lantern: 1.1, fogDensity: 0.008, focus: 0 },
};
