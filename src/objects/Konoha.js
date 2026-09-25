import * as THREE from 'three';
import { drawTexture, rand } from '../core/utils.js';

/*
 * Konoha's rooftops at night, as painted silhouettes: houses with upswept tiled roofs, two-storey
 * shops, a pagoda, paper windows lit warm, telephone poles and sagging wires in front; behind them a
 * hazier layer of distant roofs and the hills. Each layer is one textured plane, so the whole
 * skyline costs two draws.
 */

/** A hip roof with upturned eaves, eave line at y, ridge h above it. */
function roof(x, px, y, w, h) {
  x.beginPath();
  x.moveTo(px - w * 0.14, y - h * 0.22);
  x.quadraticCurveTo(px - w * 0.02, y + h * 0.02, px + w * 0.1, y);
  x.lineTo(px + w * 0.9, y);
  x.quadraticCurveTo(px + w * 1.02, y + h * 0.02, px + w * 1.14, y - h * 0.22);
  x.lineTo(px + w * 0.8, y - h);
  x.lineTo(px + w * 0.2, y - h);
  x.closePath();
  x.fill();
  if (roof.rim) {
    x.save();
    x.strokeStyle = roof.rim; x.lineWidth = 2;
    x.beginPath();
    x.moveTo(px - w * 0.14, y - h * 0.22); x.lineTo(px + w * 0.2, y - h); x.lineTo(px + w * 0.8, y - h);
    x.stroke();
    x.restore();
  }
}

function windows(x, px, y, w, h, lit) {
  const cols = Math.max(1, Math.floor(w / 34));
  for (let c = 0; c < cols; c++) {
    if (Math.random() > lit) continue;
    const wx = px + 10 + c * ((w - 20) / cols), ww = (w - 20) / cols - 10, wy = y + h * 0.25, wh = h * 0.4;
    if (ww < 8) continue;
    const warm = rand(0, 1), dim = rand(0.55, 1);
    const top = warm < 0.5 ? [255, 196, 122] : [255, 176, 96], bot = warm < 0.5 ? [224, 120, 46] : [200, 92, 34];
    const tone = (a) => `rgb(${a[0] * dim | 0},${a[1] * dim | 0},${a[2] * dim | 0})`;
    const g = x.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, tone(top)); g.addColorStop(1, tone(bot));
    x.save();
    x.shadowColor = `rgba(255,140,60,${0.5 * dim})`; x.shadowBlur = 18;
    x.fillStyle = g;
    x.fillRect(wx, wy, ww, wh);
    x.restore();
    // shoji lattice
    x.fillStyle = 'rgba(40,14,6,0.8)';
    for (let k = 1; k < 3; k++) x.fillRect(wx + (ww * k) / 3 - 1, wy, 2, wh);
    x.fillRect(wx, wy + wh / 2 - 1, ww, 2);
  }
}

