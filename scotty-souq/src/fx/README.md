# FX integration

`createFx(ctx)` implements the existing `FxKit` contract. Call `update(clock)` once per frame and `render()` instead of `renderer.render`. Call `resize(cssWidth, cssHeight, rendererDpr)` after the renderer and camera resize. The composer caps its DPR at 2 and owns the render, bloom, final look, and output passes. FX enables local clipping on the shared renderer.

## Effect ownership

| Trigger | FX listens and produces | Caller should do |
| --- | --- | --- |
| `enemy:hit` | Small petal burst, gold/pink impact sparks, damage text | Emit once per applied hit. No duplicate number or hit burst. |
| `enemy:killed` | Additional death petals | Emit once per kill. Call `splitObject` for the actual cut when desired. |
| `dash:start` | Petals distributed along the segment, followed by a moving stream | Call `beginTrail('dash')`, push blade tip/base, then `end()`. |
| `finisher:start` / `finisher:end` | Slow-motion look on/off and a large start burst | Core owns time scale and camera. Call victim splits at impact. |
| `boss:slam` | Shockwave, dust ring, sandstone debris | Emit the event once. No duplicate slam ring or debris. |
| `player:hurt` | Red flash and red damage text | Emit once. No duplicate hurt flash/number. |
| `combo:tier` | `xN!` popup at the camera ground target | Emit the event once. |
| `finalcut:impact` | White flash, huge petal storm, sparks | Call the giant trail and boss split separately. |
| `boss:defeated` | Victory confetti petals | Emit once. |

Imperative only: `slashArc`, `beginTrail`/`push`/`end`, `splitObject`, letterbox, desaturation, and cinematic look outside the finisher events. `player:slash`, `dash:end`, `boss:hit`, `finalcut:ready`, and `finalcut:start` intentionally have no FX listener. Core controls the Final Cut's letterbox and desaturation, including restoring them afterwards.

All primitive methods remain callable for bespoke effects. Do not repeat the event-owned reactions above through those methods. A split intentionally adds its own cut petals on top of the kill/finisher reactions. `splitObject` copies the current pose and world transform, including nested/skinned GLB hierarchies. The caller must hide or remove the original. Shared original geometry and textures are never disposed. Only cloned materials and skeleton bone textures are released after the halves fade. The cut is clipped, with a luminous cross-section flash rather than generated cap polygons.

The `player:hurt` event has HP but no damage amount. FX derives damage from the previous HP, assumes full HP after `reset`, and displays at least 1. A future healing mechanic should add an explicit damage amount or HP-sync event. Combo events have no position, so the popup uses the camera's ground target.

## Timing and budgets

Particles, trails, shockwaves, debris and split motion use scaled `clock.dt`, including hit-stop. Damage text, flash, look transitions and letterbox use `clock.realDt`. No FX changes the gameplay time scale. `reset()` clears transient FX and restores the ambient field and neutral post look without adding event listeners.

Petals: one instanced quad draw, at most 1500 instances, including 180 ambient petals. Coarse-pointer or low-core/memory devices start at 900 / 110. Sustained frame time over 1/43 second for four seconds after warmup lowers the budget, to 550 / 65 at the lowest tier. Bloom's input dimensions scale to half on mobile and one third at the lowest tier, before UnrealBloomPass's own half-resolution first mip. Full-resolution colour and the final pass remain crisp. Quality decreases only, avoiding oscillation and repeated target reallocations.

Sparks: one instanced draw, 240 slots. Debris: one instanced draw, 160 slots. Damage text: one atlas and one batched billboard draw, 48 popups with up to 8 glyphs each. Trails: 12 reusable dynamic ribbon geometries, 40 samples with Catmull-Rom subdivision. Arcs: 16 reusable strips. Shockwave/dust rings: 12 slots. Splits: 8 pairs of pooled pivots; arbitrary GLB clone/material allocations happen only when a split is requested. Particle updates allocate no temporary vectors, matrices, arrays, or objects. Trail handles allocate a small lease on begin to reject stale writes after reuse. Saturated trails skip the new ribbon; other particle pools recycle slots.

Bloom uses a 1.18 linear luminance threshold: ordinary surfaces stay sharp, while HDR trails, emissive lanterns, sparks, cut flashes and white petal highlights glow. The manifest petal alpha texture loads asynchronously; a procedural shape renders immediately and remains available if loading fails. Shared loaded textures stay owned by Assets.

## Demo

Run `npm run dev`, then open `/demos/fx.html?intro=0`. Buttons and displayed keys cover every effect, all three moving sword ribbons, box/sphere/model splits, slow motion, flash, letterbox and desaturation. A self-contained nested mascot is exported to GLB and loaded through GLTFLoader under a rotated, nonuniformly scaled parent. This exercises the real loader without requesting missing optional model files. Use `?intro=0&model=beaver` to try the manifest model. `window.__fxDemo` exposes the kit, actions, renderer and scene for smoke testing. The existing Vite production entry remains unchanged; the demo is a development harness.

`src/fx/smoke.mjs` accepts `PLAYWRIGHT_MODULE` (module name or file URL), `CHROME_PATH`, and `FX_URL` (bare demo URL). With the dev server on port 5187, run `PLAYWRIGHT_MODULE=file:///path/to/playwright/index.mjs node src/fx/smoke.mjs`. It checks every button in desktop Chrome, mobile layout and initial quality, the real beaver GLB split, exact inherited transforms, material disposal, source resource preservation, hit-stop versus real-time text, stale trail leases, and automatic quality reduction. It captures overview, Final Cut and mobile PNGs in `/tmp/scotty-fx-*.png` and rejects browser console errors. The generated beaver tested at 12,427 triangles. Mobile 60 fps remains a hardware target, not a claim based on software-rendered headless Chrome.
