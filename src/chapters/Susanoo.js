import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { ParticlePool } from '../objects/Particles.js';
import { CrowBurst } from '../objects/Crow.js';
import { createItachiFigure } from '../objects/Figure.js';
import { kunaiGeometry } from '../objects/Weapons.js';
import { NOISE_GLSL, shared, drawTexture, rand, damp, clamp, TAU, h, lerp, toScreen, glowTexture } from '../core/utils.js';

const STAGES = [
  ['Itachi', 'Itachi alone. Throw a kunai… if you dare.'],
  ['Ribcage', 'Stage I — a ribcage of chakra wraps around the user, already an iron wall.'],
  ['Skeleton', 'Stage II — the skull and skeletal arms manifest. It can strike and grab.'],
  ['Warrior', 'Stage III — muscle and a long-nosed, tengu-like face take shape.'],
  ['Armoured', 'Armoured Susanoo — cloaked like a mountain ascetic, wielding the Totsuka Blade and the Yata Mirror.'],
];
const HIT_RADIUS = [0.7, 2.4, 3.1, 3.7, 4.2];

function susanooMaterial({ color = 0xff6a2a, color2 = 0xff1a28, power = 1, reveal = null } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uColor: { value: new THREE.Color(color) },
      uColor2: { value: new THREE.Color(color2) },
      uReveal: reveal || { value: 0 },
      uPower: { value: power },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        float n = snoise(w.xyz * 0.9 + vec3(0.0, uTime * 0.8, 0.0));
        w.xyz += normalize(mat3(modelMatrix) * normal) * n * 0.05;
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform vec3 uColor; uniform vec3 uColor2; uniform float uReveal; uniform float uPower;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.7);
        float flow = snoise(vW * vec3(1.2, 0.6, 1.2) + vec3(0.0, -uTime * 1.6, 0.0)) * 0.5 + 0.5;
        float bands = smoothstep(0.55, 0.95, flow);
        float cut = mix(-1.5, 12.5, uReveal);
        float vis = 1.0 - smoothstep(cut - 0.6, cut, vW.y);
        float edge = (1.0 - smoothstep(0.0, 0.7, abs(vW.y - cut))) * step(0.001, uReveal) * step(uReveal, 0.999);
        vec3 col = mix(uColor2, uColor, fres) * (0.25 + fres * 1.4 + bands * 0.5) + edge * vec3(1.0, 0.85, 0.6) * 2.5;
        float a = (0.04 + fres * 0.5 + bands * 0.08) * vis * uPower + edge * 0.5;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
  });
}

