import { voice, LINES } from '../core/Voice.js';
import * as THREE from 'three';
import { ParticlePool } from '../objects/Particles.js';
import { FlameField } from '../objects/FlameField.js';
import { createItachi } from '../objects/ItachiGLB.js';
import { createCrowGeometry, createCrowMaterial, addPhases } from '../objects/Crow.js';
import { shurikenGeometry } from '../objects/Weapons.js';
import { HAND_SIGNS } from '../data/content.js';
import { NOISE_GLSL, shared, drawTexture, glowTexture, rand, damp, clamp, lerp, easeInOut, TAU, h } from '../core/utils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const val = (v) => (typeof v === 'function' ? v() : v);

/**
 * Tileable 3D value noise baked once into a small 3D texture: the fire volume samples it several times per
 * step (fbm plus a domain warp), which is far cheaper than evaluating noise in the shader.
 */
let _noise3D;
function noise3DTexture() {
  if (_noise3D) return _noise3D;
  const N = 64, P = 8, C = N / P; // 8 lattice cells across the texture, so it tiles
  const lat = new Float32Array(P * P * P).map(() => Math.random());
  // per-axis lattice cell and smoothed weight, computed once rather than for every voxel
  const cell0 = new Int32Array(N), cell1 = new Int32Array(N), wt = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const f = i / C, c = Math.floor(f), t = f - c;
    cell0[i] = c % P; cell1[i] = (c + 1) % P; wt[i] = t * t * (3 - 2 * t);
  }
  const data = new Uint8Array(N * N * N);
  let o = 0;
  for (let z = 0; z < N; z++) {
    const z0 = cell0[z] * P * P, z1 = cell1[z] * P * P, w = wt[z];
    for (let y = 0; y < N; y++) {
      const y0 = cell0[y] * P, y1 = cell1[y] * P, v = wt[y];
      const r00 = z0 + y0, r10 = z0 + y1, r01 = z1 + y0, r11 = z1 + y1;
      for (let x = 0; x < N; x++) {
        const x0 = cell0[x], x1 = cell1[x], u = wt[x];
        const a = lat[r00 + x0] + (lat[r00 + x1] - lat[r00 + x0]) * u;
        const b = lat[r10 + x0] + (lat[r10 + x1] - lat[r10 + x0]) * u;
        const c = lat[r01 + x0] + (lat[r01 + x1] - lat[r01 + x0]) * u;
        const d = lat[r11 + x0] + (lat[r11 + x1] - lat[r11 + x0]) * u;
        const ab = a + (b - a) * v, cd = c + (d - c) * v;
        data[o++] = (ab + (cd - ab) * w) * 255 + 0.5;
      }
    }
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RedFormat;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return (_noise3D = t);
}

/**
 * A volume of fire, ray-marched inside a sphere. Four octaves of domain-warped noise rolling upward and
 * swirling around the core give it billowing, curling structure; temperature follows a blackbody curve
 * (dark red → orange → yellow → white-hot, emission rising steeply with heat) and the cooler fringes turn
 * to soot that darkens instead of glowing. Premultiplied output; drawn from the inside (BackSide) so the
 * camera can even be within it.
 */
