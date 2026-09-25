import * as THREE from 'three';
import { applyTextureSet } from '../core/Textures.js';
import { Chapter } from '../core/Chapter.js';
import { SharinganEye } from '../objects/Eye.js';
import { ParticlePool } from '../objects/Particles.js';
import { createCrowGeometry, createCrowMaterial, addPhases } from '../objects/Crow.js';
import { rand, damp, TAU, h, shuffle, pick, drawTexture, glowTexture } from '../core/utils.js';
import { QUIZ, TRIVIA } from '../data/content.js';
import { voice } from '../core/Voice.js';

const N = 8;
const RANKS = [
  [0, 'Academy Student', 'Everyone starts somewhere. Even Itachi studied — just faster.'],
  [3, 'Genin', 'You know the basics of the Uchiha prodigy.'],
  [5, 'Chūnin', 'A sharp mind. The Sharingan is starting to spin.'],
  [7, 'ANBU Captain', 'Itachi held this rank at thirteen. Impressive.'],
  [8, 'Mangekyō Awakened', 'Flawless. You see through every genjutsu.'],
];

export class Quiz extends Chapter {
  constructor(app) {
    super(app, { id: 'trials', title: 'Trials', jp: '試練' });
    this.bloom = { strength: 0.9, radius: 0.45, threshold: 0.55 };
    this.mood = 'mystic';
    this.trail = false;
    this.state = 'start';
  }

