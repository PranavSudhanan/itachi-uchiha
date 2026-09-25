import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { voice } from '../core/Voice.js';
import { ParticlePool } from '../objects/Particles.js';
import { SharinganEye } from '../objects/Eye.js';
import { createGrass, createForest, emitFireflies } from '../objects/Nature.js';
import { kunaiGeometry, shurikenGeometry, tagTexture, steel } from '../objects/Weapons.js';
import { glowTexture, drawTexture, rand, damp, clamp, h, toScreen, pick, TAU } from '../core/utils.js';
import { nightSky, bloodMoon } from '../objects/Dusk.js';

const TYPES = {
  kunai: { pts: 10, speed: 1 },
  shuriken: { pts: 10, speed: 1.1 },
  tag: { pts: 30, speed: 0.8 },
};

/**
 * "Precognition" — the Sharingan reads movement before it happens.
 * Weapons fly at you from the forest: tap or slash them away. Touch-and-hold (or Space)
 * activates the Sharingan: time slows and every trajectory is revealed.
 */
export class Precognition extends Chapter {
  constructor(app) {
    super(app, { id: 'precognition', title: 'Precognition', jp: '洞察眼' });
    this.bloom = { strength: 0.8, radius: 0.5, threshold: 0.7 };
    this.mood = 'tension';
    this.state = 'idle';
    this.items = [];
    this.timeScale = 1;
    this.chakra = 100;
    this.lives = 3;
    this.score = 0;
    this.combo = 0;
    this.spawnT = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.sharingan = false;
    this.spaceHeld = false;
    try { this.best = +localStorage.getItem('itachi-precog') || 0; } catch (_) { this.best = 0; }
  }

