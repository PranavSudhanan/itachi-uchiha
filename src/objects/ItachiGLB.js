import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ItachiModel, itachiPose, toonRampTexture } from './Itachi.js';
import { skinMaterial, FaceFX, markCloak } from './ItachiFace.js';
import { fetchBinary, parseGLB } from '../core/Assets.js';

/*
 * Loads an Itachi GLB (public/models/itachi.glb) and drives its skeleton with the same pose system
 * as the built-in model: two-bone IK arms, oriented hands, curling fingers, head look, lean.
 *
 * Works with Mixamo, VRM/Unity-humanoid, Blender (Rigify / .L .R) and generic rigs: bones are found by
 * name first, then by skeleton topology. Optional public/models/itachi.json:
 *   { "file": "itachi.glb", "rotationY": 0, "height": 1.8, "toon": false, "idleClip": "Idle",
 *     "eyes": { "r": [x, y, z], "l": [x, y, z], "rx": 0.028, "ry": 0.015 } }
 * "toon": true switches to cel shading; by default the model gets realistic skin and cloth.
 * "eyes" (centres and half-size in the mesh's own geometry space) enables the Sharingan and bleeding eyes.
 * "brows" recolours and thickens eyebrows that are strips of face geometry textured from a colour swatch:
 *   { "meshes": [...], "uv": [u0, v0, u1, v1] brow swatch, "outlineUv": [...] its outline swatch,
 *     "to": [u, v] the swatch to use instead, "thicken": 1.6 }
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BASE = './models/';

/**
 * Eyebrows modelled as thin strips of face geometry: points them at a darker swatch (they read as hair,
 * not as a brown line under the warm skin shading) and thickens each brow about its own centreline.
 * Brow triangles are those above each eye whose texture falls in the brow swatch, plus the outline
 * triangles touching them; their vertices are duplicated first so no neighbouring skin is disturbed.
 * Geometry is shared between clones, so it is done once.
 */
