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
 * Instanced, camera-facing flame tongues drawn procedurally in the fragment shader.
 * Colours are configurable: Amaterasu uses a black core with a violet-crimson rim.
 */
export class FlameField {
  constructor(max = 256, { core = 0x010002, edge = 0x14021a, glow = 0x6a0a3a, blending = THREE.NormalBlending, glowAmt = 1.4 } = {}) {
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
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending,
      vertexShader: /* glsl */ `
        attribute vec3 aOffset; attribute vec2 aSize; attribute float aSeed; attribute float aInt;
        uniform float uTime;
        varying vec2 vUv; varying float vSeed; varying float vInt;
        void main(){
          vUv = uv; vSeed = aSeed; vInt = aInt;
          vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          float sway = sin(uTime * 2.6 + aSeed * 17.0) * 0.18 + sin(uTime * 5.1 + aSeed * 3.0) * 0.06;
          vec3 p = aOffset + right * (position.x * aSize.x + sway * position.y * position.y * aSize.y * 0.5) + vec3(0.0, position.y * aSize.y, 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uCore; uniform vec3 uEdge; uniform vec3 uGlow; uniform float uGlowAmt;
        varying vec2 vUv; varying float vSeed; varying float vInt;
        ${FRAG_NOISE}
        void main(){
          float y = vUv.y;
          float x = vUv.x * 2.0 - 1.0;
          float t = uTime * 1.7 + vSeed * 13.0;
          float n = fbm(vec2(vUv.x * 2.6 + vSeed * 7.0, y * 2.0 - t * 1.25));
          float n2 = fbm(vec2(vUv.x * 5.5 - vSeed, y * 4.2 - t * 2.4));
          float width = pow(max(1.0 - y, 0.0), 0.6) * (0.8 + 0.2 * sin(t * 2.3 + y * 5.0));
          float xd = abs(x + (n - 0.5) * 0.9 * y) / max(width, 0.001);
          float shape = 1.0 - smoothstep(0.5, 1.0, xd + (n2 - 0.5) * 0.55);
          shape *= smoothstep(0.0, 0.1, y);
          shape *= 1.0 - smoothstep(0.45 + n * 0.4, 0.98, y);
          if (shape < 0.01) discard;
          float core = 1.0 - smoothstep(0.15, 0.8, xd + y * 0.35 + (n2 - 0.5) * 0.35);
          vec3 col = mix(uEdge, uCore, core);
          float rim = smoothstep(0.45, 0.85, xd + (n2 - 0.5) * 0.3) * (1.0 - smoothstep(0.85, 1.05, xd));
          col += uGlow * rim * uGlowAmt * (0.6 + 0.4 * n);
          gl_FragColor = vec4(col, shape * vInt);
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
