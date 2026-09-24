import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ItachiModel, itachiPose, toonRampTexture } from './Itachi.js';
import { skinMaterial, FaceFX } from './ItachiFace.js';

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
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BASE = './models/';
let _asset = null; // { gltf, config }

/** Starts loading the model once; resolves to the asset or null when there is no model file. */
export function preloadItachi(timeoutMs = 15000) {
  if (_asset !== null) return Promise.resolve(_asset);
  const load = (async () => {
    let config = {};
    try {
      const r = await fetch(`${BASE}itachi.json`, { cache: 'no-cache' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) config = await r.json();
    } catch (_) { /* optional */ }
    const file = config.file || 'itachi.glb';
    // the dev server answers unknown paths with index.html, so check it is really a binary model
    const head = await fetch(`${BASE}${file}`, { method: 'HEAD', cache: 'no-cache' }).catch(() => null);
    if (!head || !head.ok || (head.headers.get('content-type') || '').includes('text/html')) return null;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(`${BASE}${file}`);
    return { gltf, config };
  })().catch((e) => { console.warn('[itachi] GLB not loaded:', e); return null; });
  const timeout = new Promise((r) => setTimeout(() => r(null), timeoutMs));
  return Promise.race([load, timeout]).then((a) => { _asset = a || false; return a || null; });
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

const clean = (n) => n.toLowerCase().replace(/^.*[:|]/, '').replace(/mixamorig\d*/g, '').replace(/^(j_bip_|bip0?1|def[-_]|armature[_.]?)/, '');
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
      }
    });

    // animation
    this.mixer = null;
    if (gltf.animations && gltf.animations.length) {
      const clip = gltf.animations.find((a) => config.idleClip ? a.name === config.idleClip : /idle|stand|breath/i.test(a.name)) || gltf.animations[0];
      this.mixer = new THREE.AnimationMixer(this.model);
      this.mixer.clipAction(clip).play();
    }

    // bones and their rest data
    this.b = findBones(this.model, this.root);
    if (!this.b.r || !this.b.l || !this.b.r.upper || !this.b.l.upper) throw new Error('could not find both arms in the GLB skeleton');
    this._bind();

    // eyes and blood, cut from the face mesh (needs the eye positions from itachi.json)
    this.face = null;
    if (config.eyes) {
      let body = null;
      this.model.traverse((o) => { if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
      try { if (body) this.face = new FaceFX(body, config.eyes); } catch (e) { console.warn('[itachi] eye effects unavailable:', e); }
    }
    if (opts.eyes !== undefined) this.setEyes(opts.eyes);

    this.pose = itachiPose('idle');
    this.cur = cloneP(this.pose);
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
    this.pose = itachiPose(name, opts);
    this.poseName = name;
    this.speed = speed;
  }

  look(yaw = 0, pitch = null) {
    this.pose.headYaw = THREE.MathUtils.clamp(yaw, -0.9, 0.9);
    if (pitch !== null) this.pose.headPitch = THREE.MathUtils.clamp(pitch, -0.5, 0.5);
  }

  /** Blood running from the eyes; side = 'r', 'l' or 'both'. */
  setBleeding(on, side = 'both') { if (this.face) this.face.setBleeding(on, side); }
  /** 0 = onyx, 1–3 = tomoe, 'mangekyo'. */
  setEyes(mode) { if (this.face) this.face.setEyes(mode); }
  /** The Sharingan flares and turns, as when a technique is called. */
  pulseEyes() { if (this.face) this.face.pulse(); }

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
    const k = 1 - Math.exp(-(this.speed || 8) * dt);
    const c = this.cur, p = this.pose;
    for (const key of Object.keys(p)) {
      const v = p[key];
      if (v && v.isVector3) c[key].lerp(v, k);
      else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) c[key][i] += (v[i] - c[key][i]) * k;
      else c[key] += (v - c[key]) * k;
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
    const spine = this.b.chest || this.b.spine;
    if (spine) this._rotateWorld(spine, right, c.lean, w);
    if (this.b.head) {
      this._rotateWorld(this.b.head, up, c.headYaw, w, right, c.headPitch);
    }
    this.root.updateMatrixWorld(true);
    this._arm(this.b.r, c.rTarget, c.rFingers, c.rPalm, c.rCurl, w);
    this._arm(this.b.l, c.lTarget, c.lFingers, c.lPalm, c.lCurl, w);
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