function fixBrows(model, cfg, eyes) {
  const inBox = (u, v, b) => u >= b[0] && v >= b[1] && u < b[2] && v < b[3];
  model.traverse((o) => {
    if (!o.isMesh || !cfg.meshes.includes(o.name)) return;
    const g = o.geometry;
    if (g.userData.browsFixed || !g.index) return;
    g.userData.browsFixed = true;
    const P = g.attributes.position, U = g.attributes.uv, idx = g.index.array;
    const T = idx.length / 3;
    const cen = (t, a) => (a.getX(idx[t * 3]) + a.getX(idx[t * 3 + 1]) + a.getX(idx[t * 3 + 2])) / 3;
    const cenY = (t, a) => (a.getY(idx[t * 3]) + a.getY(idx[t * 3 + 1]) + a.getY(idx[t * 3 + 2])) / 3;
    const band = (t) => {
      const x = cen(t, P), y = cenY(t, P);
      const e = eyes[Math.abs(x - eyes.r[0]) < Math.abs(x - eyes.l[0]) ? 'r' : 'l'];
      const dy = (y - e[1]) / eyes.ry, dx = (x - e[0]) / eyes.rx;
      return dy > 0.7 && dy < 3.2 && Math.abs(dx) < 2.6;
    };
    const brow = [], browVerts = new Set();
    for (let t = 0; t < T; t++) {
      if (band(t) && inBox(cen(t, U), cenY(t, U), cfg.uv)) { brow.push(t); for (let k = 0; k < 3; k++) browVerts.add(idx[t * 3 + k]); }
    }
    if (!brow.length) return;
    // outline triangles that touch the brow strips (by position: they may not share vertices)
    const near = (i) => { for (const j of browVerts) if ((P.getX(i) - P.getX(j)) ** 2 + (P.getY(i) - P.getY(j)) ** 2 + (P.getZ(i) - P.getZ(j)) ** 2 < 1e-7) return true; return false; };
    for (let t = 0; t < T; t++) {
      if (!band(t) || !inBox(cen(t, U), cenY(t, U), cfg.outlineUv) || brow.includes(t)) continue;
      if ([0, 1, 2].some((k) => near(idx[t * 3 + k]))) brow.push(t);
    }
    // give the brow triangles their own vertices
    const names = Object.keys(g.attributes);
    const data = Object.fromEntries(names.map((n) => [n, Array.from(g.attributes[n].array)]));
    const remap = new Map();
    let count = P.count;
    for (const t of brow) for (let k = 0; k < 3; k++) {
      const i = idx[t * 3 + k];
      if (!remap.has(i)) {
        remap.set(i, count++);
        for (const n of names) { const a = g.attributes[n]; for (let c = 0; c < a.itemSize; c++) data[n].push(a.array[i * a.itemSize + c]); }
      }
      idx[t * 3 + k] = remap.get(i);
    }
    for (const n of names) {
      const a = g.attributes[n];
      g.setAttribute(n, new THREE.BufferAttribute(new a.array.constructor(data[n]), a.itemSize, a.normalized));
    }
    g.index.needsUpdate = true;
    const pos = g.attributes.position, uv = g.attributes.uv;
    // per side: fit the brow's centreline (y as a quadratic in x) and spread the strip about it
    for (const side of ['r', 'l']) {
      const vs = [...remap.values()].filter((i) => (Math.abs(pos.getX(i) - eyes.r[0]) < Math.abs(pos.getX(i) - eyes.l[0])) === (side === 'r'));
      if (vs.length < 3) continue;
      const x0 = eyes[side][0];
      // least squares y = a + b·dx + c·dx²
      const S = Array(5).fill(0), R = [0, 0, 0];
      for (const i of vs) {
        const dx = pos.getX(i) - x0, y = pos.getY(i);
        for (let k = 0; k < 5; k++) S[k] += dx ** k;
        for (let k = 0; k < 3; k++) R[k] += y * dx ** k;
      }
      const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det(M);
      if (Math.abs(D) < 1e-20) continue;
      const coef = [0, 1, 2].map((k) => det(M.map((row, r) => row.map((v, c) => (c === k ? R[r] : v)))) / D);
      for (const i of vs) {
        const dx = pos.getX(i) - x0;
        const yc = coef[0] + coef[1] * dx + coef[2] * dx * dx;
        pos.setY(i, yc + (pos.getY(i) - yc) * cfg.thicken);
        pos.setZ(i, pos.getZ(i) + eyes.rx * 0.03); // a hair above the skin, so it never z-fights
      }
    }
    for (const i of remap.values()) uv.setXY(i, cfg.to[0], cfg.to[1]);
    pos.needsUpdate = uv.needsUpdate = true;
    // matte: no warm rim light on the brows (see skinMaterial)
    const matte = new Float32Array(pos.count);
    for (const i of remap.values()) matte[i] = 1;
    g.setAttribute('aMatte', new THREE.BufferAttribute(matte, 1));
    g.computeBoundingSphere();
  });
}
let _asset = null; // { gltf, config }

/** Starts loading the model once; resolves to the asset or null when there is no model file. */
let _download = null; // Promise<{ buffer, config } | null>
let _parsing = null;

/** Downloads the model file (no parsing), so it is on hand by the time a chapter needs it. */
export function prefetchItachi() {
  if (!_download) {
    _download = (async () => {
      let config = {};
      try {
        const r = await fetch(`${BASE}itachi.json`);
        if (r.ok && (r.headers.get('content-type') || '').includes('json')) config = await r.json();
      } catch (_) { /* optional */ }
      const buffer = await fetchBinary(`${BASE}${config.file || 'itachi.glb'}`);
      return buffer ? { buffer, config } : null;
    })().catch(() => null);
  }
  return _download;
}

/** Downloads (if not already) and parses the model once; resolves to the asset or null when there is none. */
export function preloadItachi(timeoutMs = 20000) {
  if (_asset !== null) return Promise.resolve(_asset || null);
  if (!_parsing) {
    const load = prefetchItachi().then(async (d) => {
      if (!d) return null;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      return { gltf: await parseGLB(loader, d.buffer, BASE), config: d.config };
    }).catch((e) => { console.warn('[itachi] GLB not loaded:', e); return null; });
    const timeout = new Promise((r) => setTimeout(() => r(null), timeoutMs));
    _parsing = Promise.race([load, timeout]).then((a) => { _asset = a || false; return a || null; });
  }
  return _parsing;
}

export function hasItachiGLB() { return !!_asset; }

