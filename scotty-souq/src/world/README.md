# Souq Waqif world kit

`createWorld(ctx)` implements the existing `WorldKit` contract. Core calls `update(clock)` every frame,
`setMood(...)` on state changes, `breachWall()` on the boss entrance, and `reset()` on restart. Mood and
decoration animation use `clock.realDt`, including during hit-stop. The world does not subscribe to game
events, consume the gameplay RNG, or configure the renderer.

Run from `scotty-souq/`:

```sh
npm ci
npm run dev
```

Open `/demos/world.html?intro=0`. Keys 1 to 5 select moods, B breaches the wall, R resets, G selects the 16 m,
55 degree gameplay camera, O shows the entire plaza, F flies inside the plaza, V toggles arena and
spawn guides, and H hides the demo controls. Pointer drag or touch orbits, and scroll or pinch zooms.
`?intro=0&view=overview` opens the plaza overview directly. The demo includes rendering counters.

For a standalone production demo build:

```sh
npx vite build --config src/world/demo.vite.config.ts
npm run preview
```

This writes `dist/demos/world.html`. The usual core build continues to use `index.html`.

All tunables and mood palettes live in `config.ts`. The walkable circle has radius 18 m. Eight gates
lie at radius 19.5 m, at `22.5 + 45 * id` degrees, with inward radial unit vectors. The boss breach is
`(0, 0, -21.5)`, facing +Z. Raised shop props and supports stay outside the circle. The centre inlay and
shop carpets are flat, and the world adds no prop colliders.

Static architecture is merged by material. Beams, awnings, sacks, baskets, lanterns, trunks, crowns,
wall chunks and dust use instancing. There is one 1024 px shadow-casting sun, three non-shadow lantern
point lights and one breach point light, plus a non-shadow Final Cut spotlight. Lantern glass supplies
the remaining glow, with no bloom dependency. Textures are optional, with full colour fallbacks and
private samplers that leave Assets-owned textures unchanged.

The factory is intended to run once per scene, followed by `reset()` for each run. `WorldKit` has no
disposal method. This kit deliberately leaves post-processing and renderer shadow enablement to core/FX.
