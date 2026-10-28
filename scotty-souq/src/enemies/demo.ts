import * as THREE from 'three';
import { Assets } from '../core/Assets';
import type { EnemiesKit, FxKit, GameClock, Hittable, KitContext, PlayerView, WorldKit } from '../core/contracts';
import { parseDebugFlags } from '../core/debug';
import { EventBus, type EventName } from '../core/Events';
import { Rng } from '../core/rng';
import { createEnemies } from './index';
import { ball, disposeObject } from './Model';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd3b9d2);
scene.fog = new THREE.Fog(0xd3b9d2, 45, 85);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 150);
camera.position.set(0, 28, 27);
camera.lookAt(0, 0, 0);
const debug = parseDebugFlags();
const assets = new Assets();
const ctx: KitContext = {
  scene, camera, renderer, debug, events: new EventBus(), rng: new Rng(debug.seed ?? 42),
  uiRoot: document.getElementById('panel')!,
  assets: params.get('fallback') !== '1' ? assets : {
    model: async () => null, texture: async () => null,
    imageUrl: (key) => assets.imageUrl(key), audioUrl: (key) => assets.audioUrl(key),
  },
};

scene.add(new THREE.HemisphereLight(0xffecd8, 0x86638c, 2));
const sun = new THREE.DirectionalLight(0xffdfb5, 3.2);
sun.position.set(12, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, far: 65 });
sun.shadow.normalBias = 0.035;
scene.add(sun);
const radius = 18;
const floor = new THREE.Mesh(new THREE.CircleGeometry(radius + 5, 80).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xe6c698, roughness: 0.95 }));
floor.receiveShadow = true;
scene.add(floor);
const boundary = new THREE.Mesh(new THREE.RingGeometry(radius - 0.08, radius + 0.08, 80).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xb29375 }));
boundary.position.y = 0.01;
scene.add(boundary);
const gates = Array.from({ length: 6 }, (_, id) => {
  const angle = id * Math.PI / 3;
  const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  const group = new THREE.Group();
  group.position.copy(dir).multiplyScalar(radius + 0.6);
  group.rotation.y = angle;
  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.5, 1.1), new THREE.MeshStandardMaterial({ color: 0xbb9274 }));
    column.position.set(side * 2.2, 1.75, 0);
    column.castShadow = true;
    group.add(column);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.65, 1.2), new THREE.MeshStandardMaterial({ color: id % 2 ? 0x9e364c : 0x366d63 }));
  lintel.position.y = 3.6;
  group.add(lintel);
  scene.add(group);
  return { id, position: dir.clone().multiplyScalar(radius + 1.5), inward: dir.clone().negate() };
});
const world: WorldKit = {
  arena: {
    radius, gates,
    bossBreach: { position: new THREE.Vector3(0, 0, -21), inward: new THREE.Vector3(0, 0, 1) },
    clamp(p, r) {
      const distance = Math.hypot(p.x, p.z);
      const max = Math.max(0, radius - r);
      if (distance > max) { p.x *= max / distance; p.z *= max / distance; }
      return p;
    },
  },
  update() {}, setMood() {}, reset() {},
  breachWall() { document.getElementById('status')!.textContent = 'DEAN TRICK: FINAL EXAM'; },
};

