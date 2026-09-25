import * as THREE from 'three';
import { mergeStatic } from '../core/mergeStatic.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Chapter } from '../core/Chapter.js';
import { ParticlePool } from '../objects/Particles.js';
import { createCrowGeometry, createCrowMaterial, addPhases } from '../objects/Crow.js';
import { nightSky, bloodMoon } from '../objects/Dusk.js';
import { wetGround, Bolt } from '../objects/Storm.js';
import { drawTexture, glowTexture, rand, damp, clamp, h, TAU } from '../core/utils.js';

/*
 * Memorial: an empty clan district at night, in rain. Nothing is shown of that night itself; the place
 * tells it. You walk down the one street; the lanterns ahead gutter out as you pass, a meal waits on a table
 * in an open doorway, a crow leaves the wall. Short passages, one per stretch of street, say what happened
 * and why. At the end you can relight the lanterns.
 */

// the story, told plainly, one passage per stretch of the street
const BEATS = [
  'This was the district of the Uchiha clan. Once these streets were full: families, a police force, children, festivals in summer.',
  'Over the years, distrust grew between the Uchiha and the village they had helped to found. The clan’s leaders began to plan a coup.',
  'A coup would have meant civil war, and with the other nations watching, a far larger war after it.',
  'The village elders gave one member of the clan, a boy of thirteen, an order: end it, in a single night.',
  'He did. He spared one person, his younger brother, and left the village as a traitor, carrying the truth alone.',
  'He kept that secret for the rest of his life, so the village would stay safe and his brother would never know.',
  'Places remember what people are made to forget. Light a lantern, if you wish.',
];
/*
 * The houses you can go into. Each is furnished for what it was, and says one thing about the clan's life,
 * in plain words. `icon` is drawn on the wooden sign over the door; `room` picks the furnishing.
 */
const HOUSES = [
  { name: 'The Police Station', room: 'office', icon: 'shield',
    text: 'The Uchiha ran the village\'s military police for generations. It gave them standing, and it also kept them apart, watching over the village from the outside.' },
  { name: 'A Family Home', room: 'home', icon: 'home',
    text: 'Most of the district was simply this: homes. Meals at a low table, children practising in the yard, the ordinary life of a large, proud family.' },
  { name: 'The Rice-Cracker Shop', room: 'shop', icon: 'bowl',
    text: 'The district had its own shops and stalls. Neighbours knew each other by name; for many, the rest of the village felt far away.' },
  { name: 'The Training Hall', room: 'dojo', icon: 'flame',
    text: 'Fire techniques ran deep in the clan. Mastering a great fireball was a rite of passage, and some members awakened the Sharingan, the clan\'s inherited eye, through intense emotion.' },
  { name: 'The Archive', room: 'archive', icon: 'scroll',
    text: 'The clan traced its line back to the village\'s founding, when it joined with the Senju. That old rivalry, and the mistrust that followed, never fully faded.' },
  { name: 'The Shrine Hall', room: 'shrine', icon: 'gate',
    text: 'The clan kept a shrine at the edge of the district. Beneath it, a hidden hall held a stone tablet that could only be read with the Sharingan. It was where the clan met in secret.' },
];
const START = 6, END = -66; // the street, in z
const STORM_AT = 0.86; // how far down the street the storm breaks
const STREET_W = 5.2;

/** Simple painted marks for the door signs. */
function drawIcon(x, kind, cx, cy, r) {
  x.beginPath();
  if (kind === 'shield') { x.moveTo(cx - r, cy - r); x.lineTo(cx + r, cy - r); x.lineTo(cx + r * 0.8, cy + r * 0.3); x.lineTo(cx, cy + r); x.lineTo(cx - r * 0.8, cy + r * 0.3); x.closePath(); x.stroke(); }
  else if (kind === 'home') { x.moveTo(cx - r, cy); x.lineTo(cx, cy - r); x.lineTo(cx + r, cy); x.moveTo(cx - r * 0.7, cy); x.lineTo(cx - r * 0.7, cy + r); x.lineTo(cx + r * 0.7, cy + r); x.lineTo(cx + r * 0.7, cy); x.stroke(); }
  else if (kind === 'bowl') { x.arc(cx, cy - r * 0.2, r, 0, Math.PI); x.closePath(); x.stroke(); }
  else if (kind === 'flame') { x.moveTo(cx, cy - r); x.quadraticCurveTo(cx + r, cy, cx, cy + r); x.quadraticCurveTo(cx - r, cy, cx, cy - r); x.stroke(); }
  else if (kind === 'scroll') { x.rect(cx - r, cy - r * 0.6, r * 2, r * 1.2); x.moveTo(cx - r * 0.6, cy - r * 0.2); x.lineTo(cx + r * 0.6, cy - r * 0.2); x.moveTo(cx - r * 0.6, cy + r * 0.2); x.lineTo(cx + r * 0.4, cy + r * 0.2); x.stroke(); }
  else if (kind === 'gate') { x.moveTo(cx - r * 1.1, cy - r * 0.7); x.lineTo(cx + r * 1.1, cy - r * 0.7); x.moveTo(cx - r * 0.8, cy - r * 0.3); x.lineTo(cx + r * 0.8, cy - r * 0.3); x.moveTo(cx - r * 0.6, cy - r * 0.7); x.lineTo(cx - r * 0.6, cy + r); x.moveTo(cx + r * 0.6, cy - r * 0.7); x.lineTo(cx + r * 0.6, cy + r); x.stroke(); }
}

