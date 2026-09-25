import * as THREE from 'three';
import { drawTexture, glowTexture, rand, TAU } from '../core/utils.js';

/*
 * A blood-red dusk for the crows: a sky with streaks of cloud lit around a cratered blood moon and the
 * first stars above, ridge after ridge of mountains fading into the haze, mist between them, a pine
 * forest on the nearest ridge and a bare tree in the foreground.
 */

const NOISE2 = /* glsl */ `
float hash2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash2(i), b = hash2(i + vec2(1.0, 0.0)), c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
`;

export function duskSky(moonDir, radius = 90, { dim = 1, horizon = [0.62, 0.07, 0.07], mid = [0.2, 0.02, 0.05], top = [0.03, 0.005, 0.02], cloudDark = [0.06, 0.008, 0.016] } = {}) {
  const v3 = (a) => new THREE.Vector3(...a);
  const uniforms = { uTime: { value: 0 }, uMoon: { value: moonDir.clone().normalize() }, uDim: { value: dim }, uHor: { value: v3(horizon) }, uMid: { value: v3(mid) }, uTop: { value: v3(top) }, uCloud: { value: v3(cloudDark) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uMoon; uniform float uDim; uniform vec3 uHor, uMid, uTop, uCloud; varying vec3 vD;
      ${NOISE2}
      void main(){
        vec3 d = normalize(vD);
        float h = clamp(d.y, -0.2, 1.0);
        // crimson at the horizon, bruised maroon, then near-black overhead
        vec3 col = mix(uHor, uMid, smoothstep(-0.05, 0.25, h));
        col = mix(col, uTop, smoothstep(0.2, 0.75, h));
        float moon = max(dot(d, uMoon), 0.0);
        col += vec3(0.5, 0.12, 0.06) * pow(moon, 12.0) * 0.8 + vec3(0.25, 0.04, 0.03) * pow(moon, 3.0) * 0.4;
        // long streaks of cloud, stretched by the wind, lit red where they cross the moon's glow
        vec2 uv = vec2(d.x / (h + 0.25) * 0.5, d.z / (h + 0.25) * 0.5);
        uv.x = uv.x * 0.35 + uTime * 0.004;
        float n = fbm(uv * vec2(1.0, 3.2) + fbm(uv * 2.0) * 0.6);
        float cloud = smoothstep(0.5, 0.78, n) * smoothstep(-0.02, 0.1, h) * (1.0 - smoothstep(0.35, 0.7, h));
        vec3 cc = mix(uCloud, vec3(0.75, 0.2, 0.1), pow(moon, 6.0) * 0.9 + (1.0 - smoothstep(0.0, 0.2, h)) * 0.25);
        col = mix(col, cc, cloud * 0.85);
        // the first stars, only in the darker sky above
        vec2 sp = d.xz / (d.y + 1.0) * 180.0;
        float st = step(0.9975, hash2(floor(sp))) * smoothstep(0.35, 0.8, h) * (1.0 - cloud);
        col *= uDim;
        col += vec3(1.0, 0.85, 0.8) * st * (0.5 + 0.5 * sin(uTime * 2.0 + hash2(floor(sp) + 3.0) * 30.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/** A clear night: deep blue, stars, and thin clouds edged silver where they pass near the moon. */
export function nightSky(moonDir, radius = 90) {
  const uniforms = { uTime: { value: 0 }, uMoon: { value: moonDir.clone().normalize() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uMoon; varying vec3 vD;
      ${NOISE2}
      void main(){
        vec3 d = normalize(vD);
        float h = clamp(d.y, -0.2, 1.0);
        // a hazy blue horizon (it matches the fog), deepening to near-black navy overhead
        vec3 col = mix(vec3(0.02, 0.028, 0.048), vec3(0.008, 0.012, 0.026), smoothstep(-0.02, 0.3, h));
        col = mix(col, vec3(0.002, 0.003, 0.008), smoothstep(0.3, 0.9, h));
        float moon = max(dot(d, uMoon), 0.0);
        col += vec3(0.2, 0.24, 0.34) * pow(moon, 24.0) * 0.6 + vec3(0.04, 0.05, 0.08) * pow(moon, 6.0) * 0.5;
        vec2 uv = d.xz / (h + 0.22) * 0.55 + vec2(uTime * 0.006, 0.0);
        float n = fbm(uv * vec2(1.0, 1.8) + fbm(uv * 1.7) * 0.7);
        float cloud = smoothstep(0.52, 0.8, n) * smoothstep(0.0, 0.12, h);
        vec3 cc = mix(vec3(0.012, 0.015, 0.026), vec3(0.3, 0.33, 0.42), pow(moon, 10.0) * 0.9 + 0.04);
        col = mix(col, cc, cloud * 0.8);
        vec2 sp = d.xz / (d.y + 1.0) * 220.0;
        float st = step(0.997, hash2(floor(sp))) * smoothstep(0.15, 0.6, h) * (1.0 - cloud) * (1.0 - pow(moon, 6.0));
        col += vec3(0.9, 0.92, 1.0) * st * (0.55 + 0.45 * sin(uTime * 1.7 + hash2(floor(sp) + 7.0) * 40.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/**
 * A cratered moon, dim enough to hold its detail, with a soft corona. A blood moon by default; `pale`
 * gives an ordinary silver moon.
 */
export function bloodMoon(radius = 6, { pale = false, eclipse = false } = {}) {
  const stops = pale ? ['#f4f1ea', '#d8d6d0', '#8a8a94'] : ['#ffd2b4', '#f0a080', '#b85a48'];
  const tex = eclipse ? drawTexture(512, 512, (x, w) => {
    // in eclipse the moon is lit only by sunsets bent round the Earth: dark copper, brightest on one limb
    // the lit edge is a crescent along one limb, fading across the disc
    const g = x.createLinearGradient(w * 0.08, w * 0.92, w * 0.75, w * 0.25);
    g.addColorStop(0, '#d8804a'); g.addColorStop(0.22, '#a4442a'); g.addColorStop(0.6, '#62201a'); g.addColorStop(1, '#40120e');
    x.fillStyle = g; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); x.clip();
    // the seas: broad, soft, overlapping blotches
    // laid out like the near side: Procellarum sweeping down the left, Imbrium above it, Serenitatis and
    // Tranquillitatis joined on the right, Crisium alone near the limb, Nubium low
    const seas = [[0.26, 0.42, 0.17], [0.3, 0.6, 0.12], [0.4, 0.3, 0.12], [0.57, 0.3, 0.08], [0.62, 0.42, 0.1], [0.66, 0.53, 0.07], [0.78, 0.36, 0.05], [0.44, 0.62, 0.07]];
    for (const [sx, sy, sr] of seas) {
      for (let k = 0; k < 22; k++) {
        const cx = (sx + rand(-0.08, 0.08)) * w, cy = (sy + rand(-0.08, 0.08)) * w, r = sr * w * rand(0.3, 1.0);
        const mg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        mg.addColorStop(0, 'rgba(40,8,8,0.08)'); mg.addColorStop(1, 'rgba(40,8,8,0)');
        x.fillStyle = mg; x.fillRect(0, 0, w, w);
      }
    }
    // fine speckle of the highlands, and a single rayed crater low on the disc
    for (let i = 0; i < 5000; i++) { const l = rand(0, 1) < 0.5 ? 'rgba(255,190,150,0.05)' : 'rgba(30,6,6,0.06)'; x.fillStyle = l; x.fillRect(rand(0, w), rand(0, w), rand(1, 3), rand(1, 3)); }
    const tc = [w * 0.46, w * 0.8];
    for (let i = 0; i < 26; i++) { const a = rand(0, TAU), l = rand(20, 90); x.strokeStyle = 'rgba(255,170,120,0.05)'; x.lineWidth = rand(1, 3); x.beginPath(); x.moveTo(...tc); x.lineTo(tc[0] + Math.cos(a) * l, tc[1] + Math.sin(a) * l); x.stroke(); }
    // the limb darkens
    const lg = x.createRadialGradient(w / 2, w / 2, w * 0.32, w / 2, w / 2, w / 2);
    lg.addColorStop(0, 'rgba(20,4,4,0)'); lg.addColorStop(1, 'rgba(20,4,4,0.6)');
    x.fillStyle = lg; x.fillRect(0, 0, w, w);
    x.restore();
  }) : drawTexture(512, 512, (x, w) => {
    const g = x.createRadialGradient(w * 0.46, w * 0.44, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, stops[0]); g.addColorStop(0.7, stops[1]); g.addColorStop(1, stops[2]);
    x.fillStyle = g; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); x.clip();
    // maria where they really are on the near side, soft and blended, with a speckle of highland craters
    // and the bright rays of one young crater low on the disc
    const sea = pale ? '70,74,86' : '120,50,45';
    const seas = [[0.26, 0.42, 0.17], [0.3, 0.6, 0.12], [0.4, 0.3, 0.12], [0.57, 0.3, 0.08], [0.62, 0.42, 0.1], [0.66, 0.53, 0.07], [0.78, 0.36, 0.05], [0.44, 0.62, 0.07]];
    for (const [sx, sy, sr] of seas) {
      for (let k = 0; k < 22; k++) {
        const cx = (sx + rand(-0.08, 0.08)) * w, cy = (sy + rand(-0.08, 0.08)) * w, r = sr * w * rand(0.3, 1.0);
        const mg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        mg.addColorStop(0, `rgba(${sea},0.09)`); mg.addColorStop(1, `rgba(${sea},0)`);
        x.fillStyle = mg; x.fillRect(0, 0, w, w);
      }
    }
    for (let i = 0; i < 5000; i++) { x.fillStyle = rand(0, 1) < 0.5 ? 'rgba(255,255,255,0.05)' : `rgba(${sea},0.06)`; x.fillRect(rand(0, w), rand(0, w), rand(1, 3), rand(1, 3)); }
    const tc = [w * 0.46, w * 0.8];
    for (let i = 0; i < 26; i++) { const a = rand(0, TAU), l = rand(20, 90); x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = rand(1, 3); x.beginPath(); x.moveTo(...tc); x.lineTo(tc[0] + Math.cos(a) * l, tc[1] + Math.sin(a) * l); x.stroke(); }
    // the limb darkens
    const lg = x.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2);
    const limb = pale ? '18,20,30' : '60,10,10';
    lg.addColorStop(0, `rgba(${limb},0)`); lg.addColorStop(1, `rgba(${limb},0.5)`);
    x.fillStyle = lg; x.fillRect(0, 0, w, w);
    x.restore();
  });
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, color: pale ? 0xc8ccd8 : eclipse ? 0xffffff : 0xd8b0a0 }));
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: pale ? 0x8fa0d0 : eclipse ? 0xa02810 : 0xff5030, transparent: true, opacity: pale ? 0.22 : eclipse ? 0.28 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  corona.scale.setScalar(radius * (eclipse ? 3.2 : 4.2));
  corona.position.z = -0.5;
  g.add(corona, disc);
  g.renderOrder = -8;
  disc.renderOrder = corona.renderOrder = -8;
  return g;
}

/** A mountain ridge silhouette: a jagged skyline from layered waves. */
function ridge({ z, base, amp, color, seed, width = 200, step = 1.2 }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, base - 40);
  const ph = [rand(0, TAU), rand(0, TAU), rand(0, TAU), rand(0, TAU)];
  const heights = [];
  for (let x = -width / 2; x <= width / 2; x += step) {
    const y = base + amp * (Math.sin(x * 0.045 + ph[0] + seed) * 0.55 + Math.abs(Math.sin(x * 0.11 + ph[1])) * 0.5
      + Math.sin(x * 0.27 + ph[2]) * 0.18 + Math.sin(x * 0.9 + ph[3]) * 0.05);
    shape.lineTo(x, y);
    heights.push([x, y]);
  }
  shape.lineTo(width / 2, base - 40);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, fog: false }));
  m.position.z = z;
  m.userData.skyline = heights;
  return m;
}

/** A band of mist lying along a valley, soft at top and bottom. */
function mistBand(z, y, color, opacity) {
  const tex = drawTexture(4, 128, (x, w, hh) => {
    const g = x.createLinearGradient(0, 0, 0, hh);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, hh);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(220, 8), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, fog: false }));
  m.position.set(0, y, z);
  return m;
}

