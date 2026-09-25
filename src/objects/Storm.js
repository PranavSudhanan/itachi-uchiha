import * as THREE from 'three';
import { drawTexture, rand, TAU } from '../core/utils.js';

/*
 * A thunderstorm over ruined ground (the Uchiha hideout where Itachi faced Sasuke): a dome of heavy
 * clouds that light up from within when lightning strikes, a ring of distant mountains, broken stone
 * ruins, wet rock with standing water, and branching lightning bolts.
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

/** Storm clouds on a dome: dark, heavy banks rolling slowly; a strike lights them from within around it. */
export function stormSky(radius = 70) {
  const uniforms = {
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uFlashDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
    uBody: { value: new THREE.Color(0x07080d) },
    uLit: { value: new THREE.Color(0x1c2030) },
    uGlow: { value: new THREE.Color(0x3a1410) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uFlash; uniform vec3 uFlashDir; uniform vec3 uBody; uniform vec3 uLit; uniform vec3 uGlow;
      varying vec3 vD;
      ${NOISE2}
      void main(){
        vec3 d = normalize(vD);
        float h = max(d.y, 0.0);
        vec2 uv = d.xz / (h + 0.22) * 0.8;
        vec2 flow = vec2(uTime * 0.018, uTime * 0.006);
        float n = fbm(uv + flow + fbm(uv * 0.5 - flow * 0.7) * 1.1);
        float n2 = fbm(uv * 2.6 - flow * 1.6);
        // billows: bright tops, dark undersides
        float shade = smoothstep(0.35, 0.8, n) * 0.7 + n2 * 0.3;
        vec3 col = mix(uBody, uLit, shade * 0.6);
        // the Susanoo's glow on the cloud base near the horizon
        col += uGlow * (1.0 - smoothstep(0.0, 0.35, h)) * 0.6;
        // lightning inside the clouds: strongest around the strike, shaped by the billows
        float near = pow(max(dot(d, uFlashDir), 0.0), 5.0);
        col += vec3(0.62, 0.68, 0.9) * uFlash * (near * 1.8 + 0.06) * (0.35 + shade);
        // haze at the horizon
        col = mix(col, uBody * 1.3 + uGlow * 0.2, 1.0 - smoothstep(-0.02, 0.18, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/** A heavy overcast by day: banks of grey cloud, the sun a dim bright patch behind them, haze at the horizon. */
export function overcastSky(sunDir, radius = 90) {
  const uniforms = { uTime: { value: 0 }, uSun: { value: sunDir.clone().normalize() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; varying vec3 vD;
      ${NOISE2}
      void main(){
        vec3 d = normalize(vD);
        float h = max(d.y, 0.0);
        vec2 uv = d.xz / (h + 0.25) * 0.7;
        vec2 flow = vec2(uTime * 0.01, uTime * 0.004);
        float n = fbm(uv + flow + fbm(uv * 0.6 - flow) * 0.9);
        float n2 = fbm(uv * 2.4 - flow * 1.5);
        // grey banks: lighter tops, darker bellies
        vec3 col = mix(vec3(0.13, 0.125, 0.125), vec3(0.32, 0.305, 0.3), smoothstep(0.3, 0.85, n) * 0.8 + n2 * 0.25);
        float sun = max(dot(d, uSun), 0.0);
        col += vec3(0.55, 0.48, 0.4) * pow(sun, 10.0) * (0.4 + (1.0 - n) * 0.8) + vec3(0.14, 0.12, 0.1) * pow(sun, 3.0);
        // dust haze toward the horizon
        col = mix(col, vec3(0.3, 0.285, 0.27), 1.0 - smoothstep(-0.02, 0.22, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/** A bare, dead tree in 3D: a leaning trunk forking into twisted, tapering branches. */
export function deadTree3D(material, height = 7) {
  const parts = [];
  const grow = (base, dir, len, r, depth) => {
    const end = base.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(r * 0.62, r, len, 6, 1);
    geo.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    geo.applyQuaternion(q);
    geo.translate(base.x, base.y, base.z);
    parts.push(geo);
    if (depth <= 0) return;
    const forks = depth > 2 ? 2 : 3;
    for (let f = 0; f < forks; f++) {
      const nd = dir.clone().add(new THREE.Vector3(rand(-0.9, 0.9), rand(0.1, 0.6), rand(-0.9, 0.9))).normalize();
      grow(end, nd, len * rand(0.5, 0.72), r * 0.6, depth - 1);
    }
  };
  grow(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(rand(-0.15, 0.15), 1, rand(-0.15, 0.15)).normalize(), height * 0.45, height * 0.035, 4);
  // merge by hand (no addon import needed): concatenate positions and normals
  let count = 0;
  for (const g of parts) count += g.index ? g.index.count : g.attributes.position.count;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.set(ng.attributes.position.array, o * 3);
    nrm.set(ng.attributes.normal.array, o * 3);
    o += ng.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return m;
}

/** A ring of jagged mountains on the horizon, only really seen against the lightning. */
export function mountainRing(radius = 64, color = 0x06070b, scale = 1) {
  const seg = 160;
  const pos = [];
  const hgt = (a) => (1.5 + Math.abs(Math.sin(a * 3.1 + 1.2)) * 4.5 + Math.sin(a * 7.7) * 1.4 + Math.sin(a * 17.3 + 0.7) * 0.8 + Math.sin(a * 41) * 0.3) * scale;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const p = (a, y) => [Math.cos(a) * radius, y, Math.sin(a) * radius];
    const b0 = p(a0, -2), b1 = p(a1, -2), t0 = p(a0, hgt(a0)), t1 = p(a1, hgt(a1));
    pos.push(...b0, ...t0, ...b1, ...b1, ...t0, ...t1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }));
  m.renderOrder = -9;
  return m;
}

/**
 * Broken pillars, wall stubs and fallen blocks scattered outside the fighting ground: low walls and
 * rubble close in, tall pillars beyond the camera's widest orbit so it never passes through one.
 */
export function ruins({ inner = 24, outer = 30, far = [44, 54], count = 34 } = {}) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x45454e, roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c33, roughness: 0.93, flatShading: true });
  const jag = (geo, amt) => {
    // chip the top edge so nothing reads as a clean box
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) - Math.random() * amt);
    geo.computeVertexNormals();
    return geo;
  };
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const kind = Math.random();
    const r = kind < 0.4 ? rand(far[0], far[1]) : rand(inner, outer);
    let m;
    if (kind < 0.4) {
      const hh = rand(2.5, 8);
      const geo = jag(new THREE.BoxGeometry(rand(0.9, 1.6), hh, rand(0.9, 1.6), 1, 3, 1), hh * 0.35);
      m = new THREE.Mesh(geo, stone);
      m.position.y = hh / 2 - 0.3;
      m.rotation.set(rand(-0.08, 0.08), rand(0, TAU), rand(-0.1, 0.1));
    } else if (kind < 0.72) {
      const w = rand(3, 7), hh = rand(0.8, 2.2);
      const geo = jag(new THREE.BoxGeometry(w, hh, rand(0.5, 0.9), 6, 1, 1), hh * 0.6);
      m = new THREE.Mesh(geo, dark);
      m.position.y = hh / 2 - 0.2;
      m.rotation.y = a + Math.PI / 2 + rand(-0.4, 0.4);
    } else {
      const s = rand(0.8, 1.8);
      m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stone);
      m.scale.set(rand(1, 1.8), rand(0.5, 0.9), rand(1, 1.5));
      m.position.y = s * 0.3;
      m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    }
    m.position.x = Math.cos(a) * r;
    m.position.z = Math.sin(a) * r;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** Wet rock: dark stone with cracks, and standing water that turns glossy (low roughness) where it pools. */
export function wetGround(radius = 70) {
  const S = 1024;
  const color = drawTexture(S, S, (x, w) => {
    x.fillStyle = '#15151a'; x.fillRect(0, 0, w, w);
    for (let i = 0; i < 2600; i++) {
      const l = rand(14, 34);
      x.fillStyle = `rgba(${l},${l},${l + 4},${rand(0.15, 0.4)})`;
      x.beginPath(); x.arc(rand(0, w), rand(0, w), rand(2, 16), 0, TAU); x.fill();
    }
    x.strokeStyle = 'rgba(5,5,8,0.75)';
    for (let i = 0; i < 70; i++) {
      let px = rand(0, w), py = rand(0, w);
      x.lineWidth = rand(0.8, 2.2);
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 7; k++) { px += rand(-40, 40); py += rand(-40, 40); x.lineTo(px, py); }
      x.stroke();
    }
  });
  // roughness: white = rough stone, dark = standing water
  const rough = drawTexture(S, S, (x, w) => {
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, w, w);
    // a sheen of rain everywhere, with a few broad, soft-edged pools
    x.fillStyle = 'rgba(150,150,150,0.35)'; x.fillRect(0, 0, w, w);
    for (let i = 0; i < 16; i++) {
      const cx = rand(0, w), cy = rand(0, w), rr = rand(70, 220);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, 'rgba(80,80,80,0.9)'); g.addColorStop(0.6, 'rgba(110,110,110,0.5)'); g.addColorStop(1, 'rgba(110,110,110,0)');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(cx, cy, rr, rr * rand(0.4, 0.9), rand(0, 3), 0, TAU); x.fill();
    }
  });
  for (const t of [color, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); }
  rough.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: color, roughnessMap: rough, roughness: 1, metalness: 0.05, envMapIntensity: 0.6 });
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.01;
  m.receiveShadow = true;
  return m;
}

