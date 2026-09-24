#!/usr/bin/env node
/**
 * Rigs the static Itachi OBJ into a skinned GLB for the site.
 *
 *   node tools/rig-itachi.mjs <model.obj> <basecolor.jpg> [out.glb]
 *
 * - Rotates the model to face +Z, scales it to 1.8 m, feet on y = 0.
 * - Builds a Mixamo-named skeleton at landmarks measured from the mesh (A-pose).
 * - Computes skin weights by body region: spine chain for the cloak, arm chain for the sleeves,
 *   head/neck with the tall collar kept on the neck, legs below the cloak hem, one finger chain per hand.
 * - Embeds the base-colour texture. No dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';

const [objPath, texPath, outPath = 'public/models/itachi.glb'] = process.argv.slice(2);
if (!objPath || !texPath) {
  console.error('usage: node tools/rig-itachi.mjs <model.obj> <basecolor.jpg> [out.glb]');
  process.exit(1);
}

/* ---------------- parse OBJ ---------------- */
const text = fs.readFileSync(objPath, 'utf8');
const V = [], VT = [], VN = [];
const keyIndex = new Map();
const pos = [], nrm = [], uv = [], idx = [];
let x0 = 0;
{
  let i = 0;
  const len = text.length;
  while (i < len) {
    let j = text.indexOf('\n', i);
    if (j < 0) j = len;
    const line = text.slice(i, j).trim();
    i = j + 1;
    if (line.startsWith('v ')) { const a = line.split(/\s+/); V.push(+a[1], +a[2], +a[3]); }
    else if (line.startsWith('vt ')) { const a = line.split(/\s+/); VT.push(+a[1], +a[2]); }
    else if (line.startsWith('vn ')) { const a = line.split(/\s+/); VN.push(+a[1], +a[2], +a[3]); }
    else if (line.startsWith('f ')) {
      const verts = line.split(/\s+/).slice(1);
      const ids = verts.map((vs) => {
        let id = keyIndex.get(vs);
        if (id === undefined) {
          const [a, b, c] = vs.split('/');
          const vi = (+a - 1) * 3, ti = b ? (+b - 1) * 2 : -1, ni = c ? (+c - 1) * 3 : -1;
          id = pos.length / 3;
          pos.push(V[vi], V[vi + 1], V[vi + 2]);
          uv.push(ti >= 0 ? VT[ti] : 0, ti >= 0 ? 1 - VT[ti + 1] : 0);
          nrm.push(ni >= 0 ? VN[ni] : 0, ni >= 0 ? VN[ni + 1] : 1, ni >= 0 ? VN[ni + 2] : 0);
          keyIndex.set(vs, id);
        }
        return id;
      });
      for (let k = 1; k + 1 < ids.length; k++) idx.push(ids[0], ids[k], ids[k + 1]);
    }
  }
}
const N = pos.length / 3;
console.log(`parsed ${N} vertices, ${idx.length / 3} triangles`);

/* ---------------- normalise: face +Z, 1.8 m, centred ---------------- */
let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
for (let i = 0; i < N; i++) {
  minY = Math.min(minY, pos[i * 3 + 1]); maxY = Math.max(maxY, pos[i * 3 + 1]);
  minX = Math.min(minX, pos[i * 3]); maxX = Math.max(maxX, pos[i * 3]);
}
const H = maxY - minY;
x0 = (minX + maxX) / 2;
const S = 1.8 / H;
// raw model faces +X with its arms along Z; rotate -90° about Y: x' = -z, z' = x
const raw = new Float32Array(N * 3); // normalised raw (height 1) coordinates for region tests: [xDepth, y, zSide]
for (let i = 0; i < N; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
  raw[i * 3] = (x - x0) / H; raw[i * 3 + 1] = (y - minY) / H; raw[i * 3 + 2] = z / H;
  pos[i * 3] = -z * S; pos[i * 3 + 1] = (y - minY) * S; pos[i * 3 + 2] = (x - x0) * S;
  nrm[i * 3] = -nz; nrm[i * 3 + 1] = ny; nrm[i * 3 + 2] = nx;
}

