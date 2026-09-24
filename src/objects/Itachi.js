import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawTexture, drawLeaf, drawCloud, sharinganCanvas, TAU } from '../core/utils.js';

/*
 * Itachi Uchiha, drawn the way the anime draws him: cel (toon) shading with ink outlines,
 * a painted anime face, and his Akatsuki outfit from the reference —
 * tall red-lined collar open at the front, three-ring necklace, mesh shirt over a purple top,
 * long flared cloak open down the front with red piping, wide bell sleeves with red cuffs.
 *
 * Rig: ≈1.8 units tall, feet at y = 0, facing +Z (his right side is −X).
 * Arms use two-bone IK towards hand targets; hands have articulated fingers; poses blend.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const L1 = 0.285; // upper arm
const L2 = 0.265; // forearm
const DOWN = V(0, -1, 0);
const HEAD_R = 0.1;

// finger curl presets [thumb, index, middle, ring, pinky] (0 = straight, 1 = fist)
const CURL = {
  relaxed: [0.25, 0.3, 0.35, 0.4, 0.45],
  drape: [0.3, 0.45, 0.5, 0.55, 0.6],
  flat: [0.05, 0, 0, 0, 0],
  fist: [0.9, 1, 1, 1, 1],
  point2: [0.7, 0, 0, 1, 1], // index + middle up (Tiger / Ram)
  interlock: [0.5, 0.75, 0.75, 0.75, 0.75],
  ring: [0.6, 0.45, 1, 1, 1],
};

/** Hand-sign poses: target offsets (character space) and finger curls per hand. */
const SIGN_POSES = {
  rat: { r: CURL.point2, l: CURL.fist, sep: 0.02, lift: 0.02 },
  ox: { r: CURL.interlock, l: CURL.flat, sep: 0.03, lift: -0.02, twist: 0.6 },
  tiger: { r: CURL.point2, l: CURL.point2, sep: 0.012, lift: 0.04 },
  hare: { r: CURL.fist, l: CURL.flat, sep: 0.04, lift: 0, twist: -0.4 },
  dragon: { r: CURL.interlock, l: CURL.interlock, sep: 0.015, lift: 0.02, twist: 0.3 },
  snake: { r: CURL.interlock, l: CURL.interlock, sep: 0.01, lift: 0 },
  horse: { r: CURL.ring, l: CURL.ring, sep: 0.015, lift: 0.03 },
  ram: { r: CURL.point2, l: CURL.fist, sep: 0.02, lift: 0.03 },
  monkey: { r: CURL.flat, l: CURL.flat, sep: 0.02, lift: 0.02, twist: 1.2 },
  bird: { r: CURL.relaxed, l: CURL.relaxed, sep: 0.012, lift: 0.02, twist: 0.2 },
  dog: { r: CURL.fist, l: CURL.flat, sep: 0.02, lift: -0.03, twist: 1.5 },
  boar: { r: CURL.flat, l: CURL.flat, sep: 0.03, lift: -0.02, twist: 1.57 },
};

/* ------------------------------------------------------------------ */
/* Anime materials: toon ramp + ink outlines                          */
/* ------------------------------------------------------------------ */

let _ramp;
function toonRamp() {
  if (_ramp) return _ramp;
  _ramp = new THREE.DataTexture(new Uint8Array([90, 175, 255]), 3, 1, THREE.RedFormat);
  _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter;
  _ramp.generateMipmaps = false;
  _ramp.needsUpdate = true;
  return _ramp;
}

/** Cel-shaded material. `outline` (object-space thickness) is picked up when outlines are added. */
function toon(color, { outline = 0, lift = 0.14, ...opts } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts });
  // lift the shadows a little so the character reads in dark scenes, like anime key-light fill.
  // Textured materials lift by their own texture, so black cloth stays black instead of turning grey.
  if (!opts.emissive) {
    if (opts.map) {
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveMap = opts.map;
      m.emissiveIntensity = lift;
    } else m.emissive = new THREE.Color(color).multiplyScalar(lift);
  }
  m.userData.outline = outline;
  return m;
}

const _outlineMats = new Map();
function outlineMaterial(thickness) {
  const key = thickness.toFixed(4);
  if (_outlineMats.has(key)) return _outlineMats.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: thickness }, uColor: { value: new THREE.Color(0x0c0a12) } },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      uniform float uT;
      void main(){
        vec3 p = position + normalize(normal) * uT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main(){
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  _outlineMats.set(key, m);
  return m;
}

/** Inverted-hull ink lines on every mesh whose material asks for one. */
function addOutlines(root) {
  const targets = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.isOutline && o.material.userData && o.material.userData.outline) targets.push(o); });
  for (const o of targets) {
    const hull = new THREE.Mesh(o.geometry, outlineMaterial(o.material.userData.outline));
    hull.userData.isOutline = true;
    hull.castShadow = false;
    hull.raycast = () => {};
    o.add(hull);
  }
}

/**
 * Merges a group's static child meshes that share a material into one mesh each
 * (fewer draw calls in both the colour and shadow passes). Meshes in `keep` stay separate.
 */
