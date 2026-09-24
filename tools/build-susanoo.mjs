#!/usr/bin/env node
/*
 * Sculpts Itachi's Susanoo and writes it as a GLB (no dependencies).
 *
 *   node tools/build-susanoo.mjs [out.glb]        (default: public/models/susanoo.glb)
 *
 * Every part is modelled as a signed distance field, blended with smooth unions so muscle, bone and armour
 * flow into each other like a sculpt, then meshed with surface nets. Parts are named "<stage>_<part>":
 *   I_ribcage  I.armR  I.armL          spine, vertebrae, ribs, clavicles, scapulae; bone arms with claws
 *   II_skull                           skull with sockets, cheekbones, teeth, jaw; neck vertebrae
 *   III_body   III.head III.armR/L     muscular torso, tengu face; muscled arms with fists
 *   IV_armour  IV.mantle IV.helmet IV.armR/L   lamellar dō, scaled mantle, helmet + tokin + horns; pauldrons, vambraces
 * Arm parts are in arm-local space (relative to the shoulder pivot). Dimensions: src/objects/SusanooShape.js.
 */
import { writeFileSync } from 'node:fs';
import { SHOULDER, ELBOW, HAND, GOURD_OFFSET, FACE, SKULL, SPINE, HEAD_SCALE } from '../src/objects/SusanooShape.js';

/* ------------------------------------------------------------------ */
/* SDF toolkit                                                         */
/* ------------------------------------------------------------------ */

const { hypot, max, min, abs, sqrt, sin, cos, atan2, PI, floor } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const fract = (v) => v - floor(v);

const smin = (a, b, k) => { if (k <= 0) return min(a, b); const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

const sphere = ([cx, cy, cz], r) => (x, y, z) => hypot(x - cx, y - cy, z - cz) - r;
function ellipsoid([cx, cy, cz], [rx, ry, rz]) {
  return (x, y, z) => {
    const px = x - cx, py = y - cy, pz = z - cz;
    const k0 = hypot(px / rx, py / ry, pz / rz), k1 = hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry, rz);
  };
}
/** Capsule a→b whose radius goes from r1 to r2. */
function cone([ax, ay, az], [bx, by, bz], r1, r2 = r1) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz;
  return (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az;
    const h = clamp((px * dx + py * dy + pz * dz) / l2, 0, 1);
    return hypot(px - dx * h, py - dy * h, pz - dz * h) - mix(r1, r2, h);
  };
}
/** Tube along a polyline; radius per point. */
function chain(points, radii, k = 0) {
  const r = Array.isArray(radii) ? radii : points.map(() => radii);
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) segs.push(cone(points[i], points[i + 1], r[i], r[i + 1]));
  return union(segs, k);
}
/** Rounded box with a rotation (rows of `m` = local axes in world space). */
function box([cx, cy, cz], [hx, hy, hz], round = 0, m = null) {
  return (x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    if (m) { const lx = m[0] * px + m[1] * py + m[2] * pz, ly = m[3] * px + m[4] * py + m[5] * pz, lz = m[6] * px + m[7] * py + m[8] * pz; px = lx; py = ly; pz = lz; }
    const qx = abs(px) - hx + round, qy = abs(py) - hy + round, qz = abs(pz) - hz + round;
    return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - round;
  };
}
function union(list, k = 0) {
  return (x, y, z) => { let d = 1e9; for (const f of list) d = k ? smin(d, f(x, y, z), k) : min(d, f(x, y, z)); return d; };
}
const blend = (a, b, k) => (x, y, z) => smin(a(x, y, z), b(x, y, z), k);
const carve = (a, b, k = 0) => (x, y, z) => (k ? smax(a(x, y, z), -b(x, y, z), k) : max(a(x, y, z), -b(x, y, z)));
const intersect = (a, b, k = 0) => (x, y, z) => (k ? smax(a(x, y, z), b(x, y, z), k) : max(a(x, y, z), b(x, y, z)));
const shell = (f, t) => (x, y, z) => abs(f(x, y, z)) - t;
const inflate = (f, t) => (x, y, z) => f(x, y, z) - t;
const halfspace = (nx, ny, nz, d) => (x, y, z) => nx * x + ny * y + nz * z - d; // inside where n·p < d
/** Skips `f` when far outside its bounding box (the box distance is a valid lower bound). */
function bounded(f, [x0, y0, z0], [x1, y1, z1], pad = 0.2) {
  return (x, y, z) => {
    const dx = max(x0 - pad - x, 0, x - x1 - pad), dy = max(y0 - pad - y, 0, y - y1 - pad), dz = max(z0 - pad - z, 0, z - z1 - pad);
    const out = hypot(dx, dy, dz);
    return out > 0 ? out + pad * 0.5 : f(x, y, z);
  };
}
const mirrorX = (f) => (x, y, z) => f(abs(x), y, z);
const translate = (f, [tx, ty, tz]) => (x, y, z) => f(x - tx, y - ty, z - tz);