/** Pines along a skyline: each a stack of narrowing tiers, merged into one silhouette geometry. */
function pines(skyline, z, color, every = [0.9, 2.2]) {
  const pos = [];
  let next = skyline[0][0];
  for (const [x, y] of skyline) {
    if (x < next) continue;
    next = x + rand(every[0], every[1]);
    const hh = rand(1.6, 3.8), w = hh * rand(0.32, 0.42);
    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const y0 = y - 0.3 + (t / tiers) * hh * 0.82, y1 = y0 + hh * (0.34 - t * 0.03);
      const ww = w * (1 - t * 0.17) * rand(0.8, 1.15);
      const droop = hh * 0.05;
      // each tier: a ragged skirt of three spikes, the outer ones drooping
      pos.push(x - ww, y0 - droop, 0, x - ww * 0.3, y0 + rand(0, 0.1), 0, x + rand(-0.05, 0.05), y1, 0);
      pos.push(x - ww * 0.3, y0 + rand(0, 0.1), 0, x + ww * 0.3, y0 + rand(0, 0.1), 0, x + rand(-0.05, 0.05), y1, 0);
      pos.push(x + ww * 0.3, y0 + rand(0, 0.1), 0, x + ww, y0 - droop, 0, x + rand(-0.05, 0.05), y1, 0);
    }
    pos.push(x - 0.06, y - 0.4, 0, x + 0.06, y - 0.4, 0, x, y + 0.2, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }));
  m.position.z = z + 0.05;
  return m;
}

