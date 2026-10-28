import {
  AdditiveBlending, Color, DoubleSide, DynamicDrawUsage, IcosahedronGeometry,
  InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, PlaneGeometry, ShaderMaterial,
} from 'three';
import type { Vector3 } from 'three';
import type { KitContext } from '../core/contracts';
import { FX } from './config';

interface Chunk {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number; spin: number; size: number; life: number; duration: number;
}

function chunk(): Chunk {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, spin: 0, size: 0, life: 0, duration: 1 };
}

export class Impacts {
  private readonly chunks = Array.from({ length: FX.impacts.debris }, chunk);
  private readonly sparks = Array.from({ length: FX.impacts.sparks }, chunk);
  private readonly debrisMesh: InstancedMesh;
  private readonly sparkMesh: InstancedMesh;
  private readonly alpha = new InstancedBufferAttribute(new Float32Array(FX.impacts.debris), 1).setUsage(DynamicDrawUsage);
  private readonly sparkPos = new InstancedBufferAttribute(new Float32Array(FX.impacts.sparks * 3), 3).setUsage(DynamicDrawUsage);
  private readonly sparkState = new InstancedBufferAttribute(new Float32Array(FX.impacts.sparks * 4), 4).setUsage(DynamicDrawUsage);
  private readonly transform = new Object3D();
  private readonly rings;
  private debrisCursor = 0;
  private sparkCursor = 0;

  constructor(private readonly ctx: KitContext) {
    const debrisGeometry = new IcosahedronGeometry(1, 0);
    debrisGeometry.setAttribute('aAlpha', this.alpha);
    const debrisMaterial = new ShaderMaterial({
      vertexShader: `
        attribute float aAlpha; varying float vAlpha, vLight;
        void main() {
          vAlpha = aAlpha;
          vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vLight = 0.4 + max(0.0, dot(n, normalize(vec3(-0.4, 1.0, 0.5)))) * 0.6;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying float vAlpha, vLight;
        void main() { gl_FragColor = vec4(vec3(0.64, 0.36, 0.17) * vLight, vAlpha); }`,
      transparent: true, depthWrite: false,
    });
    this.debrisMesh = new InstancedMesh(debrisGeometry, debrisMaterial, FX.impacts.debris);
    this.debrisMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.debrisMesh.count = 0; this.debrisMesh.frustumCulled = false; this.debrisMesh.name = 'fx:sandstone';
    ctx.scene.add(this.debrisMesh);

    const sparkGeometry = new PlaneGeometry(1, 1);
    sparkGeometry.setAttribute('aPosition', this.sparkPos); sparkGeometry.setAttribute('aState', this.sparkState);
    const sparkMaterial = new ShaderMaterial({
      vertexShader: `
        attribute vec3 aPosition; attribute vec4 aState;
        varying vec2 vUv; varying float vAlpha, vPink;
        void main() {
          vUv = uv; vAlpha = aState.y; vPink = aState.w;
          float c = cos(aState.z), s = sin(aState.z);
          vec2 p = mat2(c, -s, s, c) * (position.xy * vec2(0.38, 1.7)) * aState.x;
          vec4 view = viewMatrix * vec4(aPosition, 1.0); view.xy += p;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        varying vec2 vUv; varying float vAlpha, vPink;
        void main() {
          vec2 p = abs(vUv * 2.0 - 1.0);
          float alpha = pow(max(0.0, 1.0 - p.x), 2.0) * pow(max(0.0, 1.0 - p.y), 0.6) * vAlpha;
          vec3 c = mix(vec3(4.5, 2.7, 0.7), vec3(3.6, 0.15, 1.9), vPink);
          gl_FragColor = vec4(c, alpha);
        }`,
      blending: AdditiveBlending, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    });
    this.sparkMesh = new InstancedMesh(sparkGeometry, sparkMaterial, FX.impacts.sparks);
    this.sparkMesh.count = 0; this.sparkMesh.frustumCulled = false; this.sparkMesh.name = 'fx:sparks';
    ctx.scene.add(this.sparkMesh);

    const ringGeometry = new PlaneGeometry(2, 2);
    this.rings = Array.from({ length: FX.impacts.rings }, () => {
      const material = new ShaderMaterial({
        uniforms: { uColor: { value: new Color(0xffd18a) }, uAge: { value: 0 } },
        vertexShader: `varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          varying vec2 vUv; uniform vec3 uColor; uniform float uAge;
          void main() {
            vec2 p = vUv * 2.0 - 1.0; float r = length(p); float angle = atan(p.y, p.x);
            float ring = exp(-pow((r - 0.77) * 66.0, 2.0));
            float noise = 0.65 + sin(angle * 23.0 + uAge * 3.0) * 0.18 + sin(angle * 37.0) * 0.17;
            float dust = exp(-pow((r - 0.87) * 13.0, 2.0)) * noise * 0.38;
            float fade = pow(1.0 - uAge, 1.4);
            gl_FragColor = vec4(uColor * (ring * 2.6 + dust * 0.7), (ring + dust) * fade);
          }`,
        transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false,
      });
      const mesh = new Mesh(ringGeometry, material);
      mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.frustumCulled = false; mesh.name = 'fx:shockwave-dust';
      ctx.scene.add(mesh);
      return { mesh, active: false, age: 0, radius: 1 };
    });
  }

