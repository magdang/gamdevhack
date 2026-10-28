import type * as THREE from 'three';
import type { DamageSource, EnemyKind, GameState, RunSummary } from './contracts';

type V3 = THREE.Vector3;
type Empty = Record<string, never>;

/**
 * Typed game events. Append-only: add new events at the end of your section; never change an existing
 * payload without noting it in your hand-off. Vector payloads are only valid during dispatch.
 */
export interface GameEvents {
  // ── game flow (core)
  'game:state': { state: GameState; prev: GameState };
  'game:paused': { paused: boolean };
  'game:over': RunSummary;
  'game:victory': RunSummary;

  // ── ui intents (ui → core)
  'ui:start': Empty;
  'ui:restart': Empty;
  'ui:pause': Empty;
  'ui:resume': Empty;
  'ui:toggleMute': Empty;
  /** Title "skip to the boss": no intro, start straight at the Dean Trick fight. */
  'ui:startBoss': Empty;

  // ── player + combat (core)
  'player:hurt': { hp: number; maxHp: number; position: V3; from: V3 };
  'player:died': { position: V3 };
  'player:slash': { position: V3; facing: number; side: 1 | -1; radius: number; halfAngle: number; hits: number };
  'dash:start': { from: V3; to: V3 };
  'dash:end': { from: V3; to: V3; hits: number; kills: number };
  'finisher:start': { position: V3; kills: number };
  'finisher:end': Empty;
  'combo:changed': { combo: number; tier: number; multiplier: number };
  'combo:tier': { tier: number; multiplier: number };
  'combo:lost': { combo: number };
  'score:changed': { score: number; delta: number };

  // ── enemies (enemies kit)
  'enemy:spawned': { id: number; kind: EnemyKind; position: V3 };
  'enemy:telegraph': { id: number; kind: EnemyKind; position: V3; duration: number };
  'enemy:strike': { id: number; kind: EnemyKind; position: V3 };
  'enemy:hit': { id: number; kind: EnemyKind | 'boss'; position: V3; damage: number; source: DamageSource; killed: boolean };
  'enemy:killed': { id: number; kind: EnemyKind; position: V3; source: DamageSource };
  'projectile:fired': { position: V3; dir: V3 };

  // ── waves + boss (enemies kit)
  'wave:start': { wave: number; totalWaves: number };
  'wave:cleared': { wave: number };
  'boss:intro': { position: V3 };
  'boss:spawned': { hp: number; maxHp: number };
  'boss:attack': { kind: 'slam' | 'sweep' | 'charge' | 'summon'; position: V3 };
  'boss:slam': { position: V3; radius: number };
  'boss:hit': { hp: number; maxHp: number; damage: number; staggered: boolean };
  'boss:staggered': { duration: number };
  'boss:phase': { phase: number };
  'finalcut:ready': { position: V3 };
  'finalcut:start': { from: V3; to: V3 };
  'finalcut:impact': { position: V3 };
  'boss:defeated': { position: V3 };

  // ── requests any kit may emit (core handles)
  'camera:shake': { intensity: number; duration: number };
  'camera:punch': { amount: number; duration: number };
  'time:hitstop': { duration: number };
  'time:slowmo': { scale: number; duration: number; priority: number };
}

export type EventName = keyof GameEvents;
type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<EventName, Set<Handler<EventName>>>();

  on<K extends EventName>(type: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<EventName>);
    return () => set.delete(fn as Handler<EventName>);
  }

  emit<K extends EventName>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
