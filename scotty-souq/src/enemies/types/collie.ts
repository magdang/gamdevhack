import { ConeGeometry, Group } from 'three';
import { ball, eyes, feet, part } from '../Model';

export function createCollie(): Group {
  const group = new Group();
  ball(group, 0x6b233a, 0, 0.67, 0, 0.4, 0.56, 0.48);
  ball(group, 0xfff6dc, 0, 0.77, 0.36, 0.23, 0.39, 0.16);
  ball(group, 0xb78450, 0, 1.13, 0.2, 0.39, 0.36, 0.38);
  for (const side of [-1, 1]) {
    const ear = part(group, new ConeGeometry(0.18, 0.42, 4), 0x6b233a, side * 0.28, 1.43, 0.13);
    ear.rotation.z = -side * 0.2;
  }
  ball(group, 0xfff8e6, 0, 0.99, 0.55, 0.2, 0.15, 0.3);
  ball(group, 0x28202c, 0, 1.04, 0.81, 0.09);
  ball(group, 0xfff8e6, 0, 1.3, 0.48, 0.09, 0.2, 0.08);
  eyes(group, 1.2, 0.51, 0.19, 0.075);
  const tail = ball(group, 0xfff8e6, 0, 0.85, -0.49, 0.13, 0.38, 0.17);
  tail.rotation.x = -0.8;
  feet(group, 0xfff8e6, 0.27, 0.18);
  return group;
}
