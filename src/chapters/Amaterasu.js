import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { ParticlePool } from '../objects/Particles.js';
import { FlameField } from '../objects/FlameField.js';
import { makeSky, drawTexture, rand, damp, TAU, h, clamp, sharinganTexture } from '../core/utils.js';

const COST = 18;

export class Amaterasu extends Chapter {
  constructor(app) {
    super(app, { id: 'amaterasu', title: 'Amaterasu', jp: '天照' });
    this.shiftView = 0.12;
    this.mood = 'tension';
    this.bloom = { strength: 0.6, radius: 0.5, threshold: 0.7 };
    this.sources = [];
    this.chakra = 100;
    this.burned = 0;
    this.maxSources = app.low ? 26 : 48;
  }

  build() {
    const s = this.scene;
    s.add(makeSky('#3d2a33', '#8a6a6e', { exponent: 0.9 }));
    s.fog = new THREE.Fog(0x6e5358, 14, 50);

    s.add(new THREE.HemisphereLight(0xd8c0c4, 0x2a1a1e, 1.4));
    const sun = new THREE.DirectionalLight(0xffe2d8, 1.1);
    sun.position.set(-5, 10, 6);
    sun.castShadow = !this.app.low;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 40 });
    s.add(sun);

    // ground (cracked earth)
    const tex = drawTexture(1024, 1024, (x, w) => {
      x.fillStyle = '#5a4a4c'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 9000; i++) {
        const v = rand(60, 110);
        x.fillStyle = `rgba(${v},${v * 0.85},${v * 0.85},${rand(0.1, 0.4)})`;
        x.fillRect(rand(0, w), rand(0, w), rand(1, 4), rand(1, 4));
      }
      x.strokeStyle = 'rgba(30,20,22,0.55)';
      for (let i = 0; i < 70; i++) {
        let px = rand(0, w), py = rand(0, w);
        x.lineWidth = rand(1, 3);
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 8; k++) { px += rand(-50, 50); py += rand(-50, 50); x.lineTo(px, py); }
        x.stroke();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    s.add(this.ground);

    // burnable objects: logs, training posts, rocks
    this.burnables = [];
    const wood = () => new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.9 });
    const stone = () => new THREE.MeshStandardMaterial({ color: 0x7a7072, roughness: 0.95, flatShading: true });
    const add = (mesh, x, z, top) => {
      mesh.position.x = x; mesh.position.z = z;
      mesh.userData = { hp: 1, burning: false, top, base: mesh.material.color.clone(), sy: mesh.scale.y };
      mesh.castShadow = mesh.receiveShadow = true;
      s.add(mesh);
      this.burnables.push(mesh);
    };
    [[-6, -3], [6.5, -5], [-3, -9], [3.5, 1.5], [9, -12], [-10, -10]].forEach(([x, z], i) => {
      if (i % 2) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 2.4, 10), wood());
        post.position.y = 1.2;
        add(post, x, z, 2.4);
      } else {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 12), wood());
        log.rotation.z = Math.PI / 2;
        log.rotation.y = rand(0, TAU);
        log.position.y = 0.4;
        add(log, x, z, 0.8);
      }
    });
    [[-8, 2], [8, 0], [0, -14], [-1, -5]].forEach(([x, z]) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.7, 1.2), 0), stone());
      rock.position.y = 0.5;
      rock.rotation.set(rand(0, 3), rand(0, 3), 0);
      add(rock, x, z, 1.2);
    });

    // black flames: dark core + faint violet edge (normal blending), and a subtle crimson glow layer
    const n = this.app.low ? 2600 : 6000;
    this.flames = new ParticlePool({ count: n, blending: THREE.NormalBlending, rim: 0x2a0620, rimAmount: 0.55, softness: 0.7, buoyancy: 1.8, drag: 1.6, turbulence: 2.6 });
    this.glow = new ParticlePool({ count: 900, buoyancy: 1.2, drag: 1.5, turbulence: 1.5, softness: 2 });
    s.add(this.glow.points, this.flames.points);
    this.coreColor = new THREE.Color(0x020003);
    this.coreColor2 = new THREE.Color(0x0c0210);
    this.glowColor = new THREE.Color(0x3a0418);

    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0x7a1040, 0, 9, 1.6);
      s.add(l);
      return l;
    });

    // shader flames (black core, violet-crimson rim)
    this.field = new FlameField(this.app.low ? 180 : 360);
    s.add(this.field.mesh);

    // gaze reticle: where the Mangekyō is focused
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 48), new THREE.MeshBasicMaterial({ map: sharinganTexture('mangekyo'), color: 0xff3040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.position.y = 0.03;
    s.add(this.reticle);
    this.gaze = new THREE.Vector3();
    this.lastPaint = new THREE.Vector3(999, 0, 999);

    this.camera.position.set(0, 7, 15);
    this.camBase = new THREE.Vector3(0, 7, 15);
    this.look = new THREE.Vector3(0, 0.5, -3);
    this._buildUI();
  }

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 天照',
      jp: '天照',
      title: 'Black Flames of <em>Amaterasu</em>',
      desc: 'Wherever the right Mangekyō focuses, black flames burn — hot as the sun and said to rage for seven days and nights. Every use strains the eye; Itachi\'s bled, and his sight dimmed.',
      extra: [this.gestures([
        ['hold', '<b>Stare</b> (hold) to ignite where you look'],
        ['draw', 'Keep holding and <b>drag</b> to paint flames'],
        ['swipe', '<b>Swipe down</b> to close the eye'],
      ])],
    });
    this.fill = h('div.meter-fill');
    this.flameCount = h('b', { text: '0' });
    this.ui.append(h('div.hud-corner', {},
      h('div.pill.meter', {}, h('div.meter-label', {}, h('span', { text: 'Chakra' }), this.chakraTxt = h('span', { text: '100' })), h('div.meter-track', {}, this.fill)),
      h('div.pill', {}, 'Flames', this.flameCount),
    ));
    this.ui.append(h('div.controls', {},
      this.button('Ring of fire', () => this.ring(), 'btn-primary'),
    ));
  }

  ignite(point, { strength = 1, obj = null, silent = false } = {}) {
    if (this.sources.length >= this.maxSources) this.sources.shift();
    const tongues = Array.from({ length: obj ? 7 : 5 }, (_, k) => ({ a: rand(0, TAU), r: k === 0 ? 0 : rand(0.15, obj ? 0.9 : 0.7), w: rand(0.7, 1.2), hgt: rand(1.1, 2.2), seed: rand(0, 100) }));
    this.sources.push({ p: point.clone(), s: 0.1, strength, life: rand(18, 26), spread: rand(3, 6), obj, tongues });
    if (obj) obj.userData.burning = true;
    if (!silent) {
      this.app.sfx.flame();
      this.flames.burst(point, 80, { speed: 3, up: 2, life: [0.4, 1.2], size: [0.25, 0.6], colors: [this.coreColor, this.coreColor2], grow: -0.3 });
    }
  }

  _spend(amount, quiet = false) {
    if (this.chakra < amount) {
      if (quiet) return false;
      this.app.toast('<b>Not enough chakra.</b> Your vision blurs — the price of the Mangekyō.');
      this.app.canvas.classList.add('blurred');
      clearTimeout(this._blurT);
      this._blurT = setTimeout(() => this.app.canvas.classList.remove('blurred'), 1600);
      this.app.sfx.wrong();
      return false;
    }
    this.chakra -= amount;
    if (!quiet) this.app.bleed();
    return true;
  }

  ring() {
    if (!this._spend(45)) return;
    const c = new THREE.Vector3(0, 0, -4);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      this.ignite(new THREE.Vector3(c.x + Math.cos(a) * 6, 0, c.z + Math.sin(a) * 6), { silent: i > 0, strength: 0.8 });
    }
  }

  extinguish() {
    for (const src of this.sources) src.life = Math.min(src.life, 0.8);
    this.app.toast('The eye closes. The flames recede.');
    this.app.sfx.poof();
  }

  _gazeHit() {
    const hit = this.app.raycast(this.burnables, false)[0];
    if (hit) return { point: hit.point, obj: hit.object };
    const g = this.app.raycast([this.ground], false)[0];
    return g ? { point: g.point, obj: null } : null;
  }

  pointerMove(p) {
    const hit = this._gazeHit();
    this.app.setHover(!!hit);
    if (hit) this.gaze.copy(hit.point);
    // painting: while the eye is locked on, dragging spreads the flames
    if (this.painting && p.down && hit && !hit.obj) {
      const flat = hit.point.clone(); flat.y = 0;
      if (flat.distanceTo(this.lastPaint) > 1.25) {
        if (!this._spend(6, true)) { this.painting = false; return; }
        this.lastPaint.copy(flat);
        this.ignite(flat, { strength: 0.85, silent: true });
        if (Math.random() < 0.4) this.app.sfx.noise({ dur: 0.4, vol: 0.12, type: 'lowpass', freq: 400, to: 900 });
      }
    }
  }

  pointerUp() { this.painting = false; }

  swipe(s) {
    if (this.painting || s.vy < 0.6 || Math.abs(s.dy) < Math.abs(s.dx)) return !!this.painting;
    this.extinguish();
    return true;
  }

  click() {
    const hit = this._gazeHit();
    if (!hit) return;
    if (hit.obj) {
      if (hit.obj.userData.hp <= 0 || !this._spend(COST)) return;
      this.ignite(hit.point.clone(), { obj: hit.obj, strength: 1.2 });
    } else if (this._spend(10)) this.ignite(hit.point, { strength: 0.65 });
  }
  exit() {
    this.app.canvas.classList.remove('blurred');
  }

  update(dt, t) {
    const hold = this.trackHold(0.45, !this.painting);
    if (hold.fired) {
      const hit = this._gazeHit();
      if (hit && this._spend(hit.obj ? COST : 14)) {
        this.ignite(hit.obj ? hit.point.clone() : hit.point, { obj: hit.obj && hit.obj.userData.hp > 0 ? hit.obj : null, strength: 1.2 });
        this.painting = true;
        this.lastPaint.copy(hit.point).setY(0);
        this.app.flash(0.15, 0x400010);
      }
    }
    const showReticle = !this.app.isTouch || this.app.pointer.down;
    this.reticle.position.x = damp(this.reticle.position.x, this.gaze.x, 14, dt);
    this.reticle.position.z = damp(this.reticle.position.z, this.gaze.z, 14, dt);
    this.reticle.rotation.z -= dt * (1 + hold.progress * 8 + (this.painting ? 6 : 0));
    this.reticle.material.opacity = damp(this.reticle.material.opacity, showReticle ? 0.35 + hold.progress * 0.5 + (this.painting ? 0.4 : 0) : 0, 8, dt);
    this.reticle.scale.setScalar(1 - hold.progress * 0.35);
    this.grade.ca = 0.012 + hold.progress * 0.04 + (this.painting ? 0.02 : 0);
    this.chakra = clamp(this.chakra + dt * 7, 0, 100);
    this.fill.style.width = `${this.chakra}%`;
    this.fill.classList.toggle('low', this.chakra < COST);
    this.chakraTxt.textContent = Math.round(this.chakra);

    const low = this.app.low;
    this.field.begin();
    for (let i = this.sources.length - 1; i >= 0; i--) {
      const src = this.sources[i];
      src.life -= dt;
      src.s = damp(src.s, src.life > 1 ? src.strength : 0, src.life > 1 ? 1.5 : 4, dt);
      if (src.life <= 0) { this.sources.splice(i, 1); continue; }

      // burn attached object
      if (src.obj) {
        const u = src.obj.userData;
        u.hp = Math.max(0, u.hp - dt * 0.08);
        src.obj.material.color.copy(u.base).multiplyScalar(0.08 + u.hp * 0.92);
        if (u.hp <= 0 && !u.ash) {
          u.ash = true;
          this.burned++;
          this.app.toast(`Reduced to ash. <b>${this.burned}</b> burned.`, 1800);
        }
        if (u.ash) src.obj.scale.y = damp(src.obj.scale.y, 0.2, 0.6, dt);
        const b = new THREE.Box3().setFromObject(src.obj);
        src.p.y = b.max.y * 0.8;
        src.p.x = src.obj.position.x; src.p.z = src.obj.position.z;
      }

      // flame tongues
      for (const tg of src.tongues) {
        const flick = 0.85 + Math.sin(t * 9 + tg.seed) * 0.1 + Math.sin(t * 23 + tg.seed * 2) * 0.05;
        const r = tg.r * (src.obj ? 1 : 1);
        this.field.push(src.p.x + Math.cos(tg.a) * r, src.obj ? src.p.y - 0.4 : src.p.y, src.p.z + Math.sin(tg.a) * r, tg.w * src.s * 1.6, tg.hgt * src.s * flick * 2.1, tg.seed, Math.min(1, src.s * 1.2));
      }

      // ash / smoke
      const rate = (low ? 14 : 28) * src.s;
      const nEmit = Math.floor(rate * dt + Math.random());
      const spreadR = src.obj ? 1.1 : 0.9;
      for (let k = 0; k < nEmit; k++) {
        const a = rand(0, TAU), r = Math.sqrt(Math.random()) * spreadR;
        this.flames.emit({
          x: src.p.x + Math.cos(a) * r, y: src.p.y + rand(0, 0.2), z: src.p.z + Math.sin(a) * r,
          vx: rand(-0.3, 0.3), vy: rand(1.2, 2.8), vz: rand(-0.3, 0.3),
          life: rand(0.8, 1.6), size: rand(0.7, 1.4) * (1 - r / spreadR * 0.5), color: Math.random() < 0.7 ? this.coreColor : this.coreColor2, grow: -0.6, alpha: 0.95,
        });
      }
      if (Math.random() < dt * 25 * src.s) {
        this.glow.emit({ x: src.p.x + rand(-0.6, 0.6), y: src.p.y + 0.1, z: src.p.z + rand(-0.6, 0.6), vy: rand(0.2, 0.8), life: rand(0.6, 1.2), size: rand(0.6, 1.2), color: this.glowColor, alpha: 0.5, grow: 0.5 });
      }

      // spreading
      src.spread -= dt;
      if (src.spread <= 0 && src.life > 6 && this.sources.length < this.maxSources) {
        src.spread = rand(4, 8);
        const a = rand(0, TAU);
        const np = src.p.clone().add(new THREE.Vector3(Math.cos(a) * rand(1.2, 2), 0, Math.sin(a) * rand(1.2, 2)));
        np.y = 0;
        // catch nearby objects
        const near = this.burnables.find((o) => !o.userData.burning && o.userData.hp > 0 && o.position.distanceTo(np) < 1.8);
        this.ignite(near ? near.position : np, { strength: src.strength * 0.85, obj: near || null, silent: true });
      }
    }
    this.field.end();
    this.flameCount.textContent = String(this.sources.length);

    // purple-crimson light from the three strongest flames
    const top = [...this.sources].sort((a, b) => b.s - a.s).slice(0, 3);
    this.lights.forEach((l, i) => {
      const src = top[i];
      l.intensity = damp(l.intensity, src ? (6 + Math.sin(t * 13 + i * 3) * 2) * src.s : 0, 5, dt);
      if (src) l.position.set(src.p.x, src.p.y + 1, src.p.z);
    });

    // flames darken the sky slightly
    const heat = Math.min(1, this.sources.length / 20);
    this.exposure = 1 - heat * 0.25;

    const pn = this.app.pointer.ndc;
    this.camera.position.x = damp(this.camera.position.x, this.camBase.x + (this.app.isTouch ? 0 : pn.x * 1.2), 2.5, dt);
    this.camera.position.y = damp(this.camera.position.y, this.camBase.y + (this.app.isTouch ? 0 : pn.y * 0.6), 2.5, dt);
    this.camera.position.z = this.camBase.z;
    this.camera.lookAt(this.look);

    this.flames.update(dt, t);
    this.glow.update(dt, t);
  }

  resize(w, hh) {
    super.resize(w, hh);
    const portrait = w / hh < 0.9;
    this.camBase.set(0, portrait ? 9 : 5.8, portrait ? 18 : 12.5);
  }
}
