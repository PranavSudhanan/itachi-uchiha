import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NOISE_GLSL, shared, drawTexture, TAU } from '../core/utils.js';
import { SHOULDER, ELBOW, HAND, GOURD_OFFSET, MIRROR_OFFSET, FACE, EYES, EYE_R, FANGS, SPINE } from './SusanooShape.js';

/*
 * Itachi's Susanoo, modelled after the anime:
 *  I   — spine, ribcage, clavicles and scapulae; bone arms with jointed claws; glowing joint orbs
 *  II  — skull with sockets, cheekbones and teeth
 *  III — muscled torso and arms with clenched fists, long-nosed demon face with narrow burning eyes
 *  IV  — lamellar armour, a mantle of feather-like scales, helmet with tokin and horns, pauldrons and
 *        vambraces; the Totsuka Blade poured from a gourd, and the Yata Mirror
 * The body is the sculpted mesh in public/models/susanoo.glb (made by tools/build-susanoo.mjs): bone,
 * muscle and armour blended like a sculpt, drawn as a solid translucent body of chakra with a glowing rim.
 * Without that file it falls back to a simpler procedural build.
 * Faces +Z, feet at y = 0, stands around Itachi at the origin.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- sculpted model ---------------- */

let _sculpt = null; // Map name → BufferGeometry, or false when unavailable
let _perfect = null; // the Perfect Susanoo scene (stage IV), or false

async function loadGLB(url) {
  const head = await fetch(url, { method: 'HEAD', cache: 'no-cache' }).catch(() => null);
  if (!head || !head.ok || (head.headers.get('content-type') || '').includes('text/html')) return null;
  return new GLTFLoader().loadAsync(url);
}

/**
 * Loads the sculpted Susanoo (stages I–III, and IV unless the Perfect Susanoo is present) and the
 * optional Perfect Susanoo model used as the final stage. Resolves to true when the sculpt is available.
 */
export function preloadSusanoo(timeoutMs = 15000) {
  if (_sculpt !== null) return Promise.resolve(!!_sculpt);
  const perfect = loadGLB('./models/perfect-susanoo.glb')
    .then((g) => { _perfect = g ? g.scene : false; })
    .catch((e) => { console.warn('[susanoo] perfect model not loaded:', e); _perfect = false; });
  const load = (async () => {
    const url = './models/susanoo.glb';
    const head = await fetch(url, { method: 'HEAD', cache: 'no-cache' }).catch(() => null);
    if (!head || !head.ok || (head.headers.get('content-type') || '').includes('text/html')) return null;
    const gltf = await new GLTFLoader().loadAsync(url);
    const map = new Map();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      map.set(o.name, o.geometry);
    });
    return map.size ? map : null;
  })().catch((e) => { console.warn('[susanoo] sculpt not loaded:', e); return null; });
  const timeout = new Promise((r) => setTimeout(() => r(null), timeoutMs));
  return Promise.all([Promise.race([load, timeout]), Promise.race([perfect, timeout])])
    .then(([m]) => { _sculpt = m || false; if (_perfect === null) _perfect = false; return !!m; });
}

/* ---------------- textures ---------------- */

let _spiral, _orb, _magatama;
function spiralTexture() {
  if (_spiral) return _spiral;
  _spiral = drawTexture(512, 512, (x, w) => {
    x.strokeStyle = '#fff';
    x.lineCap = 'round';
    const spiral = (cx, cy, r, turns, dir, lw) => {
      x.lineWidth = lw;
      x.beginPath();
      for (let a = 0; a <= turns * TAU; a += 0.08) {
        const rr = r * (1 - a / (turns * TAU));
        const px = cx + Math.cos(a * dir) * rr, py = cy + Math.sin(a * dir) * rr;
        a ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke();
    };
    spiral(130, 130, 110, 2.2, 1, 14);
    spiral(390, 150, 90, 2, -1, 12);
    spiral(260, 380, 120, 2.4, 1, 14);
    spiral(470, 420, 70, 1.6, -1, 10);
    spiral(40, 420, 60, 1.5, 1, 10);
  }, false);
  _spiral.wrapS = _spiral.wrapT = THREE.RepeatWrapping;
  return _spiral;
}
function orbTexture() {
  if (_orb) return _orb;
  _orb = drawTexture(128, 128, (x, w) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,240,170,1)'); g.addColorStop(0.45, 'rgba(255,190,60,1)');
    g.addColorStop(0.62, 'rgba(255,120,20,0.9)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
    x.fillStyle = 'rgba(120,30,0,0.9)';
    for (const [dx, dy] of [[-12, -6], [12, -6], [0, 12]]) { x.beginPath(); x.arc(64 + dx, 64 + dy, 6, 0, TAU); x.fill(); }
  });
  return _orb;
}
function magatamaTexture() {
  if (_magatama) return _magatama;
  _magatama = drawTexture(512, 512, (x, w) => {
    x.translate(w / 2, w / 2);
    x.strokeStyle = '#fff'; x.fillStyle = '#fff';
    for (const [r, lw] of [[240, 14], [200, 4], [120, 6]]) { x.lineWidth = lw; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); }
    for (let k = 0; k < 3; k++) {
      x.save(); x.rotate((k * TAU) / 3); x.translate(0, -160);
      x.beginPath(); x.arc(0, 0, 26, 0, TAU); x.fill();
      x.beginPath(); x.moveTo(24, 6); x.quadraticCurveTo(30, 50, -10, 64); x.quadraticCurveTo(6, 36, -22, 14); x.closePath(); x.fill();
      x.restore();
    }
  });
  return _magatama;
}