function bakeStatic(group, keep = []) {
  const byMat = new Map();
  for (const o of [...group.children]) {
    if (!o.isMesh || keep.includes(o) || o.children.length) continue;
    o.updateMatrix();
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    group.remove(o);
  }
  for (const [material, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (merged) group.add(new THREE.Mesh(merged, material));
  }
}

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */

let _cloakTex;
function animeCloakTexture() {
  if (_cloakTex) return _cloakTex;
  _cloakTex = drawTexture(1024, 1024, (x, w) => {
    x.fillStyle = '#1c1b28';
    x.fillRect(0, 0, w, w);
    // big Akatsuki clouds, placed so they land on the front panels, back and sleeves
    for (const [cx, cy, s] of [[170, 300, 88], [520, 250, 80], [860, 330, 88], [340, 700, 92], [700, 760, 90], [1010, 720, 80], [20, 700, 80]]) {
      drawCloud(x, cx, cy, s);
    }
  });
  _cloakTex.wrapS = _cloakTex.wrapT = THREE.RepeatWrapping;
  return _cloakTex;
}

let _meshTex;
function fishnetTexture() {
  if (_meshTex) return _meshTex;
  _meshTex = drawTexture(128, 128, (x, w) => {
    x.fillStyle = '#9a98a6'; x.fillRect(0, 0, w, w);
    x.strokeStyle = '#34323f'; x.lineWidth = 3;
    for (let i = -w; i < w * 2; i += 16) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + w, w); x.stroke();
      x.beginPath(); x.moveTo(i, w); x.lineTo(i + w, 0); x.stroke();
    }
  });
  _meshTex.wrapS = _meshTex.wrapT = THREE.RepeatWrapping;
  _meshTex.repeat.set(3, 1.2);
  return _meshTex;
}

/* ---- the painted anime face ---- */

const FACE = { phiStart: Math.PI / 2 - 1.0, phiLen: 2.0, thetaStart: 0.3 * Math.PI, thetaLen: 0.62 * Math.PI };
const faceUV = (phiOff, thetaFrac) => ({ u: (phiOff + 1.0) / 2.0, v: (thetaFrac * Math.PI - FACE.thetaStart) / FACE.thetaLen });
const _faceCache = new Map();

/** Paints eyes (with the given Sharingan mode), lids, brows, tear-troughs, nose and mouth. */
function faceTextures(mode) {
  const key = String(mode);
  if (_faceCache.has(key)) return _faceCache.get(key);
  const S = 1024;
  const iris = sharinganCanvas(mode, 256);
  const P = (phiOff, th) => { const { u, v } = faceUV(phiOff, th); return [u * S, v * S]; };

  const draw = (x, glowOnly) => {
    for (const s of [-1, 1]) {
      // s = −1: his right eye (viewer's left)
      const [ex, ey] = P(s * 0.37, 0.49);
      const ew = 112, eh = 42;
      const eye = new Path2D();
      // almond with a lifted outer corner
      eye.moveTo(ex - s * ew, ey + 2);
      eye.bezierCurveTo(ex - s * ew * 0.45, ey - eh * 1.25, ex + s * ew * 0.5, ey - eh * 1.3, ex + s * ew, ey - 8);
      eye.bezierCurveTo(ex + s * ew * 0.45, ey + eh * 0.95, ex - s * ew * 0.4, ey + eh * 0.9, ex - s * ew, ey + 2);
      if (!glowOnly) {
        x.fillStyle = '#fbf8f4';
        x.fill(eye);
      }
      x.save();
      x.clip(eye);
      const ir = 44;
      if (glowOnly) {
        x.fillStyle = '#ff2030';
        x.beginPath(); x.arc(ex + s * 4, ey - 1, ir * 0.95, 0, TAU); x.fill();
      } else {
        x.drawImage(iris, ex + s * 4 - ir, ey - 1 - ir, ir * 2, ir * 2);
        // soft upper-lid shadow over the eyeball
        const sh = x.createLinearGradient(0, ey - eh, 0, ey);
        sh.addColorStop(0, 'rgba(60,20,30,0.55)'); sh.addColorStop(1, 'rgba(60,20,30,0)');
        x.fillStyle = sh; x.fillRect(ex - ew, ey - eh * 1.4, ew * 2, eh * 1.2);
      }
      x.restore();
      if (glowOnly) continue;
      // heavy upper lid line with a flick at the outer corner
      x.strokeStyle = '#120c10'; x.lineCap = 'round'; x.lineJoin = 'round';
      x.lineWidth = 19;
      x.beginPath();
      x.moveTo(ex - s * ew, ey + 2);
      x.bezierCurveTo(ex - s * ew * 0.45, ey - eh * 1.25, ex + s * ew * 0.5, ey - eh * 1.3, ex + s * ew, ey - 8);
      x.lineTo(ex + s * (ew + 30), ey + 2);
      x.stroke();
      // lower lid (outer half) and a fold line above the lid
      x.lineWidth = 7;
      x.beginPath();
      x.moveTo(ex + s * ew, ey - 6);
      x.bezierCurveTo(ex + s * ew * 0.45, ey + eh * 0.9, ex, ey + eh * 0.85, ex - s * ew * 0.2, ey + eh * 0.8);
      x.stroke();
      x.strokeStyle = 'rgba(40,20,20,0.75)'; x.lineWidth = 5;
      x.beginPath();
      x.moveTo(ex - s * ew * 0.6, ey - eh * 1.25);
      x.quadraticCurveTo(ex + s * ew * 0.1, ey - eh * 1.75, ex + s * ew * 0.85, ey - eh * 1.2);
      x.stroke();
      // sharp brows, lower toward the centre
      const [bx, by] = P(s * 0.37, 0.438);
      x.strokeStyle = '#141018'; x.lineWidth = 16;
      x.beginPath();
      x.moveTo(bx + s * 104, by - 12);
      x.quadraticCurveTo(bx, by - 22, bx - s * 96, by + 16);
      x.stroke();
      // the long tear-trough lines, slanting in toward the nose
      const [t1x, t1y] = P(s * 0.3, 0.545);
      const [t2x, t2y] = P(s * 0.18, 0.665);
      x.strokeStyle = '#3e2420'; x.lineWidth = 7;
      x.beginPath(); x.moveTo(t1x, t1y); x.lineTo(t2x, t2y); x.stroke();
    }
    if (glowOnly) return;
    // nose: a single shadow stroke and nostril hint
    const [nx, ny] = P(0.04, 0.6);
    x.strokeStyle = 'rgba(140,90,75,0.85)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(nx, ny - 60); x.quadraticCurveTo(nx + 10, ny - 10, nx - 4, ny + 4); x.stroke();
    x.fillStyle = 'rgba(120,70,60,0.8)';
    x.beginPath(); x.ellipse(nx - 14, ny + 6, 6, 3, 0, 0, TAU); x.fill();
    // mouth
    const [mx, my] = P(0, 0.735);
    x.strokeStyle = '#6e3f3a'; x.lineWidth = 6;
    x.beginPath(); x.moveTo(mx - 34, my); x.quadraticCurveTo(mx, my + 3, mx + 34, my - 1); x.stroke();
    x.strokeStyle = 'rgba(150,95,85,0.5)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(mx - 16, my + 16); x.lineTo(mx + 16, my + 16); x.stroke();
  };

  const map = drawTexture(S, S, (x) => draw(x, false));
  const glow = drawTexture(S, S, (x) => { x.fillStyle = '#000'; x.fillRect(0, 0, S, S); draw(x, true); });
  map.anisotropy = 8;
  const res = { map, glow };
  _faceCache.set(key, res);
  return res;
}

