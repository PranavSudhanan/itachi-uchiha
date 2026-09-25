import * as THREE from 'three';
import { shared } from '../core/utils.js';

/**
 * A crow built along +Z (forward), wings on X: a rounded body lofted through elliptical sections, a raised
 * head and heavy beak, a fanned tail, and wings whose hand splits into the separated "fingers" of the
 * primaries that make a crow's silhouette. `aWing` (0 at the body, 1 at the tip) drives the flap.
 */
export function createCrowGeometry(scale = 1) {
  const P = [], N = [], W = [];
  const wingW = (x) => Math.min(1, Math.abs(x) / 0.86);

  // body: sections [z, y, rx, ry]
  const S = [
    [-0.24, 0.0, 0.028, 0.022], [-0.14, 0.0, 0.07, 0.06], [-0.02, 0.0, 0.092, 0.084], [0.1, 0.005, 0.088, 0.08],
    [0.2, 0.02, 0.062, 0.062], [0.27, 0.035, 0.066, 0.066], [0.34, 0.04, 0.052, 0.054], [0.39, 0.04, 0.03, 0.034],
  ];
  const SEG = 10;
  const ring = (k, i) => {
    const [z, y, rx, ry] = S[k];
    const a = (i / SEG) * Math.PI * 2;
    return { p: [Math.cos(a) * rx, y + Math.sin(a) * ry, z], n: new THREE.Vector3(Math.cos(a) / rx, Math.sin(a) / ry, 0).normalize() };
  };
  const vert = (v, w = 0) => { P.push(...v.p); N.push(v.n.x, v.n.y, v.n.z); W.push(w); };
  for (let k = 0; k < S.length - 1; k++) {
    for (let i = 0; i < SEG; i++) {
      const a = ring(k, i), b = ring(k, i + 1), c = ring(k + 1, i), d = ring(k + 1, i + 1);
      vert(a); vert(c); vert(b); vert(b); vert(c); vert(d);
    }
  }
  // cap the tail end
  const tailC = { p: [0, 0, S[0][0] - 0.01], n: new THREE.Vector3(0, 0, -1) };
  for (let i = 0; i < SEG; i++) { vert(tailC); vert(ring(0, i)); vert(ring(0, i + 1)); }
  // beak: thick at the base, slightly down-curved to a point
  const bz = S[S.length - 1][0], by = S[S.length - 1][1];
  const tip = { p: [0, by - 0.012, bz + 0.13], n: new THREE.Vector3(0, 0, 1) };
  const mid = (i) => { const a = (i / SEG) * Math.PI * 2; return { p: [Math.cos(a) * 0.017, by + 0.002 + Math.sin(a) * 0.02, bz + 0.06], n: new THREE.Vector3(Math.cos(a), Math.sin(a), 0.3).normalize() }; };
  for (let i = 0; i < SEG; i++) {
    const a = ring(S.length - 1, i), b = ring(S.length - 1, i + 1), c = mid(i), d = mid(i + 1);
    vert(a); vert(c); vert(b); vert(b); vert(c); vert(d);
    vert(c); vert(tip); vert(d);
  }

  // flat parts (tail, wings): each triangle takes its own face normal
  const flat = (pts) => {
    const [a, b, c] = pts.map((p) => new THREE.Vector3(...p));
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (const p of [a, b, c]) { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); W.push(wingW(p.x)); }
  };
  // tail: a fan of feathers, slightly rounded at the end
  const root = [0, 0.0, -0.2];
  const TAIL = 7;
  for (let i = 0; i < TAIL; i++) {
    const a0 = -0.42 + (i / TAIL) * 0.84, a1 = -0.42 + ((i + 1) / TAIL) * 0.84;
    const r0 = 0.34 - Math.abs(a0) * 0.12, r1 = 0.34 - Math.abs(a1) * 0.12;
    flat([root, [Math.sin(a1) * r1, 0.0, -0.2 - Math.cos(a1) * r1], [Math.sin(a0) * r0, 0.0, -0.2 - Math.cos(a0) * r0]]);
  }
  // wings
  for (const s of [-1, 1]) {
    const q = (x, y, z) => [s * x, y, z];
    const tri = (a, b, c) => (s > 0 ? flat([a, b, c]) : flat([a, c, b]));
    // arm: from the shoulder to the wrist, a broad cambered panel
    const sf = q(0.06, 0.03, 0.12), sb = q(0.06, 0.02, -0.12);
    const ef = q(0.24, 0.05, 0.15), em = q(0.24, 0.065, 0.0), eb = q(0.24, 0.045, -0.2);
    const wf = q(0.44, 0.06, 0.13), wm = q(0.44, 0.07, -0.02), wb = q(0.44, 0.05, -0.19);
    tri(sf, ef, em); tri(sf, em, sb); tri(sb, em, eb);
    tri(ef, wf, wm); tri(ef, wm, em); tri(em, wm, wb); tri(em, wb, eb);
    // hand: the inner primaries fill the gap, the outer five stand apart as fingers
    const hand = q(0.52, 0.06, 0.06);
    tri(wf, hand, wm); tri(wm, hand, wb);
    const F = 5;
    for (let f = 0; f < F; f++) {
      const ang = 0.28 - (f / (F - 1)) * 0.7; // forward-outward to backward-outward
      const len = 0.27 - Math.abs(f - 1.5) * 0.03;
      const bx = 0.5 + f * 0.006, bz = 0.08 - f * 0.065;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const wdt = 0.036;
      const b0 = q(bx - dz * wdt, 0.06, bz + dx * wdt), b1 = q(bx + dz * wdt, 0.06, bz - dx * wdt);
      const t0 = q(bx + dx * len - dz * wdt * 0.7, 0.05 - f * 0.004, bz + dz * len + dx * wdt * 0.7);
      const t1 = q(bx + dx * len + dz * wdt * 0.7, 0.05 - f * 0.004, bz + dz * len - dx * wdt * 0.7);
      const tp = q(bx + dx * (len + 0.04), 0.045 - f * 0.004, bz + dz * (len + 0.04));
      tri(b0, t0, b1); tri(b1, t0, t1); tri(t0, tp, t1);
    }
    // secondaries' trailing edge between wrist and body, softly scalloped
    const hb = q(0.52, 0.05, -0.2);
    tri(wb, hand, hb);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.map((v) => v * scale), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 1));
  return g;
}

