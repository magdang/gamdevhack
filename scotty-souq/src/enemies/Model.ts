import * as THREE from 'three';
import type { AssetsApi } from '../core/Assets';
import type { ModelKey } from '../core/manifest';

export function material(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
}

export function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number,
  x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function ball(parent: THREE.Object3D, color: number, x: number, y: number, z: number,
  sx: number, sy = sx, sz = sx): THREE.Mesh {
  return part(parent, new THREE.SphereGeometry(1, 12, 10), color, x, y, z, sx, sy, sz);
}

export function eyes(parent: THREE.Object3D, y: number, z: number, spread: number, size = 0.1): void {
  for (const side of [-1, 1]) {
    ball(parent, 0xfff9e7, spread * side, y, z, size * 1.5, size * 1.7, size);
    ball(parent, 0x161b2a, spread * side, y, z + size * 0.85, size * 0.72);
    ball(parent, 0xffffff, spread * side - size * 0.2, y + size * 0.4, z + size * 1.4, size * 0.25);
  }
}

export function feet(parent: THREE.Object3D, color: number, spread: number, z = 0.05): void {
  for (const side of [-1, 1]) ball(parent, color, spread * side, 0.17, z, 0.23, 0.18, 0.34);
}

export function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
  });
  for (const geometry of geometries) geometry.dispose();
  // Asset textures belong to AssetsApi and must remain shared.
  for (const mat of materials) mat.dispose();
  root.removeFromParent();
}

/** Clone GPU resources before modifying or disposing a cached AssetsApi instance. */
function ownResources(root: THREE.Object3D): void {
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const original = object.geometry as THREE.BufferGeometry;
    const geometry = geometries.get(original) ?? original.clone();
    geometries.set(original, geometry);
    object.geometry = geometry;
    const clone = (mat: THREE.Material) => {
      let copy = materials.get(mat);
      if (!copy) { copy = mat.clone(); materials.set(mat, copy); }
      return copy;
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
}

/** Grounded root, animated body pivot, and a shared look for fallbacks and static GLBs. */
export class ActorVisual {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private model: THREE.Object3D;
  private disposed = false;
  private flashColor = new THREE.Color(0xffffff);
  private flashMaterials: Array<{ mat: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }> = [];

  constructor(scene: THREE.Scene, assets: AssetsApi, key: ModelKey, fallback: THREE.Object3D, radius: number) {
    this.model = fallback;
    this.body.add(fallback);
    this.root.add(this.body);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.15, 24),
      new THREE.MeshBasicMaterial({ color: 0x38243c, opacity: 0.22, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    this.root.add(shadow);
    const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd390, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.032;
    this.root.add(rim);
    scene.add(this.root);
    this.decorate();
    void assets.model(key).then((loaded) => {
      if (!loaded) return;
      ownResources(loaded);
      if (this.disposed) { disposeObject(loaded); return; }
      disposeObject(this.model);
      this.model = loaded;
      this.body.add(loaded);
      this.decorate();
    }).catch(() => { /* The procedural mascot stays usable if a custom asset provider rejects. */ });
  }

  private decorate(): void {
    this.flashMaterials.length = 0;
    const meshes: THREE.Mesh[] = [];
    this.model.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
    for (const mesh of meshes) {
      mesh.castShadow = true;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          this.flashMaterials.push({ mat, color: mat.emissive.clone(), intensity: mat.emissiveIntensity });
        }
      }
      // Back-face shells supply a dark silhouette without a post-processing dependency.
      if (!(mesh instanceof THREE.SkinnedMesh)) {
        const outline = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x261d30, side: THREE.BackSide }));
        outline.scale.setScalar(1.045);
        mesh.add(outline);
      }
    }
  }

  flash(amount: number): void {
    for (const entry of this.flashMaterials) {
      entry.mat.emissive.copy(entry.color).lerp(this.flashColor, amount);
      entry.mat.emissiveIntensity = entry.intensity + amount * 2;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeObject(this.root);
    this.flashMaterials.length = 0;
  }
}