  build() {
    const s = this.scene;
    // a forest at night under a low moon: it backlights the trees and catches the steel flying out of them
    const moonPos = new THREE.Vector3(-16, 12, -62);
    this.sky = nightSky(moonPos);
    s.add(this.sky);
    const moonDisc = bloodMoon(3, { pale: true });
    moonDisc.position.copy(moonPos);
    moonDisc.lookAt(0, 1.7, 2);
    s.add(moonDisc);
    s.fog = new THREE.FogExp2(0x0a101d, 0.028);
    // the night sky, as the steel reflects it
    {
      const pm = new THREE.PMREMGenerator(this.app.renderer);
      const envScene = new THREE.Scene();
      envScene.add(nightSky(moonPos, 40));
      const m2 = bloodMoon(6, { pale: true });
      m2.position.copy(moonPos).setLength(35);
      m2.lookAt(0, 0, 0);
      envScene.add(m2);
      s.environment = pm.fromScene(envScene, 0.02).texture;
      pm.dispose();
    }

    s.add(new THREE.HemisphereLight(0x7f90c0, 0x1c1812, 1.7));
    const moon = new THREE.DirectionalLight(0xc8d4ff, 2.6);
    moon.position.copy(moonPos).setLength(30);
    moon.castShadow = !this.app.low;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 50 });
    s.add(moon);

    // forest floor: moss, needles and fallen leaves
    const floor = drawTexture(512, 512, (x, w) => {
      x.fillStyle = '#141a10'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 3500; i++) {
        const t = Math.random();
        x.fillStyle = t < 0.5 ? `rgba(${rand(20, 40)},${rand(30, 50)},${rand(15, 28)},0.6)` : t < 0.85 ? `rgba(${rand(50, 80)},${rand(35, 55)},${rand(20, 30)},0.55)` : `rgba(${rand(70, 100)},${rand(60, 80)},${rand(40, 55)},0.5)`;
        x.save(); x.translate(rand(0, w), rand(0, w)); x.rotate(rand(0, TAU));
        x.beginPath(); x.ellipse(0, 0, rand(2, 7), rand(1, 3), 0, 0, TAU); x.fill(); x.restore();
      }
    });
    floor.wrapS = floor.wrapT = THREE.RepeatWrapping;
    floor.repeat.set(16, 16);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ map: floor, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    s.add(createGrass({ count: this.app.low ? 3000 : 8000, area: 26, center: new THREE.Vector3(0, 0, -10) }));
    s.add(createForest({ count: this.app.low ? 28 : 46, rMin: 16, rMax: 34, arc: [-Math.PI * 0.98, -Math.PI * 0.02], castShadow: !this.app.low }));
    s.add(createForest({ count: 16, rMin: 12, rMax: 22, arc: [Math.PI * 0.1, Math.PI * 0.9], castShadow: false }));

    // shafts of moonlight slanting down between the trees, and mist lying low over the ground
    const shaftTex = drawTexture(64, 256, (x, w, hh) => {
      const g = x.createLinearGradient(0, 0, 0, hh);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, hh);
      const e = x.createLinearGradient(0, 0, w, 0);
      e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.5, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = e; x.fillRect(0, 0, w, hh);
    });
    this.shafts = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(1.2, 2.6), 18), new THREE.MeshBasicMaterial({ map: shaftTex, color: 0x9fb4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      m.position.set(rand(-12, 12), 6, rand(-24, -10));
      m.rotation.set(0, rand(-0.3, 0.3), 0.42 + rand(-0.08, 0.08)); // leaning away from the low moon
      m.userData = { base: rand(0.035, 0.07), ph: rand(0, TAU) };
      s.add(m);
      this.shafts.push(m);
    }
    const mistTex = drawTexture(128, 128, (x, w) => {
      const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    });
    this.mist = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(8, 14), rand(3, 5)), new THREE.MeshBasicMaterial({ map: mistTex, color: 0x6a7a9a, transparent: true, opacity: rand(0.05, 0.1), depthWrite: false }));
      m.position.set(rand(-16, 16), rand(0.3, 1.2), rand(-30, -6));
      m.userData = { vx: rand(0.1, 0.35) * (Math.random() < 0.5 ? -1 : 1) };
      s.add(m);
      this.mist.push(m);
    }

    this.fireflies = new ParticlePool({ count: 120, softness: 2 });
    s.add(this.fireflies.points);
    this.sparks = new ParticlePool({ count: 500, gravity: -9, drag: 0.6 });
    this.blast = new ParticlePool({ count: 500, drag: 2, buoyancy: 1 });
    s.add(this.sparks.points, this.blast.points);
    this.sparkColors = [new THREE.Color(0xffe0b0), new THREE.Color(0xff6040)];
    this.fireColors = [new THREE.Color(0xffd070), new THREE.Color(0xff6020), new THREE.Color(0x802010)];

    // weapons
    this.geo = { kunai: kunaiGeometry(1.9), shuriken: shurikenGeometry(2.1) };
    this.mat = steel();
    this.tagMat = new THREE.MeshStandardMaterial({ map: tagTexture(), side: THREE.DoubleSide, roughness: 0.9, emissive: 0x220000 });
    this.tagGeo = new THREE.PlaneGeometry(0.18, 0.5);
    this.glowTex = glowTexture();
    this.glintTex = drawTexture(128, 128, (x, w) => {
      x.translate(w / 2, w / 2);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, w * 0.12);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, w * 0.12, 0, TAU); x.fill();
      for (const a of [0, Math.PI / 2]) {
        x.save(); x.rotate(a);
        const l = x.createLinearGradient(-w / 2, 0, w / 2, 0);
        l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(0.5, 'rgba(255,255,255,1)'); l.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = l; x.fillRect(-w / 2, -1.5, w, 3); x.restore();
      }
    });

    // trajectory lines (revealed by the Sharingan)
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xff1a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

    // start eye floating in the clearing
    this.eye = new SharinganEye({ radius: 0.9, mode: 3 });
    this.eye.group.position.set(0, 2.2, -7);
    s.add(this.eye.group);

    this.camera.position.set(0, 1.7, 2);
    this.camBase = new THREE.Vector3(0, 1.7, 2);
    this.camera.lookAt(0, 1.8, -10);
    this._buildUI();
  }

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 洞察眼',
      jp: '洞察眼',
      title: 'Sharingan <em>Precognition</em>',
      desc: 'The Sharingan sees an attack before it lands. Hidden shinobi will throw kunai, shuriken and explosive tags at you. Knock them away before they strike.',
      extra: [this.gestures([
        ['tap', '<b>Tap</b> a weapon to deflect'],
        ['swipe', '<b>Slash</b> across several'],
        ['hold', `<b>Hold</b>${this.app.isTouch ? '' : ' / Space'} — Sharingan slow-mo`],
      ])],
    });
    this.scoreEl = h('b', { text: '0' });
    this.livesEl = h('span.hearts', { text: '◆◆◆' });
    this.fill = h('div.meter-fill');
    this.ui.append(h('div.hud-corner', {},
      h('div.pill', {}, 'Score', this.scoreEl),
      h('div.pill', {}, this.livesEl),
      h('div.pill.bar', {}, h('div.meter-label', {}, h('span', { text: 'Chakra' })), h('div.meter-track', {}, this.fill)),
    ));
    this.comboEl = h('div.combo');
    this.ui.append(this.comboEl);

    this.card = h('div.game-card.pe', {},
      h('div.card-jp', { text: '写輪眼 · Reflex trial' }),
      this.cardTitle = h('h3', { text: 'Read the attack' }),
      this.cardBig = h('div.big', { style: 'display:none' }),
      this.cardText = h('p', { text: 'Tap the floating Sharingan — or the button — to begin. Three hits and it\'s over.' }),
      this.startBtn = this.button('Begin', () => this.start(), 'btn-primary'),
    );
    this.ui.append(this.card);
  }

  start() {
    this.items.forEach((it) => this._remove(it));
    this.items = [];
    this.state = 'playing';
    this.lives = 3;
    this.score = 0;
    this.combo = 0;
    this.chakra = 100;
    this.elapsed = 0;
    this.spawnT = 0.8;
    this.card.classList.add('hidden');
    this.ui.querySelector('.intro').style.opacity = '0.1';
    this.eye.group.visible = false;
    this._hud();
    this.app.sfx.sharingan();
    voice.say('sharingan', { cooldown: 20 });
    this.app.flash(0.3, 0xff2030);
  }

  gameOver() {
    this.state = 'over';
    this.sharingan = false;
    const record = this.score > this.best;
    if (record) {
      this.best = this.score;
      try { localStorage.setItem('itachi-precog', String(this.best)); } catch (_) { /* ignore */ }
    }
    this.cardTitle.textContent = record ? 'New record!' : 'You were struck';
    this.cardBig.style.display = '';
    this.cardBig.textContent = String(this.score);
    this.cardText.textContent = `Best: ${this.best}. ${this.score > 400 ? 'Your eyes are starting to see like his.' : 'Itachi read every move before it happened. Try again.'}`;
    this.startBtn.textContent = 'Try again';
    this.card.classList.remove('hidden');
    this.ui.querySelector('.intro').style.opacity = '';
    this.eye.group.visible = true;
    this.app.sfx.boom();
  }

  _hud() {
    this.scoreEl.textContent = String(this.score);
    this.livesEl.textContent = '◆'.repeat(Math.max(0, this.lives)) + '◇'.repeat(Math.max(0, 3 - this.lives));
  }

  /* ---------- spawning ---------- */

  _spawn() {
    const diff = Math.min(1, this.elapsed / 90);
    const type = Math.random() < 0.12 + diff * 0.12 ? 'tag' : pick(['kunai', 'kunai', 'shuriken']);
    const from = new THREE.Vector3(rand(-11, 11), rand(1.2, 5.5), rand(-26, -18));
    const to = this.camera.position.clone().add(new THREE.Vector3(rand(-0.9, 0.9), rand(-0.6, 0.3), 0));
    const speed = (8 + diff * 9) * TYPES[type].speed * rand(0.9, 1.15);
    const vel = to.clone().sub(from).normalize().multiplyScalar(speed);
    let m;
    if (type === 'tag') {
      m = new THREE.Group();
      const k = new THREE.Mesh(this.geo.kunai, this.mat);
      const tag = new THREE.Mesh(this.tagGeo, this.tagMat);
      tag.position.set(0, 0, -0.55);
      tag.rotation.x = Math.PI / 2;
      m.add(k, tag);
      const fuse = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff6020, blending: THREE.AdditiveBlending, depthWrite: false }));
      fuse.scale.setScalar(0.6);
      fuse.position.z = -0.8;
      m.add(fuse);
    } else m = new THREE.Mesh(this.geo[type], this.mat);
    // a cold glint so steel reads against the night
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glintTex, color: 0xd8e4ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    glint.scale.setScalar(0.32);
    glint.position.z = 0.25;
    m.add(glint);
    m.position.copy(from);
    if (type !== 'shuriken') m.lookAt(from.clone().add(vel));
    m.castShadow = true;
    this.scene.add(m);

    // predicted path
    const lg = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(lg, this.lineMat);
    this.scene.add(line);

    // throw flash in the trees
    this.sparks.burst(from, 10, { speed: 2, life: [0.2, 0.5], size: [0.05, 0.12], colors: this.sparkColors });
    this.items.push({ m, line, vel, type, state: 'fly', t: 0, spin: rand(14, 24), glint, gph: rand(0, TAU) });
    this.app.sfx.swoosh();
  }

  _remove(it) {
    this.scene.remove(it.m);
    this.scene.remove(it.line);
    it.line.geometry.dispose();
  }

  _deflect(it) {
    if (it.state !== 'fly') return;
    it.state = 'deflected';
    it.t = 0;
    const out = new THREE.Vector3(rand(-1, 1), rand(0.4, 1.2), rand(-0.6, 0.2)).normalize().multiplyScalar(14);
    it.vel.copy(out);
    this.combo++;
    const mult = 1 + Math.floor(this.combo / 5) * 0.5;
    this.score += Math.round(TYPES[it.type].pts * mult);
    this.sparks.burst(it.m.position, 26, { speed: 6, life: [0.2, 0.6], size: [0.03, 0.08], colors: this.sparkColors });
    this.app.sfx.clink();
    if (it.type === 'tag') { this._explode(it.m.position, 0.4); }
    if (this.combo > 1 && this.combo % 5 === 0) this._showCombo(`${this.combo} combo · ×${mult}`);
    this._hud();
  }

  _explode(pos, strength = 1) {
    this.blast.burst(pos, Math.round(120 * strength + 40), { speed: 7 * strength + 2, life: [0.3, 0.9], size: [0.2, 0.6], colors: this.fireColors, grow: 0.8 });
    this.app.sfx.boom();
    this.app.flash(0.25 * strength + 0.1, 0xffc080);
    this.shake = Math.max(this.shake, 0.4 * strength + 0.2);
  }

  _hit(it) {
    this.lives--;
    this.combo = 0;
    this.shake = 1;
    this.app.flash(0.5, 0xff0020);
    this.app.sfx.hurt();
    if (it.type === 'tag') this._explode(this.camera.position.clone().add(new THREE.Vector3(0, 0, -1.2)), 1);
    this._hud();
    if (this.lives <= 0) this.gameOver();
  }

  _showCombo(text) {
    this.comboEl.textContent = text;
    this.comboEl.classList.remove('on');
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('on');
    clearTimeout(this._comboT);
    this._comboT = setTimeout(() => this.comboEl.classList.remove('on'), 900);
  }

  /* ---------- input ---------- */

  _screen(it) { return toScreen(it.m.position, this.camera, this.app.width, this.app.height); }
  get _radius() { return this.app.isTouch ? 70 : 55; }

  _nearestAt(x, y) {
    let best = null, bd = this._radius;
    for (const it of this.items) {
      if (it.state !== 'fly') continue;
      const sc = this._screen(it);
      if (sc.behind) continue;
      const d = Math.hypot(sc.x - x, sc.y - y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  pointerDown(p) {
    if (this.state !== 'playing') return;
    const it = this._nearestAt(p.x, p.y);
    if (it) { this._deflect(it); this.pressedItem = true; } else this.pressedItem = false;
    this._lastX = p.x; this._lastY = p.y;
  }

  pointerMove(p) {
    if (this.state !== 'playing') {
      this.app.setHover(this.app.raycast([this.eye.mesh], false).length > 0);
      return;
    }
    this.app.setHover(!!this._nearestAt(p.x, p.y));
    if (!p.down) return;
    // slash: segment from last to current pointer position
    const ax = this._lastX, ay = this._lastY, bx = p.x, by = p.y;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    if (len2 > 4) {
      for (const it of this.items) {
        if (it.state !== 'fly') continue;
        const sc = this._screen(it);
        const tt = clamp(((sc.x - ax) * (bx - ax) + (sc.y - ay) * (by - ay)) / len2, 0, 1);
        const d = Math.hypot(sc.x - (ax + (bx - ax) * tt), sc.y - (ay + (by - ay) * tt));
        if (d < this._radius * 0.75) this._deflect(it);
      }
    }
    this._lastX = p.x; this._lastY = p.y;
  }

  swipe() { if (this.state === 'playing') this.app.sfx.slash(); return this.state === 'playing'; }

  click() {
    if (this.state !== 'playing' && this.app.raycast([this.eye.mesh], false).length) this.start();
  }

  key(e) {
    if (e.code === 'Space') { e.preventDefault(); this.spaceHeld = true; return true; }
    if (e.key === 'Enter' && this.state !== 'playing') { this.start(); return true; }
    return false;
  }
  keyUp(e) { if (e.code === 'Space') this.spaceHeld = false; }

  exit() {
    this.spaceHeld = false;
    if (this.state === 'playing') {
      this.items.forEach((it) => this._remove(it));
      this.items = [];
      this.state = 'idle';
      this.card.classList.remove('hidden');
      this.ui.querySelector('.intro').style.opacity = '';
      this.eye.group.visible = true;
    }
  }

  resize(w, hh) {
    super.resize(w, hh);
    this.camera.fov = w / hh < 0.9 ? 72 : 55;
    this.camera.updateProjectionMatrix();
  }

  /* ---------- loop ---------- */

  update(dt, t) {
    this.sky.userData.uniforms.uTime.value = t;
    for (const m of this.shafts) m.material.opacity = m.userData.base * (0.75 + 0.25 * Math.sin(t * 0.5 + m.userData.ph));
    for (const m of this.mist) {
      m.position.x += m.userData.vx * dt;
      if (m.position.x > 20) m.position.x = -20; else if (m.position.x < -20) m.position.x = 20;
      m.quaternion.copy(this.camera.quaternion);
    }
    const p = this.app.pointer;
    const wantSharingan = this.state === 'playing' && ((p.down && !this.pressedItem && performance.now() - p.startTime > 160) || this.spaceHeld);
    this.sharingan = wantSharingan && this.chakra > 1;
    this.chakra = clamp(this.chakra + (this.sharingan ? -28 : 9) * dt, 0, 100);
    this.fill.style.width = `${this.chakra}%`;
    this.fill.classList.toggle('low', this.chakra < 25);
    this.timeScale = damp(this.timeScale, this.sharingan ? 0.22 : 1, 10, dt);
    const sdt = dt * this.timeScale;
    const k = 1 - (this.timeScale - 0.22) / 0.78;

    // grade: desaturate + red tint + chromatic aberration while the eye is active
    this.grade.sat = 1 - k * 0.7;
    this.grade.tintAmt = k * 0.35;
    this.grade.ca = 0.012 + k * 0.03;
    this.grade.vig = 0.55 + k * 0.3;
    this.lineMat.opacity = k * 0.8;

    if (this.state === 'playing') {
      this.elapsed += sdt;
      this.spawnT -= sdt;
      if (this.spawnT <= 0) {
        const diff = Math.min(1, this.elapsed / 90);
        this._spawn();
        if (Math.random() < diff * 0.5) this._spawn();
        this.spawnT = rand(1.5, 2.1) - diff * 1.05;
      }
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += sdt;
      if (it.state === 'deflected') it.vel.y -= 12 * sdt;
      it.m.position.addScaledVector(it.vel, sdt);
      if (it.type === 'shuriken') it.m.rotation.set(Math.PI / 2 - 0.3, 0, it.m.rotation.z + it.spin * sdt);
      else if (it.state === 'deflected') { it.m.rotation.x += 12 * sdt; it.m.rotation.y += 8 * sdt; }
      it.line.visible = it.state === 'fly';
      // the blade catches the moon now and then as it turns
      it.glint.material.opacity = Math.pow(Math.max(0, Math.sin(it.t * (it.type === 'shuriken' ? 9 : 5) + it.gph)), 6) * 0.9;
      if (it.state === 'fly' && it.m.position.z > this.camera.position.z - 0.8) {
        // a blade that has flown past a leaning player misses
        if (this.app.gyro && Math.abs(it.m.position.x - this.camera.position.x) > 1.05) { this._remove(it); this.items.splice(i, 1); continue; }
        this._remove(it);
        this.items.splice(i, 1);
        if (this.state === 'playing') this._hit(it);
        continue;
      }
      if (it.state === 'deflected' && it.t > 1.4) {
        this._remove(it);
        this.items.splice(i, 1);
      }
    }

    // idle eye
    this.eye.update(dt);
    this.eye.group.position.y = 2.2 + Math.sin(t * 1.3) * 0.15;
    this.eye.group.lookAt(this.camera.position);

    // camera sway + shake
    this.shake = damp(this.shake, 0, 5, dt);
    const pn = this.app.pointer.ndc;
    // on a phone, tilting leans you left and right: lean out of a blade's path to dodge it
    const gyro = this.app.gyro;
    this.lean = damp(this.lean || 0, gyro ? gyro.x * 0.85 : 0, 8, dt);
    const sx = this.app.isTouch ? this.lean : pn.x * 0.25;
    this.camera.position.set(
      this.camBase.x + sx + rand(-1, 1) * this.shake * 0.12,
      this.camBase.y + Math.sin(t * 0.8) * 0.03 + rand(-1, 1) * this.shake * 0.12,
      this.camBase.z,
    );
    this.camera.lookAt(sx * 2, 1.9, -10);
    if (gyro) this.camera.rotateZ(-this.lean * 0.12); // the body tips as it leans

    emitFireflies(this.fireflies, dt, { rate: 8, center: new THREE.Vector3(0, 0, -10), spread: 14 });
    this.fireflies.update(sdt, t);
    this.sparks.update(sdt, t);
    this.blast.update(sdt, t);
  }
}
