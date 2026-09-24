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

export function duskSky(moonDir, radius = 90) {
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
        // crimson at the horizon, bruised maroon, then near-black overhead
        vec3 col = mix(vec3(0.62, 0.07, 0.07), vec3(0.2, 0.02, 0.05), smoothstep(-0.05, 0.25, h));
        col = mix(col, vec3(0.03, 0.005, 0.02), smoothstep(0.2, 0.75, h));
        float moon = max(dot(d, uMoon), 0.0);
        col += vec3(0.5, 0.12, 0.06) * pow(moon, 12.0) * 0.8 + vec3(0.25, 0.04, 0.03) * pow(moon, 3.0) * 0.4;
        // long streaks of cloud, stretched by the wind, lit red where they cross the moon's glow
        vec2 uv = vec2(d.x / (h + 0.25) * 0.5, d.z / (h + 0.25) * 0.5);
        uv.x = uv.x * 0.35 + uTime * 0.004;
        float n = fbm(uv * vec2(1.0, 3.2) + fbm(uv * 2.0) * 0.6);
        float cloud = smoothstep(0.5, 0.78, n) * smoothstep(-0.02, 0.1, h) * (1.0 - smoothstep(0.35, 0.7, h));
        vec3 cc = mix(vec3(0.06, 0.008, 0.016), vec3(0.75, 0.2, 0.1), pow(moon, 6.0) * 0.9 + (1.0 - smoothstep(0.0, 0.2, h)) * 0.25);
        col = mix(col, cc, cloud * 0.85);
        // the first stars, only in the darker sky above
        vec2 sp = d.xz / (d.y + 1.0) * 180.0;
        float st = step(0.9975, hash2(floor(sp))) * smoothstep(0.35, 0.8, h) * (1.0 - cloud);
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

/** A cratered blood moon: warm and dim enough to hold its detail, with a soft corona. */
export function bloodMoon(radius = 6) {
  const tex = drawTexture(512, 512, (x, w) => {
    const g = x.createRadialGradient(w * 0.46, w * 0.44, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, '#ffd2b4'); g.addColorStop(0.7, '#f0a080'); g.addColorStop(1, '#b85a48');
    x.fillStyle = g; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); x.clip();
    // maria: broad darker seas
    for (let i = 0; i < 9; i++) {
      const cx = rand(90, w - 90), cy = rand(90, w - 90), r = rand(40, 110);
      const mg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      mg.addColorStop(0, 'rgba(120,50,45,0.35)'); mg.addColorStop(1, 'rgba(120,50,45,0)');
      x.fillStyle = mg; x.fillRect(0, 0, w, w);
    }
    // craters with a lit rim and a shadowed floor
    for (let i = 0; i < 60; i++) {
      const cx = rand(30, w - 30), cy = rand(30, w - 30), r = rand(3, 20);
      x.fillStyle = 'rgba(110,45,40,0.16)'; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,220,200,0.14)'; x.lineWidth = r * 0.25; x.beginPath(); x.arc(cx - r * 0.1, cy - r * 0.1, r, Math.PI * 0.9, Math.PI * 1.9); x.stroke();
    }
    // the limb darkens
    const lg = x.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2);
    lg.addColorStop(0, 'rgba(60,10,10,0)'); lg.addColorStop(1, 'rgba(60,10,10,0.55)');
    x.fillStyle = lg; x.fillRect(0, 0, w, w);
    x.restore();
  });
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, color: 0xd8b0a0 }));
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff5030, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  corona.scale.setScalar(radius * 4.2);
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
    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
      const y0 = y - 0.3 + (t / tiers) * hh * 0.75, y1 = y0 + hh * (0.5 - t * 0.06);
      const ww = w * (1 - t * 0.25);
      pos.push(x - ww, y0, 0, x + ww, y0, 0, x + rand(-0.05, 0.05), y1, 0);
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
export function buildDusk(scene, { moonPos = new THREE.Vector3(12.4, 4.4, -70), moonRadius = 9.4 } = {}) {
  const sky = duskSky(moonPos);
  scene.add(sky);
  const moon = bloodMoon(moonRadius);
  moon.position.copy(moonPos);
  scene.add(moon);
  // ridges: far ones take on the haze's red, near ones are nearly black
  const far = ridge({ z: -62, base: -11, amp: 6, color: 0x5a0f16, seed: 1 });
  const mid = ridge({ z: -46, base: -13, amp: 4, color: 0x2a060c, seed: 2 });
  const near = ridge({ z: -32, base: -14.5, amp: 2.4, color: 0x0b0207, seed: 3 });
  scene.add(far, mid, near);
  scene.add(mistBand(-54, -9, 0xb0303a, 0.35), mistBand(-40, -12, 0x802028, 0.3));
  scene.add(pines(mid.userData.skyline, -46, 0x220509, [1.4, 3.2]), pines(near.userData.skyline, -32, 0x070105, [0.7, 1.8]));
  const tree = deadTree(0x040103);
  tree.position.set(-19, -13.5, -14);
  tree.scale.setScalar(1.1);
  scene.add(tree);
  return { sky, moon };
}
