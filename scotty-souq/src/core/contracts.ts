/**
 * Cross-workstream contracts. Every kit (world, enemies, fx, ui, audio) is built against these
 * interfaces in parallel, and core wires them together. Changing a signature here is a contract
 * change: note it in your hand-off.
 *
 * Conventions
 * - 1 unit = 1 m, Y up, gameplay on the XZ plane, arena centre at the origin.
 * - Yaw/facing: radians, 0 = facing +Z, forward vector = (sin f, 0, cos f) (= Object3D.rotation.y).
 * - Vectors passed into calls or event payloads are only valid during the call; copy to keep them.
 */
import type * as THREE from 'three';
import type { AssetsApi } from './Assets';
import type { EventBus } from './Events';
import type { Rng } from './rng';

export type GameState =
  | 'boot'
  | 'title'
  | 'playing'
  | 'bossIntro'
  | 'bossFight'
  | 'finalCut'
  | 'victory'
  | 'gameOver';

export interface DebugFlags {
  /** ?wave=N — start at wave N (6 = boss). */
  wave: number | null;
  /** ?god=1 — player ignores damage. */
  god: boolean;
  /** ?seed=N — deterministic RNG. */
  seed: number | null;
  /** ?fps=1 — stats overlay. */
  fps: boolean;
  /** ?mute=1 */
  mute: boolean;
  /** ?autoplay=1 — bot plays (smoke tests). */
  autoplay: boolean;
  /** ?fake=1 uses core's isolated combat harness. */
  fake?: boolean;
}

export interface GameClock {
  /** Scaled seconds since the run started. */
  time: number;
  /** Scaled delta (slow-mo applied, 0 during hit-stop). Use for gameplay. */
  dt: number;
  /** Unscaled real delta. Use for UI, camera smoothing and cinematics. */
  realDt: number;
  /** Current time scale, 0..1. */
  timeScale: number;
}

/** Shared services handed to every kit factory. */
export interface KitContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  events: EventBus;
  assets: AssetsApi;
  rng: Rng;
  debug: DebugFlags;
  /** DOM overlay root (absolute, covers the canvas). UI kit owns its contents. */
  uiRoot: HTMLElement;
}

// ───────────────────────────────────────────────────────────── world (src/world)

export interface SpawnGate {
  id: number;
  /** Point just outside the walkable area where enemies appear. */
  position: THREE.Vector3;
  /** Unit vector pointing into the arena. */
  inward: THREE.Vector3;
}

export interface ArenaInfo {
  /** Walkable radius around the origin. */
  radius: number;
  /** Spawn gates on every side of the plaza (≥ 6). */
  gates: SpawnGate[];
  /** Where the boss bursts through the souq wall. */
  bossBreach: { position: THREE.Vector3; inward: THREE.Vector3 };
  /** Clamp `p` in place so a circle of radius `r` stays inside the walkable area. Returns `p`. */
  clamp(p: THREE.Vector3, r: number): THREE.Vector3;
}

export type WorldMood = 'title' | 'battle' | 'boss' | 'finalCut' | 'victory';

export interface WorldKit {
  readonly arena: ArenaInfo;
  update(clock: GameClock): void;
  /** Lighting/sky/lantern mood transitions. */
  setMood(mood: WorldMood): void;
  /** Boss entrance: blow a hole in the wall at arena.bossBreach (rubble, dust). */
  breachWall(): void;
  reset(): void;
}

// ───────────────────────────────────────────────────────────── player (core → enemies)

/** Read view of the player, implemented by core, consumed by enemies/boss. */
export interface PlayerView {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly facing: number;
  readonly radius: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly invulnerable: boolean;
  readonly dashing: boolean;
  /** Apply enemy damage. Returns false if ignored (i-frames, dash, god mode). */
  hurt(amount: number, from: THREE.Vector3): boolean;
}

// ───────────────────────────────────────────────────────────── enemies + boss (src/enemies, src/waves, src/boss)

export type EnemyKind = 'beaver' | 'tree' | 'bear' | 'collie' | 'wasp' | 'tiger';
export type DamageSource = 'slash' | 'dash' | 'finalCut';

export interface Hittable {
  readonly id: number;
  readonly kind: EnemyKind | 'boss';
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly alive: boolean;
}

export interface DamageInfo {
  amount: number;
  source: DamageSource;
  /** Unit direction of the blow (for knockback / split plane). */
  dir: THREE.Vector3;
}

export interface DamageResult {
  applied: boolean;
  killed: boolean;
  /** Damage actually dealt after modifiers (e.g. boss stagger x2). */
  damage: number;
}

