import * as THREE from 'three';
import { shared, rand, TAU, drawTexture } from '../core/utils.js';

/**
 * Wind-swept instanced grass. Lit (Lambert) so it receives moonlight, fog and shadows.
 * `bend` (optional Vector4 uniform: x,z,radius,strength) pushes blades away from a point (footsteps, blasts).
 */
export function createGrass({ count = 12000, area = 40, center = new THREE.Vector3(), base = 0x0b140c, tip = 0x3f5a2c, height = [0.35, 0.9], avoid = null } = {}) {
  const segs = 3;
  const P = [], C = [];
  const cb = new THREE.Color(base), ct = new THREE.Color(tip);
  for (let i = 0; i < segs; i++) {
    const y0 = i / segs, y1 = (i + 1) / segs;
    const w0 = 0.045 * (1 - y0), w1 = 0.045 * (1 - y1);
    const quad = [[-w0, y0], [w0, y0], [w1, y1], [-w0, y0], [w1, y1], [-w1, y1]];
    for (const [x, y] of quad) {
      P.push(x, y, 0);
      const c = cb.clone().lerp(ct, y);
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
  let placed = 0;
  for (let i = 0; i < count * 3 && placed < count; i++) {
    const r = Math.sqrt(Math.random()) * area;
    const a = rand(0, TAU);
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    if (avoid && avoid(x, z)) continue;
    d.position.set(x, 0, z);
    d.rotation.set(rand(-0.15, 0.15), rand(0, TAU), rand(-0.15, 0.15));
    const hh = rand(height[0], height[1]);
    d.scale.set(rand(0.8, 1.4), hh, 1);
    d.updateMatrix();
    mesh.setMatrixAt(placed++, d.matrix);
  }
  mesh.count = placed;
  mesh.userData.bend = bend;
  return mesh;
}

let _bark;
function barkTexture() {
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

/** Instanced pine forest arranged in a ring / arc. */
export function createForest({ count = 40, rMin = 20, rMax = 40, arc = [0, TAU], center = new THREE.Vector3(), leaf = 0x0d1d14, castShadow = true } = {}) {
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 9, 8);
  trunkGeo.translate(0, 4.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: leaf, roughness: 0.95, flatShading: true });
  const layers = [[2.6, 3.4, 4.4], [2.1, 3, 6.2], [1.5, 2.6, 7.9], [0.9, 2, 9.4]];
  const cones = layers.map(([r, hgt]) => { const g = new THREE.ConeGeometry(r, hgt, 8); g.translate(0, hgt / 2, 0); return g; });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = cones.map((g) => new THREE.InstancedMesh(g, leafMat, count));
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = rand(arc[0], arc[1]);
    const r = rand(rMin, rMax);
    const s = rand(0.75, 1.45);
    d.position.set(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
    d.rotation.set(0, rand(0, TAU), 0);
    d.scale.set(s, s * rand(0.9, 1.2), s);
    d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);
    col.setHSL(0.36 + rand(-0.03, 0.03), 0.35, rand(0.06, 0.12));
    leaves.forEach((lm, k) => {
      d.position.y = (layers[k][2] - 2.2) * s;
      d.updateMatrix();
      lm.setMatrixAt(i, d.matrix);
      lm.setColorAt(i, col);
    });
  }
  trunks.castShadow = castShadow;
  group.add(trunks);
  leaves.forEach((lm) => { lm.castShadow = castShadow; group.add(lm); });
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