// small vector helpers for building shapes
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const len = (a) => hypot(a[0], a[1], a[2]);
const norm = (a) => scl(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Orthonormal frame with `f` as the local y axis; returns world→local rows for box(). */
function frame(f, up = [0, 0, 1]) {
  const yv = norm(f);
  let xv = cross(yv, up);
  if (len(xv) < 1e-3) xv = cross(yv, [1, 0, 0]);
  xv = norm(xv);
  const zv = cross(xv, yv);
  return { m: [...xv, ...yv, ...zv], x: xv, y: yv, z: zv };
}

/* ------------------------------------------------------------------ */
/* Surface nets                                                        */
/* ------------------------------------------------------------------ */

function mesh(sdf, [x0, y0, z0], [x1, y1, z1], h) {
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const N = nx * ny * nz;
  const vals = new Float32Array(N);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vals[id(i, j, k)] = sdf(x0 + i * h, y0 + j * h, z0 + k * h);

  const cellVert = new Int32Array(N).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { v[c] = vals[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; if (v[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
      sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
      sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
      n++;
    }
    let px = x0 + (i + sx / n) * h, py = y0 + (j + sy / n) * h, pz = z0 + (k + sz / n) * h;
    // pull the vertex onto the true surface (crisper creases)
    for (let it = 0; it < 2; it++) {
      const d = sdf(px, py, pz), e = h * 0.3;
      let gx = sdf(px + e, py, pz) - sdf(px - e, py, pz), gy = sdf(px, py + e, pz) - sdf(px, py - e, pz), gz = sdf(px, py, pz + e) - sdf(px, py, pz - e);
      const gl = hypot(gx, gy, gz) || 1;
      const step = clamp(d, -h * 0.5, h * 0.5);
      px -= (gx / gl) * step; py -= (gy / gl) * step; pz -= (gz / gl) * step;
    }
    cellVert[id(i, j, k)] = pos.length / 3;
    pos.push(px, py, pz);
  }

  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const P = (q) => [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]];
    // split along the shorter diagonal
    const ac = len(sub(P(a), P(c))), bd = len(sub(P(b), P(d)));
    const tris = ac < bd ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
    for (const t of tris) idx.push(...(flip ? [t[0], t[2], t[1]] : t));
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const inside = vals[id(i, j, k)] < 0;
    if (i < nx - 1 && j > 0 && k > 0 && inside !== (vals[id(i + 1, j, k)] < 0))
      quad(cellVert[id(i, j - 1, k - 1)], cellVert[id(i, j, k - 1)], cellVert[id(i, j, k)], cellVert[id(i, j - 1, k)], !inside);
    if (j < ny - 1 && i > 0 && k > 0 && inside !== (vals[id(i, j + 1, k)] < 0))
      quad(cellVert[id(i - 1, j, k - 1)], cellVert[id(i - 1, j, k)], cellVert[id(i, j, k)], cellVert[id(i, j, k - 1)], !inside);
    if (k < nz - 1 && i > 0 && j > 0 && inside !== (vals[id(i, j, k + 1)] < 0))
      quad(cellVert[id(i - 1, j - 1, k)], cellVert[id(i, j - 1, k)], cellVert[id(i, j, k)], cellVert[id(i - 1, j, k)], !inside);
  }
  return { pos: new Float32Array(pos), idx };
}

/* ------------------------------------------------------------------ */
/* The Susanoo                                                         */
/* ------------------------------------------------------------------ */

const TORSO_Z = -0.45;

/* ---- stage I: the skeleton ---- */

function vertebra([x, y, z], s = 1) {
  return union([
    ellipsoid([x, y, z], [0.2 * s, 0.13 * s, 0.17 * s]),
    cone([x, y, z - 0.08], [x, y - 0.14 * s, z - 0.46 * s], 0.075 * s, 0.03 * s), // spinous process
    cone([x - 0.3 * s, y + 0.02, z - 0.08], [x + 0.3 * s, y + 0.02, z - 0.08], 0.05 * s, 0.05 * s), // transverse
  ], 0.06);
}

function rib(y0, rx, rz, gap, drop, thick) {
  // from the spine at the back, round the side, forward toward the sternum (left and right halves)
  const pts = [];
  const a0 = -PI / 2, a1 = PI / 2 - gap;
  for (let s = -1; s <= 1; s += 2) {
    const half = [];
    for (let k = 0; k <= 14; k++) {
      const u = k / 14;
      const a = mix(a0, a1, u);
      const rr = mix(0.45, 1, clamp(u * 3, 0, 1)); // ribs leave the spine narrow, then swing wide
      half.push([s * cos(a) * rx * rr, y0 - drop * u * u - sin(u * PI) * 0.12, TORSO_Z + sin(a) * rz * mix(0.8, 1, u) - 0.1 * (1 - u)]);
    }
    pts.push(half);
  }
  const radii = Array.from({ length: 15 }, (_, k) => mix(thick * 1.05, thick * 0.7, k / 14));
  return union(pts.flatMap((half) => [chain(half, radii, 0.03), chain(half.map((p) => add(p, [0, 0.09, 0])), radii.map((r) => r * 0.7), 0.03)]), 0.05);
}

function ribcage() {
  const parts = [];
  SPINE.forEach((p, i) => parts.push(bounded(vertebra(p, 1 - i * 0.02), sub(p, [0.5, 0.4, 0.7]), add(p, [0.5, 0.4, 0.3]))));
  parts.push(chain(SPINE, 0.07));
  // seven ribs, sloping down toward the front, sized to sit just inside the muscled torso of stage III
  const bodyHalf = (y) => {
    const t = (y - 4.1) / 1.5, a = (y - 2.55) / 1.3;
    const w = max(t * t < 1 ? 2.2 * sqrt(1 - t * t) : 0, a * a < 1 ? 1.3 * sqrt(1 - a * a) : 0);
    const d = max(t * t < 1 ? 1.32 * sqrt(1 - t * t) : 0, a * a < 1 ? 1.05 * sqrt(1 - a * a) : 0);
    return [w, d];
  };
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    const y0 = mix(5.0, 2.0, u);
    const [bw, bd] = bodyHalf(y0 - 0.25);
    const rx = max(1.25, bw - 0.3);
    const rz = max(1.0, bd - 0.12);
    parts.push(bounded(rib(y0, rx, rz, mix(0.35, 0.75, u), 0.45, mix(0.1, 0.085, u)), [-rx - 0.3, y0 - 0.9, TORSO_Z - rz - 0.4], [rx + 0.3, y0 + 0.4, TORSO_Z + rz + 0.3]));
  }
  // clavicles and scapulae
  for (const s of [-1, 1]) {
    parts.push(chain([[s * 0.28, 5.3, 0.55], [s * 0.9, 5.4, 0.45], [s * 1.6, 5.3, 0.0], [s * 2.25, 5.15, -0.45]], [0.13, 0.12, 0.12, 0.15], 0.05));
    parts.push(carve(ellipsoid([s * 1.25, 4.35, -1.45], [0.85, 1.05, 0.14]), ellipsoid([s * 1.25, 4.1, -1.3], [0.55, 0.65, 0.1]), 0.04));
    parts.push(cone([s * 0.6, 5.05, -1.58], [s * 2.0, 4.9, -1.2], 0.08, 0.06)); // scapular spine
  }
  // sternum top (manubrium) where the clavicles meet
  parts.push(ellipsoid([0, 5.2, 0.62], [0.28, 0.25, 0.1]));
  return union(parts, 0.08);
}

