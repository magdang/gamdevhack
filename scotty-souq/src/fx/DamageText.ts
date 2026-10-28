import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DynamicDrawUsage, Mesh, ShaderMaterial,
} from 'three';
import type { Vector3 } from 'three';
import type { DamageNumberKind, KitContext } from '../core/contracts';
import { FX } from './config';

const GLYPHS = '0123456789x!+-?.';
const colors = {
  normal: new Color('#fff4ce'), big: new Color('#ff9a36'), player: new Color('#ff355b'), combo: new Color('#ff81db'),
};

/** One atlas, one batched billboard draw for all live glyphs. No canvas work on hit. */
export class DamageText {
  private readonly slots = Array.from({ length: FX.damage.capacity }, () => ({
    x: 0, y: 0, z: 0, age: -1, vx: 0, size: 1, text: '', kind: 'normal' as DamageNumberKind,
  }));
  private readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private cursor = 0;

  constructor(private readonly ctx: KitContext) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 128;
    const c = canvas.getContext('2d');
    if (c) {
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 76px system-ui, sans-serif';
      c.lineJoin = 'round'; c.lineWidth = 11; c.strokeStyle = '#341a3d'; c.fillStyle = '#ffffff';
      for (let i = 0; i < GLYPHS.length; i++) {
        c.strokeText(GLYPHS[i], i * 64 + 32, 66); c.fillText(GLYPHS[i], i * 64 + 32, 66);
      }
    }
    const texture = new CanvasTexture(canvas);
    const vertices = FX.damage.capacity * FX.damage.glyphs * 4;
    const geometry = new BufferGeometry();
    for (const [name, itemSize] of [['position', 3], ['aOffset', 2], ['uv', 2], ['aColor', 3], ['aAlpha', 1]] as const) {
      geometry.setAttribute(name, new BufferAttribute(new Float32Array(vertices * itemSize), itemSize).setUsage(DynamicDrawUsage));
    }
    const indices = new Uint16Array(FX.damage.capacity * FX.damage.glyphs * 6);
    for (let i = 0; i < vertices / 4; i++) {
      const k = i * 6, v = i * 4;
      indices[k] = v; indices[k + 1] = v + 1; indices[k + 2] = v + 2;
      indices[k + 3] = v; indices[k + 4] = v + 2; indices[k + 5] = v + 3;
    }
    geometry.setIndex(new BufferAttribute(indices, 1)); geometry.setDrawRange(0, 0);
    const material = new ShaderMaterial({
      uniforms: { uAtlas: { value: texture } },
      vertexShader: `
        attribute vec2 aOffset; attribute vec3 aColor; attribute float aAlpha;
        varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
        void main() {
          vUv = uv; vColor = aColor; vAlpha = aAlpha;
          vec4 view = viewMatrix * vec4(position, 1.0); view.xy += aOffset;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas; varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
        void main() { vec4 t = texture2D(uAtlas, vUv); if(t.a < 0.02) discard;
          gl_FragColor = vec4(t.rgb * vColor, t.a * vAlpha); }`,
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    });
    this.mesh = new Mesh(geometry, material); this.mesh.frustumCulled = false; this.mesh.renderOrder = 30;
    this.mesh.name = 'fx:damage-text'; ctx.scene.add(this.mesh);
  }

  pop(pos: Vector3, value: number | string, kind: DamageNumberKind): void {
    const slot = this.slots[this.cursor++ % this.slots.length];
    slot.x = pos.x; slot.y = pos.y + 1.0; slot.z = pos.z;
    slot.age = 0; slot.vx = this.ctx.rng.range(-0.65, 0.65);
    slot.size = kind === 'big' ? 1.25 : kind === 'combo' ? 1.35 : 0.78;
    slot.text = (kind === 'combo' && typeof value === 'number' ? `x${value}!` : String(value)).slice(0, FX.damage.glyphs);
    slot.kind = kind;
  }

  update(realDt: number): void {
    const g = this.mesh.geometry;
    const p = g.getAttribute('position') as BufferAttribute, o = g.getAttribute('aOffset') as BufferAttribute;
    const uv = g.getAttribute('uv') as BufferAttribute, col = g.getAttribute('aColor') as BufferAttribute;
    const alpha = g.getAttribute('aAlpha') as BufferAttribute;
    let glyph = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.age < 0) continue;
      s.age += realDt;
      if (s.age >= FX.damage.life) { s.age = -1; continue; }
      const t = s.age / FX.damage.life;
      const size = s.size * (1 + Math.sin(Math.min(1, t * 6) * Math.PI) * 0.30);
      const color = colors[s.kind];
      for (let j = 0; j < s.text.length; j++) {
        const index = Math.max(0, GLYPHS.indexOf(s.text[j]));
        for (let k = 0; k < 4; k++) {
          const v = glyph * 4 + k, right = k === 1 || k === 2, top = k >= 2;
          p.setXYZ(v, s.x + s.vx * t, s.y + t * 1.6 - t * t * 0.6, s.z);
          o.setXY(v, (j - s.text.length * 0.5 + (right ? 1 : 0)) * size * 0.45, (top ? 0.5 : -0.5) * size);
          uv.setXY(v, (index + (right ? 1 : 0)) / 16, top ? 1 : 0);
          col.setXYZ(v, color.r, color.g, color.b); alpha.setX(v, Math.min(1, (1 - t) * 3));
        }
        glyph++;
      }
    }
    g.setDrawRange(0, glyph * 6);
    p.needsUpdate = o.needsUpdate = uv.needsUpdate = col.needsUpdate = alpha.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.slots.length; i++) this.slots[i].age = -1;
    this.mesh.geometry.setDrawRange(0, 0); this.cursor = 0;
  }
}
