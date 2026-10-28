import * as THREE from 'three';
import type { ArenaInfo } from '../core/contracts';
import { Rng } from '../core/rng';
import { WORLD } from './config';
import { archShape, archTrim, awningGeometry, instance, palmCrown, StaticBatch, transform } from './Geometry';
import type { WorldMaterials } from './Materials';

interface Palm { x: number; z: number; height: number; yaw: number; scale: number }
interface Lantern { matrix: THREE.Matrix4; phase: number }

export interface ArenaScene {
  arena: ArenaInfo;
  update(time: number): void;
}

export function buildArena(root: THREE.Group, materials: WorldMaterials): ArenaScene {
  const m = materials;
  // Scenery must not consume the gameplay random stream. Geometry is stable across every restart.
  const rng = new Rng(0x50a9);
  const batch = new StaticBatch();
  const distant = new StaticBatch();
  const beamMatrices: THREE.Matrix4[] = [];
  const awnings: THREE.Matrix4[] = [];
  const sacks: THREE.Matrix4[] = [];
  const spices: THREE.Matrix4[] = [];
  const baskets: THREE.Matrix4[] = [];
  const produceBaskets: THREE.Matrix4[] = [];
  const lanterns: Lantern[] = [];
  const palms: Palm[] = [];
  const box = (mat: THREE.Material, w: number, h: number, d: number, matrix: THREE.Matrix4) =>
    batch.add(mat, new THREE.BoxGeometry(w, h, d), matrix);
  const polar = (a: number, radius: number, y = 0) => new THREE.Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(WORLD.floorRadius, 128).rotateX(-Math.PI / 2), m.floor);
  floor.name = 'continuous walkable plaza and alley paving';
  floor.receiveShadow = true;
  floor.position.y = -0.025;
  root.add(floor);

  // Flat stone compass rose, with concentric joints that stay quiet beneath combat telegraphs.
  for (const [radius, width] of [[3.9, 0.09], [4.15, 0.035], [10.5, 0.045], [17.85, 0.12], [18.1, 0.035]]) {
    batch.add(m.terracotta, new THREE.RingGeometry(radius, radius + width, 128).rotateX(-Math.PI / 2).translate(0, 0.003, 0));
  }
  const star = new THREE.Shape();
  const starPoints: THREE.Vector2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const radius = i % 2 === 0 ? 3.45 : 2.4;
    const x = Math.sin(a) * radius, y = Math.cos(a) * radius;
    starPoints.push(new THREE.Vector2(x, y));
    if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
  }
  star.closePath();
  const starHole = new THREE.Path(starPoints.map((p) => p.clone().multiplyScalar(0.92)).reverse());
  starHole.closePath();
  star.holes.push(starHole);
  batch.add(m.inlay, new THREE.ShapeGeometry(star).rotateX(-Math.PI / 2).translate(0, 0.002, 0));
  batch.add(m.inlay, new THREE.RingGeometry(1.6, 1.68, 48).rotateX(-Math.PI / 2).translate(0, 0.004, 0));
  batch.add(m.terracotta, new THREE.RingGeometry(0.68, 0.76, 48).rotateX(-Math.PI / 2).translate(0, 0.005, 0));
  for (let i = 0; i < 48; i++) {
    const a = i * Math.PI * 2 / 48;
    const p = polar(a, 17.5, 0.005);
    box(m.inlay, 0.055, 0.008, 0.42, transform(p.x, p.y, p.z, 1, 1, 1, a));
  }

  for (let sector = 0; sector < WORLD.gateCount; sector++) {
    for (let shop = -1; shop <= 1; shop++) {
      const a = sector * Math.PI / 4 + shop * WORLD.shopAngle;
      const p = polar(a, WORLD.facadeRadius);
      const basis = transform(p.x, 0, p.z, 1, 1, 1, a + Math.PI);
      const local = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0) =>
        basis.clone().multiply(transform(x, y, z, sx, sy, sz, yaw));
      const isBreach = sector === 4 && shop === 0;
      const height = 6.7 + ((sector + shop + 8) % 3) * 0.8 + (sector % 3 === 0 ? 0.8 : 0);
      const plaster = (sector + shop) % 2 === 0 ? m.plasterLight : m.plaster;
      if (isBreach) {
        // The lower storey is genuinely hollow. Breach.ts supplies its removable masonry plug.
        box(plaster, WORLD.shopWidth, height - WORLD.breach.height, WORLD.shopDepth,
          local(0, (height + WORLD.breach.height) / 2, -WORLD.shopDepth / 2));
        for (const side of [-1, 1]) box(plaster, 0.28, 4.5, WORLD.shopDepth, local(side * 2.48, 2.25, -2.9));
        box(m.trim, 5.05, 0.25, 0.5, local(0, 4.65, 0.1));
      } else {
        box(plaster, WORLD.shopWidth, height, WORLD.shopDepth, local(0, height / 2, -WORLD.shopDepth / 2));
        batch.add(m.recess, new THREE.ShapeGeometry(archShape(2.5, 1.6), 10), local(0, 0.10, 0.025));
        batch.add(m.wood, new THREE.ShapeGeometry(archShape(2.12, 1.52), 10), local(0, 0.1, 0.045));
        batch.add(m.trim, archTrim(2.5, 1.6, 0.16), local(0, 0.08, 0.04));
        for (const x of [-0.72, -0.36, 0, 0.36, 0.72]) box(m.recess, 0.018, 2.0, 0.024, local(x, 1.12, 0.07));
        for (const y of [0.55, 1.52]) {
          box(m.brass, 1.94, 0.07, 0.045, local(0, y, 0.10));
          for (const x of [-0.75, -0.25, 0.25, 0.75]) {
            batch.add(m.brass, new THREE.OctahedronGeometry(0.048), local(x, y, 0.15));
          }
        }
        awnings.push(local(0, 3.45, 0.2, 4.05, 1, 2.05));
        // Ground carpets lie flat. All sacks, palm pots and awning poles stay outside r=18.
        batch.add(m.carpet, new THREE.PlaneGeometry(2.15, 1.45).rotateX(-Math.PI / 2), local(0, 0.012, 1.15));
        if ((shop + sector) % 2 === 0) {
          batch.add(m.carpet, new THREE.PlaneGeometry(0.85, 1.8), local(1.75, 1.9, 0.08));
          box(m.wood, 1.05, 0.08, 0.1, local(1.75, 2.85, 0.15));
        }
        for (let i = 0; i < 3; i++) {
          const x = -1.6 + i * 0.5;
          const z = 0.7 + (i % 2) * 0.55;
          sacks.push(local(x, 0.34, z, 0.42, 0.65 + (i % 2) * 0.15, 0.42));
          spices.push(local(x, 0.63 + (i % 2) * 0.14, z, 0.33, 0.16, 0.33));
          baskets.push(local(x, 0.60 + (i % 2) * 0.14, z, 0.35, 0.35, 0.35));
        }
        produceBaskets.push(local(1.45, 0.24, 1.1));
        for (const x of [-1.95, 1.95]) beamMatrices.push(local(x, 1.55, 2.22, 0.075, 3.1, 0.075));
      }

      // Thick cornices, parapets, and stepped crenellations catch the low sun.
      box(m.trim, WORLD.shopWidth + 0.15, 0.18, WORLD.shopDepth + 0.1, local(0, height - 0.2, -2.9));
      box(plaster, WORLD.shopWidth, 0.45, 0.3, local(0, height + 0.12, -0.06));
      for (let k = 0; k < 6; k++) {
        box(plaster, 0.42, 0.40, 0.36, local(-2.05 + k * 0.82, height + 0.5, -0.06));
      }
      for (const y of [4.8, ...(height > 8 ? [7.0] : [])]) {
        for (const x of [-1.15, 1.15]) {
          box(m.recess, 1.15, 1.2, 0.055, local(x, y, 0.035));
          box(m.trim, 1.42, 0.14, 0.28, local(x, y - 0.67, 0.13));
          box(m.wood, 1.3, 0.12, 0.16, local(x, y + 0.66, 0.13));
          // A simple mashrabiya lattice reads clearly at the gameplay camera scale.
          for (let k = 0; k < 5; k++) batch.add(m.wood, new THREE.PlaneGeometry(0.045, 1.22), local(x - 0.48 + k * 0.24, y, 0.11));
          for (let k = 0; k < 5; k++) batch.add(m.wood, new THREE.PlaneGeometry(1.15, 0.045), local(x, y - 0.48 + k * 0.24, 0.14));
        }
      }
      for (let k = 0; k < 5; k++) {
        beamMatrices.push(local(-1.9 + k * 0.95, height - 0.65, 0.4, 0.16, 0.18, 1.15));
      }
      for (const x of [-2.05, 2.05]) {
        beamMatrices.push(local(x, 3.65, 0.4, 0.1, 0.12, 0.95));
        lanterns.push({ matrix: local(x, 3.35, 0.76), phase: rng.range(0, Math.PI * 2) });
      }

      // Discrete flower clusters bring the reference art's magenta accents to the roofs.
      if ((sector + shop + 2) % 3 === 0) {
        for (let k = 0; k < 6; k++) {
          batch.add(m.flower, new THREE.IcosahedronGeometry(rng.range(0.19, 0.31), 0),
            local(1.9 + Math.sin(k * 2) * 0.26, 3.9 + k * 0.35, 0.25));
        }
      }
    }

    const a = sector * Math.PI / 4 + WORLD.gateOffset;
    // Long side walls frame each alley without bridging or filling the spawn route.
    for (const sign of [-1, 1]) {
      const p = polar(a, 27.6);
      const basis = transform(p.x, 0, p.z, 1, 1, 1, a + Math.PI);
      box(m.plaster, 0.45, 5.3, 11, basis.clone().multiply(transform(sign * 2.05, 2.65, -1.5)));
    }
    const pa = sector * Math.PI / 4 + 0.12;
    const p = polar(pa, 19.55);
    palms.push({ x: p.x, z: p.z, height: rng.range(5.6, 6.7), yaw: a, scale: rng.range(0.85, 1.05) });
    batch.add(m.trim, new THREE.CylinderGeometry(0.65, 0.85, 0.4, 10), transform(p.x, 0.2, p.z));
  }

  batch.finish(root, 'souq static material batches');
  instance(root, 'instanced danshal and awning supports', new THREE.BoxGeometry(), m.wood, beamMatrices);
  instance(root, 'instanced striped awnings', awningGeometry(), m.awning, awnings, false);
  instance(root, 'instanced spice sacks', new THREE.SphereGeometry(1, 8, 4), m.sack, sacks);
  instance(root, 'instanced heaps of spices', new THREE.SphereGeometry(1, 6, 3), m.spice, spices, false);
  instance(root, 'instanced woven sack rims', new THREE.TorusGeometry(1, 0.08, 3, 8).rotateX(Math.PI / 2), m.wood, baskets, false);
  instance(root, 'instanced market baskets', new THREE.CylinderGeometry(0.48, 0.35, 0.42, 8, 1), m.sack, produceBaskets);
  instance(root, 'instanced dried mint baskets', new THREE.SphereGeometry(0.42, 6, 3).scale(1, 0.3, 1).translate(0, 0.23, 0), m.greenSpice, produceBaskets, false);

  const lanternBatch = new StaticBatch();
  lanternBatch.add(m.brass, new THREE.CylinderGeometry(0.25, 0.22, 0.09, 6).translate(0, -0.62, 0));
  lanternBatch.add(m.brass, new THREE.ConeGeometry(0.3, 0.2, 6).translate(0, -0.15, 0));
  lanternBatch.add(m.brass, new THREE.BoxGeometry(0.025, 0.11, 0.025).translate(0, -0.015, 0));
  lanternBatch.add(m.brass, new THREE.OctahedronGeometry(0.065).translate(0, -0.75, 0));
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI * 2 / 6;
    lanternBatch.add(m.brass, new THREE.BoxGeometry(0.025, 0.43, 0.025).translate(Math.sin(a) * 0.22, -0.4, Math.cos(a) * 0.22));
  }
  const temporary = new THREE.Group();
  lanternBatch.finish(temporary, 'lantern template', false);
  const cageGeometry = (temporary.children[0] as THREE.Mesh).geometry;
  const lanternMatrices = lanterns.map((l) => l.matrix);
  const cages = instance(root, 'instanced brass lantern cages', cageGeometry, m.brass, lanternMatrices, false);
  const glass = instance(root, 'instanced glowing lantern glass', new THREE.CylinderGeometry(0.205, 0.19, 0.39, 6).translate(0, -0.4, 0), m.lantern, lanternMatrices, false);
  cages.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const trunks = palms.map((p) => transform(p.x, p.height / 2, p.z, 1, p.height, 1, p.yaw));
  instance(root, 'instanced date palm trunks', new THREE.CylinderGeometry(0.18, 0.32, 1, 7, 4), m.trunk, trunks);
  const crowns = instance(root, 'instanced swaying palm crowns', palmCrown(), m.leaf,
    palms.map((p) => transform(p.x, p.height, p.z, p.scale, p.scale, p.scale, p.yaw)));
  crowns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Far silhouettes: a tapering Fanar tower and one continuous helical ribbon around its shaft.
  const minaret = transform(-22, 0, -64);
  const towerBox = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    distant.add(m.skyline, new THREE.BoxGeometry(w, h, d), transform(x, y, z));
  towerBox(11, 5, 9, -22, 2.5, -64);
  distant.add(m.skyline, new THREE.CylinderGeometry(1.25, 3.0, 17, 16), minaret.clone().multiply(transform(0, 12.5, 0)));
  const helix: THREE.Vector3[] = [];
  for (let i = 0; i <= 144; i++) {
    const t = i / 144, a = t * Math.PI * 8;
    const r = 3.15 - t * 1.7;
    helix.push(new THREE.Vector3(-22 + Math.cos(a) * r, 5 + t * 16, -64 + Math.sin(a) * r));
  }
  distant.add(m.skyline, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 144, 0.24, 4, false));
  distant.add(m.skyline, new THREE.CylinderGeometry(0.65, 0.9, 2.6, 10), transform(-22, 22.3, -64));
  distant.add(m.skyline, new THREE.ConeGeometry(1.0, 1.8, 10), transform(-22, 24.5, -64));
  for (let i = 0; i < 15; i++) {
    const x = 12 + i * 3.5, z = -77 - rng.range(0, 10), h = rng.range(8, 20);
    if (i === 4 || i === 9) {
      distant.add(m.skyline, new THREE.CylinderGeometry(0.4, 1.6, h, 8), transform(x, h / 2, z));
    } else towerBox(rng.range(1.8, 3.4), h, 2.5, x, h / 2, z);
    if (i % 3 === 0) towerBox(0.12, 3, 0.12, x, h + 1.5, z);
  }
  distant.finish(root, 'Fanar and Doha skyline', false);

  const gates = Array.from({ length: WORLD.gateCount }, (_, id) => {
    const a = WORLD.gateOffset + id * Math.PI * 2 / WORLD.gateCount;
    return { id, position: polar(a, WORLD.gateRadius), inward: polar(a, -1) };
  });
  const arena: ArenaInfo = {
    radius: WORLD.radius,
    gates,
    bossBreach: { position: new THREE.Vector3(0, 0, -WORLD.facadeRadius), inward: new THREE.Vector3(0, 0, 1) },
    clamp(p, radius) {
      const max = Math.max(0, WORLD.radius - Math.max(0, radius));
      const distance = Math.hypot(p.x, p.z);
      if (distance > max) {
        const scale = max / distance;
        p.x *= scale;
        p.z *= scale;
      }
      return p;
    },
  };
  root.userData.arena = { radius: arena.radius, gates: gates.map((g) => g.position.toArray()) };

  const dummy = new THREE.Object3D();
  const sway = new THREE.Matrix4();
  return {
    arena,
    update(time) {
      m.windTime.value = time;
      for (let i = 0; i < lanterns.length; i++) {
        const l = lanterns[i];
        sway.makeRotationZ(Math.sin(time * 1.4 + l.phase) * WORLD.lanternSway);
        dummy.matrix.multiplyMatrices(l.matrix, sway);
        cages.setMatrixAt(i, dummy.matrix);
        glass.setMatrixAt(i, dummy.matrix);
      }
      cages.instanceMatrix.needsUpdate = glass.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < palms.length; i++) {
        const p = palms[i];
        dummy.position.set(p.x, p.height, p.z);
        dummy.rotation.set(Math.sin(time * 0.8 + i) * WORLD.palmSway, p.yaw, Math.cos(time * 0.65 + i) * WORLD.palmSway);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        crowns.setMatrixAt(i, dummy.matrix);
      }
      crowns.instanceMatrix.needsUpdate = true;
    },
  };
}