/**
 * A lightning bolt: a jagged main channel with a few forks, drawn as thin glowing ribbons that face the
 * camera, plus a bright core. `strike(from)` builds a new one; `update(dt, camera)` fades it.
 */
export class Bolt {
  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.glowMat = this.mat.clone();
    this.glowMat.color.set(0x7080d0);
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    this.paths = [];
  }

  strike(from = new THREE.Vector3(rand(-30, 30), 45, rand(-50, -25)), groundY = 0) {
    this.group.clear();
    this.paths = [];
    const walk = (p, dir, steps, jitter) => {
      const pts = [p.clone()];
      for (let i = 0; i < steps; i++) {
        p = p.clone().add(dir.clone().multiplyScalar(rand(1.6, 3))).add(new THREE.Vector3(rand(-1, 1) * jitter, 0, rand(-0.5, 0.5) * jitter));
        if (p.y < groundY) { p.y = groundY; pts.push(p); break; }
        pts.push(p);
      }
      return pts;
    };
    const main = walk(from, new THREE.Vector3(0, -1, 0), 26, 1.6);
    this.paths.push({ pts: main, w: 0.34 });
    for (let f = 0; f < 4; f++) {
      const at = main[Math.floor(rand(2, main.length * 0.6))];
      const dir = new THREE.Vector3(rand(-1, 1), -rand(0.5, 1), rand(-0.3, 0.3)).normalize();
      this.paths.push({ pts: walk(at, dir, Math.floor(rand(3, 8)), 1.1), w: 0.14 });
    }
    for (const path of this.paths) {
      path.core = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      path.glow = new THREE.Mesh(new THREE.BufferGeometry(), this.glowMat);
      path.core.frustumCulled = path.glow.frustumCulled = false;
      this.group.add(path.glow, path.core);
    }
    this.mat.opacity = 1;
    this.glowMat.opacity = 0.55;
    this.dirty = true;
  }

  /** Rebuilds each ribbon so it faces the camera. */
  _ribbon(geo, pts, w, camera) {
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = b.clone().sub(a);
      const view = camera.position.clone().sub(a);
      const side = seg.clone().cross(view).normalize().multiplyScalar(w * (1 - (i / pts.length) * 0.5));
      const a0 = a.clone().add(side), a1 = a.clone().sub(side), b0 = b.clone().add(side), b1 = b.clone().sub(side);
      pos.push(...a0.toArray(), ...a1.toArray(), ...b0.toArray(), ...b0.toArray(), ...a1.toArray(), ...b1.toArray());
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }

  update(dt, camera) {
    if (this.mat.opacity <= 0.01) { this.group.visible = false; return; }
    this.group.visible = true;
    for (const p of this.paths) {
      this._ribbon(p.core.geometry, p.pts, p.w, camera);
      this._ribbon(p.glow.geometry, p.pts, p.w * 5, camera);
    }
    // a flicker, then gone
    this.mat.opacity = Math.max(0, this.mat.opacity - dt * 3.2) * (0.85 + Math.random() * 0.15);
    this.glowMat.opacity = this.mat.opacity * 0.5;
  }
}
