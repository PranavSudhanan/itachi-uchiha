import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Chapter } from '../core/Chapter.js';
import { ParticlePool } from '../objects/Particles.js';
import { drawTexture, rand, damp, clamp, h, glowTexture, TAU } from '../core/utils.js';
import { createGrass } from '../objects/Nature.js';
import { nightSky, bloodMoon } from '../objects/Dusk.js';
import { TIMELINE } from '../data/content.js';

const V_TMP = new THREE.Vector3();

export class Chronicle extends Chapter {
  constructor(app) {
    super(app, { id: 'chronicle', title: 'Chronicle', jp: '年代記' });
    this.shiftView = 0.12;
    this.bloom = { strength: 0.8, radius: 0.5, threshold: 0.6 };
    this.mood = 'calm';
    this.p = 0;
    this.pt = 0;
    this.lastInput = 0;
    this.activeIndex = -1;
  }

  build() {
    const s = this.scene;
    // a stone path at night through a bamboo grove, the chapters of his life carved on steles along it,
    // each with a stone lantern; the moon hangs over the far end of the path
    s.fog = new THREE.FogExp2(0x0a0f18, 0.034);
    s.add(new THREE.HemisphereLight(0x7080a8, 0x151008, 1.3));
    const moonDir = new THREE.Vector3(0.15, 0.32, -1).normalize();
    const dir = new THREE.DirectionalLight(0xc0ccff, 1.4);
    dir.position.copy(moonDir).multiplyScalar(30);
    s.add(dir);
    this.sky = nightSky(moonDir.clone().multiplyScalar(60));
    s.add(this.sky);
    this.moon = bloodMoon(2.6, { pale: true });
    this.moonOffset = moonDir.clone().multiplyScalar(70);
    s.add(this.moon);
    this.lamp = new THREE.PointLight(0xffb070, 0, 9, 1.6);
    s.add(this.lamp);

    const n = TIMELINE.length;
    const pts = [];
    for (let i = 0; i <= n + 1; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.9) * 3.5, 0, -i * 11));
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const GROUND = -0.8;
    // the path's x at a given z (it runs steadily away from the camera)
    const samples = Array.from({ length: 400 }, (_, k) => this.curve.getPointAt(k / 399));
    const pathX = (z) => { let best = samples[0]; for (const q of samples) if (Math.abs(q.z - z) < Math.abs(best.z - z)) best = q; return best.x; };

    // mossy earth
    const earth = drawTexture(1024, 1024, (x, w) => {
      x.fillStyle = '#17140e'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 3000; i++) { const l = rand(14, 34); x.fillStyle = `rgba(${l},${l * 0.9},${l * 0.6},0.6)`; x.fillRect(rand(0, w), rand(0, w), rand(1, 4), rand(1, 4)); }
      // fallen leaves: narrow, pointed, in straw, tan and brown, a few still green, lying every which way
      for (let i = 0; i < 5200; i++) {
        const t = Math.random();
        const c = t < 0.45 ? [rand(90, 130), rand(74, 100), rand(40, 60)] : t < 0.85 ? [rand(55, 85), rand(40, 58), rand(22, 34)] : [rand(40, 60), rand(62, 86), rand(28, 40)];
        x.save(); x.translate(rand(0, w), rand(0, w)); x.rotate(rand(0, TAU));
        const L = rand(14, 30), W = L * rand(0.1, 0.16);
        x.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${rand(0.55, 0.9)})`;
        x.beginPath(); x.moveTo(-L, 0); x.quadraticCurveTo(0, -W, L, 0); x.quadraticCurveTo(0, W, -L, 0); x.fill();
        x.strokeStyle = 'rgba(30,22,12,0.35)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(-L * 0.9, 0); x.lineTo(L * 0.9, 0); x.stroke();
        x.restore();
      }
      // and moss creeping over them in places
      for (let i = 0; i < 40; i++) {
        const cx = rand(0, w), cy = rand(0, w), r = rand(30, 90);
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(34,52,22,0.5)'); g.addColorStop(1, 'rgba(34,52,22,0)');
        x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    });
    earth.wrapS = earth.wrapT = THREE.RepeatWrapping;
    earth.repeat.set(8, 20);
    earth.anisotropy = this.app.renderer.capabilities.getMaxAnisotropy();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 160), new THREE.MeshStandardMaterial({ map: earth, bumpMap: earth, bumpScale: 1.2, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, GROUND, -60);
    s.add(ground);
    // stepping stones along the path
    const stoneTex = drawTexture(256, 256, (x, w) => {
      x.fillStyle = '#4c4b4c'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 3000; i++) { const l = rand(40, 115); x.fillStyle = `rgba(${l},${l},${l + 3},0.5)`; x.fillRect(rand(0, w), rand(0, w), rand(1, 3), rand(1, 3)); }
      // lichen: pale rosettes, and moss dark green
      for (let i = 0; i < 26; i++) { const cx = rand(0, w), cy = rand(0, w), r = rand(4, 14); x.fillStyle = `rgba(${rand(120, 150)},${rand(130, 150)},${rand(100, 120)},0.25)`; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
      for (let i = 0; i < 1200; i++) { x.fillStyle = `rgba(${rand(30, 50)},${rand(55, 80)},${rand(25, 40)},0.4)`; const a = rand(0, TAU), r = rand(w * 0.3, w * 0.5); x.fillRect(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, rand(1, 4), rand(1, 4)); }
    });
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 1.4, roughness: 0.88 });
    const stepGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.2, 20, 1);
    {
      // an irregular, rounded outline, not a coin
      const sp = stepGeo.attributes.position;
      const k = Array.from({ length: 16 }, () => rand(0.82, 1.12));
      for (let i = 0; i < sp.count; i++) {
        const a = Math.atan2(sp.getZ(i), sp.getX(i));
        const f = k[((Math.round((a / TAU) * 16) % 16) + 16) % 16];
        sp.setX(i, sp.getX(i) * f); sp.setZ(i, sp.getZ(i) * f);
        // worn into a low dome, the rim rounded off
        if (sp.getY(i) > 0) { const r = Math.hypot(sp.getX(i), sp.getZ(i)) / 0.45; sp.setY(i, sp.getY(i) + (1 - Math.min(1, r * r)) * 0.04 - (r > 0.9 ? 0.03 : 0)); }
      }
      stepGeo.computeVertexNormals();
    }
    const STEPS = 150;
    const steps = new THREE.InstancedMesh(stepGeo, stoneMat, STEPS);
    const d = new THREE.Object3D();
    for (let k = 0; k < STEPS; k++) {
      const q = this.curve.getPointAt(k / (STEPS - 1));
      d.position.set(q.x + rand(-0.15, 0.15), GROUND - 0.05, q.z);
      d.rotation.set(rand(-0.04, 0.04), rand(0, TAU), rand(-0.04, 0.04));
      d.scale.set(rand(0.8, 1.2), 1, rand(0.7, 1.05));
      d.updateMatrix();
      steps.setMatrixAt(k, d.matrix);
    }
    steps.receiveShadow = true;
    s.add(steps);
    // grass either side of the path
    for (let k = 0; k < 4; k++) {
      const g = createGrass({ count: this.app.low ? 2500 : 6000, area: 30, center: new THREE.Vector3(0, 0, -10 - k * 30), tip: 0x4f6a36, base: 0x101a0c, height: [0.3, 0.7], avoid: (x, z) => Math.abs(x - pathX(z)) < 1.1 });
      g.position.y = GROUND;
      s.add(g);
    }
    // bamboo: tall segmented stalks lining the path, leaf sprays at their crowns
    const bambooTex = drawTexture(128, 512, (x, w, hh) => {
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#3a5a2a'); g.addColorStop(0.4, '#7a9a52'); g.addColorStop(0.55, '#6a8a48'); g.addColorStop(1, '#2a4220');
      x.fillStyle = g; x.fillRect(0, 0, w, hh);
      // fine vertical fibres, and pale waxy bloom below each node
      for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${rand(20, 60)},${rand(40, 80)},${rand(20, 40)},0.25)`; x.fillRect(rand(0, w), 0, 1, hh); }
      for (let y = 40; y < hh; y += 128) {
        const b = x.createLinearGradient(0, y + 6, 0, y + 50);
        b.addColorStop(0, 'rgba(210,220,190,0.28)'); b.addColorStop(1, 'rgba(210,220,190,0)');
        x.fillStyle = b; x.fillRect(0, y + 6, w, 44);
        x.fillStyle = '#1c2c14'; x.fillRect(0, y, w, 4); x.fillStyle = 'rgba(220,230,180,0.4)'; x.fillRect(0, y + 4, w, 2);
      }
      // dark blotches of age on the older culms
      for (let i = 0; i < 14; i++) { x.fillStyle = 'rgba(40,34,20,0.25)'; x.beginPath(); x.ellipse(rand(0, w), rand(0, hh), rand(3, 10), rand(8, 30), 0, 0, TAU); x.fill(); }
    });
    bambooTex.wrapS = bambooTex.wrapT = THREE.RepeatWrapping;
    bambooTex.repeat.set(1, 4);
    const leafTex = drawTexture(512, 512, (x, w) => {
      // a spray: twigs fanning out, each ending in a hand of lance-shaped leaves that droop at the tips
      x.translate(w / 2, w * 0.2);
      for (let t = 0; t < 7; t++) {
        const ta = rand(0.5, Math.PI - 0.5), tl = rand(60, 150);
        const tx = Math.cos(ta) * tl, ty = Math.sin(ta) * tl;
        x.strokeStyle = 'rgba(60,70,36,0.9)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(tx, ty); x.stroke();
        for (let i = 0; i < 6; i++) {
          x.save(); x.translate(tx, ty); x.rotate(ta + rand(-0.9, 0.9));
          const L = rand(70, 110), W = L * 0.11;
          const g = rand(0, 1) < 0.1 ? [150, 140, 70] : [rand(50, 80), rand(95, 130), rand(40, 60)];
          x.fillStyle = `rgb(${g[0] | 0},${g[1] | 0},${g[2] | 0})`;
          x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(L * 0.4, -W, L, W * 1.5); x.quadraticCurveTo(L * 0.4, W, 0, 0); x.fill();
          x.strokeStyle = 'rgba(30,50,20,0.6)'; x.lineWidth = 1; x.beginPath(); x.moveTo(2, 0); x.quadraticCurveTo(L * 0.45, 0, L * 0.95, W * 1.3); x.stroke();
          x.restore();
        }
      }
    });
    const N = this.app.low ? 240 : 480;
    const LEAVES = 9;
    const stalkGeo = new THREE.CylinderGeometry(0.055, 0.075, 1, 10);
    stalkGeo.translate(0, 0.5, 0);
    const stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshStandardMaterial({ map: bambooTex, roughness: 0.45 }), N);
    const culmCol = new THREE.Color();
    const leafGeo = new THREE.PlaneGeometry(1.9, 1.9);
    leafGeo.translate(0, -0.55, 0); // hangs from its twig
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N * LEAVES);
    for (let k = 0; k < N; k++) {
      const z = rand(12, -135);
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = pathX(z) + side * rand(2.8, 14);
      const hgt = rand(7, 12);
      const lean = rand(-0.08, 0.08);
      d.position.set(x, GROUND, z);
      d.rotation.set(lean, rand(0, TAU), side * rand(0.02, 0.1));
      const girth = rand(0.7, 1.9);
      d.scale.set(girth, hgt, girth);
      d.updateMatrix();
      stalks.setMatrixAt(k, d.matrix);
      // young culms green, older ones yellowing or greyed
      const age = Math.random();
      culmCol.setRGB(1, 1, 1).multiplyScalar(rand(0.75, 1.1));
      if (age > 0.7) culmCol.multiply(new THREE.Color(1.15, 1.05, 0.7));
      else if (age < 0.15) culmCol.multiply(new THREE.Color(0.8, 0.82, 0.8));
      stalks.setColorAt(k, culmCol);
      // small sprays of leaves on side twigs all the way up the top half of the stalk
      for (let j = 0; j < LEAVES; j++) {
        const f = 0.4 + (j / (LEAVES - 1)) * 0.62;
        d.position.set(x + side * hgt * 0.06 * f + rand(-0.45, 0.45), GROUND + hgt * f, z + rand(-0.45, 0.45));
        d.rotation.set(rand(-0.6, 0.6), rand(0, TAU), rand(-0.6, 0.6));
        d.scale.setScalar(rand(0.6, 1.1) * (1.1 - f * 0.3));
        d.updateMatrix();
        leaves.setMatrixAt(k * LEAVES + j, d.matrix);
      }
    }
    s.add(stalks, leaves);

    // slabs
    this.slabs = TIMELINE.map((ev, i) => {
      const t = (i + 1) / (n + 1);
      const p = this.curve.getPointAt(t);
      const side = i % 2 ? 1 : -1;
      const tex = this._slabTexture(ev, i);
      const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.85 });
      const slab = new THREE.Mesh(new RoundedBoxGeometry(3.2, 2, 0.3, 3, 0.05), [stoneMat, stoneMat, stoneMat, stoneMat, face, stoneMat]);
      slab.position.copy(p).add(new THREE.Vector3(side * 2.1, GROUND + 0.34 + 1.0, 0));
      const look = this.curve.getPointAt(Math.max(0, t - 0.06));
      slab.lookAt(look.x + side * 0.5, slab.position.y, look.z);
      slab.castShadow = true;
      slab.userData = { index: i, t, face };
      s.add(slab);
      // the stele stands on a low plinth
      const plinth = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.34, 0.8, 3, 0.06), stoneMat);
      plinth.position.set(slab.position.x, GROUND + 0.17, slab.position.z);
      plinth.quaternion.copy(slab.quaternion);
      s.add(plinth);
      // a stone lantern beside it, a candle inside
      const lantern = this._lantern(stoneMat);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(slab.quaternion);
      lantern.position.copy(slab.position).addScaledVector(right, side * -2.3).setY(GROUND);
      s.add(lantern);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa050, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(1.3);
      glow.position.copy(lantern.position).setY(GROUND + 1.25);
      s.add(glow);
      slab.userData.glow = glow;
      slab.userData.lantern = lantern;
      return slab;
    });
    this.stops = this.slabs.map((sl) => clamp(sl.userData.t - 0.05, 0, 1));

    // mist lying low between the culms, drifting slowly along the path
    const mistTex = drawTexture(128, 128, (x, w) => {
      const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    });
    this.mist = [];
    for (let k = 0; k < 22; k++) {
      const z = rand(6, -130);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(8, 14), rand(2, 3.5)), new THREE.MeshBasicMaterial({ map: mistTex, color: 0x8090b0, transparent: true, opacity: rand(0.05, 0.1), depthWrite: false }));
      m.position.set(pathX(z) + rand(-5, 5), GROUND + rand(0.3, 0.9), z);
      m.userData.vx = rand(0.08, 0.25) * (Math.random() < 0.5 ? -1 : 1);
      s.add(m);
      this.mist.push(m);
    }

    // fireflies drifting over the grass
    this.dust = new ParticlePool({ count: this.app.low ? 200 : 400, turbulence: 0.6, drag: 0.3, softness: 2 });
    s.add(this.dust.points);
    this.dustColors = [new THREE.Color(0xd8ff80), new THREE.Color(0xfff0a0), new THREE.Color(0xa8e060)];

    this._buildUI();
    this.pt = this.stops[0];
    this.p = this.pt;
  }

  /** A stone lantern (tōrō): base, post, a firebox with lit windows, a roof. */
  _lantern(stone) {
    const g = new THREE.Group();
    const add = (geo, y, mat = stone) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; g.add(m); return m; };
    add(new THREE.CylinderGeometry(0.34, 0.4, 0.22, 6), 0.11);
    add(new THREE.CylinderGeometry(0.11, 0.13, 0.62, 8), 0.53);
    add(new THREE.CylinderGeometry(0.32, 0.24, 0.12, 6), 0.9);
    add(new THREE.BoxGeometry(0.42, 0.34, 0.42), 1.13);
    this.lanternLit = this.lanternLit || new THREE.MeshBasicMaterial({ color: 0xffb060 });
    add(new THREE.BoxGeometry(0.44, 0.18, 0.2), 1.13, this.lanternLit);
    add(new THREE.BoxGeometry(0.2, 0.18, 0.44), 1.13, this.lanternLit);
    add(new THREE.ConeGeometry(0.46, 0.34, 6), 1.47);
    add(new THREE.SphereGeometry(0.07, 8, 6), 1.68);
    return g;
  }

  /** The inscription, carved into granite: dark engraved letters with a lit lower edge, the age inlaid in red lacquer. */
  _slabTexture(ev, i) {
    return drawTexture(1024, 640, (x, w, hh) => {
      x.fillStyle = '#7c7872'; x.fillRect(0, 0, w, hh);
      for (let k = 0; k < 9000; k++) {
        const l = rand(70, 140);
        x.fillStyle = `rgba(${l},${l - 4},${l - 8},${rand(0.2, 0.55)})`;
        x.fillRect(rand(0, w), rand(0, hh), rand(1, 3), rand(1, 3));
      }
      // weathering: darker streaks running down from the top edge
      for (let k = 0; k < 40; k++) {
        const sx = rand(0, w), gl = x.createLinearGradient(0, 0, 0, rand(80, 300));
        gl.addColorStop(0, 'rgba(30,28,24,0.35)'); gl.addColorStop(1, 'rgba(30,28,24,0)');
        x.fillStyle = gl; x.fillRect(sx, 0, rand(6, 30), 300);
      }
      // lichen rosettes, and damp darkening creeping up from the foot
      for (let k = 0; k < 30; k++) {
        const cx = rand(0, w), cy = rand(0, 1) < 0.6 ? rand(hh * 0.7, hh) : rand(0, hh), r = rand(6, 26);
        const lg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        const c = rand(0, 1) < 0.5 ? '150,160,120' : '60,80,40';
        lg.addColorStop(0, `rgba(${c},0.35)`); lg.addColorStop(1, `rgba(${c},0)`);
        x.fillStyle = lg; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      const damp = x.createLinearGradient(0, hh * 0.72, 0, hh);
      damp.addColorStop(0, 'rgba(24,30,18,0)'); damp.addColorStop(1, 'rgba(24,30,18,0.55)');
      x.fillStyle = damp; x.fillRect(0, hh * 0.72, w, hh * 0.28);
      const carve = (draw, fill = 'rgba(28,24,22,0.92)') => {
        x.save(); x.fillStyle = 'rgba(230,224,214,0.35)'; x.translate(2, 3); draw(); x.restore();
        x.save(); x.fillStyle = fill; draw(); x.restore();
      };
      x.strokeStyle = 'rgba(40,36,32,0.7)'; x.lineWidth = 5; x.strokeRect(34, 34, w - 68, hh - 68);
      x.font = '900 300px "Noto Serif JP", serif'; x.textAlign = 'right'; x.textBaseline = 'middle';
      carve(() => x.fillText(ev.jp.slice(0, 2), w - 60, hh / 2 + 20), 'rgba(40,34,30,0.35)');
      x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      x.font = '900 190px Cinzel, serif';
      carve(() => x.fillText(ev.age, 80, 260), '#8e1b1e');
      x.font = '600 34px Inter, sans-serif';
      carve(() => x.fillText(ev.age === '∞' ? 'BEYOND DEATH' : `AGE ${ev.age}`, 86, 320), '#d9c9a0');
      x.font = '700 64px Cinzel, serif';
      carve(() => wrap(x, ev.title.toUpperCase(), 80, 430, w - 160, 70), '#e6d6ae');
      x.font = '500 28px Inter, sans-serif';
      carve(() => x.fillText(`— ${String(i + 1).padStart(2, '0')} / ${String(TIMELINE.length).padStart(2, '0')}`, 80, hh - 80), 'rgba(28,24,22,0.7)');
    });
  }

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 年代記',
      jp: '年代記',
      title: 'The <em>Chronicle</em>',
      desc: 'Walk the path of his life — from a four-year-old who saw war, to the brother who carried a lie to the grave.',
      extra: [this.gestures([['swipe', '<b>Swipe</b> or scroll to travel'], ['tap', '<b>Tap</b> a tablet to jump to it']])],
    });
    this.card = h('div.card.timeline-card.pe', {},
      h('div.tl-age'), h('div.card-jp'), h('h3'), h('p'));
    this.ui.append(this.card);

    const ticks = h('div.tl-ticks');
    this.tickBtns = TIMELINE.map((ev, i) => {
      const b = h('button.pe', { type: 'button', 'aria-label': `${ev.title}, age ${ev.age}`, style: `left:${(i / (TIMELINE.length - 1)) * 100}%` });
      b.addEventListener('click', () => { this.app.sfx.click(); this.goToStop(i); });
      ticks.append(b);
      return b;
    });
    this.progressFill = h('i');
    this.ui.append(h('div.tl-progress', {}, this.progressFill, ticks));

    // on a phone the labels fold away and the arrows flank the progress line in a single row
    this.ui.append(h('div.controls.tl-controls', {},
      this.button('↑<span class="lbl"> Previous</span>', () => this.goToStop(this.activeIndex - 1)),
      this.button('<span class="lbl">Next </span>↓', () => this.goToStop(this.activeIndex + 1)),
    ));
  }

  goToStop(i) {
    i = clamp(i, 0, this.stops.length - 1);
    this.pt = this.stops[i];
    this.lastInput = -10;
  }

  _setActive(i) {
    if (i === this.activeIndex) return;
    this.activeIndex = i;
    const ev = TIMELINE[i];
    const [age, jp, title, text] = this.card.children;
    age.textContent = ev.age === '∞' ? '∞' : `Age ${ev.age}`;
    jp.textContent = ev.jp;
    title.textContent = ev.title;
    text.textContent = ev.text;
    this.card.classList.remove('hidden');
    this.card.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'ease-out' });
    this.tickBtns.forEach((b, k) => b.classList.toggle('on', k <= i));
    if (this.active) this.app.sfx.hover();
  }

  enter() {
    this.lastInput = -10;
  }

  wheel(e) {
    const atEnd = this.pt >= this.stops[this.stops.length - 1] - 0.001 && e.deltaY > 0;
    const atStart = this.pt <= this.stops[0] + 0.001 && e.deltaY < 0;
    if (atEnd || atStart) return false;
    this.pt = clamp(this.pt + e.deltaY * 0.00045, this.stops[0], this.stops[this.stops.length - 1]);
    this.lastInput = performance.now();
    return true;
  }

  key(e) {
    if (e.key === 'ArrowDown') { this.goToStop(this.activeIndex + 1); return true; }
    if (e.key === 'ArrowUp') { this.goToStop(this.activeIndex - 1); return true; }
    return false;
  }

  pointerMove(p) {
    if (p.down) {
      this.pt = clamp(this.pt + (-p.dy - p.dx) * 0.0011, this.stops[0], this.stops[this.stops.length - 1]);
      this.lastInput = performance.now();
    } else {
      this.app.setHover(this.app.raycast(this.slabs, false).length > 0);
    }
  }

  swipe(s) {
    const dir = Math.abs(s.dy) > Math.abs(s.dx) ? -Math.sign(s.dy) : -Math.sign(s.dx);
    this.goToStop(this.activeIndex + dir);
    return true;
  }

  click() {
    const hit = this.app.raycast(this.slabs, false)[0];
    if (hit) this.goToStop(hit.object.userData.index);
  }

  update(dt, t) {
    for (const m of this.mist) { m.position.x += m.userData.vx * dt; m.quaternion.copy(this.camera.quaternion); }
    // snap to nearest stop after input settles
    if (performance.now() - this.lastInput > 650) {
      let best = 0;
      this.stops.forEach((s, i) => { if (Math.abs(s - this.pt) < Math.abs(this.stops[best] - this.pt)) best = i; });
      this.pt = damp(this.pt, this.stops[best], 4, dt);
    }
    this.p = damp(this.p, this.pt, 3.2, dt);

    const pos = this.curve.getPointAt(clamp(this.p, 0, 1));
    const ahead = this.curve.getPointAt(clamp(this.p + 0.05, 0, 1));
    const sway = this.app.isTouch ? 0 : this.app.pointer.ndc.x * 0.5;
    const focusSlab = this.slabs[this.activeIndex < 0 ? 0 : this.activeIndex];
    const focus = focusSlab.position;
    const portrait = this.app.width / this.app.height < 0.9;
    if (portrait) {
      // a narrow screen can't see the stele from the path's edge: stand back in front of it, square on,
      // far enough that the whole slab fits the clear band between the title and the card
      const normal = V_TMP.set(0, 0, 1).applyQuaternion(focusSlab.quaternion);
      const back = 8.6 * Math.max(1, 0.5 / (this.app.width / this.app.height));
      const want = focus.clone().addScaledVector(normal, back).add(new THREE.Vector3(0, 0.7, 0));
      this.camPosP = (this.camPosP || want.clone()).lerp(want, 1 - Math.exp(-2.6 * dt));
      this.camera.position.copy(this.camPosP);
      // aim below the slab so it sits in the upper part of the screen
      const aim = focus.clone().add(new THREE.Vector3(0, -0.75, 0));
      this.lookAtV = (this.lookAtV || aim.clone()).lerp(aim, 1 - Math.exp(-3 * dt));
    } else {
      this.camPosP = null;
      this.camera.position.set(pos.x + sway, pos.y + 0.9, pos.z + 1.5);
      this.lookAtV = (this.lookAtV || ahead.clone()).lerp(ahead.clone().lerp(focus, 0.6), 1 - Math.exp(-3 * dt));
    }
    this.camera.lookAt(this.lookAtV);
    // on a phone, tilting turns your head: look along the grove, up at the bamboo, down at the stones
    const gyro = this.app.gyro;
    this.gyroYaw = damp(this.gyroYaw || 0, gyro ? -gyro.x * 0.32 : 0, 5, dt);
    this.gyroPitch = damp(this.gyroPitch || 0, gyro ? -gyro.y * 0.18 : 0, 5, dt);
    this.camera.rotateY(this.gyroYaw);
    this.camera.rotateX(this.gyroPitch);

    let nearest = 0;
    this.stops.forEach((s, i) => { if (Math.abs(s - this.p) < Math.abs(this.stops[nearest] - this.p)) nearest = i; });
    this._setActive(nearest);

    this.sky.position.copy(this.camera.position);
    this.sky.userData.uniforms.uTime.value = t;
    this.moon.position.copy(this.camera.position).add(this.moonOffset);
    this.moon.lookAt(this.camera.position);
    this.slabs.forEach((sl, i) => {
      const on = i === nearest;
      // the stele being read is lit by its lantern; the rest stand in moonlight
      sl.userData.face.emissiveIntensity = damp(sl.userData.face.emissiveIntensity, on ? 0.3 : 0.04, 4, dt);
      sl.userData.glow.material.opacity = damp(sl.userData.glow.material.opacity, on ? 0.55 : 0.18, 4, dt);
    });
    const act = this.slabs[nearest];
    const lp = act.userData.lantern.position;
    this.lamp.position.set(lp.x, lp.y + 1.3, lp.z).lerp(act.position, 0.35);
    this.lamp.intensity = damp(this.lamp.intensity, 10 + Math.sin(t * 9) * 0.6 + Math.sin(t * 23) * 0.4, 5, dt);

    const first = this.stops[0], last = this.stops[this.stops.length - 1];
    this.progressFill.style.width = `${clamp((this.p - first) / (last - first), 0, 1) * 100}%`;

    if (Math.random() < dt * 14) {
      this.dust.emit({
        x: pos.x + rand(-8, 8), y: rand(-0.6, 1.2), z: pos.z - rand(2, 25), vx: rand(-0.2, 0.2), vy: rand(-0.05, 0.15), vz: rand(-0.2, 0.2),
        life: rand(3, 6), size: rand(0.03, 0.06), color: this.dustColors[Math.floor(rand(0, 3))], alpha: 0.8,
      });
    }
    this.dust.update(dt, t);
  }
}

function wrap(x, text, px, py, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (x.measureText(test).width > maxW && line) {
      x.fillText(line, px, py);
      line = w;
      py += lh;
    } else line = test;
  }
  x.fillText(line, px, py);
}
