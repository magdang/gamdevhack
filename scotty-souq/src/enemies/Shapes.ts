import { Vector3 } from 'three';

export type AttackShape =
  | { kind: 'circle'; center: Vector3; radius: number }
  | { kind: 'arc' | 'cone'; center: Vector3; facing: number; radius: number; halfAngle: number }
  | { kind: 'line'; center: Vector3; facing: number; length: number; width: number };

export function segmentFraction(p: Vector3, a: Vector3, b: Vector3): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  return lengthSq > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq)) : 0;
}

export function distanceToSegmentSq(p: Vector3, a: Vector3, b: Vector3): number {
  const t = segmentFraction(p, a, b);
  return (p.x - a.x - (b.x - a.x) * t) ** 2 + (p.z - a.z - (b.z - a.z) * t) ** 2;
}

/** Exact circle versus filled sector, including circles grazing either radial edge. */
export function circleOverlapsSector(p: Vector3, r: number, center: Vector3,
  facing: number, radius: number, halfAngle: number): boolean {
  const dx = p.x - center.x;
  const dz = p.z - center.z;
  const distance = Math.hypot(dx, dz);
  if (distance > radius + r) return false;
  if (distance <= r || halfAngle >= Math.PI) return true;
  const angle = Math.atan2(Math.sin(Math.atan2(dx, dz) - facing), Math.cos(Math.atan2(dx, dz) - facing));
  if (Math.abs(angle) <= halfAngle) return true;
  const edgeAngle = facing + Math.sign(angle) * halfAngle;
  const ex = Math.sin(edgeAngle) * radius;
  const ez = Math.cos(edgeAngle) * radius;
  const t = Math.max(0, Math.min(1, (dx * ex + dz * ez) / (radius * radius || 1)));
  return (dx - ex * t) ** 2 + (dz - ez * t) ** 2 <= r * r;
}

export function overlaps(shape: AttackShape, p: Vector3, r: number): boolean {
  if (shape.kind === 'circle') {
    return (p.x - shape.center.x) ** 2 + (p.z - shape.center.z) ** 2 <= (shape.radius + r) ** 2;
  }
  if (shape.kind !== 'line') {
    return circleOverlapsSector(p, r, shape.center, shape.facing, shape.radius, shape.halfAngle);
  }
  const dx = p.x - shape.center.x;
  const dz = p.z - shape.center.z;
  const x = dx * Math.cos(shape.facing) - dz * Math.sin(shape.facing);
  const z = dx * Math.sin(shape.facing) + dz * Math.cos(shape.facing);
  const ox = Math.max(0, Math.abs(x) - shape.width / 2);
  const oz = Math.max(0, -z, z - shape.length);
  return ox * ox + oz * oz <= r * r;
}

export function shapeEnd(shape: AttackShape): Vector3 {
  return shape.kind === 'line'
    ? shape.center.clone().add(new Vector3(Math.sin(shape.facing), 0, Math.cos(shape.facing)).multiplyScalar(shape.length))
    : shape.center.clone();
}
