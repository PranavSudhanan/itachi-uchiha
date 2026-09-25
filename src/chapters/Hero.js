import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { voice } from '../core/Voice.js';
import { SharinganEye } from '../objects/Eye.js';
import { ParticlePool } from '../objects/Particles.js';
import { featherTexture, rand, damp, TAU, h, pointerOnPlane } from '../core/utils.js';
import { PROFILE } from '../data/content.js';
import { duskSky, bloodMoon } from '../objects/Dusk.js';
import { konohaSkyline } from '../objects/Konoha.js';

const MODES = [3, 'mangekyo', 0];
const MODE_INFO = {
  3: ['Sharingan', '写輪眼', 'Three tomoe — perception, prediction and hypnosis.'],
  mangekyo: ['Mangekyō Sharingan', '万華鏡写輪眼', 'Awakened through loss. Home of Tsukuyomi and Amaterasu.'],
  0: ['Onyx Eyes', '黒眼', 'The calm, dark eyes of the gentle brother behind the legend.'],
};

export function tomoeGeometry(size = 1) {
  const head = new THREE.Shape();
  head.absarc(0, 0, 0.18 * size, 0, TAU, false);
  const tail = new THREE.Shape();
  tail.moveTo(0.175 * size, 0.04 * size);
  tail.quadraticCurveTo(0.24 * size, -0.3 * size, -0.07 * size, -0.46 * size);
  tail.quadraticCurveTo(0.05 * size, -0.22 * size, -0.14 * size, -0.11 * size);
  tail.closePath();
  const g = new THREE.ExtrudeGeometry([head, tail], { depth: 0.05 * size, bevelEnabled: true, bevelSize: 0.015 * size, bevelThickness: 0.02 * size, bevelSegments: 2, curveSegments: 16 });
  g.center();
  return g;
}

export class Hero extends Chapter {
  constructor(app) {
    super(app, { id: 'prologue', title: 'Prologue', jp: '序' });
    this.bloom = { strength: 0.85, radius: 0.55, threshold: 0.62 };
    this.modeIndex = 0;
    this.lookTarget = new THREE.Vector3(0, 0, 10);
    this.pointerWorld = new THREE.Vector3(999, 999, 0);
    this.lastPointerWorld = new THREE.Vector3();
    this.idle = 0;
  }

