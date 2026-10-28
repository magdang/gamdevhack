import * as THREE from 'three';
import { CONFIG } from './config';

export interface InputActions {
  dash(direction: THREE.Vector3): void;
  tap(): void;
  pause(): void;
}

/** Owns its joystick DOM beside, never inside, the UI kit root. */
export class Input {
  readonly move = new THREE.Vector3();
  private keys = new Set<string>();
  private pointer: number | null = null;
  private originX = 0;
  private originY = 0;
  private dragX = 0;
  private dragY = 0;
  private downAt = 0;
  private farthest = 0;
  private cursor = new THREE.Vector2();
  private hasCursor = false;
  private dir = new THREE.Vector3();
  private groundPoint = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ring = document.createElement('div');
  private thumb = document.createElement('div');
  private abort = new AbortController();

  constructor(private canvas: HTMLCanvasElement, host: HTMLElement, private camera: THREE.PerspectiveCamera,
    private playerPosition: THREE.Vector3, private actions: InputActions) {
    this.ring.setAttribute('aria-hidden', 'true');
    this.ring.dataset.coreJoystick = '';
    this.ring.style.cssText = 'position:fixed;width:140px;height:140px;border:1px solid #fff7;border-radius:50%;background:#ffffff10;pointer-events:none;display:none;z-index:15;box-sizing:border-box;';
    this.thumb.style.cssText = 'position:absolute;left:49px;top:49px;width:40px;height:40px;border-radius:50%;border:1px solid #ffefb6aa;background:#ffefb64d;';
    this.ring.append(this.thumb);
    host.append(this.ring);
    const signal = this.abort.signal;
    canvas.addEventListener('pointerdown', this.onDown, { signal });
    window.addEventListener('pointermove', this.onMove, { signal });
    window.addEventListener('pointerup', this.onUp, { signal });
    window.addEventListener('pointercancel', this.onCancel, { signal });
    canvas.addEventListener('lostpointercapture', this.onCancel, { signal });
    window.addEventListener('keydown', this.onKeyDown, { signal });
    window.addEventListener('keyup', this.onKeyUp, { signal });
    window.addEventListener('blur', this.reset, { signal });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false, signal });
    window.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false, signal });
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button === 2) { e.preventDefault(); this.rememberCursor(e); this.requestDash(); return; }
    if (e.button !== 0 || this.pointer !== null || !e.isPrimary) return;
    e.preventDefault();
    this.pointer = e.pointerId;
    this.originX = e.clientX; this.originY = e.clientY;
    this.downAt = performance.now();
    this.dragX = this.dragY = this.farthest = 0;
    this.rememberCursor(e);
    this.canvas.setPointerCapture(e.pointerId);
    this.ring.style.left = `${e.clientX - 70}px`;
    this.ring.style.top = `${e.clientY - 70}px`;
    this.thumb.style.transform = 'translate(0,0)';
    this.ring.style.display = 'block';
  };

  private rememberCursor(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    const rect = this.canvas.getBoundingClientRect();
    this.cursor.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
    this.hasCursor = true;
  }

  private onMove = (e: PointerEvent): void => {
    this.rememberCursor(e);
    if (e.pointerId !== this.pointer) return;
    e.preventDefault();
    this.dragX = e.clientX - this.originX;
    this.dragY = e.clientY - this.originY;
    const length = Math.hypot(this.dragX, this.dragY);
    this.farthest = Math.max(this.farthest, length);
    const scale = length > CONFIG.input.joystickRadius ? CONFIG.input.joystickRadius / length : 1;
    this.thumb.style.transform = `translate(${this.dragX * scale}px,${this.dragY * scale}px)`;
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    this.dragX = e.clientX - this.originX;
    this.dragY = e.clientY - this.originY;
    const distance = Math.hypot(this.dragX, this.dragY);
    if (performance.now() - this.downAt <= CONFIG.input.swipeMs && distance >= CONFIG.input.swipePixels) {
      this.screenDirection(this.dragX, this.dragY, this.dir).normalize();
      this.actions.dash(this.dir);
    } else if (this.farthest < 12 && distance < 12) this.actions.tap();
    this.clearPointer();
  };

  private onCancel = (e: PointerEvent): void => { if (e.pointerId === this.pointer) this.clearPointer(); };
  private clearPointer(): void {
    const pointer = this.pointer;
    this.pointer = null;
    if (pointer !== null && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    this.dragX = this.dragY = 0;
    this.ring.style.display = 'none';
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') this.requestDash();
    else if (e.code === 'Escape' || e.code === 'KeyP') this.actions.pause();
  };
  private onKeyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code); };

  /** Screen right/up map through camera azimuth to the ground plane. */
  private screenDirection(x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    const m = this.camera.matrixWorld.elements;
    const rx = m[0], rz = m[2];
    const inv = 1 / (Math.hypot(rx, rz) || 1);
    return out.set((rx * x - rz * y) * inv, 0, (rz * x + rx * y) * inv);
  }

  update(): void {
    let x = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    let y = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    if (x === 0 && y === 0 && this.pointer !== null) {
      x = this.dragX / CONFIG.input.joystickRadius;
      y = this.dragY / CONFIG.input.joystickRadius;
    }
    this.screenDirection(x, y, this.move);
    if (this.move.lengthSq() > 1) this.move.normalize();
  }

  private requestDash(): void {
    this.update();
    if (this.hasCursor) {
      this.raycaster.setFromCamera(this.cursor, this.camera);
      if (this.raycaster.ray.intersectPlane(this.plane, this.groundPoint)) {
        this.dir.subVectors(this.groundPoint, this.playerPosition).setY(0);
        if (this.dir.lengthSq() > 0.1) { this.actions.dash(this.dir.normalize()); return; }
      }
    }
    this.dir.copy(this.move);
    if (this.dir.lengthSq() < 0.01) this.dir.set(0, 0, -1);
    this.actions.dash(this.dir.normalize());
  }

  reset = (): void => { this.keys.clear(); this.clearPointer(); this.move.set(0, 0, 0); this.hasCursor = false; };
  dispose(): void { this.abort.abort(); this.ring.remove(); }
}
