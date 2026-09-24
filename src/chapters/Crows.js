import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { voice } from '../core/Voice.js';
import { createCrowGeometry, createCrowMaterial, addPhases } from '../objects/Crow.js';
import { ParticlePool } from '../objects/Particles.js';
import { buildDusk } from '../objects/Dusk.js';
import { glowTexture, rand, damp, TAU, h, pointerOnPlane, sampleDrawing, drawAkatsukiCloud, makeCanvas, toScreen, featherTexture } from '../core/utils.js';

const BOUNDS = new THREE.Vector3(15, 7.5, 8);
/** Integer key for the spatial hash (no per-frame string allocation). */
const cellKey = (x, y, z) => ((x + 256) * 512 + (y + 256)) * 512 + (z + 256);

const SHAPES = {
  sharingan: (x, w, hh) => {
    const cx = w / 2, cy = hh / 2, R = hh * 0.46;
    x.lineWidth = hh * 0.06;
    x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.stroke();
    x.beginPath(); x.arc(cx, cy, R * 0.18, 0, TAU); x.fill();
    for (let k = 0; k < 3; k++) {
      const a = (k * TAU) / 3 - Math.PI / 2;
      const tx = cx + Math.cos(a) * R * 0.58, ty = cy + Math.sin(a) * R * 0.58;
      x.beginPath(); x.arc(tx, ty, R * 0.14, 0, TAU); x.fill();
      x.beginPath(); x.arc(cx, cy, R * 0.58, a, a + 0.6); x.lineWidth = hh * 0.05; x.stroke();
    }
  },
  // the crows trace the red cloud's border and its curl: its outline is what makes it the Akatsuki's
  cloud: (x, w, hh) => drawAkatsukiCloud(x, w / 2, hh / 2, hh * 0.42, { outline: true }),
  kanji: (x, w, hh) => {
    x.font = `900 ${hh * 0.95}px "Noto Serif JP", serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('鴉', w / 2, hh / 2 + hh * 0.04);
  },
  name: (x, w, hh) => {
    x.font = `900 ${hh * 0.5}px Cinzel, serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('ITACHI', w / 2, hh / 2);
  },
};

export class Crows extends Chapter {
  constructor(app) {
    super(app, { id: 'crows', title: 'Crows', jp: '鴉' });
    this.bloom = { strength: 0.8, radius: 0.6, threshold: 0.6 };
    this.mode = 'repel';
    this.mood = 'mystic';
    this.formation = null;
    this.formTime = 0;
    this.pointerWorld = new THREE.Vector3(999, 999, 0);
    this.pointerActive = false;
    this.found = false;
  }

  build() {
    const s = this.scene;
    s.fog = new THREE.Fog(0x3a0610, 20, 60);
    // a blood-red dusk: clouds lit around a blood moon, ridges fading into the haze, pines and a bare tree
    this.dusk = buildDusk(s);

    // the Akatsuki emblem itself, glowing up behind the crows as they settle into its outline; drawn on
    // the same canvas mapping as the formation so the two line up exactly
    {
      const [c, x] = makeCanvas(640, 320);
      drawAkatsukiCloud(x, 320, 160, 320 * 0.42);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      // a touch dimmed so the white border doesn't bloom into a halo, and set on a dark patch of sky the
      // way the cloud sits on the black cloak
      this.emblem = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: tex, color: 0xa8a8a8, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      this.emblem.renderOrder = -1;
      this.emblemGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      this.emblemGlow.renderOrder = -2;
      s.add(this.emblemGlow, this.emblem);
    }

    // crows
    this.count = this.app.low ? 160 : 360;
    const geo = createCrowGeometry(0.9);
    addPhases(geo, this.count);
    this.mat = createCrowMaterial({ flap: 12, amp: 0.55 });
    this.flock = new THREE.InstancedMesh(geo, this.mat, this.count);
    this.flock.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) this.flock.setColorAt(i, c.setRGB(0, 0, 0));
    this.flock.setColorAt(0, c.setRGB(0.25, 0.0, 0.02));
    s.add(this.flock);

