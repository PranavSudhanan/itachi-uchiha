import * as THREE from 'three';
import { ParticlePool } from '../objects/Particles.js';
import { FlameField } from '../objects/FlameField.js';
import { createItachiFigure } from '../objects/Figure.js';
import { createCrowGeometry, createCrowMaterial, addPhases } from '../objects/Crow.js';
import { shurikenGeometry } from '../objects/Weapons.js';
import { NOISE_GLSL, shared, drawTexture, glowTexture, rand, damp, clamp, lerp, easeInOut, TAU, h } from '../core/utils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const val = (v) => (typeof v === 'function' ? v() : v);

function fireBallMaterial(seed, { inner = false, additive = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uAlpha: { value: 1 }, uSeed: { value: seed }, uHeat: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: inner ? THREE.BackSide : THREE.FrontSide,
    vertexShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform float uSeed;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vDisp;
      void main(){
        vec3 p = position;
        float n = snoise(p * 1.6 + vec3(uSeed, -uTime * 2.2, uSeed * 0.5));
        float n2 = snoise(p * 3.8 + vec3(-uTime * 3.0, uSeed, 0.0));
        float d = n * 0.22 + n2 * 0.08;
        p += normal * d;
        vDisp = d;
        vP = position;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform float uAlpha; uniform float uSeed; uniform float uHeat;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vDisp;
      void main(){
        float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float n = snoise(vP * 2.4 + vec3(0.0, -uTime * 4.0, uSeed)) * 0.5 + 0.5;
        float n2 = snoise(vP * 6.0 + vec3(uTime * 2.0, -uTime * 6.0, uSeed)) * 0.5 + 0.5;
        float k = clamp(fres * 0.8 + (1.0 - n) * 0.75 + n2 * 0.4 - vDisp * 2.2 - 0.05 + (1.0 - uHeat) * 0.5, 0.0, 1.0);
        vec3 white = vec3(1.0, 0.97, 0.85);
        vec3 yellow = vec3(1.0, 0.72, 0.22);
        vec3 orange = vec3(1.0, 0.33, 0.04);
        vec3 red = vec3(0.55, 0.04, 0.0);
        vec3 col = mix(white, yellow, smoothstep(0.0, 0.2, k));
        col = mix(col, orange, smoothstep(0.2, 0.55, k));
        col = mix(col, red, smoothstep(0.55, 0.95, k));
        float a = uAlpha * (1.0 - smoothstep(0.75, 1.0, k) * 0.8);
        gl_FragColor = vec4(col * (0.85 + n2 * 0.45), a * 0.9);
        #include <colorspace_fragment>
      }`,
  });
}

let _scorchTex, _sealTex;
function scorchTexture() {
  if (_scorchTex) return _scorchTex;
  _scorchTex = drawTexture(512, 512, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(8,4,2,0.95)'); g.addColorStop(0.55, 'rgba(18,8,4,0.8)'); g.addColorStop(1, 'rgba(20,10,5,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
    for (let i = 0; i < 140; i++) {
      const a = rand(0, TAU), r = rand(0.3, 0.5) * w;
      x.fillStyle = `rgba(10,5,2,${rand(0.1, 0.4)})`;
      x.beginPath(); x.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, rand(6, 26), 0, TAU); x.fill();
    }
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(255,${rand(60, 140)},20,${rand(0.3, 0.8)})`;
      x.beginPath(); x.arc(w / 2 + rand(-0.3, 0.3) * w, w / 2 + rand(-0.3, 0.3) * w, rand(1, 3), 0, TAU); x.fill();
    }
  });
  return _scorchTex;
}
function sealTexture() {
  if (_sealTex) return _sealTex;
  _sealTex = drawTexture(1024, 1024, (x, w) => {
    x.translate(w / 2, w / 2);
    x.strokeStyle = '#ff2a3a'; x.fillStyle = '#ff2a3a';
    x.shadowColor = '#ff0020'; x.shadowBlur = 18;
    for (const [r, lw] of [[490, 10], [455, 4], [300, 6], [270, 3], [120, 8]]) { x.lineWidth = lw; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); }
    x.lineWidth = 3;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      x.beginPath(); x.moveTo(Math.cos(a) * 300, Math.sin(a) * 300); x.lineTo(Math.cos(a) * 455, Math.sin(a) * 455); x.stroke();
    }
    x.font = '900 64px "Noto Serif JP", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const ring = '口寄せの術・契約・口寄せの術・契約・';
    for (let i = 0; i < ring.length; i++) {
      const a = (i / ring.length) * TAU;
      x.save(); x.rotate(a); x.translate(0, -378); x.fillText(ring[i], 0, 0); x.restore();
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      x.lineWidth = 6;
      x.beginPath(); x.moveTo(Math.cos(a) * 120, Math.sin(a) * 120); x.lineTo(Math.cos(a + TAU * 2 / 5) * 270, Math.sin(a + TAU * 2 / 5) * 270); x.stroke();
    }
    x.font = '900 150px "Noto Serif JP", serif';
    x.fillText('鴉', 0, 6);
  });
  return _sealTex;
}

