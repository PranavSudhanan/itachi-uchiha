import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Uniforms shared by every custom shader (updated by the App each frame / resize). */
export const shared = {
  uTime: { value: 0 },
  uPointScale: { value: 400 },
};

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function toTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function drawTexture(w, h, fn, srgb = true) {
  const [c, x] = makeCanvas(w, h);
  fn(x, w, h);
  return toTexture(c, srgb);
}

function circle(x, cx, cy, r) {
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
}

/* ------------------------------------------------------------------ */
/* Sharingan artwork                                                   */
/* ------------------------------------------------------------------ */

/**
 * Draws an eye pattern onto a canvas.
 * mode: 0 = onyx (normal eye), 1..3 = tomoe count, 'mangekyo' = Itachi's Mangekyō.
 */
export function sharinganCanvas(mode = 3, size = 512) {
  const [c, x] = makeCanvas(size);
  const R = (size / 2) * 0.98;
  x.translate(size / 2, size / 2);

  if (mode === 0) {
    const g = x.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#3a302e');
    g.addColorStop(0.65, '#1a1312');
    g.addColorStop(1, '#050303');
    x.fillStyle = g;
    circle(x, 0, 0, R);
    x.fill();
    x.strokeStyle = 'rgba(150,110,100,0.13)';
    x.lineWidth = R * 0.012;
    for (let i = 0; i < 110; i++) {
      const a = (i / 110) * TAU;
      x.beginPath();
      x.moveTo(Math.cos(a) * R * 0.28, Math.sin(a) * R * 0.28);
      x.lineTo(Math.cos(a + 0.05) * R * 0.92, Math.sin(a + 0.05) * R * 0.92);
      x.stroke();
    }
    x.fillStyle = '#000';
    circle(x, 0, 0, R * 0.27);
    x.fill();
    highlight(x, R);
    return c;
  }

  const g = x.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
  g.addColorStop(0, '#ff5a48');
  g.addColorStop(0.45, '#e3121f');
  g.addColorStop(0.85, '#980510');
  g.addColorStop(1, '#300003');
  x.fillStyle = g;
  circle(x, 0, 0, R);
  x.fill();

  x.strokeStyle = 'rgba(255,140,120,0.10)';
  x.lineWidth = R * 0.01;
  for (let i = 0; i < 140; i++) {
    const a = (i / 140) * TAU;
    x.beginPath();
    x.moveTo(Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18);
    x.lineTo(Math.cos(a + 0.08) * R * 0.95, Math.sin(a + 0.08) * R * 0.95);
    x.stroke();
  }

  x.lineWidth = R * 0.07;
  x.strokeStyle = '#060000';
  circle(x, 0, 0, R * 0.965);
  x.stroke();

  x.fillStyle = '#060000';
  if (mode === 'mangekyo') {
    const r0 = R * 0.24;
    const Rt = R * 0.94;
    for (let k = 0; k < 3; k++) {
      const a = (k * TAU) / 3 - Math.PI / 2;
      x.beginPath();
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        const s = i / steps;
        const th = a - 0.6 + 1.35 * s * s;
        const rr = r0 * 0.7 + (Rt - r0 * 0.7) * s;
        const px = Math.cos(th) * rr;
        const py = Math.sin(th) * rr;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      for (let i = steps; i >= 0; i--) {
        const s = i / steps;
        const th = a + 0.55 + 0.2 * s * s;
        const rr = r0 * 0.7 + (Rt - r0 * 0.7) * s;
        x.lineTo(Math.cos(th) * rr, Math.sin(th) * rr);
      }
      x.closePath();
      x.fill();
    }
    circle(x, 0, 0, r0);
    x.fill();
    // faint inner red ring for depth
    x.strokeStyle = 'rgba(200,10,20,0.55)';
    x.lineWidth = R * 0.02;
    circle(x, 0, 0, r0 * 0.55);
    x.stroke();
  } else {
    x.strokeStyle = 'rgba(25,0,0,0.85)';
    x.lineWidth = R * 0.02;
    circle(x, 0, 0, R * 0.56);
    x.stroke();
    const h = R * 0.105;
    for (let k = 0; k < mode; k++) {
      const a = (k * TAU) / Math.max(mode, 1) - Math.PI / 2;
      x.save();
      x.rotate(a);
      x.translate(R * 0.56, 0);
      circle(x, 0, 0, h);
      x.fill();
      x.beginPath();
      x.moveTo(h * 0.98, h * 0.15);
      x.quadraticCurveTo(h * 1.25, -h * 1.7, -h * 0.35, -h * 2.5);
      x.quadraticCurveTo(h * 0.25, -h * 1.3, -h * 0.75, -h * 0.65);
      x.closePath();
      x.fill();
      x.restore();
    }
    circle(x, 0, 0, R * 0.14);
    x.fill();
  }
  highlight(x, R);
  return c;
}

function highlight(x, R) {
  const g = x.createRadialGradient(-R * 0.35, -R * 0.4, 0, -R * 0.35, -R * 0.4, R * 0.35);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  circle(x, -R * 0.35, -R * 0.4, R * 0.35);
  x.fill();
}

