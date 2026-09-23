import * as THREE from 'three';
import { TAU, drawTexture } from '../core/utils.js';

/** Kunai pointing along +Z, handle behind the origin. */
export function kunaiGeometry(scale = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5); s.lineTo(0.09, 0.12); s.lineTo(0.03, 0); s.lineTo(-0.03, 0); s.lineTo(-0.09, 0.12); s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
  blade.translate(0, 0, -0.006);
  const handle = new THREE.CylinderGeometry(0.025, 0.028, 0.28, 8);
  handle.translate(0, -0.14, 0);
  const ring = new THREE.TorusGeometry(0.05, 0.012, 6, 16);
  ring.translate(0, -0.33, 0);
  const merged = mergeSimple([blade, handle, ring]);
  merged.rotateX(Math.PI / 2);
  merged.scale(scale, scale, scale);
  return merged;
}

export function shurikenGeometry(scale = 1, outer = 0.22, inner = 0.06) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 2;
    const r = i % 2 ? inner : outer;
    i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, outer * 0.12, 0, TAU, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 1 });
  g.center();
  g.scale(scale, scale, scale);
  return g;
}

let _tagTex;
export function tagTexture() {
  if (_tagTex) return _tagTex;
  _tagTex = drawTexture(64, 192, (x, w, hh) => {
    x.fillStyle = '#efe3c4'; x.fillRect(0, 0, w, hh);
    x.strokeStyle = '#7a0f14'; x.lineWidth = 3; x.strokeRect(5, 5, w - 10, hh - 10);
    x.fillStyle = '#1a0a0a';
    x.font = '900 34px "Noto Serif JP", serif'; x.textAlign = 'center';
    x.fillText('封', w / 2, 60); x.fillText('爆', w / 2, 110); x.fillText('印', w / 2, 160);
  });
  return _tagTex;
}

export const steel = () => new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.95, roughness: 0.28 });

/** Minimal merge for non-indexed + indexed geometries with position/normal/uv. */
export function mergeSimple(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const attrs = ['position', 'normal', 'uv'];
  const out = new THREE.BufferGeometry();
  for (const a of attrs) {
    const size = parts[0].attributes[a].itemSize;
    const total = parts.reduce((s, g) => s + g.attributes[a].count * size, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of parts) { arr.set(g.attributes[a].array, o); o += g.attributes[a].array.length; }
    out.setAttribute(a, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