function fireVolumeMaterial({ seed = 0, steps = 22, swirl = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uSeed: { value: seed }, uAlpha: { value: 1 }, uHeat: { value: 1 }, uSwirl: { value: swirl }, uSteps: { value: steps }, uNoise: { value: noise3DTexture() } },
    defines: { STEPS: steps },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      varying vec3 vObj; varying vec3 vCam;
      void main(){
        vObj = position;
        vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uSeed; uniform float uAlpha; uniform float uHeat; uniform float uSwirl; uniform float uSteps;
      uniform sampler3D uNoise;
      varying vec3 vObj; varying vec3 vCam;
      float nz(vec3 p){ return texture(uNoise, p).r; }
      float fbm(vec3 p){
        return nz(p) * 0.55 + nz(p * 2.03 + 0.31) * 0.28 + nz(p * 4.37 + 0.67) * 0.17;
      }
      vec3 blackbody(float t){
        vec3 c = mix(vec3(0.22, 0.015, 0.0), vec3(0.85, 0.1, 0.008), smoothstep(0.0, 0.3, t));
        c = mix(c, vec3(1.0, 0.4, 0.05), smoothstep(0.25, 0.55, t));
        c = mix(c, vec3(1.0, 0.74, 0.26), smoothstep(0.5, 0.8, t));
        return mix(c, vec3(1.0, 0.9, 0.62), smoothstep(0.82, 1.0, t));
      }
      void main(){
        vec3 ro = vCam, rd = normalize(vObj - vCam);
        const float R = 1.3;
        float b = dot(ro, rd), c = dot(ro, ro) - R * R, h = b * b - c;
        if (h < 0.0) discard;
        h = sqrt(h);
        float t0 = max(-b - h, 0.0), t1 = -b + h;
        // fewer samples when the ball fills the screen (they are hidden by dithering and bloom)
        float steps = clamp(uSteps, 4.0, float(STEPS));
        float dt = (t1 - t0) / steps;
        // interleaved gradient noise: a finer, less visible dither than white noise
        float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float tt = t0 + dt * jit;
        vec3 acc = vec3(0.0);
        float T = 1.0;
        for (int i = 0; i < STEPS; i++) {
          if (float(i) >= steps) break;
          vec3 p = ro + rd * tt;
          float r = length(p) / R;
          // churning: the field rolls upward and swirls around the core
          float ang = uSwirl * (uTime * 0.6 + r * 0.7);
          float cs = cos(ang), sn = sin(ang);
          vec3 q = vec3(cs * p.x - sn * p.z, p.y, sn * p.x + cs * p.z) * 0.24 + vec3(uSeed, -uTime * 0.36, uSeed * 0.37);
          // domain warp: the noise folds into curls instead of blobs
          vec3 w = vec3(nz(q * 0.6 + 0.13), nz(q * 0.6 + 0.47), nz(q * 0.6 + 0.81)) - 0.5;
          float n = (fbm(q + w * 0.4) - 0.5) * 1.3; // value-noise fbm has a narrow range: stretch it a little
          float shell = 1.0 - r;
          float dens = shell * 2.6 + n * 2.6 - 0.12 + max(p.y, 0.0) * n * 0.8;
          if (dens > 0.001) {
            float heat = clamp(shell * 1.3 + n * 1.3 + 0.06, 0.0, 1.0);
            heat = pow(heat, 1.3) * uHeat;
            // hotter is much brighter; the cool fringe is soot that absorbs rather than glows
            vec3 emit = blackbody(heat) * (0.1 + heat * heat * 1.7);
            float soot = smoothstep(0.3, 0.04, heat);
            float a = 1.0 - exp(-dens * dt * (3.2 + soot * 2.5));
            acc += T * a * mix(emit, vec3(0.018, 0.011, 0.008), soot * 0.9);
            T *= 1.0 - a;
            if (T < 0.02) break;
          }
          tt += dt;
        }
        gl_FragColor = vec4(acc * uAlpha, (1.0 - T) * uAlpha);
      }`,
  });
}

/** A soft glow around the fireball (fresnel halo, additive). */
function haloMaterial(color = 0xff6a18) {
  return new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 3.0); gl_FragColor = vec4(uColor * f * uAlpha, 1.0); }`,
  });
}

