import * as THREE from 'three';
import { shared } from '../core/utils.js';

/** Low-poly crow built along +Z (forward), wings on X. `aWing` drives the flap in the shader. */
export function createCrowGeometry(scale = 1) {
  const P = [];
  const W = [];
  const tri = (a, b, c, wa = 0, wb = 0, wc = 0) => { P.push(...a, ...b, ...c); W.push(wa, wb, wc); };
  const N = [0, 0.02, 0.48], T = [0, 0, -0.32], L = [-0.09, 0, 0.02], R = [0.09, 0, 0.02];
  const U = [0, 0.09, 0.06], D = [0, -0.07, 0.06];
  tri(N, U, L); tri(N, R, U); tri(N, L, D); tri(N, D, R);
  tri(T, L, U); tri(T, U, R); tri(T, D, L); tri(T, R, D);
  // beak
  tri([0, 0.02, 0.62], [-0.03, 0.03, 0.46], [0.03, 0.03, 0.46]);
  // tail fan
  tri([0, 0, -0.28], [-0.16, 0, -0.62], [0.16, 0, -0.62]);
  // wings (mirrored)
  for (const s of [-1, 1]) {
    const rf = [s * 0.06, 0.01, 0.16], rb = [s * 0.06, 0.01, -0.12];
    const mf = [s * 0.42, 0.03, 0.12], mb = [s * 0.42, 0.03, -0.18];
    const tip = [s * 0.86, 0.02, -0.14];
    const w = (p) => Math.abs(p[0]) / 0.86;
    tri(rf, rb, mb, w(rf), w(rb), w(mb));
    tri(rf, mb, mf, w(rf), w(mb), w(mf));
    tri(mf, mb, tip, w(mf), w(mb), w(tip));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.map((v) => v * scale), 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 1));
  g.computeVertexNormals();
  return g;
}

export function createCrowMaterial({ flap = 11, amp = 0.5 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uFlap: { value: flap }, uAmp: { value: amp } },
    vertexShader: /* glsl */ `
      attribute float aWing; attribute float aPhase;
      uniform float uTime; uniform float uFlap; uniform float uAmp;
      varying float vWing; varying vec3 vCol; varying float vDepth;
      void main(){
        vec3 p = position;
        float f = sin(uTime * uFlap + aPhase);
        p.y += f * aWing * aWing * uAmp;
        p.x *= 1.0 - 0.12 * abs(f) * aWing;
        vWing = aWing;
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(0.0);
        #endif
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        #else
          vec4 wp = modelMatrix * vec4(p, 1.0);
        #endif
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vWing; varying vec3 vCol; varying float vDepth;
      void main(){
        vec3 c = vec3(0.008, 0.006, 0.012) + vec3(0.02, 0.012, 0.035) * vWing;
        c += vCol;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Adds a per-instance phase attribute so crows flap out of sync. */
export function addPhases(geometry, count) {
  const ph = new Float32Array(count);
  for (let i = 0; i < count; i++) ph[i] = Math.random() * Math.PI * 2;
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
}

/**
 * A short-lived burst of crows that explode outward from a point (used for crow clones / summoning).
 */
export class CrowBurst {
  constructor(count = 40, scale = 0.8) {
    this.count = count;
    const geo = createCrowGeometry(scale);
    addPhases(geo, count);
    this.mesh = new THREE.InstancedMesh(geo, createCrowMaterial({ flap: 16 }), count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.items = Array.from({ length: count }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
    this.dummy = new THREE.Object3D();
    this.t = 0;
  }

  fire(origin, { speed = 7, up = 3, life = 2.6 } = {}) {
    this.mesh.visible = true;
    this.t = life;
    for (const it of this.items) {
      it.p.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 1.2, (Math.random() - 0.5) * 0.6));
      const th = Math.random() * Math.PI * 2;
      it.v.set(Math.cos(th), 0.2 + Math.random() * 0.8, Math.sin(th)).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      it.v.y += up * Math.random();
    }
  }

  update(dt) {
    if (!this.mesh.visible) return;
    this.t -= dt;
    if (this.t <= 0) { this.mesh.visible = false; return; }
    const s = Math.min(1, this.t * 1.5);
    this.items.forEach((it, i) => {
      it.v.y += 1.5 * dt;
      it.p.addScaledVector(it.v, dt);
      this.dummy.position.copy(it.p);
      this.dummy.lookAt(it.p.x + it.v.x, it.p.y + it.v.y, it.p.z + it.v.z);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