function boneArm(side) {
  const S = [0, 0, 0], E = ELBOW[side], H = HAND[side];
  const f = norm(sub(H, E));
  const parts = [
    sphere(S, 0.3), // humeral head
    cone(S, E, 0.17, 0.13),
    ellipsoid(E, [0.26, 0.2, 0.22]), // condyles
  ];
  const off = norm(cross(f, [0, 1, 0]));
  parts.push(cone(add(E, scl(off, 0.1)), add(H, scl(off, 0.1)), 0.1, 0.08), cone(add(E, scl(off, -0.1)), add(H, scl(off, -0.08)), 0.09, 0.07));
  parts.push(ellipsoid(H, [0.22, 0.17, 0.2]));
  // four jointed claws curling forward and up, and a thumb
  const fr = frame(f);
  for (let k = 0; k < 4; k++) {
    const spread = (k - 1.5) * 0.17;
    const base = add(add(H, scl(fr.x, spread)), scl(f, 0.15));
    const p1 = add(add(base, scl(f, 0.45)), scl(fr.x, spread * 0.3));
    const p2 = add(add(p1, scl(f, 0.35)), [0, 0.18, 0]);
    const p3 = add(add(p2, scl(f, 0.22)), [0, 0.25, 0]);
    parts.push(chain([base, p1, p2, p3], [0.07, 0.06, 0.05, 0.015], 0.04));
    for (const j of [p1, p2]) parts.push(sphere(j, 0.075));
  }
  const tb = add(H, scl(fr.x, -0.25 * (side === 'r' ? -1 : 1)));
  parts.push(chain([tb, add(add(tb, scl(f, 0.3)), [0, 0.2, 0]), add(add(tb, scl(f, 0.5)), [0, 0.4, 0])], [0.07, 0.05, 0.015], 0.04));
  return union(parts, 0.06);
}