const eyeTexCache = new Map();
export function sharinganTexture(mode) {
  if (!eyeTexCache.has(mode)) eyeTexCache.set(mode, toTexture(sharinganCanvas(mode)));
  return eyeTexCache.get(mode);
}

/* ------------------------------------------------------------------ */
/* Misc textures                                                      */
/* ------------------------------------------------------------------ */

let _feather;
export function featherTexture() {
  if (_feather) return _feather;
  _feather = drawTexture(128, 256, (x) => {
    x.translate(64, 128);
    const g = x.createLinearGradient(0, -120, 0, 120);
    g.addColorStop(0, '#16121e');
    g.addColorStop(1, '#040306');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, -122);
    x.bezierCurveTo(44, -80, 38, 60, 5, 116);
    x.lineTo(-5, 116);
    x.bezierCurveTo(-40, 50, -40, -80, 0, -122);
    x.fill();
    x.strokeStyle = 'rgba(90,80,120,0.35)';
    x.lineWidth = 1;
    for (let i = -110; i < 105; i += 5) {
      x.beginPath();
      x.moveTo(0, i);
      x.lineTo(32, i - 16);
      x.moveTo(0, i);
      x.lineTo(-32, i - 16);
      x.stroke();
    }
    x.globalCompositeOperation = 'destination-out';
    x.lineWidth = 3;
    for (const [y, s] of [[-40, 1], [10, -1], [55, 1]]) {
      x.beginPath();
      x.moveTo(s * 40, y - 20);
      x.lineTo(s * 6, y);
      x.stroke();
    }
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = '#5a5566';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, -118);
    x.lineTo(0, 128);
    x.stroke();
  });
  return _feather;
}

let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  _glow = drawTexture(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  });
  return _glow;
}

/* Akatsuki cloud path, shared by THREE.Shape and canvas contexts. */
const CLOUD = [
  ['m', -1.0, -0.25],
  ['b', -1.38, -0.25, -1.36, 0.3, -0.95, 0.28],
  ['b', -0.98, 0.78, -0.35, 0.82, -0.22, 0.45],
  ['b', -0.05, 0.9, 0.58, 0.88, 0.55, 0.4],
  ['b', 0.98, 0.58, 1.34, 0.1, 1.0, -0.1],
  ['b', 1.22, -0.46, 0.8, -0.64, 0.55, -0.4],
  ['b', 0.2, -0.68, -0.3, -0.62, -0.45, -0.42],
  ['b', -0.72, -0.62, -1.08, -0.52, -1.0, -0.25],
];
export function traceCloud(t, sx = 1, sy = 1, ox = 0, oy = 0) {
  for (const s of CLOUD) {
    if (s[0] === 'm') t.moveTo(ox + s[1] * sx, oy + s[2] * sy);
    else t.bezierCurveTo(ox + s[1] * sx, oy + s[2] * sy, ox + s[3] * sx, oy + s[4] * sy, ox + s[5] * sx, oy + s[6] * sy);
  }
}
export function cloudShape(scale = 1) {
  const s = new THREE.Shape();
  traceCloud(s, scale, scale);
  return s;
}
/*
 * The Akatsuki's red cloud as drawn on the cloaks: rounded lobes merged into one cloud, a white border
 * all round, and a white curl turning in on itself inside the lower-left lobe.
 * Lobes are (x, y, r) in units of the cloud's size, canvas y down.
 */
const AKATSUKI_LOBES = [
  [-0.58, 0.14, 0.36], [-0.3, -0.24, 0.42], [0.26, -0.28, 0.46], [0.68, 0.0, 0.36],
  [0.44, 0.26, 0.3], [0.06, 0.24, 0.36], [-0.28, 0.26, 0.3],
];
const lobes = (x, cx, cy, s, grow) => {
  x.beginPath();
  for (const [lx, ly, r] of AKATSUKI_LOBES) { x.moveTo(cx + lx * s + (r * s + grow), cy + ly * s); x.arc(cx + lx * s, cy + ly * s, r * s + grow, 0, TAU); }
};
const curl = (x, cx, cy, s) => {
  // a spiral opening outward from the centre of the lower-left lobe
  const ox = cx - 0.5 * s, oy = cy + 0.1 * s;
  x.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, a = -Math.PI * 0.2 + t * Math.PI * 1.55, r = s * (0.05 + t * 0.2);
    const px = ox + Math.cos(a) * r, py = oy + Math.sin(a) * r;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
};

/**
 * Draws the Akatsuki cloud centred at (cx, cy), `size` ≈ half its height. `outline: true` draws only the
 * border and the curl in white (for tracing the shape with crows).
 */
