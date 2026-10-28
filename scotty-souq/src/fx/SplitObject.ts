import {
  AdditiveBlending, Box3, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial,
  Plane, PlaneGeometry, Quaternion, Vector3,
} from 'three';
import type { Material, Object3D } from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { KitContext } from '../core/contracts';
import { FX } from './config';

interface Half {
  pivot: Group;
  plane: Plane;
  localPlane: Plane;
  velocity: Vector3;
  spin: Vector3;
  materials: Material[];
  opacities: number[];
}

interface Split {
  halves: [Half, Half];
  edge: Mesh<PlaneGeometry, MeshBasicMaterial>;
  age: number;
  duration: number;
  dramatic: boolean;
  active: boolean;
}

export class SplitObjects {
  private readonly slots: Split[];
  private readonly bounds = new Box3();
  private readonly centre = new Vector3();
  private readonly size = new Vector3();
  private readonly normal = new Vector3();
  private readonly inverse = new Matrix4();
  private readonly localPlane = new Plane();
  private readonly zAxis = new Vector3(0, 0, 1);
  private readonly rotation = new Quaternion();

  constructor(private readonly ctx: KitContext, private readonly burst: (pos: Vector3, count: number, power: number) => void) {
    this.slots = Array.from({ length: FX.splits.capacity }, () => {
      const createHalf = (): Half => {
        const pivot = new Group(); pivot.visible = false; pivot.name = 'fx:split-half'; ctx.scene.add(pivot);
        return { pivot, plane: new Plane(), localPlane: new Plane(), velocity: new Vector3(), spin: new Vector3(), materials: [], opacities: [] };
      };
      const edge = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({
        color: 0xffe4b2, transparent: true, opacity: 0, blending: AdditiveBlending, side: DoubleSide,
        depthWrite: false, toneMapped: false,
      }));
      edge.visible = false; edge.name = 'fx:cut-flash'; ctx.scene.add(edge);
      return { halves: [createHalf(), createHalf()], edge, age: 0, duration: 1, dramatic: false, active: false };
    });
  }

  split(obj: Object3D, cutNormal: Vector3, power = 1): void {
    let slot = this.slots[0];
    for (let i = 0; i < this.slots.length; i++) if (!this.slots[i].active) { slot = this.slots[i]; break; }
    if (slot.active) this.clear(slot);
    obj.updateWorldMatrix(true, true);
    this.bounds.setFromObject(obj);
    if (this.bounds.isEmpty()) return;
    this.bounds.getCenter(this.centre); this.bounds.getSize(this.size);
    this.normal.copy(cutNormal);
    if (this.normal.lengthSq() < 0.0001) this.normal.set(1, 0, 0);
    this.normal.normalize();
    power = Math.max(0.1, power);
    slot.age = 0; slot.dramatic = power > 2;
    slot.duration = slot.dramatic ? FX.splits.dramaticLife : FX.splits.life;
    slot.active = true;

    for (let i = 0; i < 2; i++) {
      const h = slot.halves[i], sign = i === 0 ? 1 : -1;
      const clone = skeletonClone(obj);
      // Preserve nested, rotated and scaled parents even when the source is not scene-rooted.
      clone.matrix.copy(obj.matrixWorld); clone.matrix.premultiply(this.inverse.makeTranslation(-this.centre.x, -this.centre.y, -this.centre.z));
      // Keep the exact matrix: decomposing can lose shear from nonuniformly scaled parents.
      clone.matrixAutoUpdate = false; clone.visible = true;
      h.pivot.position.copy(this.centre); h.pivot.rotation.set(0, 0, 0); h.pivot.scale.setScalar(1);
      h.pivot.updateMatrixWorld(true);
      h.plane.setFromNormalAndCoplanarPoint(this.normal, this.centre);
      if (sign < 0) h.plane.negate();
      this.inverse.copy(h.pivot.matrixWorld).invert();
      h.localPlane.copy(h.plane).applyMatrix4(this.inverse);
      clone.traverse(child => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        const copyMaterial = (source: Material): Material => {
          const m = source.clone();
          m.clippingPlanes = [h.plane]; m.clipShadows = true;
          m.transparent = true; m.depthWrite = true;
          h.materials.push(m); h.opacities.push(m.opacity);
          return m;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copyMaterial) : copyMaterial(mesh.material);
        mesh.castShadow = false;
      });
      h.pivot.add(clone); h.pivot.visible = true;
      const speed = slot.dramatic ? 0.8 + Math.sqrt(power) * 0.4 : 1.8 * power;
      h.velocity.copy(this.normal).multiplyScalar(sign * speed); h.velocity.y += slot.dramatic ? 0.65 : 1.7;
      h.spin.set(this.ctx.rng.range(-0.8, 0.8), sign * (slot.dramatic ? 0.22 : 1.2), sign * 0.5);
    }
    // A short luminous cross-section flash avoids expensive geometry capping on GLBs.
    this.rotation.setFromUnitVectors(this.zAxis, this.normal);
    slot.edge.position.copy(this.centre); slot.edge.quaternion.copy(this.rotation);
    const extent = Math.max(this.size.x, this.size.y, this.size.z);
    slot.edge.scale.set(extent * 1.2, extent * 1.2, 1);
    slot.edge.material.color.setRGB(5, 3.7, 2); slot.edge.material.opacity = 0.8; slot.edge.visible = true;
    this.burst(this.centre, slot.dramatic ? 500 : 75, slot.dramatic ? 2.4 : 1.2);
  }

  update(dt: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.duration) { this.clear(s); continue; }
      const t = s.age / s.duration;
      for (let j = 0; j < 2; j++) {
        const h = s.halves[j];
        h.velocity.y -= dt * (s.dramatic ? 0.7 : 3.5);
        h.pivot.position.addScaledVector(h.velocity, dt);
        h.pivot.rotation.x += h.spin.x * dt; h.pivot.rotation.y += h.spin.y * dt; h.pivot.rotation.z += h.spin.z * dt;
        h.pivot.updateMatrixWorld(true);
        // The cut travels and spins with its half, rather than slicing against a fixed world plane.
        this.localPlane.copy(h.localPlane).applyMatrix4(h.pivot.matrixWorld);
        h.plane.copy(this.localPlane);
        const fade = Math.min(1, (1 - t) * 2.2);
        for (let k = 0; k < h.materials.length; k++) {
          h.materials[k].opacity = h.opacities[k] * fade;
          h.materials[k].depthWrite = fade > 0.7;
        }
      }
      s.edge.material.opacity = Math.max(0, 0.8 * (1 - s.age / (s.dramatic ? 0.55 : 0.22)));
      s.edge.visible = s.edge.material.opacity > 0.001;
    }
  }

  private clear(slot: Split): void {
    for (let i = 0; i < 2; i++) {
      const h = slot.halves[i];
      for (let j = 0; j < h.materials.length; j++) h.materials[j].dispose();
      // Geometry and textures are shared with the original model and must never be disposed here.
      h.pivot.traverse(child => {
        const skinned = child as Object3D & { isSkinnedMesh?: boolean; skeleton?: { dispose(): void } };
        if (skinned.isSkinnedMesh) skinned.skeleton?.dispose();
      });
      h.materials.length = h.opacities.length = 0;
      h.pivot.clear(); h.pivot.visible = false;
    }
    slot.edge.visible = slot.active = false;
  }

  reset(): void {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].active) this.clear(this.slots[i]);
  }
}