/* ---- stage II: the skull ---- */

function skull() {
  const [cx, cy, cz] = SKULL;
  const P = (x, y, z) => [cx + x, cy + y, cz + z];
  let s = union([
    ellipsoid(P(0, 0.2, -0.05), [0.82, 0.88, 0.98]),
    ellipsoid(P(0, -0.3, 0.45), [0.55, 0.42, 0.48]), // maxilla
    ellipsoid(P(-0.55, -0.12, 0.52), [0.26, 0.2, 0.26]),
    ellipsoid(P(0.55, -0.12, 0.52), [0.26, 0.2, 0.26]),
    cone(P(-0.55, 0.14, 0.78), P(0.55, 0.14, 0.78), 0.13), // brow ridge
  ], 0.18);
  // sockets, nasal cavity, temporal hollows
  s = carve(s, union([ellipsoid(P(-0.3, 0.0, 0.88), [0.21, 0.19, 0.25]), ellipsoid(P(0.3, 0.0, 0.88), [0.21, 0.19, 0.25])]), 0.06);
  s = carve(s, ellipsoid(P(0, -0.3, 0.95), [0.1, 0.16, 0.2]), 0.04);
  s = carve(s, union([ellipsoid(P(-0.85, 0.05, 0.25), [0.12, 0.3, 0.3]), ellipsoid(P(0.85, 0.05, 0.25), [0.12, 0.3, 0.3])]), 0.1);
  // teeth along the upper jaw
  const teeth = [];
  for (let k = 0; k < 10; k++) {
    const a = mix(-1.0, 1.0, k / 9);
    const tx = sin(a) * 0.42, tz = 0.4 + cos(a) * 0.42;
    teeth.push(box(P(tx, -0.66, tz), [0.055, 0.1, 0.05], 0.03));
  }
  // lower jaw, slightly open
  const jawPts = [];
  for (let k = 0; k <= 12; k++) { const a = mix(-1.35, 1.35, k / 12); jawPts.push(P(sin(a) * 0.55, -0.95 + (abs(a) > 1.1 ? (abs(a) - 1.1) * 1.5 : 0), 0.3 + cos(a) * 0.55)); }
  const jaw = union([chain(jawPts, 0.09, 0.05), ...[-1, 1].map((sd) => cone(P(sd * 0.6, -0.55, -0.15), P(sd * 0.63, -0.95, 0.12), 0.09, 0.08))], 0.05);
  const lowerTeeth = [];
  for (let k = 0; k < 8; k++) { const a = mix(-0.9, 0.9, k / 7); lowerTeeth.push(box(P(sin(a) * 0.46, -0.84, 0.32 + cos(a) * 0.46), [0.045, 0.08, 0.045], 0.025)); }
  // neck vertebrae down to the spine
  const neck = [];
  for (let k = 0; k < 4; k++) neck.push(vertebra([0, cy - 0.95 - k * 0.22, -0.62 - k * 0.12], 0.75));
  return union([s, union(teeth, 0.02), jaw, union(lowerTeeth, 0.02), ...neck], 0.04);
}

/* ---- stage III: the muscled body and the tengu face ---- */

function torso() {
  const z0 = TORSO_Z;
  const core = union([
    ellipsoid([0, 4.1, z0], [2.2, 1.5, 1.32]), // thorax: broad
    ellipsoid([0, 2.55, z0 + 0.05], [1.3, 1.3, 1.05]), // abdomen: narrower waist
    cone([0, 1.9, z0], [0, 0.35, z0], 1.2, 1.55), // flaring down into flame
  ], 0.55);
  const muscles = [];
  for (const s of [-1, 1]) {
    muscles.push(ellipsoid([s * 0.92, 4.38, z0 + 1.12], [1.0, 0.64, 0.44])); // pectorals
    muscles.push(ellipsoid([s * 1.6, 3.75, z0 - 0.15], [0.6, 1.25, 0.75])); // lats: the V
    muscles.push(ellipsoid([s * 1.45, 3.2, z0 + 0.62], [0.28, 0.75, 0.35])); // serratus
    muscles.push(ellipsoid([s * 0.95, 2.35, z0 + 0.72], [0.35, 0.8, 0.35])); // obliques
    muscles.push(cone([0, 5.95, z0 - 0.3], [s * 2.25, 5.2, z0 - 0.15], 0.66, 0.46)); // trapezius
    muscles.push(cone([s * 0.45, 6.4, z0 + 0.05], [s * 0.14, 5.4, z0 + 1.0], 0.18, 0.16)); // neck tendons
    for (let r = 0; r < 3; r++) muscles.push(ellipsoid([s * 0.36, 3.42 - r * 0.58, z0 + 1.02 - r * 0.04], [0.32, 0.25, 0.2])); // abs
  }
  muscles.push(cone([0, 5.1, z0], [0, 6.3, z0 + 0.12], 0.9, 0.62)); // neck
  let body = blend(core, union(muscles, 0.12), 0.22);
  // the groove between the pectorals and the linea alba
  body = carve(body, box([0, 3.6, z0 + 1.3], [0.035, 1.6, 0.4], 0.03), 0.08);
  // the line under the pectorals
  for (const sd of [-1, 1]) body = carve(body, cone([sd * 0.2, 3.8, z0 + 1.5], [sd * 1.6, 3.95, z0 + 1.0], 0.04), 0.06);
  return body;
}

