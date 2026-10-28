import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Assets } from '../core/Assets';
import type { GameClock, KitContext, TrailHandle, TrailStyle } from '../core/contracts';
import { EventBus } from '../core/Events';
import { Rng } from '../core/rng';
import { createFx } from './index';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9c7592');
scene.fog = new THREE.Fog('#a38591', 27, 64);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(14, 14.5, 19); camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight('#e7d6f7', '#85532c', 2.1));
const sun = new THREE.DirectionalLight('#ffcf8c', 3.0); sun.position.set(-8, 16, 7); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: '#aa805d', roughness: 0.92 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const grid = new THREE.GridHelper(44, 44, '#986b64', '#a57663'); grid.position.y = 0.008;
(grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.25; scene.add(grid);

const sandstone = new THREE.MeshStandardMaterial({ color: '#d5a773', roughness: 0.88 });
const gold = new THREE.MeshStandardMaterial({ color: '#a5652e', roughness: 0.35, metalness: 0.65 });
const lantern = new THREE.MeshStandardMaterial({ color: '#ffcc63', emissive: '#ffad37', emissiveIntensity: 3.5, roughness: 0.4 });
for (let i = 0; i < 10; i++) {
  const x = (i - 4.5) * 3.2;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.45, 2), sandstone); plinth.position.set(x, 0.225, -8); scene.add(plinth);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.23, 3.5, 6), gold); pillar.position.set(x, 1.9, -8); scene.add(pillar);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), lantern); light.position.set(x, 3.8, -8); scene.add(light);
}

const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 1.5), sandstone);
box.position.set(-4, 0.9, 0); box.rotation.y = 0.3; scene.add(box);
const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), new THREE.MeshStandardMaterial({ color: '#6d2d7e', roughness: 0.28, metalness: 0.25 }));
sphere.position.set(0, 1.05, 0); scene.add(sphere);
const modelParent = new THREE.Group(); modelParent.position.set(4.2, 0, 0); modelParent.rotation.y = -0.3;
modelParent.scale.set(1.1, 1, 0.95); scene.add(modelParent);
const model = new THREE.Group(); model.rotation.z = 0.07; modelParent.add(model);
model.name = 'demo:loaded-model';
function fallbackModel(): THREE.Group {
  const root = new THREE.Group();
  const torso = new THREE.Group(); torso.rotation.y = 0.3; root.add(torso);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.65, 4, 10), new THREE.MeshStandardMaterial({ color: '#ad673f', roughness: 0.85 }));
  body.position.y = 1.05; torso.add(body);
  const head = new THREE.Group(); head.position.y = 1.9; torso.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.57, 12, 8), body.material); head.add(face);
  for (let i = 0; i < 2; i++) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), body.material); ear.position.set(i === 0 ? -0.4 : 0.4, 0.42, 0); head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), new THREE.MeshBasicMaterial({ color: '#151220' }));
    eye.position.set(i === 0 ? -0.19 : 0.19, 0.05, 0.52); head.add(eye);
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.14, 5, 12), new THREE.MeshStandardMaterial({ color: '#bd2059' }));
  scarf.position.y = 1.55; scarf.rotation.x = Math.PI / 2; torso.add(scarf);
  return root;
}
model.add(fallbackModel());

