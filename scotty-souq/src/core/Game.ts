// SKELETON — owned by the Core/Player/Combat workstream, which grows this into the real game loop,
// state machine and systems wiring. Kits are created through their factories only.
import * as THREE from 'three';
import { createAudio } from '../audio';
import { createEnemies } from '../enemies';
import { createFx } from '../fx';
import { createUi } from '../ui';
import { createWorld } from '../world';
import { Assets } from './Assets';
import type { GameClock, KitContext } from './contracts';
import { parseDebugFlags } from './debug';
import { EventBus } from './Events';
import { Rng } from './rng';

export function startGame(container: HTMLElement, uiRoot: HTMLElement): void {
  const debug = parseDebugFlags();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  camera.position.set(0, 16, 12);
  camera.lookAt(0, 0, 0);

  const ctx: KitContext = {
    scene,
    camera,
    renderer,
    events: new EventBus(),
    assets: new Assets(),
    rng: new Rng(debug.seed ?? undefined),
    debug,
    uiRoot,
  };

  const world = createWorld(ctx);
  const fx = createFx(ctx);
  const enemies = createEnemies(ctx, { world, fx });
  const ui = createUi(ctx);
  const audio = createAudio(ctx);
  void enemies;
  void ui;
  void audio;

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fx.resize(w, h, renderer.getPixelRatio());
  };
  window.addEventListener('resize', resize);
  resize();

  const clock: GameClock = { time: 0, dt: 0, realDt: 0, timeScale: 1 };
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    clock.realDt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    clock.dt = clock.realDt * clock.timeScale;
    clock.time += clock.dt;
    world.update(clock);
    fx.update(clock);
    fx.render();
  });
}