function head() {
  const [cx, cy, cz] = FACE;
  const S = HEAD_SCALE;
  const d = headShape();
  // scaled about the face centre
  return (x, y, z) => d(cx + (x - cx) / S, cy + (y - cy) / S, cz + (z - cz) / S) * S;
}
function headShape() {
  const [cx, cy, cz] = FACE;
  const P = (x, y, z) => [cx + x, cy + y, cz + z];
  let hd = union([
    ellipsoid(P(0, 0.2, -0.08), [0.84, 0.98, 0.98]), // cranium
    ellipsoid(P(0, -0.45, 0.25), [0.6, 0.5, 0.62]), // jaw
    ellipsoid(P(0, -0.86, 0.5), [0.26, 0.2, 0.22]), // chin, narrow and strong
    ellipsoid(P(-0.52, -0.08, 0.6), [0.26, 0.2, 0.24]), // cheekbones
    ellipsoid(P(0.52, -0.08, 0.6), [0.26, 0.2, 0.24]),
    // a heavy brow, lowered in the middle: a fierce, focused glare
    cone(P(0, 0.16, 0.95), P(-0.62, 0.36, 0.74), 0.15, 0.11),
    cone(P(0, 0.16, 0.95), P(0.62, 0.36, 0.74), 0.15, 0.11),
    // the long tengu nose, straight and pointed
    cone(P(0, 0.1, 0.95), P(0, -0.22, 2.25), 0.17, 0.035),
  ], 0.13);
  // hollow cheeks under the cheekbones
  for (const s of [-1, 1]) hd = carve(hd, ellipsoid(P(s * 0.5, -0.45, 0.72), [0.18, 0.22, 0.15]), 0.08);
  // almond eye openings under the brow (the eyeballs sit behind them), and a hard, straight mouth
  hd = carve(hd, union([
    ellipsoid(P(-0.34, 0.05, 0.95), [0.2, 0.1, 0.26]),
    ellipsoid(P(0.34, 0.05, 0.95), [0.2, 0.1, 0.26]),
    box(P(0, -0.58, 0.86), [0.3, 0.03, 0.25], 0.025),
  ]), 0.03);
  // long hair of chakra flame: locks flowing back from the crown and falling over the shoulders
  const locks = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 10 - 0.5) * 2.6;
    const sx = Math.sin(a), cz2 = Math.cos(a);
    const spread = 1 + Math.abs(sx) * 0.5;
    locks.push(chain([
      P(sx * 0.6, 0.7, -0.1 * cz2),
      P(sx * 0.85 * spread, 0.85, -0.7),
      P(sx * 1.0 * spread, 0.45, -1.3),
      P(sx * 1.1 * spread, -0.35, -1.6),
      P(sx * 1.15 * spread, -1.2, -1.55),
    ], [0.26, 0.24, 0.18, 0.1, 0.02], 0.1));
  }
  // swept-back hairline over the brow
  locks.push(chain([P(0, 0.75, 0.55), P(0, 1.05, -0.1), P(0, 0.95, -0.9)], [0.2, 0.22, 0.12], 0.08));
  hd = blend(hd, union(locks, 0.12), 0.2);
  return hd;
}

