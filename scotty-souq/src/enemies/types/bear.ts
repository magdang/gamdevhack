import { BoxGeometry, Group } from 'three';
import { ball, eyes, feet, part } from '../Model';

export function createBear(): Group {
  const group = new Group();
  ball(group, 0x082c51, 0, 0.9, 0, 0.73, 0.8, 0.55);
  ball(group, 0xf1b82d, 0, 1.47, 0.13, 0.66, 0.55, 0.54);
  for (const side of [-1, 1]) {
    ball(group, 0xf1b82d, side * 0.53, 1.88, 0.04, 0.2);
    ball(group, 0xf1b82d, side * 0.77, 0.87, 0.12, 0.23, 0.42, 0.26);
  }
  ball(group, 0xffdb77, 0, 1.3, 0.59, 0.34, 0.23, 0.19);
  ball(group, 0x1d263a, 0, 1.42, 0.76, 0.15, 0.1, 0.08);
  part(group, new BoxGeometry(0.52, 0.12, 0.15), 0xf1b82d, 0, 0.95, 0.53);
  eyes(group, 1.62, 0.58, 0.25, 0.095);
  feet(group, 0xf1b82d, 0.46);
  return group;
}
