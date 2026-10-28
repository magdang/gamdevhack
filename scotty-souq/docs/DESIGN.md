# Scotty: Defend Souq Waqif — Design & Architecture Contract

This file is the contract every contributor (human or agent) follows. Read it fully before editing code.
If you need to change the contract, say so in your hand-off summary instead of silently diverging.

## 1. Pitch

A 3D arcade action game for phone and desktop browsers. You are **Scotty**, the CMU Scottie dog (black,
red tartan scarf, glowing sword), alone in the central plaza of **Souq Waqif, Doha**. Waves of rival
university mascots pour in from every alley. Drag to move; Scotty slashes nearby enemies automatically;
swipe to dash straight through a whole line of them, leaving a glowing sword trail, with a slow-motion
finisher. Enemies telegraph strikes from all sides, so you dodge and keep the combo alive while petals fly
everywhere. After wave 5 the boss, **DEAN TRICK** — a giant floating face swinging a spiked club — bursts
through the souq wall. Bring him low, then swipe for the huge **FINAL CUT**.

Tone: playful campus rivalry, juicy and readable. Art: stylized cartoon 3D, warm golden-hour Doha palette
(sandstone, lavender-pink sky, lantern gold), black Scotty silhouette always readable against the ground.

## 2. Tech

- `scotty-souq/` is a standalone Vite + TypeScript (strict) + `three` app. No UI framework; HUD is DOM over
  the canvas. No physics engine: gameplay lives on the XZ plane with circle/segment math.
- Scripts: `npm run dev`, `npm run build` (`tsc --noEmit && vite build`), `npm run typecheck`,
  `npm run smoke` (headless browser smoke test, see §9).
- Performance budget: 60 fps on a mid-range phone. ≤ 40 live enemies, instanced petals (≤ 1500),
  one shadow-casting light, DPR capped at 2, GLBs ≤ ~15k triangles each.
- Units: 1 unit = 1 metre. Y up. Arena centre is the origin.

## 3. Controls

| Input | Touch | Mouse / keyboard |
| --- | --- | --- |
| Move | Press and drag anywhere: floating virtual joystick (origin = press point, max radius 70 px). | Hold left mouse + drag (same joystick), or WASD / arrows. |
| Auto-slash | Automatic. | Automatic. |
| Dash | Swipe: release within 250 ms of press after moving ≥ 50 px. Direction = swipe vector mapped through camera yaw. | Space or right-click: dash toward the mouse cursor (or move direction). |
| Final Cut | Swipe across the boss when prompted. | Space / click when prompted. |
| Pause | Pause button. | Esc / P. |

Swipe vs drag: a gesture is a swipe only if it is short and fast; holding turns it into a joystick drag.

## 4. Core mechanics (tunables live in `src/core/config.ts`)

- **Player**: 5 hearts, move speed 7 m/s, collision radius 0.6. On hit: −1 heart, knockback, combo reset,
  1.0 s invulnerability (blink).
- **Auto-slash**: every 0.32 s, if any enemy is within 2.6 m, Scotty turns to the nearest and slashes a
  150° arc (radius 2.8 m) for 1 damage to everything in the arc. Alternate left/right swings. Sword trail
  arc + petals on every hit. Slash interval shortens with combo tier.
- **Dash**: 9 m straight line in 0.16 s, invulnerable during dash, cooldown 0.8 s. Deals 3 damage to every
  enemy within 1.5 m of the dash segment ("line cut"). Leaves a glowing ribbon sword trail (additive,
  blooms). Hits along the line resolve in order with a tiny stagger.
- **Slow-motion finisher**: triggers when a dash kills ≥ 3 enemies or kills the last enemy of a wave. Time
  scale 0.12 for 0.55 s of real time, camera punch-zoom, white edge flash, then the cut lands: victims split
  in two and burst into petals; time eases back to 1.
- **Hit-stop**: 40–70 ms freeze on solid hits (not stacking beyond 120 ms).
- **Combo**: +1 per enemy hit; resets on taking damage or after 2.5 s without a hit. Tiers at 10 / 25 / 50
  give score multipliers x2 / x3 / x5 and faster slashes. HUD shows count + decay bar.
