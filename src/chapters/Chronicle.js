import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { ParticlePool } from '../objects/Particles.js';
import { drawTexture, rand, damp, clamp, h, glowTexture } from '../core/utils.js';
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
    s.background = new THREE.Color(0x06030a);
    s.fog = new THREE.FogExp2(0x06030a, 0.045);
    s.add(new THREE.AmbientLight(0x6a4a5a, 1.6));
    const dir = new THREE.DirectionalLight(0xffd0c0, 1.2);
    dir.position.set(2, 5, 3);
    s.add(dir);

    const n = TIMELINE.length;
    const pts = [];
    for (let i = 0; i <= n + 1; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.9) * 3.5, Math.cos(i * 0.65) * 1.2, -i * 11));
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(this.curve, 500, 0.035, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.9 }),
    );
    tube.position.y = -1.2;
    s.add(tube);

    // stars
    const starCount = this.app.low ? 900 : 2000;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      sp[i * 3] = rand(-60, 60); sp[i * 3 + 1] = rand(-30, 40); sp[i * 3 + 2] = rand(-150, 20);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffd8d0, size: 0.08, transparent: true, opacity: 0.7, fog: false })));

    // slabs
    this.slabs = TIMELINE.map((ev, i) => {
      const t = (i + 1) / (n + 1);
      const p = this.curve.getPointAt(t);
      const side = i % 2 ? 1 : -1;
      const tex = this._slabTexture(ev, i);
      const stone = new THREE.MeshStandardMaterial({ color: 0x1c1418, roughness: 0.9 });
      const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.8 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 0.18), [stone, stone, stone, stone, face, stone]);
      slab.position.copy(p).add(new THREE.Vector3(side * 2.1, 0.2, 0));
      const look = this.curve.getPointAt(Math.max(0, t - 0.06));
      slab.lookAt(look.x + side * 0.5, slab.position.y, look.z);
      slab.userData = { index: i, t, face, baseY: slab.position.y };
      s.add(slab);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff2030, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(5.5, 4, 1);
      glow.position.copy(slab.position).add(new THREE.Vector3(0, 0, -0.4));
      s.add(glow);
      slab.userData.glow = glow;
      return slab;
    });
    this.stops = this.slabs.map((sl) => clamp(sl.userData.t - 0.05, 0, 1));

    this.dust = new ParticlePool({ count: this.app.low ? 300 : 700, turbulence: 0.6, drag: 0.3 });
    s.add(this.dust.points);
    this.dustColors = [new THREE.Color(0xff3a3a), new THREE.Color(0xffa080), new THREE.Color(0x802030)];

    this._buildUI();
    this.pt = this.stops[0];
    this.p = this.pt;
  }

  _slabTexture(ev, i) {
    return drawTexture(1024, 640, (x, w, hh) => {
      const g = x.createLinearGradient(0, 0, w, hh);
      g.addColorStop(0, '#2a1a1f'); g.addColorStop(1, '#120a0e');
      x.fillStyle = g; x.fillRect(0, 0, w, hh);
      for (let k = 0; k < 1400; k++) {
        x.fillStyle = `rgba(255,255,255,${rand(0, 0.035)})`;
        x.fillRect(rand(0, w), rand(0, hh), rand(1, 3), rand(1, 3));
      }
      x.strokeStyle = 'rgba(208,20,42,0.7)'; x.lineWidth = 4; x.strokeRect(26, 26, w - 52, hh - 52);
      x.strokeStyle = 'rgba(241,232,222,0.15)'; x.lineWidth = 2; x.strokeRect(40, 40, w - 80, hh - 80);
      x.fillStyle = 'rgba(208,20,42,0.12)';
      x.font = '900 300px "Noto Serif JP", serif'; x.textAlign = 'right'; x.textBaseline = 'middle';
      x.fillText(ev.jp.slice(0, 2), w - 60, hh / 2 + 20);
      x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      x.fillStyle = '#ff3b4a';
      x.font = '900 190px Cinzel, serif';
      x.fillText(ev.age, 80, 260);
      x.fillStyle = '#b2a39d';
      x.font = '600 34px Inter, sans-serif';
      x.fillText(ev.age === '∞' ? 'BEYOND DEATH' : `AGE ${ev.age}`, 86, 320);
      x.fillStyle = '#f1e8de';
      x.font = '700 64px Cinzel, serif';
      wrap(x, ev.title.toUpperCase(), 80, 430, w - 160, 70);
      x.fillStyle = 'rgba(241,232,222,0.45)';
      x.font = '500 28px Inter, sans-serif';
      x.fillText(`— ${String(i + 1).padStart(2, '0')} / ${String(TIMELINE.length).padStart(2, '0')}`, 80, hh - 80);
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

    this.slabs.forEach((sl, i) => {
      const on = i === nearest;
      sl.position.y = sl.userData.baseY + Math.sin(t * 0.8 + i) * 0.12;
      sl.userData.face.emissiveIntensity = damp(sl.userData.face.emissiveIntensity, on ? 0.75 : 0.18, 4, dt);
      sl.userData.glow.material.opacity = damp(sl.userData.glow.material.opacity, on ? 0.16 : 0, 4, dt);
      sl.userData.glow.position.y = sl.position.y;
    });

    const first = this.stops[0], last = this.stops[this.stops.length - 1];
    this.progressFill.style.width = `${clamp((this.p - first) / (last - first), 0, 1) * 100}%`;

    if (Math.random() < dt * 40) {
      this.dust.emit({
        x: pos.x + rand(-8, 8), y: pos.y + rand(-4, 3), z: pos.z - rand(2, 25), vx: 0, vy: rand(0.1, 0.5), vz: 0,
        life: rand(3, 6), size: rand(0.03, 0.08), color: this.dustColors[Math.floor(rand(0, 3))], alpha: 0.8,
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