  build() {
    const s = this.scene;
    s.fog = new THREE.FogExp2(0x0b0309, 0.03);
    this.camera.position.set(0, 0, 11);

    s.add(new THREE.AmbientLight(0x442233, 1.2));
    const key = new THREE.PointLight(0xff2a3a, 40, 30);
    key.position.set(0, 2, 5);
    s.add(key);

    // --- Konoha by night under a blood-red moon ---
    const moonPos = new THREE.Vector3(24, 22, -85);
    // night, not dusk: nearly black overhead, a faint red low in the sky, the glow gathered round the moon
    this.sky = duskSky(moonPos, 90, { dim: 0.38, horizon: [0.17, 0.03, 0.032], mid: [0.045, 0.008, 0.016], top: [0.008, 0.002, 0.01], cloudDark: [0.02, 0.005, 0.01] });
    s.add(this.sky);
    this.moon = bloodMoon(6.5, { eclipse: true });
    this.moon.position.copy(moonPos);
    this.moon.lookAt(0, 0, 11);
    s.add(this.moon);
    this.skyline = konohaSkyline();
    s.add(this.skyline);

    // --- the eye ---
    this.eye = new SharinganEye({ radius: 1.75, mode: 3 });
    this.eyeGroup = new THREE.Group();
    this.eyeGroup.add(this.eye.group);
    s.add(this.eyeGroup);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rings = [2.7, 3.2, 3.8].map((r, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.01 + i * 0.004, 6, 200), ringMat);
      m.rotation.x = rand(-0.4, 0.4);
      m.rotation.y = rand(-0.4, 0.4);
      this.eyeGroup.add(m);
      return m;
    });

    // orbiting tomoe
    const tomoeGeo = tomoeGeometry(1.4);
    const tomoeMat = new THREE.MeshStandardMaterial({ color: 0x0a0204, emissive: 0x4a0008, roughness: 0.3, metalness: 0.6 });
    this.tomoe = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(tomoeGeo, tomoeMat);
      m.userData.a = (i * TAU) / 3;
      this.eyeGroup.add(m);
      return m;
    });

    // --- falling crow feathers ---
    const count = this.app.low ? 70 : 150;
    const fGeo = new THREE.PlaneGeometry(0.32, 0.64);
    // glossy black crow feathers, catching the red light as they turn
    const fMat = new THREE.MeshStandardMaterial({ map: featherTexture(), color: 0x3a3440, roughness: 0.45, metalness: 0.2, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 });
    this.feathers = new THREE.InstancedMesh(fGeo, fMat, count);
    this.feathers.frustumCulled = false;
    this.fData = Array.from({ length: count }, () => this._newFeather(true));
    s.add(this.feathers);
    this.dummy = new THREE.Object3D();

    // --- embers ---
    this.embers = new ParticlePool({ count: this.app.low ? 250 : 500, turbulence: 1.2, drag: 0.4 });
    s.add(this.embers.points);
    this.emberColors = [new THREE.Color(0xff3020), new THREE.Color(0xff7040), new THREE.Color(0xb00010)];

    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -7);

    this._buildUI();
    this.resize(this.app.width, this.app.height);
  }

  _newFeather(initial = false) {
    return {
      p: new THREE.Vector3(rand(-14, 14), initial ? rand(-8, 9) : rand(8, 11), rand(-10, 4)),
      v: new THREE.Vector3(0, -rand(0.4, 0.9), 0),
      r: new THREE.Euler(rand(0, TAU), rand(0, TAU), rand(0, TAU)),
      rs: new THREE.Vector3(rand(-1, 1), rand(-1.5, 1.5), rand(-1, 1)),
      ph: rand(0, TAU),
      s: rand(0.7, 1.3),
    };
  }

  _buildUI() {
    this.intro({
      kicker: 'The Crow of the Leaf',
      jp: 'うちはイタチ',
      title: 'Itachi <em>Uchiha</em>',
      desc: 'Prodigy of the Uchiha clan, ANBU captain at thirteen, and the most misunderstood shinobi of the Hidden Leaf. He wore the name of a traitor so the village — and his little brother — could live.',
      quote: '“People live their lives bound by what they accept as correct and true.”',
      extra: [
        h('div.stats', {}, PROFILE.map(([k, v]) => h('div.stat', {}, h('span', { text: k }), h('b', { text: v })))),
        this.gestures([['hold', '<b>Hold</b> the eye to awaken it'], ['draw', '<b>Drag</b> through the feathers'], ['tap', '<b>Tap</b> the sky to scatter crows']]),
      ],
    });
    this.modePill = h('div.pill', { html: 'Eye <b>Sharingan</b>' });
    this.ui.append(h('div.hud-corner', {}, this.modePill));
    this.ui.append(h('div.controls', {},
      this.button('Begin the journey →', () => this.app.next(), 'btn-primary'),
    ));
  }

  cycle() {
    this.modeIndex = (this.modeIndex + 1) % MODES.length;
    const mode = MODES[this.modeIndex];
    this.eye.setMode(mode);
    const [name, jp, text] = MODE_INFO[mode];
    this.modePill.innerHTML = `Eye <b>${name}</b>`;
    this.app.toast(`<b>${jp}</b> · ${name}<br>${text}`);
    if (mode === 'mangekyo') { this.app.sfx.mangekyo(); voice.say('mangekyo', { subtitle: false, delay: 0.55 }); }
    else if (mode) { this.app.sfx.sharingan(); voice.say('sharingan', { subtitle: false }); }
    else this.app.sfx.whoosh();
    this.kick = 1;
    if (mode === 'mangekyo') this.app.bleed();
    // blow feathers away from the eye
    for (const f of this.fData) {
      const d = f.p.clone().sub(this.eyeGroup.position);
      const l = Math.max(d.length(), 0.5);
      f.v.addScaledVector(d.normalize(), 14 / l);
    }
    this.embers.burst(this.eyeGroup.position, 80, { speed: 9, life: [0.6, 1.6], size: [0.06, 0.16], colors: this.emberColors });
  }

  enter() {
    this.kick = 0;
    this.app.sfx.startDrone();
  }

  resize(w, hh) {
    super.resize(w, hh);
    if (!this.built && !this.eyeGroup) return;
    const aspect = w / hh;
    if (aspect > 1.05) {
      this.eyeGroup.position.set(Math.min(3.4, 1.4 + aspect * 1.2), 0.2, 0);
      this.baseZ = 11;
    } else {
      this.eyeGroup.position.set(0, -1.6, 0);
      this.baseZ = 11 / Math.min(1, aspect * 1.45);
    }
    this.camera.position.z = this.baseZ;
  }

  pointerDown() {
    this.pressOnEye = this.app.raycast([this.eye.mesh], false).length > 0;
  }

  pointerMove(p) {
    this.idle = 0;
    const hit = this.app.raycast([this.eye.mesh], false).length > 0;
    this.app.setHover(hit);
    this.eye.targetGlow = hit ? 0.9 : 0.35;
    if (pointerOnPlane(p.ndc, this.camera, this.plane, this.pointerWorld)) {
      this.pointerSpeed = this.pointerWorld.distanceTo(this.lastPointerWorld);
      this.lastPointerWorld.copy(this.pointerWorld);
    }
  }

  click(p) {
    if (this.app.raycast([this.eye.mesh], false).length) {
      this.eye.pulse(0.35);
      this.app.sfx.hover();
      if (!this.holdHinted) { this.holdHinted = true; this.app.toast('Press and <b>hold</b> the eye to awaken it.', 2400); }
      return;
    }
    // scatter feathers around the click
    pointerOnPlane(p.ndc, this.camera, this.plane, this.pointerWorld);
    let n = 0;
    for (const f of this.fData) {
      const d = f.p.clone().sub(this.pointerWorld);
      d.z *= 0.3;
      const l = d.length();
      if (l < 4.5) {
        f.v.addScaledVector(d.normalize(), (4.5 - l) * 4);
        f.rs.multiplyScalar(3);
        n++;
      }
    }
    this.embers.burst(this.pointerWorld, 40, { speed: 5, life: [0.4, 1.1], size: [0.05, 0.12], colors: this.emberColors });
    this.app.sfx.flutter();
    if (n > 3) this.app.sfx.caw();
  }

  update(dt, t) {
    this.idle += dt;
    // press-and-hold on the eye charges the awakening
    const hold = this.trackHold(0.85, this.pressOnEye);
    if (hold.progress > 0) {
      this.eye.targetGlow = 0.6 + hold.progress * 1.2;
      this.eye.spinBoost = Math.max(this.eye.spinBoost, hold.progress * 6);
      this.kick = Math.max(this.kick || 0, hold.progress * 0.35);
      this.grade.ca = 0.012 + hold.progress * 0.05;
    } else this.grade.ca = 0.012;
    if (hold.fired) { this.cycle(); this.app.flash(0.35, 0xff2030); }
    this.eye.update(dt);
    this.sky.userData.uniforms.uTime.value = t;

    // eye looks at pointer (or wanders when idle)
    let tx, ty;
    const gyro = this.app.gyro;
    if (gyro && !this.app.pointer.down) {
      // on a phone the eye follows the tilt: it keeps watching you as the phone turns
      tx = this.eyeGroup.position.x + gyro.x * 4;
      ty = this.eyeGroup.position.y - gyro.y * 2.4;
    } else if (this.idle > 3 || this.app.isTouch) {
      tx = Math.sin(t * 0.4) * 5;
      ty = Math.sin(t * 0.63) * 2.5;
      if (this.app.isTouch && this.app.pointer.down) {
        tx = this.pointerWorld.x; ty = this.pointerWorld.y;
      }
    } else {
      const pw = pointerOnPlane(this.app.pointer.ndc, this.camera, this.lookPlane, new THREE.Vector3());
      tx = pw ? pw.x : 0; ty = pw ? pw.y : 0;
    }
    this.lookTarget.x = damp(this.lookTarget.x, tx, 6, dt);
    this.lookTarget.y = damp(this.lookTarget.y, ty, 6, dt);
    this.lookTarget.z = 7;
    this.eye.group.lookAt(this.lookTarget);

    // rings + tomoe
    this.kick = damp(this.kick || 0, 0, 1.5, dt);
    const spin = 1 + this.kick * 8;
    this.rings.forEach((r, i) => {
      r.rotation.z += dt * (0.1 + i * 0.07) * (i % 2 ? -1 : 1) * spin;
      r.rotation.x = Math.sin(t * 0.3 + i) * 0.35;
    });
    this.tomoe.forEach((m) => {
      m.userData.a -= dt * 0.5 * spin;
      const a = m.userData.a;
      const R = 2.7 - this.kick * 1.2;
      m.position.set(Math.cos(a) * R, Math.sin(a) * R, Math.sin(a * 2 + t) * 0.3);
      m.rotation.set(0, 0, a + Math.PI);
    });
    this.bloom.strength = 0.85 + this.kick * 1.4;

    // camera parallax
    const pn = this.app.pointer.ndc;
    this.camera.position.x = damp(this.camera.position.x, this.app.isTouch ? 0 : pn.x * 0.7, 3, dt);
    this.camera.position.y = damp(this.camera.position.y, this.app.isTouch ? 0 : pn.y * 0.45, 3, dt);
    this.camera.lookAt(this.eyeGroup.position.x * 0.35, this.eyeGroup.position.y * 0.3, 0);
    // a touch of depth: the village behind shifts a little with the tilt (the eye and camera stay put)
    const [farL, nearL] = this.skyline.children;
    const gx = gyro ? gyro.x : 0, gy = gyro ? gyro.y : 0;
    nearL.position.x = damp(nearL.position.x, -gx * 1.6, 4, dt);
    farL.position.x = damp(farL.position.x, -gx * 0.8, 4, dt);
    nearL.position.y = damp(nearL.position.y, -12.5 + gy * 0.6, 4, dt);

    // feathers
    const pw = this.pointerWorld;
    const pushing = (!this.app.isTouch || this.app.pointer.down) && (this.pointerSpeed || 0) > 0.02;
    this.fData.forEach((f, i) => {
      if (pushing) {
        const dx = f.p.x - pw.x, dy = f.p.y - pw.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 6 && Math.abs(f.p.z) < 5) {
          const k = (1 - d2 / 6) * 22 * dt * Math.min(this.pointerSpeed * 8, 2);
          f.v.x += dx * k; f.v.y += dy * k;
          f.rs.x += rand(-2, 2) * k;
        }
      }
      f.v.x += (Math.sin(t * 1.2 + f.ph) * 0.6 + (gyro ? gyro.x * 2.2 : 0) - f.v.x) * dt * 0.8; // tilt is a breeze
      f.v.y += (-0.6 - f.v.y) * dt * 0.8;
      f.v.z *= 1 - dt * 0.8;
      f.p.addScaledVector(f.v, dt);
      f.rs.multiplyScalar(1 - dt * 0.3);
      if (f.rs.length() < 0.6) f.rs.setLength(0.6);
      f.r.x += f.rs.x * dt; f.r.y += f.rs.y * dt; f.r.z += f.rs.z * dt * 0.5;
      if (f.p.y < -9 || Math.abs(f.p.x) > 20) Object.assign(f, this._newFeather());
      this.dummy.position.copy(f.p);
      this.dummy.rotation.copy(f.r);
      this.dummy.scale.setScalar(f.s);
      this.dummy.updateMatrix();
      this.feathers.setMatrixAt(i, this.dummy.matrix);
    });
    this.feathers.instanceMatrix.needsUpdate = true;
    this.pointerSpeed = damp(this.pointerSpeed || 0, 0, 8, dt);

    // embers
    if (Math.random() < dt * 30) {
      this.embers.emit({
        x: rand(-14, 14), y: -7, z: rand(-8, 3), vx: rand(-0.2, 0.2), vy: rand(0.6, 1.6), vz: 0,
        life: rand(4, 8), size: rand(0.04, 0.1), color: this.emberColors[Math.floor(rand(0, 3))], alpha: 0.9,
      });
    }
    this.embers.update(dt, t);
  }
}