/** A clenched fist, oriented by the forearm; `hole` (a vertical axis point) leaves room for a gripped haft. */
function fist(E, H, side, scale = 1, hole = null) {
  const f = norm(sub(H, E));
  const fr = frame(f, [0, 1, 0]);
  const out = side === 'r' ? -1 : 1;
  const parts = [
    box(add(H, scl(f, 0.12 * scale)), [0.36 * scale, 0.32 * scale, 0.26 * scale], 0.16 * scale, fr.m),
  ];
  // knuckle row and curled fingers wrapping under
  for (let k = 0; k < 4; k++) {
    const o = add(add(H, scl(f, 0.42 * scale)), scl(fr.x, (k - 1.5) * 0.16 * scale));
    parts.push(sphere(o, 0.1 * scale));
    parts.push(cone(o, add(add(o, scl(fr.z, -0.2 * scale)), scl(f, -0.12 * scale)), 0.095 * scale, 0.085 * scale));
  }
  // thumb across the front
  const tb = add(add(H, scl(fr.x, out * 0.3 * scale)), scl(fr.z, 0.1 * scale));
  parts.push(cone(tb, add(add(tb, scl(fr.x, -out * 0.35 * scale)), scl(f, 0.3 * scale)), 0.11 * scale, 0.09 * scale));
  let d = union(parts, 0.08 * scale);
  if (hole) d = carve(d, cone(add(hole, [0, -2, 0]), add(hole, [0, 2, 0]), 0.2), 0.03);
  return d;
}

function fleshArm(side) {
  const S = [0, 0, 0], E = ELBOW[side], H = HAND[side];
  const s = side === 'r' ? -1 : 1;
  const u = norm(sub(E, S)), f = norm(sub(H, E));
  // the biceps faces the inside of the elbow bend
  const fwd = norm(sub(f, scl(u, f[0] * u[0] + f[1] * u[1] + f[2] * u[2])));
  const parts = [
    ellipsoid([s * 0.32, 0.1, 0], [0.86, 0.74, 0.84]), // deltoid
    cone(S, E, 0.66, 0.5),
    cone(add(lerp3(S, E, 0.3), scl(fwd, 0.24)), add(lerp3(S, E, 0.75), scl(fwd, 0.22)), 0.5, 0.38), // biceps
    cone(add(lerp3(S, E, 0.25), scl(fwd, -0.28)), add(lerp3(S, E, 0.8), scl(fwd, -0.22)), 0.48, 0.34), // triceps
    ellipsoid(E, [0.48, 0.44, 0.48]),
    cone(E, H, 0.52, 0.34),
    cone(add(lerp3(E, H, 0.08), [0, 0.14, 0]), lerp3(E, H, 0.55), 0.48, 0.36), // forearm bulk
    cone(add(lerp3(E, H, 0.1), [0, -0.12, 0]), lerp3(E, H, 0.6), 0.36, 0.28), // flexors
  ];
  const hole = side === 'r' ? add(H, GOURD_OFFSET) : null;
  return blend(union(parts, 0.25), fist(E, H, side, 1.3, hole), 0.15);
}

/* ---- stage IV: armour ---- */

/** Overlapping lames: each row of plates bulges outward toward its lower edge. */
const lames = (f, y0, height, depth) => (x, y, z) => f(x, y, z) - fract((y0 - y) / height) * depth;

function dou() {
  const z0 = TORSO_Z;
  // shaped over the chest muscles, like a muscle cuirass
  const base = blend(union([
    ellipsoid([0, 4.05, z0], [2.05, 1.5, 1.32]),
    ellipsoid([0, 2.55, z0 + 0.05], [1.5, 1.35, 1.12]),
    cone([0, 1.9, z0], [0, 0.8, z0], 1.35, 1.6),
  ], 0.55), union([-1, 1].map((sd) => ellipsoid([sd * 0.9, 4.35, z0 + 1.12], [0.95, 0.62, 0.42]))), 0.35);
  const outer = inflate(base, 0.3);
  // solid plates (only the outer surface is ever drawn): a smooth breastplate with a centre ridge,
  // and a lamellar skirt of overlapping rows below it
  let upper = intersect(outer, halfspace(0, -1, 0, -3.3));
  upper = blend(upper, intersect(cone([0, 3.35, z0 + 1.55], [0, 5.3, z0 + 1.35], 0.07), inflate(base, 0.42)), 0.08);
  const lower = intersect(lames(outer, 3.35, 0.4, 0.09), intersect(halfspace(0, 1, 0, 3.42), halfspace(0, -1, 0, -0.9)));
  // gorget up the neck line
  const collar = intersect(shell(cone([0, 5.1, z0 - 0.05], [0, 6.0, z0 + 0.05], 1.05, 0.8), 0.06), halfspace(0, -1, 0, -5.15));
  return intersect(union([upper, lower, collar]), halfspace(0, 1, 0, 5.8));
}