function limb(a, b, r1, r2, mat, seg = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, seg, 4, true), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}
function ball(p, r, mat, scale = null) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.position.copy(p);
  if (scale) m.scale.set(...scale);
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Susanoo extends Chapter {
  constructor(app) {
    super(app, { id: 'susanoo', title: 'Susanoo', jp: '須佐能乎' });
    this.shiftView = 0.12;
    this.bloom = { strength: 0.9, radius: 0.6, threshold: 0.55 };
    this.mood = 'tension';
    this.game = { on: false };
    this.enemies = [];
    this.shots = [];
    this.nextBolt = 6;
    try { this.best = +localStorage.getItem('itachi-susanoo') || 0; } catch (_) { this.best = 0; }
    this.stage = 0;
    this.yaw = 0.5;
    this.pitch = 0.12;
    this.yawT = 0.5;
    this.pitchT = 0.12;
    this.idle = 0;
    this.kunai = [];
    this.slashT = -1;
    this.mirrorT = 0;
    this.shake = 0;
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color(0x070205);
    s.fog = new THREE.FogExp2(0x0a0306, 0.035);
    s.add(new THREE.HemisphereLight(0x604050, 0x100508, 0.8));
    this.glowLight = new THREE.PointLight(0xff4a20, 0, 30, 1.2);
    this.glowLight.position.set(0, 3, 1);
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
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.28, metalness: 0.35, emissiveMap: groundTex, emissive: 0xffffff, emissiveIntensity: 0.15 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    this.groundMat = ground.material;
    this._buildStorm();
    this._buildEnemies();

    this.figure = createItachiFigure();
    s.add(this.figure);

    // ---- Susanoo ----
    this.mats = [null,
      susanooMaterial({ color: 0xff7a30, color2: 0xff2020 }),
      susanooMaterial({ color: 0xff6a28, color2: 0xff1a20 }),
      susanooMaterial({ color: 0xff5a24, color2: 0xe0101c }),
      susanooMaterial({ color: 0xff4a20, color2: 0xc8081a }),
    ];
    const M = this.mats;
    this.bladeMat = susanooMaterial({ color: 0xfff0b0, color2: 0xff8a30, power: 1.8, reveal: M[4].uniforms.uReveal });
    this.mirrorMat = susanooMaterial({ color: 0xffb070, color2: 0xff3020, power: 1.3, reveal: M[4].uniforms.uReveal });

    const S = new THREE.Group();
    s.add(S);
    this.susanoo = S;

    // stage 1: spine + ribcage
    const spineCurve = new THREE.CatmullRomCurve3([V(0, 0.6, -1.0), V(0, 2.2, -1.25), V(0, 3.8, -1.1), V(0, 5.3, -0.7)]);
    S.add(new THREE.Mesh(new THREE.TubeGeometry(spineCurve, 40, 0.2, 8), M[1]));
    for (let i = 0; i < 7; i++) {
      const y = 1.7 + i * 0.5;
      const r = 1.35 + Math.sin(((i + 1) / 8) * Math.PI) * 0.75;
      const gap = 0.7 + (i / 7) * 0.4;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09 + (6 - i) * 0.008, 8, 48, TAU - gap * 2), M[1]);
      rib.rotation.set(Math.PI / 2 + 0.18, 0, Math.PI / 2 + gap);
      rib.scale.set(1, 0.82, 1);
      rib.position.set(0, y, -0.45);
      S.add(rib);
    }
    // stage 1 also shows a pair of skeletal hands at the base of the ribcage
    S.add(ball(V(0, 5.1, -0.7), 0.3, M[1]));

    // stage 2: skull, neck, clavicles
    S.add(ball(V(0, 6.45, -0.25), 0.72, M[2], [0.95, 1.1, 1.05]));
    S.add(ball(V(0, 5.95, 0.05), 0.42, M[2], [1.1, 0.55, 1.2]));
    for (const sx of [-1, 1]) S.add(ball(V(sx * 0.26, 6.5, 0.4), 0.13, M[2]));
    for (let i = 0; i < 3; i++) S.add(ball(V(0, 5.35 + i * 0.18, -0.55), 0.14, M[2]));
    for (const sx of [-1, 1]) S.add(limb(V(0, 5.2, -0.45), V(sx * 2.2, 5.0, -0.3), 0.14, 0.12, M[2]));

    // stage 3: torso, head, skirt
    const torsoProfile = [[0.05, 0.55], [1.3, 0.8], [1.7, 1.6], [2.0, 2.8], [2.3, 4.0], [2.25, 4.7], [1.6, 5.3], [0.75, 5.65], [0.55, 5.95]].map(([x, y]) => new THREE.Vector2(x, y));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 32), M[3]);
    torso.scale.z = 0.72;
    torso.position.z = -0.35;
    S.add(torso);
    S.add(ball(V(0, 6.55, -0.2), 0.98, M[3], [0.9, 1.1, 1]));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.4, 12, 3, true), M[3]);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 6.4, 1.2);
    S.add(nose);
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.2, 10, 2, true), M[3]);
      horn.position.set(sx * 0.5, 7.5, -0.35);
      horn.rotation.set(-0.45, 0, -sx * 0.45);
      S.add(horn);
    }
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.7, 1.3, 32, 3, true), M[3]);
    skirt.position.set(0, 0.55, -0.35);
    skirt.scale.z = 0.8;
    S.add(skirt);

    // stage 4: mantle, hood, pauldrons
    const mantleProfile = [[1.0, 6.2], [2.2, 5.8], [3.0, 5.1], [3.3, 3.9], [3.45, 2.3], [3.7, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
    const mantle = new THREE.Mesh(new THREE.LatheGeometry(mantleProfile, 40, 0.9, TAU - 1.8), M[4]);
    mantle.position.z = -0.4;
    mantle.scale.z = 0.85;
    S.add(mantle);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(1.4, 28, 14, 0, TAU, 0, Math.PI * 0.55), M[4]);
    hood.position.set(0, 6.65, -0.4);
    hood.rotation.x = -0.25;
    S.add(hood);

    // arms (pivot at shoulders)
    const buildArm = (side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 2.2, 5.0, -0.3);
      const Sh = V(0, 0, 0), E = V(side * 0.9, -1.5, 0.4), Hd = side < 0 ? V(side * 0.4, -1.7, 1.9) : V(side * 0.3, -0.9, 1.9);
      // skeleton
      arm.add(ball(Sh, 0.28, M[2]), ball(E, 0.22, M[2]));
      arm.add(limb(Sh, E, 0.15, 0.13, M[2]), limb(E, Hd, 0.13, 0.11, M[2]));
      arm.add(ball(Hd, 0.28, M[2]));
      for (let f = 0; f < 3; f++) arm.add(limb(Hd, Hd.clone().add(V(side * 0.1 * (f - 1), 0.3 - f * 0.15, 0.45)), 0.05, 0.04, M[2], 6));
      // flesh
      arm.add(limb(Sh, E, 0.62, 0.5, M[3]), limb(E, Hd, 0.5, 0.42, M[3]), ball(Hd, 0.5, M[3]));
      // armour
      const paul = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 10, 0, TAU, 0, Math.PI * 0.5), M[4]);
      paul.position.copy(Sh).add(V(side * 0.15, 0.1, 0));
      paul.rotation.z = -side * 0.5;
      arm.add(paul);
      arm.add(limb(E.clone().lerp(Hd, 0.15), E.clone().lerp(Hd, 0.8), 0.6, 0.55, M[4]));
      arm.userData.hand = Hd;
      S.add(arm);
      return arm;
    };
    this.rightArm = buildArm(-1);
    this.leftArm = buildArm(1);

    // gourd + Totsuka Blade in the right hand
    const hand = this.rightArm.userData.hand;
    const gourdProfile = [[0.01, -0.55], [0.38, -0.4], [0.42, -0.15], [0.2, 0.1], [0.3, 0.3], [0.25, 0.5], [0.1, 0.62], [0.09, 0.75]].map(([x, y]) => new THREE.Vector2(x, y));
    const gourd = new THREE.Mesh(new THREE.LatheGeometry(gourdProfile, 20), this.mirrorMat);
    gourd.position.copy(hand).add(V(0, 0.2, 0.1));
    this.rightArm.add(gourd);
    const bladeDir = V(-0.45, 1, 0.55).normalize();
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 7, 14, 30, true), this.bladeMat);
    const gTop = gourd.position.clone().add(V(0, 0.75, 0));
    blade.position.copy(gTop).addScaledVector(bladeDir, 3.5);
    blade.quaternion.setFromUnitVectors(V(0, 1, 0), bladeDir);
    this.rightArm.add(blade);
    this.bladeTipLocal = gTop.clone().addScaledVector(bladeDir, 7);

    // Yata Mirror in the left hand
    const mirror = new THREE.Group();
    mirror.position.copy(this.leftArm.userData.hand).add(V(0.2, 0.3, 0.45));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 48, 1, false), this.mirrorMat);
    disc.rotation.x = Math.PI / 2;
    mirror.add(disc);
    [1.6, 1.15, 0.6].forEach((r) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 64), this.bladeMat);
      ring.position.z = 0.08;
      mirror.add(ring);
    });
    for (let i = 0; i < 3; i++) {
      const mg = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), this.bladeMat);
      const a = (i / 3) * TAU;
      mg.position.set(Math.cos(a) * 0.88, Math.sin(a) * 0.88, 0.1);
      mirror.add(mg);
    }
    mirror.rotation.y = -0.35;
    this.leftArm.add(mirror);
    this.mirror = mirror;

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
    this.stageBtns.forEach((b, i) => b.setAttribute('title', STAGES[i][0]));
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
    this.stage = i;
    this.stageBtns.forEach((b, k) => b.classList.toggle('active', k === i));
    this.stagePill.textContent = STAGES[i][0];
    if (!silent) {
      this.app.toast(STAGES[i][1], 3600);
      if (i > prev) { this.app.sfx.susanoo(); this.shake = 0.5; this.app.bleed(); }
      else this.app.sfx.whoosh();
      if (i > 0) this.embers.burst(V(0, 2, 0), 150, { speed: 7, up: 3, life: [0.6, 1.6], size: [0.06, 0.18], colors: this.emberColors });
    }
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
    if (this.stage < 4) { this.app.toast('Manifest the <b>Armoured Susanoo</b> (IV) to wield the Totsuka Blade.'); return; }
    if (this.slashT >= 0 && !fromGesture) return;
    this.slashT = fromGesture ? 0.36 : 0;
    this.app.sfx.slash();
    this.shake = Math.max(this.shake, 0.5);
  }

  raiseMirror() {
    if (this.stage < 4) { this.app.toast('Manifest the <b>Armoured Susanoo</b> (IV) to raise the Yata Mirror.'); return; }
    this.mirrorT = 3.5;
    this.app.sfx.chime();
    this.app.toast('<b>八咫鏡 · Yata Mirror</b> raised — attacks will be reflected.', 2500);
  }

  throwKunai(ndc) {
    this.ray.setFromCamera(ndc, this.camera);
    const m = new THREE.Mesh(this.kunaiGeo, this.kunaiMat);
    const dir = this.ray.ray.direction.clone();
    m.position.copy(this.camera.position).addScaledVector(dir, 1.5);
    // aim assist: curve toward Itachi if the ray passes near the Susanoo
    const center = V(0, this.stage ? 3.5 : 1.1, 0);
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
        const center = V(0, this.stage ? 3.5 : 1.0, 0);
        const r = HIT_RADIUS[this.stage];
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
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xa8b4d0, transparent: true, opacity: 0.28, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    this.splash = new ParticlePool({ count: 400, gravity: -9, drag: 0.5 });
    this.scene.add(this.splash.points);
    this.splashColor = new THREE.Color(0x8090b0);
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xeef2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), this.boltMat);
    this.bolt.frustumCulled = false;
    this.scene.add(this.bolt);
  }

  _resetDrop(i, initial = false) {
    const x = rand(-22, 22), z = rand(-22, 26), y = initial ? rand(0, 24) : rand(18, 26);
    const len = rand(0.35, 0.7);
    this.rainPos.set([x, y, z, x + 0.06, y + len, z], i * 6);
    this.rainSpeed[i] = rand(22, 30);
  }

  _updateStorm(dt) {
    const P = this.rainPos;
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

    // lightning
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      this.nextBolt = rand(6, 14);
      const pts = [];
      let p = new THREE.Vector3(rand(-25, 25), 40, rand(-40, -20));
      for (let i = 0; i < 14; i++) { pts.push(p.clone()); p = p.add(new THREE.Vector3(rand(-2.5, 2.5), -rand(2, 3.2), rand(-1, 1))); }
      this.bolt.geometry.dispose();
      this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      this.boltMat.opacity = 1;
      this.lightning.intensity = 6;
      this.app.flash(0.35, 0xdfe8ff);
      setTimeout(() => { if (this.active) { this.lightning.intensity = 4; this.app.flash(0.2, 0xdfe8ff); } }, 110);
      setTimeout(() => this.active && this.app.sfx.thunder(), rand(250, 900));
    }
    this.boltMat.opacity = damp(this.boltMat.opacity, 0, 8, dt);
    this.lightning.intensity = damp(this.lightning.intensity, 0, 6, dt);
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

    const center = V(0, 3.8, 0);
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.m.position.addScaledVector(s.vel, dt);
      if (s.type === 'fire') {
        this.embers.emit({ x: s.m.position.x, y: s.m.position.y, z: s.m.position.z, vx: rand(-0.5, 0.5), vy: rand(0, 1), vz: rand(-0.5, 0.5), life: 0.5, size: rand(0.15, 0.3), color: this.emberColors[Math.floor(rand(0, 3))] });
      }
      if (!s.reflected && s.m.position.distanceTo(center) < 4.4) {
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

  pointerMove(p) {
    if (p.down && !this.game.on) {
      this.yawT -= p.dx * 0.006;
      this.pitchT = clamp(this.pitchT + p.dy * 0.004, -0.05, 0.8);
      this.idle = 0;
    }
  }

  swipe(s) {
    const vertical = Math.abs(s.dy) > Math.abs(s.dx) * 1.6;
    if (vertical && !this.game.on) {
      // undo the orbit the swipe caused, then change stage
      this.yawT += s.dx * 0.006;
      this.pitchT = clamp(this.pitchT - s.dy * 0.004, -0.05, 0.8);
      if (s.dy < 0 && this.stage < 4) this.setStage(this.stage + 1);
      else if (s.dy > 0 && this.stage > 0) this.setStage(this.stage - 1);
      return true;
    }
    if (this.stage < 4) {
      if (!this.game.on) this.app.toast('Swipe <b>up</b> to manifest the Armoured Susanoo, then slash.', 2200);
      return !this.game.on && false;
    }
    if (!this.game.on) { this.yawT += s.dx * 0.006; this.pitchT = clamp(this.pitchT - s.dy * 0.004, -0.05, 0.8); }
    this.slash(true);
    this._slashPath(s.path);
    return true;
  }

  click(p) {
    if (!this.game.on) this.throwKunai(p.ndc);
  }

  exit() {
    clearTimeout(this._manT);
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
        pw.value = damp(pw.value, this.stage > i ? 0.35 : 1, 3, dt);
      }
    }
    const strength = this.mats[1].uniforms.uReveal.value;
    this.glowLight.intensity = strength * (40 + this.stage * 15) + Math.sin(t * 9) * 3 * strength;
    this.groundMat.emissiveIntensity = 0.1 + strength * 0.5;
    this.bloom.strength = 0.6 + strength * 0.4;

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
    if (hold.fired) { this.app.sfx.chime(); this.mirrorMat.uniforms.uPower.value = 4; }
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
    if (this.idle > 2.5 && !this.game.on) this.yawT += dt * 0.12;
    this.yaw = damp(this.yaw, this.yawT, 5, dt);
    this.pitch = damp(this.pitch, this.pitchT, 5, dt);
    const portrait = this.app.width / this.app.height < 0.9;
    const dist = this.game.on ? (portrait ? 34 : 25) : (portrait ? 27 : 19) - (this.stage === 0 ? (portrait ? 12 : 9) : 0);
    const ly = this.stage === 0 ? 1.2 : 4.4;
    this.camDist = damp(this.camDist || dist, dist, 2, dt);
    this.camLook = damp(this.camLook || ly, ly, 2, dt);
    this.shake = damp(this.shake, 0, 5, dt);
    this.camera.position.set(
      Math.sin(this.yaw) * Math.cos(this.pitch) * this.camDist + rand(-1, 1) * this.shake * 0.3,
      this.camLook + Math.sin(this.pitch) * this.camDist + rand(-1, 1) * this.shake * 0.3,
      Math.cos(this.yaw) * Math.cos(this.pitch) * this.camDist,
    );
    this.camera.lookAt(0, this.camLook, 0);

    this.embers.update(dt, t);
    this.sparks.update(dt, t);
    this.crows.update(dt);
  }
}