/** The stream of fire from his mouth into the growing ball: flowing noise along a tapering cone. */
function flameJetMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uAlpha: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime; uniform float uAlpha;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float core = pow(facing, 1.4);
        float n = snoise(vec3(vUv.x * 7.0, vUv.y * 5.0 - uTime * 9.0, uTime * 0.7)) * 0.5 + 0.5;
        float n2 = snoise(vec3(vUv.x * 15.0, vUv.y * 11.0 - uTime * 14.0, 3.0)) * 0.5 + 0.5;
        float f = clamp(core * 1.2 + n * 0.55 + n2 * 0.25 - 0.45, 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.3, 0.03), vec3(1.0, 0.85, 0.45), f);
        float a = f * smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y)) * uAlpha;
        gl_FragColor = vec4(col * a * 1.2, a);
      }`,
  });
}

/** A ring of heat racing across the ground. */
function shockMaterial(color = 0xff8a30) {
  return new THREE.ShaderMaterial({
    uniforms: { uR: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uR; uniform float uAlpha; uniform vec3 uColor; varying vec2 vP;
      void main(){
        float d = length(vP);
        float ring = exp(-pow((d - uR) / (0.06 + uR * 0.05), 2.0));
        float inner = smoothstep(uR, 0.0, d) * 0.25;
        gl_FragColor = vec4(uColor * (ring * 1.6 + inner) * uAlpha, 1.0);
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
    this.T0 = 0;
    this.weaveKeys = [];
    this._build();
  }

  get I() { return this.itachi.position; }
  get mouth() { return this.model.mouthWorld(new THREE.Vector3()); }

  _build() {
    const s = this.scene;
    const low = this.app.low;

    this.model = createItachi({ castShadow: !this.app.low });
    this.itachi = this.model.root;
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
    this.whiteSmoke = [0x8a8480, 0x6e6864, 0xa8a29e].map((c) => new THREE.Color(c));
    this.chakraCols = [new THREE.Color(0xff5030), new THREE.Color(0xffb060)];
    this.featherCol = new THREE.Color(0x060409);

    this.flames = new FlameField(128, { core: 0xffb850, edge: 0xc83208, glow: 0x6a1000, blending: THREE.AdditiveBlending, glowAmt: 0.7, fire: true });
    s.add(this.flames.mesh);

    // great fireball: core + shell
    this.ball = new THREE.Group();
    this.ballCore = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 3), fireVolumeMaterial({ seed: 1.7, steps: low ? 10 : 14 }));
    this.ballShell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 3), haloMaterial());
    this.ballCore.renderOrder = 3;
    this.ballShell.renderOrder = 2;
    this.ball.add(this.ballCore, this.ballShell);
    // the stream of fire feeding it
    const jetGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 24, true);
    jetGeo.translate(0, 0.5, 0); // mouth at y = 0, ball at y = 1
    const jp = jetGeo.attributes.position;
    for (let i = 0; i < jp.count; i++) {
      const t = jp.getY(i);
      const r = 0.07 + Math.pow(t, 0.85) * 0.5;
      jp.setX(i, jp.getX(i) * r);
      jp.setZ(i, jp.getZ(i) * r);
    }
    jetGeo.computeVertexNormals();
    this.jet = new THREE.Mesh(jetGeo, flameJetMaterial());
    this.jet.visible = false;
    this.jet.frustumCulled = false;
    s.add(this.jet);
    // shockwave across the ground
    this.shock = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), shockMaterial());
    this.shock.rotation.x = -Math.PI / 2;
    this.shock.position.y = 0.06;
    this.shock.visible = false;
    s.add(this.shock);
    this.timeScale = 1;
    this.ball.visible = false;
    s.add(this.ball);
    this.light = new THREE.PointLight(0xff7a30, 0, 45, 1.2);
    s.add(this.light);
    this.keyLight = new THREE.PointLight(0xff5a30, 0, 3, 2);
    s.add(this.keyLight);

    // small fireballs (phoenix)
    this.smallGeo = new THREE.IcosahedronGeometry(1.3, 2);
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
    this.speedLines = h('div.speedlines');
    this.ch.ui.append(this.speedLines);
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
    if (ok) { this.model.setPose('sign', { sign: sign.key }, 16); this.signHold = 2.4; }
    const hands = this.model.handWorld('r', new THREE.Vector3());
    this.chakra.burst(hands, ok ? 26 : 40, { speed: ok ? 1.6 : 3, up: 0.6, life: [0.3, 0.7], size: [0.04, 0.1], colors: ok ? this.chakraCols : [new THREE.Color(0x8888aa)] });
  }

  /* ---------------- cinematic helpers ---------------- */

  /** Camera path. Key times are relative to the technique; the weave close-up is prepended automatically. */
  _track(keys) {
    const shifted = keys.map((k) => ({ ...k, t: k.t + this.T0 }));
    this.cam = { t: 0, keys: [{ t: 0, pos: this.camera.position.clone(), look: this.lookV.clone() }, ...this.weaveKeys, ...shifted] };
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

  /** Schedules an event 	 seconds after the technique starts (i.e. after the hand-sign weave). */
  _at(t, fn) { this.events.push({ t: t + this.T0, fn }); }

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
    this._planWeave(j);
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
    this.jet.visible = false;
    this.crowMesh.visible = false;
    this.seal.visible = false;
    this.model.setPose('idle', {}, 4);
    this.ch.ui.classList.remove('casting');
    if (this._bloomSave) Object.assign(this.ch.bloom, this._bloomSave);
    this.app.sfx.setMood(this.ch.mood);
  }

  /* ---------------- hand-sign weave (shared by every jutsu) ---------------- */

  /**
   * Itachi rapidly re-weaves the jutsu's full sequence in close-up, each sign a distinct hand pose,
   * before the technique itself plays. Sets `T0`, the time the technique starts.
   */
  _planWeave(j) {
    const step = 0.15;
    const start = 0.5;
    this.T0 = 0;
    this.phase = 'weave';
    const I = this.I.clone();
    const hands = I.clone().add(V(0, 1.22, -0.25));
    j.seq.forEach((key, k) => {
      const sign = HAND_SIGNS.find((s) => s.key === key);
      this._at(start + k * step, () => {
        this.model.setPose('sign', { sign: key }, 30);
        this.app.sfx.signTone(k);
        this.auraPulse = 1;
        const hp = this.model.handWorld('r', new THREE.Vector3());
        this.chakra.burst(hp, 10, { speed: 1.4, up: 0.5, life: [0.25, 0.5], size: [0.03, 0.08], colors: this.chakraCols });
        this._chakraRing(hp, 18, 2.4);
        this._impact(0.55 + k * 0.07);
        this.shake = Math.max(this.shake, 0.12);
        this._flashSign(sign);
      });
    });
    const end = start + j.seq.length * step + 0.12;
    // the call: holding the last sign, he names the technique (close-up, Sharingan flaring)
    const call = (LINES[j.key] ? voice.duration(j.key) : 1.2) + 0.3;
    this._at(end - 0.05, () => {
      this.phase = 'call';
      voice.say(j.key, { subtitle: false }); // the title card shows the name
      this._titleCard(j);
      this.model.pulseEyes?.();
      this.app.sfx.sharingan();
      this.auraPulse = 1.4;
      this._impact(1);
      this.app.flash(0.12, 0xff2030);
    });
    const face = I.clone().add(V(0, 1.63, -0.05));
    const eyes = I.clone().add(V(0, 1.64, 0));
    // close-up on the hands from his front-left, drifting as the signs change
    // (he faces -Z) swing round his left side, then a low medium shot of the upper body as the signs flow,
    // then close on the eyes for the call, pushing in
    this.weaveKeys = [
      { t: 0.22, pos: I.clone().add(V(-1.9, 1.5, 0.3)), look: I.clone().add(V(0, 1.25, 0)) },
      { t: 0.5, pos: I.clone().add(V(-0.95, 1.2, -1.75)), look: I.clone().add(V(0, 1.38, -0.15)) },
      { t: end, pos: I.clone().add(V(-0.7, 1.28, -1.45)), look: I.clone().add(V(0, 1.4, -0.15)) },
      { t: end + 0.25, pos: I.clone().add(V(-0.16, 1.66, -0.62)), look: eyes },
      { t: end + call, pos: I.clone().add(V(-0.1, 1.65, -0.46)), look: eyes },
    ];
    this.T0 = end + call;
  }

  /** Anime impact frame: radial speed lines snap in and fade. */
  _impact(strength = 1) {
    const el = this.speedLines;
    el.style.setProperty('--k', strength);
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  /** A ring of chakra bursting outward from a point (particles). */
  _chakraRing(p, n = 26, speed = 3) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.chakra.emit({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.7, vz: rand(-0.4, 0.4), life: rand(0.25, 0.4), size: rand(0.03, 0.06), color: this.chakraCols[i % 2], alpha: 1 });
    }
  }

  _flashSign(sign) {
    if (!sign) return;
    const b = this.signFlash;
    b.querySelector('b').textContent = sign.kanji;
    b.querySelector('i').textContent = sign.name;
    b.classList.remove('on', 'bad');
    void b.offsetWidth;
    b.classList.add('on');
  }

  /* ---------------- Great Fireball ---------------- */

  _planFireball(j) {
    const I = this.I.clone();
    const side = I.clone().add(V(1.7, 1.7, -1.9));
    this._track([
      // inhale: side profile, chest filling
      { t: 0.35, pos: I.clone().add(V(1.35, 1.55, -0.55)), look: I.clone().add(V(0, 1.5, -0.1)) },
      { t: 0.9, pos: I.clone().add(V(1.15, 1.58, -0.45)), look: I.clone().add(V(0, 1.55, -0.2)) },
      // release: low, just behind his shoulder, the fire erupting away from us, Itachi silhouetted against it
      { t: 1.1, pos: I.clone().add(V(0.75, 1.05, 1.55)), look: I.clone().add(V(-0.1, 1.9, -5)) },
      { t: 2.1, pos: I.clone().add(V(0.95, 0.95, 2.1)), look: () => this.ball.position.clone() },
      // tracking wide from the side as it rolls toward the targets
      { t: 3.0, pos: I.clone().add(V(5.2, 3.2, 3.2)), look: () => this.ball.position.clone().add(V(0, -0.3, 0)) },
      { t: 3.6, pos: I.clone().add(V(4.6, 3.4, 1.0)), look: () => this.ballEnd.clone().add(V(0, 0.8, 0)) },
      // impact: low and wide
      { t: 4.8, pos: I.clone().add(V(3.8, 1.8, -4.2)), look: () => this.ballEnd.clone().add(V(0, 1.2, 0)) },
      { t: 6.0, pos: this._baseCam(), look: this._baseLook() },
    ]);
    this.ballStart = this.mouth.add(V(0, 0, -0.8));
    this.ballEnd = V(this.I.x + 0.6, 2.8, -15);
    this._at(0, () => {
      this.phase = 'fb-gather';
      this.model.setPose('fire', { inhale: true }, 7);
      this.app.sfx.inhale();
    });
    this._at(0.95, () => {
      this.phase = 'fb-breath';
      this.model.setPose('fire', {}, 14);
      this.app.sfx.roar(2.6);
      this.app.flash(0.15, 0xffb060);
      this.ball.visible = true;
      this.ball.position.copy(this.ballStart);
      this.ball.scale.setScalar(0.2);
      this.ballCore.material.uniforms.uAlpha.value = 1;
      this.ballCore.material.uniforms.uHeat.value = 1;
      this.ballShell.material.uniforms.uAlpha.value = 0.14;
      this.jet.visible = true;
      this.shake = 0.5;
      this._impact(1.2);
    });
    this._at(2.1, () => { this.phase = 'fb-roll'; this.jet.visible = false; });
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
    this.shock.material.uniforms.uColor.value.set(0xff8a30);
    this.app.flash(0.45, 0xffc070);
    this.shake = 1.4;
    this.light.position.y = Math.max(this.light.position.y, 3);
    this.light.intensity = 150;
    // hit-stop: time slows for a beat, then catches up
    this.timeScale = 0.22;
    this._impact(1.4);
    this.shock.position.set(p.x, 0.06, p.z);
    this.shock.visible = true;
    this.shockT = 0;
    // a column of fire bursting upward
    this.fire.burst(p.clone().setY(0.5), this.app.low ? 80 : 160, { speed: 3, up: 12, life: [0.6, 1.2], size: [0.6, 1.4], colors: this.fireCols, grow: -0.2, alpha: 0.5 });
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
    const t = this.time - this.T0;
    const mouth = this.mouth;
    if (this.phase === 'fb-gather') {
      // chakra and air rush into his mouth
      for (let i = 0; i < 6; i++) {
        const p = mouth.clone().add(V(rand(-1, 1), rand(-1, 1), rand(-1, 0.4)).normalize().multiplyScalar(rand(1.2, 2.4)));
        const v = mouth.clone().sub(p).multiplyScalar(2.6);
        this.chakra.emit({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life: 0.4, size: rand(0.04, 0.09), color: this.chakraCols[i % 2], alpha: 1 });
      }
      this.auraTarget = 0.8 + t * 0.6;
    }
    if (this.phase === 'fb-breath' || this.phase === 'fb-roll') {
      const breathing = this.phase === 'fb-breath';
      const k = breathing ? clamp((t - 0.95) / 1.15, 0, 1) : clamp((t - 2.1) / 1.5, 0, 1);
      if (breathing) {
        this.ball.position.lerpVectors(this.ballStart, V(this.ballStart.x + 0.3, 2.2, -6.5), easeInOut(k));
        this.ball.scale.setScalar(lerp(0.3, 2.7, Math.pow(k, 0.7)));
        // the jet: from his lips into the ball, fattening as it pours
        const d = this.ball.position.clone().sub(mouth);
        const L = Math.max(0.01, d.length() - this.ball.scale.x * 0.6);
        this.jet.position.copy(mouth);
        this.jet.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
        const w = this.ball.scale.x * 0.9;
        this.jet.scale.set(w, L, w);
        this.jet.material.uniforms.uAlpha.value = clamp(k * 6, 0, 1) * (1 - clamp((k - 0.85) / 0.15, 0, 1) * 0.6);
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
      }
      const r = this.ball.scale.x;
      // march fewer steps the more of the screen the ball covers
      const near = this.camera.position.distanceTo(this.ball.position) / Math.max(r * 1.3, 0.01);
      this.ballCore.material.uniforms.uSteps.value = Math.round(clamp(3 + near * 2.2, 7, this.ballCore.material.defines.STEPS));
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
      this.ballCore.material.uniforms.uHeat.value = 1 - k * 0.5;
      this.ballShell.material.uniforms.uAlpha.value = 0.14 * (1 - k);
      if (k >= 1) this.ball.visible = false;
      this.ch.bendAt = { x: this.ballEnd.x, z: this.ballEnd.z, r: 7, s: 1.6 * (1 - k * 0.5) };
    }
  }

  /* ---------------- Phoenix Sage Flower Nail Crimson (Hōsenka Tsumabeni) ---------------- */

  _planPhoenix(j) {
    const I = this.I.clone();
    this._track([
      { t: 0.6, pos: I.clone().add(V(1.7, 1.7, -1.9)), look: I.clone().add(V(0, 1.55, 0)) },
      { t: 1.3, pos: I.clone().add(V(3.6, 2.4, 3.2)), look: V(0, 2, -8) },
      { t: 3.1, pos: I.clone().add(V(4.2, 3.4, 6)), look: V(0, 2, -11) },
      { t: 4.3, pos: this._baseCam(), look: this._baseLook() },
    ]);
    this._at(0, () => {
      this.phase = 'ph-gather';
      this.model.setPose('fire', { inhale: true }, 9);
      this.app.sfx.inhale();
    });
    this._at(0.6, () => {
      this.phase = 'ph-fire';
      this.model.setPose('fire', {}, 14);
      const targets = this.ch.targets.map((tg) => ({ tg, pos: () => tg.disk.getWorldPosition(V(0, 0, 0)) }));
      const extra = [V(-6, 0.3, -8), V(6, 0.3, -9), V(0, 0.3, -14)].map((p) => ({ tg: null, pos: () => p }));
      [...targets, ...extra].forEach((tgt, i) => this._at(0.65 + i * 0.12, () => this._launchSmall(tgt)));
    });
    this._at(4.4, () => this._finish());
  }

  _launchSmall(tgt) {
    const m = new THREE.Mesh(this.smallGeo, fireVolumeMaterial({ seed: rand(0, 10), steps: this.app.low ? 10 : 14, swirl: 1.6 }));
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
    this.fire.burst(from, 20, { speed: 3, life: [0.2, 0.4], size: [0.2, 0.4], colors: this.fireCols.slice(1), alpha: 0.5 });
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
        this.fire.emit({ x: p.x + rand(-0.15, 0.15), y: p.y + rand(-0.15, 0.15), z: p.z + rand(-0.15, 0.15), vx: rand(-0.6, 0.6), vy: rand(0.4, 1.6), vz: rand(-0.6, 0.6), life: rand(0.3, 0.6), size: rand(0.18, 0.4), color: this.fireCols[Math.floor(rand(1, 4))], grow: -0.6, alpha: 0.4 });
      }
      this.flames.push(p.x, p.y - 0.35, p.z, 0.7, 1.2, i * 7.1, 0.9);
      if (k >= 1) {
        this.fire.burst(p, 70, { speed: 5, up: 1, life: [0.3, 0.9], size: [0.3, 0.7], colors: this.fireCols.slice(1), grow: -0.4, alpha: 0.5 });
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
    this._at(0, () => {
      this.phase = 'sm-crouch';
      this.model.setPose('summon', {}, 9);
    });
    this.app.sfx.tone({ freq: 220, to: 330, type: 'triangle', dur: 0.4, vol: 0.06 });
    this._at(0.55, () => {
      this.phase = 'sm-seal';
      this.sealT = 0;
      this.seal.visible = true;
      this.seal.position.set(C.x, 0.04, C.z);
      if (this.app.sfx.ok) this.app.sfx.taiko(this.app.sfx.ctx.currentTime, 0.9);
      this.app.sfx.boom();
      this.app.flash(0.3, 0xff3040);
      this.shake = 0.9;
      this._impact(1.2);
      this.shock.material.uniforms.uColor.value.set(0xff2a40);
      this.shock.position.set(C.x, 0.06, C.z);
      this.shock.visible = true;
      this.shockT = 0;
      // dust ring along the ground
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU;
        this.smoke.emit({ x: I.x + Math.cos(a) * 0.4, y: 0.15, z: I.z + Math.sin(a) * 0.4, vx: Math.cos(a) * 6, vy: 0.3, vz: Math.sin(a) * 6, life: rand(0.8, 1.4), size: rand(0.4, 0.8), color: this.smokeCols[1], grow: 1.6, alpha: 0.5 });
      }
      this.ch.bendAt = { x: I.x, z: I.z, r: 6, s: 1.3 };
    });
    this._at(1.0, () => {
      this.smoke.burst(C.clone().add(V(0, 1.2, 0)), this.app.low ? 120 : 220, { speed: 4.2, up: 1.4, life: [1.2, 2.6], size: [0.7, 1.8], colors: this.whiteSmoke, grow: 1.9, alpha: 0.42 });
      this.app.sfx.poof();
      this._releaseCrows();
      this.phase = 'sm-crows';
      this.model.setPose('ready', {}, 4);
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
  update(rawDt, t) {
    // slow-motion beats (hit-stop) ease back to real time
    this.timeScale = damp(this.timeScale, 1, 2.2, rawDt);
    const dt = rawDt * this.timeScale;
    if (this.shock.visible) {
      this.shockT += dt;
      const k = clamp(this.shockT / 0.9, 0, 1);
      this.shock.material.uniforms.uR.value = 0.5 + Math.pow(k, 0.6) * 12;
      this.shock.material.uniforms.uAlpha.value = (1 - k) * 1.1;
      if (k >= 1) this.shock.visible = false;
    }
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

    // the rigged model animates every frame it's visible
    if (this.itachi.visible) {
      if (!this.busy && this.signHold > 0) {
        this.signHold -= dt;
        if (this.signHold <= 0) this.model.setPose('idle', {}, 4);
      }
      this.model.update(dt, t);
    }

    // chakra aura at his hands
    this.auraPulse = damp(this.auraPulse || 0, 0, 5, dt);
    this.auraTarget = damp(this.auraTarget || 0, 0, 3, dt);
    this.model.handWorld('r', this.aura.position);
    // chakra glowing at his hands lights his face from below while he weaves and calls the jutsu
    const glowing = this.busy && (this.phase === 'weave' || this.phase === 'call' || this.phase === 'fb-gather' || this.phase === 'ph-gather');
    this.keyLight.position.copy(this.aura.position).add(V(0, -0.1, -0.35));
    this.keyLight.intensity = damp(this.keyLight.intensity, glowing ? 0.35 + this.auraPulse * 0.6 : 0, 6, rawDt);
    this.aura.material.opacity = this.itachi.visible ? Math.min(0.3, this.auraPulse * 0.26 + this.auraTarget * 0.14) : 0;
    this.aura.scale.setScalar(0.5 + this.auraPulse * 0.55 + this.auraTarget * 0.3);
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