- **Dodging**: every enemy strike is telegraphed with a ground decal (circle, arc, or line) that fills over
  0.5–1.0 s before it hits. Leave the shape or dash through it (i-frames).
- **Petals**: ambient drifting bougainvillea (magenta/pink) and jasmine (white) petals at all times; bursts
  on hits and kills; huge bursts on finishers and the Final Cut; a petal stream follows dashes.

## 5. Enemies (university mascots)

All enemies share one state machine: `spawn → approach → telegraph → strike → recover → (hurt) → die`.
They enter through the spawn gates around the arena (every side). Each type has a colour identity.

| id | Mascot | Role | HP | Attack (telegraph) |
| --- | --- | --- | --- | --- |
| `beaver` | MIT Beaver | grunt | 3 | tail slam, small circle |
| `tree` | Stanford Tree | slow tank | 8 | branch sweep, wide 200° arc |
| `bear` | Berkeley Golden Bear | bruiser | 6 | charging lunge, long line |
| `collie` | Texas A&M Collie | fast pack skirmisher | 2 | quick bite, small cone |
| `wasp` | Georgia Tech Yellow Jacket | ranged hover | 3 | stinger projectile, line + travelling dart |
| `tiger` | Princeton Tiger | leaper | 5 | pounce, landing circle |

Waves (WaveDirector): 1 beavers · 2 beavers + collies · 3 + trees + wasps · 4 + bears · 5 everything incl.
tigers, then **boss**. Between waves: 2.5 s breather + wave banner. Enemies spawn in groups from 2–3
random gates so pressure comes from every side.

## 6. Boss: DEAN TRICK

A giant floating cartoon dean's face (~4 m tall, glasses, mortarboard) wielding a huge spiked club.
- **Entrance**: after wave 5, the camera pulls back, the far souq wall bursts (debris + dust + shake), title
  card "DEAN TRICK — FINAL EXAM", boss HP bar slides in.
- **Attacks**: overhead club slam (big circle + shockwave ring), horizontal club sweep (wide arc), face
  charge across the arena (line), summon 3–5 mascots (from phase 2). After a slam the club sticks for
  1.5 s: stagger window, takes double damage.
- **HP** 120 (dash = 3, slash = 1, staggered x2). Phase 2 at 50 % HP: faster, summons minions.
- **Final Cut**: at ≤ 8 % HP the boss is stunned, the world desaturates, a "SWIPE!" prompt appears. The
  player's swipe triggers a scripted cinematic: letterbox bars, time scale ~0.05, camera orbit, Scotty
  dashes across the screen leaving a giant glowing trail, white flash, the face splits along the cut, an
  enormous petal explosion, then VICTORY.

## 7. Game flow

`title → playing(wave n) → bossIntro → bossFight → finalCut → victory` and `→ gameOver` from any combat
state. Title screen shows key art, "Tap to start", and the controls. Game-over and victory screens show
score, best combo, waves cleared, and Restart.

Debug URL params (keep them working): `?wave=N` start at wave N (6 = boss), `?god=1` invulnerable,
`?seed=N` deterministic RNG, `?fps=1` stats overlay, `?mute=1`.
`window.__game` exposes `{ state, wave, player: {hp, position}, enemies: count, boss: {hp} , combo, score }`
for smoke tests.

## 8. Architecture and file ownership