const assets = new Assets();
async function loadDemoModel(): Promise<void> {
  // Exercise an actual GLB load without requesting an optional asset that may return a 404.
  // The self-contained fixture retains nested transforms and shared materials after round-trip.
  const binary = await new GLTFExporter().parseAsync(fallbackModel(), { binary: true });
  const gltf = await new GLTFLoader().parseAsync(binary as ArrayBuffer, '');
  let loaded: THREE.Object3D = gltf.scene;
  if (new URLSearchParams(location.search).has('model')) loaded = await assets.model('beaver') ?? loaded;
  model.clear(); model.add(loaded);
  document.querySelector('#model-status')!.textContent = 'GLB loaded. Split tests a nested model under a rotated, nonuniformly scaled parent.';
}
void loadDemoModel().catch(() => {
  document.querySelector('#model-status')!.textContent = 'GLB loader unavailable. Nested primitive fallback is ready.';
});
const ctx: KitContext = {
  renderer, scene, camera, assets, events: new EventBus(), rng: new Rng(7613),
  debug: { wave: null, god: true, seed: 7613, fps: true, mute: true, autoplay: false },
  uiRoot: document.querySelector<HTMLElement>('#ui-root')!,
};
const fx = createFx(ctx);
const sword = new THREE.Group();
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.065, 1.8, 0.08), new THREE.MeshStandardMaterial({
  color: '#fff2d1', emissive: '#ffda80', emissiveIntensity: 5,
}));
blade.position.y = 0.9; sword.add(blade);
const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.14), gold); sword.add(guard); scene.add(sword);
const base = new THREE.Vector3(), tip = new THREE.Vector3(), origin = new THREE.Vector3(0, 0, 3);
const from = new THREE.Vector3(-5, 0.5, 3), to = new THREE.Vector3(5, 0.5, 3), cut = new THREE.Vector3(1, 0.15, 0.15).normalize();
const clock: GameClock = { dt: 0, realDt: 0, time: 0, timeScale: 1 };
let trail: TrailHandle | null = null, style: TrailStyle = 'slash', swingTime = -1;
let slow = false, cinematic = 0, side: 1 | -1 = 1, hp = 5;

