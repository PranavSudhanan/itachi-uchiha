import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { voice } from '../core/Voice.js';
import { ParticlePool } from '../objects/Particles.js';
import { CrowBurst } from '../objects/Crow.js';
import { createItachiFigure } from '../objects/Figure.js';
import { kunaiGeometry } from '../objects/Weapons.js';
import { SusanooBody } from '../objects/SusanooBody.js';
import { CineCam } from '../core/CineCam.js';
import { Shockwave } from '../objects/Shockwave.js';
import { stormSky, mountainRing, ruins, wetGround, Bolt } from '../objects/Storm.js';
import { NOISE_GLSL, shared, drawTexture, rand, damp, clamp, TAU, h, lerp, toScreen, glowTexture } from '../core/utils.js';

const STAGES = [
  ['Itachi', 'Itachi alone. Throw a kunai… if you dare.'],
  ['Ribcage', 'Stage I — a ribcage of chakra wraps around the user, already an iron wall.'],
  ['Skeleton', 'Stage II — the skull and skeletal arms manifest. It can strike and grab.'],
  ['Warrior', 'Stage III — muscle and a long-nosed, tengu-like face take shape.'],
  ['Armoured', 'Armoured Susanoo — cloaked like a mountain ascetic, wielding the Totsuka Blade and the Yata Mirror.'],
];
/** The final stage when the Perfect Susanoo model is present. */
const PERFECT = ['Perfect', 'Perfect Susanoo — a towering winged warrior in full form, wielding the Totsuka Blade and the Yata Mirror.'];
const HIT_RADIUS = [0.7, 3.0, 3.3, 3.8, 4.4];
const V0 = new THREE.Vector3();

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Susanoo extends Chapter {
  constructor(app) {
    super(app, { id: 'susanoo', title: 'Susanoo', jp: '須佐能乎' });
    this.shiftView = 0.12;
    this.bloom = { strength: 0.8, radius: 0.55, threshold: 0.72 };
    this.mood = 'tension';
    this.game = { on: false };
    this.enemies = [];
    this.shots = [];
    this.nextBolt = 6;
    try { this.best = +localStorage.getItem('itachi-susanoo') || 0; } catch (_) { this.best = 0; }
    this.stage = 0;
    // phones start square on to the Susanoo; larger screens at a three-quarter view
    this.yaw = app.isTouch ? 0 : 0.5;
    this.pitch = 0.12;
    this.yawT = this.yaw;
    this.pitchT = 0.12;
    this.idle = 0;
    this.kunai = [];
    this.slashT = -1;
    this.mirrorT = 0;
    this.shake = 0;
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color(0x07080d);
    s.fog = new THREE.FogExp2(0x0b0c12, 0.02);
    // the ruins of the Uchiha hideout under a thunderstorm
    this.sky = stormSky();
    const wet = wetGround();
    s.add(this.sky, mountainRing(), ruins(), wet);
    this.reflective = [wet];
    this.shaftSource = () => (this._core2 || (this._core2 = new THREE.Vector3())).set(0, this.camLook || 3, -1.5);
    this.shaftColor = 0xff6a2a;
    this.shaftStrength = 0;
    this.shaftThreshold = 0.7;
    // faint cool light from the cloud cover, so the ruins read against the dark
    const fill = new THREE.DirectionalLight(0x7080a8, 0.35);
    fill.position.set(-10, 20, -15);
    s.add(fill);
    s.add(new THREE.HemisphereLight(0x604050, 0x100508, 0.8));
    this.glowLight = new THREE.PointLight(0xff4a20, 0, 48, 1.2);
    this.glowLight.position.set(0, 5, -1.5);
    s.add(this.glowLight);
    const key = new THREE.DirectionalLight(0xffe8e0, 0.8);
    key.position.set(3, 8, 6);
    s.add(key);
    this.lightning = new THREE.DirectionalLight(0xd8e4ff, 0);
    this.lightning.position.set(-6, 20, 4);
    s.add(this.lightning);

    const groundTex = drawTexture(1024, 1024, (x, w) => {
      x.fillStyle = '#0d0508'; x.fillRect(0, 0, w, w);
      x.translate(w / 2, w / 2);
      for (let i = 0; i < 6; i++) {
        x.strokeStyle = `rgba(255,60,40,${0.35 - i * 0.05})`;
        x.lineWidth = i === 0 ? 6 : 2;
        x.beginPath(); x.arc(0, 0, 90 + i * 70, 0, TAU); x.stroke();
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        x.strokeStyle = 'rgba(255,60,40,0.12)';
        x.beginPath(); x.moveTo(Math.cos(a) * 90, Math.sin(a) * 90); x.lineTo(Math.cos(a) * 500, Math.sin(a) * 500); x.stroke();
      }
    });
    // the chakra seal: a glow laid over the wet rock, brightening as the Susanoo manifests
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshBasicMaterial({ map: groundTex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.02;
    s.add(ground);
    this.groundMat = ground.material;
    this._buildStorm();
    this._buildEnemies();

    this.figure = createItachiFigure();
    s.add(this.figure);

    // ---- Susanoo (built in objects/SusanooBody.js, modelled on the anime) ----
    this.body = new SusanooBody({ low: this.app.low });
    s.add(this.body.group);
    this.susanoo = this.body.group;
    this.mats = this.body.mats;
    this.bladeMat = this.body.bladeMat;
    this.mirrorMat = this.body.mirrorMat;
    this.rightArm = this.body.rightArm;
    this.leftArm = this.body.leftArm;
    this.mirror = this.body.mirror;
    this.bladeTipLocal = this.body.bladeTipLocal;
    this.cine = new CineCam(this.camera);
    this.shockS = new Shockwave({ color: 0xff6a24, reach: 20, speed: 1.2 });
    s.add(this.shockS.mesh);
    this.stages = this.body.perfect ? [...STAGES.slice(0, 4), PERFECT] : STAGES;
    // FX
    this.embers = new ParticlePool({ count: this.app.low ? 500 : 1200, buoyancy: 1.2, turbulence: 1.5, drag: 0.6 });
    this.sparks = new ParticlePool({ count: 600, gravity: -8, drag: 0.8 });
    s.add(this.embers.points, this.sparks.points);
    this.emberColors = [new THREE.Color(0xff6a20), new THREE.Color(0xff2a10), new THREE.Color(0xffc060)];
    this.crows = new CrowBurst(36, 0.6);
    s.add(this.crows.mesh);

    // kunai mesh
    const ks = new THREE.Shape();
    ks.moveTo(0, 0.5); ks.lineTo(0.09, 0.12); ks.lineTo(0.03, 0); ks.lineTo(-0.03, 0); ks.lineTo(-0.09, 0.12); ks.closePath();
    const kg = new THREE.ExtrudeGeometry(ks, { depth: 0.015, bevelEnabled: false });
    kg.translate(0, -0.2, 0);
    kg.rotateX(Math.PI / 2);
    this.kunaiGeo = kg;
    this.kunaiMat = new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.9, roughness: 0.3, emissive: 0x222222 });

    this.ray = new THREE.Raycaster();
    this._buildUI();
    this.setStage(0, true);
  }

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 須佐能乎',
      jp: '須佐能乎',
      title: 'The <em>Susanoo</em>',
      desc: 'Awakening both Mangekyō grants the ultimate defence: a spectral warrior of chakra. Itachi\'s carries the Totsuka Blade, which seals whatever it pierces, and the Yata Mirror, which changes nature to deflect any attack.',
      extra: [this.gestures([
        ['swipe', '<b>Swipe up</b> to manifest · <b>down</b> to recede'],
        ['swipe', '<b>Slash</b> sideways — Totsuka Blade'],
        ['hold', '<b>Hold</b> — raise the Yata Mirror'],
        ['tap', '<b>Tap</b> to throw a kunai · <b>drag</b> to orbit'],
      ])],
    });
    this.stagePill = h('b', { text: 'Itachi' });
    this.stageHud = h('div.hud-corner', {}, h('div.pill', {}, 'Stage', this.stagePill));
    this.ui.append(this.stageHud);
    this.stageBtns = STAGES.map(([name], i) => this.button(i === 0 ? 'Itachi' : ['I', 'II', 'III', 'IV'][i - 1], () => this.setStage(i)));
    this.stageBtns.forEach((b, i) => b.setAttribute('title', this.stages[i][0]));
    this.controlsEl = h('div.controls', {},
      h('div.group', {}, h('span.label', { text: 'Stage' }), ...this.stageBtns),
      this.button('⚔ Hold the Line', () => this.startGame(), 'btn-primary'),
    );
    this.ui.append(this.controlsEl);

    // defence game HUD
    this.hpFill = h('div.meter-fill');
    this.ckFill = h('div.meter-fill');
    this.sealedEl = h('b', { text: '0' });
    this.waveEl = h('b', { text: '1' });
    this.gameHud = h('div.hud-corner', { style: 'display:none' },
      h('div.pill', {}, 'Sealed', this.sealedEl),
      h('div.pill', {}, 'Wave', this.waveEl),
      h('div.pill.bar', {}, h('div.meter-label', {}, h('span', { text: 'Susanoo' })), h('div.meter-track', {}, this.hpFill)),
      h('div.pill.bar', {}, h('div.meter-label', {}, h('span', { text: 'Chakra' })), h('div.meter-track', {}, this.ckFill)),
    );
    this.ui.append(this.gameHud);
    this.gameCard = h('div.game-card.pe.hidden', {},
      h('div.card-jp', { text: '十拳剣 · 八咫鏡' }),
      this.gameTitle = h('h3', { text: 'Hold the Line' }),
      this.gameBig = h('div.big', { style: 'display:none' }),
      this.gameText = h('p', { html: 'Shadow shinobi close in from the storm. <b>Slash</b> across them to seal them with the Totsuka Blade. <b>Hold</b> to raise the Yata Mirror and reflect their attacks.' }),
      h('div', { style: 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap' },
        this.gameBtn = this.button('Begin', () => this._beginGame(), 'btn-primary'),
        this.button('Leave', () => this.endGame(true))),
    );
    this.ui.append(this.gameCard);
  }

  setStage(i, silent = false) {
    const prev = this.stage;
    if (!silent && this.cine.active) return; // a manifestation is already playing out
    // manifesting plays a cinematic that applies the stage at its beat
    if (!silent && i > prev && !this.game.on && !this.app.reducedMotion) {
      if (prev === 0) { this._cineAwaken(i); return; }
      if (i === 4) { this._cinePerfect(); return; }
    }
    this._applyStage(i, silent, prev);
  }

  _applyStage(i, silent, prev, { quietVoice = false } = {}) {
    this.stage = i;
    this.stageBtns.forEach((b, k) => b.classList.toggle('active', k === i));
    this.stagePill.textContent = this.stages[i][0];
    if (!silent) {
      this.app.toast(this.stages[i][1], 3600);
      if (i > prev) { if (prev === 0 && !quietVoice) voice.say('susanoo', { cooldown: 6 }); this.app.sfx.susanoo(); this.shake = 0.5; this.app.bleed(); this.manifestT = 1.6; }
      else this.app.sfx.whoosh();
      if (i > 0) this.embers.burst(V(0, 2, 0), 150, { speed: 7, up: 3, life: [0.6, 1.6], size: [0.06, 0.18], colors: this.emberColors });
    }
  }

  /** Where the orbit camera wants to be right now (cinematics end exactly there). */
  _orbitPos() {
    return V(
      Math.sin(this.yaw) * Math.cos(this.pitch) * this.camDist,
      this.camLook + Math.sin(this.pitch) * this.camDist,
      Math.cos(this.yaw) * Math.cos(this.pitch) * this.camDist,
    );
  }

  /** Eyes on Itachi's face: the midpoint between them, and his forward direction. */
  _eyeMid() {
    const m = this.figure.userData.model;
    const r = m && m.eyeWorld ? m.eyeWorld('r', V(0, 0, 0)) : this.figure.localToWorld(V(-0.03, 1.66, 0.1));
    const l = m && m.eyeWorld ? m.eyeWorld('l', V(0, 0, 0)) : this.figure.localToWorld(V(0.03, 1.66, 0.1));
    return r.add(l).multiplyScalar(0.5);
  }

  /**
   * Awakening: close on both eyes as the Mangekyō turns, the name spoken; then from the ground the
   * chakra erupts around him and the Susanoo forms as the camera rises. Straight to IV adds the hero shot.
   */
  _cineAwaken(target) {
    const eyes = () => this._eyeMid();
    const toPerfect = target === 4;
    const baseLook = () => V(0, this.camLook, 0);
    const keys = [
      { t: 0.02, cut: true, pos: () => eyes().add(V(0.05, 0.02, 0.78)), look: eyes, fov: 24 },
      { t: 1.25, pos: () => eyes().add(V(0.03, 0.01, 0.58)), look: eyes, fov: 19 },
      { t: 1.4, cut: true, pos: V(1.9, 0.35, 4.4), look: V(0, 2.4, 0), fov: 58 },
      { t: 3.1, pos: V(4.2, 2.6, 8.2), look: V(0, 3.6, 0), fov: 52 },
    ];
    if (toPerfect) keys.push(
      { t: 3.35, cut: true, pos: V(6.5, 0.45, 14), look: V(0, 6.2, 0), fov: 46 },
      { t: 5.2, pos: V(4.5, 3.4, 18), look: V(0, 6.4, 0), fov: 50 },
    );
    const end = toPerfect ? 6.4 : 4.3;
    keys.push({ t: end, pos: () => this._orbitPos(), look: baseLook, fov: this.cine.baseFov || this.camera.fov });
    const events = [
      [0, () => { this.app.sfx.mangekyo(); this.figure.userData.model?.pulseEyes?.(); }],
      [0.75, () => voice.say('susanoo', { cooldown: 2 })],
      [1.4, () => {
        this._applyStage(toPerfect ? 3 : target, false, 0, { quietVoice: true });
        this.shockS.fire(V(0, 0, 0), 0xff6a24);
        this.cine.shake = 0.25;
      }],
    ];
    if (toPerfect) events.push(...this._perfectBeats(3.35));
    this.app.cinema(true);
    this.cine.play(keys, { events, onEnd: () => this.app.cinema(false) });
  }

  /** The Perfect Susanoo rising: a low hero shot, lightning, a shockwave across the field. */
  _cinePerfect() {
    const prev = this.stage;
    this.app.cinema(true);
    this.cine.play([
      { t: 0.02, cut: true, pos: V(6.5, 0.45, 14), look: V(0, 6.2, 0), fov: 46 },
      { t: 2.2, pos: V(4.5, 3.4, 18), look: V(0, 6.4, 0), fov: 50 },
      { t: 3.3, pos: () => this._orbitPos(), look: () => V(0, this.camLook, 0), fov: this.cine.baseFov || this.camera.fov },
    ], { events: this._perfectBeats(0, prev), onEnd: () => this.app.cinema(false) });
  }

  _perfectBeats(t0, prev = 3) {
    return [
      [t0 + 0.1, () => this._applyStage(4, false, prev, { quietVoice: true })],
      [t0 + 0.9, () => {
        // lightning answers it
        this._strike(null, 1.6);
        this.app.flash(0.2, 0xdfe8ff);
        this.app.sfx.thunder();
        this.app.sfx.boom();
        this.shockS.fire(V(0, 0, 0), 0xffa050);
        this.embers.burst(V(0, 3, 0), 260, { speed: 12, up: 5, life: [0.8, 2], size: [0.08, 0.22], colors: this.emberColors });
        this.cine.shake = 0.45;
        this.shake = 0.8;
      }],
    ];
  }

  manifest() {
    clearTimeout(this._manT);
    const step = (k) => {
      if (!this.active) return;
      this.setStage(k);
      if (k < 4) this._manT = setTimeout(() => step(k + 1), 1300);
    };
    step(this.stage >= 4 ? 1 : this.stage + 1);
  }

  slash(fromGesture = false) {
    if (this.stage < 4) { this.app.toast(`Manifest the <b>${this.stages[4][0]} Susanoo</b> (IV) to wield the Totsuka Blade.`); return; }
    if (this.slashT >= 0 && !fromGesture) return;
    this.slashT = fromGesture ? 0.36 : 0;
    this.slashPoseT = 0.75;
    this.app.sfx.slash();
    if (!this.game.on) voice.say('totsuka', { cooldown: 12 });
    this.shake = Math.max(this.shake, 0.5);
  }

  raiseMirror() {
    if (this.stage < 4) { this.app.toast(`Manifest the <b>${this.stages[4][0]} Susanoo</b> (IV) to raise the Yata Mirror.`); return; }
    this.mirrorT = 3.5;
    this.app.sfx.chime();
    voice.say('yata', { cooldown: 12 });
    this.app.toast('<b>八咫鏡 · Yata Mirror</b> raised — attacks will be reflected.', 2500);
  }

  throwKunai(ndc) {
    this.ray.setFromCamera(ndc, this.camera);
    const m = new THREE.Mesh(this.kunaiGeo, this.kunaiMat);
    const dir = this.ray.ray.direction.clone();
    m.position.copy(this.camera.position).addScaledVector(dir, 1.5);
    // aim assist: curve toward Itachi if the ray passes near the Susanoo
    const center = this._core().clone();
    const toC = center.clone().sub(m.position).normalize();
    if (dir.dot(toC) > 0.93) dir.lerp(toC, 0.5).normalize();
    const vel = dir.multiplyScalar(30);
    m.lookAt(m.position.clone().add(vel));
    this.scene.add(m);
    this.kunai.push({ m, vel, life: 2.5, bounced: false });
    this.app.sfx.swoosh();
  }

  _updateKunai(dt) {
    for (let i = this.kunai.length - 1; i >= 0; i--) {
      const k = this.kunai[i];
      k.life -= dt;
      if (k.bounced) k.vel.y -= 14 * dt;
      k.m.position.addScaledVector(k.vel, dt);
      k.m.lookAt(k.m.position.clone().add(k.vel));
      if (!k.bounced) {
        const center = this._core().clone();
        const r = this._hitRadius();
        const d = k.m.position.distanceTo(center);
        if (d < r || (this.slashT > 0.3 && this.slashT < 0.7 && d < 8)) {
          k.bounced = true;
          const n = k.m.position.clone().sub(center).normalize();
          if (this.stage === 0) {
            this._crowClone();
            this.scene.remove(k.m);
            this.kunai.splice(i, 1);
            continue;
          }
          if (this.mirrorT > 0) {
            k.vel.copy(this.camera.position).sub(k.m.position).normalize().multiplyScalar(40);
            k.vel.x += rand(-4, 4); k.vel.y += rand(1, 4);
            this.app.toast('Reflected by the <b>Yata Mirror</b>!', 1400);
          } else {
            k.vel.reflect(n).multiplyScalar(0.35);
            k.vel.y += 3;
          }
          this.sparks.burst(k.m.position, 30, { speed: 6, life: [0.2, 0.6], size: [0.03, 0.08], colors: this.emberColors });
          this.app.sfx.clink();
          this.flashPower = 1;
        }
      }
      if (k.life <= 0 || k.m.position.y < -1) {
        this.scene.remove(k.m);
        this.kunai.splice(i, 1);
      }
    }
  }

  _crowClone() {
    if (!this.figure.visible) return;
    this.figure.visible = false;
    this.crows.fire(V(0, 1, 0), { speed: 6, up: 3 });
    this.app.sfx.flutter();
    this.app.sfx.caw();
    this.app.toast('<b>It was a crow clone.</b> Itachi was never there. Try manifesting Susanoo.', 3200);
    setTimeout(() => { this.figure.visible = true; }, 1800);
  }

  /* ---------- storm ---------- */

  _buildStorm() {
    const n = this.app.low ? 700 : 1600;
    this.rainN = n;
    this.rainPos = new Float32Array(n * 6);
    this.rainSpeed = new Float32Array(n);
    for (let i = 0; i < n; i++) this._resetDrop(i, true);
    const g = new THREE.BufferGeometry();
    this.rainAttr = new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.rainAttr);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    // each drop coloured on its own: cold grey-blue, warming to orange as it falls through the Susanoo's glow
    this.rainCol = new Float32Array(n * 6).fill(1);
    this.rainColAttr = new THREE.BufferAttribute(this.rainCol, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', this.rainColAttr);
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    this.splash = new ParticlePool({ count: 400, gravity: -9, drag: 0.5 });
    this.scene.add(this.splash.points);
    this.splashColor = new THREE.Color(0x8090b0);
    this.bolt = new Bolt();
    this.scene.add(this.bolt.group);

    // the Susanoo on wet rock: light pooling on the ground round it, and its reflection stretched toward you
    const pool = drawTexture(256, 256, (x, w) => {
      const gr = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, w, w);
    });
    this.wetGlow = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshBasicMaterial({ map: pool, color: 0xff6a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.wetGlow.rotation.x = -Math.PI / 2;
    this.wetGlow.position.y = 0.04;
    const streak = drawTexture(64, 256, (x, w, hh) => {
      const gv = x.createLinearGradient(0, 0, 0, hh);
      gv.addColorStop(0, 'rgba(255,255,255,0.95)'); gv.addColorStop(0.35, 'rgba(255,255,255,0.4)'); gv.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gv; x.fillRect(0, 0, w, hh);
      // broken up by the rain-pocked surface
      for (let i = 0; i < 260; i++) { x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(Math.random() * w, Math.random() * hh, 1 + Math.random() * 3, 1 + Math.random() * 2); }
      const gh = x.createLinearGradient(0, 0, w, 0);
      gh.addColorStop(0, 'rgba(0,0,0,1)'); gh.addColorStop(0.5, 'rgba(0,0,0,0)'); gh.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = gh; x.fillRect(0, 0, w, hh);
    });
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.translate(0, -0.5, 0); // from the base outward
    this.wetStreak = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: streak, color: 0xff7a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.wetStreak.rotation.order = 'YXZ';
    this.wetStreak.position.y = 0.05;
    this.scene.add(this.wetGlow, this.wetStreak);
    // steam where the rain hits chakra fire
    this.steam = new ParticlePool({ count: this.app.low ? 250 : 500, blending: THREE.NormalBlending, buoyancy: 1.1, drag: 1.2, turbulence: 0.9, softness: 2.2 });
    this.scene.add(this.steam.points);
    this.steamCols = [new THREE.Color(0x8c7c72), new THREE.Color(0xa0705a), new THREE.Color(0x6e6660)];
  }

  _resetDrop(i, initial = false) {
    const x = rand(-22, 22), z = rand(-22, 26), y = initial ? rand(0, 24) : rand(18, 26);
    const len = rand(0.35, 0.7);
    this.rainPos.set([x, y, z, x + 0.06, y + len, z], i * 6);
    this.rainSpeed[i] = rand(22, 30);
  }

  _updateStorm(dt) {
    const P = this.rainPos, C = this.rainCol;
    const glow = this.glowStrength || 0;
    for (let i = 0; i < this.rainN; i++) {
      const dy = this.rainSpeed[i] * dt;
      P[i * 6 + 1] -= dy; P[i * 6 + 4] -= dy;
      P[i * 6] -= dy * 0.06; P[i * 6 + 3] -= dy * 0.06;
      if (P[i * 6 + 1] < 0) {
        if (Math.random() < 0.15) this.splash.emit({ x: P[i * 6], y: 0.02, z: P[i * 6 + 2], vx: rand(-0.6, 0.6), vy: rand(1, 2), vz: rand(-0.6, 0.6), life: 0.25, size: 0.04, color: this.splashColor, alpha: 0.6 });
        this._resetDrop(i);
      }
    }
    this.rainAttr.needsUpdate = true;
    // drops near the Susanoo catch its orange light
    if (glow > 0.01 || this._rainWarm) {
      this._rainWarm = glow > 0.01;
      for (let i = 0; i < this.rainN; i++) {
        const x = P[i * 6], z = P[i * 6 + 2];
        const k = Math.max(0, 1 - Math.hypot(x, z + 1.5) / 9) * glow;
        const r = 0.66 + k * 0.6, gg = 0.7 - k * 0.1, b = 0.82 - k * 0.5;
        C[i * 6] = C[i * 6 + 3] = r; C[i * 6 + 1] = C[i * 6 + 4] = gg; C[i * 6 + 2] = C[i * 6 + 5] = b;
      }
      this.rainColAttr.needsUpdate = true;
    }
    // light pooled on the wet rock, and the reflection streak pointing at the viewer
    const flick = 0.9 + Math.sin(performance.now() * 0.009) * 0.06;
    this.wetGlow.material.opacity = glow * 0.45 * flick;
    this.wetGlow.scale.setScalar(0.7 + this.stage * 0.18);
    const cx = this.camera.position.x, cz = this.camera.position.z + 1.5;
    const len = 6 + this.stage * 2.2;
    this.wetStreak.rotation.set(-Math.PI / 2, Math.atan2(cx, cz), 0, 'YXZ');
    this.wetStreak.scale.set(2 + this.stage * 0.6, len, 1);
    this.wetStreak.position.set(0, 0.05, -1.5);
    this.wetStreak.material.opacity = glow * 0.5 * flick;
    // steam hissing off the chakra where the rain lands
    if (glow > 0.05 && Math.random() < dt * 26 * glow) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * (1.2 + this.stage * 0.5);
      const top = Math.max(1.5, (this.camLook || 2) * 1.8);
      this.steam.emit({ x: Math.cos(a) * r, y: Math.random() * top, z: -1.5 + Math.sin(a) * r, vx: Math.cos(a) * 0.2, vy: 0.4 + Math.random() * 0.6, vz: Math.sin(a) * 0.2, life: 2 + Math.random() * 2, size: 0.6 + Math.random() * 1.1, color: this.steamCols[Math.floor(Math.random() * 3)], grow: 1.5, alpha: 0.22 });
    }
    this.steam.update(dt, performance.now() / 1000);

    // lightning
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      this.nextBolt = rand(6, 14);
      this._strike();
    }
    this.bolt.update(dt, this.camera);
    this.lightning.intensity = damp(this.lightning.intensity, 0, 6, dt);
    const su = this.sky.userData.uniforms;
    su.uTime.value += dt;
    su.uFlash.value = damp(su.uFlash.value, 0, 5, dt);
  }

  /** A strike: a branching bolt, the clouds lit from within around it, a double flicker, thunder after. */
  _strike(from = null, strength = 1) {
    if (!from) {
      // somewhere in view, beyond the Susanoo
      const f = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      f.applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.45, 0.45));
      from = f.multiplyScalar(rand(30, 48)).setY(46);
    }
    this.bolt.strike(from);
    const su = this.sky.userData.uniforms;
    su.uFlashDir.value.copy(from).normalize();
    su.uFlash.value = 1.2 * strength;
    this.lightning.position.set(from.x * 0.4, 20, from.z * 0.4);
    this.lightning.intensity = 2.2 * strength;
    this.app.flash(0.07 * strength, 0xdfe8ff);
    setTimeout(() => { if (this.active) { this.lightning.intensity = 1.6 * strength; su.uFlash.value = 0.9 * strength; } }, 110);
    setTimeout(() => this.active && this.app.sfx.thunder(), rand(250, 900));
  }

  /* ---------- defence game ---------- */

  _buildEnemies() {
    this.enemyBody = new THREE.CapsuleGeometry(0.28, 0.8, 4, 10);
    this.enemyHead = new THREE.SphereGeometry(0.22, 14, 10);
    this.enemyMat = new THREE.MeshStandardMaterial({ color: 0x22202c, roughness: 0.55, emissive: 0x0a0610 });
    this.enemyEye = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    this.shotKunai = kunaiGeometry(2.2);
    this.shotMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.3, emissive: 0x222222 });
    this.glowTex = glowTexture();
  }

  _spawnEnemy() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.enemyBody, this.enemyMat);
    body.position.y = 0.7;
    const head = new THREE.Mesh(this.enemyHead, this.enemyMat);
    head.position.y = 1.45;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0x3a0a10 }));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.25;
    g.add(body, head, scarf);
    for (const sx of [-0.08, 0.08]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), this.enemyEye);
      e.position.set(sx, 1.48, 0.19);
      g.add(e);
    }
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff1030, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    aura.scale.setScalar(0.9);
    aura.position.y = 1.5;
    g.add(aura);
    g.scale.setScalar(1.7);
    const a = rand(-1.25, 1.25);
    const r = rand(18, 22);
    g.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    this.enemies.push({ g, a, r, state: 'run', throwT: rand(1, 2.5), t: rand(0, 5), speed: rand(2.2, 3.4) + this.game.wave * 0.25 });
  }

  startGame() {
    this.gameTitle.textContent = 'Hold the Line';
    this.gameBig.style.display = 'none';
    this.gameText.innerHTML = 'Shadow shinobi close in from the storm. <b>Slash</b> across them to seal them with the Totsuka Blade. <b>Hold</b> to raise the Yata Mirror and reflect their attacks.';
    this.gameBtn.textContent = 'Begin';
    this.gameCard.classList.remove('hidden');
    this.controlsEl.style.display = 'none';
  }

  _beginGame() {
    this._clearGame();
    this.game = { on: true, hp: 100, chakra: 100, sealed: 0, wave: 1, spawnT: 1, waveT: 0 };
    this.gameCard.classList.add('hidden');
    this.gameHud.style.display = '';
    this.stageHud.style.display = 'none';
    this.ui.querySelector('.intro').style.opacity = '0.12';
    this.setStage(4, true);
    this.yawT = Math.round(this.yawT / TAU) * TAU;
    this.pitchT = 0.14;
    this.app.sfx.setMood('battle');
    this.app.sfx.susanoo();
    voice.say('susanoo', { cooldown: 6 });
    this.app.bleed();
  }

  _clearGame() {
    this.enemies.forEach((e) => this.scene.remove(e.g));
    this.shots.forEach((s) => this.scene.remove(s.m));
    this.enemies = [];
    this.shots = [];
  }

  endGame(leave = false) {
    const was = this.game.on;
    this.game.on = false;
    this.gameHud.style.display = 'none';
    this.stageHud.style.display = '';
    this.ui.querySelector('.intro').style.opacity = '';
    this.app.sfx.setMood(this.mood);
    if (leave) {
      this._clearGame();
      this.gameCard.classList.add('hidden');
      this.controlsEl.style.display = '';
      return;
    }
    if (!was) return;
    const record = this.game.sealed > this.best;
    if (record) { this.best = this.game.sealed; try { localStorage.setItem('itachi-susanoo', String(this.best)); } catch (_) { /* ignore */ } }
    this.gameTitle.textContent = record ? 'New record' : 'The Susanoo shattered';
    this.gameBig.style.display = '';
    this.gameBig.textContent = String(this.game.sealed);
    this.gameText.innerHTML = `Shinobi sealed · best ${this.best}. Even Itachi's Susanoo had limits — his illness.`;
    this.gameBtn.textContent = 'Again';
    this.gameCard.classList.remove('hidden');
    this.embers.burst(V(0, 4, 0), 300, { speed: 12, up: 3, life: [0.8, 2], size: [0.08, 0.22], colors: this.emberColors });
    this.setStage(0, true);
    this.app.sfx.boom();
  }

  _seal(e) {
    if (e.state === 'sealed') return;
    e.state = 'sealed';
    e.t = 0;
    e.from = e.g.position.clone();
    this.game.sealed = (this.game.sealed || 0) + 1;
    this.sealedEl.textContent = String(this.game.sealed);
    this.sparks.burst(e.g.position.clone().add(V(0, 2, 0)), 30, { speed: 5, life: [0.3, 0.8], size: [0.06, 0.14], colors: this.emberColors });
  }

  _fire(e) {
    const type = Math.random() < 0.3 + this.game.wave * 0.04 ? 'fire' : 'kunai';
    const from = e.g.position.clone().add(V(0, 2.2, 0));
    const to = V(rand(-1, 1), rand(2.5, 5), rand(-0.5, 0.5));
    let m;
    if (type === 'fire') {
      m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff7020, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.setScalar(1.6);
    } else {
      m = new THREE.Mesh(this.shotKunai, this.shotMat);
    }
    m.position.copy(from);
    this.scene.add(m);
    const vel = to.sub(from).normalize().multiplyScalar(type === 'fire' ? 9 : 16);
    if (type === 'kunai') m.lookAt(m.position.clone().add(vel));
    this.shots.push({ m, vel, type, owner: e, reflected: false, life: 4 });
    this.app.sfx.swoosh();
  }

  _updateGame(dt, t) {
    const G = this.game;
    G.waveT += dt;
    if (G.waveT > 20) { G.waveT = 0; G.wave++; this.waveEl.textContent = String(G.wave); this.app.toast(`<b>Wave ${G.wave}</b> — more shinobi in the storm.`, 1600); }
    G.spawnT -= dt;
    if (G.spawnT <= 0 && this.enemies.filter((e) => e.state !== 'sealed').length < 4 + G.wave) {
      this._spawnEnemy();
      G.spawnT = Math.max(0.7, 2.6 - G.wave * 0.25) * rand(0.7, 1.2);
    }
    const mirrorUp = this.mirrorT > 0;
    G.chakra = clamp(G.chakra + (mirrorUp ? -26 : 10) * dt, 0, 100);
    if (G.chakra <= 0) this.mirrorT = 0;

    const gourd = this.rightArm.localToWorld(this.bladeTipLocal.clone().multiplyScalar(0.18));
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.t += dt;
      if (e.state === 'sealed') {
        const k = Math.min(1, e.t / 0.7);
        e.g.position.lerpVectors(e.from, gourd, k * k);
        e.g.scale.setScalar(1.7 * (1 - k) + 0.01);
        e.g.rotation.y += dt * 20;
        if (k >= 1) { this.scene.remove(e.g); this.enemies.splice(i, 1); }
        continue;
      }
      const r = Math.hypot(e.g.position.x, e.g.position.z);
      if (r > 11) {
        const step = e.speed * dt;
        e.g.position.x -= (e.g.position.x / r) * step;
        e.g.position.z -= (e.g.position.z / r) * step;
        e.g.children[0].position.y = 0.7 + Math.abs(Math.sin(e.t * 9)) * 0.12;
      } else {
        e.throwT -= dt;
        if (e.throwT <= 0) { this._fire(e); e.throwT = rand(2, 3.5) - G.wave * 0.12; }
        if (e.t > 14) { e.speed = 3; e.charge = true; }
        if (e.charge) {
          e.g.position.multiplyScalar(1 - dt * 0.35);
          if (r < 4.5) {
            this._damage(15);
            this.app.sfx.poof();
            this.scene.remove(e.g);
            this.enemies.splice(i, 1);
            continue;
          }
        }
      }
      e.g.lookAt(0, 0, 0);
    }

    const center = this.body.perfect ? V(0, this.body.coreY, 0) : V(0, 3.8, 0);
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.m.position.addScaledVector(s.vel, dt);
      if (s.type === 'fire') {
        this.embers.emit({ x: s.m.position.x, y: s.m.position.y, z: s.m.position.z, vx: rand(-0.5, 0.5), vy: rand(0, 1), vz: rand(-0.5, 0.5), life: 0.5, size: rand(0.15, 0.3), color: this.emberColors[Math.floor(rand(0, 3))] });
      }
      if (!s.reflected && s.m.position.distanceTo(center) < (this.body.perfect ? this.body.coreR : 4.4)) {
        if (mirrorUp) {
          s.reflected = true;
          const target = s.owner.g.position.clone().add(V(0, 2, 0));
          s.vel.copy(target.sub(s.m.position).normalize().multiplyScalar(26));
          if (s.type === 'kunai') s.m.lookAt(s.m.position.clone().add(s.vel));
          this.sparks.burst(s.m.position, 30, { speed: 6, life: [0.2, 0.6], size: [0.05, 0.12], colors: this.emberColors });
          this.app.sfx.clink();
          this.mirrorMat.uniforms.uPower.value = 4;
        } else {
          this._damage(s.type === 'fire' ? 12 : 6);
          this.sparks.burst(s.m.position, 20, { speed: 5, life: [0.2, 0.5], size: [0.05, 0.1], colors: this.emberColors });
          this.scene.remove(s.m);
          this.shots.splice(i, 1);
          continue;
        }
      }
      if (s.reflected && s.owner.state !== 'sealed' && s.m.position.distanceTo(s.owner.g.position.clone().add(V(0, 2, 0))) < 1.5) {
        this._seal(s.owner);
        this.scene.remove(s.m);
        this.shots.splice(i, 1);
        continue;
      }
      if (s.life <= 0) { this.scene.remove(s.m); this.shots.splice(i, 1); }
    }

    this.hpFill.style.width = `${G.hp}%`;
    this.hpFill.classList.toggle('low', G.hp < 30);
    this.ckFill.style.width = `${G.chakra}%`;
  }

  _damage(n) {
    this.game.hp = Math.max(0, this.game.hp - n);
    this.shake = Math.max(this.shake, 0.6);
    this.app.flash(0.25, 0xff2020);
    this.app.sfx.hurt();
    for (let i = 1; i <= 3; i++) this.mats[i].uniforms.uPower.value *= 0.7;
    if (this.game.hp <= 0) this.endGame();
  }

  /** Screen-space slash: seals enemies and cuts projectiles the stroke passes through. */
  _slashPath(path) {
    const R = this.app.isTouch ? 70 : 55;
    const hitsSeg = (sx, sy) => {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
        const tt = clamp(((sx - a.x) * (b.x - a.x) + (sy - a.y) * (b.y - a.y)) / l2, 0, 1);
        if (Math.hypot(sx - (a.x + (b.x - a.x) * tt), sy - (a.y + (b.y - a.y) * tt)) < R) return true;
      }
      return false;
    };
    let n = 0;
    for (const e of this.enemies) {
      if (e.state === 'sealed') continue;
      const sc = toScreen(e.g.position.clone().add(V(0, 2, 0)), this.camera, this.app.width, this.app.height);
      if (!sc.behind && hitsSeg(sc.x, sc.y)) { this._seal(e); n++; }
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const sc = toScreen(s.m.position, this.camera, this.app.width, this.app.height);
      if (!sc.behind && hitsSeg(sc.x, sc.y)) {
        this.sparks.burst(s.m.position, 16, { speed: 5, life: [0.2, 0.5], size: [0.05, 0.1], colors: this.emberColors });
        this.scene.remove(s.m);
        this.shots.splice(i, 1);
        n++;
      }
    }
    if (n > 2) this.app.toast(`<b>十拳剣</b> — ${n} sealed in one stroke`, 1400);
  }
  /* ---------- input ---------- */

  pointerDown() {
    this._dragYaw = 0;
    this._dragPitch = 0;
  }

  pointerMove(p) {
    if (!p.down || this.game.on) return;
    this.idle = 0;
    // on a phone a stroke across the manifested Susanoo is a sword slash, so it doesn't swing the view
    // round; before that, a sideways drag walks you round it (only sideways: vertical strokes raise it)
    if (this.app.isTouch && this.stage >= 4) return;
    const dy = this.app.isTouch ? 0 : p.dy * 0.004;
    const pitch = clamp(this.pitchT + dy, -0.05, 0.8);
    this._dragPitch = (this._dragPitch || 0) + (pitch - this.pitchT);
    this.pitchT = pitch;
    this.yawT -= p.dx * 0.006;
    this._dragYaw = (this._dragYaw || 0) - p.dx * 0.006;
  }

  /** Takes back whatever orbit the current gesture caused (its swipe meant something else). */
  _undoDrag() {
    this.yawT -= this._dragYaw || 0;
    this.pitchT = clamp(this.pitchT - (this._dragPitch || 0), -0.05, 0.8);
    this._dragYaw = this._dragPitch = 0;
  }

  /** Centre of whatever protects Itachi right now (the Perfect Susanoo stands taller). */
  _core() {
    const perfect = this.stage >= 4 && this.body.perfect;
    return V0.set(0, this.stage ? (perfect ? this.body.coreY : 3.5) : 1.1, 0);
  }
  _hitRadius() { return this.stage >= 4 && this.body.perfect ? this.body.coreR : HIT_RADIUS[this.stage]; }

  swipe(s) {
    const vertical = Math.abs(s.dy) > Math.abs(s.dx) * 1.6;
    if (vertical && !this.game.on) {
      // undo the orbit the swipe caused, then change stage
      this._undoDrag();
      if (s.dy < 0 && this.stage < 4) this.setStage(this.stage + 1);
      else if (s.dy > 0 && this.stage > 0) this.setStage(this.stage - 1);
      return true;
    }
    if (this.stage < 4) {
      if (!this.game.on) this.app.toast(`Swipe <b>up</b> to manifest the ${this.stages[4][0]} Susanoo, then slash.`, 2200);
      return false;
    }
    if (!this.game.on) this._undoDrag();
    this.slash(true);
    this._slashPath(s.path);
    return true;
  }

  click(p) {
    if (!this.game.on) this.throwKunai(p.ndc);
  }

  exit() {
    clearTimeout(this._manT);
    if (this.cine.active) this.cine.stop();
    this.app.cinema(false);
    if (this.game.on || !this.gameCard.classList.contains('hidden')) this.endGame(true);
  }

  update(dt, t) {
    // reveal stages
    for (let i = 1; i <= 4; i++) {
      const u = this.mats[i].uniforms.uReveal;
      const target = this.stage >= i ? 1 : 0;
      u.value = target > u.value ? Math.min(1, u.value + dt * 0.75) : Math.max(0, u.value - dt * 1.2);
      // older layers dim once a newer layer covers them, so the silhouette stays readable
      if (i < 4) {
        const pw = this.mats[i].uniforms.uPower;
        // the Perfect Susanoo is a whole new body: the inner layers fade out entirely beneath it
        const covered = this.stage >= 4 && this.body.perfect ? 0 : this.body.hasSculpt ? 0.16 : 0.35;
        pw.value = damp(pw.value, this.stage > i ? covered : 1, 3, dt);
      }
    }
    const strength = this.mats[1].uniforms.uReveal.value;
    this.glowStrength = strength;
    this.shaftStrength = strength * 0.7;
    this.glowLight.intensity = strength * (14 + this.stage * 4) + Math.sin(t * 9) * 2 * strength;
    this.groundMat.opacity = 0.2 + strength * 0.7;
    this.sky.userData.uniforms.uGlow.value.setRGB(0.23, 0.08, 0.06).multiplyScalar(0.3 + strength);
    this.bloom.strength = 0.55 + strength * 0.3;

    // Itachi himself: releases chakra as each stage manifests, bleeds from the Mangekyō,
    // and mirrors the Susanoo's slash and guard with his own arms
    const fm = this.figure.userData.model;
    if (fm) {
      this.manifestT = Math.max(0, (this.manifestT || 0) - dt);
      this.slashPoseT = Math.max(0, (this.slashPoseT || 0) - dt);
      const want = this.mirrorT > 0 && this.stage >= 4 ? 'guard'
        : this.slashPoseT > 0 ? 'slash'
          : this.manifestT > 0 ? 'manifest'
            : this.stage > 0 ? 'ready' : 'idle';
      if (fm.poseName !== want) fm.setPose(want, {}, want === 'slash' ? 18 : 6);
      const eyes = this.stage > 0 ? 'mangekyo' : 3;
      if (this._eyes !== eyes) { this._eyes = eyes; fm.setEyes(eyes); fm.setBleeding(this.stage > 0); }
      fm.update(dt, t);
    }
    const rise = this.body.perfect ? this.mats[4].uniforms.uReveal.value : 0;
    this.figure.position.y = rise * (this.body.coreY - 0.9) + (rise > 0.01 ? Math.sin(t * 1.4) * 0.06 * rise : 0);

    this.body.viewer = this.camera.position;
    this.body.update(dt, t);

    // breathing idle motion
    this.susanoo.position.y = Math.sin(t * 1.2) * 0.08;
    this.susanoo.rotation.y = Math.sin(t * 0.5) * 0.04;

    // slash animation (right arm)
    if (this.slashT >= 0) {
      this.slashT += dt / 1.1;
      const s = this.slashT;
      const up = { x: -1.3, z: -0.3 }, down = { x: 0.9, z: 0.7 };
      let rx, rz;
      if (s < 0.35) { const e = s / 0.35; rx = lerp(0, up.x, e); rz = lerp(0, up.z, e); }
      else if (s < 0.55) { const e = (s - 0.35) / 0.2; rx = lerp(up.x, down.x, e * e); rz = lerp(up.z, down.z, e); }
      else { const e = Math.min(1, (s - 0.55) / 0.45); rx = lerp(down.x, 0, e); rz = lerp(down.z, 0, e); }
      this.rightArm.rotation.set(rx, 0, rz);
      if (s > 0.35 && s < 0.6) {
        const tip = this.rightArm.localToWorld(this.bladeTipLocal.clone());
        this.sparks.burst(tip, 8, { speed: 3, life: [0.3, 0.7], size: [0.08, 0.18], colors: this.emberColors });
        this.bladeMat.uniforms.uPower.value = 3.5;
      }
      if (s > 0.5 && s < 0.56) this.shake = 1;
      if (s >= 1) { this.slashT = -1; this.rightArm.rotation.set(0, 0, 0); }
    }
    this.bladeMat.uniforms.uPower.value = damp(this.bladeMat.uniforms.uPower.value, 1.8, 3, dt);

    // hold = Yata Mirror (while held)
    const hold = this.trackHold(0.3, this.stage >= 4 && (!this.game.on || this.game.chakra > 5));
    if (hold.fired) { this.app.sfx.chime(); if (!this.game.on) voice.say('yata', { cooldown: 12 }); this.mirrorMat.uniforms.uPower.value = 4; }
    if (this._holdFired && this.app.pointer.down && this.stage >= 4) this.mirrorT = Math.max(this.mirrorT, 0.15);
    if (this.game.on) this._updateGame(dt, t);
    this._updateStorm(dt);
    this.splash.update(dt, t);

    // mirror
    this.mirrorT = Math.max(0, this.mirrorT - dt);
    const mOn = this.mirrorT > 0;
    this.leftArm.rotation.x = damp(this.leftArm.rotation.x, mOn ? -0.5 : 0, 6, dt);
    this.mirror.rotation.y = damp(this.mirror.rotation.y, mOn ? 0 : -0.35, 6, dt);
    this.mirrorMat.uniforms.uPower.value = damp(this.mirrorMat.uniforms.uPower.value, mOn ? 2.6 + Math.sin(t * 10) * 0.4 : 1.3, 6, dt);

    // embers
    if (strength > 0.05 && Math.random() < dt * 60 * strength) {
      const a = rand(0, TAU), r = rand(0.5, 3.5);
      this.embers.emit({ x: Math.cos(a) * r, y: rand(0, 1), z: Math.sin(a) * r - 0.3, vx: 0, vy: rand(1, 3), vz: 0, life: rand(1, 2.5), size: rand(0.04, 0.12), color: this.emberColors[Math.floor(rand(0, 3))] });
    }

    this._updateKunai(dt);

    // orbit camera
    this.idle += dt;
    if (this.idle > 2.5 && !this.game.on) {
      // on a phone, left alone, the view settles back square on to the Susanoo; larger screens drift round it
      if (this.app.isTouch) this.yawT = damp(this.yawT, Math.round(this.yawT / TAU) * TAU, 0.9, dt);
      else this.yawT += dt * 0.12;
    }
    // on a phone, tilt never swings the view round: it only slides where you stand a little, the camera
    // still facing the Susanoo straight on (its eyes follow you). A dead zone ignores the tremor of a
    // hand-held phone, and tilt pauses while a finger is down, in the dodge game and in the cinematics
    const gyro = this.app.gyro;
    const calm = gyro && !this.app.pointer.down && !this.game.on && !this.cine.active;
    const dz = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.15) / 0.85;
    this.tiltX = damp(this.tiltX || 0, calm ? dz(gyro.x) : 0, 1.4, dt);
    this.tiltY = damp(this.tiltY || 0, calm ? dz(gyro.y) : 0, 1.4, dt);
    this.yaw = damp(this.yaw, this.yawT, 5, dt);
    this.pitch = damp(this.pitch, this.pitchT, 5, dt);
    const portrait = this.app.width / this.app.height < 0.9;
    const tall = this.stage >= 4 && this.body.perfect ? 1 : 0;
    const dist = (this.game.on ? (portrait ? 34 : 25) : (portrait ? 27 : 19) - (this.stage === 0 ? (portrait ? 12 : 9) : 0)) + tall * (portrait ? 8 : 5);
    const ly = this.stage === 0 ? 1.2 : 4.4 + tall * 1.4;
    this.camDist = damp(this.camDist || dist, dist, 2, dt);
    this.camLook = damp(this.camLook || ly, ly, 2, dt);
    this.shake = damp(this.shake, 0, 5, dt);
    this.shockS.update(dt);
    if (!this.cine.update(dt)) {
      const side = this.tiltX * 1.1, lift = -this.tiltY * 0.6;
      this.camera.position.set(
        Math.sin(this.yaw) * Math.cos(this.pitch) * this.camDist + Math.cos(this.yaw) * side + rand(-1, 1) * this.shake * 0.3,
        this.camLook + Math.sin(this.pitch) * this.camDist + lift + rand(-1, 1) * this.shake * 0.3,
        Math.cos(this.yaw) * Math.cos(this.pitch) * this.camDist - Math.sin(this.yaw) * side,
      );
      this.camera.lookAt(0, this.camLook, 0);
    }

    this.embers.update(dt, t);
    this.sparks.update(dt, t);
    this.crows.update(dt);
  }
}