/** A bare tree: a trunk forking into twisting, tapering branches (flat silhouette). */
function deadTree(color) {
  const pos = [];
  const seg = (a, b, w0, w1) => {
    const d = b.clone().sub(a).normalize();
    const n = new THREE.Vector2(-d.y, d.x);
    const a0 = a.clone().addScaledVector(n, w0), a1 = a.clone().addScaledVector(n, -w0);
    const b0 = b.clone().addScaledVector(n, w1), b1 = b.clone().addScaledVector(n, -w1);
    pos.push(a0.x, a0.y, 0, a1.x, a1.y, 0, b0.x, b0.y, 0, b0.x, b0.y, 0, a1.x, a1.y, 0, b1.x, b1.y, 0);
  };
  const grow = (p, ang, len, w, depth) => {
    let cur = p.clone(), a = ang;
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      a += rand(-0.25, 0.25);
      const nxt = cur.clone().add(new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(len / steps));
      const wi = w * (1 - i / steps * 0.6), wo = w * (1 - (i + 1) / steps * 0.6);
      seg(cur, nxt, wi, wo);
      cur = nxt;
    }
    if (depth <= 0) return;
    const forks = depth > 2 ? 2 : Math.random() < 0.7 ? 2 : 3;
    for (let f = 0; f < forks; f++) grow(cur, a + rand(-0.9, 0.9), len * rand(0.55, 0.75), w * 0.4, depth - 1);
  };
  grow(new THREE.Vector2(0, -2), Math.PI / 2 + 0.12, 9, 0.7, 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }));
}

