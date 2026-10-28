import * as THREE from 'three';
import { createAudio } from '../audio';
import { createEnemies } from '../enemies';
import { createFx } from '../fx';
import { createUi } from '../ui';
import { createWorld } from '../world';
import { Player } from '../player/Player';
import { AutoSlash } from '../combat/AutoSlash';
import { Combo } from '../combat/Combo';
import { Damage } from '../combat/Damage';
import { Dash } from '../combat/Dash';
import { Finisher } from '../combat/Finisher';
import { FinalCut } from '../combat/FinalCut';
import { Assets } from './Assets';
import { CameraRig } from './CameraRig';
import type { AudioKit, EnemiesKit, FxKit, GameState, HudSnapshot, KitContext, RunSummary, UiKit, WorldKit } from './contracts';
import { CONFIG } from './config';
import { parseDebugFlags } from './debug';
import { EventBus } from './Events';
import { Input } from './Input';
import { Rng } from './rng';
import { Time } from './Time';
import { Autoplay } from './testing/Autoplay';
import { CoreOverlay } from './testing/CoreOverlay';
import { createFakeEnemies } from './testing/FakeEnemies';

/** Wave number the enemies kit treats as the Dean Trick boss fight. */
const BOSS_WAVE = 6;

export interface DebugGame {
  readonly state: GameState;
  readonly paused: boolean;
  readonly wave: number;
  readonly player: { readonly hp: number; readonly position: THREE.Vector3 };
  readonly enemies: number;
  readonly boss: { hp: number; maxHp: number; phase: number } | null;
  readonly combo: number;
  readonly score: number;
  readonly time: number;
  readonly finalCutReady: boolean;
  readonly counters: { hits: number; kills: number; dashes: number; finishers: number; finalCuts: number; restarts: number };
  readonly states: GameState[];
  readonly renderer: { geometries: number; textures: number; drawCalls: number };
  readonly events: EventBus;
  start(): void;
  restart(): void;
  pause(): void;
  resume(): void;
  dash(x?: number, z?: number): void;
}
declare global { interface Window { __game?: DebugGame } }

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 180);
  readonly events = new EventBus();
  readonly time = new Time(this.events);
  private debug = parseDebugFlags();
  private world: WorldKit;
  private fx: FxKit;
  private enemies: EnemiesKit;
  private ui: UiKit;
  private audio: AudioKit;
  private player: Player;
  private rig: CameraRig;
  private input: Input;
  private combo = new Combo(this.events);
  private damage: Damage;
  private slash: AutoSlash;
  private dash: Dash;
  private finisher: Finisher;
  private finalCut: FinalCut;
  private bot: Autoplay;
  private fallbackUi: CoreOverlay;
  private abort = new AbortController();
  private observer: ResizeObserver;
  private off: (() => void)[] = [];
  private state: GameState = 'boot';
  private paused = false;
  private unlocked = false;
  private deathLeft = 0;
  private runSeconds = 0;
  private titleSeconds = 0;
  private wavesCleared = 0;
  private pendingVictory = false;
  private neutral = new THREE.Vector3();
  private intent = new THREE.Vector3();
  private states: GameState[] = [];
  private counters = { hits: 0, kills: 0, dashes: 0, finishers: 0, finalCuts: 0, restarts: 0 };
  private renderStats = { geometries: 0, textures: 0, drawCalls: 0 };
  private fpsRoot: HTMLDivElement | null = null;
  private fpsTime = 0;
  private fpsFrames = 0;
  private bossHud = { hp: 0, maxHp: 0, phase: 1 };
  private hud: HudSnapshot = {
    state: 'boot', paused: false, hp: 5, maxHp: 5, combo: 0, bestCombo: 0, comboTier: 0, comboMultiplier: 1,
    comboDecay01: 0, score: 0, dashReady01: 1, wave: 0, totalWaves: 5, enemiesAlive: 0,
    boss: null, finalCutReady: false, muted: false,
  };

  /** True while beforePlay (e.g. the portal intro) runs between "tap to start" and wave 1. */
  private launching = false;
  /** Wave the current run started at (?wave=N, or the boss via "skip to the boss"). */
  private startWave = this.debug.wave ?? 1;

  constructor(private container: HTMLElement, uiRoot: HTMLElement, private options: GameOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Scotty: Defend Souq Waqif game arena');
    container.prepend(this.renderer.domElement);
    const ctx: KitContext = { scene: this.scene, camera: this.camera, renderer: this.renderer,
      events: this.events, assets: new Assets(), rng: new Rng(this.debug.seed ?? undefined), debug: this.debug, uiRoot };
    this.world = createWorld(ctx);
    this.fx = createFx(ctx);
    this.enemies = this.debug.fake ? createFakeEnemies(ctx, { world: this.world, fx: this.fx }) : createEnemies(ctx, { world: this.world, fx: this.fx });
    this.ui = createUi(ctx);
    this.audio = createAudio(ctx); this.audio.setMuted(this.debug.mute);
    this.player = new Player(ctx, this.world.arena);
    this.rig = new CameraRig(this.camera, this.events); this.rig.reset(this.player.position);
    this.damage = new Damage(this.enemies, this.fx, this.events, this.combo);
    this.finisher = new Finisher(this.events, this.fx);
    this.dash = new Dash(this.player, this.world.arena, this.enemies, this.fx, this.events, this.damage, this.finisher);
    this.slash = new AutoSlash(this.player, this.enemies, this.fx, this.events, this.combo, this.damage);
    this.finalCut = new FinalCut(this.player, this.enemies, this.world.arena, this.fx, this.rig, this.events, () => {
      if (this.pendingVictory) this.victory();
    });
    this.input = new Input(this.renderer.domElement, container, this.camera, this.player.position, {
      dash: this.requestDash,
      tap: () => { if (this.finalCut.available) this.requestDash(this.intent.set(1, 0, 0)); },
      pause: () => this.setPaused(!this.paused),
    });
    this.bot = new Autoplay(this.player, this.enemies, this.requestDash);
    this.fallbackUi = new CoreOverlay(container, uiRoot, this.events);
    this.bindEvents();
    const signal = this.abort.signal;
    window.addEventListener('pointerdown', this.unlock, { signal, capture: true });
    window.addEventListener('keydown', this.unlock, { signal, capture: true });
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (this.state === 'title' && e.isPrimary && e.button === 0) this.requestStart();
    }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.setPaused(true); }, { signal });
    window.addEventListener('pagehide', () => this.setPaused(true), { signal });
    window.addEventListener('resize', this.resize, { signal });
    this.observer = new ResizeObserver(this.resize); this.observer.observe(container);
    this.resize();
    if (this.debug.fps) {
      this.fpsRoot = document.createElement('div');
      this.fpsRoot.style.cssText = 'position:absolute;bottom:12px;left:12px;z-index:30;pointer-events:none;background:#17121dcc;color:#fff2c5;padding:6px 9px;font:12px monospace;';
      container.append(this.fpsRoot);
    }
    this.exposeDebug(); this.setState('title'); this.frame(performance.now());
    this.renderer.setAnimationLoop(this.frame);
  }

  private bindEvents(): void {
    this.off.push(
      this.events.on('ui:start', () => this.requestStart()),
      this.events.on('ui:startBoss', () => {
        // Straight to the Dean Trick fight: no intro. Restarts from this run return to the boss.
        if (this.state !== 'title' || this.launching) return;
        this.start(BOSS_WAVE);
      }),
      this.events.on('ui:restart', () => this.restart()),
      this.events.on('ui:pause', () => this.setPaused(true)),
      this.events.on('ui:resume', () => this.setPaused(false)),
      this.events.on('ui:toggleMute', () => this.audio.setMuted(!this.audio.muted)),
      this.events.on('boss:intro', () => {
        if (this.state !== 'playing') return;
        this.setState('bossIntro'); this.world.breachWall();
      }),
      this.events.on('boss:spawned', () => { if (this.state === 'bossIntro' || this.state === 'playing') this.setState('bossFight'); }),
      this.events.on('boss:defeated', () => {
        if (this.state !== 'finalCut' && this.state !== 'bossFight') return;
        this.pendingVictory = true; if (!this.finalCut.active) this.victory();
      }),
      this.events.on('wave:cleared', ({ wave }) => { this.wavesCleared = Math.max(this.wavesCleared, Math.min(wave, 5)); }),
      this.events.on('player:hurt', ({ position }) => { this.combo.lose(); this.fx.damageNumber(position, '-1', 'player'); }),
      this.events.on('player:died', () => {
        if (!this.inCombat || this.deathLeft) return;
        this.deathLeft = CONFIG.death.duration; this.dash.reset(); this.enemies.setFrozen(true);
        this.events.emit('time:slowmo', { scale: CONFIG.death.scale, duration: CONFIG.death.duration, priority: 90 });
      }),
      this.events.on('enemy:hit', () => this.counters.hits++),
      this.events.on('enemy:killed', () => this.counters.kills++),
      this.events.on('dash:start', () => this.counters.dashes++),
      this.events.on('finisher:start', () => this.counters.finishers++),
      this.events.on('finalcut:start', () => this.counters.finalCuts++),
    );
  }

  private get inCombat(): boolean {
    return this.state === 'playing' || this.state === 'bossIntro' || this.state === 'bossFight' || this.state === 'finalCut';
  }
  private unlock = (): void => { if (!this.unlocked) { this.unlocked = true; this.audio.unlock(); } };

  /** Player asked to start from the title: run beforePlay (the portal intro) first, once. */
  private requestStart(): void {
    if (this.state !== 'title' || this.launching) return;
    const beforePlay = this.options.beforePlay;
    if (!beforePlay) {
      this.start();
      return;
    }
    this.launching = true;
    beforePlay(() => {
      this.launching = false;
      this.start();
    });
  }

  /** Start a run at `fromWave` (defaults to the wave of the previous run, so restarts repeat it). */
  start(fromWave: number = this.startWave): void {
    if (this.state !== 'title') return;
    this.runSeconds = 0; this.time.reset(); this.input.reset(); this.setState('playing');
    const wave = Math.max(1, Math.min(BOSS_WAVE, Math.trunc(fromWave)));
    this.startWave = wave;
    this.wavesCleared = wave - 1; this.enemies.start(wave);
  }

  restart(): void {
    this.counters.restarts++;
    this.slash.reset(); this.dash.reset(); this.finisher.reset(); this.finalCut.reset();
    this.enemies.reset(); this.world.reset(); this.fx.reset(); this.ui.reset(); this.audio.reset?.();
    this.player.reset(); this.rig.reset(this.player.position); this.input.reset(); this.bot.reset(); this.combo.reset(); this.time.reset();
    this.paused = false; this.deathLeft = this.runSeconds = this.wavesCleared = 0; this.pendingVictory = false; this.launching = false;
    this.counters.hits = this.counters.kills = this.counters.dashes = this.counters.finishers = this.counters.finalCuts = 0;
    this.states.length = 0; this.events.emit('game:paused', { paused: false });
    this.setState('title'); this.start();
  }

  private setState(next: GameState): void {
    if (next === this.state) return;
    const prev = this.state; this.state = next; this.states.push(next);
    const mood = next === 'title' ? 'title' : next === 'bossIntro' || next === 'bossFight' ? 'boss' : next === 'finalCut' ? 'finalCut' : next === 'victory' ? 'victory' : 'battle';
    this.world.setMood(mood); this.events.emit('game:state', { state: next, prev });
  }

  private setPaused(paused: boolean): void {
    if (!this.inCombat || paused === this.paused) return;
    this.paused = paused; this.input.reset(); this.enemies.setFrozen(paused || this.finalCut.active || this.deathLeft > 0);
    this.events.emit('game:paused', { paused });
  }

  private requestDash = (direction: THREE.Vector3): void => {
    if (this.paused || this.deathLeft > 0 || this.player.hp <= 0 || this.state !== 'playing' && this.state !== 'bossFight') return;
    if (this.finalCut.available) {
      this.dash.reset(); this.slash.reset(); this.finisher.reset(); this.setState('finalCut'); this.finalCut.start(direction);
    } else this.dash.start(direction);
  };

  private summary(): RunSummary {
    return { score: this.combo.score, bestCombo: this.combo.best, wavesCleared: this.wavesCleared, timeSeconds: this.runSeconds };
  }
  private victory(): void {
    if (this.state === 'victory' || this.state === 'gameOver') return;
    this.wavesCleared = 5; this.enemies.setFrozen(true); this.setState('victory'); this.events.emit('game:victory', this.summary());
  }
  private resize = (): void => {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.fx.resize(w, h, this.renderer.getPixelRatio());
  };

  private frame = (now: number): void => {
    this.time.tick(now, this.paused || !this.inCombat);
    const clock = this.time;
    if (this.state === 'title' && this.debug.autoplay) {
      this.titleSeconds += clock.realDt; if (this.titleSeconds > 0.4) this.start();
    }
    if (this.inCombat && !this.paused) {
      this.runSeconds += clock.realDt; this.input.update();
      let move = this.input.move;
      if (this.debug.autoplay && !this.finalCut.active && !this.deathLeft) {
        this.bot.update(clock.realDt, this.finalCut.available); move = this.bot.move;
      }
      this.player.update(clock, move, this.state === 'bossIntro' || this.state === 'finalCut' || this.deathLeft > 0);
      this.dash.update(clock); this.enemies.update(clock, this.player);
      this.slash.update(clock, (this.state === 'playing' || this.state === 'bossFight') && !this.deathLeft);
      this.combo.update(clock.dt); this.finisher.update(clock.realDt); this.finalCut.update(clock.realDt);
      if (this.deathLeft > 0) {
        this.deathLeft = Math.max(0, this.deathLeft - clock.realDt);
        if (!this.deathLeft) { this.setState('gameOver'); this.events.emit('game:over', this.summary()); }
      }
    } else if (!this.paused && this.state === 'title') this.player.update(clock, this.neutral, true);
    this.world.update(clock);
    if (!this.paused) this.rig.update(clock, this.player.position, this.player.velocity, this.state);
    this.fx.update(clock); this.audio.update(clock); this.updateHud(); this.ui.update(clock, this.hud); this.fallbackUi.update(this.hud);
    this.fx.render();
    this.renderStats.geometries = this.renderer.info.memory.geometries;
    this.renderStats.textures = this.renderer.info.memory.textures; this.renderStats.drawCalls = this.renderer.info.render.calls;
    if (this.fpsRoot) {
      this.fpsFrames++; this.fpsTime += clock.realDt;
      if (this.fpsTime > 0.5) {
        this.fpsRoot.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} fps | ${this.renderStats.drawCalls} calls | ${clock.timeScale.toFixed(2)}x`;
        this.fpsFrames = this.fpsTime = 0;
      }
    }
  };

  private updateHud(): void {
    const h = this.hud;
    h.state = this.state; h.paused = this.paused; h.hp = this.player.hp; h.maxHp = this.player.maxHp;
    h.combo = this.combo.count; h.bestCombo = this.combo.best; h.comboTier = this.combo.tier;
    h.comboMultiplier = this.combo.multiplier; h.comboDecay01 = this.combo.decay01; h.score = this.combo.score;
    h.dashReady01 = this.dash.ready01; h.wave = this.enemies.wave; h.totalWaves = this.enemies.totalWaves;
    h.enemiesAlive = this.enemies.aliveCount(); h.finalCutReady = this.finalCut.available; h.muted = this.audio.muted;
    const boss = this.enemies.boss;
    if (boss) { this.bossHud.hp = boss.hp; this.bossHud.maxHp = boss.maxHp; this.bossHud.phase = boss.phase; h.boss = this.bossHud; }
    else h.boss = null;
  }

  private exposeDebug(): void {
    const game = this;
    window.__game = {
      get state() { return game.state; }, get paused() { return game.paused; }, get wave() { return game.enemies.wave; },
      player: { get hp() { return game.player.hp; }, position: game.player.position },
      get enemies() { return game.enemies.aliveCount(); }, get boss() { return game.enemies.boss ? game.bossHud : null; },
      get combo() { return game.combo.count; }, get score() { return game.combo.score; }, get time() { return game.time.time; },
      get finalCutReady() { return game.finalCut.available; }, counters: this.counters, states: this.states, renderer: this.renderStats, events: this.events,
      start: () => this.start(), restart: () => this.restart(), pause: () => this.setPaused(true), resume: () => this.setPaused(false),
      dash: (x = 1, z = 0) => this.requestDash(this.intent.set(x, 0, z)),
    };
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null); this.abort.abort(); this.observer.disconnect();
    this.input.dispose(); this.fallbackUi.dispose(); this.fpsRoot?.remove();
    this.slash.reset(); this.dash.reset(); this.finisher.reset(); this.finalCut.dispose();
    this.enemies.reset(); this.world.reset(); this.fx.reset(); this.ui.reset(); this.audio.reset?.();
    this.player.dispose(); this.rig.dispose(); this.time.dispose(); for (const off of this.off) off(); this.events.clear();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    });
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove(); delete window.__game;
  }
}

export interface GameOptions {
  /** Runs when the player taps start on the title screen; call `begin` to drop into wave 1.
   *  Restarts after game over skip it. */
  beforePlay?: (begin: () => void) => void;
}

export function startGame(container: HTMLElement, uiRoot: HTMLElement, options?: GameOptions): Game {
  const game = new Game(container, uiRoot, options);
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
  return game;
}
