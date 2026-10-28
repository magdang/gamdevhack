import { PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from 'three';
import type { AssetsApi } from '../core/Assets';
import type { GameClock, GameState, HudSnapshot, KitContext, RunSummary } from '../core/contracts';
import { EventBus } from '../core/Events';
import { AUDIO, IMAGES } from '../core/manifest';
import { Rng } from '../core/rng';
import { createAudio } from '../audio';
import { createUi } from './index';
import { find, text } from './dom';

const events = new EventBus();
// The demo does not need a WebGL context. Neither owned kit reads the renderer.
const assets: AssetsApi = {
  model: async () => null,
  texture: async () => null,
  imageUrl: (key) => new URL(IMAGES[key], new URL('../', location.href)).href,
  audioUrl: (key) => new URL(AUDIO[key], new URL('../', location.href)).href,
};
const params = new URLSearchParams(location.search);
if (params.has('clean')) document.body.dataset.clean = 'true';
find(document, '#stage').style.setProperty('--art', `url("${assets.imageUrl('key_art')}")`);
const context: KitContext = {
  scene: new Scene(), camera: new PerspectiveCamera(), renderer: {} as WebGLRenderer,
  assets, events, rng: new Rng(7), uiRoot: find(document, '#ui-root'),
  debug: { wave: null, god: true, seed: 7, fps: false, mute: params.get('mute') === '1', autoplay: false },
};
const ui = createUi(context);
const audio = createAudio(context);
const hud: HudSnapshot = {
  state: 'title', paused: false, hp: 5, maxHp: 5, combo: 0, bestCombo: 0, comboTier: 0,
  comboMultiplier: 1, comboDecay01: 1, score: 0, dashReady01: 1, wave: 1, totalWaves: 5,
  enemiesAlive: 12, boss: null, finalCutReady: false, muted: audio.muted,
};
const clock: GameClock = { time: 0, dt: 0, realDt: 0, timeScale: 1 };
const origin = new Vector3();
const destination = new Vector3(4, 0, 2);
const states: GameState[] = ['title', 'playing', 'bossIntro', 'bossFight', 'finalCut', 'victory', 'gameOver'];
const stateSelect = find<HTMLSelectElement>(document, '#state');
states.forEach((state) => stateSelect.add(new Option(state, state)));
const status = find(document, '#status');
let lastEvent = 'Ready';

function report(message: string): void { lastEvent = message; }
function summary(): RunSummary {
  return { score: Math.max(42850, hud.score), bestCombo: Math.max(53, hud.bestCombo), wavesCleared: hud.state === 'victory' ? 5 : hud.wave - 1, timeSeconds: Math.max(137, clock.time) };
}
function setState(state: GameState): void {
  const prev = hud.state;
  hud.state = state;
  hud.paused = false;
  hud.finalCutReady = state === 'finalCut';
  stateSelect.value = state;
  if (state === 'title' || state === 'playing') hud.boss = null;
  if (state === 'bossIntro' || state === 'bossFight' || state === 'finalCut') {
    hud.wave = 6; hud.boss = { hp: state === 'finalCut' ? 9 : 120, maxHp: 120, phase: state === 'finalCut' ? 2 : 1 };
  }
  events.emit('game:state', { state, prev });
  events.emit('game:paused', { paused: false });
  if (state === 'victory') events.emit('game:victory', summary());
  if (state === 'gameOver') events.emit('game:over', summary());
  if (state === 'bossIntro') events.emit('boss:intro', { position: origin });
  if (state === 'bossFight') events.emit('boss:spawned', { hp: 120, maxHp: 120 });
  report(`game:state → ${state}`);
}
function setPaused(paused: boolean): void {
  hud.paused = paused;
  events.emit('game:paused', { paused });
  report(`game:paused → ${paused}`);
}
function start(): void {
  ui.reset();
  Object.assign(hud, { hp: 5, wave: 1, combo: 0, bestCombo: 0, score: 0, dashReady01: 1, boss: null });
  clock.time = 0;
  setState('playing');
  events.emit('wave:start', { wave: 1, totalWaves: 5 });
}
events.on('ui:start', start);
events.on('ui:restart', start);
events.on('ui:pause', () => setPaused(true));
events.on('ui:resume', () => setPaused(false));
events.on('ui:toggleMute', () => report('ui:toggleMute'));
stateSelect.onchange = () => setState(stateSelect.value as GameState);
find(document, '#next-state').onclick = () => setState(states[(states.indexOf(hud.state) + 1) % states.length]);
find(document, '#pause').onclick = () => setPaused(!hud.paused);
find(document, '#reset').onclick = () => { ui.reset(); report('ui.reset()'); };
find(document, '#unlock').onclick = () => { audio.unlock(); report('audio.unlock()'); };
find(document, '#mute').onclick = () => events.emit('ui:toggleMute', {});
find(document, '#boss').onclick = () => {
  if (hud.boss) hud.boss = null;
  else { hud.boss = { hp: 120, maxHp: 120, phase: 1 }; events.emit('boss:spawned', { hp: 120, maxHp: 120 }); }
};
find(document, '#final-cut').onclick = () => {
  hud.finalCutReady = !hud.finalCutReady;
  if (hud.finalCutReady) events.emit('finalcut:ready', { position: origin });
  else events.emit('game:state', { state: hud.state, prev: hud.state });
};

const sliders: { input: HTMLInputElement; output: HTMLOutputElement; get: () => number }[] = [];
function slider(label: string, min: number, max: number, step: number, get: () => number, set: (value: number) => void): void {
  const row = document.createElement('label');
  const title = document.createElement('span'); title.textContent = label;
  const input = document.createElement('input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step);
  const output = document.createElement('output');
  input.addEventListener('input', () => set(Number(input.value)));
  row.append(title, input, output);
  find(document, '#sliders').append(row);
  sliders.push({ input, output, get });
}
slider('Hearts', 0, 5, 1, () => hud.hp, (value) => { hud.hp = value; });
slider('Score', 0, 99999, 100, () => hud.score, (value) => { hud.score = value; });
slider('Combo', 0, 75, 1, () => hud.combo, (value) => {
  const previous = hud.comboTier;
  hud.combo = value; hud.bestCombo = Math.max(hud.bestCombo, value);
  hud.comboTier = value >= 50 ? 3 : value >= 25 ? 2 : value >= 10 ? 1 : 0;
  hud.comboMultiplier = [1, 2, 3, 5][hud.comboTier];
  events.emit('combo:changed', { combo: value, tier: hud.comboTier, multiplier: hud.comboMultiplier });
  if (hud.comboTier > previous) events.emit('combo:tier', { tier: hud.comboTier, multiplier: hud.comboMultiplier });
});
slider('Decay', 0, 1, .01, () => hud.comboDecay01, (value) => { hud.comboDecay01 = value; });
slider('Dash ready', 0, 1, .01, () => hud.dashReady01, (value) => { hud.dashReady01 = value; });
slider('Wave', 1, 6, 1, () => hud.wave, (value) => { hud.wave = value; });
slider('Mascots left', 0, 40, 1, () => hud.enemiesAlive, (value) => { hud.enemiesAlive = value; });
slider('Boss HP', 0, 120, 1, () => hud.boss?.hp ?? 120, (value) => {
  hud.boss = { hp: value, maxHp: 120, phase: value <= 60 ? 2 : 1 };
  events.emit('boss:hit', { hp: value, maxHp: 120, damage: 3, staggered: false });
});
slider('Time scale', 0, 1, .01, () => clock.timeScale, (value) => { clock.timeScale = value; });

const triggers: Record<string, () => void> = {
  'player:slash': () => events.emit('player:slash', { position: origin, facing: 0, side: 1, radius: 2.8, halfAngle: 1.3, hits: 3 }),
  'enemy:hit': () => events.emit('enemy:hit', { id: 1, kind: 'beaver', position: origin, damage: 3, source: 'slash', killed: false }),
  'enemy:killed': () => { hud.score += 100; events.emit('enemy:killed', { id: 1, kind: 'beaver', position: origin, source: 'dash' }); },
  'dash:start': () => { hud.dashReady01 = 0; events.emit('dash:start', { from: origin, to: destination }); },
  'finisher:start': () => events.emit('finisher:start', { position: origin, kills: 4 }),
  'finisher:end': () => events.emit('finisher:end', {}),
  'player:hurt': () => { hud.hp = Math.max(0, hud.hp - 1); events.emit('player:hurt', { hp: hud.hp, maxHp: 5, position: origin, from: destination }); },
  'wave:start': () => events.emit('wave:start', { wave: hud.wave, totalWaves: 5 }),
  'wave:cleared': () => events.emit('wave:cleared', { wave: hud.wave }),
  'boss:intro': () => setState('bossIntro'),
  'boss:spawned': () => setState('bossFight'),
  'boss:phase': () => { if (hud.boss) hud.boss.phase = 2; events.emit('boss:phase', { phase: 2 }); },
  'boss:slam': () => events.emit('boss:slam', { position: origin, radius: 4 }),
  'finalcut:ready': () => { hud.finalCutReady = true; events.emit('finalcut:ready', { position: origin }); },
  'finalcut:start': () => { setState('finalCut'); hud.finalCutReady = false; events.emit('finalcut:start', { from: origin, to: destination }); },
  'finalcut:impact': () => { if (hud.boss) hud.boss.hp = 0; events.emit('finalcut:impact', { position: origin }); },
  'combo:tier': () => events.emit('combo:tier', { tier: 2, multiplier: 3 }),
  'game:victory': () => setState('victory'),
  'game:over': () => setState('gameOver'),
};
for (const [name, trigger] of Object.entries(triggers)) {
  const button = document.createElement('button');
  button.textContent = name;
  button.addEventListener('click', () => { trigger(); report(name); });
  find(document, '#event-buttons').append(button);
}
// A small deterministic API for layout and event smoke checks, without requiring a renderer.
Object.assign(window, { __uiDemo: { hud, clock, events, ui, audio, setState, triggers } });
events.emit('game:state', { state: 'title', prev: 'boot' });
let previous = performance.now();
function frame(now: number): void {
  clock.realDt = Math.min(.05, (now - previous) / 1000);
  previous = now;
  clock.dt = hud.paused ? 0 : clock.realDt * clock.timeScale;
  clock.time += clock.dt;
  hud.muted = audio.muted;
  ui.update(clock, hud);
  audio.update(clock);
  for (const { input, output, get } of sliders) {
    const value = String(Math.round(get() * 100) / 100);
    if (input.value !== value && document.activeElement !== input) input.value = value;
    text(output, value);
  }
  text(status, `${lastEvent} · ${hud.state}${hud.paused ? ' (paused)' : ''} · audio ${audio.muted ? 'muted' : 'on'}`);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
