import * as THREE from 'three';
import type { KitContext, PlayerView, WorldKit } from '../core/contracts';
import { COMBAT } from './config';
import { distanceToSegmentSq } from './Shapes';

interface Dart { mesh: THREE.Mesh; dir: THREE.Vector3; remaining: number }

export class Projectiles {
  private darts: Dart[] = [];
  private geometry: THREE.ConeGeometry | null = null;
  private material: THREE.MeshStandardMaterial | null = null;
  private previous = new THREE.Vector3();
  constructor(private ctx: KitContext, private world: WorldKit) {}

  fire(from: THREE.Vector3, dir: THREE.Vector3, range: number): void {
    this.geometry ??= new THREE.ConeGeometry(0.12, 0.65, 7).rotateX(Math.PI / 2);
    this.material ??= new THREE.MeshStandardMaterial({ color: 0xffd153, emissive: 0xd56108, emissiveIntensity: 0.8 });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.position.copy(from);
    mesh.position.y = COMBAT.projectileHeight;
    const direction = dir.clone().setY(0).normalize();
    mesh.rotation.y = Math.atan2(direction.x, direction.z);
    this.ctx.scene.add(mesh);
    this.darts.push({ mesh, dir: direction, remaining: range });
    this.ctx.events.emit('projectile:fired', { position: mesh.position, dir: direction });
  }

  update(dt: number, player: PlayerView): void {
    for (let i = this.darts.length - 1; i >= 0; i--) {
      const dart = this.darts[i];
      this.previous.copy(dart.mesh.position);
      const step = Math.min(dart.remaining, COMBAT.projectileSpeed * dt);
      dart.remaining -= step;
      dart.mesh.position.addScaledVector(dart.dir, step);
      const hit = distanceToSegmentSq(player.position, this.previous, dart.mesh.position)
        <= (player.radius + COMBAT.projectileRadius) ** 2;
      if (hit && !player.invulnerable) player.hurt(COMBAT.damage, this.previous);
      if (hit || dart.remaining <= 0 || Math.hypot(dart.mesh.position.x, dart.mesh.position.z) > this.world.arena.radius + 3) {
        dart.mesh.removeFromParent();
        this.darts.splice(i, 1);
      }
    }
  }

  reset(): void {
    for (const dart of this.darts) dart.mesh.removeFromParent();
    this.darts.length = 0;
    this.geometry?.dispose();
    this.material?.dispose();
    this.geometry = null;
    this.material = null;
  }
}