let _bloodTex;
function bloodTexture() {
  if (_bloodTex) return _bloodTex;
  const S = 1024;
  _bloodTex = drawTexture(S, S, (x) => {
    for (const s of [-1, 1]) {
      const { u, v } = faceUV(s * 0.33, 0.515);
      const px = u * S, py = v * S;
      x.fillStyle = '#8a0008';
      x.beginPath();
      x.moveTo(px - 7, py);
      x.bezierCurveTo(px - 9, py + 80, px - 2, py + 150, px + s * 6, py + 230);
      x.bezierCurveTo(px + 12, py + 150, px + 8, py + 80, px + 7, py);
      x.closePath();
      x.fill();
    }
  });
  return _bloodTex;
}

/** Anime head shape: rounded skull, narrower pointed chin. Applied to the head and its face decals. */
function animeHead(radius, phiStart = 0, phiLen = TAU, thetaStart = 0, thetaLen = Math.PI, w = 48, hh = 40) {
  const g = new THREE.SphereGeometry(radius, w, hh, phiStart, phiLen, thetaStart, thetaLen);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = THREE.MathUtils.clamp(-y / radius, 0, 1);
    x *= 0.87 * (1 - 0.34 * t * t);
    z *= 0.97 * (1 - 0.16 * t);
    if (z > 0) z += radius * 0.05 * t;
    y *= y < 0 ? 1.16 : 1.08;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export class ItachiModel {
  constructor({ castShadow = true } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'Itachi';
    this.body = new THREE.Group();
    this.root.add(this.body);

    const cloakTex = animeCloakTexture().clone();
    cloakTex.needsUpdate = true;
    cloakTex.repeat.set(2, 1.15);
    const sleeveTex = animeCloakTexture().clone();
    sleeveTex.needsUpdate = true;
    sleeveTex.repeat.set(1, 0.7);
    sleeveTex.offset.set(0.15, 0.25);

    this.m = {
      cloak: toon(0xffffff, { map: cloakTex, outline: 0.009, lift: 0.1 }),
      sleeve: toon(0xffffff, { map: sleeveTex, outline: 0.007, lift: 0.1 }),
      cloakInside: toon(0x3a0a12, { side: THREE.BackSide, lift: 0.2 }),
      lining: toon(0xb3121e, { side: THREE.DoubleSide, lift: 0.2 }),
      trim: toon(0xc8141f, { lift: 0.25 }),
      skin: toon(0xf6dcc6, { outline: 0.0028, lift: 0.18 }),
      hair: toon(0x1a1a28, { outline: 0.0026, lift: 0.1 }),
      shirt: toon(0x46406a, { outline: 0.004 }),
      fishnet: toon(0xffffff, { map: fishnetTexture() }),
      pants: toon(0x3d3656, { outline: 0.004 }),
      band: toon(0x33466a, { outline: 0.0025 }),
      metal: toon(0xc9ced6, { lift: 0.25 }),
      sandal: toon(0x24222e, { outline: 0.003 }),
      nail: toon(0x5a3a86, { lift: 0.2 }),
      ring: toon(0xd03040, { lift: 0.3 }),
      cord: toon(0x2a2a36),
      tie: toon(0x2a2a36),
    };

    this._buildLegs();
    this._buildTorso();
    this._buildHead();
    this.arms = { r: this._buildArm(-1), l: this._buildArm(1) };
    bakeStatic(this.head, [this.ponytail, this.faceMesh, this.bloodMesh]);
    bakeStatic(this.root, [this.body]);
    addOutlines(this.root);

    this.root.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline) { o.castShadow = castShadow; o.receiveShadow = false; }
    });

    this.pose = this._poseDef('idle');
    this.cur = this._clonePose(this.pose);
    this.t = 0;
    this._solve();
  }

  /* ---------------- construction ---------------- */

  _buildLegs() {
    for (const s of [-1, 1]) {
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.043, 0.26, 12), this.m.pants);
      shin.position.set(s * 0.095, 0.2, 0);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.23), this.m.sandal);
      sole.position.set(s * 0.095, 0.01, 0.045);
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.1, 4, 10), this.m.skin);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(s * 0.095, 0.048, 0.05);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.028), this.m.sandal);
      strap.position.set(s * 0.095, 0.075, 0.07);
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.08, 0.035), this.m.sandal);
      heel.position.set(s * 0.095, 0.055, -0.05);
      this.root.add(shin, sole, foot, strap, heel);
    }
  }

  _buildTorso() {
    // inner layers seen through the open front: purple top, mesh shirt V at the chest
    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.19, 0.62, 24, 1, false), this.m.shirt);
    shirt.position.set(0, 1.08, 0.0);
    shirt.scale.z = 0.72;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.152, 0.16, 24, 1, true, -0.62, 1.24), this.m.fishnet);
    mesh.position.set(0, 1.4, 0.004);
    mesh.scale.z = 0.8;
    this.body.add(shirt, mesh);

    // the long Akatsuki cloak: flared, open down the front, with soft folds near the hem
    const prof = [
      [0.47, 0.2], [0.43, 0.42], [0.36, 0.72], [0.305, 0.97], [0.29, 1.12], [0.305, 1.27], [0.295, 1.36],
      [0.25, 1.43], [0.17, 1.475], [0.11, 1.485],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const gap = 0.16;
    const segs = 56;
    const g = new THREE.LatheGeometry(prof, segs, gap, TAU - gap * 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z);
      const hemK = THREE.MathUtils.clamp((1.05 - y) / 0.8, 0, 1);
      const fold = 1 + (Math.sin(a * 8) * 0.04 + Math.sin(a * 15 + 1.3) * 0.018) * hemK;
      p.setXYZ(i, x * fold, y, z * fold * 0.74);
    }
    g.computeVertexNormals();
    this.cloak = new THREE.Mesh(g, this.m.cloak);
    const inside = new THREE.Mesh(g, this.m.cloakInside);
    this.cloak.add(inside);
    this.body.add(this.cloak);

    // red piping along both front edges of the cloak
    const n = prof.length;
    for (const edge of [0, segs]) {
      const pts = [];
      for (let j = 0; j < n; j++) {
        const idx = edge * n + j;
        pts.push(V(p.getX(idx), p.getY(idx), p.getZ(idx)).multiplyScalar(1.004));
      }
      const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0065, 6), this.m.trim);
      this.body.add(pipe);
    }

    // tall, flaring collar standing up to his ears: black outside, red inside, open in a V at the front
    const collarG = new THREE.Group();
    collarG.position.y = 1.57;
    collarG.scale.z = 0.92;
    const open = 0.62;
    const cGeo = new THREE.CylinderGeometry(0.2, 0.12, 0.27, 40, 3, true, open, TAU - open * 2);
    const collar = new THREE.Mesh(cGeo, this.m.cloak);
    const lining = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.116, 0.268, 40, 3, true, open, TAU - open * 2), this.m.lining);
    lining.scale.set(0.975, 1, 0.975);
    collarG.add(collar, lining);
    for (const th of [open, TAU - open]) {
      const a = V(Math.sin(th) * 0.12, -0.135, Math.cos(th) * 0.12);
      const b = V(Math.sin(th) * 0.2, 0.135, Math.cos(th) * 0.2);
      const d = b.clone().sub(a);
      const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, d.length(), 6), this.m.trim);
      trim.position.copy(a).addScaledVector(d, 0.5);
      trim.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
      collarG.add(trim);
    }
    this.body.add(collarG);

    // neck and his necklace of three metal rings
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.054, 0.16, 14), this.m.skin);
    neck.position.set(0, 1.53, 0);
    this.body.add(neck);
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.0025, 6, 40), this.m.cord);
    cord.rotation.x = Math.PI / 2 - 0.55;
    cord.position.set(0, 1.49, 0.022);
    this.body.add(cord);
    for (const s of [-1, 0, 1]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.0028, 6, 16), this.m.metal);
      r.position.set(s * 0.034, 1.465 - Math.abs(s) * -0.012, 0.062 - Math.abs(s) * 0.012);
      r.rotation.y = s * 0.4;
      this.body.add(r);
    }
  }

  _buildHead() {
    const head = new THREE.Group();
    head.position.set(0, 1.585, 0.005);
    head.scale.setScalar(1.1);
    this.head = head;
    this.body.add(head);

    // anime-proportioned head with a narrow chin; face painted on a decal that follows its shape
    const skull = new THREE.Mesh(animeHead(HEAD_R), this.m.skin);
    skull.position.y = 0.1;
    head.add(skull);
    const faceGeo = animeHead(HEAD_R * 1.003, FACE.phiStart, FACE.phiLen, FACE.thetaStart, FACE.thetaLen, 40, 40);
    const f = faceTextures(3);
    // painted features are ink: unshaded, like the anime; the Sharingan glows through bloom
    this.faceMat = new THREE.MeshBasicMaterial({ map: f.map, transparent: true, alphaTest: 0.02, depthWrite: false, color: 0xf2eeea });
    this.faceMesh = new THREE.Mesh(faceGeo, this.faceMat);
    this.faceMesh.position.y = 0.1;
    this.faceMesh.renderOrder = 2;
    head.add(this.faceMesh);
    this.bloodMesh = new THREE.Mesh(animeHead(HEAD_R * 1.005, FACE.phiStart, FACE.phiLen, FACE.thetaStart, FACE.thetaLen, 40, 40),
      new THREE.MeshBasicMaterial({ map: bloodTexture(), transparent: true, depthWrite: false }));
    this.bloodMesh.position.y = 0.1;
    this.bloodMesh.renderOrder = 3;
    this.bloodMesh.visible = false;
    head.add(this.bloodMesh);
    this.bloodMeshes = [this.bloodMesh];

    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), this.m.skin);
      ear.scale.set(0.45, 1.15, 0.8);
      ear.position.set(s * 0.083, 0.1, -0.008);
      head.add(ear);
    }

    // hair: spiky crown, jagged centre-parted bangs down to the jaw, back spikes, low ponytail
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.108, 32, 18, 0, TAU, 0, Math.PI * 0.52), this.m.hair);
    crown.scale.set(0.97, 1.12, 1.08);
    crown.position.set(0, 0.125, -0.012);
    crown.rotation.x = -0.4;
    head.add(crown);
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.106, 24, 14, Math.PI * 1.02, Math.PI * 0.96, Math.PI * 0.18, Math.PI * 0.58), this.m.hair);
    back.scale.set(0.97, 1.12, 1.02);
    back.position.set(0, 0.095, -0.02);
    back.rotation.x = 0.3;
    head.add(back);
    const spike = (x, y, z, len, w, rz, rx = 0, flat = 0.4) => {
      const geo = new THREE.ConeGeometry(w, len, 4, 1);
      geo.translate(0, -len / 2, 0);
      const m = new THREE.Mesh(geo, this.m.hair);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      m.scale.z = flat;
      head.add(m);
    };
    for (const s of [-1, 1]) {
      // long bangs framing the face, reaching the jaw
      spike(s * 0.078, 0.215, 0.085, 0.23, 0.028, s * 0.06, 0.1);
      spike(s * 0.094, 0.2, 0.05, 0.25, 0.032, s * 0.02, 0.03);
      spike(s * 0.058, 0.215, 0.1, 0.15, 0.02, s * 0.22, 0.26);
      spike(s * 0.03, 0.222, 0.108, 0.1, 0.016, s * 0.45, 0.32);
      spike(s * 0.012, 0.225, 0.11, 0.07, 0.012, -s * 0.2, 0.34);
      // side and back spikes
      spike(s * 0.104, 0.17, -0.02, 0.22, 0.034, s * 0.1, -0.05);
      spike(s * 0.09, 0.16, -0.065, 0.2, 0.034, s * 0.12, -0.2);
      spike(s * 0.06, 0.2, -0.085, 0.16, 0.034, s * 0.3, -0.45);
      spike(s * 0.03, 0.235, -0.07, 0.11, 0.03, s * 0.6, -0.9, 0.5);
    }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.005, 6, 12), this.m.tie);
    tie.position.set(0, 0.02, -0.098);
    tie.rotation.x = Math.PI / 2 + 0.3;
    head.add(tie);
    const tailGeo = new THREE.ConeGeometry(0.02, 0.2, 6, 1);
    tailGeo.translate(0, -0.1, 0);
    this.ponytail = new THREE.Mesh(tailGeo, this.m.hair);
    this.ponytail.position.set(0, 0.02, -0.1);
    this.ponytail.rotation.x = 0.25;
    head.add(this.ponytail);

    // forehead protector with the scratched leaf
    const plateTex = drawTexture(256, 96, (x, w, hh) => {
      const gr = x.createLinearGradient(0, 0, 0, hh);
      gr.addColorStop(0, '#e6e9ee'); gr.addColorStop(0.55, '#b8bec6'); gr.addColorStop(1, '#8a9099');
      x.fillStyle = gr; x.fillRect(0, 0, w, hh);
      x.strokeStyle = '#2a2d33'; x.lineWidth = 3; x.strokeRect(2, 2, w - 4, hh - 4);
      drawLeaf(x, w / 2, hh / 2, 26, { color: '#2a2d33', width: 5, scratch: true });
    });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.028, 32, 1, true), this.m.band);
    band.position.y = 0.17;
    band.rotation.x = -0.12;
    band.scale.set(0.92, 1, 1.06);
    head.add(band);
    const plateMat = toon(0xffffff, { map: plateTex, outline: 0.002, lift: 0.2 });
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.109, 0.109, 0.036, 20, 1, true, -0.6, 1.2), plateMat);
    plate.position.y = 0.17;
    plate.rotation.x = -0.12;
    plate.scale.set(0.92, 1, 1.06);
    head.add(plate);
    for (const s of [-1, 1]) {
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.004), this.m.band);
      knot.position.set(s * 0.02, 0.13, -0.112);
      knot.rotation.set(0.3, 0, s * 0.3);
      head.add(knot);
    }
  }

  _buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 1.4, -0.01);
    this.body.add(shoulder);

    const upper = new THREE.Group();
    shoulder.add(upper);
    const sleeveU = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.085, L1 + 0.03, 16, 1, true), this.m.sleeve);
    sleeveU.position.y = -L1 / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10), this.m.sleeve);
    upper.add(sleeveU, cap);

    const fore = new THREE.Group();
    fore.position.y = -L1;
    upper.add(fore);
    // wide bell sleeve with a red lining that shows at the cuff
    const bell = new THREE.CylinderGeometry(0.086, 0.15, L2 * 0.95, 20, 2, true);
    const sleeveF = new THREE.Mesh(bell, this.m.sleeve);
    sleeveF.position.y = -L2 * 0.47;
    const lining = new THREE.Mesh(bell, this.m.lining);
    lining.position.y = -L2 * 0.47;
    lining.scale.set(0.96, 0.99, 0.96);
    const cuffRim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.006, 6, 32), this.m.trim);
    cuffRim.rotation.x = Math.PI / 2;
    cuffRim.position.y = -L2 * 0.945;
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.027, L2 * 0.55, 10), this.m.skin);
    wrist.position.y = -L2 * 0.73;
    fore.add(sleeveF, lining, cuffRim, wrist);

    // hand: wrist origin, fingers along −Y, palm facing +Z, thumb on the outer side
    const hand = new THREE.Group();
    hand.position.y = -L2;
    fore.add(hand);
    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.04, 4, 10), this.m.skin);
    palm.scale.set(1.2, 1, 0.42);
    palm.position.y = -0.045;
    hand.add(palm);
    const fingers = [];
    const fx = [-0.025, -0.008, 0.009, 0.025];
    const fl = [[0.036, 0.026, 0.022], [0.04, 0.028, 0.023], [0.037, 0.026, 0.021], [0.03, 0.021, 0.018]];
    const thumbSide = side < 0 ? -1 : 1;
    for (let f = 0; f < 4; f++) {
      const x = fx[f] * -thumbSide;
      const segs = [];
      let parent = hand;
      fl[f].forEach((len, k) => {
        const j = new THREE.Group();
        j.position.set(k === 0 ? x : 0, k === 0 ? -0.085 : -fl[f][k - 1], 0);
        const r = 0.0088 - k * 0.0011 - f * 0.0004;
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - r * 2, 3, 8), this.m.skin);
        seg.position.y = -len / 2;
        j.add(seg);
        if (k === 2) {
          const nail = new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 8, 6), this.m.nail);
          nail.scale.set(0.9, 1.1, 0.45);
          nail.position.set(0, -len + r * 1.2, -r * 0.55);
          j.add(nail);
        }
        if (k === 0 && f === 2 && side < 0) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.25, 0.0035, 6, 14), this.m.ring);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = -len * 0.55;
          j.add(ring);
        }
        parent.add(j);
        parent = j;
        segs.push(j);
      });
      fingers.push(segs);
    }
    const tBase = new THREE.Group();
    tBase.position.set(0.032 * thumbSide, -0.02, 0.008);
    tBase.rotation.set(0.3, 0, 0.75 * thumbSide);
    hand.add(tBase);
    const tSegs = [];
    let tp = tBase;
    [0.032, 0.026].forEach((len, k) => {
      const j = new THREE.Group();
      if (k) j.position.y = -0.032;
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0098, len - 0.0196, 3, 8), this.m.skin);
      seg.position.y = -len / 2;
      j.add(seg);
      if (k === 1) {
        const nail = new THREE.Mesh(new THREE.SphereGeometry(0.0094, 8, 6), this.m.nail);
        nail.scale.set(0.9, 1.1, 0.45);
        nail.position.set(0, -len + 0.011, -0.0055);
        j.add(nail);
      }
      tp.add(j);
      tp = j;
      tSegs.push(j);
    });

    return { side, shoulder, upper, fore, hand, fingers, thumb: tSegs };
  }

  /* ---------------- poses ---------------- */

  _poseDef(name, opts = {}) {
    // idle is his classic stance: right hand resting at the chest in the cloak's opening, left arm down in the sleeve
    const base = {
      rTarget: V(-0.03, 1.2, 0.19), lTarget: V(0.24, 0.84, 0.06),
      rFingers: V(0.45, -0.75, 0.35), lFingers: V(-0.05, -1, 0.1),
      rPalm: V(0.25, -0.35, -1), lPalm: V(-1, 0, 0.1),
      rCurl: CURL.drape, lCurl: CURL.relaxed,
      bodyY: 0, lean: 0, headPitch: 0.04, headYaw: 0,
    };
    if (name === 'sign') {
      const sp = SIGN_POSES[opts.sign] || SIGN_POSES.tiger;
      const tw = sp.twist || 0;
      const y = 1.2 + sp.lift;
      base.rTarget = V(-0.045 - sp.sep, y, 0.25);
      base.lTarget = V(0.045 + sp.sep, y, 0.25);
      base.rFingers = V(Math.sin(tw) * 0.4, 1, 0.15 + Math.cos(tw) * 0.1);
      base.lFingers = V(-Math.sin(tw) * 0.4, 1, 0.15 + Math.cos(tw) * 0.1);
      base.rPalm = V(Math.cos(tw), 0, -Math.sin(tw) * 0.8);
      base.lPalm = V(-Math.cos(tw), 0, -Math.sin(tw) * 0.8);
      base.rCurl = sp.r;
      base.lCurl = sp.l;
      base.headPitch = 0.12;
    } else if (name === 'fire') {
      base.rTarget = V(-0.035, 1.52, 0.2);
      base.lTarget = V(0.035, 1.5, 0.2);
      base.rFingers = V(0.1, 1, 0.2);
      base.lFingers = V(-0.1, 1, 0.2);
      base.rPalm = V(1, 0, 0);
      base.lPalm = V(-1, 0, 0);
      base.rCurl = CURL.point2;
      base.lCurl = CURL.point2;
      base.headPitch = opts.inhale ? -0.28 : 0.18;
      base.lean = opts.inhale ? -0.08 : 0.12;
    } else if (name === 'summon') {
      base.bodyY = -0.3;
      base.lean = 0.55;
      base.rTarget = V(-0.12, 0.03, 0.55);
      base.rFingers = V(0, 0, 1);
      base.rPalm = V(0, -1, 0);
      base.rCurl = CURL.flat;
      base.lTarget = V(0.2, 0.62, 0.32);
      base.lFingers = V(0, -0.6, 1);
      base.lPalm = V(0, -1, 0.2);
      base.headPitch = 0.3;
    } else if (name === 'focus') {
      base.rTarget = V(-0.07, 1.47, 0.24);
      base.rFingers = V(0.1, 1, 0.15);
      base.rPalm = V(1, 0, 0.2);
      base.rCurl = CURL.point2;
      base.headPitch = 0.04;
    } else if (name === 'coverEye') {
      base.rTarget = V(-0.055, 1.645, 0.17);
      base.rFingers = V(0.35, 1, 0.1);
      base.rPalm = V(0.3, 0, -1);
      base.rCurl = [0.3, 0.2, 0.2, 0.25, 0.3];
      base.headPitch = 0.28;
      base.lean = 0.08;
    } else if (name === 'slash') {
      base.rTarget = V(-0.38, 1.5, 0.36);
      base.rFingers = V(-0.2, 0.3, 1);
      base.rPalm = V(0.9, 0, 0.1);
      base.rCurl = CURL.fist;
      base.lTarget = V(0.18, 1.0, 0.2);
      base.lean = 0.06;
    } else if (name === 'guard') {
      base.lTarget = V(0.1, 1.45, 0.3);
      base.lFingers = V(-0.15, 1, 0.1);
      base.lPalm = V(0, 0, 1);
      base.lCurl = CURL.flat;
      base.rTarget = V(-0.2, 1.0, 0.18);
      base.rFingers = V(0.05, -1, 0.1);
      base.rPalm = V(1, 0, 0.1);
      base.rCurl = CURL.relaxed;
    } else if (name === 'manifest') {
      base.rTarget = V(-0.37, 0.95, 0.14);
      base.lTarget = V(0.37, 0.95, 0.14);
      base.rFingers = V(-0.35, -1, 0.35);
      base.lFingers = V(0.35, -1, 0.35);
      base.rPalm = V(0.2, -1, 0.2);
      base.lPalm = V(-0.2, -1, 0.2);
      base.rCurl = CURL.flat;
      base.lCurl = CURL.flat;
      base.headPitch = -0.05;
    } else if (name === 'ready') {
      base.rTarget = V(-0.2, 1.0, 0.2);
      base.lTarget = V(0.2, 1.0, 0.2);
      base.rFingers = V(0.3, -0.6, 1);
      base.lFingers = V(-0.3, -0.6, 1);
      base.rPalm = V(0.8, 0, 0.2);
      base.lPalm = V(-0.8, 0, 0.2);
      base.rCurl = CURL.relaxed;
    }
    for (const k of ['rFingers', 'lFingers', 'rPalm', 'lPalm']) base[k].normalize();
    return base;
  }

  _clonePose(p) {
    const o = {};
    for (const [k, v] of Object.entries(p)) o[k] = v && v.isVector3 ? v.clone() : Array.isArray(v) ? [...v] : v;
    return o;
  }

  /** Blend towards a named pose. `speed` controls how fast (higher = snappier). */
  setPose(name, opts = {}, speed = 10) {
    this.pose = this._poseDef(name, opts);
    this.poseName = name;
    this.speed = speed;
  }

  mouthWorld(target = new THREE.Vector3()) {
    this.head.updateWorldMatrix(true, false);
    return target.set(0, 0.035, 0.1).applyMatrix4(this.head.matrixWorld);
  }

  handWorld(side = 'r', target = new THREE.Vector3()) {
    const a = this.arms[side];
    a.hand.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(a.hand.matrixWorld);
  }

  /** Turns the head (radians) on top of the current pose. */
  look(yaw = 0, pitch = null) {
    this.pose.headYaw = THREE.MathUtils.clamp(yaw, -0.9, 0.9);
    if (pitch !== null) this.pose.headPitch = THREE.MathUtils.clamp(pitch, -0.5, 0.5);
  }

  setBleeding(on) {
    this.bloodMesh.visible = on;
  }

  /** 3 = three-tomoe Sharingan, 'mangekyo' = Mangekyō, 0 = onyx eyes. */
  setEyes(mode) {
    const f = faceTextures(mode);
    this.faceMat.map = f.map;
    this.faceMat.needsUpdate = true;
  }

  /* ---------------- solve ---------------- */

  _ik(arm, target, fingers, palm, curl) {
    const S = arm.shoulder.position;
    const T = target.clone().applyMatrix4(this._invBody);
    const toT = T.clone().sub(S);
    const d = THREE.MathUtils.clamp(toT.length(), 0.05, (L1 + L2) * 0.995);
    const dir = toT.normalize();
    const pole = V(arm.side * 0.9, -0.35, -0.6).normalize();
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const a1 = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const E = S.clone().addScaledVector(dir, Math.cos(a1) * L1).addScaledVector(perp, Math.sin(a1) * L1);
    const W = S.clone().addScaledVector(dir, d);

    const qU = new THREE.Quaternion().setFromUnitVectors(DOWN, E.clone().sub(S).normalize());
    arm.upper.quaternion.copy(qU);
    const qFw = new THREE.Quaternion().setFromUnitVectors(DOWN, W.clone().sub(E).normalize());
    arm.fore.quaternion.copy(qU.clone().invert().multiply(qFw));

    const bodyQ = this.body.quaternion;
    const fy = fingers.clone().applyQuaternion(bodyQ.clone().invert()).negate();
    const fz = palm.clone().applyQuaternion(bodyQ.clone().invert());
    fz.addScaledVector(fy, -fz.dot(fy)).normalize();
    const fx = new THREE.Vector3().crossVectors(fy, fz).normalize();
    const qH = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fx, fy, fz));
    arm.hand.quaternion.copy(qFw.clone().invert().multiply(qH));

    arm.fingers.forEach((segs, f) => {
      const c = curl[f + 1];
      segs.forEach((j, k) => { j.rotation.x = -c * (k === 0 ? 1.35 : 1.5); });
    });
    const tc = curl[0];
    arm.thumb[0].rotation.x = -tc * 0.9;
    arm.thumb[1].rotation.x = -tc * 1.1;
  }

  _solve() {
    const c = this.cur;
    this.body.position.y = c.bodyY;
    this.body.rotation.x = c.lean;
    this.body.updateMatrix();
    this._invBody = (this._invBody || new THREE.Matrix4()).copy(this.body.matrix).invert();
    this.head.rotation.x = c.headPitch;
    this.head.rotation.y = c.headYaw;
    this._ik(this.arms.r, c.rTarget, c.rFingers, c.rPalm, c.rCurl);
    this._ik(this.arms.l, c.lTarget, c.lFingers, c.lPalm, c.lCurl);
  }

  update(dt, t) {
    this.t = t;
    const k = 1 - Math.exp(-(this.speed || 8) * dt);
    const c = this.cur, p = this.pose;
    for (const key of Object.keys(p)) {
      const v = p[key];
      if (v && v.isVector3) c[key].lerp(v, k);
      else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) c[key][i] += (v[i] - c[key][i]) * k;
      else c[key] += (v - c[key]) * k;
    }
    for (const key of ['rFingers', 'lFingers', 'rPalm', 'lPalm']) c[key].normalize();
    const breath = Math.sin(t * 1.6) * 0.004;
    this.cloak.scale.set(1 + breath, 1, 1 + breath * 1.5);
    const idle = this.poseName === 'idle' || !this.poseName;
    this.body.rotation.z = idle ? Math.sin(t * 0.7) * 0.006 : 0;
    this.ponytail.rotation.x = 0.25 + Math.sin(t * 1.3) * 0.05 + c.lean * -0.5;
    this._solve();
  }
}

/** Pose definitions, shared with the GLB rig. */
export const itachiPose = (name, opts = {}) => ItachiModel.prototype._poseDef(name, opts);
export const toonRampTexture = () => toonRamp();
