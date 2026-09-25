import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { voice } from '../core/Voice.js';
import { ParticlePool } from '../objects/Particles.js';
import { CrowBurst } from '../objects/Crow.js';
import { createMirrorWater } from '../objects/MirrorWater.js';
import { makeSky, sharinganTexture, drawTexture, featherTexture, glowTexture, rand, damp, TAU, h, clamp } from '../core/utils.js';

const NORMAL = { skyTop: 0x05060f, skyBottom: 0x1b2238, fog: 0x10152a, ground: 0x0d1020, pillar: 0x2a2e3e, light: 0x8898cc };
const TSUKU = { skyTop: 0x1a0003, skyBottom: 0xd0101e, fog: 0x5a0008, ground: 0x050000, pillar: 0x000000, light: 0xff4050 };

const NOISE2 = /* glsl */ `
float hash2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash2(i), b = hash2(i + vec2(1.0, 0.0)), c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
`;

/**
 * A dome of drifting clouds between the camera and the moon: moonlit navy banks with silver edges,
 * and in Tsukuyomi the anime's black clouds rimmed in red, streaming faster.
 */
function cloudDome(moonDir) {
  const uniforms = {
    uTime: { value: 0 }, uK: { value: 0 }, uMoon: { value: moonDir.clone().normalize() },
    uBody: { value: new THREE.Color(0x0b0f1c) }, uEdge: { value: new THREE.Color(0x8a96c0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uK; uniform vec3 uMoon; uniform vec3 uBody; uniform vec3 uEdge; varying vec3 vD;
      ${NOISE2}
      void main(){
        vec3 d = normalize(vD);
        if (d.y < -0.02) discard;
        // project onto a cloud ceiling so the banks shrink toward the horizon
        vec2 uv = d.xz / (d.y + 0.18) * 0.9;
        float t = uTime * (0.012 + uK * 0.05);
        vec2 flow = vec2(t, t * 0.35);
        float n = fbm(uv + flow + fbm(uv * 0.6 - flow) * 0.8);
        float dens = smoothstep(0.46 - uK * 0.06, 0.78, n) * smoothstep(0.0, 0.14, d.y);
        if (dens < 0.01) discard;
        // thin edges catch the light, brightest around the moon
        float moon = pow(max(dot(d, uMoon), 0.0), 6.0);
        float edge = (1.0 - smoothstep(0.1, 0.55, dens)) * (0.35 + moon * 1.6);
        vec3 col = mix(uBody, uEdge, clamp(edge, 0.0, 1.0));
        gl_FragColor = vec4(col, dens * 0.92);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), mat);
  mesh.renderOrder = -3;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/** Low mist drifting over the water. */
function mistLayer() {
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x5a6a90) }, uAmt: { value: 0.2 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uAmt; varying vec3 vW;
      ${NOISE2}
      void main(){
        vec2 p = vW.xz * 0.06 + vec2(uTime * 0.02, uTime * 0.008);
        float n = fbm(p + fbm(p * 1.7 + uTime * 0.01));
        float d = length(vW.xz - vec2(0.0, -8.0));
        float a = smoothstep(0.35, 0.8, n) * uAmt * (1.0 - smoothstep(30.0, 60.0, d));
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.35;
  m.renderOrder = 1;
  m.userData.uniforms = uniforms;
  return m;
}

const IZANAMI_LINES = [
  'A single feather falls. You have seen this moment before.',
  'The same feather. The same wind. The loop tightens.',
  'Running changes nothing. Pretending changes nothing.',
  'Again. Itachi waits, patient as ever.',
];

export class Genjutsu extends Chapter {
  constructor(app) {
    super(app, { id: 'tsukuyomi', title: 'Tsukuyomi', jp: '月読' });
    this.shiftView = 0.12;
    this.bloom = { strength: 0.9, radius: 0.6, threshold: 0.6 };
    this.mood = 'mystic';
    this.k = 0;
    this.kTarget = 0;
    this.charge = 0;
    this.charging = false;
    this.yaw = 0;
    this.yawTarget = 0;
    this.clock = 0;
    this.iz = { on: false, phase: 'idle', t: 0, loops: 0 };
  }

  build() {
    const s = this.scene;
    this.sky = makeSky(NORMAL.skyTop, NORMAL.skyBottom, { exponent: 0.6 });
    s.add(this.sky);
    s.fog = new THREE.Fog(NORMAL.fog, 18, 70);

    this.hemi = new THREE.HemisphereLight(NORMAL.light, 0x05030a, 1.1);
    s.add(this.hemi);
    this.moonLight = new THREE.DirectionalLight(0xdde4ff, 1.4);
    this.moonLight.position.set(0, 12, -20);
    s.add(this.moonLight);

    // moon that becomes a Mangekyō
    const moonTex = drawTexture(512, 512, (x, w) => {
      const g = x.createRadialGradient(w * 0.45, w * 0.42, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, '#e8e8ec'); g.addColorStop(0.75, '#c8cad2'); g.addColorStop(1, '#8e92a0');
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); x.fill();
      x.save(); x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); x.clip();
      // maria, craters with lit rims, and a darkened limb
      for (let i = 0; i < 9; i++) { const cx = rand(90, w - 90), cy = rand(90, w - 90), r = rand(40, 110); const mg = x.createRadialGradient(cx, cy, 0, cx, cy, r); mg.addColorStop(0, 'rgba(90,95,112,0.4)'); mg.addColorStop(1, 'rgba(90,95,112,0)'); x.fillStyle = mg; x.fillRect(0, 0, w, w); }
      for (let i = 0; i < 70; i++) { const cx = rand(30, w - 30), cy = rand(30, w - 30), r = rand(3, 18); x.fillStyle = 'rgba(80,84,100,0.14)'; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); x.strokeStyle = 'rgba(255,255,255,0.1)'; x.lineWidth = r * 0.25; x.beginPath(); x.arc(cx - r * 0.1, cy - r * 0.1, r, Math.PI * 0.9, Math.PI * 1.9); x.stroke(); }
      const lg = x.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2); lg.addColorStop(0, 'rgba(20,24,40,0)'); lg.addColorStop(1, 'rgba(20,24,40,0.5)'); x.fillStyle = lg; x.fillRect(0, 0, w, w);
      x.restore();
    });
    this.moonUniforms = { uA: { value: moonTex }, uB: { value: sharinganTexture('mangekyo') }, uK: { value: 0 }, uRot: { value: 0 } };
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.ShaderMaterial({
      uniforms: this.moonUniforms, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uA; uniform sampler2D uB; uniform float uK; uniform float uRot; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float c = cos(uRot), s = sin(uRot);
          vec2 q = mat2(c,-s,s,c) * p + 0.5;
          vec4 a = texture2D(uA, vUv); vec4 b = texture2D(uB, q);
          float wipe = smoothstep(uK * 1.2 - 0.2, uK * 1.2, length(p) * 2.0);
          vec4 col = mix(b * vec4(1.6, 1.2, 1.2, 1.0), a * vec4(0.58, 0.6, 0.66, 1.0), wipe); // dim enough to keep its craters under the bloom
          gl_FragColor = col;
          #include <colorspace_fragment>
        }`,
    }));
    moon.position.set(0, 14, -55);
    this.moon = moon;
    s.add(moon);
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xaab8ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.moonGlow.scale.setScalar(52);
    moon.renderOrder = -5;
    this.moonGlow.renderOrder = -4;
    this.moonGlow.position.copy(moon.position).add(new THREE.Vector3(0, 0, -1));
    s.add(this.moonGlow);
    this.clouds = cloudDome(moon.position);
    s.add(this.clouds);
    this.mist = mistLayer();
    s.add(this.mist);

    // still, mirror-like water
    this.water = createMirrorWater({ size: 170, resolution: this.app.low ? 0.3 : 0.5 });
    s.add(this.water);
    this.waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // a torii gate and stone lanterns standing in the water
    this.lacquer = new THREE.MeshStandardMaterial({ color: 0xa3141c, roughness: 0.45 });
    const blackWood = new THREE.MeshStandardMaterial({ color: 0x0c0a0c, roughness: 0.6 });
    const torii = new THREE.Group();
    for (const sx of [-2.1, 2.1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 6, 20), this.lacquer);
      pillar.position.set(sx, 3, 0);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 20), blackWood);
      foot.position.set(sx, 0.25, 0);
      torii.add(pillar, foot);
    }
    const kasagiGeo = new THREE.BoxGeometry(6.8, 0.36, 0.5, 32, 1, 1);
    {
      const kp = kasagiGeo.attributes.position;
      for (let i = 0; i < kp.count; i++) { const u = kp.getX(i) / 3.4; kp.setY(i, kp.getY(i) + u * u * u * u * 0.42); }
      kasagiGeo.computeVertexNormals();
    }
    const kasagi = new THREE.Mesh(kasagiGeo, blackWood);
    kasagi.position.y = 6.15;
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.3, 0.42), this.lacquer);
    shimaki.position.y = 5.8;
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.24, 0.3), this.lacquer);
    nuki.position.y = 4.7;
    const gakuzuka = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.25), this.lacquer);
    gakuzuka.position.y = 5.2;
    torii.add(kasagi, shimaki, nuki, gakuzuka);
    torii.position.set(0, 0, -12);
    s.add(torii);
    const stone = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.95, flatShading: true });
    this.lanternLights = [];
    for (const sx of [-5, 5]) {
      const l = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.4, 6), stone);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 1.1, 6), stone);
      post.position.y = 0.75;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), stone);
      box.position.y = 1.55;
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.62), new THREE.MeshBasicMaterial({ color: 0xffb060 }));
      glow.position.y = 1.55;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.45, 6), stone);
      roof.position.y = 2.02;
      l.add(base, post, box, glow, roof);
      l.position.set(sx, 0, -9);
      const light = new THREE.PointLight(0xffa050, 6, 9, 1.6);
      light.position.set(sx, 1.6, -9);
      s.add(l, light);
      this.lanternLights.push({ light, glow });
    }

    // floating obelisks
    const monoTex = drawTexture(128, 256, (x, w, hh) => {
      x.fillStyle = '#9a9aa4'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 1600; i++) { const l = rand(90, 190); x.fillStyle = `rgba(${l},${l},${l + 6},0.35)`; x.fillRect(rand(0, w), rand(0, hh), rand(1, 3), rand(1, 4)); }
      x.strokeStyle = 'rgba(40,40,50,0.6)';
      for (let i = 0; i < 8; i++) { let px = rand(0, w), py = rand(0, hh); x.lineWidth = rand(0.6, 1.6); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += rand(-12, 12); py += rand(8, 26); x.lineTo(px, py); } x.stroke(); }
    });
    this.pillarMat = new THREE.MeshStandardMaterial({ color: NORMAL.pillar, map: monoTex, roughness: 0.9, metalness: 0, flatShading: true });
    this.world = new THREE.Group();
    s.add(this.world);
    this.pillars = [];
    for (let i = 0, tries = 0; i < 26 && tries < 400; tries++) {
      const a = rand(0, TAU), r = rand(18, 40);
      const px = Math.cos(a) * r, pz = Math.sin(a) * r - 6;
      // well clear of the camera's orbit (radius 12–16 about the origin) and not in front of the torii
      if (Math.hypot(px, pz) < 22 || (Math.abs(px) < 10 && pz < -4)) continue;
      i++;
      const hgt = rand(2, 9);
      // a standing stone: chipped top, a slight taper
      const geo = new THREE.BoxGeometry(rand(0.5, 1.3), hgt, rand(0.5, 1.3), 1, 4, 1);
      const gp = geo.attributes.position;
      for (let v = 0; v < gp.count; v++) {
        const y = gp.getY(v) / hgt + 0.5;
        gp.setX(v, gp.getX(v) * (1 - y * 0.18)); gp.setZ(v, gp.getZ(v) * (1 - y * 0.18));
        if (y > 0.99) gp.setY(v, gp.getY(v) - rand(0, hgt * 0.18));
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.pillarMat);
      m.position.set(px, hgt / 2 + rand(-1, 3), pz);
      m.rotation.set(rand(-0.15, 0.15), rand(0, TAU), rand(-0.15, 0.15));
      m.userData = { base: m.position.y, ph: rand(0, TAU) };
      this.world.add(m);
      this.pillars.push(m);
    }

    // Tsukuyomi's crosses: they rise out of the water when the genjutsu takes hold
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.crosses = [[-8.5, -25, 0.15], [9, -29, -0.2], [0, -38, 0]].map(([x, z, ry]) => {
      const c = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 8, 0.34), crossMat);
      post.position.y = 4;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 0.3), crossMat);
      beam.position.y = 6.3;
      c.add(post, beam);
      c.position.set(x, -9, z);
      c.rotation.y = ry;
      c.visible = false;
      s.add(c);
      return c;
    });

    // particles: drifting motes (upward "time reversal" in Tsukuyomi)
    this.motes = new ParticlePool({ count: this.app.low ? 500 : 1200, turbulence: 0.5, drag: 0.2 });
    s.add(this.motes.points);
    this.moteA = new THREE.Color(0x9fb0ff);
    this.moteB = new THREE.Color(0xff2030);
    this.moteC = new THREE.Color(0xffffff);

    // Izanami feather
    this.feather = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2), new THREE.MeshBasicMaterial({ map: featherTexture(), transparent: true, side: THREE.DoubleSide, color: 0xffffff }));
    this.feather.visible = false;
    s.add(this.feather);
    this.shards = new ParticlePool({ count: 600, gravity: -3, drag: 0.5 });
    s.add(this.shards.points);
    this.crows = new CrowBurst(40, 1);
    s.add(this.crows.mesh);

    this.camera.position.set(0, 2.4, 12);
    this._c = { a: new THREE.Color(), b: new THREE.Color() };
    this._buildUI();
  }

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 月読',
      jp: '月読',
      title: 'The World of <em>Tsukuyomi</em>',
      desc: 'Itachi\'s left Mangekyō casts Tsukuyomi: a genjutsu where he controls time, space and even mass. Three days pass inside it — a single instant outside. Hold to cast it. Or face <b>Izanami</b>, the loop that ends only when you accept yourself.',
      extra: [this.gestures([
        ['hold', '<b>Stare</b> — hold anywhere to cast / release'],
        ['tap', '<b>Tap</b> the water to ripple it'],
        ['drag', '<b>Drag</b> to look around'],
      ])],
    });

    this.clockEl = h('b', { text: '00:00:00' });
    this.clockWrap = h('div.tsuku-clock', {}, this.clockEl, h('span', { text: 'hours elapsed inside Tsukuyomi' }));
    this.ui.append(this.clockWrap);

    this.holdFill = h('span.fill');
    this.holdLabel = h('span', { text: 'Hold to cast Tsukuyomi' });
    this.holdBtn = h('button.btn.btn-primary.hold-btn.pe', { type: 'button' }, this.holdFill, this.holdLabel);
    const start = (e) => {
      e.preventDefault();
      this.app.sfx.unlock();
      if (this.k > 0.5 || this.kTarget === 1) { this.release(); return; }
      this.charging = true;
    };
    const stop = () => { this.charging = false; };
    this.holdBtn.addEventListener('pointerdown', start);
    this.holdBtn.addEventListener('pointerup', stop);
    this.holdBtn.addEventListener('pointerleave', stop);
    this.holdBtn.addEventListener('pointercancel', stop);
    this.holdBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.kTarget ? this.release() : this.cast(); }
    });

    this.izBtn = this.button('Izanami', () => (this.iz.on ? null : this.startIzanami()));

    this.izBox = h('div.izanami.pe.hidden', {},
      this.izLoops = h('div.loops'),
      this.izText = h('p'),
      h('div.choices', {},
        this.button('Keep running', () => this.choose(false)),
        this.button('Become someone else', () => this.choose(false)),
        this.button('Accept who you are', () => this.choose(true)),
      ),
    );
    this.ui.append(this.izBox);
    this.ui.append(h('div.controls', {}, this.holdBtn, this.izBtn));
  }

  cast() {
    this.charging = false;
    this.charge = 0;
    this.kTarget = 1;
    this.clock = 0;
    this.clockWrap.classList.add('on');
    this.holdLabel.textContent = 'Release the genjutsu';
    this.app.sfx.tsukuyomi();
    voice.say('tsukuyomi', { cooldown: 5, subtitle: false });
    this.app.sfx.setMood('genjutsu');
    this.app.flash(0.6, 0xff0010);
    this.water.ripple(0, -4, 2);
    this.app.bleed();
    this.app.toast('<b>月読 · Tsukuyomi</b><br>"For the next 72 hours…"', 3500);
  }

  release() {
    this.kTarget = 0;
    this.clockWrap.classList.remove('on');
    this.holdLabel.textContent = 'Hold to cast Tsukuyomi';
    this.app.sfx.setMood(this.mood);
    this.app.sfx.whoosh();
  }

  /* ---------- Izanami ---------- */

  startIzanami() {
    if (this.kTarget) this.release();
    this.iz = { on: true, phase: 'fall', t: 0, loops: 0 };
    this.izBtn.classList.add('active');
    this.app.sfx.genjutsu();
    voice.say('izanami', { cooldown: 5, subtitle: false });
    this.app.toast('<b>イザナミ · Izanami</b><br>A moment will repeat until you choose correctly.', 3500);
    this._resetFeather();
  }

  _resetFeather() {
    this.feather.visible = true;
    this.feather.position.set(0, 7, 4);
    this.iz.t = 0;
    this.iz.phase = 'fall';
    this.izBox.classList.add('hidden');
  }

  choose(correct) {
    if (!this.iz.on || this.iz.phase !== 'choice') return;
    if (correct) {
      this.iz.phase = 'break';
      this.izBox.classList.add('hidden');
      this.shards.burst(this.feather.position, 300, { speed: 9, life: [0.8, 2], size: [0.05, 0.14], colors: [this.moteC, this.moteB] });
      this.crows.fire(this.feather.position, { speed: 9, up: 4 });
      this.feather.visible = false;
      this.app.sfx.boom();
      this.app.sfx.chime();
      this.app.toast(`<b>The loop is broken</b> after ${this.iz.loops + 1} ${this.iz.loops ? 'cycles' : 'cycle'}.<br>Izanami was designed to guide, not punish: it ends when the target accepts who they truly are. Itachi used it to stop Kabuto.`, 7000);
      this.iz.on = false;
      this.izBtn.classList.remove('active');
    } else {
      this.iz.loops++;
      this.iz.phase = 'rewind';
      this.iz.t = 0;
      this.izBox.classList.add('hidden');
      this.app.sfx.wrong();
      this.app.sfx.genjutsu();
      this.app.canvas.classList.add('blurred');
      setTimeout(() => this.app.canvas.classList.remove('blurred'), 700);
    }
  }

  /* ---------- input ---------- */

  pointerMove(p) {
    if (p.down) this.yawTarget += p.dx * 0.004;
  }

  exit() {
    this.charging = false;
    this.charge = 0;
    if (this.kTarget) this.release();
    if (this.iz.on) {
      this.iz.on = false;
      this.feather.visible = false;
      this.izBox.classList.add('hidden');
      this.izBtn.classList.remove('active');
    }
  }

  click(p) {
    const hit = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(p.ndc, this.camera);
    if (ray.ray.intersectPlane(this.waterPlane, hit)) {
      this.water.ripple(hit.x, hit.z, 1);
      this.app.sfx.tone({ freq: 900, to: 300, type: 'sine', dur: 0.25, vol: 0.08 });
      this.app.sfx.noise({ dur: 0.2, vol: 0.06, type: 'bandpass', freq: 1200, q: 3 });
    }
  }

  update(dt, t) {
    // stare (hold anywhere) to cast or release
    const stare = this.trackHold(1.0, !this.iz.on);
    if (stare.fired) this.kTarget ? this.release() : this.cast();
    if (stare.progress > 0) this.grade.ca = 0.012 + stare.progress * 0.06;
    else this.grade.ca = 0.012 + this.k * 0.02;
    this.grade.tintAmt = this.k * 0.18;
    // charge
    if (this.charging) {
      this.charge += dt / 1.2;
      if (this.charge >= 1) this.cast();
    } else this.charge = damp(this.charge, 0, 8, dt);
    this.holdFill.style.width = `${clamp(this.charge, 0, 1) * 100}%`;

    this.k = damp(this.k, this.kTarget, this.kTarget ? 2.2 : 3, dt);
    const k = this.k;
    const mix = (a, b) => this._c.a.set(a).lerp(this._c.b.set(b), k);
    this.sky.userData.uniforms.uTop.value.copy(mix(NORMAL.skyTop, TSUKU.skyTop));
    this.sky.userData.uniforms.uBottom.value.copy(mix(NORMAL.skyBottom, TSUKU.skyBottom));
    this.scene.fog.color.copy(mix(NORMAL.fog, TSUKU.fog));
    this.water.uniforms.uTint.value.copy(mix(0x080b16, 0x1a0002));
    this.water.material.uniforms.color.value.copy(mix(0x8390b0, 0xff5060));
    this.lacquer.color.copy(mix(0xa3141c, 0x050000));
    this.lanternLights.forEach(({ light, glow }) => { light.intensity = 6 * (1 - k); glow.material.color.copy(mix(0xffb060, 0x200000)); });
    this.pillarMat.color.copy(mix(NORMAL.pillar, TSUKU.pillar));
    this.hemi.color.copy(mix(NORMAL.light, TSUKU.light));
    this.moonLight.color.copy(mix(0xdde4ff, 0xff2a3a));
    this.moonGlow.material.color.copy(mix(0xaab8ff, 0xff1020));
    this.moonUniforms.uK.value = k;
    const cu = this.clouds.userData.uniforms;
    cu.uTime.value = t;
    cu.uK.value = k;
    cu.uBody.value.copy(mix(0x0b0f1c, 0x030000));
    cu.uEdge.value.copy(mix(0x8a96c0, 0xff2a30));
    const mu = this.mist.userData.uniforms;
    mu.uTime.value = t;
    mu.uColor.value.copy(mix(0x5a6a90, 0x3a0006));
    mu.uAmt.value = 0.2 + k * 0.15;
    this.crosses.forEach((c, i) => {
      const e = clamp((k - 0.15 - i * 0.12) / 0.6, 0, 1);
      c.visible = e > 0;
      c.position.y = -9 * (1 - e * (2 - e));
    });
    this.moonUniforms.uRot.value -= dt * (0.2 + k * 0.6);
    this.bloom.strength = 0.9 + k * 0.5;

    // 72-hour clock
    if (this.kTarget) {
      this.clock = Math.min(72 * 3600, this.clock + dt * 72 * 3600 / 4);
      const hh = Math.floor(this.clock / 3600), mm = Math.floor((this.clock % 3600) / 60), ss = Math.floor(this.clock % 60);
      this.clockEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }

    // pillars levitate / tilt in the genjutsu
    this.pillars.forEach((m) => {
      m.position.y = m.userData.base + Math.sin(t * 0.6 + m.userData.ph) * (0.2 + k * 1.2) + k * 1.5;
      m.rotation.y += dt * 0.05 * k;
    });

    // motes: drift down normally, stream upward inside Tsukuyomi
    const rate = this.app.low ? 30 : 70;
    if (Math.random() < dt * rate) {
      const up = k > 0.5;
      this.motes.emit({
        x: rand(-25, 25), y: up ? rand(-1, 2) : rand(8, 16), z: rand(-30, 8),
        vx: 0, vy: up ? rand(2, 5) : rand(-1.2, -0.4), vz: 0,
        life: rand(3, 6), size: rand(0.04, 0.12), color: up ? (Math.random() < 0.7 ? this.moteB : this.moteC) : this.moteA, alpha: 0.9,
      });
    }

    // Izanami state machine
    if (this.iz.on || this.iz.phase === 'rewind') {
      const f = this.feather;
      this.iz.t += dt;
      if (this.iz.phase === 'fall') {
        const e = Math.min(1, this.iz.t / 3.2);
        f.position.set(Math.sin(this.iz.t * 2.2) * 1.2, 7 - e * 6.2, 4);
        f.rotation.set(Math.sin(this.iz.t * 2.2) * 0.6, this.iz.t, Math.sin(this.iz.t * 2.2) * 0.8);
        if (e >= 1) {
          this.iz.phase = 'choice';
          this.izLoops.textContent = this.iz.loops ? `Loop ${this.iz.loops + 1}` : 'The moment';
          this.izText.textContent = IZANAMI_LINES[Math.min(this.iz.loops, IZANAMI_LINES.length - 1)];
          this.izBox.classList.remove('hidden');
        }
      } else if (this.iz.phase === 'rewind') {
        const e = Math.min(1, this.iz.t / 0.9);
        f.position.y = 0.8 + e * 6.2;
        f.rotation.y -= dt * 20;
        if (e >= 1) this._resetFeather();
      }
    }

    // camera
    this.yawTarget += dt * 0.03;
    this.yaw = damp(this.yaw, this.yawTarget, 4, dt);
    // on a phone, tilting orbits the view a little around the torii and lifts or lowers it
    const gyro = this.app.gyro;
    this.gyroYaw = damp(this.gyroYaw || 0, gyro ? gyro.x * 0.45 : 0, 4, dt);
    this.gyroRise = damp(this.gyroRise || 0, gyro ? gyro.y * 1.2 : 0, 4, dt);
    const r = this.app.width / this.app.height < 0.9 ? 16 : 12;
    this.camera.position.set(Math.sin(this.yaw + this.gyroYaw) * r, 2.4 + k * 0.8 + this.gyroRise, Math.cos(this.yaw + this.gyroYaw) * r);
    this.camera.lookAt(0, 3 + k * 1.5, -8);
    this.camera.rotateZ(Math.sin(t * 0.4) * 0.05 * k);
    this.moon.lookAt(this.camera.position);

    this.motes.update(dt, t);
    this.shards.update(dt, t);
    this.crows.update(dt);
  }
}