```
scotty-souq/
  index.html, package.json, tsconfig.json, vite.config.ts
  public/assets/ui/…                copied from ../Game Jam/assets/ui
  public/assets/gen/                Higgsfield-generated assets — ORCHESTRATOR ONLY, never edit
     models/*.glb  textures/*.png  audio/*.mp3  ui/*.png  concepts/*.png
  src/main.ts                       boot
  src/core/Game.ts                  main loop, state machine, systems wiring
  src/core/Time.ts                  real vs scaled dt, hit-stop, slow-mo requests (priority-based)
  src/core/Events.ts                typed event bus (append-only event map)
  src/core/Assets.ts                loads src/core/manifest.ts; GLB normalisation; primitive fallbacks
  src/core/manifest.ts              asset keys → paths, target heights, yaw offsets
  src/core/Input.ts                 joystick + swipe + keyboard/mouse → intents
  src/core/CameraRig.ts             follow, shake, punch-zoom, cinematic overrides
  src/core/config.ts                all gameplay tunables
  src/core/rng.ts, src/core/math.ts
  src/world/Arena.ts                Souq Waqif plaza, bounds, spawn gates, props
  src/world/Lighting.ts             sky, fog, sun, lanterns
  src/player/Player.ts              movement, hp, i-frames, model + procedural animation, sword
  src/combat/AutoSlash.ts  Dash.ts  Combo.ts  Damage.ts
  src/enemies/Enemy.ts              base class + state machine
  src/enemies/types/*.ts            one file per mascot
  src/enemies/Telegraph.ts          ground decals
  src/enemies/Projectiles.ts
  src/waves/WaveDirector.ts
  src/boss/DeanBoss.ts  src/boss/FinalCut.ts
  src/fx/Petals.ts  SwordTrail.ts  Post.ts  DamageText.ts  Debris.ts
  src/ui/Hud.ts  Screens.ts  styles.css
  src/audio/Audio.ts
  scripts/smoke.mjs                 headless smoke test
```

Systems talk through `Events` (e.g. `enemy:hit`, `enemy:killed`, `player:hurt`, `dash:start`,
`dash:end`, `finisher:start`, `wave:start`, `wave:cleared`, `boss:intro`, `boss:phase`, `boss:defeated`,
`finalcut:ready`, `finalcut:start`, `combo:changed`, `game:state`). UI and audio must only *listen*.

**Parallel-work rules** (phase 2): each workstream owns the paths listed in its brief. Outside your paths
you may only (a) append new event types to `src/core/Events.ts`, (b) add keys to *your own section* of
`src/core/config.ts`, (c) add manifest entries. Anything else you need from another owner: implement a
minimal local adapter and list the request in your hand-off summary.

### 8.1 Parallel workstreams (supersedes the single-config and file-ownership notes above)

The binding interfaces are `src/core/contracts.ts` (kit interfaces) and `src/core/Events.ts` (event map).
Each kit is created only through its factory (`createWorld`, `createFx`, `createEnemies`, `createUi`,
`createAudio`) and keeps its own tunables in `src/<kit>/config.ts`.

| Workstream | Owns |
| --- | --- |
| Core | `src/core/**` (except the append-only contracts), `src/player/**`, `src/combat/**`, `src/main.ts`, `index.html`, `scripts/**` |
| Enemies | `src/enemies/**`, `src/waves/**`, `src/boss/**` |
| World | `src/world/**` |
| FX | `src/fx/**` |
| UI + Audio | `src/ui/**`, `src/audio/**` |

Each workstream also owns `demos/<name>.html` + `src/<kit>/demo.ts`, a standalone harness with fakes for
the other kits. Concept art lives in `art/concepts/` (not shipped).

## 9. Assets and models

- Generated GLBs are unrigged. Animate them procedurally: bob, squash/stretch, lean into movement, wind-up
  and strike rotations, hurt flash (emissive pulse), death split. Normalise every GLB on load: centre on
  XZ, feet at y=0, scale to the manifest's target height, apply the manifest yaw offset so the model faces
  +Z.
- Every asset has a primitive fallback (coloured capsules/boxes) so the game runs without the files.
- Scotty's sword is a procedural mesh (curved blade, emissive edge) attached to the model, not part of the
  GLB. The boss club is procedural too (handle + spiked head).

## 10. Definition of done (each workstream)

`npm run typecheck`, `npm run build` and `npm run smoke` pass; no console errors; the game plays end to end
from title to victory with `?god=1`; commits are small and descriptive; your hand-off lists what you
built, how you verified it, open issues, and the branch + head SHA.
