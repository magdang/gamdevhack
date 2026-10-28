// Portal intro: the jam's 2D starter (Scotty walking through Doha / Education City) rebuilt on a canvas.
// After a short stroll a portal tears open ahead; walking into it pulls Scotty in, flashes white and
// hands over to the 3D souq game. Self-contained: no three.js, no dependency on the rest of the game.
//
// Usage (src/main.ts):
//   import { playPortalIntro } from './intro/PortalIntro';
//   await playPortalIntro({ onEnterPortal: () => startGame() });   // skip with ?intro=0

const BASE = `${import.meta.env.BASE_URL}assets/intro/`;

// Starter tunables, in the starter's 1280x720 logical space.
const VIEW_H = 720;
const ART_SCALE = VIEW_H / 1080;              // background art is 1920x1080
const GROUND_Y = 906 * ART_SCALE;             // top of the walkway in the art
const SPRITE_SIZE = 256 * ART_SCALE;          // frames are 256x256, feet at y=230
const SPRITE_FEET_Y = 230 * ART_SCALE;
const WALK_SPEED = 220;
const RUN_SPEED = 420;
const JUMP_VELOCITY = -720;
const GRAVITY = 2000;

// Portal pacing.
const PORTAL_AFTER_SECONDS = 5;               // portal opens after this long ...
const PORTAL_AFTER_DISTANCE = 1400;           // ... or this far walked, whichever comes first
const PORTAL_AHEAD = 520;                     // spawn distance in front of Scotty
const PORTAL_RADIUS = 110;
const PORTAL_OPEN_TIME = 0.9;
const SUCK_TIME = 0.9;                        // Scotty spirals into the portal
const FLASH_IN = 0.35;                        // fade to white
const FLASH_OUT = 0.6;                        // white fades away over the new game

const LAYERS: Array<[string, number]> = [
  ['01_sky.png', 0],
  ['02_doha_skyline.png', 0.1],
  ['03_education_city.png', 0.35],
  ['04_ground.png', 1],
];

type AnimName = 'idle' | 'walking' | 'running' | 'jumping';
const ANIMS: Record<AnimName, { count: number; fps: number; loop: boolean }> = {
  idle: { count: 6, fps: 8, loop: true },
  walking: { count: 8, fps: 12, loop: true },
  running: { count: 6, fps: 14, loop: true },
  jumping: { count: 7, fps: 14, loop: false },
};

type Phase = 'stroll' | 'portalOpening' | 'portalOpen' | 'sucked' | 'flash' | 'done';

export interface PortalIntroOptions {
  /** Called at peak white, when the 3D game should start underneath the fading flash. */
  onEnterPortal?: () => void;
  /** Element to cover; defaults to document.body. */
  parent?: HTMLElement;
}

/** True unless the URL has ?intro=0 (debug: skip straight to the game). */
export function introEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('intro') !== '0';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`PortalIntro: failed to load ${src}`));
    img.src = src;
  });
}

async function loadAssets() {
  const layers = await Promise.all(
    LAYERS.map(async ([file, factor]) => ({ img: await loadImage(`${BASE}bg/${file}`), factor })),
  );
  const frames = {} as Record<AnimName, HTMLImageElement[]>;
  await Promise.all(
    (Object.keys(ANIMS) as AnimName[]).map(async (name) => {
      const list: Promise<HTMLImageElement>[] = [];
      for (let i = 1; i <= ANIMS[name].count; i++) {
        list.push(loadImage(`${BASE}scotty/${name}/${name}_${String(i).padStart(2, '0')}.png`));
      }
      frames[name] = await Promise.all(list);
    }),
  );
  return { layers, frames };
}