/* ---------------- skeleton (landmarks in raw units: y up, z = side, positive z = his RIGHT) ---------------- */
// measured from the mesh cross-sections (A-pose)
const LM = {
  hips: [0.5, 0], spine: [0.58, 0], spine1: [0.66, 0], spine2: [0.74, 0], neck: [0.84, 0], head: [0.875, 0], headTop: [1.0, 0],
  shoulder: [0.8, 0.05], arm: [0.79, 0.12], fore: [0.672, 0.208], hand: [0.563, 0.289],
  mid1: [0.535, 0.31], mid2: [0.512, 0.327], mid3: [0.496, 0.339], mid4: [0.483, 0.349],
  upLeg: [0.49, 0.055], leg: [0.27, 0.06], foot: [0.045, 0.06], toe: [0.01, 0.06],
};
const toFinal = ([y, z], depth = 0) => [-z * 1.8, y * 1.8, depth * 1.8]; // raw (y, side) → final [x, y, z]
const bones = []; // { name, parent, world:[x,y,z] }
const add = (name, parent, world) => { bones.push({ name: `mixamorig:${name}`, parent, world }); return bones.length - 1; };
const hips = add('Hips', -1, toFinal(LM.hips));
const spine = add('Spine', hips, toFinal(LM.spine));
const spine1 = add('Spine1', spine, toFinal(LM.spine1));
const spine2 = add('Spine2', spine1, toFinal(LM.spine2));
const neck = add('Neck', spine2, toFinal(LM.neck));
const head = add('Head', neck, toFinal(LM.head, 0.005));
add('HeadTop_End', head, toFinal(LM.headTop, 0.005));
const sides = {};
for (const [Side, s] of [['Right', 1], ['Left', -1]]) {
  const m = ([y, z]) => [y, z * s];
  const sh = add(`${Side}Shoulder`, spine2, toFinal(m(LM.shoulder)));
  const arm = add(`${Side}Arm`, sh, toFinal(m(LM.arm)));
  const fore = add(`${Side}ForeArm`, arm, toFinal(m(LM.fore)));
  const hand = add(`${Side}Hand`, fore, toFinal(m(LM.hand)));
  const f1 = add(`${Side}HandMiddle1`, hand, toFinal(m(LM.mid1)));
  const f2 = add(`${Side}HandMiddle2`, f1, toFinal(m(LM.mid2)));
  const f3 = add(`${Side}HandMiddle3`, f2, toFinal(m(LM.mid3)));
  add(`${Side}HandMiddle4`, f3, toFinal(m(LM.mid4)));
  const up = add(`${Side}UpLeg`, hips, toFinal(m(LM.upLeg)));
  const leg = add(`${Side}Leg`, up, toFinal(m(LM.leg)));
  const foot = add(`${Side}Foot`, leg, toFinal(m(LM.foot)));
  add(`${Side}ToeBase`, foot, [toFinal(m(LM.toe))[0], toFinal(m(LM.toe))[1], 0.1]);
  sides[s] = { sh, arm, fore, hand, f1, f2, f3, up, leg, foot };
}

/* ---------------- skin weights ---------------- */
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const joints = new Uint8Array(N * 4);
const weights = new Uint8Array(N * 4);
const armLine = (() => {
  const [ys, zs] = LM.arm, [yt, zt] = LM.mid4;
  const dy = yt - ys, dz = zt - zs, L = Math.hypot(dy, dz);
  const tAt = ([y, z]) => ((y - ys) * dy + (z - zs) * dz) / (L * L);
  return { ys, zs, dy, dz, L, tElbow: tAt(LM.fore), tWrist: tAt(LM.hand), tM1: tAt(LM.mid1), tM2: tAt(LM.mid2), tM3: tAt(LM.mid3) };
})();

for (let i = 0; i < N; i++) {
  const x = raw[i * 3], y = raw[i * 3 + 1], z = raw[i * 3 + 2];
  const s = z >= 0 ? 1 : -1;
  const az = Math.abs(z);
  const w = new Map();
  const put = (b, v) => { if (v > 1e-4) w.set(b, (w.get(b) || 0) + v); };
  const side = sides[s];

  // torso chain by height
  const torso = (k) => {
    if (y > 0.905) { put(head, k); return; }
    const r = Math.hypot(x, z);
    if (y > 0.8) {
      // tall collar stays with the neck/chest; the face and hair go with the head
      const collar = y < 0.905 && r > 0.066 ? 1 : 0;
      const toHead = smooth(0.85, 0.885, y) * (1 - collar);
      put(head, k * toHead);
      put(neck, k * (1 - toHead) * smooth(0.78, 0.84, y));
      put(spine2, k * (1 - toHead) * (1 - smooth(0.78, 0.84, y)));
      return;
    }
    const chain = [[0.5, hips], [0.58, spine], [0.66, spine1], [0.74, spine2]];
    if (y <= chain[0][0]) { put(hips, k); return; }
    for (let c = 0; c < chain.length - 1; c++) {
      const [ya, ba] = chain[c], [yb, bb] = chain[c + 1];
      if (y <= yb) { const t = (y - ya) / (yb - ya); put(ba, k * (1 - t)); put(bb, k * t); return; }
    }
    put(spine2, k);
  };

  if (y < 0.19) {
    // below the cloak hem: legs and sandals
    const legW = 1 - smooth(0.15, 0.19, y);
    const footW = 1 - smooth(0.05, 0.09, y);
    put(side.foot, legW * footW);
    put(side.leg, legW * (1 - footW));
    put(hips, 1 - legW);
  } else {
    // sleeves and hands: outside the torso silhouette between hip and shoulder height
    const half = y > 0.76 ? 0.11 : 0.125;
    const inArmBand = smooth(0.43, 0.47, y) * (1 - smooth(0.83, 0.86, y));
    const a = smooth(half - 0.015, half + 0.025, az) * inArmBand;
    if (a > 0) {
      const t = ((y - armLine.ys) * armLine.dy + (az - armLine.zs) * armLine.dz) / (armLine.L * armLine.L);
      const seg = [
        [side.arm, -1, armLine.tElbow], [side.fore, armLine.tElbow, armLine.tWrist], [side.hand, armLine.tWrist, armLine.tM1],
        [side.f1, armLine.tM1, armLine.tM2], [side.f2, armLine.tM2, armLine.tM3], [side.f3, armLine.tM3, 9],
      ];
      const blend = 0.035;
      for (const [b, t0, t1] of seg) {
        const v = smooth(t0 - blend, t0 + blend, t) * (1 - smooth(t1 - blend, t1 + blend, t));
        put(b, a * v);
      }
      // the shoulder cap blends into the chest
      const cap = 1 - smooth(0.0, 0.12, t);
      if (cap > 0) { const k = a * cap * 0.5; w.set(side.arm, (w.get(side.arm) || 0) - k); put(spine2, k); }
    }
    torso(1 - a);
  }

  // keep the 4 strongest influences, normalise to bytes
  const top = [...w.entries()].filter(([, v]) => v > 0).sort((p, q) => q[1] - p[1]).slice(0, 4);
  const sum = top.reduce((acc, [, v]) => acc + v, 0) || 1;
  let bytes = top.map(([, v]) => Math.round((v / sum) * 255));
  const diff = 255 - bytes.reduce((acc, v) => acc + v, 0);
  if (bytes.length) bytes[0] += diff;
  else { top.push([hips, 1]); bytes = [255]; }
  for (let k = 0; k < 4; k++) {
    joints[i * 4 + k] = top[k] ? top[k][0] : 0;
    weights[i * 4 + k] = top[k] ? bytes[k] : 0;
  }
}

