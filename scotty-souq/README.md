# Scotty: Defend Souq Waqif

A mobile-first 3D arcade game built with Vite, strict TypeScript and Three.js r186.

## Run

```sh
cd scotty-souq
npm ci
npm run dev
```

Open the URL Vite prints. The portal intro leads into the title screen. Add `?intro=0` to go directly to the 3D title. Missing GLBs use primitive fallbacks immediately. Models added under the manifest paths are discovered by Vite and included in the next build without code changes.

```sh
npm run typecheck
npm run build
npm run preview
npx playwright install chromium
npm run smoke
```

If npm reports a cache EPERM, run `export npm_config_cache="$TMPDIR/npm-cache"` and retry. Smoke builds the app, starts its own preview server on a free port, and runs Chromium with SwiftShader. Screenshots and `report.json` go into the gitignored `.smoke/` folder. Console errors and uncaught browser exceptions fail the run. Smoke automatically uses the fake kit while the enemies factory is a stub. Use `npm run smoke -- --real` after integrating production kits, or `npm run smoke -- --fake` to force the harness.

## Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Move | Hold and drag the floating joystick | WASD, arrows, or hold left mouse and drag |
| Dash | Release a swipe of at least 50 px within 250 ms | Space or right-click toward the cursor; movement direction is the fallback |
| Slash | Automatic when a target is nearby | Automatic |
| Final Cut | Swipe or tap when prompted | Space or click when prompted |
| Pause | UI pause button | Escape or P |

Only the first touch controls the joystick. Holding a drag longer than 250 ms does not dash. Switching tabs pauses combat; resume explicitly when returning. Audio unlocks on the first pointer or keyboard gesture after the 3D game starts.

## Debug

All development and testing links should include `intro=0`.

| Parameter | Effect |
| --- | --- |
| `intro=0` | Skip the teammate-owned portal intro |
| `wave=N` | Start at wave 1 through 5, or 6 for Dean Trick |
| `god=1` | Ignore player damage |
| `seed=N` | Seed shared kit randomness |
| `fps=1` | FPS, draw calls and time-scale overlay |
| `mute=1` | Start muted |
| `autoplay=1` | Bot uses ordinary movement, dash and Final Cut intents |
| `fake=1` | Use pooled dummy enemies and a fake boss, independent of the enemies workstream |

Examples: `/?intro=0&fake=1&autoplay=1&god=1`, `/?intro=0&fake=1&wave=6&autoplay=1&god=1`.

`window.__game` exposes state, paused, wave, player HP/position, enemy count, boss HP, combo, score and scaled time. It also exposes counters, state history, renderer allocation counts, `events`, `start()`, `restart()`, `pause()`, `resume()` and `dash(x,z)` for testing. The core-only development harness is `/demos/core.html?intro=0&fake=1` on the Vite dev server.

## Folder map and integration

| Folder | Responsibility |
| --- | --- |
| `src/core` | Factories, game loop, time, input, camera, assets, contracts and debug |
| `src/core/testing` | Fake enemies, autoplay bot and fallback overlay for a stub UI |
| `src/player` | Scotty movement, damage, sword and procedural animation |
| `src/combat` | Slash, dash, combo/score, finishers and cinematic Final Cut |
| `src/world` | Arena, lighting, mood and wall breach kit |
| `src/enemies`, `src/waves`, `src/boss` | Enemy AI, wave progression and boss kit |
| `src/fx` | Trails, petals, screen effects and final frame rendering |
| `src/ui`, `src/audio` | HUD/screens, UI intents and audio listeners |
| `src/intro` | Teammate-owned portal intro |
| `public/assets/gen` | Read-only generated models, textures, audio and artwork |
| `scripts`, `demos` | Headless verification and isolated development harnesses |

Core creates the world, FX, enemies, UI and audio only through their factories. The enemies factory receives `{world, fx}`; every kit receives the same scene, camera, renderer, event bus, assets, seeded RNG, debug flags and UI root. Each frame supplies one reusable clock and HUD snapshot, then calls `fx.render()`.

Enemies own wave progression and emit `boss:intro`, `boss:spawned`, `finalcut:ready` and `boss:defeated`. Core queries arcs and sorted segments and applies damage using the public kit methods. During the Final Cut, AI is frozen, the camera orbits on real time, core calls `executeFinalCut(dir)` at impact, and victory waits for `boss:defeated` and cinematic recovery. Boss death presentation should continue while AI is frozen, using `clock.realDt`; if deferred until unfreezing, core also supports that.

UI emits `ui:start`, `ui:restart`, `ui:pause`, `ui:resume` and `ui:toggleMute`. Core emits game state, pause, run summaries, player/combat, combo and score events. FX owns final rendering and responds to direct effect calls. Core handles time and camera requests emitted by any kit. Restart reuses all systems and calls each kit's reset hook; audio reset is optional and preserves mute/unlock state. Core's fallback overlay is a sibling of the UI root and hides when real UI elements exist.

The only additions to shared interfaces are optional `DebugFlags.fake` and optional `AudioKit.reset()`. No existing event payloads or factory signatures changed. Full mechanics and ownership are recorded in `docs/DESIGN.md`.