/**
 * Directs the hand-sign jutsu: Itachi in the clearing, the signs, and a cinematic for each technique.
 */
export class JutsuDirector {
  constructor(ch) {
    this.ch = ch;
    this.app = ch.app;
    this.scene = ch.scene;
    this.camera = ch.camera;
    this.busy = false;
    this.cam = null;
    this.events = [];
    this.time = 0;
    this.shake = 0;
    this.lookV = V(0, 1.9, -10);
    this._build();
  }

  get I() { return this.itachi.position; }
  get mouth() { return this.itachi.position.clone().add(V(0, 1.63, -0.22)); }

  _build() {
    const s = this.scene;
    const low = this.app.low;

    this.itachi = createItachiFigure();
    this.itachi.position.set(-1.3, 0, -1.4);
    this.itachi.rotation.y = Math.PI;
    this.itachi.visible = false;
    s.add(this.itachi);
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3a2a, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.aura.scale.setScalar(1.6);
    s.add(this.aura);

    this.chakra = new ParticlePool({ count: 500, drag: 0.5, softness: 1.6 });
    this.fire = new ParticlePool({ count: low ? 1800 : 3600, buoyancy: 1.6, turbulence: 2.4, drag: 1.1, softness: 1.3 });
    this.smoke = new ParticlePool({ count: low ? 400 : 800, blending: THREE.NormalBlending, buoyancy: 1.1, drag: 1.3, turbulence: 0.8, softness: 2.2 });
    this.embers = new ParticlePool({ count: 700, gravity: -1.5, turbulence: 2, drag: 0.5 });
    this.feathers = new ParticlePool({ count: 200, blending: THREE.NormalBlending, gravity: -0.8, drag: 1.4, turbulence: 2, softness: 0.6 });
    s.add(this.smoke.points, this.fire.points, this.embers.points, this.chakra.points, this.feathers.points);
    this.fireCols = [0xfff2c0, 0xffc050, 0xff7a20, 0xff3a08].map((c) => new THREE.Color(c));
    this.smokeCols = [0x2a2426, 0x3a3234, 0x1c1718].map((c) => new THREE.Color(c));
    this.whiteSmoke = [0xd8d4d0, 0xb8b2ae, 0x9a9490].map((c) => new THREE.Color(c));
    this.chakraCols = [new THREE.Color(0xff5030), new THREE.Color(0xffb060)];
    this.featherCol = new THREE.Color(0x060409);

    this.flames = new FlameField(128, { core: 0xfff4c8, edge: 0xff6a18, glow: 0xff2a00, blending: THREE.AdditiveBlending, glowAmt: 0.8 });
    s.add(this.flames.mesh);

    // great fireball: core + shell
    this.ball = new THREE.Group();
    this.ballCore = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), fireBallMaterial(1.7, { additive: false }));
    this.ballShell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.18, 4), fireBallMaterial(5.3, { inner: false }));
    this.ballShell.material.uniforms.uHeat.value = 0.55;
    this.ball.add(this.ballCore, this.ballShell);
    this.ball.visible = false;
    s.add(this.ball);
    this.light = new THREE.PointLight(0xff7a30, 0, 45, 1.2);
    s.add(this.light);

    // small fireballs (phoenix)
    this.smallGeo = new THREE.IcosahedronGeometry(1, 3);
    this.smallBalls = [];
    this.hiddenShuriken = shurikenGeometry(0.9);
    this.hiddenMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.3 });

    // scorch marks
    this.scorches = [];

    // summoning seal
    this.seal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: sealTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.seal.rotation.x = -Math.PI / 2;
    this.seal.position.y = 0.04;
    this.seal.visible = false;
    s.add(this.seal);

    // summoned crows
    this.crowN = low ? 50 : 90;
    const cg = createCrowGeometry(1.1);
    addPhases(cg, this.crowN);
    this.crowMesh = new THREE.InstancedMesh(cg, createCrowMaterial({ flap: 15, amp: 0.6 }), this.crowN);
    this.crowMesh.frustumCulled = false;
    this.crowMesh.visible = false;
    s.add(this.crowMesh);
    this.crowData = Array.from({ length: this.crowN }, () => ({}));
    this.dummy = new THREE.Object3D();

    // DOM: sign flash + title card
    this.signFlash = h('div.sign-flash', {}, h('b'), h('i'));
    this.title = h('div.jutsu-title', {}, h('div.jt-stamp', { text: '印' }), h('div.jt-jp'), h('div.jt-en'), h('div.jt-note'));
    this.ch.ui.append(this.signFlash, this.title);
  }

  /* ---------------- presence ---------------- */

  show(on) {
    if (on === this.itachi.visible) return;
    const at = this.I.clone().add(V(0, 1, 0));
    this.ch.crows.fire(at, { speed: 5, up: 3, life: 1.6 });
    this.smoke.burst(at, 30, { speed: 1.6, up: 0.4, life: [0.6, 1.2], size: [0.5, 0.9], colors: this.smokeCols, grow: 1.4, alpha: 0.6 });
    this.app.sfx.flutter();
    this.itachi.visible = on;
  }

  signPulse(sign, ok = true) {
    const b = this.signFlash;
    b.querySelector('b').textContent = sign.kanji;
    b.querySelector('i').textContent = sign.name;
    b.classList.remove('on', 'bad');
    void b.offsetWidth;
    b.classList.add('on');
    if (!ok) b.classList.add('bad');
    if (!this.itachi.visible) return;
    this.auraPulse = 1;
    const hands = this.I.clone().add(V(0, 1.25, -0.35));
    this.chakra.burst(hands, ok ? 26 : 40, { speed: ok ? 1.6 : 3, up: 0.6, life: [0.3, 0.7], size: [0.04, 0.1], colors: ok ? this.chakraCols : [new THREE.Color(0x8888aa)] });
  }

  /* ---------------- cinematic helpers ---------------- */

  _track(keys) {
    this.cam = { t: 0, keys: [{ t: 0, pos: this.camera.position.clone(), look: this.lookV.clone() }, ...keys] };
  }

  _camUpdate(dt) {
    const c = this.cam;
    if (!c) return false;
    c.t += dt;
    const keys = c.keys;
    const last = keys[keys.length - 1];
    let pos, look;
    if (c.t >= last.t) {
      pos = val(last.pos); look = val(last.look);
      this.cam = null;
    } else {
      let i = 0;
      while (i < keys.length - 2 && keys[i + 1].t <= c.t) i++;
      const a = keys[i], b = keys[i + 1];
      const k = easeInOut(clamp((c.t - a.t) / (b.t - a.t), 0, 1));
      pos = val(a.pos).clone().lerp(val(b.pos), k);
      look = val(a.look).clone().lerp(val(b.look), k);
    }
    this.shake = damp(this.shake, 0, 4, dt);
    this.camera.position.copy(pos).add(V(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(this.shake * 0.18));
    this.lookV.copy(look);
    this.camera.lookAt(this.lookV);
    return true;
  }

  _at(t, fn) { this.events.push({ t, fn }); }

  _titleCard(j) {
    const el = this.title;
    el.querySelector('.jt-jp').textContent = j.jp;
    el.querySelector('.jt-en').textContent = j.name;
    el.querySelector('.jt-note').textContent = j.note;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this._titleT);
    this._titleT = setTimeout(() => el.classList.remove('on'), 3400);
  }

  _baseCam() { return this.ch.camBase.clone(); }
  _baseLook() { return V(this.ch.camBase.x * 0.3, 1.9, -10); }

  /* ---------------- cast ---------------- */

  cast(j) {
    if (this.busy) return false;
    this.busy = true;
    this.time = 0;
    this.events = [];
    this.ch.ui.classList.add('casting');
    this._bloomSave = { ...this.ch.bloom };
    Object.assign(this.ch.bloom, { strength: 0.75, threshold: 0.88, radius: 0.55 });
    this.app.sfx.setMood('battle');
    if (!this.itachi.visible) this.show(true);
    if (j.key === 'fireball') this._planFireball(j);
    else if (j.key === 'phoenix') this._planPhoenix(j);
    else this._planSummon(j);
    return true;
  }

  _finish() {
    this.busy = false;
    this.phase = null;
    this.events = [];
    this.ball.visible = false;
    this.crowMesh.visible = false;
    this.seal.visible = false;
    this.itachi.scale.y = 1;
    this.itachi.rotation.x = 0;
    this.ch.ui.classList.remove('casting');
    if (this._bloomSave) Object.assign(this.ch.bloom, this._bloomSave);
    this.app.sfx.setMood(this.ch.mood);
  }

  /* ---------------- Great Fireball ---------------- */

  _planFireball(j) {
    const I = this.I.clone();
    const side = I.clone().add(V(1.7, 1.7, -1.9));
    this._track([
      { t: 0.9, pos: side, look: I.clone().add(V(0, 1.55, 0)) },
      { t: 1.5, pos: I.clone().add(V(3.6, 1.6, 1.2)), look: I.clone().add(V(0, 1.8, -4.5)) },
      { t: 3.0, pos: I.clone().add(V(5.2, 3.4, 5.5)), look: () => this.ball.position.clone().add(V(0, -0.5, 0)) },
      { t: 4.7, pos: I.clone().add(V(4.6, 3.8, 6.5)), look: () => this.ballEnd.clone().add(V(0, 0.8, 0)) },
      { t: 6.0, pos: this._baseCam(), look: this._baseLook() },
    ]);
    this.ballStart = this.mouth.add(V(0, 0, -0.8));
    this.ballEnd = V(this.I.x + 0.6, 2.8, -15);
    this.phase = 'fb-gather';
    this.app.sfx.inhale();
    this._at(0.95, () => {
      this.phase = 'fb-breath';
      this._titleCard(j);
      this.app.sfx.roar(2.6);
      this.app.flash(0.15, 0xffb060);
      this.ball.visible = true;
      this.ball.position.copy(this.ballStart);
      this.ball.scale.setScalar(0.2);
      this.ballCore.material.uniforms.uAlpha.value = 1;
      this.ballShell.material.uniforms.uAlpha.value = 0.35;
      this.shake = 0.5;
    });
    this._at(2.1, () => { this.phase = 'fb-roll'; });
    this._at(3.6, () => this._fireballBlast());
    this._at(6.1, () => this._finish());
  }

  _fireballBlast() {
    this.phase = 'fb-blast';
    const p = this.ball.position.clone();
    this.fire.burst(p, this.app.low ? 200 : 380, { speed: 11, up: 2, life: [0.5, 1.4], size: [0.5, 1.2], colors: this.fireCols.slice(1), grow: -0.3, alpha: 0.45 });
    this.smoke.burst(p.clone().setY(1.5), this.app.low ? 90 : 170, { speed: 4, up: 2.2, life: [2, 4], size: [1, 2.2], colors: this.smokeCols, grow: 2.2, alpha: 0.75 });
    this.embers.burst(p, 220, { speed: 9, up: 4, life: [1, 2.6], size: [0.04, 0.1], colors: this.fireCols });
    this.app.sfx.boom();
    this.app.flash(0.3, 0xffc070);
    this.shake = 1.2;
    this.light.intensity = 260;
    this._scorch(p.x, p.z, 4.5);
    for (const tg of this.ch.targets) {
      const d = tg.disk.getWorldPosition(V(0, 0, 0)).distanceTo(p);
      if (d < 7) { tg.char = 1; tg.wobble = 1; }
    }
    this.blastT = 0;
  }

  _scorch(x, z, r) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.set(-Math.PI / 2, 0, rand(0, TAU));
    m.position.set(x, 0.03, z);
    this.scene.add(m);
    const tongues = Array.from({ length: Math.round(r * 2.5) }, () => ({ x: x + rand(-r, r) * 0.6, z: z + rand(-r, r) * 0.6, w: rand(0.5, 0.9), hh: rand(0.8, 1.6), seed: rand(0, 100) }));
    this.scorches.push({ m, life: 14, tongues, burn: 6 });
  }

  _updateFireball(dt) {
    const t = this.time;
    const mouth = this.mouth;
    if (this.phase === 'fb-gather') {
      // chakra and air rush into his mouth
      for (let i = 0; i < 6; i++) {
        const p = mouth.clone().add(V(rand(-1, 1), rand(-1, 1), rand(-1, 0.4)).normalize().multiplyScalar(rand(1.2, 2.4)));
        const v = mouth.clone().sub(p).multiplyScalar(2.6);
        this.chakra.emit({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life: 0.4, size: rand(0.04, 0.09), color: this.chakraCols[i % 2], alpha: 1 });
      }
      this.auraTarget = 0.8 + t * 0.6;
      this.itachi.rotation.x = -t * 0.12;
    }
    if (this.phase === 'fb-breath' || this.phase === 'fb-roll') {
      const breathing = this.phase === 'fb-breath';
      const k = breathing ? clamp((t - 0.95) / 1.15, 0, 1) : clamp((t - 2.1) / 1.5, 0, 1);
      if (breathing) {
        this.ball.position.lerpVectors(this.ballStart, V(this.ballStart.x + 0.3, 2.2, -6.5), easeInOut(k));
        this.ball.scale.setScalar(lerp(0.3, 2.7, Math.pow(k, 0.7)));
        this.itachi.rotation.x = damp(this.itachi.rotation.x, 0.18, 6, dt);
        // flamethrower stream from the mouth feeding the ball
        const n = this.app.low ? 8 : 14;
        for (let i = 0; i < n; i++) {
          const dir = this.ball.position.clone().sub(mouth).normalize();
          const sp = rand(9, 15);
          this.fire.emit({
            x: mouth.x + rand(-0.05, 0.05), y: mouth.y + rand(-0.05, 0.05), z: mouth.z,
            vx: dir.x * sp + rand(-1.2, 1.2), vy: dir.y * sp + rand(-0.8, 1.2), vz: dir.z * sp + rand(-1, 1),
            life: rand(0.25, 0.5), size: rand(0.12, 0.26), color: this.fireCols[Math.floor(rand(1, 4))], grow: 1.8, alpha: 0.35,
          });
        }
      } else {
        const from = V(this.ballStart.x + 0.3, 2.2, -6.5);
        this.ball.position.lerpVectors(from, this.ballEnd, easeInOut(k));
        this.ball.scale.setScalar(lerp(2.7, 3.5, k));
        this.itachi.rotation.x = damp(this.itachi.rotation.x, 0, 3, dt);
      }
      const r = this.ball.scale.x;
      this.ball.rotation.y += dt * 0.8;
      this.ball.rotation.x += dt * 0.5;
      // trailing fire and embers
      const bp = this.ball.position;
      for (let i = 0; i < (this.app.low ? 5 : 9); i++) {
        const d = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
        this.fire.emit({
          x: bp.x + d.x * r * 0.9, y: bp.y + d.y * r * 0.9, z: bp.z + d.z * r * 0.9,
          vx: d.x * 2, vy: d.y * 2 + 1.5, vz: d.z * 2 + 4,
          life: rand(0.4, 0.8), size: rand(0.4, 0.9) * r * 0.4, color: this.fireCols[Math.floor(rand(2, 4))], grow: -0.4, alpha: 0.4,
        });
      }
      if (Math.random() < 0.6) this.embers.emit({ x: bp.x + rand(-r, r), y: bp.y + rand(-r, r) * 0.5, z: bp.z + rand(-r, r), vx: rand(-2, 2), vy: rand(1, 4), vz: rand(1, 4), life: rand(1, 2), size: rand(0.03, 0.08), color: this.fireCols[1] });
      // tongues licking off the surface
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + this.time * 1.3;
        this.flames.push(bp.x + Math.cos(a) * r * 0.8, bp.y - r * 0.35 + Math.sin(i * 1.7) * r * 0.3, bp.z + Math.sin(a) * r * 0.8, r * 0.6, r * 1.2, i * 13.7, 0.45);
      }
      this.light.position.copy(bp);
      this.light.intensity = 60 * r + Math.sin(this.time * 30) * 10;
      this.ch.bendAt = { x: bp.x, z: bp.z, r: r * 1.8, s: 1.1 };
      // char targets it passes near
      for (const tg of this.ch.targets) {
        const d = tg.disk.getWorldPosition(V(0, 0, 0)).distanceTo(bp);
        if (d < r + 1.2) { tg.char = Math.min(1, tg.char + dt * 2); tg.wobble = 1; }
      }
    }
    if (this.phase === 'fb-blast') {
      this.blastT += dt;
      const k = clamp(this.blastT / 0.45, 0, 1);
      this.ball.scale.setScalar(3.5 + k * 2.5);
      this.ballCore.material.uniforms.uAlpha.value = 1 - k;
      this.ballShell.material.uniforms.uAlpha.value = 0.35 * (1 - k);
      if (k >= 1) this.ball.visible = false;
      this.ch.bendAt = { x: this.ballEnd.x, z: this.ballEnd.z, r: 7, s: 1.6 * (1 - k * 0.5) };
    }
  }

  /* ---------------- Phoenix Sage Fire ---------------- */

  _planPhoenix(j) {
    const I = this.I.clone();
    this._track([
      { t: 0.6, pos: I.clone().add(V(2.4, 1.7, 1.2)), look: I.clone().add(V(0, 1.5, -1.5)) },
      { t: 1.3, pos: I.clone().add(V(3.6, 2.4, 3.2)), look: V(0, 2, -8) },
      { t: 3.1, pos: I.clone().add(V(4.2, 3.4, 6)), look: V(0, 2, -11) },
      { t: 4.3, pos: this._baseCam(), look: this._baseLook() },
    ]);
    this.phase = 'ph-gather';
    this.app.sfx.inhale();
    this._at(0.6, () => {
      this.phase = 'ph-fire';
      this._titleCard(j);
      const targets = this.ch.targets.map((tg) => ({ tg, pos: () => tg.disk.getWorldPosition(V(0, 0, 0)) }));
      const extra = [V(-6, 0.3, -8), V(6, 0.3, -9), V(0, 0.3, -14)].map((p) => ({ tg: null, pos: () => p }));
      [...targets, ...extra].forEach((tgt, i) => this._at(0.65 + i * 0.12, () => this._launchSmall(tgt)));
    });
    this._at(4.4, () => this._finish());
  }

  _launchSmall(tgt) {
    const m = new THREE.Mesh(this.smallGeo, fireBallMaterial(rand(0, 10)));
    const from = this.mouth.add(V(0, 0, -0.3));
    const to = tgt.pos().clone();
    const mid = from.clone().lerp(to, 0.5).add(V(rand(-4, 4), rand(2, 4), 0));
    m.position.copy(from);
    m.scale.setScalar(0.1);
    this.scene.add(m);
    const s = new THREE.Mesh(this.hiddenShuriken, this.hiddenMat);
    s.visible = false;
    this.scene.add(s);
    this.smallBalls.push({ m, s, from, mid, to, tgt, t: 0, dur: rand(0.8, 1.1) });
    this.app.sfx.swoosh();
    this.app.sfx.noise({ dur: 0.5, vol: 0.18, type: 'lowpass', freq: 400, to: 1400, attack: 0.03 });
    this.fire.burst(from, 20, { speed: 3, life: [0.2, 0.4], size: [0.2, 0.4], colors: this.fireCols });
  }

  _updateSmall(dt) {
    for (let i = this.smallBalls.length - 1; i >= 0; i--) {
      const b = this.smallBalls[i];
      b.t += dt;
      const k = clamp(b.t / b.dur, 0, 1);
      const p = new THREE.Vector3()
        .copy(b.from).multiplyScalar((1 - k) * (1 - k))
        .addScaledVector(b.mid, 2 * (1 - k) * k)
        .addScaledVector(b.to, k * k);
      b.m.position.copy(p);
      b.m.scale.setScalar(0.25 + Math.min(k * 4, 1) * 0.4);
      b.m.rotation.y += dt * 4;
      for (let q = 0; q < (this.app.low ? 3 : 6); q++) {
        this.fire.emit({ x: p.x + rand(-0.15, 0.15), y: p.y + rand(-0.15, 0.15), z: p.z + rand(-0.15, 0.15), vx: rand(-0.6, 0.6), vy: rand(0, 1.2), vz: rand(-0.6, 0.6), life: rand(0.3, 0.6), size: rand(0.2, 0.45), color: this.fireCols[Math.floor(rand(0, 4))], grow: -0.6 });
      }
      this.flames.push(p.x, p.y - 0.35, p.z, 0.7, 1.2, i * 7.1, 0.9);
      if (k >= 1) {
        this.fire.burst(p, 70, { speed: 5, up: 1, life: [0.3, 0.9], size: [0.3, 0.7], colors: this.fireCols, grow: -0.4 });
        this.smoke.burst(p, 18, { speed: 1.5, up: 1.5, life: [1, 2], size: [0.5, 1], colors: this.smokeCols, grow: 1.8, alpha: 0.6 });
        this.embers.burst(p, 30, { speed: 5, up: 2, life: [0.6, 1.4], size: [0.03, 0.07], colors: this.fireCols });
        this.app.sfx.thud();
        this.app.sfx.noise({ dur: 0.6, vol: 0.25, type: 'lowpass', freq: 900, to: 150 });
        this.light.position.copy(p);
        this.light.intensity = 220;
        // the shuriken hidden inside the flame
        if (b.tg) {
          b.tg.char = Math.min(1, b.tg.char + 0.5);
          b.tg.wobble = 1;
          b.s.visible = true;
          this.ch._stick(b.s, b.tg, p.clone());
        } else {
          this.scene.remove(b.s);
          this._scorch(p.x, p.z, 1.2);
        }
        this.scene.remove(b.m);
        b.m.material.dispose();
        this.smallBalls.splice(i, 1);
      }
    }
  }

  /* ---------------- Summoning: Crows ---------------- */

  _planSummon(j) {
    const I = this.I.clone();
    this.summonC = I.clone().add(V(0.3, 0, -3.4));
    const C = this.summonC;
    this._track([
      { t: 0.55, pos: I.clone().add(V(2.3, 1.45, -3.3)), look: I.clone().add(V(0, 1.0, 0)) },
      { t: 1.05, pos: I.clone().add(V(3.2, 3.6, 0.6)), look: C.clone() },
      { t: 2.2, pos: C.clone().add(V(7.5, 1.1, 7)), look: C.clone().add(V(0, 3.2, 0)) },
      { t: 4.4, pos: C.clone().add(V(5.5, 0.8, 9)), look: C.clone().add(V(0, 5.5, 0)) },
      { t: 5.6, pos: this._baseCam(), look: this._baseLook() },
    ]);
    this.phase = 'sm-crouch';
    this.app.sfx.tone({ freq: 220, to: 330, type: 'triangle', dur: 0.4, vol: 0.06 });
    this._at(0.55, () => {
      this.phase = 'sm-seal';
      this.sealT = 0;
      this.seal.visible = true;
      this.seal.position.set(C.x, 0.04, C.z);
      if (this.app.sfx.ok) this.app.sfx.taiko(this.app.sfx.ctx.currentTime, 0.9);
      this.app.sfx.boom();
      this.app.flash(0.3, 0xff3040);
      this.shake = 0.7;
      this._titleCard(j);
      // dust ring along the ground
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU;
        this.smoke.emit({ x: I.x + Math.cos(a) * 0.4, y: 0.15, z: I.z + Math.sin(a) * 0.4, vx: Math.cos(a) * 6, vy: 0.3, vz: Math.sin(a) * 6, life: rand(0.8, 1.4), size: rand(0.4, 0.8), color: this.smokeCols[1], grow: 1.6, alpha: 0.5 });
      }
      this.ch.bendAt = { x: I.x, z: I.z, r: 6, s: 1.3 };
    });
    this._at(1.0, () => {
      this.smoke.burst(C.clone().add(V(0, 1.2, 0)), this.app.low ? 120 : 220, { speed: 3.2, up: 1.2, life: [1.4, 2.8], size: [1, 2.3], colors: this.whiteSmoke, grow: 1.6, alpha: 0.85 });
      this.app.sfx.poof();
      this._releaseCrows();
      this.phase = 'sm-crows';
    });
    this._at(3.9, () => { this.crowPhase = 'disperse'; for (let i = 0; i < 6; i++) setTimeout(() => this.app.sfx.caw(), i * 110); });
    this._at(5.7, () => { this.crowMesh.visible = false; this._finish(); });
  }

  _releaseCrows() {
    this.crowMesh.visible = true;
    this.crowPhase = 'vortex';
    this.crowData.forEach((c) => {
      c.a = rand(0, TAU);
      c.r = rand(0.3, 1.2);
      c.y = rand(0.5, 2);
      c.w = rand(2.2, 3.6) * (Math.random() < 0.85 ? 1 : -1);
      c.vy = rand(0.8, 2.2);
      c.rg = rand(0.8, 1.6);
      c.p = V(0, 0, 0);
      c.v = V(0, 0, 0);
    });
    this.app.sfx.flutter();
    for (let i = 0; i < 8; i++) setTimeout(() => this.app.sfx.caw(), 100 + i * 140);
  }

  _updateSummon(dt) {
    const I = this.I;
    if (this.phase === 'sm-crouch') {
      const k = clamp(this.time / 0.5, 0, 1);
      this.itachi.scale.y = 1 - 0.28 * k;
      this.itachi.rotation.x = 0.35 * k;
    } else {
      this.itachi.scale.y = damp(this.itachi.scale.y, 1, 4, dt);
      this.itachi.rotation.x = damp(this.itachi.rotation.x, 0, 4, dt);
    }
    if (this.seal.visible) {
      this.sealT += dt;
      const grow = easeInOut(clamp(this.sealT / 0.5, 0, 1));
      this.seal.scale.setScalar(0.5 + grow * 8);
      this.seal.rotation.z += dt * 0.6;
      const fade = this.sealT < 2.8 ? 1 : clamp(1 - (this.sealT - 2.8) / 1.5, 0, 1);
      this.seal.material.opacity = grow * fade * (0.8 + Math.sin(this.sealT * 18) * 0.1);
      this.light.position.set(this.seal.position.x, 1, this.seal.position.z);
      this.light.color.set(0xff2030);
      this.light.intensity = Math.max(this.light.intensity, 90 * grow * fade);
      if (fade <= 0) this.seal.visible = false;
    }
    if (this.crowMesh.visible) {
      const C = this.summonC;
      this.crowData.forEach((c, i) => {
        if (this.crowPhase === 'vortex') {
          c.a += c.w * dt;
          c.r = Math.min(c.r + dt * c.rg, 3 + c.rg * 2.4);
          c.y += c.vy * dt;
          const np = V(C.x + Math.cos(c.a) * c.r, c.y, C.z + Math.sin(c.a) * c.r);
          c.v.copy(np).sub(c.p).divideScalar(Math.max(dt, 1e-3));
          c.p.copy(np);
          if (Math.random() < dt * 0.25) this.feathers.emit({ x: c.p.x, y: c.p.y, z: c.p.z, vx: rand(-0.5, 0.5), vy: rand(-0.3, 0.2), vz: rand(-0.5, 0.5), life: rand(2, 3.5), size: rand(0.12, 0.2), color: this.featherCol, alpha: 0.9 });
        } else {
          const out = V(c.p.x - C.x, 0, c.p.z - C.z).normalize();
          c.v.addScaledVector(out, 14 * dt).add(V(0, 9 * dt, 0));
          c.p.addScaledVector(c.v, dt);
        }
        this.dummy.position.copy(c.p);
        this.dummy.lookAt(c.p.clone().add(c.v));
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.crowMesh.setMatrixAt(i, this.dummy.matrix);
      });
      this.crowMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /* ---------------- loop ---------------- */

  /** Returns true while the director controls the camera. */
  update(dt, t) {
    this.flames.begin();
    if (this.busy) {
      this.time += dt;
      for (let i = this.events.length - 1; i >= 0; i--) {
        if (this.events[i].t <= this.time) {
          const e = this.events.splice(i, 1)[0];
          e.fn();
        }
      }
      if (this.phase && this.phase.startsWith('fb')) this._updateFireball(dt);
      if (this.phase === 'ph-gather') {
        const m = this.mouth;
        for (let i = 0; i < 4; i++) {
          const p = m.clone().add(V(rand(-1, 1), rand(-1, 1), rand(-1, 0.3)).normalize().multiplyScalar(rand(1, 2)));
          const v = m.clone().sub(p).multiplyScalar(2.8);
          this.chakra.emit({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life: 0.35, size: 0.06, color: this.chakraCols[i % 2] });
        }
        this.auraTarget = 1.2;
      }
    }
    if (this.phase && this.phase.startsWith('sm')) this._updateSummon(dt);
    else if (this.crowMesh.visible) this._updateSummon(dt);
    this._updateSmall(dt);

    // lingering scorch flames
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const sc = this.scorches[i];
      sc.life -= dt;
      sc.burn -= dt;
      const fb = clamp(sc.burn / 3, 0, 1);
      if (fb > 0) {
        for (const tg of sc.tongues) this.flames.push(tg.x, 0, tg.z, tg.w * fb, tg.hh * fb * (0.85 + Math.sin(t * 9 + tg.seed) * 0.15), tg.seed, fb);
        if (Math.random() < dt * 20 * fb) {
          const tg = sc.tongues[Math.floor(rand(0, sc.tongues.length))];
          this.smoke.emit({ x: tg.x, y: 0.8, z: tg.z, vx: rand(-0.2, 0.2), vy: rand(0.6, 1.2), vz: rand(-0.2, 0.2), life: rand(2, 3), size: rand(0.5, 1), color: this.smokeCols[0], grow: 1.5, alpha: 0.35 });
        }
      }
      sc.m.material.opacity = clamp(sc.life / 4, 0, 1);
      if (sc.life <= 0) { this.scene.remove(sc.m); sc.m.geometry.dispose(); sc.m.material.dispose(); this.scorches.splice(i, 1); }
    }
    this.flames.end();

    // chakra aura at his hands
    this.auraPulse = damp(this.auraPulse || 0, 0, 5, dt);
    this.auraTarget = damp(this.auraTarget || 0, 0, 3, dt);
    this.aura.position.copy(this.I).add(V(0, 1.3, -0.4));
    this.aura.material.opacity = this.itachi.visible ? Math.min(0.55, this.auraPulse * 0.5 + this.auraTarget * 0.25) : 0;
    this.aura.scale.setScalar(0.7 + this.auraPulse * 0.8 + this.auraTarget * 0.4);
    if (!this.busy) this.light.color.set(0xff7a30);
    this.light.intensity = damp(this.light.intensity, 0, this.busy ? 2 : 4, dt);

    this.chakra.update(dt, t);
    this.fire.update(dt, t);
    this.smoke.update(dt, t);
    this.embers.update(dt, t);
    this.feathers.update(dt, t);

    return this._camUpdate(dt);
  }

  /** Called when the chapter's own camera is in charge, so the director knows where it looks. */
  syncLook(v) { this.lookV.copy(v); }
}
