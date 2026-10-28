import { BoxGeometry, Group } from 'three';
import { ball, eyes, feet, part } from '../Model';

export function createTiger(): Group {
  const group = new Group();
  ball(group, 0xf28b27, 0, 0.79, 0, 0.55, 0.67, 0.47);
  ball(group, 0xf28b27, 0, 1.35, 0.15, 0.54, 0.46, 0.47);
  for (const side of [-1, 1]) {
    ball(group, 0x29232b, side * 0.42, 1.7, 0.08, 0.17);
    ball(group, 0xf28b27, side * 0.42, 1.71, 0.13, 0.11);
    for (let i = 0; i < 3; i++) {
      const stripe = part(group, new BoxGeometry(0.28, 0.09, 0.08), 0x29232b,
        side * 0.36, 0.64 + i * 0.2, 0.4);
      stripe.rotation.z = side * 0.35;
    }
    ball(group, 0xffecc7, side * 0.16, 1.16, 0.56, 0.2, 0.16, 0.16);
  }
  part(group, new BoxGeometry(0.11, 0.23, 0.08), 0x29232b, 0, 1.62, 0.56);
  ball(group, 0x29232b, 0, 1.28, 0.71, 0.1, 0.07, 0.08);
  const tail = ball(group, 0xf28b27, 0, 0.66, -0.68, 0.12, 0.17, 0.55);
  tail.rotation.x = -0.35;
  eyes(group, 1.43, 0.55, 0.23, 0.09);
  feet(group, 0xffecc7, 0.36);
  return group;
}
