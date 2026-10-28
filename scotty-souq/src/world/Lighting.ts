import * as THREE from 'three';
import type { KitContext, WorldMood } from '../core/contracts';
import { MOODS, WORLD } from './config';
import type { WorldMaterials } from './Materials';

const colorKeys = ['zenith', 'middle', 'horizon', 'fog', 'sun', 'ambient', 'ground'] as const;
const numberKeys = ['sunPower', 'ambientPower', 'lantern', 'fogDensity', 'focus'] as const;
type ColorKey = typeof colorKeys[number];
type NumberKey = typeof numberKeys[number];
type PaletteState = Record<ColorKey, THREE.Color> & Record<NumberKey, number>;

const palette = (mood: WorldMood): PaletteState => {
  const source = MOODS[mood];
  return {
    zenith: new THREE.Color(source.zenith), middle: new THREE.Color(source.middle),
    horizon: new THREE.Color(source.horizon), fog: new THREE.Color(source.fog),
    sun: new THREE.Color(source.sun), ambient: new THREE.Color(source.ambient), ground: new THREE.Color(source.ground),
    sunPower: source.sunPower, ambientPower: source.ambientPower, lantern: source.lantern,
    fogDensity: source.fogDensity, focus: source.focus,
  };
};

export function createLighting(ctx: KitContext, root: THREE.Group, materials: WorldMaterials) {
  const current = palette('title'), from = palette('title'), target = palette('title');
  let elapsed: number = WORLD.moodSeconds;
  let mood: WorldMood = 'title';
  const fog = new THREE.FogExp2(current.fog, current.fogDensity);
  ctx.scene.fog = fog;
  ctx.scene.background = current.horizon.clone();

  const sky = new THREE.Mesh(new THREE.SphereGeometry(WORLD.skyRadius, 32, 20), new THREE.ShaderMaterial({
    name: 'lavender pink and gold sunset',
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: {
      uZenith: { value: current.zenith }, uMiddle: { value: current.middle }, uHorizon: { value: current.horizon },
      uSun: { value: new THREE.Vector3(-0.52, 0.115, -0.85).normalize() },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uMiddle;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float h = max(direction.y, 0.0);
        vec3 color = mix(uHorizon, uMiddle, smoothstep(0.0, 0.32, h));
        color = mix(color, uZenith, smoothstep(0.24, 0.93, h));
        float alignment = max(dot(direction, uSun), 0.0);
        color += vec3(1.0, 0.57, 0.22) * pow(alignment, 24.0) * 0.23;
        float sun = smoothstep(0.99965, 0.99985, alignment);
        color = mix(color, vec3(1.0, 0.84, 0.53), sun);
        float cloud = sin(direction.x * 37.0 + direction.z * 18.0 + sin(h * 63.0) * 0.6);
        cloud *= sin(h * 130.0 + direction.x * 10.0);
        float veil = smoothstep(0.52, 0.9, cloud) * smoothstep(0.05, 0.18, h) * (1.0 - smoothstep(0.4, 0.7, h));
        color = mix(color, uMiddle * 1.23, veil * 0.23);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.name = 'sunset sky dome';
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  root.add(sky);

  const hemisphere = new THREE.HemisphereLight(current.ambient, current.ground, current.ambientPower);
  hemisphere.name = 'warm sky and lavender ground fill';
  root.add(hemisphere);
  const sun = new THREE.DirectionalLight(current.sun, current.sunPower);
  sun.name = 'single shadow casting sunset sun';
  sun.position.set(-25, 34, -32);
  sun.castShadow = true;
  sun.shadow.mapSize.set(WORLD.shadowSize, WORLD.shadowSize);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -WORLD.shadowExtent;
  sun.shadow.camera.right = sun.shadow.camera.top = WORLD.shadowExtent;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 110;
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0003;
  sun.shadow.camera.updateProjectionMatrix();
  root.add(sun, sun.target);

  const lanternLights: THREE.PointLight[] = [];
  for (let i = 0; i < WORLD.lanternLightCount; i++) {
    const a = -0.7 + i * Math.PI * 2 / WORLD.lanternLightCount;
    const light = new THREE.PointLight(0xffb550, WORLD.lanternLightPower, 9, 2);
    light.name = `lantern practical ${i + 1}`;
    light.position.set(Math.sin(a) * 19.4, 2.8, Math.cos(a) * 19.4);
    lanternLights.push(light);
    root.add(light);
  }
  const focus = new THREE.SpotLight(0xffe4bb, 0, 28, 0.67, 0.8, 2);
  focus.name = 'Final Cut action spotlight';
  focus.position.set(0, 13, 0);
  root.add(focus, focus.target);
  const action = new THREE.Vector3();
  const viewDirection = new THREE.Vector3();

  const apply = (time: number) => {
    hemisphere.color.copy(current.ambient);
    hemisphere.groundColor.copy(current.ground);
    hemisphere.intensity = current.ambientPower;
    sun.color.copy(current.sun);
    sun.intensity = current.sunPower;
    fog.color.copy(current.fog);
    fog.density = current.fogDensity;
    const bossFlicker = mood === 'boss' ? 0.14 : 0.025;
    const flicker = 1 + Math.sin(time * 9.3) * bossFlicker + Math.sin(time * 17.7 + 2) * bossFlicker * 0.4;
    materials.lantern.emissiveIntensity = 2.2 * current.lantern * flicker;
    lanternLights.forEach((light, i) => {
      light.intensity = WORLD.lanternLightPower * current.lantern * (flicker + Math.sin(time * 5 + i * 2) * 0.03);
    });
    focus.intensity = current.focus;
    if (current.focus > 0.01) {
      // Core follows the player. Its camera's ground-plane aim provides a kit-independent focus.
      ctx.camera.getWorldDirection(viewDirection);
      const distance = viewDirection.y < -0.05 ? -ctx.camera.position.y / viewDirection.y : 0;
      action.copy(ctx.camera.position).addScaledVector(viewDirection, distance);
      action.y = 0;
      focus.position.set(action.x, 13, action.z);
      focus.target.position.copy(action);
    }
    sky.position.copy(ctx.camera.position);
  };
  apply(0);

  return {
    setMood(next: WorldMood) {
      if (next === mood) return;
      mood = next;
      const nextPalette = MOODS[next];
      for (const key of colorKeys) {
        from[key].copy(current[key]);
        target[key].set(nextPalette[key]);
      }
      for (const key of numberKeys) {
        from[key] = current[key];
        target[key] = nextPalette[key];
      }
      elapsed = 0;
    },
    update(realDt: number, time: number) {
      elapsed = Math.min(WORLD.moodSeconds, elapsed + realDt);
      const t = elapsed / WORLD.moodSeconds;
      const eased = t * t * (3 - 2 * t);
      for (const key of colorKeys) current[key].lerpColors(from[key], target[key], eased);
      for (const key of numberKeys) current[key] = THREE.MathUtils.lerp(from[key], target[key], eased);
      apply(time);
    },
    reset() {
      mood = 'title';
      const initial = MOODS.title;
      for (const key of colorKeys) {
        current[key].set(initial[key]); from[key].copy(current[key]); target[key].copy(current[key]);
      }
      for (const key of numberKeys) current[key] = from[key] = target[key] = initial[key];
      elapsed = WORLD.moodSeconds;
      apply(0);
    },
  };
}
