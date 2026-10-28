import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage,
  Mesh, ShaderMaterial, Vector3,
} from 'three';
import type { KitContext, TrailHandle, TrailStyle } from '../core/contracts';
import { FX } from './config';

function ribbonMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uOpacity: { value: 1 }, uGlow: { value: 4 } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uOpacity, uGlow;
      varying vec2 vUv;
      void main() {
        float edge = abs(vUv.y - 0.5) * 2.0;
        float core = pow(1.0 - edge, 2.4);
        vec3 fringe = mix(vec3(1.0, 0.035, 0.48), vec3(0.05, 0.75, 1.0), vUv.y);
        vec3 col = mix(fringe, vec3(1.0, 0.83, 0.46), smoothstep(0.18, 0.70, core));
        col += vec3(0.8, 0.8, 0.7) * pow(core, 3.0);
        float taper = smoothstep(0.0, 0.11, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        float alpha = (1.0 - edge * edge) * taper * uOpacity;
        gl_FragColor = vec4(col * uGlow, alpha);
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false,
  });
}

function stripGeometry(sections: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(sections * 6), 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(sections * 4), 2).setUsage(DynamicDrawUsage));
  const indices = new Uint16Array((sections - 1) * 6);
  for (let i = 0; i < sections - 1; i++) {
    const a = i * 2, k = i * 6;
    indices[k] = a; indices[k + 1] = a + 1; indices[k + 2] = a + 2;
    indices[k + 3] = a + 1; indices[k + 4] = a + 3; indices[k + 5] = a + 2;
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  return geometry;
}

/** Uniform Catmull-Rom interpolation without temporary vectors or Curve allocations. */
function catmull(a: number, b: number, c: number, d: number, t: number): number {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

class Ribbon {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly samples = new Float32Array(FX.trails.samples * 6);
  count = 0;
  active = false;
  ended = false;
  generation = 0;
  idle = 0;
  style: TrailStyle = 'slash';
  dirty = false;
  spark = 0;

  constructor(ctx: KitContext) {
    this.mesh = new Mesh(stripGeometry((FX.trails.samples - 1) * FX.trails.subdivisions + 1), ribbonMaterial());
    this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.name = 'fx:sword-ribbon';
    ctx.scene.add(this.mesh);
  }

  push(tip: Vector3, base: Vector3): void {
    if (this.ended || !this.active) return;
    if (this.count === FX.trails.samples) { this.samples.copyWithin(0, 6); this.count--; }
    const p = this.count++ * 6;
    this.samples[p] = tip.x; this.samples[p + 1] = tip.y; this.samples[p + 2] = tip.z;
    this.samples[p + 3] = base.x; this.samples[p + 4] = base.y; this.samples[p + 5] = base.z;
    this.idle = 0; this.dirty = true;
  }

  rebuild(): void {
    const p = this.mesh.geometry.getAttribute('position') as BufferAttribute;
    const uv = this.mesh.geometry.getAttribute('uv') as BufferAttribute;
    const positions = p.array as Float32Array, uvs = uv.array as Float32Array;
    const sections = (this.count - 1) * FX.trails.subdivisions + 1;
    const width = FX.trails[this.style].width;
    for (let j = 0; j < sections; j++) {
      const sample = j / FX.trails.subdivisions;
      const i = Math.min(this.count - 2, Math.floor(sample)), t = sample - i;
      const a = Math.max(0, i - 1) * 6, b = i * 6, c = Math.min(this.count - 1, i + 1) * 6, d = Math.min(this.count - 1, i + 2) * 6;
      for (let axis = 0; axis < 3; axis++) {
        const tip = catmull(this.samples[a + axis], this.samples[b + axis], this.samples[c + axis], this.samples[d + axis], t);
        const base = catmull(this.samples[a + 3 + axis], this.samples[b + 3 + axis], this.samples[c + 3 + axis], this.samples[d + 3 + axis], t);
        const mid = (tip + base) * 0.5, half = (tip - base) * 0.5 * width;
        positions[j * 6 + axis] = mid + half;
        positions[j * 6 + 3 + axis] = mid - half;
      }
      uvs[j * 4] = uvs[j * 4 + 2] = j / (sections - 1);
      uvs[j * 4 + 1] = 0; uvs[j * 4 + 3] = 1;
    }
    p.needsUpdate = uv.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, Math.max(0, (sections - 1) * 6));
    this.dirty = false;
  }
}

const NO_TRAIL: TrailHandle = { push() {}, end() {} };