    this.birds = Array.from({ length: this.count }, () => ({
      p: new THREE.Vector3(rand(-BOUNDS.x, BOUNDS.x), rand(-BOUNDS.y, BOUNDS.y), rand(-BOUNDS.z, BOUNDS.z * 0.5)),
      v: new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).setLength(rand(3, 5)),
      target: null,
    }));
    this.dummy = new THREE.Object3D();

    // Shisui's eye on crow 0
    this.eyeSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff1020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.eyeSprite.scale.setScalar(0.9);
    s.add(this.eyeSprite);

    this.feathers = new ParticlePool({ count: 300, blending: THREE.NormalBlending, gravity: -1.2, drag: 1.5, turbulence: 2, softness: 0.6 });
    s.add(this.feathers.points);
    this.featherColor = new THREE.Color(0x050308);

    // grid for neighbour search
    this.cell = 2.5;
    this.grid = new Map();

    this.camera.position.set(0, 0, 22);
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._buildUI();
    featherTexture();
  }

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 鴉',
      jp: '鴉',
      title: 'Murder of <em>Crows</em>',
      desc: 'Crows were Itachi\'s signature: scouts, clones, and vessels for genjutsu. His body could dissolve into a flock mid-fight. Command them — and see if you can find the one crow carrying Shisui\'s eye.',
      extra: [this.gestures([
        ['draw', '<b>Draw</b> any shape — the crows become it'],
        ['hold', '<b>Hold</b> still to summon a vortex'],
        ['swipe', '<b>Flick</b> to send a gust · <b>tap</b> to scatter'],
      ])],
    });
    this.countEl = h('b', { text: '0' });
    this.ui.append(h('div.hud-corner', {}, h('div.pill', {}, 'Crows', this.countEl)));
    this.countEl.textContent = String(this.app.low ? 160 : 360);


    this.formBtns = {
      sharingan: this.button('写 Sharingan', () => this.form('sharingan')),
      cloud: this.button('☁ Akatsuki', () => this.form('cloud')),
      kanji: this.button('鴉 Crow', () => this.form('kanji')),
      name: this.button('Name', () => this.form('name')),
    };
    this.ui.append(h('div.controls', {},
      h('div.group', {}, h('span.label', { text: 'Form' }), ...Object.values(this.formBtns)),
      this.button('Scatter!', () => this.scatter(new THREE.Vector3(0, 0, 0), 14), 'btn-primary'),
    ));
  }

  form(name) {
    if (this.formation === name) { this.release(); return; }
    const aspect = this.app.width / this.app.height;
    const W = aspect < 0.9 ? 13 : 18;
    const ox = aspect > 1.1 ? 3.5 : 0;
    const pts = sampleDrawing(SHAPES[name], this.count, 320, name === 'name' ? 110 : 160);
    const oy = aspect < 0.9 ? 1 : 0.5;
    // on the outline the crows hold a tight line so the shape reads crisply
    const depth = name === 'cloud' ? 0.25 : 0.6;
    this.birds.forEach((b, i) => { b.target = new THREE.Vector3(pts[i][0] * W + ox, pts[i][1] * W + oy, rand(-depth, depth)); });
    if (name === 'cloud') {
      this.emblem.scale.set(W, W, 1);
      this.emblem.position.set(ox, oy, -0.9);
      this.emblemGlow.position.set(ox, oy, -1.2);
      this.emblemGlow.scale.set(W * 0.95, W * 0.6, 1);
      this.app.toast('<b>暁 · Akatsuki</b> — the red cloud of the Akatsuki. Itachi wore it for years, a spy for the Leaf inside the organisation that hunted it.', 5200);
    }
    this.formation = name;
    this.formTime = 0;
    for (const [k, b] of Object.entries(this.formBtns)) b.classList.toggle('active', k === name);
    this.app.sfx.flutter();
    this.app.sfx.caw();
  }

  release() {
    this.formation = null;
    this.birds.forEach((b) => { b.target = null; });
    for (const b of Object.values(this.formBtns)) b.classList.remove('active');
  }

  scatter(center, force) {
    this.release();
    for (const b of this.birds) {
      const d = b.p.clone().sub(center);
      const l = Math.max(1, d.length());
      b.v.addScaledVector(d.normalize(), force * (6 / l + 0.4));
    }
    for (let i = 0; i < 40; i++) {
      const b = this.birds[Math.floor(rand(0, this.count))];
      this.feathers.emit({ x: b.p.x, y: b.p.y, z: b.p.z, vx: rand(-2, 2), vy: rand(-1, 2), vz: rand(-2, 2), life: rand(1.5, 3), size: rand(0.12, 0.22), color: this.featherColor, alpha: 0.9 });
    }
    this.app.sfx.flutter();
    for (let i = 0; i < 3; i++) setTimeout(() => this.app.sfx.caw(), i * 140);
  }

  _shisuiScreen() {
    return toScreen(this.birds[0].p, this.camera, this.app.width, this.app.height);
  }

  pointerDown(p) {
    this.pointerActive = true;
    pointerOnPlane(p.ndc, this.camera, this.plane, this.pointerWorld);
  }

  pointerMove(p) {
    this.pointerActive = !this.app.isTouch || p.down;
    pointerOnPlane(p.ndc, this.camera, this.plane, this.pointerWorld);
    const sc = this._shisuiScreen();
    this.app.setHover(Math.hypot(sc.x - p.x, sc.y - p.y) < 40);
  }

  pointerUp(p) {
    if (this.app.isTouch) this.pointerActive = false;
    this.vortexOn = false;
    this._drew = false;
    // turn a drawn stroke into a formation
    const path = p.path;
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    const straight = Math.hypot(path[path.length - 1].x - path[0].x, path[path.length - 1].y - path[0].y);
    if (len > 150 && (straight / len < 0.8 || len > 480)) {
      this._drew = true;
      this.formPath(path);
    }
  }

  /** Crows spread evenly along a drawn screen-space stroke. */
  formPath(path) {
    const world = [];
    const v = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    for (let i = 0; i < path.length; i += 1) {
      ndc.set((path[i].x / this.app.width) * 2 - 1, -(path[i].y / this.app.height) * 2 + 1);
      if (pointerOnPlane(ndc, this.camera, this.plane, v)) world.push(v.clone());
    }
    if (world.length < 2) return;
    const cum = [0];
    for (let i = 1; i < world.length; i++) cum.push(cum[i - 1] + world[i].distanceTo(world[i - 1]));
    const total = cum[cum.length - 1];
    let seg = 0;
    this.birds.forEach((b, i) => {
      const d = (i / this.count) * total;
      while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
      const k = (d - cum[seg]) / Math.max(1e-4, cum[seg + 1] - cum[seg]);
      b.target = world[seg].clone().lerp(world[seg + 1], k).add(new THREE.Vector3(rand(-0.35, 0.35), rand(-0.35, 0.35), rand(-0.8, 0.8)));
    });
    this.formation = 'drawing';
    this.formTime = -2;
    for (const b of Object.values(this.formBtns)) b.classList.remove('active');
    this.app.sfx.flutter();
    this.app.sfx.caw();
  }

  swipe(s) {
    if (this._drew) return true;
    // a gust in the flick direction
    const dir = new THREE.Vector3(s.vx, -s.vy, 0).normalize();
    const from = new THREE.Vector3();
    pointerOnPlane(new THREE.Vector2((s.x0 / this.app.width) * 2 - 1, -(s.y0 / this.app.height) * 2 + 1), this.camera, this.plane, from);
    this.release();
    for (const b of this.birds) {
      const d = b.p.distanceTo(from);
      b.v.addScaledVector(dir, Math.min(16, s.speed * 6) * Math.max(0.25, 1 - d / 20));
    }
    this.app.sfx.whoosh();
    this.app.sfx.flutter();
    return true;
  }

  click(p) {
    const sc = this._shisuiScreen();
    if (Math.hypot(sc.x - p.x, sc.y - p.y) < (this.app.isTouch ? 55 : 40)) {
      this._foundShisui();
      return;
    }
    pointerOnPlane(p.ndc, this.camera, this.plane, this.pointerWorld);
    this.scatter(this.pointerWorld, 8);
  }

  _foundShisui() {
    this.app.sfx.mangekyo();
    voice.say('kotoamatsukami', { cooldown: 10, subtitle: false });
    this.app.toast(this.found
      ? '<b>別天神 · Kotoamatsukami</b><br>Shisui\'s eye is still watching over the Leaf.'
      : '<b>You found Shisui\'s crow!</b><br>Itachi hid Shisui\'s Mangekyō — and its Kotoamatsukami genjutsu — inside a crow he gave to Naruto.', 6000);
    this.found = true;
    this.birds[0].v.set(0, 12, 0);
    this.eyeSprite.scale.setScalar(4);
  }

  _rebuildGrid() {
    for (const arr of this.grid.values()) arr.length = 0;
    const c = this.cell;
    this.birds.forEach((b, i) => {
      const k = cellKey(Math.floor(b.p.x / c), Math.floor(b.p.y / c), Math.floor(b.p.z / c));
      let arr = this.grid.get(k);
      if (!arr) this.grid.set(k, (arr = []));
      arr.push(i);
    });
  }

  update(dt, t) {
    this.dusk.sky.userData.uniforms.uTime.value = t;
    const hold = this.trackHold(0.55, true, 0.2);
    if (hold.fired) { this.vortexOn = true; this.release(); this.app.sfx.flutter(); }
    if (!this.app.pointer.down) this.vortexOn = false;
    this.mode = this.vortexOn ? 'attract' : 'repel';
    if (this.vortexOn) this.pointerActive = true;
    this._rebuildGrid();
    const c = this.cell;
    const sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3(), tmp = new THREE.Vector3();
    const pw = this.pointerWorld;
    const maxSpeed = this.formation ? 14 : 7;

    this.birds.forEach((b, i) => {
      const acc = tmp.set(0, 0, 0);
      if (b.target) {
        const d = b.target.clone().sub(b.p);
        const dist = d.length();
        const desired = d.setLength(Math.min(maxSpeed, dist * 2.2));
        acc.addScaledVector(desired.sub(b.v), 3.2);
        acc.y += Math.sin(t * 3 + i) * 0.6;
      } else {
        sep.set(0, 0, 0); ali.set(0, 0, 0); coh.set(0, 0, 0);
        let n = 0;
        const cx = Math.floor(b.p.x / c), cy = Math.floor(b.p.y / c), cz = Math.floor(b.p.z / c);
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
          const arr = this.grid.get(cellKey(cx + x, cy + y, cz + z));
          if (!arr) continue;
          for (const j of arr) {
            if (j === i) continue;
            const o = this.birds[j];
            const dx = b.p.x - o.p.x, dy = b.p.y - o.p.y, dz = b.p.z - o.p.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > c * c || n > 14) continue;
            n++;
            if (d2 < 0.8) { sep.x += dx / (d2 + 0.01); sep.y += dy / (d2 + 0.01); sep.z += dz / (d2 + 0.01); }
            ali.add(o.v);
            coh.add(o.p);
          }
        }
        if (n) {
          ali.divideScalar(n).sub(b.v).multiplyScalar(0.9);
          coh.divideScalar(n).sub(b.p).multiplyScalar(0.55);
          acc.add(ali).add(coh).addScaledVector(sep, 1.4);
        }
        // soft bounds
        if (Math.abs(b.p.x) > BOUNDS.x) acc.x -= Math.sign(b.p.x) * 6;
        if (Math.abs(b.p.y) > BOUNDS.y) acc.y -= Math.sign(b.p.y) * 6;
        if (b.p.z > BOUNDS.z * 0.6 || b.p.z < -BOUNDS.z) acc.z -= Math.sign(b.p.z + BOUNDS.z * 0.2) * 6;
        // gentle global swirl
        acc.x += -b.p.y * 0.05;
        acc.y += b.p.x * 0.03;
      }
      // pointer interaction
      if (this.pointerActive) {
        const dx = b.p.x - pw.x, dy = b.p.y - pw.y, dz = b.p.z * 0.4;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (this.mode === 'repel' && d2 < 16) {
          const k = (16 - d2) * 1.4;
          acc.x += dx * k * 0.25; acc.y += dy * k * 0.25;
        } else if (this.mode === 'attract' && !b.target) {
          const d = Math.sqrt(d2) + 0.001;
          acc.x += (-dx / d) * 5 + (-dy / d) * 6;
          acc.y += (-dy / d) * 5 + (dx / d) * 6;
          acc.z += -b.p.z * 0.5;
        }
      }
      b.v.addScaledVector(acc, dt);
      const sp = b.v.length();
      if (sp > maxSpeed) b.v.multiplyScalar(maxSpeed / sp);
      else if (sp < 2 && !b.target) b.v.multiplyScalar(2 / Math.max(sp, 0.01));
      b.p.addScaledVector(b.v, dt);

      this.dummy.position.copy(b.p);
      const look = b.target && b.v.lengthSq() < 1 ? tmp.set(b.p.x, b.p.y, b.p.z + 1) : tmp.copy(b.p).add(b.v);
      this.dummy.lookAt(look);
      this.dummy.updateMatrix();
      this.flock.setMatrixAt(i, this.dummy.matrix);
    });
    this.flock.instanceMatrix.needsUpdate = true;
    this.mat.uniforms.uFlap.value = this.formation ? 16 : 12;

    if (this.formation) {
      this.formTime += dt;
      if (this.formTime > (this.formation === 'cloud' ? 9 : 7)) this.release();
    }
    const showEmblem = this.formation === 'cloud' && this.formTime > 1.2;
    this.emblem.material.opacity = damp(this.emblem.material.opacity, showEmblem ? 1 : 0, showEmblem ? 1.5 : 4, dt);
    this.emblemGlow.material.opacity = this.emblem.material.opacity * 0.85;
    this.emblem.visible = this.emblemGlow.visible = this.emblem.material.opacity > 0.01;

    const b0 = this.birds[0];
    this.eyeSprite.position.copy(b0.p).addScaledVector(b0.v.clone().normalize(), 0.3);
    this.eyeSprite.scale.setScalar(damp(this.eyeSprite.scale.x, 0.9 + Math.sin(t * 4) * 0.15, 3, dt));

    const pn = this.app.pointer.ndc;
    this.camera.position.x = damp(this.camera.position.x, this.app.isTouch ? 0 : pn.x * 1.2, 2, dt);
    this.camera.position.y = damp(this.camera.position.y, this.app.isTouch ? 0 : pn.y * 0.8, 2, dt);
    this.camera.lookAt(0, 0, 0);

    this.feathers.update(dt, t);
  }

  resize(w, hh) {
    super.resize(w, hh);
    const aspect = w / hh;
    this.camera.position.z = aspect < 0.9 ? 30 : 22;
  }
}
