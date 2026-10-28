import {
  Color, DataTexture, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute,
  InstancedMesh, PlaneGeometry, RGBAFormat, ShaderMaterial, Vector3,
} from 'three';
import type { KitContext } from '../core/contracts';
import { FX } from './config';

const palette = [new Color('#ef188e'), new Color('#ff65b5'), new Color('#fff4df'), new Color('#fffdf7')];

export class Petals {
  readonly mesh: InstancedMesh;
  private readonly position = new Float32Array(FX.petals.capacity * 3);
  private readonly velocity = new Float32Array(FX.petals.capacity * 3);
  private readonly state = new Float32Array(FX.petals.capacity * 4);
  private readonly tint = new Float32Array(FX.petals.capacity * 3);
  private readonly life = new Float32Array(FX.petals.capacity);
  private readonly duration = new Float32Array(FX.petals.capacity);
  private readonly positions = new InstancedBufferAttribute(this.position, 3).setUsage(DynamicDrawUsage);
  private readonly states = new InstancedBufferAttribute(this.state, 4).setUsage(DynamicDrawUsage);
  private readonly tints = new InstancedBufferAttribute(this.tint, 3).setUsage(DynamicDrawUsage);
  private readonly material: ShaderMaterial;
  private readonly centre = new Vector3();
  private readonly point = new Vector3();
  private readonly streams = Array.from({ length: 4 }, () => ({ from: new Vector3(), to: new Vector3(), time: 0, carry: 0 }));
  private limit = FX.petals.capacity as number;
  private ambient = FX.petals.ambient[0] as number;
  private cursor = this.ambient;
  private time = 0;
  private quality = 0;

