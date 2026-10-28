import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WORLD } from './config';
import type { WorldMaterials } from './Materials';

interface Chunk { origin: THREE.Vector3; position: THREE.Vector3; velocity: THREE.Vector3; spin: THREE.Vector3; rotation: THREE.Vector3 }
interface Puff { position: THREE.Vector3; velocity: THREE.Vector3; scale: number }

/** A preallocated masonry plug, rubble pool and one instanced soft-dust draw call. */
export function createBreach(root: THREE.Group, materials: WorldMaterials) {
  const cfg = WORLD.breach;
  const rng = new Rng(0xb0a55);
  const chunks: Chunk[] = [];
  const width = cfg.width / cfg.columns, height = cfg.height / cfg.rows;
  const chunkMaterial = materials.plasterLight.clone();
  chunkMaterial.name = 'breakable souq masonry';
  // Keep the shared stone sampler when the asynchronous texture load completes.
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(width - 0.025, height - 0.025, 0.65), chunkMaterial, cfg.columns * cfg.rows);
  wall.name = 'boss breach removable masonry and flying rubble';
  wall.castShadow = wall.receiveShadow = true;
  wall.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  for (let y = 0; y < cfg.rows; y++) {
    for (let x = 0; x < cfg.columns; x++) {
      const origin = new THREE.Vector3((x + 0.5) * width - cfg.width / 2, (y + 0.5) * height, -WORLD.facadeRadius);
      chunks.push({ origin, position: origin.clone(), velocity: new THREE.Vector3(), spin: new THREE.Vector3(), rotation: new THREE.Vector3() });
    }
  }
  root.add(wall);

  // A ragged rim remains when the plug is removed, framing the warm interior.
  const rimGeometry = new THREE.ConeGeometry(0.24, 0.7, 4);
  const rim = new THREE.InstancedMesh(rimGeometry, materials.plaster, 14);
  rim.name = 'jagged permanent breach edges';
  for (let i = 0; i < 14; i++) {
    dummy.position.set(i < 8 ? (i / 7 - 0.5) * cfg.width : (i % 2 ? -1 : 1) * cfg.width / 2,
      i < 8 ? 4.5 : 0.6 + Math.floor((i - 8) / 2) * 1.25, -WORLD.facadeRadius);
    dummy.rotation.set(i < 8 ? Math.PI : 0, 0, i < 8 ? 0 : (i % 2 ? -1 : 1) * Math.PI / 2);
    dummy.scale.set(1, rng.range(0.8, 1.4), 1);
    dummy.updateMatrix();
    rim.setMatrixAt(i, dummy.matrix);
  }
  rim.visible = false;
  rim.castShadow = true;
  root.add(rim);

  const glow = new THREE.PointLight(0xff9b3e, 0, 10, 2);
  glow.name = 'breach interior practical, fourth point light';
  glow.position.set(0, 2.6, -WORLD.facadeRadius + 1);
  root.add(glow);
  const interiorMaterial = new THREE.MeshBasicMaterial({ color: 0xe8a965, side: THREE.DoubleSide });
  const interior = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.3), interiorMaterial);
  interior.position.set(0, 2.15, -WORLD.facadeRadius - WORLD.shopDepth + 0.1);
  interior.name = 'lit passage visible beyond breached wall';
  interior.visible = false;
  root.add(interior);

  const dustMaterial = new THREE.ShaderMaterial({
    name: 'soft instanced breach dust', transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float scale = length(instanceMatrix[0].xyz);
        centre.xy += position.xy * scale;
        gl_Position = projectionMatrix * centre;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float alpha = (1.0 - smoothstep(0.0, 1.0, r)) * uOpacity;
        gl_FragColor = vec4(0.76, 0.58, 0.40, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const dust = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dustMaterial, cfg.dustCount);
  dust.name = 'instanced billboard dust puffs';
  dust.frustumCulled = false;
  dust.visible = false;
  dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(dust);
  const puffs: Puff[] = Array.from({ length: cfg.dustCount }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), scale: 1 }));
  let breached = false, age = 0;

  const writeChunks = () => {
    chunks.forEach((chunk, i) => {
      dummy.position.copy(chunk.position);
      dummy.rotation.set(chunk.rotation.x, chunk.rotation.y, chunk.rotation.z);
      const fade = breached ? 1 - THREE.MathUtils.smoothstep(age, cfg.rubbleSeconds - 1.5, cfg.rubbleSeconds) : 1;
      dummy.scale.setScalar(fade);
      dummy.updateMatrix();
      wall.setMatrixAt(i, dummy.matrix);
    });
    wall.instanceMatrix.needsUpdate = true;
    wall.computeBoundingSphere();
  };
  writeChunks();

  return {
    breach() {
      if (breached) return;
      breached = true;
      age = 0;
      rim.visible = interior.visible = dust.visible = true;
      glow.intensity = 55;
      chunks.forEach((chunk) => {
        chunk.velocity.set(chunk.origin.x * 0.6 + rng.range(-1.2, 1.2), rng.range(2.3, 6.2), rng.range(2, 4.5));
        chunk.spin.set(rng.range(-3, 3), rng.range(-3, 3), rng.range(-3, 3));
      });
      puffs.forEach((puff) => {
        puff.position.set(rng.range(-2, 2), rng.range(0.4, 4), -WORLD.facadeRadius + 0.6);
        puff.velocity.set(rng.range(-1.4, 1.4), rng.range(0.1, 1.1), rng.range(0.5, 2.8));
        puff.scale = rng.range(1.2, 2.4);
      });
      // Populate matrices immediately, even if the caller renders before the next update.
      dustMaterial.uniforms.uOpacity.value = 0.55;
      puffs.forEach((puff, i) => {
        dummy.position.copy(puff.position); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(puff.scale);
        dummy.updateMatrix(); dust.setMatrixAt(i, dummy.matrix);
      });
      dust.instanceMatrix.needsUpdate = true;
    },
    update(dt: number) {
      if (chunkMaterial.map !== materials.plasterLight.map) {
        chunkMaterial.map = materials.plasterLight.map;
        chunkMaterial.color.copy(materials.plasterLight.color);
        chunkMaterial.needsUpdate = true;
      }
      if (!breached) return;
      age += dt;
      glow.intensity = 30 + Math.exp(-age * 3) * 25;
      if (age < cfg.rubbleSeconds) {
        // Substeps keep the floor bounce stable after tab switches or large unscaled deltas.
        const steps = Math.max(1, Math.ceil(Math.min(dt, 0.25) / 0.025));
        const stepDt = Math.min(dt, 0.25) / steps;
        for (let step = 0; step < steps; step++) {
          for (const chunk of chunks) {
            chunk.velocity.y -= cfg.gravity * stepDt;
            chunk.position.addScaledVector(chunk.velocity, stepDt);
            chunk.rotation.addScaledVector(chunk.spin, stepDt);
            if (chunk.position.y < height * 0.35) {
              chunk.position.y = height * 0.35;
              chunk.velocity.y = Math.abs(chunk.velocity.y) * 0.25;
              chunk.velocity.x *= 0.75; chunk.velocity.z *= 0.75; chunk.spin.multiplyScalar(0.7);
            }
          }
        }
        writeChunks();
      } else wall.visible = false;
      if (age < cfg.dustSeconds) {
        dustMaterial.uniforms.uOpacity.value = 0.55 * (1 - age / cfg.dustSeconds) ** 1.4;
        puffs.forEach((puff, i) => {
          puff.position.addScaledVector(puff.velocity, Math.min(dt, 0.1));
          dummy.position.copy(puff.position);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(puff.scale * (1 + age * 0.7));
          dummy.updateMatrix(); dust.setMatrixAt(i, dummy.matrix);
        });
        dust.instanceMatrix.needsUpdate = true;
      } else dust.visible = false;
    },
    reset() {
      breached = false;
      age = 0;
      glow.intensity = 0;
      rim.visible = interior.visible = dust.visible = false;
      wall.visible = true;
      for (const chunk of chunks) {
        chunk.position.copy(chunk.origin); chunk.velocity.set(0, 0, 0); chunk.rotation.set(0, 0, 0);
      }
      writeChunks();
    },
  };
}
