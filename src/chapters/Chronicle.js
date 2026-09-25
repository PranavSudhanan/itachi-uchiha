import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { ParticlePool } from '../objects/Particles.js';
import { drawTexture, rand, damp, clamp, h, glowTexture, TAU } from '../core/utils.js';
import { createGrass } from '../objects/Nature.js';
import { nightSky, bloodMoon } from '../objects/Dusk.js';
import { TIMELINE } from '../data/content.js';

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
    const earth = drawTexture(512, 512, (x, w) => {
      x.fillStyle = '#161a10'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 4000; i++) {
        const t = Math.random();
        x.fillStyle = t < 0.6 ? `rgba(${rand(25, 45)},${rand(38, 58)},${rand(18, 30)},0.55)` : `rgba(${rand(45, 70)},${rand(38, 52)},${rand(26, 36)},0.5)`;
        x.fillRect(rand(0, w), rand(0, w), rand(1, 4), rand(1, 4));
      }
    });
    earth.wrapS = earth.wrapT = THREE.RepeatWrapping;
    earth.repeat.set(10, 26);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 160), new THREE.MeshStandardMaterial({ map: earth, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, GROUND, -60);
    s.add(ground);
    // stepping stones along the path
    const stoneTex = drawTexture(128, 128, (x, w) => {
      x.fillStyle = '#5a5a5e'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 700; i++) { const l = rand(50, 120); x.fillStyle = `rgba(${l},${l},${l + 3},0.5)`; x.fillRect(rand(0, w), rand(0, w), rand(1, 3), rand(1, 3)); }
    });
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.85 });
    const stepGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.14, 16);
    {
      // an irregular, rounded outline, not a coin
      const sp = stepGeo.attributes.position;
      const k = Array.from({ length: 16 }, () => rand(0.82, 1.12));
      for (let i = 0; i < sp.count; i++) {
        const a = Math.atan2(sp.getZ(i), sp.getX(i));
        const f = k[((Math.round((a / TAU) * 16) % 16) + 16) % 16];
        sp.setX(i, sp.getX(i) * f); sp.setZ(i, sp.getZ(i) * f);
      }
      stepGeo.computeVertexNormals();
    }
    const STEPS = 150;
    const steps = new THREE.InstancedMesh(stepGeo, stoneMat, STEPS);
    const d = new THREE.Object3D();
    for (let k = 0; k < STEPS; k++) {
      const q = this.curve.getPointAt(k / (STEPS - 1));
      d.position.set(q.x + rand(-0.15, 0.15), GROUND + 0.03, q.z);
      d.rotation.set(rand(-0.04, 0.04), rand(0, TAU), rand(-0.04, 0.04));
      d.scale.set(rand(0.8, 1.2), 1, rand(0.7, 1.05));
      d.updateMatrix();
      steps.setMatrixAt(k, d.matrix);
    }
    steps.receiveShadow = true;
    s.add(steps);
    // grass either side of the path
    for (let k = 0; k < 4; k++) {
      const g = createGrass({ count: this.app.low ? 1500 : 3500, area: 30, center: new THREE.Vector3(0, 0, -10 - k * 30), tip: 0x4f6a36, base: 0x101a0c, height: [0.3, 0.7], avoid: (x, z) => Math.abs(x - pathX(z)) < 1.1 });
      g.position.y = GROUND;
      s.add(g);
    }
    // bamboo: tall segmented stalks lining the path, leaf sprays at their crowns
    const bambooTex = drawTexture(64, 512, (x, w, hh) => {
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#2c4a22'); g.addColorStop(0.45, '#5f8a42'); g.addColorStop(1, '#223a1a');
      x.fillStyle = g; x.fillRect(0, 0, w, hh);
      for (let y = 40; y < hh; y += 90) { x.fillStyle = '#1a2a12'; x.fillRect(0, y, w, 5); x.fillStyle = 'rgba(200,220,160,0.35)'; x.fillRect(0, y + 5, w, 2); }
    });
    bambooTex.wrapS = bambooTex.wrapT = THREE.RepeatWrapping;
    bambooTex.repeat.set(1, 4);
    const leafTex = drawTexture(256, 256, (x, w) => {
      x.translate(w / 2, w / 2);
      // narrow bamboo leaves hanging from a twig, drooping
      for (let i = 0; i < 18; i++) {
        x.save(); x.rotate(rand(0.3, Math.PI - 0.3)); x.translate(rand(4, 30), 0);
        x.fillStyle = `rgb(${rand(40, 70)},${rand(80, 115)},${rand(35, 55)})`;
        x.beginPath(); x.ellipse(40, 0, 44, 4.5, 0, 0, TAU); x.fill(); x.restore();
      }
    });
    const N = this.app.low ? 180 : 360;
    const LEAVES = 6;
    const stalkGeo = new THREE.CylinderGeometry(0.06, 0.08, 1, 8);
    stalkGeo.translate(0, 0.5, 0);
    const stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshStandardMaterial({ map: bambooTex, roughness: 0.6 }), N);
    const leafGeo = new THREE.PlaneGeometry(1.5, 1.5);
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
      d.scale.set(1, hgt, 1);
      d.updateMatrix();
      stalks.setMatrixAt(k, d.matrix);
      // small sprays of leaves on side twigs all the way up the top half of the stalk
      for (let j = 0; j < LEAVES; j++) {
        const f = 0.45 + (j / (LEAVES - 1)) * 0.55;
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
      const slab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 0.3), [stoneMat, stoneMat, stoneMat, stoneMat, face, stoneMat]);
      slab.position.copy(p).add(new THREE.Vector3(side * 2.1, GROUND + 0.34 + 1.0, 0));
      const look = this.curve.getPointAt(Math.max(0, t - 0.06));
      slab.lookAt(look.x + side * 0.5, slab.position.y, look.z);
      slab.castShadow = true;
      slab.userData = { index: i, t, face };
      s.add(slab);
      // the stele stands on a low plinth
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.34, 0.8), stoneMat);
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

    this.ui.append(h('div.controls', {},
      this.button('↑ Previous', () => this.goToStop(this.activeIndex - 1)),
      this.button('Next ↓', () => this.goToStop(this.activeIndex + 1)),
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
    this.camera.position.set(pos.x + sway, pos.y + 0.9, pos.z + 1.5);
    const focus = this.slabs[this.activeIndex < 0 ? 0 : this.activeIndex].position;
    this.lookAtV = (this.lookAtV || ahead.clone()).lerp(ahead.clone().lerp(focus, 0.6), 1 - Math.exp(-3 * dt));
    this.camera.lookAt(this.lookAtV);

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