  constructor(private readonly ctx: KitContext, quality: number) {
    const geometry = new PlaneGeometry(1, 1);
    geometry.setAttribute('aPosition', this.positions);
    geometry.setAttribute('aState', this.states);
    geometry.setAttribute('aTint', this.tints);
    const fallback = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
    fallback.needsUpdate = true;
    this.material = new ShaderMaterial({
      uniforms: { uMap: { value: fallback }, uHasMap: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        attribute vec3 aPosition, aTint;
        attribute vec4 aState;
        uniform float uTime;
        varying vec2 vUv; varying vec3 vTint; varying float vAlpha;
        void main() {
          vUv = uv; vTint = aTint; vAlpha = aState.w;
          float angle = aState.y + sin(uTime * 2.9 + aState.z) * 0.7;
          mat2 r = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          vec2 p = r * position.xy * aState.x;
          p.x *= 0.50 + 0.50 * abs(sin(uTime * 3.7 + aState.z));
          vec4 view = viewMatrix * vec4(aPosition, 1.0);
          view.xy += p;
          view.z += sin(uv.y * 3.14159 + uTime * 3.0 + aState.z) * aState.x * 0.16;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uHasMap;
        varying vec2 vUv; varying vec3 vTint; varying float vAlpha;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float shape = 1.0 - smoothstep(0.68, 0.98, length(p * vec2(1.0, 0.83)) + p.y * 0.17);
          float alpha = mix(shape, texture2D(uMap, vUv).a, uHasMap) * vAlpha;
          if (alpha < 0.025) discard;
          float vein = pow(max(0.0, 1.0 - abs(p.x + p.y * 0.12) * 9.0), 3.0);
          vec3 color = vTint * (0.85 + 0.23 * vUv.y) + vein * vec3(0.30, 0.17, 0.12);
          gl_FragColor = vec4(color, alpha);
        }`,
      transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    });
    this.mesh = new InstancedMesh(geometry, this.material, FX.petals.capacity);
    this.mesh.name = 'fx:petals';
    this.mesh.frustumCulled = false;
    ctx.scene.add(this.mesh);
    this.setQuality(quality);
    this.reset();
    void ctx.assets.texture('petal').then(texture => {
      if (texture) {
        this.material.uniforms.uMap.value = texture;
        this.material.uniforms.uHasMap.value = 1;
        fallback.dispose();
      }
    }).catch(() => { /* Keep the procedural petal if a custom asset provider rejects. */ });
  }

  setQuality(quality: number): void {
    this.quality = quality;
    this.limit = FX.petals.limits[quality];
    this.ambient = FX.petals.ambient[quality];
    this.mesh.count = this.limit;
    this.cursor = this.ambient;
    this.reset();
  }

  private seed(i: number, ambient: boolean): void {
    const r = this.ctx.rng;
    const p = i * 3, s = i * 4;
    const c = palette[r.int(0, 3)];
    this.tint[p] = c.r * 1.35; this.tint[p + 1] = c.g * 1.35; this.tint[p + 2] = c.b * 1.35;
    this.state[s] = r.range(0.12, ambient ? 0.29 : 0.40);
    this.state[s + 1] = r.range(-Math.PI, Math.PI);
    this.state[s + 2] = r.range(0, Math.PI * 2);
    this.state[s + 3] = ambient ? 0.82 : 1;
  }

  burst(pos: Vector3, count: number, power = 1): void {
    const r = this.ctx.rng;
    count = Math.min(this.limit - this.ambient, Math.ceil(count * (this.quality === 0 ? 1 : this.quality === 1 ? 0.7 : 0.45)));
    for (let j = 0; j < count; j++) {
      const i = this.cursor++;
      if (this.cursor >= this.limit) this.cursor = this.ambient;
      const p = i * 3;
      const angle = r.range(0, Math.PI * 2), speed = r.range(1, 5.5) * power;
      this.seed(i, false);
      this.position[p] = pos.x + r.range(-0.12, 0.12);
      this.position[p + 1] = Math.max(0.08, pos.y) + r.range(0, 0.4);
      this.position[p + 2] = pos.z + r.range(-0.12, 0.12);
      this.velocity[p] = Math.sin(angle) * speed;
      this.velocity[p + 1] = r.range(1.5, 6) * Math.sqrt(power);
      this.velocity[p + 2] = Math.cos(angle) * speed;
      this.life[i] = this.duration[i] = r.range(1.8, 3.7) + Math.min(1, power * 0.2);
    }
    this.positions.needsUpdate = this.states.needsUpdate = this.tints.needsUpdate = true;
  }

  dash(from: Vector3, to: Vector3): void {
    let stream = this.streams[0];
    for (let i = 0; i < this.streams.length; i++) if (this.streams[i].time <= 0) { stream = this.streams[i]; break; }
    stream.from.copy(from); stream.to.copy(to); stream.time = 0.24; stream.carry = 0;
    for (let j = 0; j <= 16; j++) {
      this.point.lerpVectors(from, to, j / 16); this.point.y += 0.35;
      this.burst(this.point, 4, 0.7);
    }
  }

  update(dt: number, target: Vector3): void {
    if (dt <= 0) return;
    this.time += dt;
    this.centre.copy(target);
    this.material.uniforms.uTime.value = this.time;
    const gust = 0.7 + Math.sin(this.time * 0.43) * 0.55 + Math.sin(this.time * 1.37) * 0.25;
    const drag = Math.exp(-FX.petals.drag * dt);
    for (let i = 0; i < this.limit; i++) {
      const p = i * 3, s = i * 4;
      if (i < this.ambient) {
        this.position[p] += (0.75 * gust + Math.sin(this.time + this.state[s + 2]) * 0.24) * dt;
        this.position[p + 1] -= (0.16 + 0.12 * Math.sin(this.time * 0.8 + i)) * dt;
        this.position[p + 2] += (0.35 + Math.sin(this.time * 0.5 + i) * 0.3) * dt;
        const dx = this.position[p] - target.x, dz = this.position[p + 2] - target.z;
        if (Math.abs(dx) > FX.petals.radius) this.position[p] = target.x - Math.sign(dx) * (FX.petals.radius - 0.2);
        if (Math.abs(dz) > FX.petals.radius) this.position[p + 2] = target.z - Math.sign(dz) * (FX.petals.radius - 0.2);
        if (this.position[p + 1] < 0.2) this.position[p + 1] = this.ctx.rng.range(4, 8);
      } else {
        if (this.life[i] <= 0) { this.state[s + 3] = 0; continue; }
        this.life[i] = Math.max(0, this.life[i] - dt);
        this.velocity[p] = this.velocity[p] * drag + gust * dt * 0.7;
        this.velocity[p + 2] *= drag;
        this.velocity[p + 1] -= FX.petals.gravity * dt;
        this.position[p] += this.velocity[p] * dt;
        this.position[p + 1] += this.velocity[p + 1] * dt;
        this.position[p + 2] += this.velocity[p + 2] * dt;
        if (this.position[p + 1] < 0.045) {
          this.position[p + 1] = 0.045; this.velocity[p + 1] = 0;
          this.velocity[p] *= drag; this.velocity[p + 2] *= drag;
        }
        this.state[s + 1] += dt * 1.8;
        this.state[s + 3] = Math.min(1, this.life[i] / 0.8) * Math.min(1, (this.duration[i] - this.life[i]) * 20);
      }
    }
    for (let i = 0; i < this.streams.length; i++) {
      const stream = this.streams[i];
      if (stream.time <= 0) continue;
      stream.time = Math.max(0, stream.time - dt);
      stream.carry += dt * 180;
      this.point.lerpVectors(stream.from, stream.to, 1 - stream.time / 0.24); this.point.y += 0.5;
      const count = Math.floor(stream.carry);
      if (count > 0) { this.burst(this.point, count, 0.6); stream.carry -= count; }
    }
    this.positions.needsUpdate = this.states.needsUpdate = true;
  }

  reset(): void {
    this.time = 0; this.material.uniforms.uTime.value = 0;
    this.life.fill(0); this.state.fill(0);
    this.cursor = this.ambient;
    for (let i = 0; i < this.ambient; i++) {
      this.seed(i, true);
      this.position[i * 3] = this.centre.x + this.ctx.rng.range(-FX.petals.radius, FX.petals.radius);
      this.position[i * 3 + 1] = this.ctx.rng.range(0.3, 8);
      this.position[i * 3 + 2] = this.centre.z + this.ctx.rng.range(-FX.petals.radius, FX.petals.radius);
    }
    for (let i = 0; i < this.streams.length; i++) this.streams[i].time = 0;
    this.positions.needsUpdate = this.states.needsUpdate = this.tints.needsUpdate = true;
  }
}
