import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Assets } from '../core/Assets';
import type { GameClock, KitContext, WorldMood } from '../core/contracts';
import { EventBus } from '../core/Events';
import { Rng } from '../core/rng';
import { WORLD } from './config';
import { createWorld } from './index';

type View = 'gameplay' | 'overview' | 'flythrough';
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(WORLD.demo.fov, 1, 0.1, 350);
const overlay = document.querySelector<HTMLElement>('#overlay')!;
// The standalone HTML entry is one directory below the game entry. Keep the core-owned Assets
// implementation intact while resolving its relative production URLs against the demo's app root.
const demoRoot = new URL('../', window.location.href);
THREE.DefaultLoadingManager.setURLModifier((url) => url.startsWith('./assets/') ? new URL(url, demoRoot).href : url);
const ctx: KitContext = {
  scene, camera, renderer, assets: new Assets(), events: new EventBus(), rng: new Rng(123), uiRoot: overlay,
  debug: { wave: null, god: true, seed: 123, fps: true, mute: true, autoplay: false },
};
const world = createWorld(ctx);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI / 2 - 0.06;
controls.target.set(0, 0, 0);
let view: View = 'gameplay';
let flyTime = 0;

const setView = (next: View) => {
  view = next;
  flyTime = 0;
  controls.target.set(0, 0, 0);
  if (view === 'gameplay') camera.position.set(0, WORLD.demo.height, WORLD.demo.height / Math.tan(WORLD.demo.pitch));
  if (view === 'overview') camera.position.set(0, WORLD.demo.overviewHeight, 27);
  if (view === 'flythrough') camera.position.set(0, 6.5, 13);
  controls.enabled = view !== 'flythrough';
  camera.lookAt(controls.target);
  controls.update();
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === next));
  });
};
const setMood = (mood: WorldMood) => {
  world.setMood(mood);
  document.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mood === mood));
  });
};
document.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((button) => {
  button.addEventListener('click', () => setMood(button.dataset.mood as WorldMood));
});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view as View));
});
document.querySelector('#breach')!.addEventListener('click', () => world.breachWall());
const reset = () => { world.reset(); setMood('title'); };
document.querySelector('#reset')!.addEventListener('click', reset);

const guides = new THREE.Group();
guides.name = 'demo-only gate and walkable radius guides';
guides.visible = false;
for (const gate of world.arena.gates) {
  const marker = new THREE.ArrowHelper(gate.inward, gate.position.clone().setY(0.1), 3, 0x63ffe0, 0.5, 0.3);
  guides.add(marker);
}
const circle = new THREE.Mesh(new THREE.RingGeometry(world.arena.radius - 0.04, world.arena.radius + 0.04, 128).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x63ffe0, transparent: true, opacity: 0.6, depthWrite: false }));
circle.position.y = 0.04;
guides.add(circle);
scene.add(guides);
window.addEventListener('keydown', (event) => {
  const moods: WorldMood[] = ['title', 'battle', 'boss', 'finalCut', 'victory'];
  const number = Number(event.key);
  if (number >= 1 && number <= 5) setMood(moods[number - 1]);
  switch (event.key.toLowerCase()) {
    case 'g': setView('gameplay'); break;
    case 'o': setView('overview'); break;
    case 'f': setView('flythrough'); break;
    case 'b': world.breachWall(); break;
    case 'r': reset(); break;
    case 'v': guides.visible = !guides.visible; break;
    case 'h': overlay.hidden = !overlay.hidden; break;
  }
});

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
};
window.addEventListener('resize', resize);
resize();
setView(new URLSearchParams(location.search).get('view') === 'overview' ? 'overview' : 'gameplay');
const clock: GameClock = { time: 0, dt: 0, realDt: 0, timeScale: 1 };
let previous = performance.now(), statsTime = 0;
const stats = document.querySelector<HTMLOutputElement>('#stats')!;
renderer.setAnimationLoop((now) => {
  clock.realDt = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  clock.dt = clock.realDt;
  clock.time += clock.dt;
  if (view === 'flythrough') {
    flyTime += clock.realDt;
    const angle = flyTime * 0.10;
    camera.position.set(Math.sin(angle) * 13, 6.5 + Math.sin(flyTime * 0.15) * 1.4, Math.cos(angle) * 13);
    camera.lookAt(0, 3, 0);
  } else controls.update();
  world.update(clock);
  renderer.render(scene, camera);
  statsTime += clock.realDt;
  if (statsTime > 0.35) {
    statsTime = 0;
    stats.value = `${renderer.info.render.calls} calls / ${(renderer.info.render.triangles / 1000).toFixed(1)}k triangles\n18 m arena / 8 alleys / 1 shadow sun`;
    stats.style.whiteSpace = 'pre-line';
  }
});

// A self-contained harness for headless visual and contract checks, with no gameplay kits required.
Object.assign(window, { __worldDemo: { world, scene, camera, renderer, setView, setMood, guides, clock } });