/** Solid of revolution around a vertical axis at (0, *, zc): radius R(y), depth squashed by `dz`. */
function lathe(R, zc, dz = 1) {
  return (x, y, z) => {
    const r = hypot(x, (z - zc) / dz);
    const e = 0.02;
    const slope = (R(y + e) - R(y - e)) / (2 * e);
    return (r - R(y)) / sqrt(1 + slope * slope);
  };
}

function mantle() {
  // a cloak draped from the neck over the shoulders, falling and flaring to a jagged hem,
  // covered in large feather-like plates that overlap downward
  const z0 = TORSO_Z - 0.3;
  const prof = [[6.35, 0.95], [6.0, 1.6], [5.55, 2.45], [5.1, 2.7], [4.0, 2.85], [2.5, 3.05], [0.6, 3.45]];
  const R = (y) => {
    if (y >= prof[0][0]) return prof[0][1];
    for (let i = 0; i < prof.length - 1; i++) {
      const [y0, r0] = prof[i], [y1, r1] = prof[i + 1];
      if (y <= y0 && y >= y1) { const t = (y0 - y) / (y0 - y1); return mix(r0, r1, t * t * (3 - 2 * t)); }
    }
    return prof[prof.length - 1][1];
  };
  const cloak = lathe(R, z0, 0.82);
  const ROW = 0.52;
  const plates = (x, y, z) => {
    const a = atan2(x, -(z - z0));
    const row = floor((6.2 - y) / ROW);
    const u = fract((6.2 - y) / ROW);
    const col = fract(a * 2.6 + (row % 2) * 0.5);
    // each plate thickens toward its rounded lower tip
    return cloak(x, y, z) - 0.14 * Math.pow(u, 1.5) * (0.3 + 0.7 * sin(col * PI));
  };
  let m = shell(plates, 0.05);
  const ang = (x, z) => atan2(x, z - z0); // 0 = straight ahead
  // open down the front, wider toward the hem
  m = intersect(m, (x, y, z) => 0.9 + (6.2 - y) * 0.09 - abs(ang(x, z)));
  m = intersect(m, halfspace(0, 1, 0, 6.4));
  // jagged hem following the plate tips
  m = intersect(m, (x, y, z) => 0.5 + abs(sin(ang(x, z) * 2.6 * PI)) * 0.45 - y);
  return m;
}

function helmet() {
  const [cx, cy, cz] = FACE;
  const P = (x, y, z) => [cx + x, cy + y, cz + z];
  // a shell over the crown and back of the head, open at the face
  let hm = intersect(shell(ellipsoid(P(0, 0.22, -0.1), [1.08, 1.12, 1.15]), 0.06), (x, y, z) => (z - cz) - 0.45 - max(0, 0.35 - (y - cy)) * 0.9);
  hm = intersect(hm, halfspace(0, -1, 0, -(cy - 0.35)));
  hm = lames(hm, cy + 1.4, 0.32, 0.05);
  // the yamabushi tokin: a small pleated cap on the forehead
  const tokin = box(P(0, 1.02, 0.42), [0.28, 0.2, 0.26], 0.12, frame([0, cos(0.45), sin(0.45)], [0, 0, 1]).m);
  // two horns sweeping back
  const horns = [-1, 1].map((s) => chain([P(s * 0.55, 0.85, 0.05), P(s * 0.95, 1.35, -0.35), P(s * 1.15, 1.7, -1.0), P(s * 1.1, 1.85, -1.55)], [0.16, 0.12, 0.07, 0.02], 0.05));
  return union([hm, tokin, ...horns], 0.06);
}

