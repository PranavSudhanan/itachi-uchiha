import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { voice } from '../core/Voice.js';
import { ParticlePool } from '../objects/Particles.js';
import { FlameField } from '../objects/FlameField.js';
import { createItachi, preloadItachi } from '../objects/ItachiGLB.js';
import { CineCam } from '../core/CineCam.js';
import { Shockwave } from '../objects/Shockwave.js';
import { drawTexture, rand, damp, TAU, h, clamp, sharinganTexture } from '../core/utils.js';
import { overcastSky, mountainRing, deadTree3D } from '../objects/Storm.js';
import { createGrass } from '../objects/Nature.js';

const COST = 18;
const STRAIN_STAGES = [
  { at: 0.25, k: 'r', msg: 'Blood runs from his right eye. <b>Amaterasu</b> is burning through his sight.' },
  { at: 0.45, k: 'r', msg: 'The bleeding worsens. Every flame costs him more of his sight.' },
  { at: 0.65, k: 'both', msg: 'Both eyes bleed and his vision is failing. <b>Swipe down</b> to close the eye and rest.' },
  { at: 0.85, k: 'both', msg: 'He can barely see. Close the eye before the light is gone for good.' },
];
const SAFE = 4; // the flames (a tongue reaches ~1.5 m) never burn this close to Itachi

export class Amaterasu extends Chapter {
  constructor(app) {
    super(app, { id: 'amaterasu', title: 'Amaterasu', jp: '天照' });
    this.shiftView = 0.12;
    this.mood = 'tension';
    this.bloom = { strength: 0.6, radius: 0.5, threshold: 0.7 };
    this.sources = [];
    this.chakra = 100;
    this.strain = 0; // 0..1: how hard the Mangekyō has been pushed
    this.restT = 0;
    this.burned = 0;
    this.maxSources = app.low ? 26 : 48;
  }

  load() { return preloadItachi(); }