export async function playPortalIntro(opts: PortalIntroOptions = {}): Promise<void> {
  if (!introEnabled()) {
    opts.onEnterPortal?.();
    return;
  }
  const parent = opts.parent ?? document.body;

  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;inset:0;z-index:1000;background:#f6d9c8;touch-action:none;user-select:none;-webkit-user-select:none;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  const skip = document.createElement('button');
  skip.textContent = 'Skip ▸';
  skip.style.cssText =
    'position:absolute;right:16px;top:16px;padding:8px 14px;border:0;border-radius:999px;' +
    'background:rgba(40,20,50,.55);color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer;';
  root.append(canvas, skip);
  parent.append(root);

  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) throw new Error('PortalIntro: 2D canvas unavailable');
  const ctx: CanvasRenderingContext2D = ctxOrNull;

  let assets: Awaited<ReturnType<typeof loadAssets>>;
  try {
    assets = await loadAssets();
  } catch (err) {
    console.warn(err);
    root.remove();
    opts.onEnterPortal?.();
    return;
  }
  const { layers, frames } = assets;

  // ---- sizing: logical height is always 720, width follows the aspect ratio
  let scale = 1;
  let viewW = 1280;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(root.clientWidth * dpr);
    canvas.height = Math.round(root.clientHeight * dpr);
    scale = canvas.height / VIEW_H;
    viewW = canvas.width / scale;
  };
  resize();
  window.addEventListener('resize', resize);

  // ---- input: keyboard like the starter, touch = hold right/left half, tap upper half to jump
  const keys = new Set<string>();
  let jumpQueued = false;
  let touchDir = 0;
  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
      jumpQueued = true;
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onPointer = (e: PointerEvent) => {
    if (e.target === skip) return;
    if (e.type === 'pointerdown') {
      const rect = root.getBoundingClientRect();
      if (e.clientY - rect.top < rect.height * 0.5) jumpQueued = true;
      touchDir = e.clientX - rect.left < rect.width * 0.35 ? -1 : 1;
    } else {
      touchDir = 0;
    }
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  root.addEventListener('pointerdown', onPointer);
  window.addEventListener('pointerup', onPointer);
  window.addEventListener('pointercancel', onPointer);

  // ---- state
  const scotty = { x: 0, y: GROUND_Y, vy: 0, onGround: true, facingRight: true, spin: 0, size: 1 };
  let anim: AnimName = 'idle';
  let animTime = 0;
  let cameraX = -viewW / 2;
  let phase: Phase = 'stroll';
  let phaseTime = 0;
  let totalTime = 0;
  let portalX = 0;
  let portalOpen = 0; // 0..1
  let flash = 0; // 0..1 white overlay
  let entered = false;
  let skipped = false;
  skip.onclick = () => {
    skipped = true;
  };

  const setPhase = (p: Phase) => {
    phase = p;
    phaseTime = 0;
  };
  const playAnim = (name: AnimName) => {
    if (name !== anim) {
      anim = name;
      animTime = 0;
    }
  };

  const update = (dt: number) => {
    totalTime += dt;
    phaseTime += dt;

    if (skipped && phase !== 'flash' && phase !== 'done') setPhase('flash');

    const controllable = phase === 'stroll' || phase === 'portalOpening' || phase === 'portalOpen';
    let dir = 0;
    let running = false;
    if (controllable) {
      const left = keys.has('ArrowLeft') || keys.has('KeyA');
      const right = keys.has('ArrowRight') || keys.has('KeyD');
      dir = (right ? 1 : 0) - (left ? 1 : 0) || touchDir;
      running = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchDir !== 0;
      if (jumpQueued && scotty.onGround) {
        scotty.vy = JUMP_VELOCITY;
        scotty.onGround = false;
      }
    }
    jumpQueued = false;

    if (controllable) {
      scotty.x += dir * (running ? RUN_SPEED : WALK_SPEED) * dt;
      if (dir) scotty.facingRight = dir > 0;
    }
    if (!scotty.onGround) {
      scotty.vy += GRAVITY * dt;
      scotty.y += scotty.vy * dt;
      if (scotty.y >= GROUND_Y) {
        scotty.y = GROUND_Y;
        scotty.vy = 0;
        scotty.onGround = true;
      }
    }

    // animation choice (jump frames follow the arc, as in the starter)
    if (!scotty.onGround) {
      playAnim('jumping');
      const n = ANIMS.jumping.count;
      const t = (scotty.vy - JUMP_VELOCITY) / (-2 * JUMP_VELOCITY);
      animTime = Math.max(0, Math.min(n - 1, t * n)) / ANIMS.jumping.fps;
    } else {
      playAnim(phase === 'sucked' ? 'jumping' : dir ? (running ? 'running' : 'walking') : 'idle');
      animTime += dt;
    }

    // story beats
    if (phase === 'stroll' && (totalTime > PORTAL_AFTER_SECONDS || Math.abs(scotty.x) > PORTAL_AFTER_DISTANCE)) {
      portalX = scotty.x + (scotty.facingRight ? PORTAL_AHEAD : -PORTAL_AHEAD);
      setPhase('portalOpening');
    }
    if (phase === 'portalOpening') {
      portalOpen = Math.min(1, phaseTime / PORTAL_OPEN_TIME);
      if (portalOpen >= 1) setPhase('portalOpen');
    }
    const portalCY = GROUND_Y - PORTAL_RADIUS * 1.05;
    if ((phase === 'portalOpen' || phase === 'portalOpening') && portalOpen > 0.6) {
      const dx = scotty.x - portalX;
      const dy = scotty.y - SPRITE_SIZE * 0.3 - portalCY;
      if (Math.hypot(dx, dy) < PORTAL_RADIUS * 0.8) setPhase('sucked');
    }
    if (phase === 'sucked') {
      const t = Math.min(1, phaseTime / SUCK_TIME);
      const ease = t * t;
      scotty.x += (portalX - scotty.x) * Math.min(1, dt * 8);
      scotty.y += (portalCY + SPRITE_SIZE * 0.3 - scotty.y) * Math.min(1, dt * 8);
      scotty.onGround = true;
      scotty.vy = 0;
      scotty.spin += dt * (6 + 30 * ease);
      scotty.size = 1 - ease;
      portalOpen = 1 + ease * 0.6;
      flash = Math.max(0, (t - 0.6) / 0.4) * 0.8;
      if (t >= 1) setPhase('flash');
    }
    if (phase === 'flash') {
      flash = Math.min(1, flash + dt / FLASH_IN);
      if (flash >= 1) {
        if (!entered) {
          entered = true;
          opts.onEnterPortal?.();
        }
        root.style.transition = `opacity ${FLASH_OUT}s ease-out`;
        canvas.style.visibility = 'hidden';
        skip.style.display = 'none';
        root.style.background = '#fff';
        requestAnimationFrame(() => (root.style.opacity = '0'));
        setPhase('done');
      }
    }

    // camera: dead zone in the middle third, like the starter
    const leftEdge = cameraX + viewW * 0.35;
    const rightEdge = cameraX + viewW * 0.65;
    if (scotty.x < leftEdge) cameraX -= leftEdge - scotty.x;
    else if (scotty.x > rightEdge) cameraX += scotty.x - rightEdge;
  };

  const drawPortal = (cx: number, cy: number, open: number) => {
    const r = PORTAL_RADIUS * Math.min(open, 1.6);
    if (r <= 1) return;
    ctx.save();
    ctx.translate(cx, cy);
    // outer glow
    const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.8);
    glow.addColorStop(0, 'rgba(255,220,140,0.55)');
    glow.addColorStop(0.5, 'rgba(220,90,200,0.25)');
    glow.addColorStop(1, 'rgba(220,90,200,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.8, r * 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // vortex core
    ctx.scale(0.8, 1);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.25, '#ffd98a');
    core.addColorStop(0.6, '#b04ad8');
    core.addColorStop(1, '#3a0f5c');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // spinning arcs
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = totalTime * (2.4 + i * 0.35) + i * 0.9;
      const rr = r * (0.3 + i * 0.1);
      ctx.strokeStyle = i % 2 ? 'rgba(255,230,170,0.9)' : 'rgba(255,140,230,0.85)';
      ctx.lineWidth = Math.max(1.5, r * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, rr, a, a + Math.PI * 0.9);
      ctx.stroke();
    }
    // rim
    ctx.strokeStyle = 'rgba(255,240,200,0.95)';
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // sparks
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4 + totalTime * 1.7;
      const d = r * (1.1 + ((totalTime * 0.8 + i * 0.37) % 1) * 0.9);
      ctx.fillStyle = i % 3 ? 'rgba(255,220,150,0.9)' : 'rgba(255,150,230,0.9)';
      ctx.fillRect(cx + Math.cos(a) * d * 0.8 - 2, cy + Math.sin(a) * d - 2, 4, 4);
    }
  };

  const draw = () => {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, viewW, VIEW_H);

    for (const { img, factor } of layers) {
      const w = img.width * ART_SCALE;
      const h = img.height * ART_SCALE;
      let offset = (-cameraX * factor) % w;
      if (offset > 0) offset -= w;
      for (let x = offset; x < viewW; x += w) ctx.drawImage(img, x, 0, w + 1, h);
    }

    const portalCY = GROUND_Y - PORTAL_RADIUS * 1.05;
    if (phase !== 'stroll') drawPortal(portalX - cameraX, portalCY, portalOpen);

    if (scotty.size > 0.01) {
      const list = frames[anim];
      const spec = ANIMS[anim];
      let idx = Math.max(0, Math.floor(animTime * spec.fps));
      idx = spec.loop ? idx % list.length : Math.min(idx, list.length - 1);
      const img = list[idx];
      ctx.save();
      ctx.translate(scotty.x - cameraX, scotty.y - SPRITE_FEET_Y + SPRITE_SIZE / 2);
      ctx.rotate(scotty.spin);
      ctx.scale((scotty.facingRight ? 1 : -1) * scotty.size, scotty.size);
      ctx.drawImage(img, -SPRITE_SIZE / 2, -SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE);
      ctx.restore();
    }

    // captions
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    let caption = '';
    if (phase === 'stroll') caption = 'A/D or ← → to walk · Shift to run · Space to jump';
    else if (phase === 'portalOpening' || phase === 'portalOpen') caption = 'A portal to Souq Waqif?! Jump in, Scotty!';
    if (caption) {
      ctx.fillStyle = 'rgba(40,20,50,0.55)';
      const w = ctx.measureText(caption).width + 36;
      ctx.beginPath();
      ctx.roundRect(viewW / 2 - w / 2, 22, w, 40, 20);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(caption, viewW / 2, 50);
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, viewW, VIEW_H);
    }
  };

  return new Promise<void>((resolve) => {
    let last = performance.now();
    let doneAt = 0;
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20)); // rAF time can precede `last`
      last = now;
      if (phase !== 'done') {
        update(dt);
        draw();
      } else if (!doneAt) {
        doneAt = now;
      } else if (now - doneAt > FLASH_OUT * 1000 + 50) {
        window.removeEventListener('resize', resize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('pointerup', onPointer);
        window.removeEventListener('pointercancel', onPointer);
        root.remove();
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