interface Effect { object: THREE.Object3D; time: number; duration: number; dir: THREE.Vector3; ring: boolean }
const effects: Effect[] = [];
function ring(pos: THREE.Vector3, size: number, color: number): void {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(size * 0.9, size, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  mesh.position.copy(pos).setY(0.09);
  scene.add(mesh);
  effects.push({ object: mesh, time: 0, duration: 0.6, dir: new THREE.Vector3(), ring: true });
}
function burst(pos: THREE.Vector3, count: number, power = 5): void {
  for (let i = 0; i < Math.min(count, 100); i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.24),
      new THREE.MeshBasicMaterial({ color: i % 3 ? 0xec459b : 0xfff3e5, side: THREE.DoubleSide, transparent: true }));
    mesh.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    scene.add(mesh);
    effects.push({ object: mesh, time: 0, duration: 1.2, ring: false,
      dir: new THREE.Vector3(ctx.rng.range(-1, 1), ctx.rng.range(0.3, 1.3), ctx.rng.range(-1, 1)).multiplyScalar(power) });
  }
}
const fx: FxKit = {
  update(clock) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.time += clock.realDt;
      if (effect.ring) effect.object.scale.setScalar(1 + effect.time * 2);
      else {
        effect.object.position.addScaledVector(effect.dir, clock.realDt);
        effect.dir.y -= clock.realDt * 6;
        effect.object.rotation.x += clock.realDt * 4;
      }
      effect.object.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
            mat.transparent = true;
            mat.opacity = Math.max(0, 1 - effect.time / effect.duration);
          }
        }
      });
      if (effect.time >= effect.duration) { disposeObject(effect.object); effects.splice(i, 1); }
    }
  },
  render() { renderer.render(scene, camera); }, resize() {},
  reset() { for (const effect of effects) disposeObject(effect.object); effects.length = 0; },
  petalBurst: burst,
  slashArc(origin, _facing, radius) { ring(origin, radius, 0xfff0b0); },
  beginTrail() { return { push() {}, end() {} }; }, damageNumber() {},
  shockwave(pos, radius, color = 0xffc46b) { ring(pos, radius, color); },
  debris(pos, _dir, count) { burst(pos, count, 4); },
  splitObject(object, dir, power = 5) {
    object.updateWorldMatrix(true, true);
    const pos = object.getWorldPosition(new THREE.Vector3());
    // Local demo fake: two resource-owning copies fly apart. Production FX owns the actual cut planes.
    for (const side of [-1, 1]) {
      const clone = object.clone(true);
      clone.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry = node.geometry.clone();
          node.material = Array.isArray(node.material) ? node.material.map((mat) => mat.clone()) : node.material.clone();
        }
      });
      clone.position.copy(pos);
      object.getWorldQuaternion(clone.quaternion);
      object.getWorldScale(clone.scale);
      clone.scale.multiplyScalar(0.7);
      scene.add(clone);
      effects.push({ object: clone, time: 0, duration: 1, dir: dir.clone().multiplyScalar(side * power).add(new THREE.Vector3(0, 3, 0)), ring: false });
    }
  },
  flash() {}, setLetterbox() {}, setDesaturate() {}, setSlowMo() {},
};

let god = debug.god;
let iFrames = 0;
let dashFrames = 0;
let hp = 5;
let facing = 0;
const avatar = new THREE.Group();
ball(avatar, 0x24212c, 0, 0.45, 0, 0.47, 0.45, 0.56);
ball(avatar, 0x332c3d, 0, 0.85, 0.27, 0.34);
ball(avatar, 0xb92c4c, 0, 0.65, 0.2, 0.37, 0.09, 0.35);
for (const side of [-1, 1]) ball(avatar, 0x24212c, side * 0.24, 1.14, 0.18, 0.12, 0.23, 0.12);
scene.add(avatar);
const player: PlayerView = {
  position: avatar.position, velocity: new THREE.Vector3(), radius: 0.6, maxHp: 5,
  get hp() { return hp; }, get facing() { return facing; },
  get invulnerable() { return god || iFrames > 0 || dashFrames > 0; },
  get dashing() { return dashFrames > 0; },
  hurt(amount, from) {
    if (player.invulnerable || hp <= 0) return false;
    hp = Math.max(0, hp - amount);
    iFrames = 1;
    ctx.events.emit('player:hurt', { hp, maxHp: 5, position: player.position, from });
    ring(player.position, 1, 0xff544c);
    if (hp === 0) document.getElementById('status')!.textContent = 'Out of hearts. R restarts, G toggles god mode.';
    return true;
  },
};
const enemies = createEnemies(ctx, { world, fx });
const records: Array<{ type: EventName; data: unknown }> = [];
const tracked = ['enemy:spawned', 'enemy:telegraph', 'enemy:strike', 'enemy:hit', 'enemy:killed', 'projectile:fired',
  'wave:start', 'wave:cleared', 'boss:intro', 'boss:spawned', 'boss:attack', 'boss:slam', 'boss:hit',
  'boss:staggered', 'boss:phase', 'finalcut:ready', 'boss:defeated', 'camera:shake', 'player:hurt'] as const;
for (const name of tracked) ctx.events.on(name, (payload) => {
  records.push({ type: name, data: JSON.parse(JSON.stringify(payload)) });
  if (records.length > 8000) records.shift();
  if (name === 'enemy:hit') burst((payload as { position: THREE.Vector3 }).position, 6, 2);
  if (name === 'finalcut:ready') document.getElementById('status')!.textContent = 'FINAL CUT READY! Press F or Space.';
  if (name === 'boss:defeated') document.getElementById('status')!.textContent = 'VICTORY! The final exam is over.';
});