/** Creates Itachi: the GLB when available, otherwise the built-in model. Same API either way. */
export function createItachi(opts = {}) {
  if (_asset) {
    try { return new GLBItachi(_asset, opts); } catch (e) { console.warn('[itachi] GLB rig failed, using built-in model:', e); }
  }
  return new ItachiModel(opts);
}

/* ------------------------------------------------------------------ */
/* Bone discovery                                                      */
/* ------------------------------------------------------------------ */

// (Sketchfab exports append a node index: 'mixamorig:LeftArm_09')
const clean = (n) => n.toLowerCase().replace(/_\d+$/, '').replace(/^.*[:|]/, '').replace(/mixamorig\d*/g, '').replace(/^(j_bip_|bip0?1|def[-_]|armature[_.]?)/, '');
const flat = (n) => clean(n).replace(/[\s._\-]/g, '');
function sideOf(name) {
  const c = clean(name);
  if (/right/.test(c) || /(^|[\s._\-])r($|[\s._\-])/.test(c) || /(^|[_\-.])r_/.test(c) || /[._\-]r$/.test(c)) return 'r';
  if (/left/.test(c) || /(^|[\s._\-])l($|[\s._\-])/.test(c) || /(^|[_\-.])l_/.test(c) || /[._\-]l$/.test(c)) return 'l';
  return null;
}
const FINGERS = { thumb: /thumb/, index: /index|pointer/, middle: /middle/, ring: /ring/, pinky: /pinky|little|small/ };
const isEnd = (n) => /end|top|tip|nub/.test(flat(n)) && !/thumb|index|middle|ring|pinky|little/.test(flat(n)) ? true : /end$|nub$|_end/.test(flat(n));

function findBones(scene, rootObj) {
  const nodes = [];
  scene.traverse((o) => { if (o.isBone) nodes.push(o); });
  const pool = nodes.length ? nodes : (() => { const a = []; scene.traverse((o) => { if (!o.isMesh && o !== scene) a.push(o); }); return a; })();
  const byName = (re, side = null) => pool.find((b) => re.test(flat(b.name)) && !/twist|roll|end|nub/.test(flat(b.name)) && (side === null || sideOf(b.name) === side));
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());

  const bones = {
    hips: byName(/^(hips?|pelvis)$|hips$/),
    spine: byName(/^spine0?1?$|^spine$/),
    chest: byName(/chest|^spine0?2$/),
    neck: byName(/neck/),
    head: byName(/^head$|^head[^t]|head$/),
  };

  // hands: by name, otherwise by topology (a bone with ≥ 3 finger chains)
  const handsByName = { r: byName(/hand$|^hand|wrist/, 'r'), l: byName(/hand$|^hand|wrist/, 'l') };
  const handsTopo = pool.filter((b) => b.children.filter((c) => c.children.length > 0).length >= 3 && !/hips|pelvis|spine|chest|root/.test(flat(b.name)));
  const toLocalX = (o) => rootObj.worldToLocal(wp(o)).x;
  for (const side of ['r', 'l']) {
    let hand = handsByName[side];
    if (!hand) {
      hand = handsTopo.filter((b) => (side === 'r' ? toLocalX(b) < 0 : toLocalX(b) > 0)).sort((a, b) => Math.abs(toLocalX(b)) - Math.abs(toLocalX(a)))[0];
    }
    if (!hand) continue;
    const up = (b) => { let p = b.parent; while (p && /twist|roll/.test(flat(p.name))) p = p.parent; return p; };
    const fore = up(hand);
    const upper = fore && up(fore);
    // fingers: each child chain of the hand
    const chains = hand.children.map((c) => { const segs = []; let b = c; while (b && (b.isBone || !nodes.length)) { if (!isEnd(b.name) || !segs.length) segs.push(b); b = b.children.find((k) => k.isBone || !nodes.length); } return segs; }).filter((s) => s.length >= 2);
    const finger = {};
    for (const [key, re] of Object.entries(FINGERS)) finger[key] = chains.find((ch) => re.test(flat(ch[0].name)));
    const unnamed = chains.filter((ch) => !Object.values(finger).includes(ch));
    if (unnamed.length) {
      // topology fallback: thumb = chain whose base is furthest from the others; the rest ordered away from it
      const bases = chains.map((ch) => wp(ch[0]));
      const centroid = bases.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / bases.length);
      if (!finger.thumb) finger.thumb = [...chains].sort((a, b) => wp(b[0]).distanceTo(centroid) - wp(a[0]).distanceTo(centroid))[0];
      const tb = wp(finger.thumb[0]);
      const rest = chains.filter((ch) => ch !== finger.thumb).sort((a, b) => wp(a[0]).distanceTo(tb) - wp(b[0]).distanceTo(tb));
      ['index', 'middle', 'ring', 'pinky'].forEach((k, i) => { if (!finger[k] && rest[i]) finger[k] = rest[i]; });
    }
    bones[side] = { upper, fore, hand, finger };
  }

  // head fallback: highest non-end bone
  if (!bones.head) bones.head = [...pool].filter((b) => !isEnd(b.name)).sort((a, b) => wp(b).y - wp(a).y)[0];
  if (!bones.neck && bones.head) bones.neck = bones.head.parent;
  if (!bones.spine) bones.spine = bones.chest || (bones.neck && bones.neck.parent);
  return bones;
}