  debris(pos: Vector3, dir: Vector3, count: number): void {
    const r = this.ctx.rng;
    for (let i = 0; i < Math.min(FX.impacts.debris, count); i++) {
      const c = this.chunks[this.debrisCursor++ % this.chunks.length];
      c.x = pos.x + r.range(-0.4, 0.4); c.y = Math.max(0.2, pos.y); c.z = pos.z + r.range(-0.4, 0.4);
      c.vx = dir.x * 3 + r.range(-4.5, 4.5); c.vy = r.range(3, 8); c.vz = dir.z * 3 + r.range(-4.5, 4.5);
      c.rx = r.range(0, 6); c.ry = r.range(0, 6); c.rz = r.range(0, 6); c.spin = r.range(-7, 7);
      c.size = r.range(0.07, 0.24); c.life = c.duration = r.range(1.1, 2.2);
    }
  }

  spark(pos: Vector3, count = 7): void {
    const r = this.ctx.rng;
    for (let i = 0; i < count; i++) {
      const s = this.sparks[this.sparkCursor++ % this.sparks.length], angle = r.range(0, Math.PI * 2);
      const speed = r.range(2, 7);
      s.x = pos.x; s.y = pos.y + 0.45; s.z = pos.z;
      s.vx = Math.sin(angle) * speed; s.vy = r.range(1, 5); s.vz = Math.cos(angle) * speed;
      s.size = r.range(0.06, 0.18); s.rz = r.range(0, 6); s.spin = r.chance(0.2) ? 1 : 0;
      s.life = s.duration = r.range(0.18, 0.46);
    }
  }

  shockwave(pos: Vector3, radius: number, color = 0xffd18a): void {
    let ring = this.rings[0];
    for (let i = 0; i < this.rings.length; i++) if (!this.rings[i].active) { ring = this.rings[i]; break; }
    ring.mesh.position.set(pos.x, Math.max(0.055, pos.y + 0.055), pos.z);
    ring.mesh.material.uniforms.uColor.value.setHex(color);
    ring.age = 0; ring.radius = Math.max(0.1, radius) / 0.77;
    ring.mesh.scale.setScalar(ring.radius * 0.1); ring.active = ring.mesh.visible = true;
    ring.mesh.material.uniforms.uAge.value = 0;
  }

  update(dt: number): void {
    let draw = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) continue;
      c.vy -= dt * 15;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.y < c.size) {
        c.y = c.size; c.vy = Math.abs(c.vy) > 0.8 ? Math.abs(c.vy) * 0.32 : 0;
        c.vx *= 0.75; c.vz *= 0.75; c.spin *= 0.8;
      }
      c.rx += c.spin * dt; c.ry += c.spin * dt * 0.7; c.rz += c.spin * dt * 0.4;
      this.transform.position.set(c.x, c.y, c.z); this.transform.rotation.set(c.rx, c.ry, c.rz);
      this.transform.scale.set(c.size, c.size * 0.67, c.size * 1.2); this.transform.updateMatrix();
      this.debrisMesh.setMatrixAt(draw, this.transform.matrix); this.alpha.setX(draw++, Math.min(1, c.life * 3));
    }
    this.debrisMesh.count = draw;
    this.debrisMesh.instanceMatrix.needsUpdate = this.alpha.needsUpdate = true;
    draw = 0;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vy -= dt * 6; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      this.sparkPos.setXYZ(draw, s.x, s.y, s.z);
      this.sparkState.setXYZW(draw, s.size, s.life / s.duration, s.rz, s.spin); draw++;
    }
    this.sparkMesh.count = draw;
    this.sparkPos.needsUpdate = this.sparkState.needsUpdate = true;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (!r.active) continue;
      r.age += dt;
      if (r.age > 0.75) { r.active = r.mesh.visible = false; continue; }
      const t = r.age / 0.75;
      r.mesh.scale.setScalar(r.radius * (0.08 + 0.92 * (1 - (1 - t) ** 2)));
      r.mesh.material.uniforms.uAge.value = t;
    }
  }

  reset(): void {
    for (let i = 0; i < this.chunks.length; i++) this.chunks[i].life = 0;
    for (let i = 0; i < this.sparks.length; i++) this.sparks[i].life = 0;
    for (let i = 0; i < this.rings.length; i++) this.rings[i].active = this.rings[i].mesh.visible = false;
    this.debrisMesh.count = this.sparkMesh.count = this.debrisCursor = this.sparkCursor = 0;
  }
}
