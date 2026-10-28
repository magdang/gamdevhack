import * as THREE from 'three';
import type { ArenaInfo, GameClock, KitContext, PlayerView } from '../core/contracts';
import { CONFIG } from '../core/config';
import { angleDelta, damp } from '../core/math';

export class Player implements PlayerView {
  readonly root = new THREE.Group();
  readonly position = this.root.position;
  readonly velocity = new THREE.Vector3();
  readonly radius = CONFIG.player.radius;
  readonly maxHp = CONFIG.player.maxHp;
  hp: number = this.maxHp;
  facing = Math.PI;
  dashing = false;
  cinematic = false;
  private iframe = 0;
  private knock = new THREE.Vector3();
  private visual = new THREE.Group();
  private body = new THREE.Group();
  private sword = new THREE.Group();
  private tail = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private gait = 0;
  private swingLeft = 0;
  private swingSide: 1 | -1 = 1;
  private turnLean = 0;
  private modelLoaded = false;
  private disposed = false;

  get invulnerable(): boolean { return this.ctx.debug.god || this.iframe > 0 || this.dashing || this.cinematic || this.hp <= 0; }

  constructor(private ctx: KitContext, private arena: ArenaInfo) {
    this.root.name = 'Scotty';
    this.root.add(this.visual);
    this.visual.add(this.body);
    this.makeFallback();
    this.makeSword();
    this.visual.add(this.sword);
    ctx.scene.add(this.root);
    void ctx.assets.model('scotty').then((model) => {
      if (!model || this.disposed) return;
      this.modelLoaded = true;
      this.body.visible = false;
      this.visual.add(model);
    });
    this.reset();
  }

