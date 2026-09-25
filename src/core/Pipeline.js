import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/*
 * The high-end image pipeline, on top of the base render / bloom / cinematic grade:
 *   - ground-truth ambient occlusion (GTAO): soft contact shadow where surfaces meet
 *   - light shafts: rays scattered from a chapter's bright light (its moon, a lamp) through the air
 *   - depth of field, when a chapter asks for it (a scroll being read, a room)
 *   - screen-space reflections on surfaces a chapter marks as reflective (wet stone, polished floors)
 *   - SMAA edges where the render target has no MSAA
 * Three quality levels: low (base pipeline only), high, ultra. Chosen automatically for the device,
 * or set by the viewer (saved).
 */

export const QUALITIES = ['low', 'high', 'ultra'];

export function pickQuality(app) {
  let saved = null;
  try { saved = localStorage.getItem('itachi-quality'); } catch (_) { /* private mode */ }
  if (QUALITIES.includes(saved)) return saved;
  if (app.low) return 'low';
  // capable devices start at high; ultra (reflections, full-resolution occlusion) is the viewer's choice
  return 'high';
}

/** Rays of light from a bright source, scattered through the air: a radial blur of the image's brightest parts. */
const ShaftShader = {
  name: 'ShaftShader',
  defines: { SAMPLES: 40 },
  uniforms: {
    tDiffuse: { value: null },
    uLight: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uColor: { value: new THREE.Color(1, 1, 1) },
    uThreshold: { value: 0.55 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uLight; uniform float uStrength; uniform vec3 uColor; uniform float uThreshold;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength < 0.001) { gl_FragColor = base; return; }
      vec2 step = (vUv - uLight) / float(SAMPLES) * 0.9;
      vec2 uv = vUv - step * hash(vUv * 731.0); // jitter the start to hide banding
      float fall = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < SAMPLES; i++) {
        uv -= step;
        vec3 c = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        float l = max(dot(c, vec3(0.2126, 0.7152, 0.0722)) - uThreshold, 0.0);
        acc += c * l * fall;
        fall *= 0.955;
      }
      acc /= float(SAMPLES);
      gl_FragColor = vec4(base.rgb + acc * uColor * uStrength, base.a);
    }`,
};

export class Pipeline {
  constructor(app, composer, { renderPass, afterBloom, beforeOutput }) {
    this.app = app;
    this.composer = composer;
    this.renderPass = renderPass;
    const W = app.width, H = app.height;
    const blank = new THREE.Scene(), cam = new THREE.PerspectiveCamera();

    // reflections (ultra, and only where a chapter marks surfaces as reflective); it renders the scene itself
    this.ssr = new SSRPass({ renderer: app.renderer, scene: blank, camera: cam, width: W, height: H, selects: [] });
    this.ssr.thickness = 0.02;
    this.ssr.maxDistance = 6;
    this.ssr.opacity = 0.55;
    this.ssr.blur = true;
    this.ssr.enabled = false;
    // reflections are traced at half resolution and upsampled: most of their cost, little of their look
    const ssrSetSize = this.ssr.setSize.bind(this.ssr);
    this.ssr.setSize = (w, h) => ssrSetSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
    // contact shadow
    this.gtao = new GTAOPass(blank, cam, W, H);
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    // only solid surfaces cast occlusion: not glows, mist, beams, rain or particles
    this.gtao._overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse((o) => {
        if (!o.visible) return;
        const m = o.material, clear = m && (Array.isArray(m) ? m.some((x) => x.transparent || !x.depthWrite) : (m.transparent || !m.depthWrite));
        if (o.isPoints || o.isLine || o.isLine2 || o.isSprite || (o.isMesh && clear)) { cache.push(o); o.visible = false; }
      });
    };
    this.gtaoHalf = true;
    const gtaoSetSize = this.gtao.setSize.bind(this.gtao);
    this.gtao.setSize = (w, h) => (this.gtaoHalf ? gtaoSetSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2))) : gtaoSetSize(w, h));
    // light shafts
    this.shafts = new ShaderPass(ShaftShader);
    // depth of field
    this.bokeh = new BokehPass(blank, cam, { focus: 5, aperture: 0.0015, maxblur: 0.008 });
    this.bokeh.enabled = false;
    // edges
    this.smaa = new SMAAPass();

    // the chain: [render | reflections] → occlusion → (bloom) → shafts → depth of field → (grade, output) → edges
    const passes = composer.passes;
    passes.splice(passes.indexOf(renderPass) + 1, 0, this.ssr, this.gtao);
    passes.splice(passes.indexOf(afterBloom) + 1, 0, this.shafts, this.bokeh);
    composer.addPass(this.smaa);
    this.fxaa = beforeOutput; // the existing FXAA (may be null)
    this._v = new THREE.Vector3();
    this.setQuality(pickQuality(app), false);
  }

  setQuality(q, save = true) {
    this.quality = q;
    if (save) { try { localStorage.setItem('itachi-quality', q); } catch (_) { /* private mode */ } }
    const hi = q !== 'low', ultra = q === 'ultra';
    this.gtao.enabled = hi;
    this.gtaoHalf = !ultra;
    this.gtao.updateGtaoMaterial({ samples: ultra ? 12 : 8 });
    this.shafts.material.defines.SAMPLES = ultra ? 48 : 32;
    this.shafts.material.needsUpdate = true;
    this.shafts.enabled = hi;
    // SMAA replaces FXAA where there is no MSAA on the render target
    const postAA = !this.app.msaa;
    this.smaa.enabled = postAA && hi;
    if (this.fxaa) this.fxaa.enabled = postAA && !hi;
    this.composer.setSize(this.app.width, this.app.height);
    // during start-up the app has no chapters yet; the first chapter arrives through chapterChanged()
    if (this.app.chapters && this.app.index >= 0) this.chapterChanged(this.app.current);
  }

  /** A new chapter: the passes that render the scene themselves need its scene and camera. */
  chapterChanged(ch) {
    if (!ch) return;
    for (const p of [this.gtao, this.bokeh, this.ssr]) { p.scene = ch.scene; p.camera = ch.camera; }
    const refl = this.quality === 'ultra' && Array.isArray(ch.reflective) && ch.reflective.length;
    this.ssr.selects = refl ? ch.reflective : [];
    this.ssr.enabled = !!refl;
    this.renderPass.enabled = !refl; // the reflection pass draws the scene itself
  }

  /** Every frame: point the shafts at the chapter's light, focus the lens. */
  update(ch, dt) {
    if (!ch) return;
    // light shafts from the chapter's source (a world position), fading as it leaves the view
    const u = this.shafts.uniforms;
    let target = 0;
    const src = typeof ch.shaftSource === 'function' ? ch.shaftSource() : ch.shaftSource;
    if (this.shafts.enabled && src) {
      const v = this._v.copy(src).project(ch.camera);
      if (v.z < 1) {
        const sx = (v.x + 1) / 2, sy = (v.y + 1) / 2;
        u.uLight.value.set(sx, sy);
        const off = Math.max(0, Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) - 0.5); // how far outside the frame
        target = (ch.shaftStrength ?? 1) * Math.max(0, 1 - off * 2.5);
        if (ch.shaftColor) u.uColor.value.set(ch.shaftColor);
        u.uThreshold.value = ch.shaftThreshold ?? 0.55;
      }
    }
    u.uStrength.value += (target - u.uStrength.value) * (1 - Math.exp(-4 * dt));
    // depth of field, only when the chapter asks for it
    const dof = this.quality !== 'low' && ch.dof;
    this.bokeh.enabled = !!dof;
    if (dof) {
      const b = this.bokeh.uniforms;
      b.focus.value += (dof.focus - b.focus.value) * (1 - Math.exp(-5 * dt));
      b.aperture.value = dof.aperture ?? 0.0015;
      b.maxblur.value = dof.maxblur ?? 0.008;
    }
  }
}
