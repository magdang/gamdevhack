// STUB — owned by the World workstream, which replaces this file. Keep the factory signature.
import * as THREE from 'three';
import type { ArenaInfo, KitContext, WorldKit } from '../core/contracts';

export function createWorld(ctx: KitContext): WorldKit {
  const radius = 18;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(radius + 4, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xe8c9a0 }),
  );
  floor.receiveShadow = true;
  ctx.scene.add(floor);
  ctx.scene.add(new THREE.HemisphereLight(0xffe8d0, 0x6b4a6e, 1.2));
  const sun = new THREE.DirectionalLight(0xffd6a0, 2);
  sun.position.set(10, 20, 8);
  ctx.scene.add(sun);
  ctx.scene.background = new THREE.Color(0xc9a8d4);

  const gates = Array.from({ length: 6 }, (_, id) => {
    const a = (id / 6) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    return { id, position: dir.clone().multiplyScalar(radius + 2), inward: dir.clone().negate() };
  });
  const arena: ArenaInfo = {
    radius,
    gates,
    bossBreach: { position: new THREE.Vector3(0, 0, -(radius + 3)), inward: new THREE.Vector3(0, 0, 1) },
    clamp(p, r) {
      const max = radius - r;
      const d = Math.hypot(p.x, p.z);
      if (d > max) {
        p.x *= max / d;
        p.z *= max / d;
      }
      return p;
    },
  };
  return { arena, update() {}, setMood() {}, breachWall() {}, reset() {} };
}