/**
 * Near-black plumage: a faint blue-violet sheen on top surfaces, and a thin rim where the sky behind
 * catches the edges. Birds alternate bursts of flapping with glides (`glide` 0 to 1 sets how often).
 */
export function createCrowMaterial({ flap = 11, amp = 0.5, glide = 0.6, rim = 0xff5a3a, rimAmt = 0.35 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uFlap: { value: flap }, uAmp: { value: amp }, uGlide: { value: glide }, uRim: { value: new THREE.Color(rim) }, uRimAmt: { value: rimAmt } },
    vertexShader: /* glsl */ `
      attribute float aWing; attribute float aPhase;
      uniform float uTime; uniform float uFlap; uniform float uAmp; uniform float uGlide;
      varying float vWing; varying vec3 vCol; varying float vFlap; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 p = position;
        // bursts of wingbeats, then a glide with the wings held in a shallow V
        float g = smoothstep(0.35, 0.75, sin(uTime * 0.45 + aPhase * 1.7) * 0.5 + 0.5) * uGlide;
        float f = sin(uTime * uFlap + aPhase);
        float beat = f * (1.0 - g);
        vFlap = beat;
        float w2 = aWing * aWing;
        p.y += beat * w2 * uAmp + g * aWing * 0.08;
        // the hand sweeps back and folds a little on the upstroke
        float up = max(beat, 0.0);
        p.x *= 1.0 - 0.18 * up * aWing;
        p.z -= up * w2 * 0.12;
        // the body rides the beat
        p.y -= beat * 0.03 * (1.0 - aWing);
        vWing = aWing;
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(0.0);
        #endif
        #ifdef USE_INSTANCING
          mat4 im = instanceMatrix;
        #else
          mat4 im = mat4(1.0);
        #endif
        vec4 wp = modelMatrix * im * vec4(p, 1.0);
        vec4 mv = viewMatrix * wp;
        vN = normalize(normalMatrix * mat3(im) * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uRim; uniform float uRimAmt;
      varying float vWing; varying vec3 vCol; varying float vFlap; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        float ndv = clamp(dot(n, vV), 0.0, 1.0);
        vec3 c = vec3(0.0045, 0.004, 0.006);
        // oily blue-violet sheen where feathers face up to the sky
        c += vec3(0.004, 0.004, 0.009) * smoothstep(0.2, 1.0, n.y) * (0.5 + vWing);
        c += vec3(0.005, 0.006, 0.012) * vWing * smoothstep(0.4, 1.0, vFlap);
        // backlit edges
        c += uRim * pow(1.0 - ndv, 8.0) * uRimAmt * 0.05;
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