/** A hip roof over a d×w footprint: two sloping trapezoids and two triangular ends meeting at a ridge. */
function hipRoof(d, w, rise) {
  const hx = d / 2, hz = w / 2, ridge = Math.max(0.2, hz - hx * 0.9);
  const v = [
    [-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz], // eaves corners
    [0, rise, -ridge], [0, rise, ridge], // ridge ends
  ];
  const faces = [[0, 3, 5], [0, 5, 4], [1, 4, 5], [1, 5, 2], [0, 4, 1], [3, 2, 5]];
  const pos = [], uv = [];
  for (const f of faces) for (const i of f) { pos.push(...v[i]); uv.push((v[i][0] + hx) / d * 3, (v[i][2] + hz) / w * 3 + v[i][1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export class Memorial extends Chapter {
  constructor(app) {
    super(app, { id: 'memorial', title: 'Memorial', jp: '追憶' });
    this.bloom = { strength: 0.7, radius: 0.55, threshold: 0.7 };
    this.mood = 'calm';
    this.trail = false;
    this.p = 0; // progress along the street, 0..1
    this.pt = 0;
    this.beat = -1;
    this.relit = 0;
  }

  build() {
    const s = this.scene;
    s.fog = new THREE.FogExp2(0x080b12, 0.045);
    s.add(new THREE.HemisphereLight(0x55607e, 0x100d0c, 1.25));
    const moonDir = new THREE.Vector3(0.35, 0.3, -1).normalize();
    const moon = new THREE.DirectionalLight(0xaebcdc, 0.95);
    moon.position.copy(moonDir).multiplyScalar(30);
    moon.castShadow = !this.app.low;
    Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 40, bottom: -40, near: 1, far: 90 });
    moon.target.position.set(0, 0, -30);
    s.add(moon, moon.target);
    this.sky = nightSky(moonDir.clone().multiplyScalar(60));
    s.add(this.sky);
    this.moon = bloodMoon(2.2, { pale: true });
    this.moonOffset = moonDir.clone().multiplyScalar(70);
    s.add(this.moon);

    // the street: wet stone, standing water that holds the lantern light
    const ground = wetGround(80);
    ground.position.z = -30;
    ground.material.envMapIntensity = 1.1;
    s.add(ground);
    // what the wet surfaces mirror: the night sky, and a warm band of lamplight low along the street
    {
      const pm = new THREE.PMREMGenerator(this.app.renderer);
      const env = new THREE.Scene();
      env.add(nightSky(moonDir.clone().multiplyScalar(40), 40));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 3, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x3a2412, side: THREE.BackSide }));
      band.position.y = 1.5;
      env.add(band);
      s.environment = pm.fromScene(env, 0.02).texture;
      s.environmentIntensity = 0.6;
      pm.dispose();
    }
    // stone curbs with a rain gutter along each side of the street
    const curbTex = drawTexture(256, 64, (x, w, hh) => {
      x.fillStyle = '#3a3836'; x.fillRect(0, 0, w, hh);
      for (let px = 0; px < w; px += rand(40, 70)) { x.fillStyle = 'rgba(10,10,10,0.8)'; x.fillRect(px, 0, 2, hh); }
      for (let i = 0; i < 500; i++) { const l = rand(40, 90); x.fillStyle = `rgba(${l},${l},${l},0.4)`; x.fillRect(rand(0, w), rand(0, hh), 2, 2); }
    });
    curbTex.wrapS = THREE.RepeatWrapping;
    curbTex.repeat.set(24, 1);
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.55 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x06080c, roughness: 0.05, metalness: 0.3 });
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, START - END + 16), curbMat);
      curb.position.set(side * (STREET_W - 0.95), 0.07, (START + END) / 2);
      const gutter = new THREE.Mesh(new THREE.PlaneGeometry(0.34, START - END + 16), waterMat);
      gutter.rotation.x = -Math.PI / 2;
      gutter.position.set(side * (STREET_W - 0.62), 0.01, (START + END) / 2);
      s.add(curb, gutter);
    }

    this.statics = []; // what never moves: merged into a few meshes once the street is built
    this._buildHouses(s);
    this._buildLanterns(s);
    this._buildMeal(s);
    this._buildCrow(s);
    this._buildStorm(s);
    this._buildStreetLife(s);
    this._buildDistance(s);
    this._buildRainDetail(s);
    mergeStatic(s, this.statics);
    this.statics = null;

    // rain: long streaks around the walker, and a mist of spray at the ground
    const n = this.app.low ? 900 : 2000;
    const g = new THREE.BufferGeometry();
    this.rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) this._drop(i, true);
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8f9ab4, transparent: true, opacity: 0.28, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rainN = n;
    s.add(this.rain);
    this.splash = new ParticlePool({ count: 300, gravity: -6, drag: 0.8, softness: 1.5 });
    s.add(this.splash.points);
    this.splashColor = new THREE.Color(0xb8c4dc);

    const mistTex = drawTexture(128, 128, (x, w) => {
      const gr = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, w, w);
    });
    this.mist = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(7, 12), rand(1.5, 2.8)), new THREE.MeshBasicMaterial({ map: mistTex, color: 0x7888a8, transparent: true, opacity: rand(0.04, 0.08), depthWrite: false }));
      m.position.set(rand(-3, 3), rand(0.4, 1.1), rand(END, START));
      m.userData.vx = rand(0.05, 0.18) * (Math.random() < 0.5 ? -1 : 1);
      s.add(m);
      this.mist.push(m);
    }

    this.camera.position.set(0, 1.6, START);
    this._buildUI();
  }

  /** Two rows of dark wooden houses: plaster panels in a timber frame, tiled hip roofs, closed shutters. */
  _buildHouses(s) {
    const wallTex = drawTexture(512, 256, (x, w, hh) => {
      x.fillStyle = '#6a6258'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 3000; i++) { const l = rand(70, 115); x.fillStyle = `rgba(${l},${l * 0.95},${l * 0.88},0.3)`; x.fillRect(rand(0, w), rand(0, hh), rand(1, 3), rand(1, 3)); }
      // rain streaks down the plaster
      for (let i = 0; i < 60; i++) { const g = x.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, 'rgba(30,28,26,0.35)'); g.addColorStop(1, 'rgba(30,28,26,0)'); x.fillStyle = g; x.fillRect(rand(0, w), 0, rand(2, 8), rand(60, hh)); }
      // the timber frame
      x.fillStyle = '#231a14';
      for (const px of [0, w / 3, (2 * w) / 3, w - 14]) x.fillRect(px, 0, 14, hh);
      x.fillRect(0, 0, w, 14); x.fillRect(0, hh * 0.55, w, 10); x.fillRect(0, hh - 18, w, 18);
      // closed wooden shutters on the lower half
      x.fillStyle = '#2c231c';
      x.fillRect(w / 3 + 20, hh * 0.6, w / 3 - 40, hh * 0.35);
      x.strokeStyle = 'rgba(10,8,6,0.8)'; x.lineWidth = 2;
      for (let px = w / 3 + 30; px < (2 * w) / 3 - 20; px += 12) { x.beginPath(); x.moveTo(px, hh * 0.6); x.lineTo(px, hh * 0.95); x.stroke(); }
    });
    wallTex.wrapS = THREE.RepeatWrapping;
    const tileTex = drawTexture(256, 256, (x, w) => {
      x.fillStyle = '#1c1d22'; x.fillRect(0, 0, w, w);
      for (let y = 0; y < w; y += 16) {
        x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, y, w, 3);
        for (let px = (y / 16) % 2 ? 0 : 12; px < w; px += 24) { x.fillStyle = `rgba(${rand(40, 70)},${rand(42, 72)},${rand(50, 80)},0.5)`; x.fillRect(px, y + 3, 20, 12); }
      }
    });
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
    const lattice = drawTexture(256, 128, (x, w, hh) => {
      x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 800; i++) { x.fillStyle = `rgba(160,140,110,${rand(0.05, 0.2)})`; x.fillRect(rand(0, w), rand(0, hh), rand(1, 4), rand(1, 4)); }
      x.fillStyle = '#1e1610';
      for (let px = 0; px < w; px += 9) x.fillRect(px, 0, 5, hh); // the vertical slats
      x.fillRect(0, 0, w, 8); x.fillRect(0, hh - 8, w, 8); x.fillRect(0, hh / 2 - 3, w, 6);
    });
    const latticeDark = new THREE.MeshStandardMaterial({ map: lattice, color: 0x3a3430, roughness: 0.9 });
    const latticeLit = new THREE.MeshStandardMaterial({ map: lattice, color: 0x3a3430, emissive: 0xff9a50, emissiveMap: lattice, emissiveIntensity: 0.18, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.4, metalness: 0.1, color: 0x9aa0b0, side: THREE.DoubleSide });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3c3a38, roughness: 0.95 });
    const soffitMat = new THREE.MeshStandardMaterial({ color: 0x120e0c, roughness: 1, side: THREE.DoubleSide });
    this.windows = [];
    const built = [];
    const winMat = () => new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0 });
    for (const side of [-1, 1]) {
      for (let z = START - 4; z > END - 6; z -= rand(6.5, 8.5)) {
        const w = rand(5.5, 7), d = rand(5, 6.5), hh = rand(2.6, 3.4);
        const g = new THREE.Group();
        // a stone footing, the house on it
        const foot = new THREE.Mesh(new THREE.BoxGeometry(d + 0.3, 0.4, w + 0.3), stoneMat);
        foot.position.y = 0.2;
        const body = new THREE.Mesh(new THREE.BoxGeometry(d, hh, w), wallMat);
        body.position.y = 0.4 + hh / 2;
        body.castShadow = body.receiveShadow = true;
        // a hip roof with deep eaves reaching out over the street
        const roof = new THREE.Mesh(hipRoof(d + 1.5, w + 1.1, 1.5), roofMat);
        roof.position.y = 0.4 + hh - 0.05;
        roof.castShadow = true;
        // the eaves' shadowed underside, and a fascia board along the edge
        const soffit = new THREE.Mesh(new THREE.PlaneGeometry(d + 1.5, w + 1.1), soffitMat);
        soffit.rotation.x = Math.PI / 2;
        soffit.position.y = 0.4 + hh - 0.06;
        // the latticed street front (koshi): slats over paper, dark or faintly lit from inside
        const litInside = Math.random() < 0.3;
        const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, hh * 0.62), litInside ? latticeLit : latticeDark);
        front.position.set(-side * (d / 2 + 0.02), 0.4 + hh * 0.34, 0);
        front.rotation.y = -side * Math.PI / 2;
        g.add(foot, body, roof, soffit, front);
        // an upper window: once lit, it dims as you come near and goes dark
        if (Math.random() < 0.5) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), winMat());
          win.position.set(-side * (d / 2 + 0.01), 0.4 + hh * 0.78, rand(-w / 4, w / 4));
          win.rotation.y = -side * Math.PI / 2;
          win.userData.keep = true; // it fades on its own
          g.add(win);
          this.windows.push({ mesh: win, z });
        }
        g.position.set(side * (STREET_W + d / 2), 0, z);
        s.add(g);
        built.push({ g, side, z, d, w, hh });
        this.statics.push(g);
      }
    }
    this._buildDoors(s, built);
    this.banners = [];

    // at the far end, a gate closing the street, dark against the sky
    const post = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9 });
    for (const sx of [-2.4, 2.4]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.2, 0.4), post);
      p.position.set(sx, 2.1, END - 4);
      s.add(p);
      this.statics.push(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.4, 0.6), post);
    beam.position.set(0, 4.3, END - 4);
    s.add(beam);
    this.statics.push(beam);
    // the gate stands in a wall: plaster on a stone footing, a small tiled roof along the top, running
    // from each gate post out to the houses on either side
    for (const side of [-1, 1]) {
      const x0 = 2.6, x1 = STREET_W + 1.2, len = x1 - x0, cx = side * (x0 + len / 2), wz = END - 4;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.55), stoneMat);
      foot.position.set(cx, 0.175, wz);
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, 1.85, 0.4), wallMat);
      body.position.set(cx, 0.35 + 0.925, wz);
      body.castShadow = body.receiveShadow = true;
      // the coping: a narrow gabled roof of tiles with a short overhang each side
      const cap = new THREE.Mesh(hipRoof(0.8, len + 0.2, 0.28), roofMat);
      cap.rotation.y = Math.PI / 2;
      cap.position.set(cx, 0.35 + 1.85, wz);
      cap.castShadow = true;
      s.add(foot, body, cap);
      this.statics.push(foot, body, cap);
    }
    // a low plastered wall between two houses, where the crow waits
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 5), wallMat);
    wall.position.set(-STREET_W + 0.1, 0.8, -28);
    s.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 5.2), roofMat);
    cap.position.set(-STREET_W + 0.1, 1.7, -28);
    s.add(cap);
    this.statics.push(wall, cap);
  }

  /** Six houses get a lit sliding door and a hanging wooden sign; each opens onto its own room. */
  _buildDoors(s, built) {
    // spread the six along the street, alternating sides
    const pick = [];
    const bySide = { '-1': built.filter((b) => b.side < 0), '1': built.filter((b) => b.side > 0) };
    for (let i = 0; i < HOUSES.length; i++) {
      const list = bySide[i % 2 ? '1' : '-1'];
      pick.push(list[Math.min(list.length - 1, 1 + Math.floor((i / 2) * (list.length - 2) / 3))]);
    }
    const doorTex = drawTexture(128, 256, (x, w, hh) => {
      x.fillStyle = '#f0dcb4'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(200,160,110,${rand(0.05, 0.2)})`; x.fillRect(rand(0, w), rand(0, hh), rand(1, 5), 1); }
      x.fillStyle = '#2a1c12';
      x.fillRect(0, 0, w, 10); x.fillRect(0, hh - 10, w, 10); x.fillRect(0, 0, 10, hh); x.fillRect(w - 10, 0, 10, hh);
      for (let px = 10; px < w; px += 30) x.fillRect(px, 0, 4, hh);
      for (let y = 10; y < hh; y += 36) x.fillRect(0, y, w, 4);
    });
    this.doors = pick.map((b, i) => {
      const info = HOUSES[i];
      const mat = new THREE.MeshStandardMaterial({ map: doorTex, emissive: 0xffb070, emissiveMap: doorTex, emissiveIntensity: 0.55, roughness: 0.9 });
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.0), mat);
      const lz = -b.w / 4;
      door.position.set(-b.side * (b.d / 2 + 0.035), 0.4 + 1.0, lz);
      door.rotation.y = -b.side * Math.PI / 2;
      // the wooden sign hanging over it, with a simple painted mark
      const signTex = drawTexture(128, 64, (x, w, hh) => {
        x.fillStyle = '#5a3e26'; x.fillRect(0, 0, w, hh);
        for (let k = 0; k < 30; k++) { x.strokeStyle = 'rgba(40,24,12,0.4)'; x.beginPath(); const y = rand(0, hh); x.moveTo(0, y); x.lineTo(w, y + rand(-4, 4)); x.stroke(); }
        x.strokeStyle = x.fillStyle = '#efe4cc'; x.lineWidth = 4; x.lineCap = x.lineJoin = 'round';
        drawIcon(x, info.icon, w / 2, hh / 2, hh * 0.32);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }));
      sign.position.set(-b.side * (b.d / 2 + 0.06), 0.4 + 2.25, lz);
      sign.rotation.y = -b.side * Math.PI / 2;
      // behind the door, the lit doorway it uncovers as it slides open
      const opening = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.0), new THREE.MeshBasicMaterial({ color: 0x5a3418 }));
      opening.position.set(-b.side * (b.d / 2 + 0.015), 0.4 + 1.0, lz);
      opening.rotation.y = -b.side * Math.PI / 2;
      opening.userData.keep = door.userData.keep = sign.userData.keep = true; // the door slides; all three are its
      b.g.add(opening, door, sign);
      door.userData.house = i;
      const world = new THREE.Vector3();
      door.getWorldPosition(world);
      return { door, mat, info, z: b.z, world, baseZ: lz, open: 0, target: 0, dir: lz > 0 ? 1 : -1 };
    });
    // one interior, refurnished for whichever house you step into
    this.room = this._buildRoom(s);
    // inside a house the room's own lights join the scene's: compile for that too, so stepping in never stalls
    this.lightStates = [() => { this.room.R.visible = true; return () => { this.room.R.visible = false; }; }];
  }

  /** A single room far off the street; its furniture sets are swapped per house. */
  _buildRoom(s) {
    const R = new THREE.Group();
    R.position.set(200, 0, 0); // well away from the street and its rain
    R.visible = false;
    s.add(R);
    // --- materials: grain, plaster, paper, straw, all drawn so nothing reads as a flat colour ---
    const grain = (base, dark) => drawTexture(256, 512, (x, w, hh) => {
      x.fillStyle = base; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 90; i++) {
        x.strokeStyle = dark.replace('A', rand(0.15, 0.45).toFixed(2)); x.lineWidth = rand(0.6, 2.4);
        const px = rand(0, w); x.beginPath(); x.moveTo(px, 0);
        x.bezierCurveTo(px + rand(-10, 10), hh / 3, px + rand(-10, 10), (hh * 2) / 3, px + rand(-6, 6), hh); x.stroke();
      }
      for (let i = 0; i < 3; i++) { x.strokeStyle = dark.replace('A', '0.35'); x.lineWidth = 1.5; x.beginPath(); x.ellipse(rand(40, w - 40), rand(60, hh - 60), rand(6, 14), rand(20, 40), 0, 0, TAU); x.stroke(); } // knots
    });
    const woodTex = grain('#4a3020', 'rgba(20,12,6,A)');
    const darkTex = grain('#2a1c12', 'rgba(8,5,3,A)');
    const plasterTex = drawTexture(512, 512, (x, w) => {
      x.fillStyle = '#a89878'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 20000; i++) { const l = rand(130, 190); x.fillStyle = `rgba(${l},${l * 0.92},${l * 0.78},0.25)`; x.fillRect(rand(0, w), rand(0, w), 1.5, 1.5); } // sand in the clay
      for (let i = 0; i < 6; i++) { const cx = rand(0, w), cy = rand(0, w), r = rand(40, 120); const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(90,72,50,0.12)'); g.addColorStop(1, 'rgba(90,72,50,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }
    });
    const mat = (map, rough, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: rough, ...extra });
    const plaster = mat(plasterTex, 0.95, { bumpMap: plasterTex, bumpScale: 0.8 });
    const timber = mat(darkTex, 0.7, { bumpMap: darkTex, bumpScale: 0.6 });

    // --- floor: four full tatami and two half mats, each edged in dark cloth, laid in the proper pattern ---
    const tatamiTex = drawTexture(512, 1024, (x, w, hh) => {
      x.fillStyle = '#8c865a'; x.fillRect(0, 0, w, hh);
      for (let y = 0; y < hh; y += 2) { const l = rand(0.85, 1.12); x.fillStyle = `rgba(${130 * l | 0},${124 * l | 0},${80 * l | 0},0.8)`; x.fillRect(0, y, w, 1.4); }
      for (let px = 0; px < w; px += 12) { x.fillStyle = 'rgba(40,36,20,0.25)'; x.fillRect(px, 0, 1.5, hh); }
      x.fillStyle = '#16110c'; x.fillRect(0, 0, 22, hh); x.fillRect(w - 22, 0, 22, hh); // heri on the long sides
    });
    const matM = mat(tatamiTex, 0.85, { bumpMap: tatamiTex, bumpScale: 0.6 });
    for (const [mx, mz, rot] of [[-1.5, -1.5, 0], [1.5, -1.5, 0], [-0.75, 1.5, Math.PI / 2], [2.25, 1.5, Math.PI / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(rot ? 3 : 2.96, 0.05, rot ? 1.46 : 2.96), matM);
      m.position.set(mx, 0.025, mz);
      if (rot) m.rotation.y = rot;
      m.receiveShadow = true;
      R.add(m);
    }
    const under = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat(null, 1, { color: 0x120d09 }));
    under.rotation.x = -Math.PI / 2;
    R.add(under);

    // --- walls: clay plaster, a wooden rail (nageshi) all round, posts at the corners ---
    for (const [x, y, z, ry] of [[-3, 1.4, 0, Math.PI / 2], [0, 1.4, 3, Math.PI]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.8), plaster);
      w.position.set(x, y, z); w.rotation.y = ry; w.receiveShadow = true;
      R.add(w);
    }
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [-0.2, -3]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.8, 0.16), timber);
      post.position.set(x, 1.4, z); post.castShadow = true;
      R.add(post);
    }
    for (const [x, z, len, ry] of [[0, -2.96, 6, 0], [-2.96, 0, 6, Math.PI / 2], [2.96, 0, 6, Math.PI / 2], [0, 2.96, 6, 0]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.06), timber);
      rail.position.set(x, 2.05, z); rail.rotation.y = ry;
      R.add(rail);
    }

    // --- the back wall: an alcove (tokonoma) on the left, sliding paper doors (fusuma) on the right ---
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), plaster);
    back.position.set(-1.6, 1.4, -3); back.receiveShadow = true;
    const toko = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.8), mat(woodTex, 0.35, { color: 0x6a4a34 }));
    toko.position.set(-1.6, 0.07, -2.6); toko.receiveShadow = toko.castShadow = true;
    const fusumaTex = drawTexture(256, 512, (x, w, hh) => {
      x.fillStyle = '#d6cdb6'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(150,130,100,${rand(0.04, 0.12)})`; x.fillRect(rand(0, w), rand(0, hh), rand(2, 8), 1); }
      // a faint painted landscape: two misty ridges
      for (const [yy, a] of [[hh * 0.55, 0.12], [hh * 0.62, 0.18]]) { x.fillStyle = `rgba(60,64,70,${a})`; x.beginPath(); x.moveTo(0, hh); for (let px = 0; px <= w; px += 16) x.lineTo(px, yy + Math.sin(px * 0.03 + yy) * 18); x.lineTo(w, hh); x.fill(); }
      x.strokeStyle = '#1e140c'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, hh - 10);
      x.fillStyle = '#1a120a'; x.beginPath(); x.arc(w - 26, hh * 0.52, 9, 0, TAU); x.fill(); // the recessed pull
    });
    for (const fx of [0.75, 2.15]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.95), mat(fusumaTex, 0.9));
      f.position.set(fx, 0.98, -2.98);
      R.add(f);
    }
    // the lattice transom (ranma) above the doors
    const ranmaTex = drawTexture(256, 64, (x, w, hh) => {
      x.fillStyle = '#0c0806'; x.fillRect(0, 0, w, hh);
      x.fillStyle = '#3a2618';
      for (let px = 0; px < w; px += 10) x.fillRect(px, 0, 4, hh);
      x.fillRect(0, 0, w, 6); x.fillRect(0, hh - 6, w, 6);
    });
    const ranma = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), mat(ranmaTex, 0.8));
    ranma.position.set(1.45, 2.4, -2.98);
    R.add(back, toko, ranma);

    // --- ceiling: long boards with seams, crossed by a few battens ---
    const ceilTex = drawTexture(512, 512, (x, w) => {
      for (let px = 0; px < w; px += 64) { const l = rand(46, 62); x.fillStyle = `rgb(${l},${l * 0.7},${l * 0.48})`; x.fillRect(px, 0, 64, w); x.fillStyle = 'rgba(8,5,3,0.8)'; x.fillRect(px, 0, 2, w); }
      for (let i = 0; i < 60; i++) { x.strokeStyle = 'rgba(20,12,6,0.3)'; x.beginPath(); const px = rand(0, w); x.moveTo(px, 0); x.lineTo(px + rand(-6, 6), w); x.stroke(); }
    });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat(ceilTex, 0.9));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 2.8;
    R.add(ceil);
    for (let k = -2; k <= 2; k++) {
      const batten = new THREE.Mesh(new THREE.BoxGeometry(6, 0.05, 0.05), timber);
      batten.position.set(0, 2.77, k * 1.2);
      R.add(batten);
    }

    // --- the window wall: shoji of fine lattice, blue with the rainy night behind ---
    const shojiTex = drawTexture(256, 256, (x, w) => {
      x.fillStyle = '#c8ccd4'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(255,255,255,${rand(0.03, 0.1)})`; x.fillRect(rand(0, w), rand(0, w), rand(2, 7), 1); }
      x.fillStyle = '#2a1c12';
      for (let px = 0; px <= w; px += 42) x.fillRect(px, 0, 5, w);
      for (let y = 0; y <= w; y += 32) x.fillRect(0, y, w, 4);
    });
    shojiTex.wrapS = shojiTex.wrapT = THREE.RepeatWrapping;
    shojiTex.repeat.set(3, 2);
    const shoji = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.0), mat(shojiTex, 0.9, { emissive: 0x2a3a58, emissiveMap: shojiTex, emissiveIntensity: 0.55 }));
    shoji.position.set(2.98, 1.0, 0); shoji.rotation.y = -Math.PI / 2;
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 6), timber);
    sill.position.set(2.94, 0.04, 0);
    // plaster above the window, up to the ceiling
    const above = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.8), plaster);
    above.position.set(2.99, 2.4, 0); above.rotation.y = -Math.PI / 2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 6), timber);
    head.position.set(2.94, 2.0, 0);
    R.add(shoji, sill, above, head);
    // moonlight through the paper: cool, soft, from the window side
    const moonIn = new THREE.SpotLight(0x8898c8, 18, 12, 0.9, 1, 1.4);
    moonIn.position.set(5, 2.2, 0.5);
    moonIn.target.position.set(-1, 0, -0.5);
    R.add(moonIn, moonIn.target);

    // --- the alcove: the scroll of brushstrokes, and a vase with a bare branch ---
    const scrollTex = drawTexture(128, 384, (x, w, hh) => {
      x.fillStyle = '#e4dac2'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(160,140,100,${rand(0.05, 0.15)})`; x.fillRect(rand(0, w), rand(0, hh), rand(1, 4), 1); }
      x.fillStyle = '#3a2a1c'; x.fillRect(0, 0, w, 20); x.fillRect(0, hh - 24, w, 24);
      x.strokeStyle = 'rgba(20,16,12,0.85)'; x.lineCap = 'round';
      for (let i = 0; i < 5; i++) { x.lineWidth = rand(4, 9); x.beginPath(); const y = 60 + i * 56; x.moveTo(w / 2 - rand(10, 30), y); x.quadraticCurveTo(w / 2 + rand(-20, 20), y + rand(10, 30), w / 2 + rand(10, 30), y + rand(20, 40)); x.stroke(); }
    });
    const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.6), mat(scrollTex, 0.9));
    scroll.position.set(-1.6, 1.5, -2.97);
    const vase = new THREE.Mesh(new THREE.LatheGeometry([0.02, 0.07, 0.09, 0.07, 0.04, 0.035, 0.05].map((r, i) => new THREE.Vector2(r, i * 0.06)), 18), new THREE.MeshPhysicalMaterial({ color: 0x3a3028, roughness: 0.25, clearcoat: 0.8 }));
    vase.position.set(-0.8, 0.14, -2.55);
    vase.castShadow = true;
    const twig = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0.08, 0.7, 0.02), new THREE.Vector3(0.02, 1.0, 0.06), new THREE.Vector3(0.18, 1.25, 0.04)]), 16, 0.012, 5), timber);
    twig.position.copy(vase.position);
    twig.castShadow = true;
    R.add(scroll, vase, twig);

    // --- the lamp: a paper andon in view, the room's warm light, casting soft real shadows ---
    const andon = new THREE.Group();
    const frameM = timber;
    for (const [fx, fz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.7, 0.025), frameM);
      leg.position.set(fx, 0.35, fz);
      andon.add(leg);
    }
    const paperGlow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.26), new THREE.MeshStandardMaterial({ color: 0xf2e2c2, emissive: 0xffb068, emissiveIntensity: 1.4, roughness: 0.9, transparent: true, opacity: 0.95 }));
    paperGlow.position.y = 0.45;
    andon.add(paperGlow);
    andon.position.set(-2.2, 0, 0.4);
    const lamp = new THREE.PointLight(0xffb068, 6, 10, 1.5);
    lamp.position.set(-2.2, 0.5, 0.4);
    lamp.castShadow = !this.app.low;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.radius = 5;
    lamp.shadow.bias = -0.002;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa860, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(1.2);
    glow.position.set(-2.2, 0.45, 0.4);
    R.add(andon, lamp, glow);

    // furniture materials: grained wood with a worn sheen, glazed ceramics
    const wood = mat(woodTex, 0.45, { bumpMap: woodTex, bumpScale: 0.4 });
    const dark = mat(darkTex, 0.55);
    const paperM = mat(null, 0.9, { color: 0xe6dcc6 });
    const clay = new THREE.MeshPhysicalMaterial({ color: 0x5a3a28, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.02, w / 4, h / 4, d / 4)), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
    const cyl = (r1, r2, h, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 20), m); o.position.set(x, y, z); o.castShadow = true; return o; };
    const sets = {
      // a desk with papers and an ink stone, a rack of wooden batons
      office: [box(1.6, 0.08, 0.8, wood, 0, 0.72, -1.4), box(1.5, 0.7, 0.7, dark, 0, 0.35, -1.4), box(0.5, 0.01, 0.35, paperM, -0.3, 0.77, -1.35), box(0.4, 0.01, 0.3, paperM, 0.3, 0.77, -1.45), box(0.14, 0.03, 0.2, dark, 0.65, 0.78, -1.3),
        box(0.08, 1.2, 1.2, wood, -2.9, 0.9, -1.0), ...[0, 1, 2].map((k) => cyl(0.03, 0.03, 0.9, dark, -2.8, 1.0, -1.4 + k * 0.4))],
      // a low table, cushions, a meal set out
      home: [box(1.1, 0.08, 0.7, wood, 0, 0.32, -0.6), box(1.0, 0.28, 0.6, dark, 0, 0.14, -0.6), ...[[-0.8, -0.6], [0.8, -0.6], [0, 0.2]].map(([x, z]) => box(0.5, 0.08, 0.5, new THREE.MeshStandardMaterial({ color: 0x4a2030, roughness: 0.8 }), x, 0.04, z)),
        cyl(0.09, 0.05, 0.07, clay, -0.2, 0.4, -0.6), cyl(0.09, 0.05, 0.07, clay, 0.2, 0.4, -0.6), cyl(0.12, 0.1, 0.12, clay, 0, 0.42, -0.75)],
      // a counter, shelves of jars, a tray of crackers
      shop: [box(3, 0.9, 0.6, wood, 0, 0.45, -1.6), box(3.2, 0.05, 0.3, dark, 0, 1.6, -2.8), box(3.2, 0.05, 0.3, dark, 0, 2.1, -2.8),
        ...[-1.2, -0.6, 0, 0.6, 1.2].map((x) => cyl(0.12, 0.12, 0.3, clay, x, 1.78, -2.8)), ...[-1, -0.4, 0.2, 0.8].map((x) => cyl(0.14, 0.14, 0.26, clay, x, 2.28, -2.8)),
        box(0.8, 0.04, 0.5, wood, 0.6, 0.92, -1.55), ...[0, 1, 2, 3].map((k) => cyl(0.07, 0.07, 0.015, new THREE.MeshStandardMaterial({ color: 0xa87838, roughness: 0.7 }), 0.35 + k * 0.17, 0.95, -1.55))],
      // a practice post wrapped in rope, and a rack of wooden training weapons
      dojo: [cyl(0.14, 0.16, 1.8, wood, 0.6, 0.9, -1.4), cyl(0.17, 0.17, 0.3, new THREE.MeshStandardMaterial({ color: 0x9c8a66, roughness: 1 }), 0.6, 1.2, -1.4),
        box(0.08, 1.4, 1.6, wood, -2.9, 0.8, -0.4), ...[0, 1, 2, 3].map((k) => { const b = box(0.04, 1.1, 0.04, dark, -2.8, 0.9, -1.0 + k * 0.4); b.rotation.z = 0.12; return b; })],
      // racks of scrolls, a reading desk
      archive: [...[-2, -0.7, 0.6].map((x) => box(1.1, 2.2, 0.5, wood, x, 1.1, -2.7)),
        ...Array.from({ length: 18 }, (_, k) => { const c = cyl(0.05, 0.05, 0.45, paperM, -2.3 + (k % 6) * 0.45, 0.6 + Math.floor(k / 6) * 0.6, -2.5); c.rotation.z = Math.PI / 2; return c; }),
        box(0.9, 0.06, 0.5, wood, 0.8, 0.3, -0.6), box(0.8, 0.25, 0.4, dark, 0.8, 0.13, -0.6)],
      // an altar: a plain stone tablet, candles, a folded cloth
      shrine: [box(1.6, 0.7, 0.7, wood, 0, 0.35, -2.4), box(0.9, 1.3, 0.2, new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.9 }), 0, 1.35, -2.55),
        ...[-0.55, 0.55].map((x) => cyl(0.03, 0.03, 0.25, paperM, x, 0.83, -2.2)), box(0.6, 0.02, 0.3, new THREE.MeshStandardMaterial({ color: 0x6a1418, roughness: 0.8 }), 0, 0.71, -2.15)],
    };
    const groups = {};
    for (const [k, list] of Object.entries(sets)) {
      const g = new THREE.Group();
      list.forEach((o) => g.add(o));
      g.visible = false;
      R.add(g);
      groups[k] = g;
    }
    this.candleLights = [];
    return { R, groups };
  }

  /** A wooden slide in its track: a low rumble and a knock as it stops. */
  _slideSound(opening) {
    const sfx = this.app.sfx;
    sfx.noise({ dur: 0.45, vol: 0.14, type: 'bandpass', freq: opening ? 380 : 320, to: opening ? 260 : 220, q: 1.4, attack: 0.05 });
    sfx.tone({ freq: 140, to: 90, type: 'triangle', dur: 0.12, vol: 0.08, delay: 0.42 });
  }

  _goInside(i) {
    if (this.inside === i || this._fading || this._opening) return;
    // the door slides open on the lit room first, then you step through
    const d = this.doors[i];
    d.target = 1;
    this._slideSound(true);
    this._opening = true;
    setTimeout(() => { this._opening = false; this._enterRoom(i); }, 650);
  }

  _enterRoom(i) {
    if (this.inside === i || this._fading) return;
    this._fade(() => {
      this.inside = i;
      const info = HOUSES[i];
      for (const [k, g] of Object.entries(this.room.groups)) g.visible = k === info.room;
      this.room.R.visible = true;
      this.visited.add(i);
      this.roomLook = 0;
      this.houseTitle.textContent = info.name;
      this.houseText.textContent = info.text;
      this.houseCard.classList.remove('hidden');
      this.line.classList.remove('on');
      this.ui.classList.add('in-house');
      this._crumbs();
      this.app.sfx.swoosh();
    });
  }

  _goOutside() {
    if (this.inside == null || this._fading) return;
    const d = this.doors[this.inside];
    this._fade(() => {
      // back on the street, the door you came out of slides shut behind you
      setTimeout(() => { d.target = 0; this._slideSound(false); }, 300);
      this.inside = null;
      this.room.R.visible = false;
      this.houseCard.classList.add('hidden');
      this.ui.classList.remove('in-house');
      this.beat = -1; // bring the street's passage back
      this._crumbs();
    });
  }

  /** A short dip to black to cover stepping through a door. */
  _fade(mid) {
    this._fading = true;
    this.fadeEl.classList.add('on');
    setTimeout(() => { mid(); this.fadeEl.classList.remove('on'); this._fading = false; }, 420);
  }

  _crumbs() {
    const parts = [
      ['Memorial', () => this._goOutside()],
      ['The street', () => this._goOutside()],
    ];
    if (this.inside != null) parts.push([HOUSES[this.inside].name, null]);
    this.crumbs.replaceChildren(...parts.flatMap(([label, fn], k) => {
      const el = fn && k < parts.length - 1 ? h('button.crumb.pe', { type: 'button', text: label, onclick: fn }) : h('span.crumb.current', { text: label });
      return k ? [h('span.sep', { text: '›', 'aria-hidden': 'true' }), el] : [el];
    }));
    this.visitedEl.textContent = `Houses visited ${this.visited.size} / ${HOUSES.length}`;
  }

  /** Paper lanterns on posts down both sides. They burn ahead of you, and gutter out once you've passed. */
  _buildLanterns(s) {
    const paper = drawTexture(128, 128, (x, w) => {
      const g = x.createLinearGradient(0, 0, 0, w);
      g.addColorStop(0, '#f2dcb4'); g.addColorStop(0.5, '#fff0d0'); g.addColorStop(1, '#f2dcb4');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
      x.strokeStyle = 'rgba(120,80,40,0.45)'; x.lineWidth = 2;
      for (let y = 8; y < w; y += 12) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); } // the bamboo ribs
    });
    const wood = new THREE.MeshStandardMaterial({ color: 0x241a13, roughness: 0.9 });
    // a barrel of paper over bamboo hoops: widest in the middle, drawn in at the ends
    const prof = [];
    for (let i = 0; i <= 12; i++) { const y = -0.26 + (i / 12) * 0.52; prof.push(new THREE.Vector2(0.1 + Math.cos((y / 0.26) * Math.PI / 2) * 0.12, y)); }
    const lanternGeo = new THREE.LatheGeometry(prof, 20);
    const capGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 16);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 0.4, metalness: 0.2 });
    // each lantern's light, stretched across the wet stone toward you
    const streakTex = drawTexture(64, 256, (x, w, hh) => {
      const gv = x.createLinearGradient(0, 0, 0, hh);
      gv.addColorStop(0, 'rgba(255,255,255,0.9)'); gv.addColorStop(0.3, 'rgba(255,255,255,0.35)'); gv.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gv; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(Math.random() * w, Math.random() * hh, 1 + Math.random() * 3, 1 + Math.random() * 2); }
      const gh = x.createLinearGradient(0, 0, w, 0);
      gh.addColorStop(0, 'rgba(0,0,0,1)'); gh.addColorStop(0.5, 'rgba(0,0,0,0)'); gh.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = gh; x.fillRect(0, 0, w, hh);
    });
    const streakGeo = new THREE.PlaneGeometry(0.7, 1);
    streakGeo.translate(0, -0.5, 0);
    this.lanterns = [];
    let k = 0;
    for (let z = START - 6; z > END + 2; z -= 7, k++) {
      for (const side of [-1, 1]) {
        const g = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 8), wood);
        post.position.y = 1.1;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), wood);
        arm.position.set(-side * 0.22, 2.12, 0);
        const mat = new THREE.MeshStandardMaterial({ map: paper, emissive: 0xffa050, emissiveMap: paper, emissiveIntensity: 1.3, roughness: 0.8 });
        const body = new THREE.Mesh(lanternGeo, mat);
        body.position.set(-side * 0.42, 1.78, 0);
        const capT = new THREE.Mesh(capGeo, capMat), capB = new THREE.Mesh(capGeo, capMat);
        capT.position.set(-side * 0.42, 1.78 + 0.27, 0);
        capB.position.set(-side * 0.42, 1.78 - 0.27, 0);
        g.add(capT, capB);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff9a4a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.setScalar(1.3);
        halo.position.copy(body.position);
        g.add(post, arm, body, halo);
        g.position.set(side * (STREET_W - 0.6), 0, z + (side > 0 ? 3.5 : 0));
        s.add(g);
        const streak = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ map: streakTex, color: 0xffa050, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        streak.rotation.order = 'YXZ';
        streak.position.set(g.position.x - side * 0.42, 0.02, g.position.z);
        s.add(streak);
        body.userData.streak = streak;
        body.userData.lantern = this.lanterns.length;
        this.lanterns.push({ g, body, mat, halo, z: g.position.z, lit: 1, target: 1, relit: false, ph: rand(0, TAU) });
      }
    }
    // a few real lights, moved each frame to the brightest lanterns nearest you
    this.lights = Array.from({ length: this.app.low ? 2 : 4 }, () => {
      const l = new THREE.PointLight(0xffa050, 0, 8, 1.7);
      s.add(l);
      return l;
    });
  }

  /** Half-way down, one door stands open on a lit room: a low table, the meal still set. */
  _buildMeal(s) {
    const z = -36, x = STREET_W + 0.2;
    const room = new THREE.Group();
    room.position.set(x, 0.4, z);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x7a6a48, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(1.2, 0.02, 0);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 0.95 }));
    back.position.set(2.4, 1.2, 0);
    back.rotation.y = -Math.PI / 2;
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.6 }));
    table.position.set(1.2, 0.3, 0);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.26, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7 }));
    legs.position.set(1.2, 0.13, 0);
    room.add(floor, back, table, legs);
    const bowl = new THREE.MeshStandardMaterial({ color: 0x5a1e1a, roughness: 0.35 });
    const rice = new THREE.MeshStandardMaterial({ color: 0xeee8dc, roughness: 0.8 });
    [[-0.2, -0.12], [0.2, -0.12], [0, 0.14]].forEach(([bx, bz], i) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.07, 16), bowl);
      b.position.set(1.2 + bx, 0.38, bz);
      room.add(b);
      if (i < 2) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), rice); r.scale.y = 0.45; r.position.set(1.2 + bx, 0.41, bz); room.add(r); }
    });
    // chopsticks laid across a bowl, as if someone meant to come back
    const sticks = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.008, 0.012), new THREE.MeshStandardMaterial({ color: 0x1a0e08 }));
    sticks.position.set(1.0, 0.42, -0.12);
    sticks.rotation.y = 0.3;
    room.add(sticks);
    // the lamp inside, low and warm
    const lamp = new THREE.PointLight(0xffb070, 2.2, 5, 1.8);
    lamp.position.set(1.6, 1.0, 0.4);
    room.add(lamp);
    s.add(room);
  }

  /**
   * At the gate, a storm breaks. One strike lights the whole sky; in the flash the moon hangs huge and red
   * over the rooftops, and on a lone post beyond the gate there is only a crow, which leaves with the
   * thunder. Nobody is there. Then the rain comes harder.
   */
  _buildStorm(s) {
    // the perch is the gate itself: the crow waits on the end of its top beam, where a bird would sit
    const px = 2.55, py = 4.5 + 0.12, pz = END - 4;
    // its crow, perched facing away over the district it has outlived
    const geo = createCrowGeometry(0.55);
    addPhases(geo, 1);
    this.stormCrowMat = createCrowMaterial({ flap: 13, amp: 0, glide: 0, rim: 0xff4a3a, rimAmt: 0.2 });
    this.stormCrow = new THREE.InstancedMesh(geo, this.stormCrowMat, 1);
    this.stormCrow.frustumCulled = false;
    this.stormCrowHome = new THREE.Vector3(px, py, pz);
    this._buildFigure(px - 1.05, 4.5, pz);
    this.stormCrowPos = this.stormCrowHome.clone();
    this.stormCrowVel = new THREE.Vector3();
    s.add(this.stormCrow);
    // the red moon: placed so that, from where the storm catches you, the beam's end and the crow stand against it
    const dz = 60, cam = new THREE.Vector3(0, 1.6, START + (END - START) * STORM_AT);
    const dir = new THREE.Vector3(px - 0.8, py + 0.4, pz).sub(cam).normalize();
    this.redMoon = bloodMoon(11, { eclipse: true });
    this.redMoon.position.copy(cam).addScaledVector(dir, dz / -dir.z);
    this.redMoon.lookAt(cam);
    // it rises into that place from low behind the rooftops
    this.redMoonTop = this.redMoon.position.clone();
    this.redMoonLow = this.redMoonTop.clone().add(new THREE.Vector3(0, -20, 0));
    this.redMoon.traverse((o) => { if (o.isSprite) o.userData.base = o.scale.x; });
    this.moonGlowLight = new THREE.DirectionalLight(0xff3a24, 0);
    this.moonGlowLight.position.copy(this.redMoonTop).sub(cam).setLength(40).add(cam);
    s.add(this.moonGlowLight);
    this.redMoon.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 0; o.material.fog = false; } });
    this.redMoon.visible = false;
    s.add(this.redMoon);
    // the bolt, and a cold light that floods the street for the instant of the strike
    this.bolt = new Bolt();
    s.add(this.bolt.group);
    this.strikeLight = new THREE.DirectionalLight(0xdfe6ff, 0);
    this.strikeLight.position.set(-6, 30, END - 30);
    s.add(this.strikeLight);
    this.storm = { t: -1, done: false };
  }

  /**
   * A lone figure standing on the gate beam, back turned, head bowed, in a long plain hooded cloak: a pure
   * silhouette with no face, symbols or costume details. The lightning reveals it; it is gone when the moon fades.
   */
  _buildFigure(x, y, z) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x050406, transparent: true, opacity: 0 });
    const g = new THREE.Group();
    // the cloak: narrow at the shoulders, falling straight to a hem that the wind can take
    const prof = [[0.0, 0], [0.27, 0.02], [0.25, 0.35], [0.2, 0.8], [0.19, 1.1], [0.2, 1.28], [0.12, 1.38], [0.05, 1.42]].map(([r, h]) => new THREE.Vector2(r, h));
    const cloakGeo = new THREE.LatheGeometry(prof, 24);
    cloakGeo.scale(1.12, 1, 0.72); // a person is wider than deep
    const cloak = new THREE.Mesh(cloakGeo, mat);
    // the hood, the head bowed forward inside it
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat);
    hood.scale.set(1, 1.12, 1.15);
    hood.position.set(0, 1.52, -0.05);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 10), mat);
    peak.rotation.x = -Math.PI / 2 - 0.5;
    peak.position.set(0, 1.58, 0.1);
    // arms folded into the sleeves: a soft bulge at the front
    const sleeves = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), mat);
    sleeves.rotation.z = Math.PI / 2;
    sleeves.position.set(0, 1.02, -0.13);
    g.add(cloak, hood, peak, sleeves);
    g.position.set(x, y, z);
    g.rotation.y = Math.PI; // its back to you, looking out past the gate
    g.rotation.x = 0.04; // a slight stoop
    g.visible = false;
    this.scene.add(g);
    this.figure = { g, mat, cloakGeo, base: cloakGeo.attributes.position.array.slice() };
  }

  /** The things a street is left with: rain barrels, buckets, crates, a bench, potted plants, a fallen lantern. */
  _buildStreetLife(s) {
    const grain = drawTexture(128, 256, (x, w, hh) => {
      x.fillStyle = '#4a3624'; x.fillRect(0, 0, w, hh);
      for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(20,12,6,${rand(0.2, 0.5)})`; x.lineWidth = rand(0.6, 2); const px = rand(0, w); x.beginPath(); x.moveTo(px, 0); x.lineTo(px + rand(-6, 6), hh); x.stroke(); }
    });
    // wet wood: darker, with a sheen
    const wood = new THREE.MeshStandardMaterial({ map: grain, color: 0x8a7a68, roughness: 0.35, metalness: 0.05 });
    const hoop = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.4, metalness: 0.6 });
    const clay = new THREE.MeshPhysicalMaterial({ color: 0x5a3a2a, roughness: 0.3, clearcoat: 0.6 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2a3a22, roughness: 0.7 });
    const water = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.02, metalness: 0.4 });
    const g = new THREE.Group();
    const barrel = (x, z) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 18), wood);
      b.position.set(x, 0.4, z);
      for (const y of [0.15, 0.62]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.012, 6, 24), hoop); h.rotation.x = Math.PI / 2; h.position.set(x, y, z); g.add(h); }
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.31, 20), water); // brimming with rain
      top.rotation.x = -Math.PI / 2; top.position.set(x, 0.79, z);
      b.castShadow = true;
      g.add(b, top);
    };
    const bucket = (x, z, tipped) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.28, 14, 1, true), wood);
      b.position.set(x, tipped ? 0.14 : 0.14, z);
      if (tipped) { b.rotation.z = Math.PI / 2; b.rotation.y = rand(0, TAU); }
      b.material.side = THREE.DoubleSide;
      g.add(b);
    };
    const crates = (x, z) => {
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.5), wood);
        c.position.set(x + (k === 2 ? 0.05 : 0), 0.2 + (k === 2 ? 0.4 : 0), z + (k === 1 ? 0.55 : 0));
        c.rotation.y = rand(-0.15, 0.15);
        c.castShadow = true;
        g.add(c);
      }
    };
    const bench = (x, z, side) => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 1.6), wood);
      seat.position.set(x, 0.45, z);
      g.add(seat);
      for (const dz of [-0.65, 0.65]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.06), wood); leg.position.set(x, 0.21, z + dz); g.add(leg); }
    };
    const pot = (x, z) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 14), clay);
      p.position.set(x, 0.15, z);
      g.add(p);
      for (let k = 0; k < 7; k++) {
        const bl = new THREE.Mesh(new THREE.ConeGeometry(0.035, rand(0.35, 0.6), 4), leaf);
        bl.position.set(x + rand(-0.08, 0.08), 0.45, z + rand(-0.08, 0.08));
        bl.rotation.set(rand(-0.4, 0.4), 0, rand(-0.4, 0.4));
        g.add(bl);
      }
    };
    // a paper lantern that fell and was never picked up, crumpled in a puddle
    const fallen = (x, z) => {
      const prof = [];
      for (let k = 0; k <= 10; k++) { const y = -0.2 + (k / 10) * 0.4; prof.push(new THREE.Vector2(0.08 + Math.cos((y / 0.2) * Math.PI / 2) * 0.1, y)); }
      const geo = new THREE.LatheGeometry(prof, 14);
      const pp = geo.attributes.position;
      for (let v = 0; v < pp.count; v++) pp.setXYZ(v, pp.getX(v) * (1 + rand(-0.12, 0.08)), pp.getY(v), pp.getZ(v) * (1 + rand(-0.12, 0.08)));
      geo.computeVertexNormals();
      const l = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb8a482, roughness: 0.9, side: THREE.DoubleSide }));
      l.rotation.set(Math.PI / 2 - 0.2, 0, rand(0, TAU));
      l.position.set(x, 0.1, z);
      g.add(l);
    };
    // placed against the house fronts on both sides, clear of the lanterns, doors and the walking line
    const wallX = (side) => side * (STREET_W - 0.25);
    [[-1, 2], [1, -9], [-1, -23], [1, -41], [-1, -48], [1, -60]].forEach(([sd, z]) => barrel(wallX(sd), z));
    [[1, 1.2, false], [1, 1.6, true], [-1, -24, false], [-1, -47.4, true]].forEach(([sd, z, tip]) => bucket(wallX(sd) - sd * 0.45, z, tip));
    [[-1, -12], [1, -31]].forEach(([sd, z]) => crates(wallX(sd) - sd * 0.1, z));
    bench(wallX(1) - 0.1, -26, 1);
    [[-1, -4], [-1, -4.6], [1, -15], [-1, -34], [1, -54]].forEach(([sd, z]) => pot(wallX(sd), z));
    fallen(1.6, -17);
    s.add(g);
    this.statics.push(g);
  }

  /** Beyond the gate: more roofs, fading into rain and mist, and a ridge of hills behind them. */
  _buildDistance(s) {
    const layer = (z, color, rows, seed) => {
      const pos = [];
      for (let k = 0; k < rows; k++) {
        const x0 = -40 + k * (80 / rows) + Math.sin(seed + k) * 1.5, w = 80 / rows * 0.95;
        const base = 0, wall = 2.4 + Math.abs(Math.sin(seed * 3 + k)) * 1.6, ridge = wall + 1.2 + Math.abs(Math.sin(seed + k * 1.7)) * 0.6;
        pos.push(x0, base, 0, x0 + w, base, 0, x0 + w, wall, 0, x0, base, 0, x0 + w, wall, 0, x0, wall, 0); // the house
        pos.push(x0 - 0.4, wall, 0, x0 + w + 0.4, wall, 0, x0 + w / 2, ridge, 0); // its roof
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false }));
      m.position.set(0, 0, z);
      return m;
    };
    // nearer rows darker, farther rows lost in the haze
    s.add(layer(END - 16, 0x0b0d14, 16, 1), layer(END - 26, 0x141824, 20, 2), layer(END - 38, 0x1c2130, 26, 3));
    const hills = new THREE.Shape();
    hills.moveTo(-90, 0);
    for (let x = -90; x <= 90; x += 3) hills.lineTo(x, 7 + Math.sin(x * 0.07) * 3 + Math.sin(x * 0.19 + 1) * 1.2);
    hills.lineTo(90, 0);
    const hill = new THREE.Mesh(new THREE.ShapeGeometry(hills), new THREE.MeshBasicMaterial({ color: 0x222838, fog: false }));
    hill.position.z = END - 55;
    s.add(hill);
    // mist lying between the rows
    const mistTex = drawTexture(4, 64, (x, w, hh) => { const gr = x.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, hh); });
    for (const [z, y, o] of [[END - 21, 1.4, 0.25], [END - 32, 2.2, 0.3], [END - 46, 3, 0.35]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 4), new THREE.MeshBasicMaterial({ map: mistTex, color: 0x5a6682, transparent: true, opacity: o, depthWrite: false, fog: false }));
      m.position.set(0, y, z);
      s.add(m);
    }
  }

  /** Where the rain lands: rings spreading in the puddles, and water running off the eaves. */
  _buildRainDetail(s) {
    const ringTex = drawTexture(64, 64, (x, w) => { x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 4, 0, TAU); x.stroke(); });
    const N = this.app.low ? 60 : 140;
    this.ripples = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), N);
    this.ripples.frustumCulled = false;
    this.rippleData = Array.from({ length: N }, () => ({ x: 0, z: 0, t: rand(0, 1), life: rand(0.5, 0.9), size: rand(0.18, 0.4) }));
    this.ripples.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    s.add(this.ripples);
    // drips off the eaves on both sides of the street, around wherever you're walking
    const D = this.app.low ? 60 : 140;
    const dg = new THREE.BufferGeometry();
    this.dripPos = new Float32Array(D * 6);
    this.dripData = Array.from({ length: D }, () => ({ side: Math.random() < 0.5 ? -1 : 1, dz: rand(-12, 4), y: rand(0, 3.4), v: rand(4, 7) }));
    dg.setAttribute('position', new THREE.BufferAttribute(this.dripPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.drips = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0xaab4cc, transparent: true, opacity: 0.45, depthWrite: false }));
    this.drips.frustumCulled = false;
    s.add(this.drips);
  }

  _updateRainDetail(dt, z) {
    const d = this.dummy, col = new THREE.Color();
    this.rippleData.forEach((r, i) => {
      r.t += dt / r.life;
      if (r.t >= 1) { r.t = 0; r.x = rand(-4.4, 4.4); r.z = z + rand(-14, 1.5); r.size = rand(0.18, 0.4); }
      d.position.set(r.x, 0.015, r.z);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.setScalar(r.size * (0.2 + r.t));
      d.updateMatrix();
      this.ripples.setMatrixAt(i, d.matrix);
      this.ripples.setColorAt(i, col.setScalar(0.35 * (1 - r.t) * (1 - r.t)));
    });
    this.ripples.instanceMatrix.needsUpdate = true;
    this.ripples.instanceColor.needsUpdate = true;
    const P = this.dripPos;
    this.dripData.forEach((q, i) => {
      q.y -= q.v * dt;
      if (q.y < 0) { q.y = 3.35; q.dz = rand(-12, 4); q.side = Math.random() < 0.5 ? -1 : 1; }
      // the eave line, just in front of the house fronts
      const x = q.side * (STREET_W - 0.62), zz = z + q.dz;
      P[i * 6] = x; P[i * 6 + 1] = q.y; P[i * 6 + 2] = zz;
      P[i * 6 + 3] = x; P[i * 6 + 4] = q.y - 0.28; P[i * 6 + 5] = zz;
    });
    this.drips.geometry.attributes.position.needsUpdate = true;
  }

  _stormStrike() {
    this.storm = { t: 0, done: true };
    this.redMoon.position.copy(this.redMoonLow);
    this.bolt.strike(new THREE.Vector3(-9, 46, END - 34), 0);
    this.app.flash(0.55, 0xdde4ff);
    this.afterEl.classList.remove('on'); void this.afterEl.offsetWidth; this.afterEl.classList.add('on');
    this.redMoon.visible = true;
  }

  _updateStorm(dt, t, z) {
    const st = this.storm;
    // it breaks as you reach the gate; walk back up the street and it can break again
    if (!st.done && this.inside == null && this.p > STORM_AT) this._stormStrike();
    if (st.done && st.t < 0 && this.p < 0.75) st.done = false;
    this.bolt.update(dt, this.camera);
    if (st.t >= 0) {
      st.t += dt;
      const T = st.t;
      // a double flicker, then darkness with the moon still burning red
      const flick = T < 0.08 ? 1 : T < 0.16 ? 0.15 : T < 0.26 ? 0.8 : Math.max(0, 1 - (T - 0.26) * 4);
      this.strikeLight.intensity = 3 * flick;
      // the red moon rises: from low and dark behind the roofs, climbing and deepening to blood red,
      // its glow swelling; it holds, then fades back into the cloud
      const R0 = 0.35, R1 = 3.9;
      const rise = Math.min(1, Math.max(0, (T - R0) / (R1 - R0)));
      const e = 1 - Math.pow(1 - rise, 3); // eases to a stop at the top
      const fade = T < 8.5 ? 1 : Math.max(0, 1 - (T - 8.5) / 3);
      this.redMoon.position.lerpVectors(this.redMoonLow, this.redMoonTop, e);
      this.redMoon.scale.setScalar(0.82 + e * 0.18);
      const moonA = Math.min(1, rise * 2.5) * fade;
      this.redMoon.traverse((o) => {
        if (!o.material) return;
        if (o.isSprite) {
          o.material.opacity = moonA * (0.25 + e * 0.45);
          o.scale.setScalar(o.userData.base * (1 + e * 0.35));
        } else {
          o.material.opacity = moonA;
          o.material.color.setRGB(0.35 + e * 0.65, 0.3 + e * 0.7 * 0.5, 0.3 + e * 0.7 * 0.5);
        }
      });
      this.moon.visible = moonA < 0.3;
      // the figure: seen from the first flash, standing against the moon while it burns, gone as it fades
      const f = this.figure;
      const figA = T < 0.3 ? (flick > 0.5 ? 1 : 0.6) : fade;
      f.mat.opacity = figA;
      f.g.visible = figA > 0.02;
      if (f.g.visible) {
        const P = f.cloakGeo.attributes.position.array, B = f.base;
        for (let i = 0; i < P.length; i += 3) {
          const low = Math.max(0, 1 - B[i + 1] / 0.9); // the hem moves; the shoulders hold still
          P[i] = B[i] + Math.sin(t * 2.3 + B[i + 1] * 3) * 0.04 * low;
          P[i + 2] = B[i + 2] + (0.05 + Math.sin(t * 1.7 + B[i] * 6) * 0.035) * low;
        }
        f.cloakGeo.attributes.position.needsUpdate = true;
      }
      // its light bleeds over the street and colours the rain
      this.moonGlowLight.intensity = 0.9 * e * fade;
      this.rain.material.color.setRGB(0.56 + 0.2 * e * fade, 0.6 - 0.14 * e * fade, 0.7 - 0.2 * e * fade);
      this.skyRise = e * fade;
      if (T > R0 && !st.swell) {
        st.swell = true;
        const sfx = this.app.sfx;
        sfx.tone({ freq: 46, to: 70, type: 'sine', dur: 3.6, vol: 0.2, attack: 1.8 });
        sfx.noise({ dur: 3.4, vol: 0.12, type: 'lowpass', freq: 120, to: 420, attack: 2.2 });
      }
      // the thunder, and the crow goes
      if (T > 0.7 && !st.thunder) {
        st.thunder = true;
        this.app.sfx.thunder();
        this.stormCrowVel.set(-2.2, 2.6, -5);
        this.stormCrowMat.uniforms.uAmp.value = 0.55;
        this.app.sfx.caw?.();
      }
      if (T > 3.4 && !st.said) {
        st.said = true;
        clearTimeout(this._lineT);
        this.line.classList.remove('on');
        this._lineT = setTimeout(() => { this.line.textContent = 'The one who did this left before dawn.'; this.line.classList.add('on'); }, 350);
      }
      // the rain comes harder after the strike, then eases
      this.rain.material.opacity = 0.28 + Math.max(0, Math.min(1, (T - 0.5) * 2)) * Math.max(0, 1 - (T - 8) / 4) * 0.22;
      this.rainSpeed = 14 + (this.rain.material.opacity - 0.28) * 40;
      if (T > 12.5) { st.t = -1; this.redMoon.visible = false; this.moon.visible = true; this.beat = -1; this.moonGlowLight.intensity = 0; this.rain.material.color.set(0x8f9ab4); this.skyRise = 0; this.figure.g.visible = false; }
    }
    // the crow: perched (a small shift of weight now and then) or flying off into the dark
    if (st.thunder && st.t >= 0) {
      this.stormCrowVel.y += dt * 0.8;
      this.stormCrowPos.addScaledVector(this.stormCrowVel, dt);
    } else if (!st.done) {
      this.stormCrowPos.copy(this.stormCrowHome);
      this.stormCrowMat.uniforms.uAmp.value = 0;
    }
    const d = this.dummy;
    d.position.copy(this.stormCrowPos);
    if (st.thunder && st.t >= 0) d.lookAt(this.stormCrowPos.clone().add(this.stormCrowVel));
    else d.rotation.set(0, Math.PI + Math.sin(t * 0.5) * 0.25, 0);
    d.updateMatrix();
    this.stormCrow.setMatrixAt(0, d.matrix);
    this.stormCrow.instanceMatrix.needsUpdate = true;
    this.stormCrow.visible = this.stormCrowPos.y < 40;
    if (st.t < 0 && !st.done) st.thunder = false;
  }

  /** A crow on the low wall; it leaves when you come close. */
  _buildCrow(s) {
    const geo = createCrowGeometry(0.55);
    addPhases(geo, 1);
    this.crowMat = createCrowMaterial({ flap: 12, amp: 0, glide: 0, rim: 0x8090b0, rimAmt: 0.4 });
    this.crow = new THREE.InstancedMesh(geo, this.crowMat, 1);
    this.crow.frustumCulled = false;
    this.crowPos = new THREE.Vector3(-STREET_W + 0.1, 1.95, -27);
    this.crowVel = new THREE.Vector3();
    this.crowFlown = false;
    this.dummy = new THREE.Object3D();
    s.add(this.crow);
  }

  _drop(i, initial) {
    const P = this.rainPos, cz = this.camera ? this.camera.position.z : START;
    const x = rand(-9, 9), z = cz + rand(-22, 6), y = initial ? rand(0, 12) : rand(10, 13);
    P[i * 6] = x; P[i * 6 + 1] = y; P[i * 6 + 2] = z;
    P[i * 6 + 3] = x + 0.03; P[i * 6 + 4] = y - 0.55; P[i * 6 + 5] = z + 0.05;
  }

  _buildUI() {
    this.intro({
      kicker: 'Chapter · 追憶',
      jp: '追憶',
      title: 'The <em>Memorial</em>',
      desc: 'The Uchiha clan’s district, empty years later, in the rain. Walk the street slowly. At its end you can light the lanterns again.',
      extra: [this.gestures([['swipe', '<b>Swipe</b> or scroll to walk'], ['tap', '<b>Tap</b> a lit door to go inside'], ['tap', '<b>Tap</b> a dark lantern to relight it']])],
    });
    this.line = h('p.memorial-line', { 'aria-live': 'polite' });
    this.ui.append(this.line);
    // where you are: Memorial › The street › (a house), and how many houses you've been into
    this.visited = new Set();
    this.inside = null;
    this.crumbs = h('nav.mem-crumbs', { 'aria-label': 'You are here' });
    this.visitedEl = h('span.mem-visited');
    this.ui.append(h('div.mem-trail', {}, this.crumbs, this.visitedEl));
    this.houseTitle = h('h3');
    this.houseText = h('p');
    this.houseCard = h('div.card.mem-house.pe.hidden', {},
      h('div.card-jp', { text: 'Uchiha district' }), this.houseTitle, this.houseText,
      h('div.quiz-foot', {}, this.button('← Back to the street', () => this._goOutside(), 'btn-primary')));
    this.ui.append(this.houseCard);
    this.afterEl = h('div.mem-after', { 'aria-hidden': 'true' });
    this.ui.append(this.afterEl);
    this.fadeEl = h('div.mem-fade');
    this.ui.append(this.fadeEl);
    this._crumbs();
    this.ui.append(h('div.controls.tl-controls', {},
      this.button('↑<span class="lbl"> Back</span>', () => this._walk(-1 / 7)),
      this.button('<span class="lbl">Walk on </span>↓', () => this._walk(1 / 7)),
    ));
  }

  _walk(d) { this.pt = clamp(this.pt + d, 0, 1); }

  wheel(e) {
    if (this.inside != null) return true;
    const atEnd = this.pt >= 1 && e.deltaY > 0, atStart = this.pt <= 0 && e.deltaY < 0;
    if (atEnd || atStart) return false;
    this._walk(e.deltaY * 0.0004);
    return true;
  }

  pointerMove(p) {
    if (this.inside != null) {
      if (p.down) this.roomLook = clamp((this.roomLook || 0) - p.dx * 0.004, -1.1, 1.1);
      return;
    }
    if (p.down) this._walk((-p.dy - p.dx * 0.3) * 0.0009);
    else this.app.setHover(this._hitLantern() >= 0 || this._hitDoor() >= 0);
  }

  _hitDoor() {
    const hit = this.app.raycast(this.doors.map((d) => d.door), false)[0];
    return hit && hit.distance < 16 ? hit.object.userData.house : -1;
  }

  swipe(s) {
    if (this.inside != null) return true;
    this._walk((Math.abs(s.dy) > Math.abs(s.dx) ? -Math.sign(s.dy) : -Math.sign(s.dx)) * 0.06);
    return true;
  }

  key(e) {
    if (e.key === 'Escape' && this.inside != null) { this._goOutside(); return true; }
    if (this.inside != null) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { this._walk(1 / 7); return true; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { this._walk(-1 / 7); return true; }
    return false;
  }

  _hitLantern() {
    const hit = this.app.raycast(this.lanterns.map((l) => l.body), false)[0];
    return hit ? hit.object.userData.lantern : -1;
  }

  click() {
    if (this.inside != null) return;
    const d = this._hitDoor();
    if (d >= 0) { this._goInside(d); return; }
    const i = this._hitLantern();
    if (i < 0) return;
    const l = this.lanterns[i];
    if (l.relit || l.target > 0.5) return;
    // relit in remembrance: a softer, whiter flame that stays
    l.relit = true;
    l.target = 1;
    l.mat.emissive.set(0xffd6a0);
    l.halo.material.color.set(0xffe0b8);
    this.relit++;
    const sfx = this.app.sfx;
    if (sfx.ok) sfx.bell(523.25 * (1 + (this.relit % 5) * 0.125), sfx.ctx.currentTime, 0.06);
    if (this.relit === this.lanterns.length) {
      this.line.textContent = 'Remembered.';
      this.app.sfx.chime();
    }
  }

  enter() {
    this.pt = this.p = 0;
  }

  exit() {
    for (const d of this.doors || []) { d.target = 0; d.open = 0; d.door.position.z = d.baseZ; }
    if (this.inside != null) {
      this.inside = null;
      this.room.R.visible = false;
      this.houseCard.classList.add('hidden');
      this.ui.classList.remove('in-house');
      this._crumbs();
    }
  }

  update(dt, t) {
    this.p = damp(this.p, this.pt, 2.2, dt);
    const z = START + (END - START) * this.p;
    // a slow walk: a slight bob, and on a phone, tilt turns your head
    const gyro = this.app.gyro;
    this.look = damp(this.look || 0, gyro ? -gyro.x * 0.35 : (this.app.isTouch ? 0 : -this.app.pointer.ndc.x * 0.25), 4, dt);
    const moving = Math.abs(this.pt - this.p);
    this.bob = (this.bob || 0) + dt * moving * 60;
    if (this.inside != null) {
      // standing in the doorway of the room, looking in; drag or tilt to look around
      this.roomLookD = damp(this.roomLookD || 0, (this.roomLook || 0) + (gyro ? -gyro.x * 0.5 : 0), 5, dt);
      this.camera.position.set(200 + 0.6, 1.45, 2.4);
      this.camera.rotation.set(-0.12, this.roomLookD, 0, 'YXZ');
    } else {
      this.camera.position.set(Math.sin(this.bob * 0.5) * 0.03, 1.6 + Math.sin(this.bob) * 0.025, z);
      // during the storm the eyes go up to the sky over the gate
      const skyward = this.storm && this.storm.t >= 0 && this.storm.t < 10 ? 0.45 + 0.55 * (this.skyRise || 0) : 0;
      this.skyLook = damp(this.skyLook || 0, skyward, skyward ? 2.2 : 1, dt);
      this.camera.rotation.set(-0.04 + this.skyLook * 0.22 + (gyro ? -gyro.y * 0.1 : 0), this.look + this.skyLook * -0.03, 0, 'YXZ');
    }
    this._updateStorm(dt, t, z);
    for (const d of this.doors) {
      const near = Math.abs(d.z - z) < 10;
      // the door slides along its track, uncovering the doorway
      d.open = damp(d.open, d.target, 5, dt);
      d.door.position.z = d.baseZ + d.dir * d.open * 1.25;
      d.mat.emissiveIntensity = damp(d.mat.emissiveIntensity, (this.visited.has(d.door.userData.house) ? 0.3 : 0.55) + (near ? 0.25 : 0) + Math.sin(t * 2 + d.z) * 0.03, 3, dt);
    }
    this.sky.position.copy(this.camera.position);
    this.sky.userData.uniforms.uTime.value = t;
    for (const b of this.banners) {
      const P = b.geo.attributes.position.array;
      for (let i = 0; i < P.length; i += 3) {
        const hang = ((b.big ? 1.4 : 1.1) - b.base[i + 1]) / (b.big ? 2.8 : 2.2); // 0 at the top, 1 at the hem
        P[i + 2] = b.base[i + 2] + Math.sin(t * 1.3 + b.base[i + 1] * 2 + b.ph) * 0.06 * hang;
      }
      b.geo.attributes.position.needsUpdate = true;
      b.geo.computeVertexNormals();
    }
    for (const m of this.mist) { m.position.x += m.userData.vx * dt; if (Math.abs(m.position.x) > 5) m.userData.vx *= -1; m.quaternion.copy(this.camera.quaternion); }
    this.moon.position.copy(this.camera.position).add(this.moonOffset);
    this.moon.lookAt(this.camera.position);

    // the story, one passage per stretch
    const beat = Math.min(BEATS.length - 1, Math.floor(this.p * BEATS.length + 0.15));
    if (this.inside == null && this.storm.t < 0 && beat !== this.beat && (this.relit < this.lanterns.length)) {
      this.beat = beat;
      this.line.classList.remove('on');
      clearTimeout(this._lineT);
      this._lineT = setTimeout(() => { this.line.textContent = BEATS[beat]; this.line.classList.add('on'); }, 450);
    }

    // lanterns: burning ahead of you, guttering out once behind; relit ones stay
    const lit = [];
    for (const l of this.lanterns) {
      if (!l.relit) l.target = l.z < z + 1.5 ? 1 : 0;
      const gutter = l.target < l.lit ? 0.6 + Math.random() * 0.8 : 1;
      l.lit = damp(l.lit, l.target, l.target < l.lit ? 1.2 : 3, dt);
      const flick = l.relit ? 0.95 + Math.sin(t * 2 + l.ph) * 0.03 : 0.85 + Math.sin(t * 9 + l.ph) * 0.06 + Math.random() * 0.06;
      l.mat.emissiveIntensity = 1.3 * l.lit * flick * gutter;
      l.halo.material.opacity = 0.35 * l.lit * flick;
      // its reflection runs across the wet stone toward wherever you stand, rain breaking it up
      const st = l.body.userData.streak;
      const dx = this.camera.position.x - st.position.x, dz = this.camera.position.z - st.position.z;
      st.rotation.set(-Math.PI / 2, Math.atan2(dx, dz), 0);
      st.scale.set(1 + Math.sin(t * 7 + l.ph) * 0.08, Math.min(7, Math.hypot(dx, dz) * 0.5), 1);
      st.material.opacity = 0.38 * l.lit * flick;
      st.material.color.set(l.relit ? 0xffd6a0 : 0xffa050);
      if (l.lit > 0.05) lit.push(l);
    }
    lit.sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z));
    this.lights.forEach((light, i) => {
      const l = lit[i];
      if (!l) { light.intensity = 0; return; }
      l.body.getWorldPosition(light.position);
      light.color.set(l.relit ? 0xffd6a0 : 0xffa050);
      light.intensity = 3.2 * l.lit;
    });
    // windows fade to dark as you draw near
    for (const w of this.windows) w.mesh.material.opacity = damp(w.mesh.material.opacity, w.z < z - 6 ? 0.28 : 0, 1.5, dt);

    // the crow leaves as you come close
    if (!this.crowFlown && z < this.crowPos.z + 5) {
      this.crowFlown = true;
      this.crowVel.set(-1.5, 3.2, -4);
      this.crowMat.uniforms.uAmp.value = 0.55;
      this.app.sfx.caw?.();
      this.app.sfx.flutter?.();
    }
    if (this.crowFlown) {
      this.crowVel.y += dt * 0.6;
      this.crowPos.addScaledVector(this.crowVel, dt);
    }
    this.dummy.position.copy(this.crowPos);
    if (this.crowFlown) this.dummy.lookAt(this.crowPos.clone().add(this.crowVel));
    else this.dummy.rotation.set(0, Math.PI / 2 + Math.sin(t * 0.7) * 0.3, 0);
    this.dummy.updateMatrix();
    this.crow.setMatrixAt(0, this.dummy.matrix);
    this.crow.instanceMatrix.needsUpdate = true;
    this.crow.visible = this.crowPos.y < 30;

    // rain
    const P = this.rainPos;
    for (let i = 0; i < this.rainN; i++) {
      const rs = this.rainSpeed || 14;
      P[i * 6 + 1] -= dt * rs; P[i * 6 + 4] -= dt * rs;
      if (P[i * 6 + 4] < 0) {
        if (Math.random() < 0.08) this.splash.emit({ x: P[i * 6], y: 0.02, z: P[i * 6 + 2], vx: rand(-0.4, 0.4), vy: rand(0.6, 1.2), vz: rand(-0.4, 0.4), life: 0.25, size: 0.03, color: this.splashColor, alpha: 0.6 });
        this._drop(i, false);
      } else if (P[i * 6 + 2] > z + 8 || P[i * 6 + 2] < z - 24) this._drop(i, true);
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.splash.update(dt, t);
    this._updateRainDetail(dt, z);
  }
}
