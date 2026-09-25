import * as THREE from 'three';
import { applyTextureSet } from '../core/Textures.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Chapter } from '../core/Chapter.js';
import { ParticlePool } from '../objects/Particles.js';
import { drawTexture, drawLeaf, drawAkatsukiCloud, damp, rand, TAU, h, clamp } from '../core/utils.js';
import { RELICS } from '../data/content.js';

const R = 4.2;

export class Relics extends Chapter {
  constructor(app) {
    super(app, { id: 'relics', title: 'Relics', jp: '遺品' });
    this.bloom = { strength: 0.4, radius: 0.4, threshold: 0.92 };
    this.mood = 'calm';
    this.trail = false;
    this.rot = 0;
    this.rotTarget = 0;
    this.focused = -1;
    this.front = 0;
    this.hoverIndex = -1;
  }

  build() {
    const s = this.scene;
    // a dim shrine hall of the Uchiha: wooden floor and pillars, shoji screens lit from behind, the clan's
    // crest on a banner, and each relic on a stone plinth in its own shaft of light
    s.background = new THREE.Color(0x070405);
    s.fog = new THREE.Fog(0x0a0605, 10, 34);

    const pmrem = new THREE.PMREMGenerator(this.app.renderer);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.3;

    s.add(new THREE.HemisphereLight(0x6a5048, 0x0a0605, 1.0));
    const spot = new THREE.SpotLight(0xfff0e8, 48, 30, 0.5, 0.8, 1.5);
    spot.position.set(0, 12, 8);
    spot.target.position.set(0, 0, R);
    spot.castShadow = !this.app.low;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    s.add(spot, spot.target);
    const rim = new THREE.PointLight(0xff4a2a, 10, 20);
    rim.position.set(0, 3, -2);
    s.add(rim);

    // floor
    const floorTex = drawTexture(1024, 1024, (x, w) => {
      // planks of dark stained wood with grain, joints and a worn path round the display
      const plank = 64;
      for (let y = 0; y < w; y += plank) {
        const off = rand(0, w);
        for (let px = -off; px < w; px += rand(300, 520)) {
          const l = rand(34, 52);
          x.fillStyle = `rgb(${l},${l * 0.62},${l * 0.42})`;
          x.fillRect(px, y, 520, plank);
          for (let g = 0; g < 14; g++) {
            x.strokeStyle = `rgba(${l * 0.5},${l * 0.3},${l * 0.2},${rand(0.25, 0.55)})`;
            x.lineWidth = rand(0.6, 2);
            const gy = y + rand(4, plank - 4);
            x.beginPath(); x.moveTo(px, gy); x.bezierCurveTo(px + 150, gy + rand(-4, 4), px + 300, gy + rand(-4, 4), px + 520, gy + rand(-3, 3)); x.stroke();
          }
          x.fillStyle = 'rgba(8,4,2,0.9)'; x.fillRect(px, y, 3, plank);
        }
        x.fillStyle = 'rgba(8,4,2,0.9)'; x.fillRect(0, y, w, 2);
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(3, 3);
    const floor = this.floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.38, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    this.reflective = [floor];
    applyTextureSet(floor.material, 'wood_floor_worn', { repeat: [7, 7], tint: 0x9a8070, roughness: 0.6, renderer: this.app.renderer });

    // walls: wooden pillars between shoji panels glowing faintly from lamps behind them
    const wallTex = drawTexture(1024, 512, (x, w, hh) => {
      x.fillStyle = '#120a07'; x.fillRect(0, 0, w, hh);
      const bays = 4, bw = w / bays;
      for (let b = 0; b < bays; b++) {
        const x0 = b * bw;
        const lx = x0 + bw * rand(0.3, 0.7), ly = hh * rand(0.45, 0.7), bright = rand(0.55, 1);
        const g = x.createRadialGradient(lx, ly, 10, lx, ly, bw * rand(0.6, 0.9));
        g.addColorStop(0, `rgb(${184 * bright | 0},${132 * bright | 0},${74 * bright | 0})`); g.addColorStop(1, '#3a2414');
        x.fillStyle = g; x.fillRect(x0 + 26, hh * 0.18, bw - 52, hh * 0.7);
        // washi fibres and a few stains in the paper
        for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(255,230,190,${rand(0.02, 0.08)})`; x.fillRect(x0 + 26 + rand(0, bw - 52), hh * 0.18 + rand(0, hh * 0.7), rand(2, 10), 1); }
        for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(60,36,18,0.12)'; x.beginPath(); x.ellipse(x0 + rand(40, bw - 40), hh * rand(0.25, 0.8), rand(8, 22), rand(6, 16), 0, 0, TAU); x.fill(); }
        x.strokeStyle = '#1a0f09'; x.lineWidth = 5;
        for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(x0 + 26 + (i * (bw - 52)) / 4, hh * 0.18); x.lineTo(x0 + 26 + (i * (bw - 52)) / 4, hh * 0.88); x.stroke(); }
        for (let j = 1; j < 6; j++) { x.beginPath(); x.moveTo(x0 + 26, hh * 0.18 + (j * hh * 0.7) / 6); x.lineTo(x0 + bw - 26, hh * 0.18 + (j * hh * 0.7) / 6); x.stroke(); }
        x.fillStyle = '#2a1a10'; x.fillRect(x0, 0, 26, hh); x.fillRect(x0 + bw - 26, 0, 26, hh);
      }
      x.fillStyle = '#1e120b'; x.fillRect(0, 0, w, hh * 0.18); x.fillRect(0, hh * 0.88, w, hh * 0.12);
    });
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.repeat.set(6, 1);
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 8, 64, 1, true), new THREE.MeshStandardMaterial({ map: wallTex, emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 0.07, roughness: 0.9, color: 0x9a8a80, side: THREE.BackSide }));
    walls.position.y = 4;
    s.add(walls);
    // the hall's frame: square timber posts round the wall, a ring beam, radial beams and a coffered ceiling
    {
      const grain = drawTexture(128, 512, (x, w, hh) => {
        x.fillStyle = '#2c1c12'; x.fillRect(0, 0, w, hh);
        for (let i = 0; i < 80; i++) { x.strokeStyle = `rgba(${rand(10, 60)},${rand(8, 40)},${rand(4, 26)},0.5)`; x.lineWidth = rand(0.5, 2); x.beginPath(); const px = rand(0, w); x.moveTo(px, 0); x.bezierCurveTo(px + rand(-8, 8), hh / 3, px + rand(-8, 8), (hh * 2) / 3, px + rand(-6, 6), hh); x.stroke(); }
      });
      const timber = new THREE.MeshStandardMaterial({ map: grain, bumpMap: grain, bumpScale: 1.2, roughness: 0.7 });
      const bannerAng = -Math.PI / 2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + Math.PI / 12;
        if (Math.abs(Math.atan2(Math.sin(a - bannerAng), Math.cos(a - bannerAng))) < 0.1) continue;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 8, 0.42), timber);
        post.position.set(Math.cos(a) * 12.6, 4, Math.sin(a) * 12.6);
        post.rotation.y = -a;
        post.castShadow = true;
        s.add(post);
      }
      const ringBeam = new THREE.Mesh(new THREE.TorusGeometry(12.55, 0.22, 6, 96), timber);
      ringBeam.rotation.x = Math.PI / 2;
      ringBeam.position.y = 7.6;
      s.add(ringBeam);
      for (let i = 0; i < 6; i++) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(25.2, 0.34, 0.3), timber);
        beam.position.y = 7.9;
        beam.rotation.y = (i / 6) * Math.PI;
        s.add(beam);
      }
      const ceilTex = drawTexture(512, 512, (x, w) => {
        x.fillStyle = '#1a110b'; x.fillRect(0, 0, w, w);
        for (let y = 0; y < w; y += 64) for (let px = 0; px < w; px += 64) {
          const l = rand(28, 44);
          x.fillStyle = `rgb(${l},${l * 0.68},${l * 0.45})`; x.fillRect(px + 5, y + 5, 54, 54);
          x.strokeStyle = 'rgba(8,5,3,0.8)'; x.lineWidth = 3; x.strokeRect(px + 5, y + 5, 54, 54);
        }
      });
      ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
      ceilTex.repeat.set(4, 4);
      const ceiling = new THREE.Mesh(new THREE.CircleGeometry(13, 64), new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9, side: THREE.DoubleSide }));
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = 8.1;
      s.add(ceiling);
      // paper lanterns hanging low between the plinths, one warm light among them
      const paper = drawTexture(128, 128, (x, w) => {
        const g = x.createLinearGradient(0, 0, 0, w); g.addColorStop(0, '#e8c898'); g.addColorStop(0.5, '#fff0d4'); g.addColorStop(1, '#e8c898');
        x.fillStyle = g; x.fillRect(0, 0, w, w);
        x.strokeStyle = 'rgba(110,70,36,0.45)'; x.lineWidth = 2;
        for (let y = 8; y < w; y += 12) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
      });
      const prof = [];
      for (let i = 0; i <= 12; i++) { const y = -0.3 + (i / 12) * 0.6; prof.push(new THREE.Vector2(0.12 + Math.cos((y / 0.3) * Math.PI / 2) * 0.16, y)); }
      const lgeo = new THREE.LatheGeometry(prof, 20);
      const lmat = new THREE.MeshStandardMaterial({ map: paper, emissive: 0xffa050, emissiveMap: paper, emissiveIntensity: 0.9, roughness: 0.8 });
      const cord = new THREE.MeshBasicMaterial({ color: 0x0a0806 });
      [[-7, -6], [7, -6], [-8, 5], [8, 5]].forEach(([lx, lz]) => {
        const l = new THREE.Mesh(lgeo, lmat);
        l.position.set(lx, 5.2, lz);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.6, 4), cord);
        c.position.set(lx, 6.8, lz);
        s.add(l, c);
      });
      const warm = new THREE.PointLight(0xffa860, 7, 16, 1.6);
      warm.position.set(0, 5, -4);
      s.add(warm);
    }

    // the Uchiha crest on a hanging banner behind the display
    const banner = drawTexture(256, 512, (x, w, hh) => {
      x.fillStyle = '#16100e'; x.fillRect(0, 0, w, hh);
      x.strokeStyle = '#3a2a20'; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, hh - 16);
      const cx = w / 2, cy = hh * 0.38, r = w * 0.3;
      x.fillStyle = '#e8e0d4'; x.fillRect(cx - 10, cy + r * 0.6, 20, r * 1.6);
      x.fillStyle = '#b3121c'; x.beginPath(); x.arc(cx, cy, r, Math.PI, 0); x.closePath(); x.fill();
      x.fillStyle = '#e8e0d4'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI); x.closePath(); x.fill();
    });
    const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4), new THREE.MeshStandardMaterial({ map: banner, roughness: 0.95 }));
    bannerMesh.position.set(0, 4.3, -12.7);
    s.add(bannerMesh);
    const bannerLight = new THREE.SpotLight(0xffd8b0, 25, 14, 0.35, 0.6, 1.5);
    bannerLight.position.set(0, 7.5, -8);
    bannerLight.target = bannerMesh;
    s.add(bannerLight);
    // dust drifting through the shafts of light
    this.dust = new ParticlePool({ count: 300, drag: 0.5, turbulence: 0.3, softness: 2 });
    s.add(this.dust.points);
    this.dustColor = new THREE.Color(0xffe6c8);

    this.carousel = new THREE.Group();
    s.add(this.carousel);

    const builders = {
      headband: () => this._headband(),
      ring: () => this._ring(),
      kunai: () => this._kunai(),
      shuriken: () => this._shuriken(),
      dango: () => this._dango(),
      cloud: () => this._cloud(),
    };

    const stoneTex = drawTexture(512, 512, (x, w) => {
      // dark granite: a speckle of grains, a few pale veins
      x.fillStyle = '#3a3638'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 16000; i++) { const l = rand(30, 120); x.fillStyle = `rgba(${l},${l * 0.98},${l},${rand(0.3, 0.8)})`; x.fillRect(rand(0, w), rand(0, w), rand(1, 3), rand(1, 3)); }
      for (let i = 0; i < 5; i++) {
        let px = rand(0, w), py = rand(0, w);
        x.strokeStyle = 'rgba(170,165,160,0.18)'; x.lineWidth = rand(0.8, 2);
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 10; k++) { px += rand(-20, 60); py += rand(-30, 30); x.lineTo(px, py); }
        x.stroke();
      }
    });
    const pedMat = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 0.6, roughness: 0.72, metalness: 0 });
    // the cushion each relic rests above: deep plum silk with a soft sheen
    const silkMat = new THREE.MeshPhysicalMaterial({ color: 0x2a0f22, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0x9a5a80), sheenRoughness: 0.35 });
    const tasselMat = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.9, roughness: 0.35, emissive: 0xff9a40, emissiveIntensity: 0 });
    // a shaft of light in dusty air: faint, soft at its edges, fading out toward the source and the floor
    const beamMat = () => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color(0xffe2c0) }, uAmt: { value: 0.04 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uAmt; varying vec2 vUv; varying vec3 vN, vV; void main(){ float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.2); float along = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.55, vUv.y); gl_FragColor = vec4(uCol * edge * along * uAmt, 1.0); }',
    });
    this.items = RELICS.map((r, i) => {
      const a = (i / RELICS.length) * TAU;
      const holder = new THREE.Group();
      holder.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
      holder.rotation.y = a;
      const ped = new THREE.Group();
      const foot = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.16, 1.3, 2, 0.03), pedMat);
      foot.position.y = 0.08;
      const col = new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.66, 0.96, 2, 0.025), pedMat);
      col.position.y = 0.47;
      const top = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.1, 1.2, 2, 0.03), pedMat);
      top.position.y = 0.85;
      // a zabuton-like cushion, plumped in the middle, gold tassels at the corners
      const cushGeo = new RoundedBoxGeometry(0.9, 0.12, 0.9, 4, 0.05);
      const cp = cushGeo.attributes.position;
      for (let v = 0; v < cp.count; v++) {
        const cx = cp.getX(v) / 0.45, cz = cp.getZ(v) / 0.45;
        if (cp.getY(v) > 0) cp.setY(v, cp.getY(v) + 0.05 * Math.max(0, 1 - cx * cx) * Math.max(0, 1 - cz * cz));
      }
      cushGeo.computeVertexNormals();
      const cushion = new THREE.Mesh(cushGeo, silkMat);
      cushion.position.y = 0.96;
      ped.add(foot, col, top, cushion);
      for (const [tx, tz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 6), tasselMat);
        tassel.position.set(tx * 0.44, 0.9, tz * 0.44);
        ped.add(tassel);
      }
      // a brass rim round the top slab: it warms when the relic is chosen
      // set into the slab's edge so it shows only as a thin gold band
      const ring = new THREE.Mesh(new THREE.BoxGeometry(1.225, 0.028, 1.225), brass.clone());
      ring.position.y = 0.86;
      // the shaft of light falling on the relic from above
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.85, 6.5, 32, 1, true), beamMat());
      halo.position.y = 0.9 + 3.25;
      const obj = builders[r.key]();
      const spin = new THREE.Group();
      spin.add(obj);
      spin.position.y = 1.65;
      holder.add(ped, ring, halo, spin);
      holder.traverse((o) => { o.userData.index = i; if (o.isMesh && o !== halo) { o.castShadow = true; o.receiveShadow = true; } });
      this.carousel.add(holder);
      return { holder, spin, obj, ring, halo, baseY: 1.65, rx: 0, ry: 0 };
    });

    this.sparks = new ParticlePool({ count: 400, drag: 1.2, gravity: -1.5 });
    s.add(this.sparks.points);
    this.sparkColors = [new THREE.Color(0xffd0a0), new THREE.Color(0xff4040)];

    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.lookAt = new THREE.Vector3(0, 1.2, 0);
    this._buildUI();
    this._select(0, false);
  }

  /* ---------- procedural relics ---------- */

  _metal(color = 0x9aa0a8, rough = 0.3) {
    return new THREE.MeshStandardMaterial({ color, metalness: 0.95, roughness: rough });
  }

  _headband() {
    const g = new THREE.Group();
    const tex = drawTexture(512, 200, (x, w, hh) => {
      const gr = x.createLinearGradient(0, 0, 0, hh);
      gr.addColorStop(0, '#c9ced6'); gr.addColorStop(0.5, '#9aa0a8'); gr.addColorStop(1, '#5f656d');
      x.fillStyle = gr; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${rand(0, 0.06)})`; x.fillRect(rand(0, w), rand(0, hh), rand(10, 60), 1); }
      x.fillStyle = '#2d3036';
      for (const [cx, cy] of [[22, 22], [w - 22, 22], [22, hh - 22], [w - 22, hh - 22]]) { x.beginPath(); x.arc(cx, cy, 8, 0, TAU); x.fill(); }
      drawLeaf(x, w / 2, hh / 2, 52, { color: '#2a2d33', width: 11, scratch: true });
    });
    const brushed = drawTexture(256, 64, (x, w, hh) => {
      x.fillStyle = '#808080'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 700; i++) { const l = rand(90, 170); x.fillStyle = `rgba(${l},${l},${l},0.35)`; x.fillRect(rand(0, w), rand(0, hh), rand(20, 90), 1); }
    }, false);
    const plateGeo = new RoundedBoxGeometry(1.5, 0.52, 0.05, 4, 0.02);
    {
      // bent to the curve of a forehead
      const pp = plateGeo.attributes.position;
      for (let v = 0; v < pp.count; v++) { const px = pp.getX(v); pp.setZ(v, pp.getZ(v) - px * px * 0.16); }
      plateGeo.computeVertexNormals();
    }
    const steel = new THREE.MeshStandardMaterial({ color: 0xa4aab2, metalness: 0.9, roughness: 0.38, roughnessMap: brushed });
    const plate = new THREE.Mesh(plateGeo, steel);
    // the engraved face sits just proud of the plate, following its curve
    const faceGeo = new THREE.PlaneGeometry(1.46, 0.48, 24, 1);
    {
      const fp = faceGeo.attributes.position;
      for (let v = 0; v < fp.count; v++) { const px = fp.getX(v); fp.setZ(v, 0.027 - px * px * 0.16); }
      faceGeo.computeVertexNormals();
    }
    const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.75, roughness: 0.4, roughnessMap: brushed }));
    g.add(plate, face);
    // cloth: dark navy, a visible weave
    const weave = drawTexture(128, 128, (x, w) => {
      x.fillStyle = '#1e2a44'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < w; i += 3) { x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(i, 0, 1, w); x.fillStyle = 'rgba(120,140,190,0.07)'; x.fillRect(0, i, w, 1); }
    });
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.repeat.set(6, 1);
    const cloth = new THREE.MeshPhysicalMaterial({ map: weave, roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color(0x3a4a70), side: THREE.DoubleSide });
    // the band runs from the plate's ends round the back of the head, narrower than the plate
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.4, 48, 1, true, Math.PI * 0.26, Math.PI * 1.48), cloth);
    band.position.z = -0.62;
    g.add(band);
    // the knot at the back
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), cloth);
    knot.scale.set(1.3, 0.9, 0.8);
    knot.position.set(0, -0.02, -1.36);
    g.add(knot);
    for (const sgn of [-1, 1]) {
      const tailGeo = new THREE.PlaneGeometry(0.22, 1.1, 1, 10);
      const pos = tailGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getY(i) + 0.55) * 3) * 0.12);
      tailGeo.computeVertexNormals();
      const tail = new THREE.Mesh(tailGeo, cloth);
      tail.position.set(sgn * 0.12, -0.5, -1.38);
      tail.rotation.z = sgn * 0.25;
      g.add(tail);
    }
    g.scale.setScalar(0.85);
    return g;
  }

  _ring() {
    const g = new THREE.Group();
    const gold = this._metal(0xb8914a, 0.34);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.075, 24, 80), gold);
    g.add(band);
    const faceTex = drawTexture(256, 256, (x, w) => {
      const gr = x.createRadialGradient(w / 2, w / 2, 10, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#e0303e'); gr.addColorStop(1, '#6d0010');
      x.fillStyle = gr; x.fillRect(0, 0, w, w);
      x.fillStyle = '#f7ecd8';
      x.font = '900 170px "Noto Serif JP"'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('朱', w / 2, w / 2 + 8);
    });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.12, 40), [
      gold,
      new THREE.MeshPhysicalMaterial({ map: faceTex, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15 }),
      gold,
    ]);
    face.position.y = 0.5;
    face.rotation.y = -Math.PI / 2;
    g.add(face);
    g.rotation.x = 0.5;
    return g;
  }

  _kunai() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.0); shape.lineTo(0.2, 0.26); shape.lineTo(0.06, 0); shape.lineTo(-0.06, 0); shape.lineTo(-0.2, 0.26); shape.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 }), this._metal(0x50555c, 0.42)); // worn, not mirror-polished: it doesn't flare under the spotlight
    blade.position.z = -0.01;
    g.add(blade);
    const wrapTex = drawTexture(64, 256, (x, w, hh) => {
      x.fillStyle = '#2a1d16'; x.fillRect(0, 0, w, hh);
      for (let y = 0; y < hh; y += 16) { x.fillStyle = '#4a3528'; x.save(); x.translate(0, y); x.rotate(-0.25); x.fillRect(-10, 0, w + 20, 8); x.restore(); }
    });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.55, 12), new THREE.MeshStandardMaterial({ map: wrapTex, roughness: 0.9 }));
    handle.position.y = -0.27;
    g.add(handle);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 10, 32), this._metal(0x5a5f68, 0.3));
    loop.position.y = -0.64;
    g.add(loop);
    g.position.y = -0.1;
    g.rotation.z = 0.35;
    return g;
  }

  _shuriken() {
    const shape = new THREE.Shape();
    const outer = 0.7, inner = 0.17;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 2;
      const r = i % 2 ? inner : outer;
      i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.08, 0, TAU, true);
    shape.holes.push(hole);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2 }), this._metal(0x60656e, 0.25));
    m.geometry.center();
    return m;
  }

  _dango() {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0xc8a574, roughness: 0.9 }));
    g.add(stick);
    [0xf4a7b9, 0xf6f1e7, 0x8fbf6a].forEach((c, i) => {
      const geo = new THREE.SphereGeometry(0.22, 32, 24);
      const gp = geo.attributes.position;
      for (let v = 0; v < gp.count; v++) {
        const k = 1 + Math.sin(gp.getX(v) * 23 + i) * Math.sin(gp.getZ(v) * 19) * 0.012;
        gp.setXYZ(v, gp.getX(v) * k, gp.getY(v) * k, gp.getZ(v) * k);
      }
      geo.computeVertexNormals();
      const b = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.7, metalness: 0, sheen: 0.25, sheenColor: new THREE.Color(0xf0e8e0), sheenRoughness: 0.7 }));
      b.position.y = 0.45 - i * 0.4;
      b.scale.y = 0.92;
      g.add(b);
    });
    g.rotation.z = -0.3;
    return g;
  }

  _cloud() {
    const g = new THREE.Group();
    const tex = drawTexture(512, 512, (x, w) => {
      // heavy black cloth with a fine twill
      x.fillStyle = '#121016'; x.fillRect(0, 0, w, w);
      for (let i = -w; i < w; i += 4) { x.strokeStyle = 'rgba(60,56,70,0.18)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + w, w); x.stroke(); }
      for (let i = 0; i < 3000; i++) { const l = rand(0, 40); x.fillStyle = `rgba(${l},${l},${l + 6},0.25)`; x.fillRect(rand(0, w), rand(0, w), 1, 1); }
      drawAkatsukiCloud(x, w / 2, w / 2, w * 0.36);
      // the print has worn a little with the cloth
      for (let i = 0; i < 1400; i++) { x.fillStyle = 'rgba(18,16,22,0.2)'; x.fillRect(rand(w * 0.1, w * 0.9), rand(w * 0.25, w * 0.75), rand(1, 3), 1); }
    });
    // a square of cloth, draped in soft folds
    const geo = new THREE.PlaneGeometry(1.5, 1.5, 40, 40);
    const pp = geo.attributes.position;
    for (let v = 0; v < pp.count; v++) {
      const px = pp.getX(v), py = pp.getY(v);
      const fold = Math.sin(px * 5.2 + py * 1.2) * 0.085 + Math.sin(py * 3.4 - px * 0.8) * 0.05 + Math.sin(px * 11 - py * 2) * 0.015;
      const ex = Math.max(0, Math.abs(px) - 0.4), ey = Math.max(0, Math.abs(py) - 0.45);
      const droop = -(ex * ex * 0.5 + ey * ey * 0.3);
      pp.setZ(v, fold + droop);
    }
    geo.computeVertexNormals();
    const front = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.82, sheen: 0.5, sheenColor: new THREE.Color(0x40384a), side: THREE.FrontSide }));
    const lining = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x6a0c14, roughness: 0.5, sheen: 0.8, sheenColor: new THREE.Color(0xc03040), side: THREE.BackSide }));
    g.add(front, lining);
    g.scale.setScalar(0.85);
    return g;
  }

  /* ---------- UI ---------- */

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 遺品',
      jp: '遺品',
      title: 'The <em>Relics</em>',
      desc: 'Six objects that tell the story of a shinobi who belonged to two worlds. Rotate the altar, pick a relic, and turn it in your hands.',
      extra: [this.gestures([['swipe', '<b>Flick</b> to spin the altar'], ['tap', '<b>Tap</b> a relic to lift it'], ['drag', '<b>Drag</b> to turn it in your hands']])],
    });
    this.card = h('div.card.pe.hidden', {},
      h('button.close', { type: 'button', 'aria-label': 'Close', html: '×', onclick: () => this.unfocus() }),
      h('div.card-jp'), h('h3'), h('p'), h('ul'));
    this.ui.append(this.card);
    this.ui.append(h('div.controls', {},
      this.button('←', () => this._select(this.front - 1)),
      this.button('Inspect', () => (this.focused >= 0 ? this.unfocus() : this.focus(this.front))),
      this.button('→', () => this._select(this.front + 1)),
    ));
    this.inspectBtn = this.ui.querySelectorAll('.controls .btn')[1];
  }

  _select(i, sound = true) {
    const n = this.items.length;
    const idx = ((i % n) + n) % n;
    // choose shortest rotation
    let target = -idx * (TAU / n);
    while (target - this.rotTarget > Math.PI) target -= TAU;
    while (target - this.rotTarget < -Math.PI) target += TAU;
    this.rotTarget = target;
    this.front = idx;
    if (this.focused >= 0) this.focus(idx);
    if (sound) this.app.sfx.swoosh();
  }

  focus(i) {
    if (i !== this.front) this._select(i, false);
    this.focused = i;
    const r = RELICS[i];
    const [, jp, title, p, ul] = this.card.children;
    jp.textContent = r.jp;
    title.textContent = r.name;
    p.textContent = r.text;
    ul.replaceChildren(...r.facts.map((f) => h('li', { text: f })));
    this.card.classList.remove('hidden');
    this.inspectBtn.textContent = 'Back';
    const it = this.items[i];
    it.rx = 0; it.ry = 0;
    this.sparks.burst(it.spin.getWorldPosition(new THREE.Vector3()), 50, { speed: 3, life: [0.4, 1], size: [0.03, 0.08], colors: this.sparkColors });
    this.app.sfx.chime();
  }

  unfocus() {
    this.focused = -1;
    this.card.classList.add('hidden');
    this.inspectBtn.textContent = 'Inspect';
  }

  exit() {
    this.unfocus();
  }

  /* ---------- input ---------- */

  _hitIndex() {
    const hit = this.app.raycast([this.carousel])[0];
    return hit ? hit.object.userData.index : -1;
  }

  pointerMove(p) {
    if (p.down && p.moved > 6) {
      if (this.focused >= 0) {
        const it = this.items[this.focused];
        it.ry += p.dx * 0.012;
        it.rx += p.dy * 0.012;
        this.spinVel = p.dx * 0.012 * 60;
      } else {
        this.rotTarget += p.dx * 0.006;
        this.rotVel = p.dx * 0.006 * 60;
        this.dragging = true;
      }
      return;
    }
    const i = this._hitIndex();
    this.hoverIndex = i;
    this.app.setHover(i >= 0);
  }

  pointerUp() {
    if (this.dragging) {
      this.dragging = false;
      // flick: keep spinning with momentum, then settle on the nearest relic
      this.coast = clamp(this.rotVel || 0, -14, 14);
      this.rotVel = 0;
      if (Math.abs(this.coast) < 0.6) this._snap();
      else this.app.sfx.swoosh();
    }
  }

  _snap() {
    this.coast = 0;
    const n = this.items.length;
    const idx = Math.round(-this.rotTarget / (TAU / n));
    this.rotTarget = -idx * (TAU / n);
    this.front = ((idx % n) + n) % n;
    this.app.sfx.hover();
  }

  click() {
    const i = this._hitIndex();
    if (i < 0) {
      if (this.focused >= 0) this.unfocus();
      return;
    }
    if (i === this.front) this.focus(i);
    else {
      this._select(i);
      this.focus(i);
    }
  }

  key(e) {
    if (e.key === 'Escape' && this.focused >= 0) { this.unfocus(); return true; }
    return false;
  }

  update(dt, t) {
    if (this.coast) {
      this.rotTarget += this.coast * dt;
      this.coast *= Math.exp(-2.4 * dt);
      if (Math.abs(this.coast) < 0.5) this._snap();
    }
    if (this.spinVel && this.focused >= 0 && !this.app.pointer.down) {
      this.items[this.focused].ry += this.spinVel * dt;
      this.spinVel *= Math.exp(-1.8 * dt);
      if (Math.abs(this.spinVel) < 0.05) this.spinVel = 0;
    }
    this.rot = damp(this.rot, this.rotTarget, 6, dt);
    this.carousel.rotation.y = this.rot;

    this.items.forEach((it, i) => {
      const isFocus = i === this.focused;
      const isHover = i === this.hoverIndex;
      it.spin.position.y = it.baseY + Math.sin(t * 1.4 + i) * 0.08 + (isFocus ? 0.35 : 0);
      if (isFocus) {
        // on a phone, tilting turns the relic you are holding to show its sides
        const gyro = this.app.gyro;
        it.spin.rotation.y = damp(it.spin.rotation.y, it.ry + t * 0.15 + (gyro ? gyro.x * 1.1 : 0), 8, dt);
        it.spin.rotation.x = damp(it.spin.rotation.x, it.rx + (gyro ? gyro.y * 0.6 : 0), 8, dt);
      } else {
        it.spin.rotation.y += dt * (isHover ? 1.8 : 0.5);
        it.spin.rotation.x = damp(it.spin.rotation.x, 0, 3, dt);
      }
      const s = isFocus ? 1.45 : isHover ? 1.4 : 1.25;
      it.spin.scale.setScalar(damp(it.spin.scale.x, s, 8, dt));
      const beam = it.halo.material.uniforms.uAmt;
      beam.value = damp(beam.value, isFocus ? 0.075 : isHover ? 0.055 : 0.035, 6, dt);
      it.ring.material.emissiveIntensity = damp(it.ring.material.emissiveIntensity, isFocus ? 0.5 : isHover ? 0.3 : 0, 6, dt);
      // dust turning in the chosen relic's light
      if (isFocus && Math.random() < dt * 30) {
        const wp = it.holder.getWorldPosition(new THREE.Vector3());
        this.dust.emit({ x: wp.x + rand(-0.6, 0.6), y: rand(1, 4.5), z: wp.z + rand(-0.6, 0.6), vx: rand(-0.05, 0.05), vy: rand(-0.06, 0.03), vz: rand(-0.05, 0.05), life: rand(3, 6), size: rand(0.012, 0.03), color: this.dustColor, alpha: 0.7 });
      }
    });

    // camera
    const aspect = this.app.width / this.app.height;
    const portrait = aspect < 0.9;
    if (this.focused >= 0) {
      this.camPos.set(0, portrait ? 2.8 : 2.4, R + (portrait ? 5.6 : 4.2));
      this.camTarget.set(portrait ? 0 : 1.1, portrait ? 1.35 : 1.95, R);
    } else {
      this.camPos.set(0, 3.0, R + (portrait ? 10 : 6.6));
      this.camTarget.set(portrait ? 0 : -1.2, 1.3, 0);
    }
    const px = this.app.isTouch ? 0 : this.app.pointer.ndc.x * 0.4;
    this.camera.position.x = damp(this.camera.position.x, this.camPos.x + px, 4, dt);
    this.camera.position.y = damp(this.camera.position.y, this.camPos.y, 4, dt);
    this.camera.position.z = damp(this.camera.position.z, this.camPos.z, 4, dt);
    this.lookAt.lerp(this.camTarget, 1 - Math.exp(-4 * dt));
    this.camera.lookAt(this.lookAt);
    this.dof = this.focused >= 0 ? { focus: this.camera.position.distanceTo(this.lookAt), aperture: 0.0012, maxblur: 0.007 } : null;

    this.sparks.update(dt, t);
    this.dust.update(dt, t);
  }
}
