import * as THREE from 'three';
import { ball, eyes, part } from '../enemies/Model';

export function createDeanFace(): THREE.Group {
  const group = new THREE.Group();
  ball(group, 0xf0bb89, 0, 2.17, 0, 1.68, 1.82, 1.42);
  for (const side of [-1, 1]) {
    ball(group, 0xe6a475, side * 1.65, 2.25, 0, 0.29, 0.46, 0.32);
    const rim = part(group, new THREE.TorusGeometry(0.52, 0.085, 7, 22), 0x24233b, side * 0.65, 2.65, 1.29);
    rim.scale.y = 0.85;
    const brow = part(group, new THREE.BoxGeometry(0.9, 0.14, 0.16), 0x342131, side * 0.65, 3.18, 1.15);
    brow.rotation.z = side * 0.24;
    brow.name = 'eyebrow';
    ball(group, 0x90909a, side * 1.35, 2.65, -0.45, 0.34, 0.75, 0.8);
  }
  eyes(group, 2.64, 1.33, 0.64, 0.23);
  ball(group, 0xe9a974, 0, 2.14, 1.44, 0.29, 0.38, 0.36);
  part(group, new THREE.BoxGeometry(0.26, 0.09, 0.13), 0x24233b, 0, 2.67, 1.39);
  part(group, new THREE.BoxGeometry(0.72, 0.12, 0.12), 0x813d40, 0, 1.48, 1.25);
  part(group, new THREE.CylinderGeometry(1.12, 1.17, 0.48, 12), 0x202238, 0, 3.88, -0.03);
  const board = part(group, new THREE.BoxGeometry(3.2, 0.17, 3.2), 0x171b2f, 0, 4.16, -0.03);
  board.rotation.y = Math.PI / 4;
  part(group, new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), 0xf5c65a, 1.6, 3.84, 0);
  ball(group, 0xf5c65a, 1.6, 3.42, 0, 0.09, 0.19, 0.09);
  return group;
}

/** A separate floating glove keeps the club usable with either the fallback or a static GLB. */
export function createClub(): THREE.Group {
  const group = new THREE.Group();
  part(group, new THREE.CylinderGeometry(0.12, 0.18, 2.6, 9), 0x684333, 0, 1.1, 0);
  ball(group, 0xfff5df, 0, 0.35, 0.1, 0.46, 0.4, 0.38);
  for (let i = 0; i < 3; i++) ball(group, 0xffffff, -0.27 + i * 0.23, 0.42, 0.36, 0.14, 0.25, 0.16);
  ball(group, 0xffffff, 0.39, 0.49, 0.08, 0.19, 0.25, 0.23);
  part(group, new THREE.CylinderGeometry(0.29, 0.29, 0.14, 10), 0xd0d3e2, 0, -0.01, 0.09);
  ball(group, 0x788193, 0, 2.65, 0, 0.82, 0.95, 0.82);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3 + row * 0.3;
      const dir = new THREE.Vector3(Math.sin(angle), (row - 1) * 0.45, Math.cos(angle)).normalize();
      const spike = part(group, new THREE.ConeGeometry(0.18, 0.75, 5), 0xc6ccd3,
        dir.x * 0.89, 2.65 + (row - 1) * 0.63, dir.z * 0.89);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
  }
  return group;
}