/** Iris for the demon's eyes: amber fibres radiating from a round pupil, a dark limbal ring, a warm glow. */
let _iris;
function irisTexture() {
  if (_iris) return _iris;
  _iris = drawTexture(256, 256, (x, w) => {
    const c = w / 2, R = w * 0.48;
    const g = x.createRadialGradient(c, c, R * 0.18, c, c, R);
    g.addColorStop(0, '#fff2a8');
    g.addColorStop(0.3, '#ffc23a');
    g.addColorStop(0.62, '#e0701a');
    g.addColorStop(0.86, '#8a2208');
    g.addColorStop(1, '#2a0602');
    x.fillStyle = g;
    x.beginPath(); x.arc(c, c, R, 0, TAU); x.fill();
    // radial fibres
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * TAU + Math.random() * 0.03;
      const r0 = R * (0.22 + Math.random() * 0.08), r1 = R * (0.7 + Math.random() * 0.25);
      x.strokeStyle = Math.random() < 0.5 ? 'rgba(255,230,150,0.35)' : 'rgba(120,30,0,0.35)';
      x.lineWidth = 1 + Math.random() * 1.5;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      x.quadraticCurveTo(c + Math.cos(a + 0.08) * (r0 + r1) / 2, c + Math.sin(a + 0.08) * (r0 + r1) / 2, c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      x.stroke();
    }
    // collarette ring around the pupil
    x.strokeStyle = 'rgba(255,200,90,0.7)';
    x.lineWidth = 3;
    x.beginPath(); x.arc(c, c, R * 0.34, 0, TAU); x.stroke();
    // pupil
    const pg = x.createRadialGradient(c, c, 0, c, c, R * 0.24);
    pg.addColorStop(0, '#000'); pg.addColorStop(0.85, '#050000'); pg.addColorStop(1, 'rgba(10,0,0,0)');
    x.fillStyle = pg;
    x.beginPath(); x.arc(c, c, R * 0.24, 0, TAU); x.fill();
    // limbal ring
    x.strokeStyle = 'rgba(20,2,0,0.9)';
    x.lineWidth = R * 0.07;
    x.beginPath(); x.arc(c, c, R * 0.96, 0, TAU); x.stroke();
  });
  _iris.colorSpace = THREE.SRGBColorSpace;
  return _iris;
}

/* ---------------- spirit material (blade, mirror, procedural fallback) ---------------- */

export function spiritMaterial({
  fill = 0xff5a1e, line = 0xffb050, lines = 1.2, flame = 0, alpha = 0.12,
  reveal, power, additive = true, spiral = 0, spiralScale = 2, map = null, side = THREE.DoubleSide, gain = 1,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uReveal: reveal || { value: 0 },
      uPower: power || { value: 1 },
      uFill: { value: new THREE.Color(fill) },
      uLine: { value: new THREE.Color(line) },
      uLines: { value: lines },
      uFlame: { value: flame },
      uAlpha: { value: alpha },
      uSpiral: { value: spiral ? spiralTexture() : map },
      uSpiralAmt: { value: spiral },
      uSpiralScale: { value: spiralScale },
      uMapAmt: { value: map ? 1 : 0 },
      uGain: { value: gain },
    },
    transparent: true,
    depthWrite: false,
    side,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform float uFlame;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec3 nW = normalize(mat3(modelMatrix) * normal);
        float n = snoise(w.xyz * 0.7 + vec3(0.0, -uTime * 1.3, 0.0));
        float n2 = snoise(w.xyz * 1.9 + vec3(uTime * 0.4, -uTime * 2.2, 0.0));
        w.xyz += nW * (n * 0.04 + (n * 0.5 + 0.5) * uFlame * 0.35);
        // flame tongues licking upward off the outer surface
        w.y += max(n2, 0.0) * uFlame * 0.9 * smoothstep(-0.3, 0.6, nW.y);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform float uReveal; uniform float uPower;
      uniform vec3 uFill; uniform vec3 uLine; uniform float uLines; uniform float uAlpha;
      uniform sampler2D uSpiral; uniform float uSpiralAmt; uniform float uSpiralScale; uniform float uMapAmt; uniform float uGain;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec2 vUv;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
        // flowing contour lines, like the layered outlines of the anime Susanoo
        float f = snoise(vW * vec3(0.32, 0.16, 0.32) + vec3(0.0, -uTime * 0.22, 0.0)) * 1.7 + vW.y * 0.5 + snoise(vW * 1.2) * 0.22;
        float band = abs(fract(f * uLines) - 0.5);
        float line = 1.0 - smoothstep(0.015, 0.06, band);
        vec3 col = uFill * (0.3 + fres * 0.9) + uLine * (line * 1.15 + fres * fres * 1.3);
        float a = uAlpha + fres * 0.45 + line * 0.4;
        if (uSpiralAmt > 0.0) {
          float s = texture2D(uSpiral, vUv * uSpiralScale).a;
          col = mix(col, vec3(0.22, 0.0, 0.015), s * uSpiralAmt);
          a = max(a, s * uSpiralAmt);
        }
        if (uMapAmt > 0.0) {
          float m = texture2D(uSpiral, vUv).a;
          col += uLine * m * 1.4;
          a = max(a, m * 0.9);
        }
        float cut = mix(-1.5, 13.5, uReveal);
        float vis = 1.0 - smoothstep(cut - 0.7, cut, vW.y);
        float edge = (1.0 - smoothstep(0.0, 0.8, abs(vW.y - cut))) * step(0.001, uReveal) * step(uReveal, 0.999);
        col += edge * vec3(1.0, 0.85, 0.5) * 1.8;
        gl_FragColor = vec4(col * uGain, clamp(a * vis * uPower + edge * 0.5, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
  });
}

/* ---------------- sculpt material ---------------- */