function armourArm(side) {
  const E = ELBOW[side], H = HAND[side];
  const s = side === 'r' ? -1 : 1;
  // sode: a curved shield of hanging lames down the outside of the upper arm
  const sleeve = cone([s * 0.35, 0.55, 0.05], [s * 0.8, -1.35, 0.35], 0.92, 1.02);
  const sode = intersect(
    intersect(shell(lames(sleeve, 0.62, 0.34, 0.08), 0.05), (x, y, z) => 0.12 - y * 0.32 - s * x),
    intersect(halfspace(0, 1, 0, 0.62), halfspace(0, -1, 0, 1.45)),
  );
  // a small domed cap over the shoulder
  const cap = intersect(shell(ellipsoid([s * 0.3, 0.3, 0], [0.88, 0.62, 0.88]), 0.05), halfspace(0, -1, 0, -0.28));
  // vambrace around the forearm with raised rims
  const f = norm(sub(H, E)), L = len(sub(H, E));
  const fore = cone(lerp3(E, H, 0.12), lerp3(E, H, 0.82), 0.58, 0.46);
  const along = (x, y, z) => (x - E[0]) * f[0] + (y - E[1]) * f[1] + (z - E[2]) * f[2];
  const vambrace = intersect(shell(fore, 0.05), (x, y, z) => { const t = along(x, y, z); return max(0.12 * L - t, t - 0.82 * L); });
  const rims = union([0.15, 0.8].map((t) => { const c = lerp3(E, H, t); return cone(add(c, scl(f, -0.04)), add(c, scl(f, 0.04)), mix(0.64, 0.52, t)); }));
  return union([sode, cap, vambrace, intersect(rims, (x, y, z) => 0.06 - fore(x, y, z))], 0.04);
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

const armBox = (side, pad = 0.9) => {
  const pts = [[0, 0, 0], ELBOW[side], HAND[side]];
  const lo = [0, 1, 2].map((a) => min(...pts.map((p) => p[a])) - pad);
  const hi = [0, 1, 2].map((a) => max(...pts.map((p) => p[a])) + pad);
  return [lo, hi];
};

const PARTS = [
  { name: 'I_ribcage', sdf: ribcage, box: [[-2.9, 0.5, -2.2], [2.9, 5.9, 1.2]], h: 0.07 },
  { name: 'I_armR', sdf: () => boneArm('r'), box: armBox('r', 0.7), h: 0.05 },
  { name: 'I_armL', sdf: () => boneArm('l'), box: armBox('l', 0.7), h: 0.05 },
  { name: 'II_skull', sdf: skull, box: [[-1.1, 5.1, -1.6], [1.1, 7.7, 1.4]], h: 0.045 },
  { name: 'III_body', sdf: torso, box: [[-2.8, 0.2, -2.1], [2.8, 6.5, 1.9]], h: 0.075 },
  { name: 'III_head', sdf: head, box: [[-2.2, 4.8, -2.8], [2.2, 8.2, 3.0]], h: 0.045 },
  { name: 'III_armR', sdf: () => fleshArm('r'), box: armBox('r', 1.0), h: 0.06 },
  { name: 'III_armL', sdf: () => fleshArm('l'), box: armBox('l', 1.0), h: 0.06 },
  { name: 'IV_armour', sdf: dou, box: [[-2.7, 0.6, -2.2], [2.7, 6.2, 1.8]], h: 0.07 },
  { name: 'IV_mantle', sdf: mantle, box: [[-4.2, 0.2, -4.8], [4.2, 6.3, 1.8]], h: 0.07 },
  { name: 'IV_helmet', sdf: helmet, box: [[-1.6, 5.8, -2.2], [1.6, 8.8, 1.5]], h: 0.05 },
  { name: 'IV_armR', sdf: () => armourArm('r'), box: armBox('r', 1.3), h: 0.065 },
  { name: 'IV_armL', sdf: () => armourArm('l'), box: armBox('l', 1.3), h: 0.065 },
];

function writeGLB(meshes, file) {
  const chunks = [];
  let offset = 0;
  const bufferViews = [], accessors = [], gMeshes = [], nodes = [];
  const pushView = (arr, target) => {
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (b.length % 4)) % 4;
    chunks.push(b, Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target });
    offset += b.length + pad;
    return bufferViews.length - 1;
  };
  for (const m of meshes) {
    const n = m.pos.length / 3;
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { lo[a] = min(lo[a], m.pos[i * 3 + a]); hi[a] = max(hi[a], m.pos[i * 3 + a]); }
    const pv = pushView(m.pos, 34962);
    accessors.push({ bufferView: pv, componentType: 5126, count: n, type: 'VEC3', min: lo, max: hi });
    const pa = accessors.length - 1;
    const wide = n > 65535;
    const iv = pushView(wide ? new Uint32Array(m.idx) : new Uint16Array(m.idx), 34963);
    accessors.push({ bufferView: iv, componentType: wide ? 5125 : 5123, count: m.idx.length, type: 'SCALAR' });
    gMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: pa }, indices: accessors.length - 1 }] });
    nodes.push({ name: m.name, mesh: gMeshes.length - 1 });
  }
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'build-susanoo.mjs' },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: gMeshes, accessors, bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(file, Buffer.concat([header, jh, js, bh, bin]));
}

const out = process.argv[2] || 'public/models/susanoo.glb';
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const built = [];
let tris = 0;
for (const p of PARTS) {
  if (only && !only.test(p.name)) continue;
  const t0 = Date.now();
  const m = mesh(p.sdf(), p.box[0], p.box[1], p.h);
  built.push({ name: p.name, ...m });
  tris += m.idx.length / 3;
  console.log(`${p.name.padEnd(12)} ${String(m.pos.length / 3).padStart(7)} verts ${String(m.idx.length / 3).padStart(7)} tris  ${Date.now() - t0} ms`);
}
writeGLB(built, out);
console.log(`wrote ${out} — ${tris} triangles`);
