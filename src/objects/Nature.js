import * as THREE from 'three';
import { shared, rand, TAU, drawTexture } from '../core/utils.js';

/**
 * Wind-swept instanced grass. Lit (Lambert) so it receives moonlight, fog and shadows.
 * `bend` (optional Vector4 uniform: x,z,radius,strength) pushes blades away from a point (footsteps, blasts).
 */
export function createGrass({ count = 12000, area = 40, center = new THREE.Vector3(), base = 0x0b140c, tip = 0x3f5a2c, height = [0.35, 0.9], avoid = null } = {}) {
  const segs = 4;
  const P = [], C = [];
  const cb = new THREE.Color(base), ct = new THREE.Color(tip);
  const W = 0.028;
  // each blade narrows to a point and arches over as it rises
  const bw = (y) => W * (1 - Math.pow(y, 1.6));
  const bz = (y) => y * y * 0.22;
  for (let i = 0; i < segs; i++) {
    const y0 = i / segs, y1 = (i + 1) / segs;
    const w0 = bw(y0), w1 = bw(y1), z0 = bz(y0), z1 = bz(y1);
    const quad = [[-w0, y0, z0], [w0, y0, z0], [w1, y1, z1], [-w0, y0, z0], [w1, y1, z1], [-w1, y1, z1]];
    for (const [x, y, z] of quad) {
      P.push(x, y, z);
      const c = cb.clone().lerp(ct, Math.pow(y, 0.8));
      C.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const bend = { value: new THREE.Vector4(0, 0, 0, 0) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uBend = bend;
    sh.vertexShader = 'uniform float uTime;\nuniform vec4 uBend;\n' + sh.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
      #include <begin_vertex>
      float hgt = position.y;
      vec4 wp = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float wind = sin(uTime * 1.4 + wp.x * 0.35 + wp.z * 0.22) * 0.55 + sin(uTime * 2.9 + wp.x * 1.1 - wp.z * 0.7) * 0.2;
      vec3 push = vec3(wind * 0.32, 0.0, wind * 0.12);
      vec2 d = wp.xz - uBend.xy;
      float dl = length(d);
      float k = uBend.w * smoothstep(uBend.z, 0.0, dl);
      push.xz += normalize(d + 0.0001) * k;
      mat3 inv = transpose(mat3(instanceMatrix));
      transformed += inv * push * hgt * hgt;
      transformed.y -= k * hgt * hgt * 0.35;
    `);
  };

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  const shade = new THREE.Color();
  let placed = 0, cx = 0, cz = 0, left = 0, clumpH = 1;
  for (let i = 0; i < count * 3 && placed < count; i++) {
    if (left <= 0) {
      const r = Math.sqrt(Math.random()) * area;
      const a = rand(0, TAU);
      cx = center.x + Math.cos(a) * r; cz = center.z + Math.sin(a) * r;
      left = Math.floor(rand(5, 14));
      clumpH = rand(0.75, 1.2);
    }
    left--;
    const ja = rand(0, TAU), jr = Math.pow(Math.random(), 1.5) * 0.28;
    const x = cx + Math.cos(ja) * jr, z = cz + Math.sin(ja) * jr;
    if (avoid && avoid(x, z)) continue;
    d.position.set(x, 0, z);
    // blades splay outward from the heart of the tuft
    d.rotation.set(rand(-0.1, 0.1), ja + Math.PI / 2 + rand(-0.6, 0.6), rand(-0.1, 0.1));
    const hh = rand(height[0], height[1]) * clumpH * (1 - jr * 0.9);
    d.scale.set(rand(0.9, 1.6), hh, rand(0.6, 1.3));
    d.updateMatrix();
    mesh.setMatrixAt(placed, d.matrix);
    // some blades fresher, some dry and yellowing
    const dry = Math.random() < 0.18;
    shade.setRGB(1, 1, 1).multiplyScalar(rand(0.7, 1.15));
    if (dry) shade.multiply(new THREE.Color(1.25, 1.08, 0.7));
    mesh.setColorAt(placed, shade);
    placed++;
  }
  mesh.count = placed;
  mesh.userData.bend = bend;
  return mesh;
}

let _rockMat;
/** A weathered grey stone with moss gathered on its upper half (shared). */
export function mossRockMaterial() {
  if (_rockMat) return _rockMat;
  const tex = drawTexture(256, 256, (x, w) => {
    x.fillStyle = '#4a4a48'; x.fillRect(0, 0, w, w);
    for (let i = 0; i < 5000; i++) { const l = rand(40, 110); x.fillStyle = `rgba(${l},${l},${l - 4},0.5)`; x.fillRect(rand(0, w), rand(0, w), rand(1, 3), rand(1, 3)); }
    for (let i = 0; i < 1800; i++) { x.fillStyle = `rgba(${rand(30, 60)},${rand(60, 95)},${rand(25, 45)},0.55)`; x.fillRect(rand(0, w), rand(0, w * 0.5), rand(1, 4), rand(1, 4)); }
  });
  _rockMat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.5, roughness: 0.95, flatShading: true });
  return _rockMat;
}

/** A rounded, lumpy boulder of unit size, a little flattened; half-sink it into the ground. */
export function createBoulder(material = mossRockMaterial()) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const gp = g.attributes.position;
  const seed = rand(0, 10);
  for (let v = 0; v < gp.count; v++) {
    const px = gp.getX(v), py = gp.getY(v), pz = gp.getZ(v);
    const k = 1 + Math.sin(px * 3 + seed) * 0.12 + Math.sin(py * 4 + pz * 2 + seed) * 0.1 + Math.sin(pz * 5 - seed) * 0.06;
    gp.setXYZ(v, px * k, py * k * 0.7, pz * k);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

let _bark;
export function barkTexture() {
  if (_bark) return _bark;
  _bark = drawTexture(128, 256, (x, w, hh) => {
    x.fillStyle = '#2a1e17'; x.fillRect(0, 0, w, hh);
    for (let i = 0; i < 60; i++) {
      x.strokeStyle = `rgba(${rand(10, 30)},${rand(8, 20)},${rand(5, 15)},${rand(0.4, 0.9)})`;
      x.lineWidth = rand(1, 4);
      const px = rand(0, w);
      x.beginPath(); x.moveTo(px, 0);
      for (let y = 0; y < hh; y += 16) x.lineTo(px + rand(-4, 4), y);
      x.stroke();
    }
  });
  _bark.wrapS = _bark.wrapT = THREE.RepeatWrapping;
  _bark.repeat.set(2, 3);
  return _bark;
}

let _branch;
/** A fir branch on a transparent card: a twig with side sprigs, each thick with short needles. */
function branchTexture() {
  if (_branch) return _branch;
  _branch = drawTexture(128, 256, (x, w, hh) => {
    const needle = (px, py, ang, len) => {
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); x.stroke();
    };
    const sprig = (x0, y0, ang, len, depth) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      x.strokeStyle = '#2a2016'; x.lineWidth = depth ? 2.2 : 1.2;
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      // needles along the twig, lighter and fresher toward its tip
      const n = Math.floor(len / 2.2);
      for (let i = 0; i < n; i++) {
        const t = i / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
        const g = 70 + t * 50 + rand(-12, 12);
        x.strokeStyle = `rgb(${g * 0.45 | 0},${g | 0},${g * 0.55 | 0})`;
        x.lineWidth = 1.3;
        for (const s of [-1, 1]) needle(px, py, ang + s * rand(0.7, 1.1), rand(5, 9) * (1 - t * 0.4));
      }
      if (depth) {
        for (let i = 1; i < 7; i++) {
          const t = i / 7;
          for (const s of [-1, 1]) sprig(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ang + s * rand(0.6, 0.9), len * (0.42 - t * 0.2), 0);
        }
      }
    };
    sprig(w / 2, hh - 4, -Math.PI / 2, hh - 12, 1);
  });
  return _branch;
}

/**
 * Instanced conifer forest arranged in a ring / arc. Each tree is a trunk with whorls of drooping
 * branches; every branch is a pair of crossed cards textured with needled twigs, so the crowns are
 * ragged and see-through at their edges instead of solid cones.
 */
export function createForest({ count = 40, rMin = 20, rMax = 40, arc = [0, TAU], center = new THREE.Vector3(), leaf = 0x0d1d14, castShadow = true } = {}) {
  const group = new THREE.Group();
  const H = 10;
  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.4, H, 8);
  trunkGeo.translate(0, H / 2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1 });

  // one tree's branches, shared by every instance
  const P = [], N = [], UV = [], I = [];
  const SEG = 4;
  const card = (base, dir, side, L, droop, width) => {
    const start = P.length / 3;
    for (let k = 0; k <= SEG; k++) {
      const s = k / SEG;
      const c = base.clone().addScaledVector(dir, L * s);
      c.y -= droop * L * s * s;
      const wdt = width * (1 - s * 0.55);
      // foliage normals lean up and out, so the crown shades like a mass rather than a set of flat planes
      const n = dir.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 1, 0)).normalize();
      for (const u of [0, 1]) {
        const p = c.clone().addScaledVector(side, (u - 0.5) * wdt);
        P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); UV.push(u, s);
      }
    }
    for (let k = 0; k < SEG; k++) {
      const a = start + k * 2;
      I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  const WHORLS = 13;
  let rot = 0;
  for (let wI = 0; wI < WHORLS; wI++) {
    const t = wI / (WHORLS - 1);
    const y = 1.6 + t * (H - 1.9);
    const L = 3.3 * Math.pow(1 - t, 0.85) + 0.35;
    const per = t > 0.85 ? 4 : 6;
    rot += 2.4;
    for (let b = 0; b < per; b++) {
      const a = rot + (b / per) * TAU + rand(-0.25, 0.25);
      const up = 0.25 - t * 0.1 - (1 - t) * 0.15;
      const dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
      const flat = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const droop = 0.25 + (1 - t) * 0.35;
      const len = L * rand(0.85, 1.12);
      const base = new THREE.Vector3(Math.cos(a) * 0.08, y + rand(-0.15, 0.15), Math.sin(a) * 0.08);
      card(base, dir, flat, len, droop, len * 0.62);
      card(base, dir, new THREE.Vector3(0, 1, 0).addScaledVector(flat, 0.3).normalize(), len, droop, len * 0.34);
    }
  }
  const crownGeo = new THREE.BufferGeometry();
  crownGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  crownGeo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  crownGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  crownGeo.setIndex(I);
  const tex = branchTexture();
  const leafMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.92 });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const crowns = new THREE.InstancedMesh(crownGeo, leafMat, count);
  // shadows cut out by the needles too
  crowns.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.45 });
  const d = new THREE.Object3D();
  const col = new THREE.Color(), tint = new THREE.Color(leaf);
  const hsl = {};
  tint.getHSL(hsl);
  for (let i = 0; i < count; i++) {
    const a = rand(arc[0], arc[1]);
    const r = rand(rMin, rMax);
    const s = rand(0.75, 1.45);
    d.position.set(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
    d.rotation.set(rand(-0.03, 0.03), rand(0, TAU), rand(-0.03, 0.03));
    d.scale.set(s, s * rand(0.9, 1.25), s);
    d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);
    crowns.setMatrixAt(i, d.matrix);
    // the chosen leaf colour sets the hue; each tree a little lighter or darker, bluer or yellower
    col.setHSL(hsl.h + rand(-0.03, 0.03), 0.34, rand(0.2, 0.32));
    crowns.setColorAt(i, col);
  }
  trunks.castShadow = castShadow;
  crowns.castShadow = castShadow;
  group.add(trunks, crowns);
  return group;
}

/** Soft blinking fireflies around a volume, driven by a ParticlePool. */
export function emitFireflies(pool, dt, { rate = 6, center = new THREE.Vector3(), spread = 14, y = [0.3, 3] } = {}) {
  if (Math.random() < dt * rate) {
    pool.emit({
      x: center.x + rand(-spread, spread), y: rand(y[0], y[1]), z: center.z + rand(-spread, spread),
      vx: rand(-0.3, 0.3), vy: rand(-0.1, 0.2), vz: rand(-0.3, 0.3),
      life: rand(2.5, 5), size: rand(0.06, 0.12), color: pool._fly || (pool._fly = new THREE.Color(0xc8ff70)), alpha: 1,
    });
  }
}
