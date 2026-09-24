import * as THREE from 'three';
import { shared } from '../core/utils.js';

const FRAG_NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
`;

/**
 * Instanced, camera-facing flame tongues drawn procedurally in the fragment shader: a wavy body that
 * narrows upward, ragged edges, and licks that tear off near the tip and flicker.
 * Colours are configurable: Amaterasu uses a black core with a violet-crimson rim. `fire: true` shades
 * real fire: hottest (yellow) at the base, cooling to red at the tips as it fades.
 */
export class FlameField {
  constructor(max = 256, { core = 0x010002, edge = 0x14021a, glow = 0x6a0a3a, blending = THREE.NormalBlending, glowAmt = 1.4, fire = false, speed = 1 } = {}) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 1, 1, 6);
    base.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.offset = new Float32Array(max * 3);
    this.size = new Float32Array(max * 2);
    this.seed = new Float32Array(max);
    this.intensity = new Float32Array(max);
    this.aOffset = new THREE.InstancedBufferAttribute(this.offset, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.size, 2).setUsage(THREE.DynamicDrawUsage);
    this.aSeed = new THREE.InstancedBufferAttribute(this.seed, 1).setUsage(THREE.DynamicDrawUsage);
    this.aInt = new THREE.InstancedBufferAttribute(this.intensity, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOffset', this.aOffset);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aSeed', this.aSeed);
    g.setAttribute('aInt', this.aInt);
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uCore: { value: new THREE.Color(core) },
        uEdge: { value: new THREE.Color(edge) },
        uGlow: { value: new THREE.Color(glow) },
        uGlowAmt: { value: glowAmt },
        uSpeed: { value: speed },
      },
      defines: fire ? { FIRE: 1 } : {},
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending,
      vertexShader: /* glsl */ `
        attribute vec3 aOffset; attribute vec2 aSize; attribute float aSeed; attribute float aInt;
        uniform float uTime; uniform float uSpeed;
        varying vec2 vUv; varying float vSeed; varying float vInt;
        void main(){
          vUv = uv; vSeed = aSeed; vInt = aInt;
          vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          float st = uTime * uSpeed;
          float sway = sin(st * 2.6 + aSeed * 17.0) * 0.18 + sin(st * 5.1 + aSeed * 3.0) * 0.06;
          vec3 p = aOffset + right * (position.x * aSize.x + sway * position.y * position.y * aSize.y * 0.5) + vec3(0.0, position.y * aSize.y, 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uSpeed; uniform vec3 uCore; uniform vec3 uEdge; uniform vec3 uGlow; uniform float uGlowAmt;
        varying vec2 vUv; varying float vSeed; varying float vInt;
        ${FRAG_NOISE}
        void main(){
          float y = vUv.y;
          float x = vUv.x * 2.0 - 1.0;
          float t = uTime * uSpeed * 1.7 + vSeed * 13.0;
          float n = fbm(vec2(vUv.x * 2.6 + vSeed * 7.0, y * 2.0 - t * 1.25));
          float n2 = fbm(vec2(vUv.x * 5.5 - vSeed, y * 4.2 - t * 2.4));
          float flick = 0.85 + 0.15 * sin(t * 7.3) * sin(t * 3.1 + 1.7);
          // a rounded base, a body that narrows and waves upward
          float width = pow(max(1.0 - y, 0.0), 0.55) * smoothstep(0.0, 0.14, y + 0.04) * (0.8 + 0.2 * sin(t * 2.3 + y * 5.0));
          float xd = abs(x + (n - 0.5) * 1.1 * y) / max(width, 0.001);
          float shape = 1.0 - smoothstep(0.45, 1.0, xd + (n2 - 0.5) * 0.7);
          // licks tear off near the tip
          float tear = fbm(vec2(vUv.x * 3.2 + vSeed * 3.0, y * 3.4 - t * 3.1));
          shape *= smoothstep(0.18, 0.42, tear + (1.0 - y) * 0.55);
          shape *= 1.0 - smoothstep(0.5 + n * 0.4, 1.0, y * flick);
          if (shape < 0.01) discard;
          float core = 1.0 - smoothstep(0.1, 0.75, xd + y * 0.45 + (n2 - 0.5) * 0.35);
          float a = shape * vInt;
          #ifdef FIRE
            vec3 col = mix(uEdge, uCore, core);
            float rim = smoothstep(0.45, 0.85, xd + (n2 - 0.5) * 0.3) * (1.0 - smoothstep(0.85, 1.05, xd));
            col += uGlow * rim * uGlowAmt * (0.6 + 0.4 * n);
            // hottest at the base, cooling to deep red at the tips, and thinner as it cools
            col = mix(col, uEdge * 0.55 + uGlow * 0.5, smoothstep(0.35, 0.95, y));
            a *= (1.0 - y * 0.55) * flick;
          #else
            // black fire: a lightless body whose inner turbulence shows as faint charcoal-violet ripples,
            // edged by a thin, broken crimson glow that is hottest where it meets the ground
            float swirlN = fbm(vec2(vUv.x * 4.0 + vSeed * 2.0 + n * 1.5, y * 3.2 - t * 0.9));
            vec3 col = mix(uCore, uEdge, smoothstep(0.35, 0.85, swirlN) * (1.0 - core * 0.75));
            float edge = smoothstep(0.62, 0.9, xd + (n2 - 0.5) * 0.3) * (1.0 - smoothstep(0.9, 1.02, xd));
            float broken = smoothstep(0.35, 0.7, fbm(vec2(vUv.x * 6.0 - vSeed, y * 5.0 - t * 1.6)));
            float base = smoothstep(0.22, 0.0, y) * (1.0 - core * 0.5);
            col += uGlow * uGlowAmt * (edge * broken * (0.7 + 0.6 * n) + base * 0.55) * flick;
            // the edge feathers into the air instead of ending in a cut-out line
            a *= mix(0.97, 0.55, edge * (1.0 - broken));
          #endif
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.geometry = g;
    this.n = 0;
  }

  begin() { this.n = 0; }

  push(x, y, z, w, hgt, seed, intensity) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.offset[i * 3] = x; this.offset[i * 3 + 1] = y; this.offset[i * 3 + 2] = z;
    this.size[i * 2] = w; this.size[i * 2 + 1] = hgt;
    this.seed[i] = seed;
    this.intensity[i] = intensity;
  }

  end() {
    this.geometry.instanceCount = this.n;
    this.aOffset.needsUpdate = this.aSize.needsUpdate = this.aSeed.needsUpdate = this.aInt.needsUpdate = true;
  }
}
