import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AUDIO, IMAGES, MODELS, TEXTURES, type AudioKey, type ImageKey, type ModelKey, type TextureKey } from './manifest';

export interface AssetsApi {
  /** Fresh normalised instance (feet at y=0, centred on XZ, scaled to manifest height, facing +Z),
   *  or null if the file is missing or broken. Safe to call many times. */
  model(key: ModelKey): Promise<THREE.Object3D | null>;
  /** Shared texture (sRGB, repeat wrapping), or null if missing. Do not dispose. */
  texture(key: TextureKey): Promise<THREE.Texture | null>;
  imageUrl(key: ImageKey): string;
  audioUrl(key: AudioKey): string;
}

const BASE = import.meta.env.BASE_URL;
// A missing generated model is normal during production. Avoid failed browser requests entirely.
// Vite refreshes this inventory when a GLB arrives; the next build also picks it up automatically.
const AVAILABLE_MODELS = import.meta.glob('/public/assets/gen/models/*.glb');

export class Assets implements AssetsApi {
  private gltfLoader = new GLTFLoader();
  private textureLoader = new THREE.TextureLoader();
  private gltfCache = new Map<ModelKey, Promise<GLTF | null>>();
  private textureCache = new Map<TextureKey, Promise<THREE.Texture | null>>();

  async model(key: ModelKey): Promise<THREE.Object3D | null> {
    if (!(`/public/${MODELS[key].path}` in AVAILABLE_MODELS)) return null;
    let pending = this.gltfCache.get(key);
    if (!pending) {
      pending = this.gltfLoader.loadAsync(BASE + MODELS[key].path).catch(() => {
        console.info(`[assets] model "${key}" not available, using fallback`);
        return null;
      });
      this.gltfCache.set(key, pending);
    }
    const gltf = await pending;
    if (!gltf) return null;
    return normalise(skeletonClone(gltf.scene), MODELS[key].height, MODELS[key].yawOffset);
  }

  async texture(key: TextureKey): Promise<THREE.Texture | null> {
    let pending = this.textureCache.get(key);
    if (!pending) {
      pending = this.textureLoader
        .loadAsync(BASE + TEXTURES[key])
        .then((tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.anisotropy = 4;
          return tex;
        })
        .catch(() => {
          console.info(`[assets] texture "${key}" not available, using fallback`);
          return null;
        });
      this.textureCache.set(key, pending);
    }
    return pending;
  }

  imageUrl(key: ImageKey): string {
    return BASE + IMAGES[key];
  }

  audioUrl(key: AudioKey): string {
    return BASE + AUDIO[key];
  }
}

/** Wrap `scene` in a pivot group: centred on XZ, feet at y=0, uniform scale to `height`, yaw offset. */
export function normalise(scene: THREE.Object3D, height: number, yawOffset: number): THREE.Group {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = size.y > 0 ? height / size.y : 1;
  scene.position.set(-centre.x, -box.min.y, -centre.z);
  const inner = new THREE.Group();
  inner.add(scene);
  inner.scale.setScalar(scale);
  inner.rotation.y = yawOffset;
  const pivot = new THREE.Group();
  pivot.add(inner);
  pivot.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return pivot;
}
