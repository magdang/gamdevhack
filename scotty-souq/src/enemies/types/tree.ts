import { BoxGeometry, ConeGeometry, CylinderGeometry, Group } from 'three';
import { eyes, feet, part } from '../Model';

export function createTree(): Group {
  const group = new Group();
  part(group, new CylinderGeometry(0.28, 0.36, 1.4, 9), 0x795234, 0, 0.75, 0);
  for (let i = 0; i < 3; i++) part(group, new ConeGeometry(0.95 - i * 0.18, 1.05, 9),
    i % 2 ? 0x157842 : 0x236b38, 0, 1.05 + i * 0.52, 0);
  const sash = part(group, new BoxGeometry(1.42, 0.23, 0.2), 0xb82237, 0, 1.35, 0.66);
  sash.rotation.z = -0.45;
  for (const side of [-1, 1]) {
    const branch = part(group, new CylinderGeometry(0.12, 0.15, 1.05, 7), 0x795234, side * 0.85, 1.13, 0);
    branch.rotation.z = side * 1.05;
  }
  eyes(group, 1.7, 0.6, 0.22, 0.11);
  feet(group, 0x795234, 0.35);
  return group;
}
