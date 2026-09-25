import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { ParticlePool } from '../objects/Particles.js';
import { CrowBurst } from '../objects/Crow.js';
import { createGrass, createForest, emitFireflies, barkTexture } from '../objects/Nature.js';
import { nightSky, bloodMoon } from '../objects/Dusk.js';
import { shurikenGeometry } from '../objects/Weapons.js';
import { JutsuDirector } from './JutsuDirector.js';
import { drawTexture, rand, damp, TAU, h, NOISE_GLSL, shared, glowTexture } from '../core/utils.js';
import { HAND_SIGNS, JUTSU } from '../data/content.js';

function fireMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uAlpha: { value: 1 }, uSeed: { value: Math.random() * 10 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform float uSeed;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec3 p = position;
        float n = snoise(p * 2.2 + vec3(uSeed, uTime * 2.5, 0.0));
        p += normal * n * 0.16;
        vP = p;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform float uAlpha; uniform float uSeed;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float fres = 1.0 - max(dot(vN, vV), 0.0);
        float n = snoise(vP * 3.5 + vec3(0.0, -uTime * 5.0, uSeed)) * 0.5 + 0.5;
        float k = clamp(fres * 1.3 + n * 0.45 - 0.2, 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.92, 0.6), vec3(1.0, 0.28, 0.03), k);
        col = mix(col, vec3(0.6, 0.03, 0.0), smoothstep(0.75, 1.0, k));
        gl_FragColor = vec4(col * 1.5, uAlpha * (0.85 - fres * 0.5));
        #include <colorspace_fragment>
      }`,
  });
}

const SIGN_KEYS = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];

export class Training extends Chapter {
  constructor(app) {
    super(app, { id: 'training', title: 'Training', jp: '修行' });
    this.bloom = { strength: 0.9, radius: 0.5, threshold: 0.7 };
    this.mode = 'shuriken';
    this.projectiles = [];
    this.stuck = [];
    this.fireballs = [];
    this.sequence = [];
    this.score = 0;
    this.round = { on: false, time: 0 };
    try { this.best = +localStorage.getItem('itachi-best') || 0; } catch (_) { this.best = 0; }
    this.shake = 0;
    this.learned = new Set();
  }

  build() {
    const s = this.scene;
    // a clear moonlit night: the distance fades into a cool blue haze instead of going black
    s.fog = new THREE.Fog(0x070b14, 16, 72);
    const moonPos = new THREE.Vector3(14, 16, -60);
    this.sky = nightSky(moonPos);
    s.add(this.sky);

    s.add(new THREE.HemisphereLight(0x8090c0, 0x1a1410, 1.6));
    const moonLight = new THREE.DirectionalLight(0xc8d0ff, 2.4);
    moonLight.position.set(-6, 10, -4);
    s.add(moonLight);
    this.flash = new THREE.PointLight(0xff7020, 0, 40, 1.5);
    s.add(this.flash);
    const paperTex = drawTexture(256, 256, (x, w) => {
      x.fillStyle = '#e8a060'; x.fillRect(0, 0, w, w);
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(80,20,0,0.5)'); g.addColorStop(0.5, 'rgba(255,220,160,0)'); g.addColorStop(1, 'rgba(80,20,0,0.5)');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
      x.strokeStyle = 'rgba(60,20,5,0.55)'; x.lineWidth = 3;
      for (let y = 10; y < w; y += 22) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
      x.fillStyle = 'rgba(40,6,4,0.85)';
      x.font = '900 120px "Noto Serif JP", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('火', w / 4, w / 2); x.fillText('火', (w * 3) / 4, w / 2);
    });
    for (const x of [-5, 5]) {
      const l = new THREE.Object3D();
      // paper lantern hanging from a wooden post
      const paper = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshStandardMaterial({ color: 0x3a1206, map: paperTex, emissive: 0xffffff, emissiveMap: paperTex, emissiveIntensity: 0.75, roughness: 0.85 }));
      paper.scale.y = 1.35;
      paper.position.set(x, 2.25, -3);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x120b08, roughness: 0.7 });
      const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 12), capMat);
      capT.position.set(x, 2.52, -3);
      const capB = capT.clone();
      capB.position.y = 1.98;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.9, 8), new THREE.MeshStandardMaterial({ color: 0xa08070, map: barkTexture(), roughness: 0.95 }));
      post.position.set(x + 0.35, 1.45, -3);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), capMat);
      arm.position.set(x + 0.18, 2.62, -3);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a30, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 }));
      halo.scale.setScalar(1.1);
      halo.position.copy(paper.position);
      l.position.copy(paper.position);
      const glowL = new THREE.PointLight(0xff8a40, 2.2, 7, 1.8);
      glowL.position.copy(paper.position);
      s.add(paper, capT, capB, post, arm, halo, glowL);
    }

    // moon
    const moon = bloodMoon(3.2, { pale: true });
    moon.position.copy(moonPos);
    moon.lookAt(0, 2, 6);
    s.add(moon);

    // moonlight shadows
    moonLight.castShadow = !this.app.low;
    moonLight.shadow.mapSize.set(1024, 1024);
    Object.assign(moonLight.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 40 });
    moonLight.target.position.set(0, 0, -8);
    s.add(moonLight.target);

    // ground, wind-swept grass and a pine forest
    const groundTex = drawTexture(512, 512, (x, w) => {
      x.fillStyle = '#0e130d'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 5000; i++) {
        x.fillStyle = `rgba(${rand(20, 45)},${rand(30, 55)},${rand(20, 35)},${rand(0.2, 0.6)})`;
        x.fillRect(rand(0, w), rand(0, w), rand(1, 3), rand(1, 3));
      }
    });
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(14, 14);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // the trodden clearing where the targets stand: bare earth thinning out into the grass
    const dirt = drawTexture(512, 512, (x, w) => {
      const g = x.createRadialGradient(w / 2, w / 2, w * 0.1, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(58,46,34,0.95)'); g.addColorStop(0.6, 'rgba(48,40,30,0.7)'); g.addColorStop(1, 'rgba(40,36,28,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 1800; i++) {
        const l = rand(30, 80);
        x.fillStyle = `rgba(${l},${l * 0.85},${l * 0.65},${rand(0.1, 0.35)})`;
        x.fillRect(rand(40, w - 40), rand(40, w - 40), rand(1, 4), rand(1, 4));
      }
    });
    const clearing = new THREE.Mesh(new THREE.PlaneGeometry(16, 13), new THREE.MeshStandardMaterial({ map: dirt, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.set(0, 0.01, -8.5);
    clearing.receiveShadow = true;
    s.add(clearing);
    const bark = new THREE.MeshStandardMaterial({ color: 0xc8a890, map: barkTexture(), roughness: 0.95 });
    const rope = new THREE.MeshStandardMaterial({ color: 0x9c8a66, roughness: 1 });
    [[6.6, -4.8], [7.7, -6.2], [8.8, -7.8]].forEach(([x, z], i) => {
      const hgt = 1.5 + i * 0.12;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, hgt, 14), bark);
      log.position.set(x, hgt / 2, z);
      log.rotation.y = rand(0, TAU);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 20), rope);
      band.rotation.x = Math.PI / 2;
      band.position.set(x, hgt * 0.62, z);
      log.castShadow = log.receiveShadow = true;
      s.add(log, band);
    });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x55565c, roughness: 0.95, flatShading: true });
    [[-6.5, -5.5, 0.5], [-7.4, -12, 0.8], [6, -13, 0.6], [-3, -4.5, 0.3], [9.5, -3, 0.45]].forEach(([x, z, r]) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stoneMat);
      rock.position.set(x, r * 0.35, z);
      rock.scale.set(rand(1, 1.5), rand(0.55, 0.8), rand(1, 1.3));
      rock.rotation.set(rand(0, 3), rand(0, 3), 0);
      rock.castShadow = rock.receiveShadow = true;
      s.add(rock);
    });
    this.grass = createGrass({ count: this.app.low ? 3500 : 9000, area: 24, center: new THREE.Vector3(0, 0, -8), tip: 0x5f7f3c, base: 0x13200f, avoid: (x, z) => Math.abs(x) < 1.3 && z > -2 });
    s.add(this.grass);
    s.add(createForest({ count: this.app.low ? 30 : 52, rMin: 22, rMax: 40, arc: [-Math.PI * 1.1, Math.PI * 0.1], center: new THREE.Vector3(0, 0, -4), castShadow: false }));
    this.fireflies = new ParticlePool({ count: 150, softness: 2 });
    s.add(this.fireflies.points);

    // targets
    // a slab of wood with painted rings, weathered: the paint faded and flaking, the grain showing through,
    // pitted where blades have struck
    const targetTex = drawTexture(512, 512, (x, w) => {
      x.fillStyle = '#7a5838'; x.fillRect(0, 0, w, w);
      x.translate(w / 2, w / 2);
      for (let r = 4; r < 256; r += rand(5, 11)) { x.strokeStyle = `rgba(60,38,20,${rand(0.2, 0.45)})`; x.lineWidth = rand(1, 3); x.beginPath(); x.arc(rand(-3, 3), rand(-3, 3), r, 0, TAU); x.stroke(); }
      const rings = ['#a89a84', '#6e1618', '#a89a84', '#6e1618', '#a89a84', '#241010'];
      rings.forEach((c, i) => { x.globalAlpha = 0.78; x.fillStyle = c; x.beginPath(); x.arc(0, 0, 230 - i * 38, 0, TAU); x.fill(); });
      x.globalAlpha = 1;
      for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(110,80,50,${rand(0.3, 0.7)})`; const a = rand(0, TAU), r = rand(0, 235); x.beginPath(); x.ellipse(Math.cos(a) * r, Math.sin(a) * r, rand(2, 9), rand(1, 4), a, 0, TAU); x.fill(); }
      for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(20,10,5,0.75)'; const a = rand(0, TAU), r = rand(0, 170); x.fillRect(Math.cos(a) * r, Math.sin(a) * r, rand(2, 5), rand(6, 14)); }
      x.strokeStyle = 'rgba(40,24,12,0.8)'; x.lineWidth = 10; x.beginPath(); x.arc(0, 0, 250, 0, TAU); x.stroke();
    });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb89878, map: barkTexture(), roughness: 0.95 });
    const layout = [
      { x: -4.5, y: 1.7, z: -9, move: 0 }, { x: 0, y: 2.4, z: -12, move: 2.5 }, { x: 4.5, y: 1.6, z: -10, move: 0 },
      { x: -2, y: 3.4, z: -16, move: -3 }, { x: 3, y: 1.2, z: -6.5, move: 0, bob: 1 },
    ];
    this.targets = layout.map((L, i) => {
      const g = new THREE.Group();
      g.position.set(L.x, 0, L.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, L.y, 10), woodMat);
      post.position.y = L.y / 2;
      const faceMat = new THREE.MeshStandardMaterial({ map: targetTex, roughness: 0.92 });
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 40), [woodMat, faceMat, woodMat]);
      disk.rotation.x = Math.PI / 2;
      disk.position.y = L.y;
      post.castShadow = disk.castShadow = true;
      g.add(post, disk);
      s.add(g);
      return { g, disk, faceMat, L, wobble: 0, phase: i * 1.7, char: 0 };
    });

    this.shurikenGeo = shurikenGeometry(0.95);
    this.shurikenMat = new THREE.MeshStandardMaterial({ color: 0xaab0ba, metalness: 0.9, roughness: 0.25, emissive: 0x111111 });

    // FX
    this.fire = new ParticlePool({ count: this.app.low ? 1200 : 2500, buoyancy: 2.5, turbulence: 3, drag: 1.4 });
    this.smoke = new ParticlePool({ count: 400, blending: THREE.NormalBlending, buoyancy: 0.8, drag: 1.5, softness: 2 });
    this.sparks = new ParticlePool({ count: 300, gravity: -9, drag: 0.6 });
    s.add(this.smoke.points, this.fire.points, this.sparks.points);
    this.fireColors = [new THREE.Color(0xffd070), new THREE.Color(0xff7a20), new THREE.Color(0xff3010)];
    this.smokeColor = new THREE.Color(0x3a3538);
    this.sparkColor = new THREE.Color(0xffe0b0);
    this.crows = new CrowBurst(this.app.low ? 30 : 50, 0.9);
    s.add(this.crows.mesh);
    this.director = new JutsuDirector(this);

    this.camera.position.set(0, 2, 6);
    this.camBase = new THREE.Vector3(0, 2, 6);
    this._buildUI();
    this.setMode('shuriken');
  }

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 修行',
      jp: '修行',
      title: 'Training <em>Grounds</em>',
      desc: 'Itachi once struck every target in a forest clearing — even one hidden in a blind spot — by bouncing kunai off one another. Throw shuriken, or weave hand signs to perform the Uchiha\'s fire techniques.',
      extra: [this.gestures([
        ['swipe', '<b>Flick</b> toward a target to throw'],
        ['tap', '<b>Tap</b> for a quick throw'],
        ['key', this.app.isTouch ? '<b>Hand Signs</b> mode to cast jutsu' : 'Weave signs with <b>Q–V</b> keys'],
      ])],
    });

    this.scoreEl = h('b', { text: '0' });
    this.timeEl = h('b', { text: '—' });
    this.bestEl = h('b', { text: String(this.best) });
    this.pills = h('div.hud-corner', {}, h('div.pill', {}, 'Score', this.scoreEl), h('div.pill', {}, 'Time', this.timeEl), h('div.pill', {}, 'Best', this.bestEl));
    this.ui.append(this.pills);

    // signs panel
    this.seqEl = h('div.sequence', { 'aria-live': 'polite' });
    const grid = h('div.signs-grid', {}, HAND_SIGNS.map((sg) => {
      const b = h('button.sign', { type: 'button', 'aria-label': `${sg.name} sign` }, h('kbd', { text: SIGN_KEYS[HAND_SIGNS.indexOf(sg)].toUpperCase() }), h('b', { text: sg.kanji }), h('span', { text: sg.name }));
      sg.btn = b;
      b.addEventListener('click', () => this.addSign(sg, b));
      return b;
    }));
    this.jutsuBtns = JUTSU.map((j) => {
      const b = h('button.jutsu', { type: 'button' }, h('span', {}, j.name, h('br'), h('small', { text: j.jp })));
      b.addEventListener('click', () => {
        this.app.sfx.click();
        this.guide = this.guide === j ? null : j;
        this.sequence = [];
        this.seqEl.replaceChildren();
        this._refreshGuide();
      });
      return b;
    });
    this.signsPanel = h('div.signs-panel.pe', {},
      h('h4', { text: 'Weave the signs' }), grid, this.seqEl,
      h('h4', { text: 'Scrolls — tap one to be guided' }), h('div.jutsu-list', {}, this.jutsuBtns));
    this.ui.append(this.signsPanel);

    this.modeBtns = {
      shuriken: this.button('Shuriken', () => this.setMode('shuriken')),
      signs: this.button('Hand Signs', () => this.setMode('signs')),
    };
    this.roundBtn = this.button('▶ 30s Trial', () => this.startRound(), 'btn-primary');
    this.ui.append(h('div.controls', {},
      h('div.group', {}, this.modeBtns.shuriken, this.modeBtns.signs),
      this.roundBtn,
    ));
  }

  setMode(m) {
    this.mode = m;
    for (const [k, b] of Object.entries(this.modeBtns)) b.classList.toggle('active', k === m);
    this.signsPanel.style.display = m === 'signs' ? '' : 'none';
    this.signsPanel.classList.toggle('open', m === 'signs');
    this.pills.style.display = m === 'shuriken' ? '' : 'none';
    this.roundBtn.style.display = m === 'shuriken' ? '' : 'none';
    if (m === 'signs' && this.round.on) this.endRound();
    this.director?.show(m === 'signs');
  }

  startRound() {
    this.round = { on: true, time: 30 };
    this.app.sfx.setMood('battle');
    this.score = 0;
    this.scoreEl.textContent = '0';
    this.roundBtn.textContent = 'Trial running…';
    this.app.toast('<b>Trial begins!</b> Hit as many targets as you can in 30 seconds.');
  }

  endRound() {
    this.round.on = false;
    this.app.sfx.setMood(this.mood);
    this.roundBtn.textContent = '▶ 30s Trial';
    this.timeEl.textContent = '—';
    if (this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem('itachi-best', String(this.best)); } catch (_) { /* private mode */ }
      this.bestEl.textContent = String(this.best);
      this.app.toast(`<b>New record: ${this.score}</b> — even Itachi would nod.`);
      this.app.sfx.chime();
    } else {
      this.app.toast(`Trial over — <b>${this.score}</b> points. Again, Sasuke… maybe next time.`);
    }
  }

  /* ---------- shuriken ---------- */

  throwShuriken(ndc, speed = 34) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const m = new THREE.Mesh(this.shurikenGeo, this.shurikenMat);
    m.position.copy(this.camera.position).addScaledVector(ray.ray.direction, 0.8).add(new THREE.Vector3(0.25, -0.35, 0));
    const target = this.camera.position.clone().addScaledVector(ray.ray.direction, 30);
    const vel = target.sub(m.position).normalize().multiplyScalar(speed);
    m.lookAt(m.position.clone().add(vel));
    this.scene.add(m);
    this.projectiles.push({ m, vel, life: 1.6, prev: m.position.clone() });
    this.app.sfx.swoosh();
  }

  _updateShuriken(dt) {
    const tmp = new THREE.Vector3();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.prev.copy(pr.m.position);
      pr.m.position.addScaledVector(pr.vel, dt);
      pr.vel.y -= 4 * dt;
      pr.m.rotateZ(dt * 30);
      pr.life -= dt;
      let hit = false;
      for (const tg of this.targets) {
        const c = tg.disk.getWorldPosition(tmp);
        if ((pr.prev.z - c.z) * (pr.m.position.z - c.z) > 0) continue;
        const k = (c.z - pr.prev.z) / (pr.m.position.z - pr.prev.z);
        const hp = pr.prev.clone().lerp(pr.m.position, k);
        const dist = Math.hypot(hp.x - c.x, hp.y - c.y);
        if (dist < 0.62) {
          hit = true;
          const pts = dist < 0.14 ? 100 : dist < 0.36 ? 50 : 25;
          this._stick(pr.m, tg, hp);
          tg.wobble = 1;
          this.sparks.burst(hp, 18, { speed: 4, life: [0.2, 0.5], size: [0.02, 0.05], color: this.sparkColor });
          this.app.sfx.thud();
          if (this.round.on) {
            this.score += pts;
            this.scoreEl.textContent = String(this.score);
          }
          if (pts === 100) this.app.toast('<b>Bullseye!</b> +100', 1200);
          break;
        }
      }
      if (hit) { this.projectiles.splice(i, 1); continue; }
      if (pr.life <= 0 || pr.m.position.y < 0) {
        if (pr.m.position.y < 0.1) this.app.sfx.clink();
        this.scene.remove(pr.m);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _stick(mesh, tg, worldPoint) {
    tg.disk.worldToLocal(worldPoint);
    tg.disk.add(mesh);
    mesh.position.copy(worldPoint);
    mesh.position.y = 0.09;
    mesh.rotation.set(Math.PI / 2 + rand(-0.4, 0.4), rand(0, TAU), 0);
    this.stuck.push(mesh);
    if (this.stuck.length > 40) {
      const old = this.stuck.shift();
      old.parent?.remove(old);
    }
  }

  /* ---------- hand signs ---------- */

  addSign(sg, btn) {
    if (this.director.busy) return;
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 180);
    const next = [...this.sequence, sg.key];
    const isPrefix = (seq) => JUTSU.some((j) => seq.length <= j.seq.length && seq.every((k, i) => k === j.seq[i]));
    if (!isPrefix(next)) {
      // wrong sign: the chakra fizzles, but it may start a new sequence
      this.app.sfx.fizzle();
      this.director.signPulse(sg, false);
      this.seqEl.classList.remove('shake');
      void this.seqEl.offsetWidth;
      this.seqEl.classList.add('shake');
      this.sequence = isPrefix([sg.key]) ? [sg.key] : [];
      this.seqEl.replaceChildren(...this.sequence.map(() => h('i', { text: sg.kanji, title: sg.name })));
      this._refreshGuide();
      return;
    }
    this.sequence = next;
    this.app.sfx.signTone(this.sequence.length - 1);
    this.director.signPulse(sg, true);
    this.seqEl.append(h('i', { text: sg.kanji, title: sg.name }));
    const done = JUTSU.find((j) => j.seq.length === next.length && next.every((k, i) => k === j.seq[i]));
    if (done) {
      this.cast(done);
      this.sequence = [];
      this.guide = null;
      setTimeout(() => this.seqEl.replaceChildren(), 600);
    }
    this._refreshGuide();
  }

  /** Highlights the next sign of the guided (or matching) jutsu and shows progress on its scroll. */
  _refreshGuide() {
    const seq = this.sequence;
    const matching = JUTSU.filter((j) => seq.length && seq.every((k, i) => k === j.seq[i]));
    const target = this.guide && (!seq.length || matching.includes(this.guide)) ? this.guide : matching.length === 1 ? matching[0] : null;
    const nextKey = target ? target.seq[seq.length] : null;
    HAND_SIGNS.forEach((s) => s.btn.classList.toggle('next', s.key === nextKey));
    JUTSU.forEach((j, i) => {
      const b = this.jutsuBtns[i];
      b.classList.toggle('guided', j === this.guide);
      const on = matching.includes(j) ? seq.length : 0;
      b.style.setProperty('--prog', `${(on / j.seq.length) * 100}%`);
    });
  }
  cast(j) {
    if (!this.learned.has(j.key)) {
      this.learned.add(j.key);
      this.jutsuBtns[JUTSU.indexOf(j)].classList.add('done');
    }
    this.director.cast(j);
  }
  _fireball(to, size, dur, from = new THREE.Vector3(0, 1.3, 2.2)) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), fireMaterial());
    m.position.copy(from);
    m.scale.setScalar(0.1);
    this.scene.add(m);
    this.fireballs.push({ m, from: from.clone(), to: to.clone(), size, dur, t: 0 });
    this.app.sfx.flame();
  }

  _updateFireballs(dt) {
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const e = 1 - Math.pow(1 - k, 2);
      f.m.position.lerpVectors(f.from, f.to, e);
      f.m.scale.setScalar(Math.max(0.1, f.size * (0.2 + 0.8 * e)));
      f.m.rotation.y += dt;
      for (let q = 0; q < (this.app.low ? 4 : 8); q++) {
        this.fire.emit({
          x: f.m.position.x + rand(-1, 1) * f.m.scale.x * 0.6, y: f.m.position.y + rand(-1, 1) * f.m.scale.x * 0.6, z: f.m.position.z + rand(-1, 1) * f.m.scale.x * 0.6,
          vx: rand(-1, 1), vy: rand(0, 2), vz: rand(1, 3), life: rand(0.3, 0.7), size: rand(0.2, 0.5) * Math.sqrt(f.size), color: this.fireColors[Math.floor(rand(0, 3))], grow: -0.5,
        });
      }
      this.flash.position.copy(f.m.position);
      this.flash.intensity = Math.max(this.flash.intensity, 60 * f.size);
      if (k >= 1) {
        this.fire.burst(f.to, this.app.low ? 120 : 260, { speed: 8 * f.size, up: 2, life: [0.4, 1.2], size: [0.3, 0.9], colors: this.fireColors, grow: -0.4 });
        this.smoke.burst(f.to, 40, { speed: 2.5, up: 1.5, life: [1, 2.2], size: [0.6, 1.4], color: this.smokeColor, grow: 1.2, alpha: 0.6 });
        this.flash.intensity = 300 * f.size;
        this.shake = Math.min(1, 0.4 + f.size * 0.25);
        this.app.sfx.boom();
        this.bendAt = { x: f.to.x, z: f.to.z, s: 1.2 + f.size * 0.6, r: 3 + f.size * 2.5 };
        for (const tg of this.targets) {
          if (tg.disk.getWorldPosition(new THREE.Vector3()).distanceTo(f.to) < 2.5 + f.size * 1.5) { tg.char = Math.min(1, tg.char + 0.5); tg.wobble = 1; }
        }
        this.scene.remove(f.m);
        f.m.geometry.dispose();
        f.m.material.dispose();
        this.fireballs.splice(i, 1);
      }
    }
  }

  /* ---------- input / loop ---------- */

  click(p) {
    if (this.mode === 'shuriken') this.throwShuriken(p.ndc);
  }

  /** Flick to throw: direction and speed of the swipe decide the throw. */
  swipe(s) {
    if (this.mode !== 'shuriken' || s.vy > 0.2) return false;
    const lead = 180;
    const x = Math.min(this.app.width, Math.max(0, s.x1 + s.vx * lead));
    const y = Math.min(this.app.height, Math.max(0, s.y1 + s.vy * lead));
    const ndc = new THREE.Vector2((x / this.app.width) * 2 - 1, -(y / this.app.height) * 2 + 1);
    const speed = Math.min(52, 24 + s.speed * 12);
    this.throwShuriken(ndc, speed);
    if (s.speed > 2.2) setTimeout(() => this.throwShuriken(ndc.clone().add(new THREE.Vector2(rand(-0.05, 0.05), rand(-0.04, 0.04))), speed), 70);
    return true;
  }

  key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const i = SIGN_KEYS.indexOf(e.key.toLowerCase());
    if (i < 0) return false;
    if (this.director.busy) return true;
    if (this.mode !== 'signs') this.setMode('signs');
    const sg = HAND_SIGNS[i];
    this.addSign(sg, sg.btn);
    return true;
  }

  pointerMove() {
    this.app.setHover(this.mode === 'shuriken');
  }

  exit() {
    if (this.round.on) this.endRound();
    if (this.director.busy) this.director._finish();
    this.director.cam = null;
  }

  resize(w, hh) {
    super.resize(w, hh);
    const aspect = w / hh;
    this.camera.fov = aspect < 0.9 ? 68 : 50;
    this.camera.updateProjectionMatrix();
  }

  update(dt, t) {
    this.sky.userData.uniforms.uTime.value = t;
    if (this.round.on) {
      this.round.time -= dt;
      this.timeEl.textContent = Math.max(0, this.round.time).toFixed(1);
      if (this.round.time <= 0) this.endRound();
    }
    const speed = this.round.on ? 1.6 : 1;
    this.targets.forEach((tg) => {
      const { L } = tg;
      if (L.move) tg.g.position.x = L.x + Math.sin(t * 0.9 * speed + tg.phase) * L.move;
      if (L.bob) tg.disk.position.y = L.y + Math.sin(t * 1.6 * speed) * 0.6;
      tg.wobble = damp(tg.wobble, 0, 5, dt);
      tg.disk.rotation.z = Math.sin(t * 30) * tg.wobble * 0.15;
      tg.faceMat.color.setScalar(1 - tg.char * 0.75);
      tg.char = Math.max(0, tg.char - dt * 0.02);
    });

    this._updateShuriken(dt);
    this._updateFireballs(dt);
    this.flash.intensity = damp(this.flash.intensity, 0, 4, dt);

    // camera: the jutsu director takes over during a technique
    this.shake = damp(this.shake, 0, 4, dt);
    if (!this.director.update(dt, t)) {
      const pn = this.app.pointer.ndc;
      const sx = this.app.isTouch ? 0 : pn.x * 0.6;
      const sy = this.app.isTouch ? 0 : pn.y * 0.3;
      this.camera.position.set(
        damp(this.camera.position.x, this.camBase.x + sx, 3, dt) + rand(-1, 1) * this.shake * 0.15,
        damp(this.camera.position.y, this.camBase.y + sy, 3, dt) + rand(-1, 1) * this.shake * 0.15,
        damp(this.camera.position.z, this.camBase.z, 3, dt),
      );
      // on a phone, tilting turns your head across the clearing
      const gyro = this.app.gyro;
      this.gyroLook = this.gyroLook || new THREE.Vector2();
      this.gyroLook.x = damp(this.gyroLook.x, gyro ? gyro.x * 3.2 : 0, 5, dt);
      this.gyroLook.y = damp(this.gyroLook.y, gyro ? -gyro.y * 1.4 : 0, 5, dt);
      this._look = (this._look || new THREE.Vector3()).set(this.camera.position.x * 0.3 + this.gyroLook.x, 1.9 + this.gyroLook.y, -10);
      this.camera.lookAt(this._look);
      this.director.syncLook(this._look);
    }

    // blast wave flattens the grass, then it springs back
    const bend = this.grass.userData.bend.value;
    if (this.bendAt) {
      bend.set(this.bendAt.x, this.bendAt.z, this.bendAt.r, this.bendAt.s);
      this.bendAt.s = damp(this.bendAt.s, 0, 1.5, dt);
      if (this.bendAt.s < 0.01) this.bendAt = null;
    } else bend.w = 0;
    emitFireflies(this.fireflies, dt, { rate: 7, center: new THREE.Vector3(0, 0, -8), spread: 12 });
    this.fireflies.update(dt, t);
    this.fire.update(dt, t);
    this.smoke.update(dt, t);
    this.sparks.update(dt, t);
    this.crows.update(dt);
  }
}