  _buildChamber(s) {
    const FLOOR = -3.2;
    const stoneTex = drawTexture(512, 512, (x, w) => {
      // courses of dressed stone blocks
      x.fillStyle = '#2a2420'; x.fillRect(0, 0, w, w);
      const rowH = 64;
      for (let y = 0, r = 0; y < w; y += rowH, r++) {
        for (let px = (r % 2) * -60; px < w; px += rand(110, 150)) {
          const l = rand(48, 72);
          x.fillStyle = `rgb(${l},${l * 0.95},${l * 0.9})`;
          x.fillRect(px + 3, y + 3, 150, rowH - 6);
          for (let k = 0; k < 60; k++) { const m = rand(30, 90); x.fillStyle = `rgba(${m},${m * 0.9},${m * 0.8},0.4)`; x.fillRect(px + rand(4, 140), y + rand(4, rowH - 6), rand(1, 4), rand(1, 3)); }
        }
      }
    });
    stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
    const wallMat = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 2.5, roughness: 0.95 });
    const tile = (m, rx, ry) => { for (const k of ['map', 'bumpMap']) { m[k] = stoneTex.clone(); m[k].repeat.set(rx, ry); m[k].needsUpdate = true; } };
    const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), wallMat.clone());
    tile(back.material, 5, 2);
    applyTextureSet(back.material, 'japanese_stone_wall', { repeat: [4, 1.6], tint: 0x8a8078, renderer: this.app.renderer });
    back.position.set(0, FLOOR + 6, -7);
    s.add(back);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(22, 12), wallMat.clone());
      tile(side.material, 4, 2);
      applyTextureSet(side.material, 'japanese_stone_wall', { repeat: [3, 1.6], tint: 0x8a8078, renderer: this.app.renderer });
      side.rotation.y = -sx * Math.PI / 2;
      side.position.set(sx * 13, FLOOR + 6, 2);
      s.add(side);
    }
    // tatami: separate mats of finely woven rush, dark cloth borders along the long sides
    const tatami = drawTexture(1024, 512, (x, w, hh) => {
      x.fillStyle = '#7e7a52'; x.fillRect(0, 0, w, hh);
      // rush strands running the length of the mat
      for (let y = 0; y < hh; y += 2) {
        const l = rand(0.8, 1.15);
        x.fillStyle = `rgba(${120 * l | 0},${116 * l | 0},${74 * l | 0},0.8)`; x.fillRect(0, y, w, 1.4);
        if (rand(0, 1) < 0.3) { x.fillStyle = 'rgba(30,26,14,0.35)'; x.fillRect(0, y + 1.4, w, 0.6); }
      }
      // the weave: faint cross threads at a steady pitch
      for (let px = 0; px < w; px += 12) { x.fillStyle = 'rgba(36,32,18,0.32)'; x.fillRect(px, 0, 1.6, hh); }
      // wear: a paler, smoother patch and a few stains
      for (let i = 0; i < 6; i++) {
        const cx = rand(0, w), cy = rand(0, hh), r = rand(60, 200);
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        const a = rand(0, 1) < 0.6 ? 'rgba(160,150,110,0.14)' : 'rgba(40,30,18,0.14)';
        g.addColorStop(0, a); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, hh);
      }
      // heri, the cloth edging
      for (const y0 of [0, hh - 26]) {
        x.fillStyle = '#17120f'; x.fillRect(0, y0, w, 26);
        x.fillStyle = 'rgba(70,60,50,0.35)'; for (let px = 0; px < w; px += 6) x.fillRect(px, y0 + 4, 3, 18);
      }
    });
    tatami.anisotropy = this.app.renderer.capabilities.getMaxAnisotropy();
    const matMat = new THREE.MeshStandardMaterial({ map: tatami, bumpMap: tatami, bumpScale: 1.2, roughness: 0.85 });
    const MW = 3.6, MD = 1.8;
    const spots = [];
    for (let r = 0; r * MD < 20; r++) {
      const off = (r % 2) * MW / 2;
      for (let c = -1; c * MW - off < 26; c++) spots.push([-13 + c * MW + off + MW / 2, -8 + r * MD + MD / 2]);
    }
    const mats = new THREE.InstancedMesh(new THREE.BoxGeometry(MW - 0.04, 0.06, MD - 0.04), matMat, spots.length);
    const md = new THREE.Object3D(), tint = new THREE.Color();
    spots.forEach(([px, pz], i) => {
      md.position.set(px, FLOOR + 0.03, pz);
      md.rotation.y = rand(0, 1) < 0.5 ? 0 : Math.PI; // the weave catches light differently each way
      md.updateMatrix();
      mats.setMatrixAt(i, md.matrix);
      mats.setColorAt(i, tint.setScalar(rand(0.82, 1)));
    });
    s.add(mats);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x0e0a08, roughness: 1 }));
    under.rotation.x = -Math.PI / 2;
    under.position.set(0, FLOOR, 2);
    s.add(under);
    // posts and a tie beam of old, dark timber along the back wall
    const timber = drawTexture(128, 512, (x, w, hh) => {
      x.fillStyle = '#2a1c14'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(${rand(10, 60)},${rand(8, 40)},${rand(4, 26)},0.5)`; x.lineWidth = rand(0.5, 2); x.beginPath(); const px = rand(0, w); x.moveTo(px, 0); x.bezierCurveTo(px + rand(-8, 8), hh / 3, px + rand(-8, 8), hh * 2 / 3, px + rand(-6, 6), hh); x.stroke(); }
    });
    const postMat = new THREE.MeshStandardMaterial({ map: timber, bumpMap: timber, bumpScale: 1.5, roughness: 0.8 });
    for (const px of [-12.6, -10.4, 10.4, 12.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 0.5), postMat);
      post.position.set(px, FLOOR + 6, -6.7);
      s.add(post);
    }
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 0.3), postMat);
    nuki.position.set(0, FLOOR + 7.6, -6.75);
    s.add(nuki);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 0.6), beamMat);
      beam.position.set(0, FLOOR + 9, -6 + i * 3.5);
      s.add(beam);
    }

    // the Uchiha stone tablet, carved with the clan's crest and an ancient script
    const tabletTex = drawTexture(512, 768, (x, w, hh) => {
      x.fillStyle = '#4a4642'; x.fillRect(0, 0, w, hh);
      for (let k = 0; k < 6000; k++) { const l = rand(45, 110); x.fillStyle = `rgba(${l},${l - 3},${l - 6},0.45)`; x.fillRect(rand(0, w), rand(0, hh), rand(1, 3), rand(1, 3)); }
      const carve = (draw) => { x.save(); x.fillStyle = 'rgba(200,190,176,0.25)'; x.strokeStyle = 'rgba(200,190,176,0.25)'; x.translate(2, 2); draw(); x.restore(); x.save(); x.fillStyle = 'rgba(18,14,12,0.9)'; x.strokeStyle = 'rgba(18,14,12,0.9)'; draw(); x.restore(); };
      // the crest: a fan, top half cut deep
      carve(() => { x.lineWidth = 6; x.beginPath(); x.arc(w / 2, 150, 90, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(w / 2, 150, 90, Math.PI, 0); x.fill(); x.fillRect(w / 2 - 10, 240, 20, 70); });
      // columns of worn characters, read top to bottom
      x.font = '900 34px "Noto Serif JP", serif'; x.textAlign = 'center';
      const glyphs = '写輪眼万華鏡瞳力六道仙人兄弟宿命光闇月読天照須佐能乎';
      for (let c = 0; c < 7; c++) {
        for (let r = 0; r < 9; r++) {
          const ch = glyphs[Math.floor(rand(0, glyphs.length))];
          carve(() => { x.globalAlpha = rand(0.35, 0.8); x.fillText(ch, w - 70 - c * 62, 380 + r * 44); });
        }
      }
      x.globalAlpha = 1;
      x.strokeStyle = 'rgba(20,16,14,0.7)'; x.lineWidth = 8; x.strokeRect(20, 20, w - 40, hh - 40);
    });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x57524d, roughness: 0.9 });
    const face = new THREE.MeshStandardMaterial({ map: tabletTex, roughness: 0.9 });
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(3.6, 5.8, 0.5), [stoneMat, stoneMat, stoneMat, stoneMat, face, stoneMat]);
    tablet.position.set(-2, FLOOR + 2.9 + 0.3, -5.6);
    s.add(tablet);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.3, 1.2), stoneMat);
    plinth.position.set(-2, FLOOR + 0.15, -5.6);
    s.add(plinth);
    this.tablet = tablet;
    // a soft light falling on the tablet from a shaft above
    const key = new THREE.SpotLight(0xffd0a0, 60, 20, 0.45, 0.7, 1.4);
    key.position.set(-1.6, FLOOR + 7.4, -1.8); // below the beams, so its cone falls only on the tablet
    key.target = tablet;
    s.add(key);
    // the shaft itself, faintly visible in the dusty air
    const from = key.position.clone(), to = new THREE.Vector3(-2, FLOOR + 1.2, -5.6);
    const len = from.distanceTo(to);
    const shaftGeo = new THREE.CylinderGeometry(0.35, 2.3, len, 32, 1, true);
    const shaft = new THREE.Mesh(shaftGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color(0xffd6a8) }, uAmt: { value: 0.1 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uAmt; varying vec2 vUv; varying vec3 vN, vV; void main(){ float edge = pow(clamp(abs(dot(vN, vV)), 0.0, 1.0), 2.0); float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y); gl_FragColor = vec4(uCol * edge * along * uAmt, 1.0); }',
    }));
    shaft.position.copy(from).add(to).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    s.add(shaft);
    this.shaft = { from, to, mat: shaft.material };

    // shimenawa: a twisted straw rope sagging over the tablet, zigzag shide paper hanging from it
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xa89468, roughness: 0.95 });
    const rx0 = -4.4, rx1 = 0.4, ry = FLOOR + 7.0, rz = -5.2;
    const along = (u) => new THREE.Vector3(rx0 + (rx1 - rx0) * u, ry - Math.sin(u * Math.PI) * 0.5, rz);
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i <= 80; i++) {
        const u = i / 80, a = u * 28 + (k * TAU) / 3, thick = 0.1 + Math.sin(u * Math.PI) * 0.1;
        pts.push(along(u).add(new THREE.Vector3(0, Math.cos(a) * thick, Math.sin(a) * thick)));
      }
      s.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.1 + 0.02 * k, 6), ropeMat));
    }
    const shideTex = drawTexture(128, 256, (x, w, hh) => {
      x.fillStyle = '#f2eee4';
      const step = hh / 4;
      x.beginPath(); x.moveTo(w * 0.35, 0); x.lineTo(w * 0.65, 0);
      for (let i = 0; i < 4; i++) {
        const dir = i % 2 ? -1 : 1;
        x.lineTo(w * (0.5 + dir * 0.15) + dir * w * 0.2, step * i + step * 0.15);
        x.lineTo(w * (0.5 + dir * 0.15) + dir * w * 0.2, step * (i + 1));
        x.lineTo(w * (0.5 + dir * 0.15) - dir * w * 0.1, step * (i + 1));
        x.lineTo(w * (0.5 + dir * 0.15) - dir * w * 0.1, step * i + step * 0.5);
      }
      x.lineTo(w * 0.35, 0); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(120,110,90,0.35)'; x.lineWidth = 2; x.stroke();
    });
    const shideMat = new THREE.MeshStandardMaterial({ map: shideTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    this.shide = [];
    for (const u of [0.2, 0.5, 0.8]) {
      const pivot = new THREE.Group();
      pivot.position.copy(along(u)).add(new THREE.Vector3(0, -0.12, 0.12));
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.15), shideMat);
      paper.position.y = -0.57;
      pivot.add(paper);
      s.add(pivot);
      this.shide.push({ pivot, ph: rand(0, TAU) });
    }

    // clan banners: dark cloth, the uchiwa crest, hung from rods and falling in soft folds
    const bannerTex = drawTexture(256, 512, (x, w, hh) => {
      x.fillStyle = '#23232e'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 2600; i++) { const l = rand(14, 40); x.fillStyle = `rgba(${l},${l},${l + 8},0.5)`; x.fillRect(rand(0, w), rand(0, hh), rand(1, 2), rand(2, 6)); }
      const cx = w / 2, cy = hh * 0.38, r = w * 0.3;
      x.fillStyle = '#b3141c'; x.beginPath(); x.arc(cx, cy, r, Math.PI, 0); x.fill();
      x.fillStyle = '#e9e4da'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI); x.fill();
      x.fillStyle = '#e9e4da'; x.fillRect(cx - r * 0.12, cy + r * 0.98, r * 0.24, r * 0.9);
      // faded, and darker toward the hem
      const g = x.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
      x.fillStyle = g; x.fillRect(0, 0, w, hh);
    });
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 1, side: THREE.DoubleSide });
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.7 });
    this.banners = [];
    for (const bx of [-8.3, 7.9]) {
      const geo = new THREE.PlaneGeometry(1.8, 3.8, 12, 16);
      const base = geo.attributes.position.array.slice();
      const banner = new THREE.Mesh(geo, bannerMat);
      banner.position.set(bx, FLOOR + 5.2, -6.45);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), rodMat);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(bx, FLOOR + 7.12, -6.4);
      s.add(banner, rod);
      this.banners.push({ geo, base, ph: rand(0, TAU) });
    }

    // candles on tall stands: flames that flicker, warm light on the stone
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.6, metalness: 0.3 });
    const waxMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.7 });
    const flameTex = drawTexture(64, 128, (x, w, hh) => {
      const tear = () => { x.beginPath(); x.moveTo(w / 2, 4); x.bezierCurveTo(w * 0.78, hh * 0.45, w * 0.8, hh * 0.8, w / 2, hh - 6); x.bezierCurveTo(w * 0.2, hh * 0.8, w * 0.22, hh * 0.45, w / 2, 4); };
      x.filter = 'blur(3px)';
      const g = x.createLinearGradient(0, 0, 0, hh);
      g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(0.3, 'rgba(255,150,60,0.9)'); g.addColorStop(0.75, 'rgba(255,220,140,1)'); g.addColorStop(0.9, 'rgba(90,120,255,0.8)'); g.addColorStop(1, 'rgba(60,80,255,0)');
      x.fillStyle = g; tear(); x.fill();
      x.filter = 'blur(2px)';
      x.fillStyle = 'rgba(255,250,235,0.95)'; x.beginPath(); x.ellipse(w / 2, hh * 0.66, w * 0.12, hh * 0.18, 0, 0, TAU); x.fill();
    });
    const flameMat = new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.candles = [];
    [[-6.2, -4.8], [2.2, -5.2], [-8.5, -1], [7.5, -2.5], [4.6, -5.8]].forEach(([x, z], i) => {
      const g = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.2, 8), standMat);
      stand.position.y = 1.1;
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.06, 12), standMat);
      dish.position.y = 2.22;
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 10), waxMat);
      wax.position.y = 2.42;
      // drips of wax down the side, and the wick
      for (let d = 0; d < 4; d++) {
        const a = rand(0, TAU), len = rand(0.08, 0.2);
        const drip = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, len, 3, 6), waxMat);
        drip.position.set(Math.cos(a) * 0.068, 2.56 - len / 2, Math.sin(a) * 0.068);
        g.add(drip);
      }
      const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 4), standMat);
      wick.position.y = 2.61;
      g.add(wick);
      const flame = new THREE.Sprite(flameMat);
      flame.center.set(0.5, 0.08); // grows up from the wick
      flame.scale.set(0.09, 0.22, 1);
      flame.position.y = 2.6;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff9a40, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(0.9);
      halo.position.y = 2.7;
      g.add(stand, dish, wax, flame, halo);
      g.position.set(x, FLOOR, z);
      s.add(g);
      const light = i < 4 ? new THREE.PointLight(0xffb468, 14, 14, 1.4) : null;
      if (light) { light.position.set(x, FLOOR + 2.8, z); s.add(light); }
      this.candles.push({ flame, halo, light, ph: rand(0, TAU) });
    });

    this.dust = new ParticlePool({ count: 200, drag: 0.5, turbulence: 0.3, softness: 2 });
    s.add(this.dust.points);
    this.dustColor = new THREE.Color(0xffd8b0);
  }

  build() {
    const s = this.scene;
    // the secret chamber beneath the Naka Shrine: stone walls, tatami, candles, and the Uchiha's stone
    // tablet, whose meaning only the Sharingan can read; the eye floats before it
    s.background = new THREE.Color(0x070404);
    s.fog = new THREE.FogExp2(0x0c0706, 0.03);
    s.add(new THREE.HemisphereLight(0x7a7078, 0x2a1e18, 1.4));
    this._buildChamber(s);

    this.eye = new SharinganEye({ radius: 1.8, mode: 0 });
    s.add(this.eye.group);

    // orbiting crows
    this.crowCount = 28;
    const geo = createCrowGeometry(0.7);
    addPhases(geo, this.crowCount);
    this.crows = new THREE.InstancedMesh(geo, createCrowMaterial({ flap: 9 }), this.crowCount);
    this.crows.frustumCulled = false;
    this.crowData = Array.from({ length: this.crowCount }, (_, i) => ({ a: (i / this.crowCount) * TAU, r: rand(3.6, 5.2), y: rand(-1.5, 1.5), sp: rand(0.25, 0.45) }));
    s.add(this.crows);
    this.dummy = new THREE.Object3D();

    this.embers = new ParticlePool({ count: 400, turbulence: 1, drag: 0.4 });
    s.add(this.embers.points);
    this.emberColors = [new THREE.Color(0xff3020), new THREE.Color(0xff8050)];

    this.camera.position.set(0, 0, 11);
    this._buildUI();
    this.showStart();
  }

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 試練',
      jp: '試練',
      title: 'Trials of the <em>Uchiha</em>',
      desc: 'Eight questions. Each correct answer adds a tomoe to the Sharingan. A perfect score awakens the Mangekyō.',
    });
    this.panel = h('div.quiz.pe', { role: 'region', 'aria-label': 'Quiz' });
    this.ui.append(this.panel);
  }

  _trivia() {
    const card = h('div.trivia-card', { tabindex: 0, role: 'button', 'aria-label': 'Flip for a secret' },
      h('div.trivia-inner', {},
        h('div.trivia-face.trivia-front', {}, h('b', { text: '秘' }), h('span', { text: 'Tap to reveal a secret' })),
        h('div.trivia-face.trivia-back', {}, h('small', { text: 'Secret scroll' }), h('div', { text: pick(TRIVIA) })),
      ));
    const flip = () => {
      if (card.classList.contains('flipped')) {
        card.classList.remove('flipped');
        setTimeout(() => { card.querySelector('.trivia-back div').textContent = pick(TRIVIA); }, 400);
      } else card.classList.add('flipped');
      this.app.sfx.swoosh();
    };
    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    return card;
  }

  showStart() {
    this.state = 'start';
    this.eye.setMode(0);
    const start = h('button.btn.btn-primary', { type: 'button', text: 'Begin the trial' });
    start.addEventListener('click', () => { this.app.sfx.click(); this.begin(); });
    this.panel.replaceChildren(
      h('div.card-jp', { text: '写輪眼の試練' }),
      h('h3', { text: 'How well do you know Itachi?' }),
      h('p.explain', { text: `${N} questions drawn from his life, jutsu and legacy. Use keys 1–4 to answer.` }),
      h('div.quiz-foot', {}, start, h('span.hint', { text: `${QUIZ.length} in the pool` })),
      this._trivia(),
    );
  }

  begin() {
    this.questions = shuffle([...QUIZ]).slice(0, N).map((q) => {
      const order = shuffle([0, 1, 2, 3]);
      return { ...q, opts: order.map((k) => q.a[k]), correct: order.indexOf(q.c) };
    });
    this.i = 0;
    this.score = 0;
    this.results = [];
    this.state = 'q';
    this.eye.setMode(0);
    this.renderQ();
  }

  _modeFor(score) {
    if (score >= N) return 'mangekyo';
    if (score >= 5) return 3;
    if (score >= 3) return 2;
    if (score >= 1) return 1;
    return 0;
  }

  renderQ() {
    const q = this.questions[this.i];
    this.answered = false;
    const dots = h('div.quiz-dots', {}, this.questions.map((_, k) =>
      h(`i${k < this.results.length ? (this.results[k] ? '.ok' : '.bad') : k === this.i ? '.cur' : ''}`)));
    this.optBtns = q.opts.map((txt, k) => {
      const b = h('button.option', { type: 'button' }, h('kbd', { text: String(k + 1) }), h('span', { text: txt }));
      b.addEventListener('click', () => this.answer(k));
      return b;
    });
    this.explainEl = h('p.explain', { style: 'display:none' });
    this.nextBtn = h('button.btn.btn-primary', { type: 'button', text: this.i === N - 1 ? 'See result' : 'Next →', style: 'visibility:hidden' });
    this.nextBtn.addEventListener('click', () => { this.app.sfx.click(); this.next(); });
    this.panel.replaceChildren(
      h('div.quiz-top', {}, h('span.kicker', { text: `Question ${this.i + 1} / ${N}` }), dots),
      h('h3', { text: q.q }),
      h('div.options', {}, this.optBtns),
      this.explainEl,
      h('div.quiz-foot', {}, this.scoreHint = h('span.hint', { text: `Score ${this.score}` }), this.nextBtn),
    );
    this.panel.scrollTop = 0;
  }

  answer(k) {
    if (this.answered) return;
    this.answered = true;
    const q = this.questions[this.i];
    const ok = k === q.correct;
    this.optBtns.forEach((b, j) => {
      b.disabled = true;
      if (j === q.correct) b.classList.add('correct');
      else if (j === k) b.classList.add('wrong');
    });
    this.results.push(ok);
    if (ok) {
      this.score++;
      this.app.sfx.chime();
      const changed = this.eye.setMode(this._modeFor(this.score));
      if (!changed) this.eye.pulse(0.5);
      else if (this.score === 1) { this.app.sfx.sharingan(); voice.say('sharingan', { subtitle: false }); } // the first tomoe awakens it
      this.embers.burst(new THREE.Vector3(this.eye.group.position.x, this.eye.group.position.y, 1), 60, { speed: 6, life: [0.5, 1.2], size: [0.05, 0.12], colors: this.emberColors });
    } else {
      this.app.sfx.wrong();
      this.shake = 1;
    }
    this.explainEl.textContent = (ok ? '✓ Correct. ' : '✗ Not quite. ') + q.e;
    this.scoreHint.textContent = `Score ${this.score}`;
    this.explainEl.style.display = '';
    this.nextBtn.style.visibility = 'visible';
    this.nextBtn.focus({ preventScroll: true });
  }

  next() {
    if (this.i < N - 1) {
      this.i++;
      this.renderQ();
    } else this.showResult();
  }

  showResult() {
    this.state = 'result';
    const rank = [...RANKS].reverse().find(([min]) => this.score >= min);
    if (this.score === N) {
      this.eye.setMode('mangekyo');
      this.app.bleed();
      this.app.sfx.awaken();
      this.app.sfx.mangekyo();
      voice.say('mangekyo', { subtitle: false, delay: 0.55 });
    }
    const retry = h('button.btn.btn-primary', { type: 'button', text: 'Try again' });
    retry.addEventListener('click', () => { this.app.sfx.click(); this.begin(); });
    const home = h('button.btn', { type: 'button', text: 'Back to prologue' });
    home.addEventListener('click', () => { this.app.sfx.click(); this.app.goTo(0); });
    this.panel.replaceChildren(
      h('div.card-jp', { text: '結果 · Result' }),
      h('div.result-score', { text: `${this.score}/${N}` }),
      h('div.result-rank', { text: rank[1] }),
      h('p.explain', { text: rank[2] }),
      h('div.quiz-foot', {}, retry, home),
      this._trivia(),
    );
  }

  key(e) {
    if (this.state === 'q') {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) { this.answer(n - 1); return true; }
      if (e.key === 'Enter' && this.answered) { e.preventDefault(); this.next(); return true; }
    }
    return false;
  }

  pointerMove() {
    this.app.setHover(this.app.raycast([this.eye.mesh], false).length > 0);
  }

  click() {
    if (this.app.raycast([this.eye.mesh], false).length) {
      this.eye.pulse(0.8);
      this.app.sfx.awaken();
    }
  }

  resize(w, hh) {
    super.resize(w, hh);
    if (!this.eye) return;
    const aspect = w / hh;
    if (aspect > 1.1) {
      this.eyeBase = new THREE.Vector3(-Math.min(2.8, aspect * 1.1), -0.6, 0);
      this.camera.position.z = 11;
    } else {
      this.eyeBase = new THREE.Vector3(0, 4.6, 0);
      this.camera.position.z = 13 / Math.min(1, aspect * 1.4);
    }
    this.eye.group.position.copy(this.eyeBase);
  }

  update(dt, t) {
    this.eye.update(dt);
    for (const c of this.candles) {
      const f = 0.85 + Math.sin(t * 11 + c.ph) * 0.08 + Math.sin(t * 23 + c.ph * 2) * 0.05 + Math.random() * 0.04;
      c.flame.scale.set(0.09 * (1.1 - f * 0.1), 0.22 * f, 1);
      c.flame.material.rotation = Math.sin(t * 3 + c.ph) * 0.06;
      c.halo.material.opacity = 0.4 * f;
      if (c.light) c.light.intensity = 14 * f;
    }
    for (const sh of this.shide) { sh.pivot.rotation.z = Math.sin(t * 0.9 + sh.ph) * 0.06; sh.pivot.rotation.x = Math.sin(t * 0.7 + sh.ph * 2) * 0.08; }
    for (const b of this.banners) {
      const P = b.geo.attributes.position.array;
      for (let i = 0; i < P.length; i += 3) {
        const x0 = b.base[i], y0 = b.base[i + 1], hang = (1.9 - y0) / 3.8; // 0 at the rod, 1 at the hem
        P[i + 2] = b.base[i + 2] + Math.sin(x0 * 5 + b.ph) * 0.05 + Math.sin(t * 0.8 + y0 * 1.3 + b.ph) * 0.05 * hang;
      }
      b.geo.attributes.position.needsUpdate = true;
      b.geo.computeVertexNormals();
    }
    if (Math.random() < dt * 10) {
      const u = rand(0.2, 0.95), p = this.shaft.from.clone().lerp(this.shaft.to, u), r = 0.35 + u * 1.6;
      this.dust.emit({ x: p.x + rand(-r, r) * 0.7, y: p.y, z: p.z + rand(-r, r) * 0.7, vx: rand(-0.03, 0.03), vy: rand(-0.03, 0.03), vz: rand(-0.03, 0.03), life: rand(4, 8), size: rand(0.012, 0.03), color: this.dustColor, alpha: 0.9 });
    }
    if (Math.random() < dt * 5) this.dust.emit({ x: rand(-9, 9), y: rand(-2, 4), z: rand(-5, 3), vx: rand(-0.04, 0.04), vy: rand(-0.03, 0.05), vz: rand(-0.04, 0.04), life: rand(4, 8), size: rand(0.015, 0.035), color: this.dustColor, alpha: 0.6 });
    this.dust.update(dt, t);
    const pn = this.app.pointer.ndc;
    const gyro = this.app.gyro;
    const gazeX = gyro ? gyro.x * 0.6 : this.app.isTouch ? Math.sin(t * 0.5) * 0.3 : pn.x * 0.5;
    const gazeY = gyro ? gyro.y * 0.4 : this.app.isTouch ? 0 : -pn.y * 0.35;
    this.eye.group.rotation.y = damp(this.eye.group.rotation.y, gazeX + 0.25, 5, dt);
    this.eye.group.rotation.x = damp(this.eye.group.rotation.x, gazeY, 5, dt);
    this.shake = damp(this.shake || 0, 0, 6, dt);
    if (this.eyeBase) this.eye.group.position.x = this.eyeBase.x + Math.sin(t * 60) * this.shake * 0.12;

    const c = this.eye.group.position;
    this.crowData.forEach((d, i) => {
      d.a += dt * d.sp;
      const x = c.x + Math.cos(d.a) * d.r, z = Math.sin(d.a) * d.r - 1, y = c.y + d.y + Math.sin(t + i) * 0.3;
      this.dummy.position.set(x, y, z);
      this.dummy.lookAt(c.x + Math.cos(d.a + 0.1) * d.r, y, Math.sin(d.a + 0.1) * d.r - 1);
      this.dummy.updateMatrix();
      this.crows.setMatrixAt(i, this.dummy.matrix);
    });
    this.crows.instanceMatrix.needsUpdate = true;

    if (Math.random() < dt * 20) {
      this.embers.emit({ x: rand(-10, 10), y: -6, z: rand(-6, 2), vy: rand(0.5, 1.4), life: rand(4, 8), size: rand(0.04, 0.09), color: this.emberColors[Math.floor(rand(0, 2))], alpha: 0.8 });
    }
    this.embers.update(dt, t);
  }
}