function startTrail(next: TrailStyle): void {
  trail?.end(); style = next; trail = fx.beginTrail(next); swingTime = 0;
  if (next !== 'slash') ctx.events.emit('dash:start', { from, to });
}
const actions: Record<string, () => void> = {
  slash: () => startTrail('slash'), dash: () => startTrail('dash'), finalCut: () => startTrail('finalCut'),
  arc: () => { fx.slashArc(origin, Math.PI, 2.8, Math.PI * 150 / 360, side); side = side === 1 ? -1 : 1; },
  burst: () => fx.petalBurst(origin, 220, 1.5),
  hit: () => ctx.events.emit('enemy:hit', { id: 1, kind: 'beaver', position: sphere.position, damage: 3, source: 'dash', killed: false }),
  kill: () => ctx.events.emit('enemy:killed', { id: 1, kind: 'beaver', position: box.position, source: 'slash' }),
  slam: () => ctx.events.emit('boss:slam', { position: origin, radius: 7 }),
  debris: () => fx.debris(origin, cut, 80),
  hurt: () => { hp = Math.max(0, hp - 1); ctx.events.emit('player:hurt', { hp, maxHp: 5, position: origin, from }); },
  combo: () => ctx.events.emit('combo:tier', { tier: 2, multiplier: 3 }),
  numbers: () => {
    fx.damageNumber(box.position, 12, 'normal'); fx.damageNumber(sphere.position, 99, 'big');
    fx.damageNumber(modelParent.position, '-1', 'player'); fx.damageNumber(origin, 3, 'combo');
  },
  flash: () => fx.flash(0xffd67a, 0.55, 0.35),
  splitBox: () => { box.visible = true; fx.splitObject(box, cut, 1); box.visible = false; },
  splitSphere: () => { sphere.visible = true; fx.splitObject(sphere, cut, 1); sphere.visible = false; },
  splitModel: () => { model.visible = true; fx.splitObject(model, cut, 1); model.visible = false; },
  finisher: () => { cinematic = 1.3; ctx.events.emit('finisher:start', { position: origin, kills: 4 }); },
  impact: () => {
    cinematic = 2.1; fx.setLetterbox(1); fx.setDesaturate(0.65); startTrail('finalCut');
    model.visible = true; fx.splitObject(model, cut, 4); model.visible = false;
    ctx.events.emit('finisher:start', { position: origin, kills: 5 });
    ctx.events.emit('finalcut:impact', { position: origin });
  },
  victory: () => ctx.events.emit('boss:defeated', { position: origin }),
  slow: () => {
    slow = !slow; fx.setSlowMo(slow ? 1 : 0);
    const b = document.querySelector<HTMLButtonElement>('#slow')!;
    b.classList.toggle('active', slow); b.setAttribute('aria-pressed', String(slow));
  },
  letterbox: () => {
    const input = document.querySelector<HTMLInputElement>('#bars')!;
    input.value = Number(input.value) > 0 ? '0' : '1'; fx.setLetterbox(Number(input.value));
  },
  reset: () => {
    trail?.end(); trail = null; swingTime = -1; slow = false; cinematic = 0; hp = 5;
    fx.reset(); box.visible = sphere.visible = model.visible = true;
    document.querySelector<HTMLButtonElement>('#slow')!.classList.remove('active');
    document.querySelector<HTMLButtonElement>('#slow')!.setAttribute('aria-pressed', 'false');
    document.querySelector<HTMLInputElement>('#desaturate')!.value = '0'; document.querySelector<HTMLInputElement>('#bars')!.value = '0';
  },
};
const keys: Record<string, string> = {
  '1': 'slash', '2': 'dash', '3': 'finalCut', '4': 'arc', '5': 'burst', '6': 'slam', '7': 'hurt', '8': 'combo', '9': 'finisher', '0': 'impact',
  h: 'hit', k: 'kill', d: 'debris', n: 'numbers', f: 'flash', b: 'splitBox', s: 'splitSphere', g: 'splitModel', v: 'victory', r: 'reset', m: 'slow', l: 'letterbox',
};
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => actions[button.dataset.action!]()));
window.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || e.repeat) return;
  const action = keys[e.key.toLowerCase()]; if (action) { e.preventDefault(); actions[action](); }
});
document.querySelector('#desaturate')!.addEventListener('input', e => fx.setDesaturate(Number((e.target as HTMLInputElement).value)));
document.querySelector('#bars')!.addEventListener('input', e => fx.setLetterbox(Number((e.target as HTMLInputElement).value)));
function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  fx.resize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
}
window.addEventListener('resize', resize); resize();
let last = performance.now(), uiTime = 0, fps = 60;
const status = document.querySelector('#status')!;
renderer.info.autoReset = false;
renderer.setAnimationLoop(now => {
  clock.realDt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  clock.timeScale = slow || cinematic > 0 ? 0.12 : 1;
  clock.dt = clock.realDt * clock.timeScale; clock.time += clock.dt;
  if (cinematic > 0) {
    cinematic -= clock.realDt;
    if (cinematic <= 0) {
      ctx.events.emit('finisher:end', {}); fx.setSlowMo(slow ? 1 : 0);
      fx.setLetterbox(Number(document.querySelector<HTMLInputElement>('#bars')!.value));
      fx.setDesaturate(Number(document.querySelector<HTMLInputElement>('#desaturate')!.value));
    }
  }
  if (swingTime >= 0 && trail) {
    const duration = style === 'slash' ? 0.32 : style === 'dash' ? 0.40 : 0.85;
    swingTime += clock.dt;
    const t = Math.min(1, swingTime / duration);
    if (style === 'slash') {
      const angle = -1.7 + t * 3.4;
      base.set(Math.sin(angle) * 0.5, 1, 3 + Math.cos(angle) * 0.5);
      tip.set(Math.sin(angle) * 2.8, 1 + Math.sin(t * Math.PI) * 0.45, 3 + Math.cos(angle) * 2.8);
    } else {
      const x = -6 + t * 12, height = style === 'finalCut' ? 3.3 : 1.7;
      base.set(x, 0.55, 3.2); tip.set(x + Math.sin(t * Math.PI) * 0.5, height, 3.2 + (style === 'finalCut' ? 0.3 : 0));
    }
    trail.push(tip, base);
    if (t >= 1) { trail.end(); trail = null; swingTime = -1; }
  } else {
    base.set(-2.6, 0.7, 3.8); tip.set(-2.5 + Math.sin(clock.time * 1.4) * 0.2, 2.5, 3.8);
  }
  sword.position.copy(base); sword.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, cut.subVectors(tip, base).normalize());
  cut.set(1, 0.15, 0.15).normalize();
  fx.update(clock); renderer.info.reset(); fx.render();
  fps += ((clock.realDt > 0 ? 1 / clock.realDt : 60) - fps) * 0.05;
  uiTime += clock.realDt;
  if (uiTime > 0.4) {
    uiTime = 0;
    status.textContent = `${Math.round(fps)} fps | ${renderer.info.render.calls} draws\n${renderer.info.memory.geometries} geometries | ${renderer.info.memory.textures} textures`;
    (status as HTMLElement).style.whiteSpace = 'pre-line';
  }
});

// Read-only diagnostics plus action hooks for the standalone browser smoke test.
Object.assign(window, { __fxDemo: { fx, actions, renderer, scene, camera, events: ctx.events, clock } });
actions.slash();