/* ---------------- write GLB ---------------- */
const chunks = [];
let offset = 0;
const bufferViews = [], accessors = [];
const pushView = (buf, target) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.byteLength, ...(target ? { target } : {}) });
  chunks.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
  offset += buf.byteLength;
  return bufferViews.length - 1;
};
const minmax = (arr, n) => {
  const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity);
  for (let i = 0; i < arr.length; i += n) for (let k = 0; k < n; k++) { mn[k] = Math.min(mn[k], arr[i + k]); mx[k] = Math.max(mx[k], arr[i + k]); }
  return { min: mn, max: mx };
};
const acc = (view, componentType, count, type, extra = {}) => { accessors.push({ bufferView: view, componentType, count, type, ...extra }); return accessors.length - 1; };

const P = new Float32Array(pos), NR = new Float32Array(nrm), UV = new Float32Array(uv), I = new Uint32Array(idx);
const aPos = acc(pushView(P, 34962), 5126, N, 'VEC3', minmax(P, 3));
const aNrm = acc(pushView(NR, 34962), 5126, N, 'VEC3');
const aUv = acc(pushView(UV, 34962), 5126, N, 'VEC2');
const aJ = acc(pushView(joints, 34962), 5121, N, 'VEC4');
const aW = acc(pushView(weights, 34962), 5121, N, 'VEC4', { normalized: true });
const aI = acc(pushView(I, 34963), 5125, I.length, 'SCALAR');
// inverse bind matrices: bones are unrotated in bind pose, so each is a pure translation by −world
const ibm = new Float32Array(bones.length * 16);
bones.forEach((b, k) => { const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.world[0], -b.world[1], -b.world[2], 1]; ibm.set(m, k * 16); });
const aIbm = acc(pushView(ibm), 5126, bones.length, 'MAT4');
const img = fs.readFileSync(texPath);
const imgView = pushView(new Uint8Array(img.buffer, img.byteOffset, img.byteLength));

const nodes = bones.map((b) => {
  const p = b.parent >= 0 ? bones[b.parent].world : [0, 0, 0];
  return { name: b.name, translation: [b.world[0] - p[0], b.world[1] - p[1], b.world[2] - p[2]] };
});
bones.forEach((b, k) => { if (b.parent >= 0) (nodes[b.parent].children ||= []).push(k); });
const meshNode = nodes.length;
nodes.push({ name: 'Itachi', mesh: 0, skin: 0 });
const rootNode = nodes.length;
nodes.push({ name: 'ItachiRoot', children: [hips, meshNode] });

const gltf = {
  asset: { version: '2.0', generator: 'rig-itachi.mjs' },
  scene: 0,
  scenes: [{ nodes: [rootNode] }],
  nodes,
  skins: [{ joints: bones.map((_, k) => k), inverseBindMatrices: aIbm, skeleton: hips }],
  meshes: [{ name: 'Itachi', primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv, JOINTS_0: aJ, WEIGHTS_0: aW }, indices: aI, material: 0 }] }],
  materials: [{ name: 'Itachi', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.9 } }],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  images: [{ bufferView: imgView, mimeType: 'image/jpeg' }],
  buffers: [{ byteLength: offset }],
  bufferViews,
  accessors,
};

let json = Buffer.from(JSON.stringify(gltf), 'utf8');
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
let bin = Buffer.concat(chunks);
bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.concat([header, jh, json, bh, bin]));
console.log(`wrote ${outPath} — ${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB, ${bones.length} bones`);