const SCULPT_VERT = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uTime;
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  #ifdef USE_LINES
    varying vec2 vUv;
  #endif
  #ifdef USE_ARMS
    // the model has no skeleton: its arms swing about the shoulders here, weighted by position
    uniform mat3 uArmR; uniform mat3 uArmL; uniform vec3 uPivR; uniform vec3 uPivL;
    uniform float uArmMode; // 1 = weight by position (body), 2 = whole part follows its side, 3 = weapons
    uniform vec3 uShieldC;  // shield centre: mounted in front of the left fist, carried upright
    uniform vec3 uShieldOff; uniform float uShieldScale;
    uniform vec3 uGripS;    // the sword's grip, set into the right fist
    uniform mat3 uSwordRot;
    uniform vec3 uFistR; uniform vec3 uFistL;
    uniform vec4 uArmBand;  // x: start of the arm, y: fully arm, z/w: height band that excludes the wing claws
  #endif
  void main(){
    vec3 p = position;
    vec3 nl = normal;
    #ifdef USE_LINES
      vUv = uv;
    #endif
    #ifdef USE_ARMS
      float wr, wl;
      if (uArmMode > 2.5) {
        wl = 0.0;
        if (p.x < 0.0) {
          // sword: grip into the right fist, then it swings with the arm
          p = uSwordRot * (p - uGripS) + uFistR;
          nl = uSwordRot * nl;
          wr = 1.0;
        } else {
          // shield: centred just in front of the left fist, carried by the arm without tilting
          p = (p - uShieldC) * uShieldScale + uFistL + uShieldOff;
          p += uArmL * (uFistL - uPivL) + uPivL - uFistL;
          wr = 0.0;
        }
      }
      else if (uArmMode > 1.5) { wr = step(p.x, 0.0); wl = 1.0 - wr; }
      else {
        float band = 1.0 - smoothstep(uArmBand.z, uArmBand.w, p.z);
        wr = (1.0 - smoothstep(-uArmBand.y, -uArmBand.x, p.x)) * band;
        wl = smoothstep(uArmBand.x, uArmBand.y, p.x) * band;
      }
      p = mix(p, uArmR * (p - uPivR) + uPivR, wr);
      p = mix(p, uArmL * (p - uPivL) + uPivL, wl);
      nl = normalize(mix(nl, uArmR * nl, wr));
      nl = normalize(mix(nl, uArmL * nl, wl));
    #endif
    vec4 w = modelMatrix * vec4(p, 1.0);
    vec3 nW = normalize(mat3(modelMatrix) * nl);
    // the chakra surface shimmers very slightly, like heat
    w.xyz += nW * snoise(w.xyz * 0.8 + vec3(0.0, -uTime * 1.4, 0.0)) * 0.02;
    #ifdef FLAME
      float fn = snoise(w.xyz * vec3(0.9, 0.45, 0.9) + vec3(0.0, -uTime * 2.2, 0.0));
      float fn2 = snoise(w.xyz * 2.1 + vec3(uTime * 0.6, -uTime * 3.4, 0.0));
      w.xyz += nW * (0.1 + (fn * 0.5 + 0.5) * 0.22);
      w.y += max(fn2, 0.0) * 0.5 * smoothstep(-0.2, 0.8, nW.y + 0.3);
    #endif
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vN = normalize(mat3(viewMatrix) * nW);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

// shared by the colour pass and the depth pre-pass so both agree on what is visible
const SCULPT_VIS = /* glsl */ `
  float cut = mix(-1.5, 13.5, uReveal);
  float vis = 1.0 - smoothstep(cut - 0.7, cut, vW.y);
  float floorFade = smoothstep(uFloor, uFloor + 1.4, vW.y);
`;

/**
 * A solid, translucent body of chakra: soft form shading, a hot rim at the silhouette, glowing seams,
 * faint flowing bands and a reveal from the ground up. Returns { color, depth }: the depth pre-pass means
 * only the nearest surface of each part is drawn, so layers never stack into a white-hot blob.
 */
function sculptMaterials({ fill, rim, core, alpha, reveal, power, gain = 1, floor = -9, lines = null, arms = null }) {
  const defines = {};
  if (lines) defines.USE_LINES = '';
  if (arms) defines.USE_ARMS = '';
  const uniforms = {
    uLines: { value: lines },
    ...(arms || {}),
    uTime: shared.uTime,
    uReveal: reveal, uPower: power,
    uFill: { value: new THREE.Color(fill) },
    uRim: { value: new THREE.Color(rim) },
    uCore: { value: new THREE.Color(core) },
    uAlpha: { value: alpha },
    uGain: { value: gain },
    uFloor: { value: floor },
  };
  const color = new THREE.ShaderMaterial({
    uniforms, defines,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: SCULPT_VERT,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform float uReveal; uniform float uPower; uniform float uAlpha; uniform float uGain; uniform float uFloor;
      uniform vec3 uFill; uniform vec3 uRim; uniform vec3 uCore;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      #ifdef USE_LINES
        uniform sampler2D uLines;
        varying vec2 vUv;
      #endif
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(vV);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 2.4);
        // form: a key from above-left, a weak bounce from below-right
        float key = clamp(dot(n, normalize(vec3(-0.35, 0.8, 0.5))), 0.0, 1.0);
        float bounce = clamp(dot(n, normalize(vec3(0.5, -0.3, 0.6))), 0.0, 1.0) * 0.25;
        // seams and hollows (plate edges, sockets) glow hotter: surfaces that turn away from the key
        float seam = smoothstep(0.35, 0.0, key) * (1.0 - fres);
        // faint chakra flowing upward over the surface
        float flow = snoise(vW * vec3(0.45, 0.22, 0.45) + vec3(0.0, -uTime * 0.35, 0.0));
        float band = 1.0 - smoothstep(0.02, 0.07, abs(fract(flow * 1.3 + vW.y * 0.3) - 0.5));
        float flick = 0.9 + 0.1 * snoise(vW * 2.0 + vec3(0.0, -uTime * 3.0, 0.0));
        vec3 col = uCore * 0.5 + uFill * (key * 0.85 + bounce + seam * 0.45) + uRim * (fres * 1.9 * flick) + uRim * band * 0.2;
        float a = uAlpha + fres * 0.55 + key * 0.1 + band * 0.06;
        #ifdef USE_LINES
          // the model's painted plate and feather outlines glow like the anime's contour lines
          vec3 tex = texture2D(uLines, vUv).rgb;
          float ln = smoothstep(0.55, 0.85, dot(tex, vec3(0.3333)));
          col += uRim * ln * 1.1;
          a += ln * 0.3;
        #endif
        ${SCULPT_VIS}
        float edge = (1.0 - smoothstep(0.0, 0.8, abs(vW.y - cut))) * step(0.001, uReveal) * step(uReveal, 0.999);
        col += edge * vec3(1.0, 0.85, 0.5) * 1.8;
        gl_FragColor = vec4(col * uGain, clamp((a * vis * uPower + edge * 0.5) * floorFade, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
  });
  const depth = new THREE.ShaderMaterial({
    uniforms, defines,
    transparent: true, depthWrite: true, colorWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    vertexShader: SCULPT_VERT,
    fragmentShader: /* glsl */ `
      uniform float uReveal; uniform float uPower; uniform float uFloor;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        ${SCULPT_VIS}
        // dimmed (covered) layers stop occluding, so they never punch holes in the layer over them
        if (vis * floorFade < 0.15 || uPower < 0.6) discard;
        gl_FragColor = vec4(0.0);
      }`,
  });
  return { color, depth };
}

/**
 * Chakra flames burning off a part's silhouette: the same geometry pushed outward and licking upward,
 * drawn additively and only where the surface turns away from the viewer.
 */
function flameMaterial({ rim, reveal, power, floor = -9, amount = 1, arms = null }) {
  const defines = { FLAME: '' };
  if (arms) defines.USE_ARMS = '';
  return new THREE.ShaderMaterial({
    defines,
    uniforms: {
      uTime: shared.uTime, uReveal: reveal, uPower: power,
      uFloor: { value: floor }, uRim: { value: new THREE.Color(rim) }, uAmount: { value: amount },
      ...(arms || {}),
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: SCULPT_VERT,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform float uReveal; uniform float uPower; uniform float uFloor; uniform float uAmount;
      uniform vec3 uRim;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        vec3 n = normalize(vN);
        float fres = pow(1.0 - abs(dot(n, normalize(vV))), 1.3);
        float f = snoise(vW * vec3(1.4, 0.6, 1.4) + vec3(0.0, -uTime * 2.8, 0.0)) * 0.5 + 0.5;
        float tongues = smoothstep(0.35, 0.85, f);
        ${SCULPT_VIS}
        vec3 col = mix(uRim, vec3(1.0, 0.85, 0.55), tongues * 0.6);
        float a = fres * tongues * 0.55 * vis * floorFade * uAmount * smoothstep(0.5, 0.9, uPower);
        gl_FragColor = vec4(col * 1.3, a);
        #include <colorspace_fragment>
      }`,
  });
}

/* ---------------- geometry helpers (procedural fallback) ---------------- */

function limb(a, b, r1, r2, mat, seg = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, seg, 6, true), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  return m;
}
function ball(p, r, mat, scale = null, seg = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat);
  m.position.copy(p);
  if (scale) m.scale.set(...scale);
  return m;
}
function tube(points, r, mat, seg = 64, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.5);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 8, closed), mat);
}

/* ---------------- the Susanoo ---------------- */

export class SusanooBody {
  constructor({ low = false } = {}) {
    this.low = low;
    this.group = new THREE.Group();
    this.R = [null, { value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }];
    this.P = [null, { value: 1 }, { value: 1 }, { value: 1 }, { value: 1 }];
    const R = this.R;
    this.bladeMat = spiritMaterial({ fill: 0xffa040, line: 0xffe0a0, lines: 3, alpha: 0.4, flame: 0.35, reveal: R[4], power: { value: 1.8 }, gain: 0.8 });
    this.mirrorMat = spiritMaterial({ fill: 0xff6a24, line: 0xffc070, lines: 1.5, alpha: 0.3, reveal: R[4], power: { value: 1.3 }, map: magatamaTexture(), gain: 0.7 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff080, transparent: true, opacity: 0, depthWrite: false });
    this.pupilMat = new THREE.MeshBasicMaterial({ color: 0x3a0800, transparent: true, opacity: 0, depthWrite: false });
    this.orbs = [];
    this.passes = []; // { mesh, reveal, power, kind: 'color' | 'depth' | 'flame' }
    this.hasSculpt = !!_sculpt;

    if (_sculpt) this._buildSculpt(_sculpt);
    else this._buildProcedural();
    this._buildOrbs();
    this._buildWeapons();
    if (_sculpt && _perfect) this._buildPerfect(_perfect);
  }

  /* ---------------- the Perfect Susanoo (stage IV) ---------------- */

  /**
   * The Perfect Susanoo model, a static, Z-up model with wings, a sword and a shield.
   * It is sunk to its hips so Itachi stands inside its torso, drawn with the chakra shader (its painted
   * outlines glowing), and its arms swing about the shoulders in the vertex shader so the chapter's slash
   * and mirror gestures still move them.
   */
  _buildPerfect(scene) {
    const K = 0.018, GROUND = 40; // model units → metres; the model height that sits at ground level (its ankles)
    const holder = new THREE.Group();
    holder.scale.setScalar(K);
    holder.position.y = -GROUND * K;
    holder.add(scene);
    this.group.add(holder);

    const armU = {
      uArmR: { value: new THREE.Matrix3() }, uArmL: { value: new THREE.Matrix3() },
      uPivR: { value: V(-105, 0, 425) }, uPivL: { value: V(105, 0, 425) },
      uArmBand: { value: new THREE.Vector4(100, 125, 480, 500) },
      uShieldC: { value: V(385, -48, 160) },
      uShieldOff: { value: V(0, -70, 10) },
      uShieldScale: { value: 0.8 },
      uGripS: { value: V(-241, 0, 45) },
      uSwordRot: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationX(0.3)) },
      uFistR: { value: V(-200, 6, 271) }, uFistL: { value: V(200, 6, 271) },
    };
    // which parts follow the arms: 0 no (wings, wing claws), 1 by position (body), 2 whole part (sword, shield)
    const mode = { Object_2: 3, Object_3: 3, Object_8: 3, Object_7: 0, Object_10: 0 };
    const look = { fill: 0xd03a12, rim: 0xffa048, core: 0x3a0802, alpha: 0.34, gain: 0.95, floor: 0.1 };
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      const m = mode[o.name] ?? 1;
      const pair = sculptMaterials({
        ...look, reveal: this.R[4], power: this.P[4],
        lines: o.material.map || null,
        arms: m ? { ...armU, uArmMode: { value: m } } : null,
      });
      const depth = new THREE.Mesh(o.geometry, pair.depth);
      depth.renderOrder = 50;
      o.material = pair.color;
      o.renderOrder = 51;
      o.frustumCulled = depth.frustumCulled = false;
      o.parent.add(depth);
      this.passes.push({ mesh: o, reveal: this.R[4], power: this.P[4], kind: 'color' }, { mesh: depth, reveal: this.R[4], power: this.P[4], kind: 'depth' });
      if (m !== 3) {
        const fl = new THREE.Mesh(o.geometry, flameMaterial({
          rim: 0xff7028, reveal: this.R[4], power: this.P[4], floor: 0.1, amount: o.name === 'Object_7' ? 0.7 : 1,
          arms: m ? { ...armU, uArmMode: { value: m } } : null,
        }));
        fl.renderOrder = 52;
        fl.frustumCulled = false;
        o.parent.add(fl);
        this.passes.push({ mesh: fl, reveal: this.R[4], power: this.P[4], kind: 'flame' });
      }
    }
    this.mats[4] = meshes[0].material; // the chapter drives stage IV through this

    // our own weapons are replaced by the model's
    for (const obj of [this.mirror]) obj.visible = false;
    this.rightArm.children.forEach((c) => { if (c.material === this.bladeMat || c.material === this.mirrorMat) c.visible = false; });

    // resting stance: sword arm a little forward, the shield held up in front at chest height
    this.perfect = { holder, armU, base: { r: -0.35, l: -1.05 } };
    // where Itachi floats inside it (its chest), and the size of the body for hits
    this.coreY = (330 - GROUND) * K;
    this.coreR = 5.4;
    // blade tip for the chapter's sparks, relative to our right arm pivot
    const tipLocal = V(-241, 0, 525).sub(armU.uGripS.value).applyMatrix3(armU.uSwordRot.value).add(armU.uFistR.value);
    this.perfect.tipModel = tipLocal;
    this._perfectArms();
    const tipW = this._armPoint(tipLocal, 'r');
    this.bladeTipLocal = tipW.sub(this.rightArm.position);
  }

  /** Turns the eyes toward a world point (within the sockets' range). */
  _lookEyes(target) {
    const local = new THREE.Vector3();
    for (const eye of this.eyes) {
      eye.updateWorldMatrix(true, false);
      local.copy(target);
      eye.parent.worldToLocal(local);
      const d = local.sub(eye.position);
      const yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -0.45, 0.45);
      const pitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.3, 0.3);
      eye.rotation.y += (yaw - eye.rotation.y) * 0.2;
      eye.rotation.x += (-pitch - eye.rotation.x) * 0.2;
    }
  }

  /** Model (Z-up) rotation for an arm: the chapter's rotation of our arm group, on top of the resting stance. */
  _armMatrix(side) {
    const arm = side === 'r' ? this.rightArm : this.leftArm;
    const qBase = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), this.perfect.base[side]);
    const qW = arm.quaternion.clone().multiply(qBase);
    const RW = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(qW));
    // model → world is (x, y, z) → (x, z, −y)
    const C = new THREE.Matrix3().set(1, 0, 0, 0, 0, 1, 0, -1, 0);
    return C.clone().transpose().multiply(RW).multiply(C);
  }

  _perfectArms() {
    this.perfect.armU.uArmR.value.copy(this._armMatrix('r'));
    this.perfect.armU.uArmL.value.copy(this._armMatrix('l'));
  }

  /** Where a model-space point on an arm ends up, in the Susanoo group's space. */
  _armPoint(pModel, side) {
    const u = this.perfect.armU;
    const piv = side === 'r' ? u.uPivR.value : u.uPivL.value;
    const R = side === 'r' ? u.uArmR.value : u.uArmL.value;
    const q = pModel.clone().sub(piv).applyMatrix3(R).add(piv);
    return V(q.x, q.z, -q.y).multiplyScalar(this.perfect.holder.scale.x).add(this.perfect.holder.position);
  }

  /* ---------------- sculpted build ---------------- */

  _buildSculpt(geo) {
    const R = this.R, P = this.P, G = this.group;
    // I bone, II skull, III flesh, IV armour: hotter and thinner for bone, deeper and denser for armour
    const looks = [null,
      { fill: 0xff6a24, rim: 0xffc470, core: 0x5a0e02, alpha: 0.16 },
      { fill: 0xff6a24, rim: 0xffc470, core: 0x5a0e02, alpha: 0.18 },
      { fill: 0xe0461a, rim: 0xffa050, core: 0x4a0a02, alpha: 0.3, gain: 0.95, floor: 0.25 },
      { fill: 0xc2300e, rim: 0xff8c3c, core: 0x3a0802, alpha: 0.42, gain: 0.95, floor: 0.1 },
    ];
    const pairs = [null, ...[1, 2, 3, 4].map((i) => sculptMaterials({ ...looks[i], reveal: R[i], power: P[i] }))];
    // the face and the flesh arms stay lit once the armour is on (the helmet and sode leave them bare)
    // (with the Perfect Susanoo as stage IV, everything of stage III is covered, so it all dims)
    const bare = _perfect ? pairs[3] : sculptMaterials({ ...looks[3], reveal: R[3], power: { value: 1 } });
    // the chapter drives uReveal / uPower through these
    this.mats = pairs.map((p) => (p ? p.color : null));
    const stageOf = { I: 1, II: 2, III: 3, IV: 4 };
    const place = (name, parent) => {
      const g = geo.get(name);
      if (!g) return;
      const st = stageOf[name.split('_')[0]];
      const pair = st === 3 && name !== 'III_body' ? bare : pairs[st];
      const depth = new THREE.Mesh(g, pair.depth);
      const color = new THREE.Mesh(g, pair.color);
      // inner layers first; each part's depth pre-pass right before its colour
      depth.renderOrder = 10 + st * 10;
      color.renderOrder = 11 + st * 10;
      depth.frustumCulled = color.frustumCulled = false;
      parent.add(depth, color);
      const pw = pair.color.uniforms.uPower;
      this.passes.push({ mesh: color, reveal: R[st], power: pw, kind: 'color' }, { mesh: depth, reveal: R[st], power: pw, kind: 'depth' });
      if (st === 3) {
        const fl = new THREE.Mesh(g, flameMaterial({ rim: 0xff7a2a, reveal: R[3], power: pw, floor: 0.25 }));
        fl.renderOrder = 12 + st * 10;
        fl.frustumCulled = false;
        parent.add(fl);
        this.passes.push({ mesh: fl, reveal: R[st], power: pw, kind: 'flame' });
      }
    };
    const parts = ['I_ribcage', 'II_skull', 'III_body', 'III_head'];
    if (!_perfect) parts.push('IV_armour', 'IV_mantle', 'IV_helmet');
    for (const n of parts) place(n, G);

    const arm = (side) => {
      const a = new THREE.Group();
      a.position.fromArray(SHOULDER[side]);
      const S = side === 'r' ? 'R' : 'L';
      for (const st of _perfect ? ['I', 'III'] : ['I', 'III', 'IV']) place(`${st}_arm${S}`, a);
      a.userData.hand = new THREE.Vector3().fromArray(HAND[side]);
      a.userData.joints = [new THREE.Vector3(), new THREE.Vector3().fromArray(ELBOW[side]), a.userData.hand.clone()];
      G.add(a);
      return a;
    };
    this.rightArm = arm('r');
    this.leftArm = arm('l');

    // the demon face's narrow burning eyes and fangs (stage III)
    const face = new THREE.Group();
    face.position.fromArray(FACE);
    G.add(face);
    // real eyes set in the sockets: a warm sclera, an amber iris under a glossy cornea, following the viewer
    this.eyeParts = [];
    this.eyes = EYES.map(([x, y, z]) => {
      const eye = new THREE.Group();
      eye.position.set(x, y, z);
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 32, 20), new THREE.MeshStandardMaterial({
        color: 0xd9bfa6, roughness: 0.3, emissive: 0xff6a20, emissiveIntensity: 0.05, transparent: true, opacity: 0,
      }));
      // the iris is a cap curving with the ball, textured by planar projection so it stays round
      const irisGeo = new THREE.SphereGeometry(EYE_R * 1.003, 48, 16, 0, TAU, 0, 0.72);
      irisGeo.rotateX(Math.PI / 2);
      const ip = irisGeo.attributes.position, iu = irisGeo.attributes.uv, span = EYE_R * Math.sin(0.72) * 2;
      for (let i = 0; i < ip.count; i++) iu.setXY(i, 0.5 + ip.getX(i) / span, 0.5 + ip.getY(i) / span);
      const iris = new THREE.Mesh(irisGeo, new THREE.MeshStandardMaterial({
        map: irisTexture(), emissiveMap: irisTexture(), emissive: 0xffffff, emissiveIntensity: 0.45,
        roughness: 0.35, transparent: true, opacity: 0,
      }));
      const cornea = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 1.02, 32, 20), new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0, depthWrite: false,
      }));
      // a catchlight so the eye reads as wet
      const glint = new THREE.Mesh(new THREE.CircleGeometry(EYE_R * 0.1, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      glint.position.set(-EYE_R * 0.22, EYE_R * 0.25, EYE_R * 1.03);
      glint.scale.setScalar(0.7);
      // drawn after the head's surface, so the lids cover everything but the almond opening
      for (const [m, order] of [[sclera, 45], [iris, 46], [cornea, 47], [glint, 48]]) { m.renderOrder = order; eye.add(m); }
      this.eyeParts.push({ m: sclera.material, a: 1 }, { m: iris.material, a: 1 }, { m: cornea.material, a: 0.12 }, { m: glint.material, a: 0.85 });
      face.add(eye);
      return eye;
    });
    this.face = face;
    this.toothMat = new THREE.MeshStandardMaterial({ color: 0xf0e2c8, roughness: 0.4, emissive: 0xff8a40, emissiveIntensity: 0.12, transparent: true, opacity: 0 });
    FANGS.forEach(([x, y, z]) => {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.17, 8), this.toothMat);
      fang.rotation.x = Math.PI;
      fang.position.set(x, y - 0.06, z);
      fang.renderOrder = 45;
      face.add(fang);
    });
  }

  /* ---------------- procedural fallback (no susanoo.glb) ---------------- */

  _buildProcedural() {
    const R = this.R, P = this.P;
    // one "main" material per stage (the chapter drives their uReveal / uPower)
    this.mats = [null,
      spiritMaterial({ fill: 0xff4a18, line: 0xffa040, lines: 1.4, alpha: 0.1, reveal: R[1], power: P[1] }),
      spiritMaterial({ fill: 0xff5a1e, line: 0xffc060, lines: 1.3, alpha: 0.1, reveal: R[2], power: P[2] }),
      spiritMaterial({ fill: 0xb82a0c, line: 0xff7a22, lines: 1.1, alpha: 0.26, reveal: R[3], power: P[3], additive: false, gain: 0.7 }),
      spiritMaterial({ fill: 0xb0240a, line: 0xff6e1e, lines: 1.0, alpha: 0.5, reveal: R[4], power: P[4], additive: false, spiral: 1, spiralScale: 2.2, gain: 0.68 }),
    ];
    const tendrilMat = spiritMaterial({ fill: 0xffa030, line: 0xffe090, lines: 2.4, alpha: 0.25, flame: 0.25, reveal: R[2], power: P[2] });
    const auraMat = spiritMaterial({ fill: 0xff3a10, line: 0xff7a20, lines: 0.8, alpha: 0.0, flame: 1.2, reveal: R[4], power: P[4], side: THREE.BackSide, gain: 0.35 });
    const fleshArmourMat = spiritMaterial({ fill: 0xb0240a, line: 0xff6e1e, lines: 1.6, alpha: 0.5, reveal: R[4], power: P[4], additive: false, spiral: 1, spiralScale: 1.2, gain: 0.72 });
    const M = this.mats;
    const G = this.group;

    /* ---- stage I: spine, ribcage bands ---- */
    const spine = SPINE.map((p) => V(...p));
    spine.forEach((p, i) => G.add(ball(p, 0.2 - i * 0.004, M[1], [1.3, 0.7, 1], 12)));
    G.add(tube(spine, 0.09, M[1], 40));
    for (let i = 0; i < 6; i++) {
      const y = 1.25 + i * 0.52;
      const rx = 2.05 + Math.sin(((i + 1) / 7) * Math.PI) * 0.9;
      const rz = 1.55 + Math.sin(((i + 1) / 7) * Math.PI) * 0.5;
      const pts = [];
      for (let k = 0; k <= 28; k++) {
        const a = -Math.PI / 2 + 0.28 + (k / 28) * (TAU - 0.56);
        pts.push(V(Math.cos(a) * rx, y + Math.cos(a * 2) * 0.12 - Math.sin(a) * 0.15, Math.sin(a) * rz - 0.3));
      }
      G.add(tube(pts, 0.12 - i * 0.008, M[1], 90));
      G.add(tube(pts.map((p) => p.clone().add(V(0, 0.2, 0))), 0.035, M[1], 90));
    }
    G.add(tube(Array.from({ length: 17 }, (_, k) => { const a = (k / 16) * TAU; return V(Math.cos(a) * 1.3, 0.9 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.9 - 0.5); }), 0.1, M[1], 60, true));
    G.add(tube([V(-2.5, 5.05, -0.6), V(-1.2, 5.25, -0.75), V(0, 5.2, -0.9), V(1.2, 5.25, -0.75), V(2.5, 5.05, -0.6)], 0.12, M[1], 40));

    /* ---- stage II: skull, jaw, teeth, tendrils ---- */
    const skull = new THREE.Group();
    skull.position.set(0, 6.55, -0.35);
    G.add(skull);
    skull.add(ball(V(0, 0.15, 0), 0.9, M[2], [0.92, 1.0, 1.05], 24));
    for (const s of [-1, 1]) {
      const socket = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 24), M[2]);
      socket.position.set(s * 0.33, 0.12, 0.84);
      socket.scale.set(1, 0.85, 1);
      skull.add(socket);
      skull.add(ball(V(s * 0.62, -0.18, 0.58), 0.2, M[2], [1.2, 0.7, 0.8], 12));
    }
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 30, Math.PI), M[2]);
    jaw.rotation.set(Math.PI / 2 + 0.3, 0, Math.PI);
    jaw.position.set(0, -0.62, 0.25);
    skull.add(jaw);
    const nT = this.low ? 6 : 10;
    for (let k = 0; k < nT; k++) {
      const side = k % 2 ? 1 : -1;
      const spread = (Math.floor(k / 2) + 1) * 0.4;
      const pts = [];
      for (let j = 0; j <= 6; j++) {
        const u = j / 6;
        pts.push(V(side * (0.3 + spread * u * 2.2) + Math.sin(u * 5 + k) * 0.35, 7.2 - u * 3.2 + Math.sin(u * 3 + k) * 0.3, -0.5 - u * 1.8));
      }
      G.add(tube(pts, 0.07, tendrilMat, 40));
    }

    /* ---- stage III: body and demon face ---- */
    const torsoProfile = [[0.05, 0.4], [1.35, 0.55], [1.55, 1.2], [1.75, 2.2], [2.25, 3.4], [2.5, 4.3], [2.3, 4.95], [1.5, 5.4], [0.7, 5.75], [0.55, 6.05]].map(([x, y]) => new THREE.Vector2(x, y));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 40), M[3]);
    torso.scale.z = 0.72;
    torso.position.z = -0.4;
    G.add(torso);
    for (const s of [-1, 1]) G.add(ball(V(s * 0.95, 4.2, 0.9), 0.85, M[3], [1, 0.75, 0.45], 16));
    const face = new THREE.Group();
    face.position.fromArray(FACE);
    G.add(face);
    face.add(ball(V(0, 0, 0), 1.05, M[3], [0.9, 1.05, 1.0], 24));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.2, 12, 4, true), M[3]);
    nose.rotation.x = Math.PI / 2 + 0.35;
    nose.position.set(0, -0.12, 1.35);
    face.add(nose);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), this.eyeMat);
      eye.scale.set(1.35, 0.42, 0.4);
      eye.position.set(s * 0.36, 0.12, 0.92);
      eye.rotation.z = s * 0.28;
      face.add(eye);
    }

    /* ---- stage IV: spiral cloak, helmet, flame aura ---- */
    const mantleProfile = [[1.0, 6.3], [2.3, 5.95], [3.1, 5.2], [3.4, 4.0], [3.5, 2.4], [3.8, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
    const mantle = new THREE.Mesh(new THREE.LatheGeometry(mantleProfile, 48, 0.85, TAU - 1.7), M[4]);
    mantle.position.z = -0.45;
    mantle.scale.z = 0.85;
    G.add(mantle);
    const aura = new THREE.Mesh(new THREE.LatheGeometry(mantleProfile.map((p) => new THREE.Vector2(p.x * 1.1, p.y * 1.04)), 40), auraMat);
    aura.position.z = -0.45;
    aura.scale.z = 0.9;
    G.add(aura);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 14, 0, TAU, 0, Math.PI * 0.5), M[4]);
    helmet.position.set(0, 6.95, -0.35);
    helmet.rotation.x = -0.18;
    G.add(helmet);

    /* ---- arms (pivot at the shoulder) ---- */
    const buildArm = (side) => {
      const key = side < 0 ? 'r' : 'l';
      const arm = new THREE.Group();
      arm.position.fromArray(SHOULDER[key]);
      const Sh = V(0, 0, 0), E = V(...ELBOW[key]), Hd = V(...HAND[key]);
      arm.add(limb(Sh, E, 0.16, 0.12, M[1]));
      arm.add(limb(E, Hd, 0.09, 0.07, M[1]));
      arm.add(limb(Sh, E, 0.68, 0.55, M[3]), limb(E, Hd, 0.55, 0.45, M[3]), ball(Hd, 0.52, M[3], null, 16));
      const paul = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 12, 0, TAU, 0, Math.PI * 0.55), fleshArmourMat);
      paul.position.copy(Sh).add(V(side * 0.2, 0.15, 0));
      paul.rotation.z = -side * 0.55;
      arm.add(paul);
      arm.add(limb(E.clone().lerp(Hd, 0.12), E.clone().lerp(Hd, 0.78), 0.64, 0.58, fleshArmourMat));
      arm.userData.hand = Hd;
      arm.userData.joints = [Sh, E, Hd];
      G.add(arm);
      return arm;
    };
    this.rightArm = buildArm(-1);
    this.leftArm = buildArm(1);
  }

  /* ---------------- shared: joint orbs, blade, mirror ---------------- */

  _buildOrbs() {
    const G = this.group;
    const orbMat = new THREE.SpriteMaterial({ map: orbTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    this.orbMat = orbMat;
    const addOrb = (parent, p, s = 0.55) => {
      const o = new THREE.Sprite(orbMat);
      o.position.copy(p);
      o.scale.setScalar(s);
      o.renderOrder = 5;
      parent.add(o);
      this.orbs.push(o);
    };
    for (const arm of [this.rightArm, this.leftArm]) {
      const [Sh, E, Hd] = arm.userData.joints;
      addOrb(arm, Sh, 0.8); addOrb(arm, E, 0.65); addOrb(arm, Hd, 0.7);
    }
    for (let i = 1; i < 12; i += 2) addOrb(G, V(...SPINE[i]).add(V(0, 0, 0.2)), 0.45);
  }

  _buildWeapons() {
    /* ---- Totsuka Blade, poured from the gourd in the right fist ---- */
    const hand = this.rightArm.userData.hand;
    const gourdProfile = [[0.01, -0.6], [0.42, -0.45], [0.46, -0.15], [0.22, 0.1], [0.33, 0.32], [0.27, 0.55], [0.11, 0.68], [0.1, 0.82]].map(([x, y]) => new THREE.Vector2(x, y));
    const gourd = new THREE.Mesh(new THREE.LatheGeometry(gourdProfile, 24), this.mirrorMat);
    gourd.position.copy(hand).add(V(...GOURD_OFFSET));
    this.rightArm.add(gourd);
    const bladeDir = V(-0.4, 1, 0.5).normalize();
    const gTop = gourd.position.clone().add(V(0, 0.82, 0));
    // the blade is liquid-like: a wavy, tapering stream of chakra
    const bladePts = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10;
      const side = new THREE.Vector3().crossVectors(bladeDir, V(0, 0, 1)).normalize();
      bladePts.push(gTop.clone().addScaledVector(bladeDir, u * 7.5).addScaledVector(side, Math.sin(u * 7) * 0.12 * u));
    }
    const bladeCurve = new THREE.CatmullRomCurve3(bladePts);
    const bladeGeo = new THREE.TubeGeometry(bladeCurve, 60, 0.24, 12, false);
    const pos = bladeGeo.attributes.position;
    const center = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      // taper toward the tip
      const segIdx = Math.floor(i / 13);
      const u = Math.min(1, segIdx / 60);
      bladeCurve.getPointAt(u, center);
      const p = V(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(center).multiplyScalar(1 - u * 0.9).add(center);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    bladeGeo.computeVertexNormals();
    this.rightArm.add(new THREE.Mesh(bladeGeo, this.bladeMat));
    this.bladeTipLocal = gTop.clone().addScaledVector(bladeDir, 7.5);

    /* ---- Yata Mirror, held in the left fist ---- */
    const mirror = new THREE.Group();
    mirror.position.copy(this.leftArm.userData.hand).add(V(...MIRROR_OFFSET));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 56), this.mirrorMat);
    mirror.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.09, 8, 64), this.bladeMat);
    mirror.add(rim);
    mirror.rotation.y = -0.35;
    this.leftArm.add(mirror);
    this.mirror = mirror;
  }

  /** Per-frame: orbs pulse with stage I, the demon's eyes light with stage III. */
  update(dt, t) {
    const r1 = this.R[1].value, r3 = this.R[3].value;
    // orbs are brightest while the skeleton is the outermost layer
    const outer = Math.max(0, 1 - this.R[3].value * 0.85);
    this.orbMat.opacity = r1 * outer * (0.8 + Math.sin(t * 5) * 0.2) * (this.hasSculpt ? 0.6 : 1);
    this.orbs.forEach((o, i) => { o.material.rotation = t * 0.5 + i; });
    const r4 = this.perfect ? this.R[4].value : 0;
    this.eyeMat.opacity = r3 * (1 - r4);
    this.pupilMat.opacity = r3 * (1 - r4);
    if (this.eyes) {
      const vis = r3 * (1 - r4) * Math.min(1, this.P[3].value * 1.5);
      for (const e of this.eyeParts) { e.m.opacity = vis * e.a; e.m.visible = vis > 0.01; }
      this.toothMat.opacity = vis;
      this.toothMat.visible = vis > 0.01;
      if (vis > 0.01 && this.viewer) this._lookEyes(this.viewer);
    }
    if (this.perfect) this._perfectArms();
    for (const ps of this.passes) {
      const r = ps.reveal.value, w = ps.power.value;
      ps.mesh.visible = r > 0.001 && (ps.kind === 'color' ? w > 0.01 : w > 0.5);
    }
    this.eyeMat.color.setHSL(0.14, 1, 0.62 + Math.sin(t * 7) * 0.05);
  }
}