/**
 * Builds the whole backdrop into `scene`. The moon's direction (from the camera's side of the scene)
 * steers the glow in the sky. Returns what needs updating each frame.
 */
export function buildDusk(scene, { moonPos = new THREE.Vector3(12.4, 5.4, -70), moonRadius = 6.2 } = {}) {
  // the last light of the sun low and deep red-orange at the horizon, the sky above already dark
  const sky = duskSky(moonPos, 90, { horizon: [0.24, 0.032, 0.014], mid: [0.045, 0.006, 0.009], top: [0.006, 0.0015, 0.005], cloudDark: [0.018, 0.003, 0.006] });
  scene.add(sky);
  const moon = bloodMoon(moonRadius, { eclipse: true });
  moon.position.copy(moonPos);
  scene.add(moon);
  // ridges: far ones take on the haze's red, near ones are nearly black
  const far = ridge({ z: -62, base: -11, amp: 6, color: 0x4a1210, seed: 1 });
  const mid = ridge({ z: -46, base: -13, amp: 4, color: 0x220709, seed: 2 });
  const near = ridge({ z: -32, base: -14.5, amp: 2.4, color: 0x080204, seed: 3 });
  scene.add(far, mid, near);
  scene.add(mistBand(-54, -9, 0x9a3a2a, 0.3), mistBand(-40, -12, 0x6a2020, 0.26));
  scene.add(pines(mid.userData.skyline, -46, 0x1a0507, [1.4, 3.2]), pines(near.userData.skyline, -32, 0x050103, [0.7, 1.8]));
  const tree = deadTree(0x040103);
  tree.position.set(-19, -13.5, -14);
  tree.scale.setScalar(1.1);
  scene.add(tree);
  return { sky, moon };
}