export interface BossView extends Hittable {
  readonly hp: number;
  readonly maxHp: number;
  readonly phase: 1 | 2;
  readonly staggered: boolean;
  /** At or below the Final Cut HP threshold and stunned, waiting for the player's swipe. */
  readonly finalCutReady: boolean;
}

export interface EnemiesKit {
  /** Start the wave sequence at wave `fromWave` (1..5; 6 = boss). */
  start(fromWave: number): void;
  update(clock: GameClock, player: PlayerView): void;
  reset(): void;
  /** Current wave number (0 before start, 6 = boss). */
  readonly wave: number;
  readonly totalWaves: number;
  readonly boss: BossView | null;
  aliveCount(): number;
  nearest(p: THREE.Vector3, maxDist: number): Hittable | null;
  /** Alive hittables (enemies + boss) overlapping a circle sector. halfAngle in radians (π = full circle). */
  queryArc(center: THREE.Vector3, facing: number, radius: number, halfAngle: number, out: Hittable[]): Hittable[];
  /** Alive hittables within `radius` of segment a→b, sorted by distance along the segment. */
  querySegment(a: THREE.Vector3, b: THREE.Vector3, radius: number, out: Hittable[]): Hittable[];
  damage(target: Hittable, info: DamageInfo): DamageResult;
  /** Called by core at the Final Cut impact frame. Boss splits along `dir`; emits boss:defeated when done. */
  executeFinalCut(dir: THREE.Vector3): void;
  /** Freeze all AI and projectiles (cinematics, pause). */
  setFrozen(frozen: boolean): void;
}

// ───────────────────────────────────────────────────────────── fx (src/fx)

export interface TrailHandle {
  /** Add a ribbon sample: blade tip and blade base in world space. */
  push(tip: THREE.Vector3, base: THREE.Vector3): void;
  /** Stop sampling; the ribbon fades out on its own. */
  end(): void;
}

export type TrailStyle = 'slash' | 'dash' | 'finalCut';
export type DamageNumberKind = 'normal' | 'big' | 'player' | 'combo';

export interface FxKit {
  update(clock: GameClock): void;
  /** Render the frame (fx owns the post-processing composer). */
  render(): void;
  resize(width: number, height: number, pixelRatio: number): void;
  reset(): void;
  petalBurst(pos: THREE.Vector3, count: number, power?: number): void;
  slashArc(origin: THREE.Vector3, facing: number, radius: number, halfAngle: number, side: 1 | -1): void;
  beginTrail(style: TrailStyle): TrailHandle;
  damageNumber(pos: THREE.Vector3, value: number | string, kind: DamageNumberKind): void;
  shockwave(pos: THREE.Vector3, radius: number, color?: number): void;
  debris(pos: THREE.Vector3, dir: THREE.Vector3, count: number): void;
  /** Split `obj` in two along the plane through its centre with normal `cutNormal`; halves fly apart and
   *  fade. The caller hides/removes the original. */
  splitObject(obj: THREE.Object3D, cutNormal: THREE.Vector3, power?: number): void;
  flash(color: number, intensity: number, duration: number): void;
  setLetterbox(amount01: number): void;
  setDesaturate(amount01: number): void;
  /** Slow-mo look (chromatic aberration / tint / radial blur), 0..1. */
  setSlowMo(amount01: number): void;
}

// ───────────────────────────────────────────────────────────── ui + audio (src/ui, src/audio)

export interface HudSnapshot {
  state: GameState;
  paused: boolean;
  hp: number;
  maxHp: number;
  combo: number;
  bestCombo: number;
  /** 0..3 for x1/x2/x3/x5. */
  comboTier: number;
  comboMultiplier: number;
  /** 1 = combo fresh, 0 = about to drop. */
  comboDecay01: number;
  score: number;
  /** 1 = dash ready. */
  dashReady01: number;
  wave: number;
  totalWaves: number;
  enemiesAlive: number;
  boss: { hp: number; maxHp: number; phase: number } | null;
  finalCutReady: boolean;
  muted: boolean;
}

export interface UiKit {
  update(clock: GameClock, hud: HudSnapshot): void;
  reset(): void;
}

export interface AudioKit {
  /** Call from a user gesture (first pointerdown/keydown). */
  unlock(): void;
  update(clock: GameClock): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Optional run reset, preserves the user's mute preference and unlocked audio context. */
  reset?(): void;
}

export interface RunSummary {
  score: number;
  bestCombo: number;
  wavesCleared: number;
  timeSeconds: number;
}