function nearLayer() {
  const W = 4096, H = 1024, base = H * 0.86;
  return drawTexture(W, H, (x) => {
    const sil = '#080306';
    roof.rim = 'rgba(150,40,36,0.45)';
    let px = -40;
    const poles = [];
    while (px < W + 40) {
      const kind = Math.random();
      if (kind < 0.07) {
        // a pagoda: tiers of roofs, each narrower
        const w = rand(120, 170), tiers = 5;
        let y = base, tw = w;
        x.fillStyle = sil;
        for (let t = 0; t < tiers; t++) {
          const th = 58 - t * 4;
          x.fillRect(px + (w - tw * 0.7) / 2, y - th, tw * 0.7, th);
          roof(x, px + (w - tw) / 2, y - th, tw, 34);
          y -= th + 22; tw *= 0.82;
        }
        x.fillRect(px + w / 2 - 3, y - 70, 6, 80); // finial
        px += w + rand(20, 60);
        continue;
      }
      const w = rand(90, 230), storeys = Math.random() < 0.4 ? 2 : 1;
      let y = base;
      x.fillStyle = sil;
      for (let st = 0; st < storeys; st++) {
        const bh = rand(70, 120) * (st ? 0.8 : 1), bw = w * (st ? 0.72 : 1), bx = px + (w - bw) / 2;
        x.fillRect(bx, y - bh, bw, bh + (st ? 0 : H - base));
        windows(x, bx, y - bh, bw, bh, st ? 0.45 : 0.3);
        x.fillStyle = sil;
        roof(x, bx, y - bh, bw, rand(52, 78) * (st ? 0.85 : 1));
        y -= bh + 34;
      }
      if (Math.random() < 0.5) poles.push(px + w + rand(5, 20));
      px += w + rand(-10, 30);
    }
    // telephone poles and sagging wires
    x.strokeStyle = sil; x.fillStyle = sil;
    const tops = [];
    let last = -1e9;
    for (const p of poles) {
      if (p - last < 380) continue;
      last = p;
      const top = base - rand(330, 380);
      x.fillRect(p - 4, top, 8, base - top);
      x.fillRect(p - 36, top + 16, 72, 6);
      x.fillRect(p - 26, top + 40, 52, 5);
      tops.push([p, top + 18]);
    }
    x.lineWidth = 2;
    for (let i = 0; i < tops.length - 1; i++) {
      for (const dy of [0, 24]) {
        const [a, ay] = tops[i], [b, by] = tops[i + 1];
        x.beginPath(); x.moveTo(a - 30, ay + dy); x.quadraticCurveTo((a + b) / 2, Math.max(ay, by) + dy + 60, b - 30, by + dy); x.stroke();
      }
    }
    x.fillRect(0, base, W, H - base);
    roof.rim = null;
    // paper lanterns hanging at the doors, each with a pool of glow
    for (let i = 0; i < 26; i++) {
      const lx = rand(0, W), ly = base - rand(30, 60);
      const g = x.createRadialGradient(lx, ly, 0, lx, ly, 60);
      g.addColorStop(0, 'rgba(255,150,70,0.35)'); g.addColorStop(1, 'rgba(255,120,50,0)');
      x.fillStyle = g; x.fillRect(lx - 60, ly - 60, 120, 120);
      x.fillStyle = '#ffb060'; x.beginPath(); x.ellipse(lx, ly, 6, 9, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(80,20,10,0.8)'; x.fillRect(lx - 6, ly - 10, 12, 2); x.fillRect(lx - 6, ly + 8, 12, 2);
    }
  });
}

function farLayer() {
  const W = 4096, H = 1024;
  return drawTexture(W, H, (x) => {
    // hills behind the village: a long jagged ridge, higher toward one end
    x.fillStyle = '#2c0b12';
    x.beginPath();
    x.moveTo(0, H);
    for (let px = 0; px <= W; px += 24) {
      const y = H * (0.66 - 0.12 * Math.sin((px / W) * Math.PI * 1.3 + 0.4)) + Math.sin(px * 0.013) * 18 + Math.sin(px * 0.041) * 8 + rand(-3, 3);
      x.lineTo(px, y);
    }
    x.lineTo(W, H);
    x.closePath(); x.fill();
    const glow = x.createLinearGradient(0, H * 0.62, 0, H * 0.92);
    glow.addColorStop(0, 'rgba(120,40,24,0)'); glow.addColorStop(1, 'rgba(150,60,30,0.45)');
    x.fillStyle = glow; x.fillRect(0, H * 0.62, W, H * 0.38);
    // distant roofs in the haze
    const haze = '#1f080d';
    x.fillStyle = haze;
    let px = 0;
    const base = H * 0.9;
    while (px < W) {
      const w = rand(60, 150), bh = rand(40, 110);
      x.fillRect(px, base - bh, w, H);
      roof(x, px, base - bh, w, rand(26, 40));
      if (Math.random() < 0.25) { windows(x, px, base - bh, w, bh, 0.25); x.fillStyle = haze; }
      px += w + rand(-8, 20);
    }
  });
}

export function konohaSkyline() {
  const g = new THREE.Group();
  const layer = (tex, w, h, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
    m.position.set(0, y, z);
    m.renderOrder = -6;
    return m;
  };
  const far = layer(farLayer(), 190, 47, -8, -70);
  const near = layer(nearLayer(), 120, 30, -12.5, -38);
  near.renderOrder = -5;
  // light pollution: the village's lamps warm the air just above its roofs
  const hazeTex = drawTexture(4, 128, (x, w, hh) => {
    const gr = x.createLinearGradient(0, 0, 0, hh);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, w, hh);
  });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(200, 10), new THREE.MeshBasicMaterial({ map: hazeTex, color: 0x7a2a18, transparent: true, opacity: 0.35, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  haze.position.set(0, -10.5, -50);
  haze.renderOrder = -5.5;
  g.add(far, near, haze);
  return g;
}
