import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bake meshes once per material. Intermediate source geometry never reaches the scene. */
export class StaticBatch {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): void {
    if (matrix) geometry.applyMatrix4(matrix);
    // Normalise attribute/index layout so boxes, shapes and cylinders can share a batch.
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    for (const key of Object.keys(flat.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') flat.deleteAttribute(key);
    }
    if (!flat.getAttribute('uv')) {
      flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.getAttribute('position').count * 2), 2));
    }
    const bucket = this.buckets.get(material) ?? [];
    bucket.push(flat);
    this.buckets.set(material, bucket);
  }

  finish(parent: THREE.Object3D, name: string, shadows = true): void {
    for (const [material, geometries] of this.buckets) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) throw new Error(`World geometry batch failed: ${name}`);
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${name}:${material.name}`;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      parent.add(mesh);
      for (const geometry of geometries) geometry.dispose();
    }
    this.buckets.clear();
  }
}

export const transform = (
  x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0,
): THREE.Matrix4 => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
  new THREE.Vector3(sx, sy, sz),
);

export function archShape(width: number, spring: number): THREE.Shape {
  const r = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, spring);
  shape.absarc(0, spring, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  return shape;
}

export function archTrim(width: number, spring: number, thickness: number): THREE.BufferGeometry {
  const shape = archShape(width + thickness * 2, spring);
  const hole = new THREE.Path();
  const r = width / 2;
  hole.moveTo(-r, 0);
  hole.lineTo(-r, spring);
  hole.absarc(0, spring, r, Math.PI, 0, true);
  hole.lineTo(r, 0);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false, curveSegments: 8 });
}

export function instance(
  parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry,
  material: THREE.Material, matrices: readonly THREE.Matrix4[], shadows = true,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  mesh.name = name;
  matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

/** Shared low-poly canopy with curved, serrated date-palm fronds. */
export function palmCrown(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let leaf = 0; leaf < 9; leaf++) {
    const angle = leaf * Math.PI * 2 / 9;
    const rotate = (r: number, y: number, side: number): number[] => [
      Math.sin(angle) * r + Math.cos(angle) * side, y,
      Math.cos(angle) * r - Math.sin(angle) * side,
    ];
    for (let j = 0; j < 10; j++) {
      const t = j / 10;
      const t1 = (j + 1) / 10;
      const point = (v: number, side: number) => rotate(
        v * 3.2, Math.sin(v * Math.PI * 0.8) * 1.2 - v * v * 1.65,
        side * Math.sin(v * Math.PI) * 0.45 * (j % 2 ? 0.7 : 1),
      );
      const a = point(t, -1), b = point(t, 1), c = point(t1, -1), d = point(t1, 1);
      positions.push(...a, ...b, ...c, ...b, ...d, ...c);
      uvs.push(0, t, 1, t, 0, t1, 1, t, 1, t1, 0, t1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Unit awning extends inward from z=0 to z=1, including a scalloped valance. */
export function awningGeometry(): THREE.BufferGeometry {
  const p: number[] = [], uv: number[] = [];
  const point = (u: number, v: number): number[] => [u - 0.5, -v * 0.36 + Math.sin(v * Math.PI) * 0.09, v];
  for (let i = 0; i < 12; i++) {
    const u = i / 12, u1 = (i + 1) / 12;
    for (let j = 0; j < 4; j++) {
      const v = j / 4, v1 = (j + 1) / 4;
      p.push(...point(u, v), ...point(u, v1), ...point(u1, v), ...point(u1, v), ...point(u, v1), ...point(u1, v1));
      uv.push(u, v, u, v1, u1, v, u1, v, u, v1, u1, v1);
    }
    const drop = (x: number) => -0.53 - Math.sin(x * Math.PI * 12) ** 2 * 0.08;
    p.push(u - 0.5, -0.36, 1, u - 0.5, drop(u), 1, u1 - 0.5, -0.36, 1,
      u1 - 0.5, -0.36, 1, u - 0.5, drop(u), 1, u1 - 0.5, drop(u1), 1);
    uv.push(u, 0.8, u, 1, u1, 0.8, u1, 0.8, u, 1, u1, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