/* ------------------------------------------------------------------ */
/* The rigged GLB character                                            */
/* ------------------------------------------------------------------ */

export class GLBItachi {
  constructor(asset, opts = {}) {
    const { castShadow = true } = opts;
    const { gltf, config } = asset;
    this.isGLB = true;
    this.root = new THREE.Group();
    this.root.name = 'Itachi (GLB)';
    this.model = cloneSkinned(gltf.scene);
    this.pivot = new THREE.Group();
    this.pivot.add(this.model);
    this.root.add(this.pivot);

    // normalise: height, feet on the ground, centred, facing +Z
    this.model.rotation.y = THREE.MathUtils.degToRad(config.rotationY || 0);
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model, true);
    const size = box.getSize(new THREE.Vector3());
    const s = (config.height || 1.8) / Math.max(size.y, 1e-4);
    this.model.scale.multiplyScalar(s);
    this.model.updateMatrixWorld(true);
    box.setFromObject(this.model, true);
    const c = box.getCenter(new THREE.Vector3());
    this.model.position.x -= c.x;
    this.model.position.z -= c.z;
    this.model.position.y -= box.min.y;
    this.root.updateMatrixWorld(true);
    this.height = config.height || 1.8;

    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = castShadow;
        o.frustumCulled = false; // skinned bounds don't follow IK
        o.material = config.toon ? toToon(o.material) : skinMaterial(o.material);
        if (o.isSkinnedMesh && !config.toon) markCloak(o);
      }
    });

    // animation
    this.mixer = null;
    // (single-frame clips are just a stored pose, not an animation: the procedural idle does better)
    const clips = (gltf.animations || []).filter((a) => a.duration > 0.5);
    if (clips.length) {
      const clip = clips.find((a) => config.idleClip ? a.name === config.idleClip : /idle|stand|breath/i.test(a.name)) || clips[0];
      this.mixer = new THREE.AnimationMixer(this.model);
      this.mixer.clipAction(clip).play();
    }

    // bones and their rest data
    this.b = findBones(this.model, this.root);
    if (!this.b.r || !this.b.l || !this.b.r.upper || !this.b.l.upper) throw new Error('could not find both arms in the GLB skeleton');
    this._bind();

    if (config.brows && config.eyes) fixBrows(this.model, config.brows, config.eyes);

    // eyes and blood, cut from the face mesh (needs the eye positions from itachi.json)
    this.face = null;
    if (config.eyes) {
      // the face mesh: named in the config ("mesh"), otherwise the largest skinned mesh
      let body = null;
      this.model.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        if (config.eyes.mesh) { if (o.name === config.eyes.mesh && !body) body = o; return; }
        if (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count) body = o;
      });
      try { if (body) this.face = new FaceFX(body, config.eyes, this.model); } catch (e) { console.warn('[itachi] eye effects unavailable:', e); }
      // the face vertex nearest each eye: its skinned position is exactly where the eye is drawn
      if (body) {
        const P = body.geometry.attributes.position;
        this.eyeBody = body;
        this.eyeVert = {};
        for (const sd of ['r', 'l']) {
          const [ex, ey, ez] = config.eyes[sd];
          let best = -1, bd = Infinity;
          for (let i = 0; i < P.count; i++) {
            const d = (P.getX(i) - ex) ** 2 + (P.getY(i) - ey) ** 2 + (P.getZ(i) - ez) ** 2;
            if (d < bd) { bd = d; best = i; }
          }
          this.eyeVert[sd] = best;
        }
      }
    }
    if (opts.eyes !== undefined) this.setEyes(opts.eyes);

    this.pose = itachiPose('idle');
    this.cur = cloneP(this.pose);
    this.vel = zeroP(this.pose);
    this.life = { yaw: 0, pitch: 0, next: 1.5, lookAt: -1e9 };

    // a soft contact shadow grounds him
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({
      map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.6, color: 0x000000,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    shadow.renderOrder = -1;
    this.root.add(shadow);
    this.poseName = 'idle';
    this.speed = 8;
    this.ikW = this.mixer ? 0 : 1;
  }

  _bind() {
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
    this.rest = new Map();
    const remember = (b) => { if (b && !this.rest.has(b)) this.rest.set(b, b.quaternion.clone()); };
    [this.b.spine, this.b.chest, this.b.neck, this.b.head, this.b.hips].forEach(remember);
    this.hipsRestPos = this.b.hips ? this.b.hips.position.clone() : null;

    for (const side of ['r', 'l']) {
      const a = this.b[side];
      [a.upper, a.fore, a.hand].forEach(remember);
      a.sign = side === 'r' ? -1 : 1;
      a.L1 = wp(a.upper).distanceTo(wp(a.fore));
      a.L2 = wp(a.fore).distanceTo(wp(a.hand));
      a.axisU = a.upper.worldToLocal(wp(a.fore)).normalize();
      a.axisF = a.fore.worldToLocal(wp(a.hand)).normalize();
      const f = a.finger;
      const tipOf = f.middle || f.index || f.ring;
      const fDirW = tipOf ? wp(tipOf[0]).sub(wp(a.hand)).normalize() : wp(a.hand).sub(wp(a.fore)).normalize();
      a.axisH = fDirW.clone().applyQuaternion(wq(a.hand).invert());
      // palm normal from the knuckle line (index → pinky) and the finger direction
      let nW;
      if (f.index && f.pinky) {
        const sW = wp(f.index[0]).sub(wp(f.pinky[0])).normalize();
        nW = side === 'r' ? new THREE.Vector3().crossVectors(sW, fDirW) : new THREE.Vector3().crossVectors(fDirW, sW);
      } else nW = V(0, -1, 0);
      nW.normalize();
      a.palmH = nW.clone().applyQuaternion(wq(a.hand).invert());
      // curl axis for each finger segment (rotating about it bends the finger toward the palm)
      const curlW = new THREE.Vector3().crossVectors(fDirW, nW).normalize();
      a.fingerSegs = [];
      ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach((k, fi) => {
        (f[k] || []).forEach((seg, si) => {
          remember(seg);
          a.fingerSegs.push({ seg, fi, si, axis: curlW.clone().applyQuaternion(wq(seg).invert()).normalize() });
        });
      });
    }
    if (this.b.head) {
      // mouth: in front of the face, a little below the head bone's top half
      const box = new THREE.Box3().setFromObject(this.model, true);
      const hp = wp(this.b.head);
      const mouthW = V(hp.x, hp.y + (box.max.y - hp.y) * 0.3, hp.z + 0.09);
      this.mouthLocal = this.b.head.worldToLocal(mouthW);
    }
  }

  /* ---------------- API shared with the built-in model ---------------- */

  setPose(name, opts = {}, speed = 10) {
    const prev = this.poseName;
    this.pose = itachiPose(name, opts);
    this.poseName = name;
    this.speed = speed;
    // body accents: each sign snaps in with a small dip, a slash throws the weight forward, fire rocks back then out
    const v = this.vel;
    if (name === 'sign') { v.bodyY -= 0.22; v.lean += 0.45; v.headPitch += 0.35; }
    else if (name === 'slash') { v.lean += 1.4; v.bodyY -= 0.3; }
    else if (name === 'fire') { v.lean += opts.inhale ? -0.8 : 1.2; v.headPitch += opts.inhale ? -0.6 : 0.8; }
    else if (name === 'manifest' && prev !== 'manifest') { v.bodyY -= 0.5; v.lean -= 0.4; }
    else if (name === 'guard') { v.lean -= 0.5; }
    // a hand to the eye: aim at this model's own right eye (the pose table assumes another head), the wrist
    // just below and in front so the palm and fingers cover it
    if (name === 'coverEye' && this.eyeVert) {
      const e = this.root.worldToLocal(this.eyeWorld('r', new THREE.Vector3()));
      const s = this.root.getWorldScale(new THREE.Vector3()).y || 1;
      this.pose.rTarget.set(e.x - 0.02 / s, e.y - 0.11 / s, e.z + 0.07 / s);
      this.pose.headPitch = 0.22;
    }
  }

  look(yaw = 0, pitch = null) {
    this.life.lookAt = performance.now();
    this.pose.headYaw = THREE.MathUtils.clamp(yaw, -0.9, 0.9);
    if (pitch !== null) this.pose.headPitch = THREE.MathUtils.clamp(pitch, -0.5, 0.5);
  }

  /** Blood running from the eyes; side = 'r', 'l' or 'both'. */
  setBleeding(on, side = 'both') { if (this.face) this.face.setBleeding(on, side); }
  /** 0 = onyx, 1–3 = tomoe, 'mangekyo'. */
  setEyes(mode) { if (this.face) this.face.setEyes(mode); }
  /** The Sharingan flares and turns, as when a technique is called. */
  pulseEyes() { if (this.face) this.face.pulse(); }

  /** World position of an eye ('r' or 'l'). */
  eyeWorld(side = 'r', target = new THREE.Vector3()) {
    if (!this.b.head) return target.set(0, this.height * 0.92, 0.1).applyMatrix4(this.root.matrixWorld);
    this.b.head.updateWorldMatrix(true, false);
    if (this.eyeVert) {
      // bones and the skinned mesh must be current, or the vertex lands where he stood last frame
      this.root.updateMatrixWorld(true);
      this.eyeBody.skeleton.update();
      this.eyeBody.getVertexPosition(this.eyeVert[side], target);
      return this.eyeBody.localToWorld(target);
    }
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    return this.b.head.getWorldPosition(target).add(new THREE.Vector3(side === 'r' ? -0.03 : 0.03, 0.08, 0.09).applyQuaternion(rq));
  }

  mouthWorld(target = new THREE.Vector3()) {
    if (!this.b.head) return target.set(0, this.height * 0.88, 0.1).applyMatrix4(this.root.matrixWorld);
    this.b.head.updateWorldMatrix(true, false);
    return target.copy(this.mouthLocal).applyMatrix4(this.b.head.matrixWorld);
  }

  handWorld(side = 'r', target = new THREE.Vector3()) {
    const h = this.b[side].hand;
    h.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(h.matrixWorld);
  }

  /* ---------------- solving ---------------- */

  /** Rotates `bone` so its rest axis points along `dirW`, blended by w from its current (animated) rotation. */
  _aim(bone, axisLocal, dirW, w) {
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const restW = pq.clone().multiply(this.rest.get(bone));
    const axisW = axisLocal.clone().applyQuaternion(restW);
    const targetW = new THREE.Quaternion().setFromUnitVectors(axisW, dirW.clone().normalize()).multiply(restW);
    const targetL = pq.invert().multiply(targetW);
    bone.quaternion.slerp(targetL, w);
    bone.updateMatrixWorld(true);
  }

  _arm(a, targetR, fingersR, palmR, curl, w) {
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    const S = a.upper.getWorldPosition(new THREE.Vector3());
    const T = this.root.localToWorld(targetR.clone());
    const toT = T.clone().sub(S);
    const d = THREE.MathUtils.clamp(toT.length(), 0.05, (a.L1 + a.L2) * 0.995);
    const dir = toT.normalize();
    const pole = V(a.sign * 0.9, -0.35, -0.6).applyQuaternion(rq).normalize();
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const a1 = Math.acos(THREE.MathUtils.clamp((a.L1 * a.L1 + d * d - a.L2 * a.L2) / (2 * a.L1 * d), -1, 1));
    const E = S.clone().addScaledVector(dir, Math.cos(a1) * a.L1).addScaledVector(perp, Math.sin(a1) * a.L1);
    const W = S.clone().addScaledVector(dir, d);
    this._aim(a.upper, a.axisU, E.clone().sub(S), w);
    this._aim(a.fore, a.axisF, W.clone().sub(E), w);

    // hand: fingers along fingersR, palm facing palmR (both in character space)
    const fW = fingersR.clone().applyQuaternion(rq).normalize();
    const nWanted = palmR.clone().applyQuaternion(rq);
    const pq = a.hand.parent.getWorldQuaternion(new THREE.Quaternion());
    const restW = pq.clone().multiply(this.rest.get(a.hand));
    const q1 = new THREE.Quaternion().setFromUnitVectors(a.axisH.clone().applyQuaternion(restW), fW).multiply(restW);
    const nNow = a.palmH.clone().applyQuaternion(q1);
    const proj = (v) => v.clone().addScaledVector(fW, -v.dot(fW)).normalize();
    const n1 = proj(nNow), n2 = proj(nWanted);
    let ang = Math.acos(THREE.MathUtils.clamp(n1.dot(n2), -1, 1));
    if (new THREE.Vector3().crossVectors(n1, n2).dot(fW) < 0) ang = -ang;
    const qW = new THREE.Quaternion().setFromAxisAngle(fW, ang).multiply(q1);
    a.hand.quaternion.slerp(pq.invert().multiply(qW), w);
    a.hand.updateMatrixWorld(true);

    // fingers
    for (const f of a.fingerSegs) {
      const c = curl[f.fi] || 0;
      const amount = f.fi === 0 ? c * (f.si === 0 ? 0.5 : 0.9) : c * (f.si === 0 ? 1.2 : 1.4);
      const q = this.rest.get(f.seg).clone().multiply(new THREE.Quaternion().setFromAxisAngle(f.axis, amount));
      f.seg.quaternion.slerp(q, w);
    }
  }

  update(dt, t) {
    const c = this.cur, p = this.pose, vel = this.vel;
    const calm = this.poseName === 'idle' || this.poseName === 'ready' ? 1 : 0;

    // idle glances: when nothing steers his gaze, he looks about now and then
    const L = this.life;
    if (calm && performance.now() - L.lookAt > 1200) {
      if (t > L.next) {
        const still = Math.random() < 0.35;
        L.yaw = still ? 0 : (Math.random() * 2 - 1) * 0.32;
        L.pitch = (Math.random() * 2 - 1) * 0.06;
        L.next = t + 2.5 + Math.random() * 4;
      }
      p.headYaw = L.yaw;
      p.headPitch = 0.04 + L.pitch;
    }

    // critically-damped-ish springs (a touch of overshoot) toward the pose: motion with weight
    const omega = Math.max(4, (this.speed || 8) * 0.95), zeta = 0.74;
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    const spring = (cur, tgt, v) => {
      const a = omega * omega * (tgt - cur) - 2 * zeta * omega * v;
      v += a * h;
      return [cur + v * h, v];
    };
    for (let s = 0; s < steps; s++) {
      for (const key of Object.keys(p)) {
        const tv = p[key];
        if (tv && tv.isVector3) {
          for (const ax of ['x', 'y', 'z']) { const [nc, nv] = spring(c[key][ax], tv[ax], vel[key][ax]); c[key][ax] = nc; vel[key][ax] = nv; }
        } else if (Array.isArray(tv)) {
          for (let i = 0; i < tv.length; i++) { const [nc, nv] = spring(c[key][i], tv[i], vel[key][i]); c[key][i] = nc; vel[key][i] = nv; }
        } else if (typeof tv === 'number') {
          const [nc, nv] = spring(c[key], tv, vel[key]); c[key] = nc; vel[key] = nv;
        }
      }
    }
    for (const key of ['rFingers', 'lFingers', 'rPalm', 'lPalm']) c[key].normalize();

    // with an idle animation, IK fades out while idle and in for every other pose
    if (this.mixer) this.mixer.update(dt);
    if (this.face) this.face.update(dt);
    const wantIK = !this.mixer || this.poseName !== 'idle' ? 1 : 0;
    this.ikW += (wantIK - this.ikW) * (1 - Math.exp(-6 * dt));
    const w = this.ikW;
    if (w < 0.001) return;

    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    const right = V(1, 0, 0).applyQuaternion(rq);
    const up = V(0, 1, 0).applyQuaternion(rq);
    // crouch and lean
    if (this.b.hips && this.hipsRestPos) {
      const parentScale = this.b.hips.parent.getWorldScale(new THREE.Vector3()).y || 1;
      this.b.hips.position.y = THREE.MathUtils.lerp(this.b.hips.position.y, this.hipsRestPos.y + c.bodyY / parentScale, w);
    }
    const fwd = V(0, 0, 1).applyQuaternion(rq);
    // alive: slow breathing through the chest, a gentle weight shift through the hips, the spine balancing it
    const breath = Math.sin(t * 1.35), sway = Math.sin(t * 0.42), turn = Math.sin(t * 0.27 + 1.3);
    const life = 0.35 + 0.65 * calm;
    if (this.b.hips && this.rest.has(this.b.hips)) {
      this.b.hips.quaternion.copy(this.rest.get(this.b.hips));
      this.b.hips.updateMatrixWorld(true);
      this._twist(this.b.hips, fwd, sway * 0.02 * life);
      this._twist(this.b.hips, up, turn * 0.035 * life);
    }
    const spine = this.b.chest || this.b.spine;
    if (this.b.spine && this.b.spine !== spine && this.rest.has(this.b.spine)) {
      this.b.spine.quaternion.copy(this.rest.get(this.b.spine));
      this.b.spine.updateMatrixWorld(true);
      this._twist(this.b.spine, fwd, -sway * 0.014 * life);
      this._twist(this.b.spine, right, -breath * 0.006);
    }
    if (spine) {
      this._rotateWorld(spine, right, c.lean, w);
      this._twist(spine, right, -breath * 0.016);
      this._twist(spine, up, -turn * 0.02 * life);
    }
    if (this.b.head) {
      this._rotateWorld(this.b.head, up, c.headYaw, w, right, c.headPitch);
      this._twist(this.b.head, right, breath * 0.01);
    }
    this.root.updateMatrixWorld(true);
    const lift = breath * 0.006 * calm;
    this._arm(this.b.r, lift ? c.rTarget.clone().setY(c.rTarget.y + lift) : c.rTarget, c.rFingers, c.rPalm, c.rCurl, w);
    this._arm(this.b.l, c.lTarget, c.lFingers, c.lPalm, c.lCurl, w);
  }

  /** Rotates a bone about a world axis, on top of its current rotation. */
  _twist(bone, axisW, angle) {
    if (!angle) return;
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const axisL = axisW.clone().applyQuaternion(pq.invert()).normalize();
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axisL, angle));
    bone.updateMatrixWorld(true);
  }

  /** Applies world-axis rotations on top of the bone's rest pose (blended). */
  _rotateWorld(bone, axisW, angle, w, axis2W = null, angle2 = 0) {
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const restW = pq.clone().multiply(this.rest.get(bone));
    let q = new THREE.Quaternion().setFromAxisAngle(axisW, angle);
    if (axis2W) q = q.multiply(new THREE.Quaternion().setFromAxisAngle(axis2W, angle2));
    const targetL = pq.invert().multiply(q.multiply(restW));
    bone.quaternion.slerp(targetL, w);
    bone.updateMatrixWorld(true);
  }
}

