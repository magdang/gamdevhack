import { BoxGeometry, Group } from 'three';
import { ball, eyes, feet, part } from '../Model';

export function createBeaver(): Group {
  const group = new Group();
  ball(group, 0xa31f34, 0, 0.72, 0, 0.63, 0.67, 0.5);
  ball(group, 0x929699, 0, 1.16, 0.2, 0.53, 0.45, 0.45);
  for (const side of [-1, 1]) ball(group, 0x6b7075, side * 0.43, 1.49, 0.13, 0.17);
  ball(group, 0xc4c4ba, 0, 1.01, 0.56, 0.34, 0.22, 0.18);
  ball(group, 0x28262d, 0, 1.14, 0.71, 0.13, 0.1, 0.09);
  for (const side of [-1, 1]) part(group, new BoxGeometry(0.12, 0.22, 0.12), 0xfff9e8, side * 0.08, 0.86, 0.7);
  const tail = part(group, new BoxGeometry(0.56, 0.16, 1.05), 0x6b7075, 0, 0.27, -0.78);
  tail.rotation.x = -0.15;
  eyes(group, 1.28, 0.59, 0.22, 0.085);
  feet(group, 0x6b7075, 0.4);
  return group;
}
