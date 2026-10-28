import * as THREE from 'three';
import { COMBAT } from './config';
import type { AttackShape } from './Shapes';

const vertexShader = `
varying vec2 vPoint;
uniform vec2 extent;
uniform float offsetZ;
void main() {
  vPoint = vec2(position.x * extent.x, -position.y * extent.y + offsetZ);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x * extent.x, 0., -position.y * extent.y, 1.);
}`;
const fragmentShader = `
varying vec2 vPoint;
uniform float shapeKind, radius, halfAngle, lengthZ, widthX, progress, pulse, offsetZ;
void main() {
  float d = length(vPoint);
  float angle = atan(vPoint.x, vPoint.y);
  float edge;
  float sweep;
  if (shapeKind > 2.5) {
    edge = min(widthX * .5 - abs(vPoint.x), min(vPoint.y, lengthZ - vPoint.y));
    sweep = vPoint.y / max(lengthZ, .001);
  } else {
    edge = radius - d;
    if (shapeKind > .5) edge = min(edge, (halfAngle - abs(angle)) * max(d, .15));
    sweep = shapeKind > .5 && shapeKind < 1.5 ? (angle + halfAngle) / (2. * halfAngle) : d / radius;
  }
  if (edge < 0.) discard;
  float aa = max(fwidth(edge), .015);
  float border = 1. - smoothstep(.055, .11 + aa, edge);
  float filled = 1. - smoothstep(progress - .015, progress + .015, sweep);
  float front = 1. - smoothstep(.01, .04, abs(sweep - progress));
  vec3 color = mix(vec3(.95, .08, .025), vec3(1., .55, .06), max(border, front));
  color = mix(color, vec3(1., .91, .55), pulse);
  float alpha = (.09 + filled * .25 + border * .5 + front * .25 + pulse * .22) * smoothstep(0., aa, edge);
  gl_FragColor = vec4(color, min(alpha, .95));
}`;

export class Telegraph {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  active = false;
  private pulseTime = -1;

  constructor(geometry: THREE.PlaneGeometry, scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        extent: { value: new THREE.Vector2(1, 1) }, offsetZ: { value: 0 },
        shapeKind: { value: 0 }, radius: { value: 1 }, halfAngle: { value: Math.PI },
        lengthZ: { value: 1 }, widthX: { value: 1 }, progress: { value: 0 }, pulse: { value: 0 },
      },
    }));
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  show(shape: AttackShape): void {
    const u = this.mesh.material.uniforms;
    this.active = true;
    this.pulseTime = -1;
    this.mesh.visible = true;
    this.mesh.position.copy(shape.center);
    this.mesh.position.y = 0.045;
    this.mesh.rotation.y = shape.kind === 'circle' ? 0 : shape.facing;
    u.shapeKind.value = { circle: 0, arc: 1, cone: 2, line: 3 }[shape.kind];
    if (shape.kind === 'line') {
      u.extent.value.set(shape.width / 2, shape.length / 2);
      u.offsetZ.value = shape.length / 2;
      u.lengthZ.value = shape.length;
      u.widthX.value = shape.width;
      this.mesh.position.add(new THREE.Vector3(Math.sin(shape.facing), 0, Math.cos(shape.facing)).multiplyScalar(shape.length / 2));
    } else {
      u.extent.value.set(shape.radius, shape.radius);
      u.offsetZ.value = 0;
      u.radius.value = shape.radius;
      u.halfAngle.value = shape.kind === 'circle' ? Math.PI : shape.halfAngle;
    }
    this.setProgress(0);
    u.pulse.value = 0;
  }

  setProgress(value: number): void { this.mesh.material.uniforms.progress.value = Math.min(1, Math.max(0, value)); }
  strike(): void { this.setProgress(1); this.pulseTime = 0; }
  release(): void { this.active = false; this.mesh.visible = false; this.pulseTime = -1; }

  update(dt: number): void {
    if (!this.active || this.pulseTime < 0) return;
    this.pulseTime += dt;
    this.mesh.material.uniforms.pulse.value = Math.max(0, 1 - this.pulseTime / COMBAT.telegraphPulseDuration);
    if (this.pulseTime >= COMBAT.telegraphPulseDuration) this.release();
  }

  dispose(): void { this.mesh.removeFromParent(); this.mesh.material.dispose(); }
}

/** Shared geometry and reusable shader decals. Released slots are reused without allocations. */
export class TelegraphPool {
  private geometry: THREE.PlaneGeometry | null = null;
  private slots: Telegraph[] = [];
  constructor(private scene: THREE.Scene) {}
  acquire(shape: AttackShape): Telegraph {
    let slot = this.slots.find((entry) => !entry.active);
    if (!slot) {
      this.geometry ??= new THREE.PlaneGeometry(2, 2);
      slot = new Telegraph(this.geometry, this.scene);
      this.slots.push(slot);
    }
    slot.show(shape);
    return slot;
  }
  update(dt: number): void { for (const slot of this.slots) slot.update(dt); }
  reset(): void {
    for (const slot of this.slots) slot.dispose();
    this.slots.length = 0;
    this.geometry?.dispose();
    this.geometry = null;
  }
}
