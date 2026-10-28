import * as THREE from 'three';
import type { KitContext } from '../core/contracts';
import type { TextureKey } from '../core/manifest';
import { WORLD } from './config';

export function createMaterials(ctx: KitContext) {
  const standard = (name: string, color: number, roughness = 0.92) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness });
    mat.name = name;
    return mat;
  };
  const m = {
    plaster: standard('honey plaster', 0xd9ad79),
    plasterLight: standard('rose plaster', 0xe8c49c),
    trim: standard('limestone trim', 0xf1d6ac),
    floor: standard('plaza paving', 0xe5cba5),
    inlay: standard('medallion limestone', 0xf3dfb7),
    terracotta: standard('medallion terracotta', 0x9f6753),
    wood: standard('danshal timber', 0x573325),
    recess: standard('deep shop recesses', 0x352a32),
    brass: standard('antique brass', 0x9d652d, 0.35),
    sack: standard('woven spice sacks', 0xc19a66),
    spice: standard('saffron and turmeric', 0xc96b26),
    greenSpice: standard('dried mint', 0x78814a),
    carpet: standard('sadu carpets', 0xb05d53),
    awning: standard('maroon market cloth', 0xe5cfb1),
    leaf: standard('date palm green', 0x50745a),
    trunk: standard('date palm bark', 0x81603c),
    flower: standard('bougainvillea', 0xc43d83),
    skyline: standard('distant lavender silhouettes', 0x82778d),
    lantern: standard('lantern honey glass', 0xffd27b, 0.35),
  };
  m.brass.metalness = 0.7;
  m.lantern.emissive.set(0xffa637);
  m.lantern.emissiveIntensity = 2.2;
  m.leaf.side = THREE.DoubleSide;
  m.awning.side = THREE.DoubleSide;
  m.carpet.side = THREE.DoubleSide;

  // Texture ownership stays with Assets. UV tiling is baked into the geometry except the floor,
  // which gets a private sampler so other kits cannot have their shared repeat settings changed.
  const apply = (key: TextureKey, targets: THREE.MeshStandardMaterial[], repeat = 1, mappedColors?: number[]) => {
    void ctx.assets.texture(key).then((texture) => {
      if (!texture) return;
      const map = texture.clone();
      map.repeat.set(repeat, repeat);
      map.needsUpdate = true;
      for (const [i, material] of targets.entries()) {
        material.map = map;
        if (mappedColors) material.color.set(mappedColors[i]);
        material.needsUpdate = true;
      }
    }).catch(() => { /* The colour materials remain complete fallbacks. */ });
  };
  apply('sandstone_wall', [m.plaster, m.plasterLight], 1, [0xfff2df, 0xffecd9]);
  apply('plaza_floor', [m.floor], WORLD.floorTextureRepeat, [0xfff7ec]);
  apply('wood_beam', [m.wood]);
  apply('awning', [m.awning]);
  apply('carpet', [m.carpet]);

  const windTime = { value: 0 };
  m.awning.onBeforeCompile = (shader) => {
    shader.uniforms.worldWindTime = windTime;
    shader.vertexShader = 'uniform float worldWindTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      transformed.y += sin(worldWindTime * 1.7 + position.x * 8.0 + instanceMatrix[3].x)
        * ${WORLD.awningFlutter.toFixed(3)} * position.z;
    `);
  };
  m.awning.customProgramCacheKey = () => 'souq-awning-wind-v1';
  return { ...m, windTime };
}

export type WorldMaterials = ReturnType<typeof createMaterials>;