export class SwordTrails {
  private readonly ribbons: Ribbon[];
  private readonly arcs;

  constructor(private readonly ctx: KitContext, private readonly sparkle: (pos: Vector3, count: number) => void) {
    this.ribbons = Array.from({ length: FX.trails.capacity }, () => new Ribbon(ctx));
    this.arcs = Array.from({ length: FX.arcs }, () => {
      const mesh = new Mesh(stripGeometry(49), ribbonMaterial());
      mesh.visible = false; mesh.frustumCulled = false; mesh.name = 'fx:slash-arc';
      ctx.scene.add(mesh);
      return { mesh, age: 0, active: false, side: 1 };
    });
  }

  begin(style: TrailStyle): TrailHandle {
    let ribbon: Ribbon | undefined;
    for (let i = 0; i < this.ribbons.length; i++) if (!this.ribbons[i].active) { ribbon = this.ribbons[i]; break; }
    if (!ribbon) return NO_TRAIL;
    const slot = ribbon, generation = ++slot.generation;
    slot.count = slot.idle = slot.spark = 0; slot.style = style; slot.active = slot.mesh.visible = true; slot.ended = false;
    slot.mesh.geometry.setDrawRange(0, 0);
    slot.mesh.material.uniforms.uGlow.value = FX.trails[style].glow;
    slot.mesh.material.uniforms.uOpacity.value = 1;
    // Small lease allocated only on begin, so an old handle cannot write into a reused GPU slot.
    return {
      push: (tip, base) => {
        if (slot.generation !== generation || !slot.active || slot.ended) return;
        slot.push(tip, base);
        if (style !== 'slash' && ++slot.spark % 4 === 0) this.sparkle(tip, style === 'finalCut' ? 4 : 1);
      },
      end: () => { if (slot.generation === generation) slot.ended = true; },
    };
  }

  arc(origin: Vector3, facing: number, radius: number, halfAngle: number, side: 1 | -1): void {
    let arc = this.arcs[0];
    for (let i = 0; i < this.arcs.length; i++) if (!this.arcs[i].active) { arc = this.arcs[i]; break; }
    const p = arc.mesh.geometry.getAttribute('position') as BufferAttribute;
    const uv = arc.mesh.geometry.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, angle = -halfAngle + t * halfAngle * 2;
      const thickness = radius * (0.05 + Math.sin(t * Math.PI) * 0.23);
      for (let edge = 0; edge < 2; edge++) {
        const r = Math.max(0, radius - thickness * edge), index = i * 2 + edge;
        p.setXYZ(index, Math.sin(angle) * r, Math.sin(t * Math.PI) * side * 0.18, Math.cos(angle) * r);
        uv.setXY(index, t, edge);
      }
    }
    p.needsUpdate = uv.needsUpdate = true;
    arc.mesh.geometry.setDrawRange(0, 48 * 6);
    arc.mesh.position.copy(origin); arc.mesh.position.y += 0.65;
    arc.mesh.rotation.set(0, facing, 0);
    arc.mesh.scale.setScalar(0.90);
    arc.mesh.material.uniforms.uGlow.value = 4.2;
    arc.mesh.material.uniforms.uOpacity.value = 1;
    arc.age = 0; arc.side = side; arc.active = arc.mesh.visible = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.ribbons.length; i++) {
      const r = this.ribbons[i];
      if (!r.active) continue;
      r.idle += dt;
      const life = FX.trails[r.style].life;
      if (r.idle >= life) { r.active = r.mesh.visible = false; continue; }
      if (r.dirty && r.count >= 2) r.rebuild();
      r.mesh.material.uniforms.uOpacity.value = (1 - r.idle / life) ** 1.5;
    }
    for (let i = 0; i < this.arcs.length; i++) {
      const a = this.arcs[i];
      if (!a.active) continue;
      a.age += dt;
      if (a.age > 0.24) { a.active = a.mesh.visible = false; continue; }
      a.mesh.scale.setScalar(0.9 + a.age * 0.9);
      a.mesh.rotation.y += dt * a.side * 0.7;
      a.mesh.material.uniforms.uOpacity.value = (1 - a.age / 0.24) ** 1.5;
    }
  }

  reset(): void {
    for (let i = 0; i < this.ribbons.length; i++) {
      const r = this.ribbons[i]; r.active = r.mesh.visible = false; r.generation++;
    }
    for (let i = 0; i < this.arcs.length; i++) this.arcs[i].active = this.arcs[i].mesh.visible = false;
  }
}
