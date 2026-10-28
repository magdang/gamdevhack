import { Color, Vector2 } from 'three';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FX } from './config';

/** Composer calls setSize again on every resize. Keep the bloom budget there. */
class ScaledBloom extends UnrealBloomPass {
  scale = 1;
  override setSize(width: number, height: number): void {
    super.setSize(Math.max(32, Math.round(width * this.scale)), Math.max(32, Math.round(height * this.scale)));
  }
}

const finalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uPixel: { value: new Vector2(1 / 1280, 1 / 720) },
    uSlow: { value: 0 }, uDesaturate: { value: 0 }, uBars: { value: 0 },
    uFlash: { value: 0 }, uFlashColor: { value: new Color(0xffffff) },
  },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uPixel;
    uniform float uSlow, uDesaturate, uBars, uFlash;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    void main() {
      vec2 delta = vUv - 0.5;
      vec2 chroma = delta * (0.006 * uSlow);
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uSlow > 0.001) {
        vec3 blur = c;
        for (int i = 1; i <= 3; i++) {
          blur += texture2D(tDiffuse, vUv - delta * float(i) * 0.007 * uSlow).rgb;
        }
        c = mix(c, blur * 0.25, uSlow * 0.5);
        c.r = mix(c.r, texture2D(tDiffuse, vUv + chroma).r, uSlow * 0.8);
        c.b = mix(c.b, texture2D(tDiffuse, vUv - chroma).b, uSlow * 0.8);
        c *= mix(vec3(1.0), vec3(0.90, 0.97, 1.12), uSlow);
      }
      c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), uDesaturate);
      c *= 1.0 - smoothstep(0.20, 0.73, length(delta * vec2(1.0, 0.85))) * 0.33;
      c = mix(c, uFlashColor * 3.5, clamp(uFlash, 0.0, 1.0));
      float edge = min(vUv.y, 1.0 - vUv.y);
      float bars = smoothstep(uBars * 0.125, uBars * 0.125 + uPixel.y * 2.0, edge);
      gl_FragColor = vec4(c * bars, 1.0);
    }`,
};

export class Post {
  readonly composer: EffectComposer;
  private readonly bloom: ScaledBloom;
  private readonly final: ShaderPass;
  private slow = 0;
  private desaturate = 0;
  private bars = 0;
  private flashTime = 0;
  private flashDuration = 1;
  private flashIntensity = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, quality: number) {
    renderer.localClippingEnabled = true;
    this.composer = new EffectComposer(renderer);
    this.bloom = new ScaledBloom(new Vector2(1, 1), FX.bloom.strength, FX.bloom.radius, FX.bloom.threshold);
    this.final = new ShaderPass(finalShader);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.setQuality(quality);
  }

  setQuality(quality: number): void {
    // UnrealBloomPass itself halves this size before its first blur mip.
    this.bloom.scale = quality === 0 ? 1 : quality === 1 ? 0.5 : 0.33;
    this.bloom.setSize(this.width * this.dpr, this.height * this.dpr);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.max(0.5, Math.min(FX.maxDpr, pixelRatio));
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(this.width, this.height);
    this.final.uniforms.uPixel.value.set(1 / (this.width * this.dpr), 1 / (this.height * this.dpr));
  }

  update(realDt: number): void {
    const easing = 1 - Math.exp(-realDt * 12);
    const u = this.final.uniforms;
    u.uSlow.value += (this.slow - u.uSlow.value) * easing;
    u.uDesaturate.value += (this.desaturate - u.uDesaturate.value) * easing;
    u.uBars.value += (this.bars - u.uBars.value) * easing;
    this.flashTime = Math.max(0, this.flashTime - realDt);
    u.uFlash.value = this.flashIntensity * (this.flashTime / this.flashDuration) ** 2;
  }

  flash(color: number, intensity: number, duration: number): void {
    this.final.uniforms.uFlashColor.value.setHex(color);
    this.flashIntensity = Math.max(0, Math.min(1, intensity));
    this.flashTime = this.flashDuration = Math.max(0.001, duration);
    this.final.uniforms.uFlash.value = this.flashIntensity;
  }

  setLetterbox(amount: number): void { this.bars = Math.max(0, Math.min(1, amount)); }
  setDesaturate(amount: number): void { this.desaturate = Math.max(0, Math.min(1, amount)); }
  setSlowMo(amount: number): void { this.slow = Math.max(0, Math.min(1, amount)); }
  render(): void { this.composer.render(0); }

  reset(): void {
    this.slow = this.desaturate = this.bars = this.flashTime = this.flashIntensity = 0;
    const u = this.final.uniforms;
    u.uSlow.value = u.uDesaturate.value = u.uBars.value = u.uFlash.value = 0;
  }
}