const keys = new Set<string>();
const targets: Hittable[] = [];
let frozen = false;
const clock: GameClock = { dt: 0, realDt: 0, time: 0, timeScale: 1 };
function start(wave: number): void {
  fx.reset();
  records.length = 0;
  hp = 5;
  iFrames = 0;
  dashFrames = 0;
  player.position.set(0, 0, 0);
  frozen = false;
  clock.time = 0;
  document.getElementById('status')!.textContent = 'Defend the plaza. Dodge the filling red shapes.';
  enemies.start(wave);
}
function action(key: string): void {
  if (/^[1-6]$/.test(key)) { start(Number(key)); return; }
  if (key === 'r') { start(enemies.wave || 1); return; }
  if (key === 'p') { frozen = !frozen; enemies.setFrozen(frozen); }
  if (key === 't') clock.timeScale = clock.timeScale === 1 ? 0.15 : 1;
  if (key === 'g') god = !god;
  if (key === 'f' || (key === ' ' && enemies.boss?.finalCutReady)) {
    enemies.executeFinalCut(new THREE.Vector3(Math.cos(facing), 0.3, -Math.sin(facing)).normalize());
    return;
  }
  if (key === 'j' || key === 'k') {
    const target = enemies.nearest(player.position, key === 'k' ? 100 : 6);
    if (target) enemies.damage(target, { amount: key === 'k' ? 12 : 1, source: 'slash',
      dir: target.position.clone().sub(player.position).setY(0).normalize() });
  }
  if (key === ' ') {
    const from = player.position.clone();
    const to = from.clone().add(new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).multiplyScalar(9));
    world.arena.clamp(to, player.radius);
    enemies.querySegment(from, to, 1.5, targets);
    for (const target of targets) enemies.damage(target, { amount: 3, source: 'dash', dir: to.clone().sub(from).normalize() });
    player.position.copy(to);
    dashFrames = 0.2;
    ring(to, 1.5, 0x82e8fa);
  }
}
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  if (!event.repeat) action(key);
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-key]')) button.addEventListener('click', () => action(button.dataset.key!));

function step(realDt: number): void {
  clock.realDt = realDt;
  clock.dt = frozen ? 0 : realDt * clock.timeScale;
  clock.time += clock.dt;
  iFrames = Math.max(0, iFrames - clock.dt);
  dashFrames = Math.max(0, dashFrames - clock.dt);
  const x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const z = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  player.velocity.set(x, 0, z).normalize().multiplyScalar(hp > 0 ? 7 : 0);
  if (player.velocity.lengthSq() > 0) facing = Math.atan2(player.velocity.x, player.velocity.z);
  player.position.addScaledVector(player.velocity, clock.dt);
  world.arena.clamp(player.position, player.radius);
  avatar.rotation.y = facing;
  avatar.visible = iFrames <= 0 || Math.floor(iFrames * 14) % 2 === 0;
  enemies.update(clock, player);
  fx.update(clock);
  document.getElementById('hud')!.textContent = `Wave ${enemies.wave}/5 · ${enemies.aliveCount()} alive · HP ${hp}/5${god ? ' GOD' : ''}${frozen ? ' FROZEN' : ''}`
    + (enemies.boss ? ` · Dean ${Math.ceil(enemies.boss.hp)}/120 P${enemies.boss.phase}${enemies.boss.staggered ? ' STAGGER' : ''}` : '');
  document.getElementById('log')!.textContent = records.slice(-4).map((record) => record.type).join(' / ');
}
function resize(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
start(debug.wave ?? 1);
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (params.get('manual') !== '1') step(dt);
  fx.render();
});

declare global {
  interface Window {
    __enemiesDemo: {
      enemies: EnemiesKit; player: PlayerView; ctx: KitContext; records: typeof records;
      start(wave: number): void; action(key: string): void; step(dt: number): void; advance(seconds: number): void;
    };
  }
}
window.__enemiesDemo = {
  enemies, player, ctx, records, start, action, step,
  advance(seconds) { for (let time = 0; time < seconds; time += 1 / 60) step(Math.min(1 / 60, seconds - time)); },
};
