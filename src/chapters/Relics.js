import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Chapter } from '../core/Chapter.js';
import { ParticlePool } from '../objects/Particles.js';
import { drawTexture, drawLeaf, cloudShape, damp, rand, TAU, h, glowTexture, clamp } from '../core/utils.js';
import { RELICS } from '../data/content.js';

const R = 4.2;

export class Relics extends Chapter {
  constructor(app) {
    super(app, { id: 'relics', title: 'Relics', jp: '遺品' });
    this.bloom = { strength: 0.55, radius: 0.4, threshold: 0.92 };
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
    s.background = new THREE.Color(0x0a0509);
    s.fog = new THREE.Fog(0x0a0509, 12, 30);

    const pmrem = new THREE.PMREMGenerator(this.app.renderer);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.45;

    s.add(new THREE.HemisphereLight(0x5a3a4a, 0x0a0406, 1.2));
    const spot = new THREE.SpotLight(0xfff0e8, 70, 30, 0.5, 0.6, 1.5);
    spot.position.set(0, 12, 8);
    spot.target.position.set(0, 0, R);
    spot.castShadow = !this.app.low;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    s.add(spot, spot.target);
    const rim = new THREE.PointLight(0xff1a2a, 30, 20);
    rim.position.set(0, 3, -2);
    s.add(rim);

    // floor
    const floorTex = drawTexture(1024, 1024, (x, w) => {
      x.fillStyle = '#140a0e'; x.fillRect(0, 0, w, w);
      x.translate(w / 2, w / 2);
      for (let r = 60; r < 512; r += 62) {
        x.strokeStyle = `rgba(208,20,42,${0.35 - r / 2000})`;
        x.lineWidth = r % 124 === 60 ? 3 : 1;
        x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke();
      }
      x.fillStyle = 'rgba(208,20,42,0.25)';
      x.font = '900 120px "Noto Serif JP"'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('写', 0, 0);
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

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

    const pedMat = new THREE.MeshStandardMaterial({ color: 0x1d1418, roughness: 0.7, metalness: 0.2 });
    const glowRing = new THREE.MeshBasicMaterial({ color: 0xff2233 });
    this.items = RELICS.map((r, i) => {
      const a = (i / RELICS.length) * TAU;
      const holder = new THREE.Group();
      holder.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
      holder.rotation.y = a;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.75, 0.9, 32), pedMat);
      ped.position.y = 0.45;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.015, 6, 64), glowRing.clone());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.91;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff2030, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.set(2.4, 2.4, 1);
      halo.position.y = 1.6;
      const obj = builders[r.key]();
      const spin = new THREE.Group();
      spin.add(obj);
      spin.position.y = 1.65;
      holder.add(ped, ring, halo, spin);
      holder.traverse((o) => { o.userData.index = i; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
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
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.58, 0.06), [
      this._metal(), this._metal(), this._metal(), this._metal(),
      new THREE.MeshStandardMaterial({ map: tex, metalness: 0.7, roughness: 0.42 }), this._metal(),
    ]);
    g.add(plate);
    const cloth = new THREE.MeshStandardMaterial({ color: 0x1a2236, roughness: 0.9, side: THREE.DoubleSide });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.5, 40, 1, true, Math.PI * 0.22, Math.PI * 1.56), cloth);
    band.position.z = -0.72;
    g.add(band);
    for (const sgn of [-1, 1]) {
      const tailGeo = new THREE.PlaneGeometry(0.22, 1.1, 1, 10);
      const pos = tailGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getY(i) + 0.55) * 3) * 0.12);
      tailGeo.computeVertexNormals();
      const tail = new THREE.Mesh(tailGeo, cloth);
      tail.position.set(sgn * 0.12, -0.45, -1.35);
      tail.rotation.z = sgn * 0.25;
      g.add(tail);
    }
    g.scale.setScalar(0.85);
    return g;
  }

  _ring() {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 24, 80), this._metal(0xcfa55a, 0.25));
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
      this._metal(0xcfa55a, 0.25),
      new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.25, metalness: 0.2, emissive: 0x400008 }),
      this._metal(0xcfa55a, 0.25),
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
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 }), this._metal(0x5a5f68, 0.22));
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
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0 }));
      b.position.y = 0.45 - i * 0.4;
      b.scale.y = 0.92;
      g.add(b);
    });
    g.rotation.z = -0.3;
    return g;
  }

  _cloud() {
    const g = new THREE.Group();
    const opts = { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 24 };
    const red = new THREE.Mesh(new THREE.ExtrudeGeometry(cloudShape(0.62), opts), new THREE.MeshStandardMaterial({ color: 0xc1121f, roughness: 0.5, emissive: 0x3a0005 }));
    const white = new THREE.Mesh(new THREE.ExtrudeGeometry(cloudShape(0.72), { ...opts, depth: 0.08 }), new THREE.MeshStandardMaterial({ color: 0xf3efe8, roughness: 0.6 }));
    red.geometry.center(); white.geometry.center();
    white.position.z = -0.06;
    g.add(white, red);
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
        it.spin.rotation.y = damp(it.spin.rotation.y, it.ry + t * 0.15, 8, dt);
        it.spin.rotation.x = damp(it.spin.rotation.x, it.rx, 8, dt);
      } else {
        it.spin.rotation.y += dt * (isHover ? 1.8 : 0.5);
        it.spin.rotation.x = damp(it.spin.rotation.x, 0, 3, dt);
      }
      const s = isFocus ? 1.45 : isHover ? 1.4 : 1.25;
      it.spin.scale.setScalar(damp(it.spin.scale.x, s, 8, dt));
      it.halo.material.opacity = damp(it.halo.material.opacity, isFocus ? 0.45 : isHover ? 0.3 : 0.12, 6, dt);
      it.ring.material.color.setHSL(0.99, 1, isFocus || isHover ? 0.6 : 0.4);
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

    this.sparks.update(dt, t);
  }
}