  private makeFallback(): void {
    const black = new THREE.MeshStandardMaterial({ color: 0x171720, roughness: 0.8 });
    const muzzle = new THREE.MeshStandardMaterial({ color: 0x36333d, roughness: 1 });
    const red = new THREE.MeshStandardMaterial({ color: 0xde2349, roughness: 0.6 });
    const addBox = (parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, mat = black) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
    };
    addBox(this.body, 0, 0.47, -0.12, 0.58, 0.45, 0.95);
    addBox(this.body, 0, 0.71, 0.43, 0.57, 0.46, 0.5);
    addBox(this.body, 0, 0.57, 0.75, 0.44, 0.27, 0.42, muzzle);
    addBox(this.body, 0, 0.62, 0.97, 0.22, 0.12, 0.09);
    // Short legs, upright ears, beard and a red scarf make the silhouette unmistakable.
    for (const x of [-0.22, 0.22]) {
      for (const z of [-0.42, 0.25]) {
        const leg = new THREE.Group(); leg.position.set(x, 0.3, z);
        addBox(leg, 0, -0.13, 0, 0.16, 0.3, 0.2); this.body.add(leg); this.legs.push(leg);
      }
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.34, 4), black);
      ear.position.set(x, 1.03, 0.38); ear.rotation.y = Math.PI / 4; this.body.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffdd88, emissive: 0x49310e }));
      eye.position.set(x, 0.78, 0.687); this.body.add(eye);
    }
    addBox(this.body, 0, 0.41, 0.69, 0.4, 0.18, 0.4, muzzle);
    addBox(this.body, 0, 0.61, 0.3, 0.65, 0.15, 0.23, red);
    const scarf = addBox(this.body, -0.37, 0.43, 0.16, 0.16, 0.5, 0.12, red); scarf.rotation.z = -0.28;
    addBox(this.body, -0.373, 0.47, 0.23, 0.17, 0.045, 0.014, muzzle);
    this.tail.position.set(0, 0.58, -0.55); this.tail.rotation.x = -0.35;
    addBox(this.tail, 0, 0.23, 0, 0.13, 0.5, 0.13); this.body.add(this.tail);
  }

  private makeSword(): void {
    this.sword.position.set(0.28, 0.64, 0.75);
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.05); shape.lineTo(0.5, -0.07); shape.quadraticCurveTo(1.65, -0.01, 2.05, 0.43);
    shape.quadraticCurveTo(1.2, 0.19, 0.12, 0.12); shape.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0xfff4cb, metalness: 0.75, roughness: 0.22, emissive: 0xffd879, emissiveIntensity: 0.6 }));
    this.sword.add(blade);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.1, 0.12, 0.025), new THREE.Vector3(1.2, 0.19, 0.025), new THREE.Vector3(2.05, 0.43, 0.025));
    this.sword.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.028, 5, false), new THREE.MeshBasicMaterial({ color: 0xfff8dd, toneMapped: false })));
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.15), new THREE.MeshStandardMaterial({ color: 0xdba747, metalness: 0.8, roughness: 0.3 }));
    this.sword.add(guard);
  }

  hurt(amount: number, from: THREE.Vector3): boolean {
    if (this.invulnerable || amount <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.iframe = CONFIG.player.hurtIFrames;
    this.knock.subVectors(this.position, from).setY(0);
    if (this.knock.lengthSq() < 0.01) this.knock.set(0, 0, 1);
    this.knock.normalize().multiplyScalar(CONFIG.player.knockback);
    this.ctx.events.emit('player:hurt', { hp: this.hp, maxHp: this.maxHp, position: this.position, from });
    this.ctx.events.emit('camera:shake', { intensity: 0.35, duration: 0.25 });
    this.ctx.events.emit('time:hitstop', { duration: 0.07 });
    if (this.hp <= 0) this.ctx.events.emit('player:died', { position: this.position });
    return true;
  }

  face(direction: THREE.Vector3, snap = false): void {
    if (direction.lengthSq() < 0.001) return;
    const target = Math.atan2(direction.x, direction.z);
    const delta = angleDelta(this.facing, target);
    this.turnLean = Math.max(-0.22, Math.min(0.22, -delta * 0.2));
    this.facing += snap ? delta : delta * 0.3;
  }

  swing(side: 1 | -1): void { this.swingSide = side; this.swingLeft = CONFIG.slash.duration; }

  update(clock: GameClock, move: THREE.Vector3, locked: boolean): void {
    const dt = clock.dt;
    this.iframe = Math.max(0, this.iframe - dt);
    if (!this.dashing && !this.cinematic) {
      const speed = locked || this.hp <= 0 ? 0 : CONFIG.player.speed;
      this.velocity.x += (move.x * speed - this.velocity.x) * damp(CONFIG.player.acceleration, dt);
      this.velocity.z += (move.z * speed - this.velocity.z) * damp(CONFIG.player.acceleration, dt);
      this.position.addScaledVector(this.velocity, dt).addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.exp(-10 * dt));
      this.arena.clamp(this.position, this.radius);
      if (this.swingLeft <= 0 && this.velocity.lengthSq() > 0.05) this.face(this.velocity);
    }
    this.animate(clock);
  }

  private animate(clock: GameClock): void {
    const speed = this.velocity.length() / CONFIG.player.speed;
    this.gait += clock.dt * (7 + speed * 9);
    this.swingLeft = Math.max(0, this.swingLeft - clock.dt);
    this.root.rotation.y = this.facing;
    const dash = this.dashing || this.cinematic;
    this.visual.position.y = dash ? 0.08 : Math.abs(Math.sin(this.gait)) * 0.065 * speed;
    this.visual.scale.set(dash ? 0.76 : 1 + Math.sin(this.gait * 2) * 0.025 * speed, dash ? 0.72 : 1 - Math.sin(this.gait * 2) * 0.04 * speed, dash ? 1.5 : 1);
    this.visual.rotation.z += (this.turnLean - this.visual.rotation.z) * damp(10, clock.realDt);
    this.turnLean *= Math.exp(-8 * clock.realDt);
    this.visual.visible = this.iframe <= 0 || Math.floor(this.iframe * 18) % 2 === 0 || this.hp <= 0;
    for (let i = 0; i < this.legs.length; i++) this.legs[i].rotation.x = Math.sin(this.gait + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 * speed;
    this.tail.rotation.z = Math.sin(this.gait * 1.6) * (0.2 + speed * 0.3);
    const progress = 1 - this.swingLeft / CONFIG.slash.duration;
    this.sword.rotation.y = this.swingLeft > 0 ? this.swingSide * (-1.3 + progress * 2.8) : -0.22;
    this.sword.rotation.z = dash ? -0.1 : Math.sin(progress * Math.PI) * 0.12;
    if (!this.modelLoaded) this.body.visible = true;
  }

  bladeSamples(tip: THREE.Vector3, base: THREE.Vector3, huge = false): void {
    this.root.updateMatrixWorld(true);
    tip.set(huge ? 5 : 2.05, huge ? 1.2 : 0.43, 0.025);
    base.set(huge ? -2 : 0.05, 0, 0.025);
    this.sword.localToWorld(tip); this.sword.localToWorld(base);
  }

  reset(): void {
    this.position.set(0, 0, 0); this.velocity.set(0, 0, 0); this.knock.set(0, 0, 0);
    this.hp = this.maxHp; this.facing = Math.PI; this.iframe = this.gait = this.swingLeft = this.turnLean = 0;
    this.dashing = this.cinematic = false; this.visual.visible = true; this.root.rotation.y = this.facing;
    this.visual.scale.setScalar(1); this.visual.rotation.set(0, 0, 0);
  }

  dispose(): void {
    this.disposed = true;
    this.root.removeFromParent();
    // Only fallback meshes and the procedural sword are owned here. Loaded GLBs share asset resources.
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const collect = (o: THREE.Object3D) => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    };
    this.body.traverse(collect); this.sword.traverse(collect);
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }
}
