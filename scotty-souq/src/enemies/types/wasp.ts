import { ConeGeometry, Group, TorusGeometry } from 'three';
import { ball, eyes, part } from '../Model';

export function createWasp(): Group {
  const group = new Group();
  ball(group, 0xe8b83b, 0, 0.65, 0, 0.43, 0.48, 0.65);
  for (const z of [-0.25, 0.05]) part(group, new TorusGeometry(0.42, 0.085, 5, 14), 0x17294d, 0, 0.65, z);
  ball(group, 0xf1c54a, 0, 0.92, 0.44, 0.44, 0.4, 0.35);
  for (const side of [-1, 1]) {
    const wing = ball(group, 0xe3f6ff, side * 0.56, 1.03, -0.1, 0.56, 0.07, 0.27);
    wing.rotation.z = side * 0.3;
    part(group, new ConeGeometry(0.045, 0.42, 5), 0x17294d, side * 0.2, 1.38, 0.45);
  }
  const stinger = part(group, new ConeGeometry(0.14, 0.45, 6), 0x17294d, 0, 0.59, -0.77);
  stinger.rotation.x = -Math.PI / 2;
  eyes(group, 1.01, 0.74, 0.21, 0.1);
  return group;
}
