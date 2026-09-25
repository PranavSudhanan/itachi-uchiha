#!/usr/bin/env node
/*
 * Lightens a GLB of plain indexed meshes (no dependencies):
 *   node tools/optimize-glb.mjs <in.glb> <out.glb> [factor]
 *
 * For each mesh: vertices are clustered on a grid `factor` times the mesh's median edge length (default 2),
 * each cluster collapsing to its mean position; triangles that collapse or repeat are dropped; smooth
 * normals are computed and stored as normalized bytes (KHR_mesh_quantization), so the loader no longer
 * has to compute them. Node names, transforms and mesh names are kept.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [inFile, outFile, fArg] = process.argv.slice(2);
if (!inFile || !outFile) { console.error('usage: optimize-glb.mjs <in.glb> <out.glb> [factor]'); process.exit(1); }
const FACTOR = +fArg || 2;

const src = readFileSync(inFile);
const jsonLen = src.readUInt32LE(12);
const json = JSON.parse(src.subarray(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8;
const bin = src.subarray(binStart);

const read = (accIdx) => {
  const a = json.accessors[accIdx], v = json.bufferViews[a.bufferView];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0);
  const comps = { SCALAR: 1, VEC3: 3 }[a.type];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
  const bytes = bin.subarray(off, off + a.count * comps * T.BYTES_PER_ELEMENT);
  return new T(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

function simplify(pos, idx) {
  // grid size from the median edge length
  const edges = [];
  for (let t = 0; t < idx.length; t += 3 * Math.max(1, Math.floor(idx.length / 3 / 4000))) {
    const a = idx[t] * 3, b = idx[t + 1] * 3;
    edges.push(Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]));
  }
  edges.sort((x, y) => x - y);
  const cell = edges[edges.length >> 1] * FACTOR;
  const n = pos.length / 3;
  const key = new Map(), remap = new Int32Array(n), sum = [], cnt = [];
  for (let i = 0; i < n; i++) {
    const k = `${Math.floor(pos[i * 3] / cell)},${Math.floor(pos[i * 3 + 1] / cell)},${Math.floor(pos[i * 3 + 2] / cell)}`;
    let c = key.get(k);
    if (c === undefined) { c = cnt.length; key.set(k, c); sum.push(0, 0, 0); cnt.push(0); }
    remap[i] = c;
    sum[c * 3] += pos[i * 3]; sum[c * 3 + 1] += pos[i * 3 + 1]; sum[c * 3 + 2] += pos[i * 3 + 2]; cnt[c]++;
  }
  const P = new Float32Array(cnt.length * 3);
  for (let c = 0; c < cnt.length; c++) for (let a = 0; a < 3; a++) P[c * 3 + a] = sum[c * 3 + a] / cnt[c];
  const seen = new Set(), I = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = remap[idx[t]], b = remap[idx[t + 1]], c = remap[idx[t + 2]];
    if (a === b || b === c || a === c) continue;
    const s = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(s)) continue;
    seen.add(s);
    I.push(a, b, c);
  }
  // drop vertices no triangle uses
  const used = new Int32Array(cnt.length).fill(-1), P2 = [];
  const I2 = I.map((v) => { if (used[v] < 0) { used[v] = P2.length / 3; P2.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } return used[v]; });
  return { pos: new Float32Array(P2), idx: I2 };
}

function normals(pos, idx) {
  const N = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // area-weighted
    for (const v of [a, b, c]) { N[v] += nx; N[v + 1] += ny; N[v + 2] += nz; }
  }
  const Q = new Int8Array(pos.length);
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    for (let a = 0; a < 3; a++) Q[i + a] = Math.round((N[i + a] / l) * 127);
  }
  return Q;
}

// rebuild the binary with the new geometry
const chunks = [];
let offset = 0;
const bufferViews = [], accessors = [];
const pushView = (arr, target, stride) => {
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const pad = (4 - (b.length % 4)) % 4;
  chunks.push(b, Buffer.alloc(pad));
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target, ...(stride ? { byteStride: stride } : {}) });
  offset += b.length + pad;
  return bufferViews.length - 1;
};
let before = 0, after = 0;
for (const m of json.meshes) {
  for (const prim of m.primitives) {
    const pos0 = read(prim.attributes.POSITION), idx0 = read(prim.indices);
    before += idx0.length / 3;
    const { pos, idx } = simplify(pos0, idx0);
    after += idx.length / 3;
    const n = pos.length / 3;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i * 3 + a]); hi[a] = Math.max(hi[a], pos[i * 3 + a]); }
    accessors.push({ bufferView: pushView(pos, 34962), componentType: 5126, count: n, type: 'VEC3', min: lo, max: hi });
    const pa = accessors.length - 1;
    // normals as normalized bytes, padded to 4 bytes per vertex (glTF vertex alignment)
    const q = normals(pos, idx), q4 = new Int8Array(n * 4);
    for (let i = 0; i < n; i++) { q4[i * 4] = q[i * 3]; q4[i * 4 + 1] = q[i * 3 + 1]; q4[i * 4 + 2] = q[i * 3 + 2]; }
    accessors.push({ bufferView: pushView(q4, 34962, 4), componentType: 5120, normalized: true, count: n, type: 'VEC3' });
    const na = accessors.length - 1;
    const wide = n > 65535;
    accessors.push({ bufferView: pushView(wide ? new Uint32Array(idx) : new Uint16Array(idx), 34963), componentType: wide ? 5125 : 5123, count: idx.length, type: 'SCALAR' });
    prim.attributes = { POSITION: pa, NORMAL: na };
    prim.indices = accessors.length - 1;
    console.log(`${(m.name || '').padEnd(12)} ${String(idx0.length / 3).padStart(7)} -> ${String(idx.length / 3).padStart(7)} tris`);
  }
}
const binOut = Buffer.concat(chunks);
json.accessors = accessors;
json.bufferViews = bufferViews;
json.buffers = [{ byteLength: binOut.length }];
json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'KHR_mesh_quantization'])];
json.extensionsRequired = [...new Set([...(json.extensionsRequired || []), 'KHR_mesh_quantization'])];
json.asset.generator = `${json.asset.generator || ''} + optimize-glb.mjs`;
let js = Buffer.from(JSON.stringify(json));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + binOut.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const out = Buffer.concat([header, jh, js, bh, binOut]);
writeFileSync(outFile, out);
console.log(`${before} -> ${after} triangles, ${(src.length / 1048576).toFixed(2)} MB -> ${(out.length / 1048576).toFixed(2)} MB`);