function zeroP(p) {
  const o = {};
  for (const [k, v] of Object.entries(p)) o[k] = v && v.isVector3 ? new THREE.Vector3() : Array.isArray(v) ? v.map(() => 0) : 0;
  return o;
}

let _shadowTex;
function contactShadowTexture() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}

function cloneP(p) {
  const o = {};
  for (const [k, v] of Object.entries(p)) o[k] = v && v.isVector3 ? v.clone() : Array.isArray(v) ? [...v] : v;
  return o;
}

/** Converts a PBR material to cel shading while keeping its textures, for an anime look. */
function toToon(m) {
  if (Array.isArray(m)) return m.map(toToon);
  if (!m || m.isMeshToonMaterial || m.isShaderMaterial) return m;
  const t = new THREE.MeshToonMaterial({
    name: m.name,
    color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
    map: m.map || null,
    alphaMap: m.alphaMap || null,
    transparent: m.transparent,
    alphaTest: m.alphaTest,
    opacity: m.opacity,
    side: m.side,
    gradientMap: toonRampTexture(),
    emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0),
    emissiveMap: m.emissiveMap || null,
    normalMap: m.normalMap || null,
  });
  // gentle lift so it reads in the dark scenes
  if (t.map && t.emissive.getHex() === 0) { t.emissive.set(0xffffff); t.emissiveMap = t.map; t.emissiveIntensity = 0.12; }
  return t;
}
