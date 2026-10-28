import * as THREE from 'three';
import type { KitContext, WorldKit } from '../core/contracts';
import { buildArena } from './Arena';
import { createBreach } from './Breach';
import { createLighting } from './Lighting';
import { createMaterials } from './Materials';

export function createWorld(ctx: KitContext): WorldKit {
  const root = new THREE.Group();
  root.name = 'Souq Waqif world';
  ctx.scene.add(root);
  const materials = createMaterials(ctx);
  const scenery = buildArena(root, materials);
  const lighting = createLighting(ctx, root, materials);
  const breach = createBreach(root, materials);
  let realTime = 0;
  return {
    arena: scenery.arena,
    update(clock) {
      const dt = Math.max(0, clock.realDt);
      realTime += dt;
      scenery.update(realTime);
      lighting.update(dt, realTime);
      breach.update(dt);
    },
    setMood(mood) { lighting.setMood(mood); },
    breachWall() { breach.breach(); },
    reset() {
      realTime = 0;
      breach.reset();
      lighting.reset();
      scenery.update(0);
    },
  };
}