export function drawAkatsukiCloud(x, cx, cy, size, { outline = false, fill = '#c1121f', border = '#f3efe8' } = {}) {
  const b = size * 0.11;
  x.save();
  x.lineCap = x.lineJoin = 'round';
  x.fillStyle = outline ? '#fff' : border;
  lobes(x, cx, cy, size, b);
  x.fill();
  x.fillStyle = outline ? '#000' : fill;
  lobes(x, cx, cy, size, 0);
  x.fill();
  x.strokeStyle = outline ? '#fff' : border;
  x.lineWidth = b * 0.85;
  curl(x, cx, cy, size);
  x.stroke();
  x.restore();
}

export function drawCloud(x, cx, cy, size) {
  drawAkatsukiCloud(x, cx, cy, size);
}

let _cloak;
export function cloakTexture() {
  if (_cloak) return _cloak;
  _cloak = drawTexture(512, 512, (x) => {
    x.fillStyle = '#08060a';
    x.fillRect(0, 0, 512, 512);
    const spots = [[90, 120], [330, 80], [220, 300], [440, 330], [80, 420], [380, 480]];
    for (const [cx, cy] of spots) drawCloud(x, cx, cy, 44);
  });
  _cloak.wrapS = _cloak.wrapT = THREE.RepeatWrapping;
  return _cloak;
}

/** Konoha leaf symbol. */
export function drawLeaf(x, cx, cy, r, { color = '#222', width = r * 0.13, scratch = false } = {}) {
  x.save();
  x.translate(cx, cy);
  x.strokeStyle = color;
  x.lineWidth = width;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.beginPath();
  // spiral
  let first = true;
  for (let t = 0; t <= Math.PI * 3.2; t += 0.08) {
    const rr = r * 0.06 + r * 0.16 * t;
    const px = Math.cos(t + Math.PI) * rr * 0.9;
    const py = Math.sin(t + Math.PI) * rr * 0.9;
    first ? x.moveTo(px, py) : x.lineTo(px, py);
    first = false;
  }
  // leaf body sweeping to a point top-right, then back down the left side
  x.quadraticCurveTo(-r * 0.9, r * 0.9, r * 0.1, r * 0.95);
  x.quadraticCurveTo(r * 1.05, r * 0.7, r * 0.95, -r * 0.2);
  x.lineTo(r * 0.55, -r * 1.05);
  x.quadraticCurveTo(r * 0.2, -r * 0.55, -r * 0.35, -r * 0.8);
  x.stroke();
  x.restore();
  if (scratch) {
    x.save();
    x.strokeStyle = 'rgba(15,15,18,0.95)';
    x.lineWidth = width * 0.7;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx - r * 2.1, cy + r * 0.05);
    x.lineTo(cx + r * 2.1, cy - r * 0.12);
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.55)';
    x.lineWidth = width * 0.18;
    x.beginPath();
    x.moveTo(cx - r * 2.0, cy + r * 0.05 - width * 0.35);
    x.lineTo(cx + r * 2.0, cy - r * 0.12 - width * 0.35);
    x.stroke();
    x.restore();
  }
}

/** Samples filled pixels of a drawing and returns points in width-normalised space (x in [-0.5, 0.5]). */
export function sampleDrawing(draw, count, w = 320, h = 160) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = '#000';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#fff';
  x.strokeStyle = '#fff';
  draw(x, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const pts = [];
  for (let y = 0; y < h; y += 2) {
    for (let xx = 0; xx < w; xx += 2) {
      if (d[(y * w + xx) * 4] > 128) pts.push([xx / w - 0.5, -(y / h - 0.5) * (h / w)]);
    }
  }
  shuffle(pts);
  const out = [];
  for (let i = 0; i < count; i++) out.push(pts.length ? pts[i % pts.length] : [0, 0]);
  return out;
}

/* ------------------------------------------------------------------ */
/* GLSL                                                                */
/* ------------------------------------------------------------------ */

export const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

/** Vertical gradient sky dome. */
export function makeSky(top, bottom, { radius = 90, exponent = 0.8 } = {}) {
  const uniforms = {
    uTop: { value: new THREE.Color(top) },
    uBottom: { value: new THREE.Color(bottom) },
    uExp: { value: exponent },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uBottom; uniform float uExp; varying vec3 vP;
      void main(){ float h = clamp(vP.y*0.5+0.5,0.0,1.0); vec3 c = mix(uBottom,uTop,pow(h,uExp));
        gl_FragColor = vec4(c,1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/** Tiny DOM helper: h('div.cls#id', {attrs}, children) */
export function h(tag, attrs = {}, ...children) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const r of rest) {
    if (r[0] === '.') el.classList.add(r.slice(1));
    else if (r[0] === '#') el.id = r.slice(1);
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

/** Projects a world point to CSS pixels. */
const _v = new THREE.Vector3();
export function toScreen(p, camera, w, hgt) {
  _v.copy(p).project(camera);
  return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * hgt, behind: _v.z > 1 };
}

/** Intersection of pointer ray with a plane. */
const _ray = new THREE.Raycaster();
export function pointerOnPlane(ndc, camera, plane, target = new THREE.Vector3()) {
  _ray.setFromCamera(ndc, camera);
  return _ray.ray.intersectPlane(plane, target);
}