  build() {
    const s = this.scene;
    // a desolate plain under a heavy overcast, the sun a dim patch behind the cloud
    const sunDir = new THREE.Vector3(-0.5, 0.35, -0.8);
    this.sky = overcastSky(sunDir);
    s.add(this.sky);
    s.fog = new THREE.Fog(0x4e4843, 16, 58);
    s.add(mountainRing(66, 0x4a4541, 0.55));

    s.add(new THREE.HemisphereLight(0xc8c2bc, 0x3a2f28, 1.3));
    const sun = new THREE.DirectionalLight(0xffe8d0, 1.0);
    sun.position.copy(sunDir).multiplyScalar(16).setY(10);
    sun.castShadow = !this.app.low;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 40 });
    s.add(sun);

    // ground (cracked earth)
    const tex = drawTexture(1024, 1024, (x, w) => {
      x.fillStyle = '#6a5e52'; x.fillRect(0, 0, w, w);
      // patches of paler dust and darker earth
      for (let i = 0; i < 60; i++) {
        const cx = rand(0, w), cy = rand(0, w), r = rand(60, 200), l = rand(80, 125);
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${l},${l * 0.9},${l * 0.78},0.35)`); g.addColorStop(1, `rgba(${l},${l * 0.9},${l * 0.78},0)`);
        x.fillStyle = g; x.fillRect(0, 0, w, w);
      }
      // grit; a small palette of styles, since parsing a new colour string per speck is the slow part
      const grit = Array.from({ length: 32 }, () => { const v = rand(70, 130); return `rgba(${v | 0},${(v * 0.9) | 0},${(v * 0.78) | 0},${rand(0.1, 0.4).toFixed(2)})`; });
      for (let i = 0; i < 12000; i++) {
        x.fillStyle = grit[i & 31];
        x.fillRect(rand(0, w), rand(0, w), rand(1, 3), rand(1, 3));
      }
      // crazed mud: a web of cracks round irregular cells
      const pts = Array.from({ length: 170 }, () => [rand(0, w), rand(0, w)]);
      x.strokeStyle = 'rgba(28,22,18,0.6)';
      for (const [px, py] of pts) {
        const near = pts.map((q) => [q, Math.hypot(q[0] - px, q[1] - py)]).sort((a, b) => a[1] - b[1]).slice(1, 4);
        for (const [[qx, qy]] of near) {
          x.lineWidth = rand(0.6, 1.8);
          x.beginPath(); x.moveTo(px, py);
          const mx = (px + qx) / 2 + rand(-14, 14), my = (py + qy) / 2 + rand(-14, 14);
          x.quadraticCurveTo(mx, my, qx, qy); x.stroke();
        }
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 14);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    s.add(this.ground);

    // dry, dead grass in tufts across the plain
    const grass = createGrass({ count: this.app.low ? 1500 : 3500, area: 44, center: new THREE.Vector3(0, 0, -4), tip: 0x9a8a62, base: 0x3e3424, height: [0.2, 0.55] });
    s.add(grass);
    // bare, dead trees round the edge of the field
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x3a302a, roughness: 1 });
    for (let i = 0; i < (this.app.low ? 7 : 12); i++) {
      const a = rand(-Math.PI * 1.05, Math.PI * 0.05), r = rand(17, 30);
      const tree = deadTree3D(barkMat, rand(5, 9));
      tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 4);
      tree.rotation.y = rand(0, TAU);
      s.add(tree);
    }
    // ash drifting down out of the grey
    this.ash = new ParticlePool({ count: 300, blending: THREE.NormalBlending, drag: 0.6, turbulence: 0.8, softness: 1.2 });
    s.add(this.ash.points);
    this.ashCols = [new THREE.Color(0x3a3634), new THREE.Color(0x77706a), new THREE.Color(0x1e1a1a)];

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
    const n = this.app.low ? 1000 : 2400;
    this.flames = new ParticlePool({ count: n, blending: THREE.NormalBlending, rim: 0x2a0620, rimAmount: 0.55, softness: 0.7, buoyancy: 1.8, drag: 1.6, turbulence: 2.6 });
    this.glow = new ParticlePool({ count: 400, buoyancy: 1.2, drag: 1.5, turbulence: 1.5, softness: 2 });
    // black smoke rolling off the top of the flames, and a few crimson sparks
    this.smoke = new ParticlePool({ count: this.app.low ? 300 : 700, blending: THREE.NormalBlending, softness: 2.4, buoyancy: 1.0, drag: 0.9, turbulence: 1.4 });
    this.sparks = new ParticlePool({ count: 300, buoyancy: 0.6, drag: 0.6, turbulence: 2.5 });
    s.add(this.smoke.points, this.glow.points, this.flames.points, this.sparks.points);
    this.smokeCols = [0x0d080b, 0x160c12, 0x0a0608].map((c) => new THREE.Color(c));
    this.sparkCols = [0xff2a48, 0xb01030].map((c) => new THREE.Color(c));
    this.coreColor = new THREE.Color(0x020003);
    this.coreColor2 = new THREE.Color(0x0c0210);
    this.glowColor = new THREE.Color(0x3a0418);

    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0x7a1040, 0, 9, 1.6);
      s.add(l);
      return l;
    });

    // shader flames: a lightless body with faint charcoal-violet turbulence and a broken crimson edge;
    // they writhe slower and heavier than ordinary fire
    this.field = new FlameField(this.app.low ? 220 : 440, { core: 0x010002, edge: 0x1c0b22, glow: 0x9a1236, glowAmt: 1.3, speed: 0.65 });
    s.add(this.field.mesh);

    // gaze reticle: where the Mangekyō is focused
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 48), new THREE.MeshBasicMaterial({ map: sharinganTexture('mangekyo'), color: 0xff3040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.position.y = 0.03;
    s.add(this.reticle);
    this.gaze = new THREE.Vector3(0, 0, -3);

    // Itachi stands at the edge of the field, casting with his right eye
    this.itachi = createItachi({ castShadow: !this.app.low });
    this.itachi.root.position.set(3.4, 0, 2.4);
    this.itachi.root.rotation.y = Math.atan2(-1.5 - 3.4, -4 - 2.4);
    this.itachi.root.scale.setScalar(1.25);
    this.itachi.setEyes('mangekyo');
    s.add(this.itachi.root);
    this.coverT = 0;
    this.focusT = 0;
    this.lastPaint = new THREE.Vector3(999, 0, 999);

    this._vig0 = this.grade.vig;
    // the flames' low crimson light on his face in the strain close-ups, so the blood reads in the shadow
    this.faceLight = new THREE.PointLight(0xff4a3a, 0, 1.6, 2);
    s.add(this.faceLight);
    this.cine = new CineCam(this.camera);
    this.shock = new Shockwave({ dark: true, color: 0x9a1040, reach: 7, speed: 0.85 });
    s.add(this.shock.mesh);

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
      h('div.pill.meter', {},
        h('div.meter-label', {}, h('span', { text: 'Chakra' }), this.chakraTxt = h('span', { text: '100' })), h('div.meter-track', {}, this.fill),
        h('div.meter-label.strain-label', {}, h('span', { text: 'Eye strain' })), h('div.meter-track.strain-track', {}, this.strainFill = h('div.meter-fill.strain'))),
      h('div.pill', {}, 'Flames', this.flameCount),
    ));
    this.ui.append(h('div.controls', {},
      this.button('Ring of fire', () => this.ring(), 'btn-primary'),
    ));
  }

  /** Pushes a point out to SAFE from Itachi (the black flames would consume their caster too). */
  _keepAway(p) {
    const r = this.itachi.root.position;
    let dx = p.x - r.x, dz = p.z - r.z;
    const d = Math.hypot(dx, dz);
    if (d >= SAFE) return p;
    if (d < 1e-3) { dx = -r.x; dz = -3 - r.z; } // straight toward the field
    const k = SAFE / Math.max(Math.hypot(dx, dz), 1e-3);
    p.x = r.x + dx * k; p.z = r.z + dz * k;
    return p;
  }

  _nearItachi(p, margin = 0) {
    const r = this.itachi.root.position;
    return Math.hypot(p.x - r.x, p.z - r.z) < SAFE + margin;
  }

  ignite(point, { strength = 1, obj = null, silent = false, ring = false } = {}) {
    // never on or next to Itachi: a burnable that close is left alone, the flame lands at a safe distance
    if (obj && this._nearItachi(obj.position)) obj = null;
    if (!obj) point = this._keepAway(point.clone());
    if (this.sources.length >= this.maxSources) {
      // make room by letting the oldest free flame go (never a flame of the ring)
      const i = this.sources.findIndex((src) => !src.ring);
      this.sources.splice(i >= 0 ? i : 0, 1);
    }
    // mostly low, broad tongues that merge into one mass, with a couple of tall licks
    const tongues = Array.from({ length: obj ? 10 : 9 }, (_, k) => ({
      a: rand(0, TAU), r: k === 0 ? 0 : rand(0.15, obj ? 0.95 : 0.8), w: rand(0.9, 1.5),
      hgt: k < 2 ? rand(1.5, 2.1) : rand(0.6, 1.3), seed: rand(0, 100),
    }));
    this.sources.push({ p: point.clone(), s: 0.1, strength, life: rand(18, 26), spread: rand(3, 6), obj, tongues, ring });
    if (obj) obj.userData.burning = true;
    if (!silent) {
      // the first burst of a stare is named aloud; follow-ups just catch
      if (voice.say('amaterasu', { cooldown: 9 }) || strength >= 1.2) this.app.sfx.amaterasu();
      else this.app.sfx.flame();
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
    this.strain = Math.min(1, this.strain + amount * 0.002);
    if (!quiet) this.app.bleed();
    return true;
  }

  /** The moments the strain crosses a threshold: blood, a toast, a hand to the eye. */
  /**
   * The price of Amaterasu, in stages: as the strain climbs the right eye bleeds, the bleeding worsens,
   * both eyes bleed, and his sight fails. Each stage is shown as a cinematic with the blood welling up
   * afresh. Once the eye has rested (strain back near zero) the stages begin again, so every bout of use
   * shows them; pushed to the last stage and kept there, it comes back every 30 s.
   */
  _strainBeats(dt) {
    const i = this._stage ?? -1;
    if (this.strain < 0.12 && i >= 0) { this._stage = -1; return; }
    const next = STRAIN_STAGES[i + 1];
    let show = null;
    if (next && this.strain > next.at) { this._stage = i + 1; show = next; this._stageT = 0; }
    else if (!next && i >= 0) {
      // at the last stage and still pushing: the price is shown again
      const using = this.painting || this.sources.length > 0;
      this._stageT = (this._stageT || 0) + (using ? dt : 0);
      if (this._stageT > 30) { this._stageT = 0; show = STRAIN_STAGES[i]; }
    }
    if (show) this._pendingStrain = show;
    // shown as soon as no other cinematic is running
    if (this._pendingStrain && !this.cine.active) {
      const { k, msg } = this._pendingStrain;
      this._pendingStrain = null;
      if (this.app.reducedMotion) { this.app.bleed(); this.app.toast(msg, 3000); this.coverT = Math.max(this.coverT, 2.4); }
      else this._strainCinematic(k, msg);
    }
  }

  /**
   * The price of the Mangekyō, shown: close on the eye as the blood wells up and runs (both eyes, framed
   * together, when the strain is severe), a slowing heartbeat and the world draining of colour; then a
   * cut to Itachi pressing a hand to the eye with his flames burning on beyond him.
   */
  _strainCinematic(k, msg) {
    const m = this.itachi;
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const both = k === 'both';
    const eye = () => {
      if (!m.eyeWorld) return m.root.localToWorld(V3(0, 1.66, 0.1));
      // the whole face, leaning toward the bleeding eye (his bangs fall over the right eye in a tight shot)
      const r = m.eyeWorld('r', V3()), l = m.eyeWorld('l', V3());
      return l.lerp(r, both ? 0.5 : 0.72);
    };
    const fwd = () => V3(0, 0, 1).applyQuaternion(m.root.quaternion);
    const side = () => V3(1, 0, 0).applyQuaternion(m.root.quaternion);
    this.painting = false;
    this._strainCine = true;
    // the blood wells up afresh for the camera
    const face = m.face;
    if (face) for (const sd of both ? ['r', 'l'] : ['r']) face.blood[sd].flow.value = 0;
    this.app.cinema(true);
    this.cine.play([
      // from a little to his right and below, under the bangs that hang over the right eye
      { t: 0.02, cut: true, pos: () => eye().add(fwd().multiplyScalar(0.7)).add(side().multiplyScalar(both ? 0 : -0.1)).add(V3(0, -0.02, 0)), look: () => eye().add(V3(0, -0.012, 0)), fov: 26 },
      // a slow push, drifting down with the blood
      { t: 2.3, pos: () => eye().add(fwd().multiplyScalar(0.56)).add(side().multiplyScalar(both ? 0 : -0.07)).add(V3(0, -0.03, 0)), look: () => eye().add(V3(0, -0.03, 0)), fov: 21 },
      // cut: from behind his right shoulder, a hand pressed to the eye, the black flames burning on ahead of him
      { t: 2.45, cut: true, pos: () => m.root.position.clone().add(fwd().multiplyScalar(-1.3)).add(side().multiplyScalar(-2.1)).add(V3(0, 1.75, 0)), look: () => m.root.position.clone().add(fwd().multiplyScalar(2.2)).add(V3(0, 1.4, 0)), fov: 38 },
      { t: 3.9, pos: () => m.root.position.clone().add(fwd().multiplyScalar(-1.8)).add(side().multiplyScalar(-2.6)).add(V3(0, 1.95, 0)), look: () => m.root.position.clone().add(fwd().multiplyScalar(2.8)).add(V3(0, 1.2, 0)), fov: 40 },
      { t: 4.9, pos: () => this.camBase.clone(), look: () => this.look.clone(), fov: this.cine.baseFov || this.camera.fov },
    ], {
      events: [
        [0, () => {
          this._cineDim = true;
          this._bloomSave = this._bloomSave || { ...this.bloom };
          this.bloom.strength = Math.min(this.bloom.strength, 0.3);
          this._gradeSave = { sat: this.grade.sat };
          this.grade.sat = 0.55;
          m.setPose('idle', {}, 8);
          this.app.sfx.heartbeat();
          this.app.flash(0.25, 0x300006);
        }],
        [0.35, () => this.app.bleed()],
        [0.9, () => { this.app.sfx.heartbeat(0.75); this.cine.shake = 0.01; }],
        [1.9, () => this.app.sfx.heartbeat(0.55)],
        [2.45, () => {
          this._cineDim = false;
          if (this._bloomSave) { Object.assign(this.bloom, this._bloomSave); this._bloomSave = null; }
          this.coverT = 3.2;
          this.app.toast(msg, 3200);
        }],
      ],
      onEnd: () => {
        this._strainCine = false;
        if (this._gradeSave) { this.grade.sat = this._gradeSave.sat; this._gradeSave = null; }
        this.app.cinema(false);
      },
    });
  }

  /**
   * A complete ring of black flames, out in the field: centred far enough from Itachi that its nearest
   * edge is still SAFE from him, lit in a sweep around the circle. Ring flames hold their line (they
   * neither spread nor get displaced by newer flames).
   */
  ring() {
    if (this.cine.active || !this._spend(45)) return;
    const R = 5, N = this.app.low ? 20 : 24;
    const me = this.itachi.root.position;
    const dir = new THREE.Vector3(-1 - me.x, 0, -4 - me.z).normalize();
    const c = me.clone().setY(0).addScaledVector(dir, R + SAFE + 0.8);
    this._cinematic(c, () => {
      const a0 = Math.atan2(me.z - c.z, me.x - c.x); // start on the side facing him, sweep both ways
      for (let i = 0; i < N; i++) {
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        const a = a0 + (k / N) * TAU;
        const p = new THREE.Vector3(c.x + Math.cos(a) * R, 0, c.z + Math.sin(a) * R);
        setTimeout(() => this.active && this.ignite(p, { silent: i > 0, strength: 0.8, ring: true }), Math.abs(k) * 45);
      }
    }, R);
  }

  enter() { this._cineSeen = false; }

  /**
   * The Amaterasu cinematic: close on his right eye as the Mangekyō turns, the name spoken,
   * then a hard cut to where he looks — black flames erupt with a dark shockwave — and a crane out.
   */
  _cinematic(target, igniteFn, radius = 1.5) {
    const m = this.itachi;
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const eye = () => (m.eyeWorld ? m.eyeWorld('r', V3()) : m.root.localToWorld(V3(0, 1.66, 0.1)));
    const fwd = () => V3(0, 0, 1).applyQuaternion(m.root.quaternion);
    const side = () => V3(1, 0, 0).applyQuaternion(m.root.quaternion);
    const P = target.clone().setY(0);
    const toP = P.clone().sub(m.root.position).setY(0).normalize();
    const across = V3(-toP.z, 0, toP.x);
    const wide = radius > 3;
    this.app.cinema(true);
    this.cine.play([
      { t: 0.02, cut: true, pos: () => eye().add(fwd().multiplyScalar(0.7)).add(side().multiplyScalar(-0.05)).add(V3(0, 0.02, 0)), look: eye, fov: 26 },
      { t: 1.3, pos: () => eye().add(fwd().multiplyScalar(0.6)).add(side().multiplyScalar(0.02)), look: eye, fov: 18 },
      { t: 1.5, cut: true, pos: P.clone().addScaledVector(toP, -(wide ? 9 : 4.2)).addScaledVector(across, wide ? 3 : 1.3).add(V3(0, wide ? 2.2 : 1.0, 0)), look: P.clone().add(V3(0, 0.9, 0)), fov: 44 },
      { t: 3.0, pos: P.clone().addScaledVector(toP, -(wide ? 13 : 6.5)).addScaledVector(across, wide ? 5 : 2.6).add(V3(0, wide ? 6 : 3.4, 0)), look: P.clone().add(V3(0, 0.5, 0)), fov: 48 },
      { t: 4.1, pos: () => this.camBase.clone(), look: () => this.look.clone(), fov: this.cine.baseFov || this.camera.fov },
    ], {
      events: [
        [0, () => {
          // a close-up in this bright field: pull the exposure and glow down so the face holds detail
          this._cineDim = true;
          this._bloomSave = this._bloomSave || { ...this.bloom };
          this.bloom.strength = Math.min(this.bloom.strength, 0.3);
          m.setPose('idle', {}, 8); // he simply stares; the eye does the work
          m.pulseEyes?.();
          this.app.sfx.mangekyo();
          this.gaze.copy(P);
        }],
        [0.8, () => voice.say('amaterasu', { cooldown: 2 })],
        [1.35, () => { this.app.flash(0.35, 0x2a0010); this.cine.shake = 0.08; }],
        [1.5, () => {
          this._cineDim = false;
          if (this._bloomSave) { Object.assign(this.bloom, this._bloomSave); this._bloomSave = null; }
          igniteFn();
          this.shock.fire(P);
          this.flames.burst(P.clone().add(V3(0, 0.3, 0)), this.app.low ? 90 : 180, { speed: 5.5, up: 6, life: [0.6, 1.5], size: [0.8, 1.9], colors: [this.coreColor, this.coreColor2], grow: -0.3, alpha: 0.95 });
          this.glow.burst(P.clone().add(V3(0, 0.3, 0)), 40, { speed: 4, up: 3, life: [0.6, 1.2], size: [0.8, 1.6], colors: [this.glowColor], alpha: 0.6 });
          this.app.sfx.boom();
          this.cine.shake = 0.35;
        }],
      ],
      onEnd: () => { this.app.cinema(false); if (this.strain > STRAIN_STAGES[0].at) this.coverT = 2.2; },
    });
  }

  extinguish() {
    for (const src of this.sources) src.life = Math.min(src.life, 0.8);
    this.app.toast('The eye closes. The flames recede.');
    this.app.sfx.poof();
  }

  /**
   * Where Itachi's gaze falls: under the pointer, or on a phone with the gyroscope live, wherever the tilt
   * aims it (so the target isn't hidden under a finger; holding anywhere then ignites it there).
   */
  _gazeHit() {
    const gyro = this.app.gyro;
    const ndc = gyro && !this.painting ? this._tiltNdc(gyro) : this.app.pointer.ndc;
    const hit = this.app.raycast(this.burnables, false, ndc)[0];
    if (hit) return { point: hit.point, obj: hit.object };
    const g = this.app.raycast([this.ground], false, ndc)[0];
    return g ? { point: g.point, obj: null } : null;
  }

  _tiltNdc(gyro) {
    this._tn = this._tn || new THREE.Vector2();
    return this._tn.set(THREE.MathUtils.clamp(gyro.x * 0.9, -0.9, 0.9), THREE.MathUtils.clamp(-0.15 - gyro.y * 0.7, -0.85, 0.4));
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

  pointerUp() {
    if (this.painting && this.strain > STRAIN_STAGES[0].at) this.coverT = 1.8; // a hand to the bleeding eye
    this.painting = false;
  }

  swipe(s) {
    if (this.painting || s.vy < 0.6 || Math.abs(s.dy) < Math.abs(s.dx)) return !!this.painting;
    this.extinguish();
    return true;
  }

  click() {
    if (this.cine.active) return;
    const hit = this._gazeHit();
    if (!hit) return;
    if (hit.obj) {
      if (hit.obj.userData.hp <= 0 || !this._spend(COST)) return;
      this.ignite(hit.point.clone(), { obj: hit.obj, strength: 1.2 });
    } else if (this._spend(10)) this.ignite(hit.point, { strength: 0.65 });
    this.focusT = 0.6;
  }
  exit() {
    this.app.canvas.classList.remove('blurred', 'strained');
    this._pendingStrain = null;
    this._stage = -1;
    if (this.cine.active) this.cine.stop();
    this.app.cinema(false);
  }

  update(dt, t) {
    this.sky.userData.uniforms.uTime.value = t;
    // ash: a steady drift, thicker while the black flames burn
    if (Math.random() < dt * (6 + this.sources.length * 1.5)) {
      this.ash.emit({ x: rand(-14, 14), y: rand(5, 9), z: rand(-16, 6), vx: rand(-0.3, 0.3), vy: rand(-0.7, -0.35), vz: rand(-0.2, 0.2), life: rand(5, 9), size: rand(0.03, 0.07), color: this.ashCols[Math.floor(rand(0, 3))], alpha: 0.8 });
    }
    this.ash.update(dt, t);
    const hold = this.trackHold(0.45, !this.painting && !this.cine.active);
    if (hold.fired) {
      const hit = this._gazeHit();
      // the first stare of each visit plays the full cinematic, igniting at its climax
      if (hit && !this._cineSeen && !this.app.reducedMotion && this._spend(hit.obj ? COST : 14)) {
        this._cineSeen = true;
        const obj = hit.obj && hit.obj.userData.hp > 0 ? hit.obj : null;
        const pt = hit.obj ? hit.point.clone() : hit.point.clone();
        this._cinematic(pt, () => this.ignite(pt, { obj, strength: 1.2 }));
      } else if (hit && this._spend(hit.obj ? COST : 14)) {
        this.ignite(hit.obj ? hit.point.clone() : hit.point, { obj: hit.obj && hit.obj.userData.hp > 0 ? hit.obj : null, strength: 1.2 });
        this.painting = true;
        this.lastPaint.copy(hit.point).setY(0);
        this.app.flash(0.15, 0x400010);
      }
    }
    // with the gyroscope the gaze follows the tilt even with no finger down
    if (this.app.gyro && !this.painting && !this.cine.active) { const gh = this._gazeHit(); if (gh) this.gaze.copy(gh.point); }
    const showReticle = !this.app.isTouch || this.app.pointer.down || !!this.app.gyro;
    this.reticle.position.x = damp(this.reticle.position.x, this.gaze.x, 14, dt);
    this.reticle.position.z = damp(this.reticle.position.z, this.gaze.z, 14, dt);
    this.reticle.rotation.z -= dt * (1 + hold.progress * 8 + (this.painting ? 6 : 0));
    this.reticle.material.opacity = damp(this.reticle.material.opacity, showReticle ? 0.35 + hold.progress * 0.5 + (this.painting ? 0.4 : 0) : 0, 8, dt);
    this.reticle.scale.setScalar(1 - hold.progress * 0.35);
    this.grade.ca = 0.012 + hold.progress * 0.04 + (this.painting ? 0.02 : 0);
    // Itachi: seal raised while focusing, head following the gaze, hand to the bleeding eye afterwards
    {
      const m = this.itachi;
      this.coverT = Math.max(0, this.coverT - dt);
      this.focusT = Math.max(0, this.focusT - dt);
      const focusing = !this._strainCine && (hold.progress > 0 || this.painting || this.focusT > 0 || (this.cine.active && !this._cineDim));
      // during a close-up he stands still, facing the camera; the hand comes up only after the cut
      const closeUp = this._strainCine && this._cineDim;
      const want = focusing ? 'focus' : this.coverT > 0 && !closeUp ? 'coverEye' : 'idle';
      if (m.poseName !== want) m.setPose(want, {}, focusing ? 12 : 5);
      if (closeUp) m.look(0, 0.08);
      else if (want !== 'coverEye') {
        let yaw = Math.atan2(this.gaze.x - m.root.position.x, this.gaze.z - m.root.position.z) - m.root.rotation.y;
        yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        m.look(yaw * 0.85, focusing ? 0.2 : 0.12);
      }
      // a moment's use wets the right eye; sustained use keeps it bleeding, and pushed further both eyes bleed
      m.setBleeding(this.strain > STRAIN_STAGES[0].at, this.strain > STRAIN_STAGES[2].at ? 'both' : 'r');
      if (closeUp && m.eyeWorld) {
        const e = m.eyeWorld('r', new THREE.Vector3());
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(m.root.quaternion), sd = new THREE.Vector3(-1, 0, 0).applyQuaternion(m.root.quaternion);
        this.faceLight.position.copy(e).addScaledVector(f, 0.35).addScaledVector(sd, 0.3).add(new THREE.Vector3(0, -0.12, 0));
      }
      this.faceLight.intensity = damp(this.faceLight.intensity, closeUp ? 2.2 : 0, 6, dt);
      m.update(dt, t);
    }

    // keeping the black flames alive draws on his chakra; it only returns once the eye rests
    const burning = this.sources.reduce((a, s) => a + s.s, 0);
    const upkeep = Math.min(2.4, burning * 0.1);
    const using = this.painting || hold.progress > 0 || this.cine.active;
    this.restT = using || upkeep > 0.3 ? 0 : this.restT + dt;
    this.chakra = clamp(this.chakra - upkeep * dt + (this.restT > 2 ? dt * 2.5 : 0), 0, 100);
    // the eye strains the longer Amaterasu is used and kept burning; the bleeding comes only after a while
    this.strain = clamp(this.strain + (using ? dt * 0.02 : 0) + upkeep * dt * 0.005 - (this.restT > 2 ? dt * 0.03 : 0), 0, 1);
    if (this.chakra <= 0 && this.sources.length && !this._exhausted) {
      this._exhausted = true;
      for (const src of this.sources) src.life = Math.min(src.life, rand(1.5, 3));
      this.app.toast('<b>Chakra exhausted.</b> The black flames die out.');
      this.coverT = 3;
    }
    if (this.chakra > 25) this._exhausted = false;
    this._strainBeats(dt);
    // the meters are written only when they change: a DOM write every frame costs a style pass every frame
    const hud = `${this.chakra.toFixed(1)}|${this.strain.toFixed(3)}`;
    if (hud !== this._hud) {
      this._hud = hud;
      this.fill.style.width = `${this.chakra}%`;
      this.fill.classList.toggle('low', this.chakra < COST);
      this.chakraTxt.textContent = Math.round(this.chakra);
      this.strainFill.style.width = `${this.strain * 100}%`;
    }
    // his sight darkens and blurs at the edges as the strain climbs
    this.grade.vig = this._vig0 + Math.max(0, this.strain - 0.5) * 0.9;
    this.app.canvas.classList.toggle('strained', this.strain > 0.85);

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
      // black smoke from the tips, crimson sparks
      if (Math.random() < dt * (low ? 4 : 8) * src.s) {
        this.smoke.emit({ x: src.p.x + rand(-0.5, 0.5), y: src.p.y + 1.6 * src.s + rand(0, 0.8), z: src.p.z + rand(-0.5, 0.5), vx: rand(-0.3, 0.3), vy: rand(0.9, 1.7), vz: rand(-0.3, 0.3), life: rand(2.5, 4), size: rand(0.8, 1.5), color: this.smokeCols[Math.floor(rand(0, 3))], grow: 1.8, alpha: 0.42 });
      }
      if (Math.random() < dt * 5 * src.s) {
        this.sparks.emit({ x: src.p.x + rand(-0.7, 0.7), y: src.p.y + rand(0.2, 1.2), z: src.p.z + rand(-0.7, 0.7), vx: rand(-0.6, 0.6), vy: rand(1.5, 3), vz: rand(-0.6, 0.6), life: rand(0.8, 1.6), size: rand(0.03, 0.07), color: this.sparkCols[Math.floor(rand(0, 2))], alpha: 1 });
      }
      if (Math.random() < dt * 25 * src.s) {
        this.glow.emit({ x: src.p.x + rand(-0.6, 0.6), y: src.p.y + 0.1, z: src.p.z + rand(-0.6, 0.6), vy: rand(0.2, 0.8), life: rand(0.6, 1.2), size: rand(0.6, 1.2), color: this.glowColor, alpha: 0.5, grow: 0.5 });
      }

      // spreading
      src.spread -= dt;
      if (!src.ring && src.spread <= 0 && src.life > 6 && this.sources.length < this.maxSources) {
        src.spread = rand(4, 8);
        const a = rand(0, TAU);
        const np = src.p.clone().add(new THREE.Vector3(Math.cos(a) * rand(1.2, 2), 0, Math.sin(a) * rand(1.2, 2)));
        np.y = 0;
        if (this._nearItachi(np, 0.4)) continue; // the fire does not creep toward him
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
    this.exposure = (1 - heat * 0.25) * (this._cineDim ? 0.5 : 1);

    this.shock.update(dt);
    if (!this.cine.update(dt)) {
      const pn = this.app.pointer.ndc;
      this.camera.position.x = damp(this.camera.position.x, this.camBase.x + (this.app.isTouch ? 0 : pn.x * 1.2), 2.5, dt);
      this.camera.position.y = damp(this.camera.position.y, this.camBase.y + (this.app.isTouch ? 0 : pn.y * 0.6), 2.5, dt);
      this.camera.position.z = this.camBase.z;
      this.camera.lookAt(this.look);
    }

    this.flames.update(dt, t);
    this.glow.update(dt, t);
    this.smoke.update(dt, t);
    this.sparks.update(dt, t);
  }

  resize(w, hh) {
    super.resize(w, hh);
    const portrait = w / hh < 0.9;
    this.camBase.set(0, portrait ? 9 : 5.8, portrait ? 18 : 12.5);
    this._placeItachi(portrait);
  }

  /**
   * Stands Itachi on the ground at a fixed spot on screen — right of centre, lower half —
   * so he never drifts under the chapter nav (right edge) or the intro text (left), whatever the window size.
   */
  _placeItachi(portrait) {
    if (!this.itachi) return;
    const cam = this.camera.clone();
    cam.position.copy(this.camBase);
    cam.lookAt(this.look);
    cam.updateMatrixWorld();
    // beside the field, not in front of it: from the camera the flames never burn behind him
    const ndc = portrait ? new THREE.Vector2(0.34, -0.12) : new THREE.Vector2(0.44, -0.3);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!hit) return;
    const root = this.itachi.root;
    root.position.set(hit.x, 0, hit.z);
    // face the heart of the field where the flames burn
    root.rotation.y = Math.atan2(-1 - hit.x, -4 - hit.z);
    // nothing that can burn stands beside him: move it out into the field
    for (const o of this.burnables) {
      const dx = o.position.x - hit.x, dz = o.position.z - hit.z;
      const d = Math.hypot(dx, dz);
      if (d >= SAFE + 1.5) continue;
      const fx = -1 - hit.x, fz = -4 - hit.z, fl = Math.hypot(fx, fz) || 1;
      // along the line toward the field, off to the side it already leans to
      const side = Math.sign(dx * fz - dz * fx) || 1;
      o.position.x = hit.x + (fx / fl) * (SAFE + 2) + (-fz / fl) * side * 2.5;
      o.position.z = hit.z + (fz / fl) * (SAFE + 2) + (fx / fl) * side * 2.5;
    }
  }
}
