import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCinematicPass } from './CinematicPass.js';
import { sfx } from './Audio.js';
import { shared, damp, h } from './utils.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 60); });
const HOLD_SLOP = 14; // px of movement allowed while "holding"

export class App {
  constructor() {
    this.canvas = document.getElementById('webgl');
    this.hud = document.getElementById('hud');
    this.sfx = sfx;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.isMobile = this.isTouch || Math.min(innerWidth, innerHeight) < 600;
    this.low = this.isMobile;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.width = innerWidth;
    this.height = innerHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.low ? 1.5 : 2));
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setClearColor(0x07030a, 1);
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    const bloomScale = this.low ? 0.4 : 0.6;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width * bloomScale, this.height * bloomScale), 0.9, 0.5, 0.75);
    this.cinePass = createCinematicPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.cinePass);
    this.composer.addPass(new OutputPass());
    this.flashAmt = 0;
    this._tint = new THREE.Color();

    this.chapters = [];
    this.index = -1;
    this.busy = false;
    this.raycaster = new THREE.Raycaster();
    this.pointer = {
      ndc: new THREE.Vector2(), x: this.width / 2, y: this.height / 2,
      down: false, dx: 0, dy: 0, moved: 0, startTime: 0, id: null, type: 'mouse',
      holdTime: 0, path: [], startX: 0, startY: 0,
    };
    this.hovering = false;

    this.cursor = document.getElementById('cursor');
    this.toastEl = document.getElementById('toast');
    this.overlay = document.getElementById('transition');
    this.navEl = document.getElementById('nav');
    this.countEl = document.getElementById('chapter-count');

    // chakra trail overlay + charge ring
    this.trailCanvas = document.getElementById('trail');
    this.trailCtx = this.trailCanvas.getContext('2d');
    this.trail = [];
    this.chargeEl = document.getElementById('charge');
    this.chargeFg = this.chargeEl.querySelector('.fg');
    this._chargeSet = false;

    if (!this.isTouch && !this.reducedMotion) document.body.classList.add('has-cursor');
    this._bindEvents();
    this._bindAudioUI();
    this._resizeTrail();
    this._updatePointScale();
  }

  get current() {
    return this.chapters[this.index];
  }

  add(chapter) {
    this.chapters.push(chapter);
    this.hud.append(chapter.ui);
    return chapter;
  }

  /* ---------------- navigation ---------------- */

  buildNav() {
    this.navEl.innerHTML = '';
    this.navItems = this.chapters.map((c, i) => {
      const b = h('button.nav-item', { type: 'button', 'aria-label': `Chapter ${i + 1}: ${c.title}` },
        h('span.nav-num', { text: String(i + 1).padStart(2, '0') }),
        h('span.nav-label', { text: c.title }),
        h('span.nav-dot'),
      );
      b.addEventListener('click', () => { this.sfx.click(); this.goTo(i); });
      this.navEl.append(b);
      return b;
    });
    document.getElementById('prev-btn').addEventListener('click', () => this.prev());
    document.getElementById('next-btn').addEventListener('click', () => this.next());
    document.querySelectorAll('[data-goto]').forEach((el) =>
      el.addEventListener('click', () => this.goTo(+el.dataset.goto)));
  }

  _syncNav() {
    this.navItems.forEach((b, i) => {
      b.classList.toggle('active', i === this.index);
      if (i === this.index) {
        b.setAttribute('aria-current', 'step');
        if (this.isMobile) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      } else b.removeAttribute('aria-current');
    });
    this.countEl.textContent = `${String(this.index + 1).padStart(2, '0')} / ${String(this.chapters.length).padStart(2, '0')}`;
    const id = this.current.id;
    if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
  }

  ensureBuilt(ch) {
    if (ch.built) return;
    ch.build();
    ch.built = true;
    ch.resize(this.width, this.height);
    try { this.renderer.compile(ch.scene, ch.camera); } catch (e) { /* ignore */ }
  }

  _activate(i) {
    const ch = this.chapters[i];
    this.ensureBuilt(ch);
    this.index = i;
    ch.resize(this.width, this.height);
    ch.active = true;
    ch.enter();
    ch.ui.classList.add('active');
    this.renderPass.scene = ch.scene;
    this.renderPass.camera = ch.camera;
    this.bloomPass.strength = ch.bloom.strength;
    this.bloomPass.radius = ch.bloom.radius;
    this.bloomPass.threshold = ch.bloom.threshold;
    this.setHover(false);
    this.sfx.setMood(ch.mood);
    this._syncNav();
    this._prebuildNext();
  }

  _prebuildNext() {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    const next = this.chapters.find((c) => !c.built);
    if (!next) return;
    idle(() => {
      if (!next.built && !this.busy) {
        this.ensureBuilt(next);
        this._prebuildNext();
      }
    }, { timeout: 2500 });
  }

  start(i = 0) {
    this._activate(i);
    this._last = performance.now();
    this._t = 0;
    requestAnimationFrame(this._tick);
  }

  async goTo(i) {
    const n = this.chapters.length;
    i = ((i % n) + n) % n;
    if (i === this.index || this.busy) return;
    this.busy = true;
    this.sfx.whoosh();
    this.overlay.classList.add('show');
    await wait(this.reducedMotion ? 50 : 580);
    const old = this.current;
    old.active = false;
    old.exit();
    old.ui.classList.remove('active');
    document.getElementById('blood').classList.remove('on');
    this.canvas.classList.remove('blurred');
    this.sfx.charge(0);
    this.trail.length = 0;
    this._activate(i);
    await frame();
    await frame();
    this.overlay.classList.remove('show');
    await wait(450);
    this.busy = false;
  }

  next() { this.goTo(this.index + 1); }
  prev() { this.goTo(this.index - 1); }

  /* ---------------- helpers ---------------- */

  raycast(objects, recursive = true) {
    this.raycaster.setFromCamera(this.pointer.ndc, this.current.camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }

  setHover(on) {
    if (on === this.hovering) return;
    this.hovering = on;
    this.cursor.classList.toggle('hover', on);
    this.canvas.style.cursor = on ? 'pointer' : '';
  }

  /** Shows the radial charge ring at the pointer (call every frame while charging). */
  setCharge(p, x = this.pointer.x, y = this.pointer.y) {
    if (p <= 0) return;
    this._chargeSet = true;
    this.chargeEl.style.transform = `translate(${x}px, ${y}px)`;
    this.chargeEl.classList.add('on');
    this.chargeFg.style.strokeDashoffset = String(163.4 * (1 - Math.min(1, p)));
    this.chargeEl.classList.toggle('full', p >= 1);
  }

  flash(amount = 0.6, color = 0xffffff) {
    this.flashAmt = Math.max(this.flashAmt, amount);
    this.cinePass.uniforms.uFlashColor.value.set(color);
  }

  toast(html, ms = 3200) {
    this.toastEl.innerHTML = html;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  bleed() {
    const b = document.getElementById('blood');
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
    clearTimeout(this._bleedT);
    this._bleedT = setTimeout(() => b.classList.remove('on'), 2600);
  }

  /* ---------------- events ---------------- */

  _setPointer(e) {
    const p = this.pointer;
    p.dx = e.clientX - p.x;
    p.dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    p.ndc.set((e.clientX / this.width) * 2 - 1, -(e.clientY / this.height) * 2 + 1);
  }

  _bindEvents() {
    const c = this.canvas;
    const p = this.pointer;

    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (p.id !== null && p.id !== e.pointerId) return;
      this.sfx.unlock();
      p.id = e.pointerId;
      p.type = e.pointerType;
      try { c.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
      this._setPointer(e);
      p.dx = p.dy = 0;
      p.down = true;
      p.moved = 0;
      p.holdTime = 0;
      p.startTime = performance.now();
      p.startX = e.clientX;
      p.startY = e.clientY;
      p.path = [{ x: e.clientX, y: e.clientY, t: p.startTime }];
      this.cursor.classList.add('down');
      if (!this.busy) this.current?.pointerDown(p);
    });

    c.addEventListener('pointermove', (e) => {
      if (p.id !== null && e.pointerId !== p.id) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      this._setPointer(e);
      if (p.down) {
        p.moved += Math.abs(p.dx) + Math.abs(p.dy);
        const now = performance.now();
        for (const ev of events.length ? events : [e]) {
          p.path.push({ x: ev.clientX, y: ev.clientY, t: now });
          if (this.current?.trail !== false) this.trail.push({ x: ev.clientX, y: ev.clientY, t: now });
        }
        if (p.path.length > 400) p.path.splice(0, p.path.length - 400);
      }
      if (!this.busy) this.current?.pointerMove(p);
    });

    const up = (e) => {
      if (e.pointerId !== p.id) return;
      p.id = null;
      this.cursor.classList.remove('down');
      if (!p.down) return;
      p.down = false;
      this._setPointer(e);
      if (this.busy) return;
      const ch = this.current;
      ch?.pointerUp(p);
      const swipe = this._detectSwipe(p);
      let consumed = false;
      if (swipe) consumed = !!ch?.swipe(swipe);
      if (!consumed && p.moved < 10 && performance.now() - p.startTime < 450) ch?.click(p);
      if (e.pointerType !== 'mouse') this.setHover(false);
      p.holdTime = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);

    window.addEventListener('mousemove', (e) => {
      this.cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }, { passive: true });

    document.addEventListener('mouseover', (e) => {
      if (e.target.closest && e.target.closest('button, a, .sign, .option, .trivia-card')) this.cursor.classList.add('hover');
      else if (e.target === c) this.cursor.classList.toggle('hover', this.hovering);
      else this.cursor.classList.remove('hover');
    });

    let wheelAcc = 0;
    let wheelLock = 0;
    window.addEventListener('wheel', (e) => {
      if (e.target.closest && e.target.closest('.card, .quiz, .signs-panel, #nav')) return;
      if (this.busy) { e.preventDefault(); return; }
      if (this.current?.wheel(e)) { e.preventDefault(); return; }
      const now = performance.now();
      if (now < wheelLock) return;
      wheelAcc += e.deltaY;
      clearTimeout(this._wheelReset);
      this._wheelReset = setTimeout(() => (wheelAcc = 0), 200);
      if (Math.abs(wheelAcc) > 120) {
        wheelLock = now + 1300;
        wheelAcc > 0 ? this.next() : this.prev();
        wheelAcc = 0;
      }
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (e.key === 'm' || e.key === 'M') { this.sfx.unlock(); this.sfx.toggleMute(); return; }
      if (this.current?.key(e)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') this.next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.prev();
    });
    window.addEventListener('keyup', (e) => this.current?.keyUp?.(e));

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));
  }

  _detectSwipe(p) {
    const path = p.path;
    if (path.length < 3) return null;
    const last = path[path.length - 1];
    const now = performance.now();
    let i = path.length - 1;
    while (i > 0 && now - path[i].t < 140) i--;
    const from = path[i];
    const dt = Math.max(16, last.t - from.t || now - from.t);
    const vx = (last.x - from.x) / dt;
    const vy = (last.y - from.y) / dt;
    const speed = Math.hypot(vx, vy);
    const dx = last.x - p.startX;
    const dy = last.y - p.startY;
    const dist = Math.hypot(dx, dy);
    if (dist < 45 || speed < 0.45) return null;
    return { x0: p.startX, y0: p.startY, x1: last.x, y1: last.y, dx, dy, vx, vy, speed, dist, path: path.slice() };
  }

  _bindAudioUI() {
    const soundBtn = document.getElementById('sound-btn');
    const musicBtn = document.getElementById('music-btn');
    const sync = () => {
      soundBtn.setAttribute('aria-pressed', String(!this.sfx.muted));
      soundBtn.setAttribute('aria-label', this.sfx.muted ? 'Unmute all sound (M)' : 'Mute all sound (M)');
      musicBtn.setAttribute('aria-pressed', String(this.sfx.musicOn && !this.sfx.muted));
      musicBtn.setAttribute('aria-label', this.sfx.musicOn ? 'Turn music off' : 'Turn music on');
    };
    soundBtn.addEventListener('click', () => { this.sfx.unlock(); this.sfx.toggleMute(); });
    musicBtn.addEventListener('click', () => {
      this.sfx.unlock();
      if (this.sfx.muted) { this.sfx.setMuted(false); this.sfx.setMusic(true); } else this.sfx.toggleMusic();
    });
    this.sfx.onChange(sync);
    sync();
  }

  _updatePointScale() {
    const dpr = this.renderer.getPixelRatio();
    shared.uPointScale.value = (dpr * this.height * 0.5) / Math.tan(THREE.MathUtils.degToRad(25));
    this.cinePass.uniforms.uRes.value.set(this.width * dpr, this.height * dpr);
  }

  _resizeTrail() {
    const dpr = Math.min(devicePixelRatio, 2);
    this.trailCanvas.width = this.width * dpr;
    this.trailCanvas.height = this.height * dpr;
    this.trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _resize() {
    this.width = innerWidth;
    this.height = innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    this._resizeTrail();
    this._updatePointScale();
    for (const ch of this.chapters) if (ch.built) ch.resize(this.width, this.height);
  }

  _drawTrail(now) {
    const ctx = this.trailCtx;
    const life = 320;
    while (this.trail.length && now - this.trail[0].t > life) this.trail.shift();
    if (!this.trail.length && !this._trailDirty) return;
    ctx.clearRect(0, 0, this.width, this.height);
    this._trailDirty = this.trail.length > 0;
    if (this.trail.length < 2) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const color = this.current?.trailColor || '255,40,60';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      const k = 1 - (now - b.t) / life;
      if (k <= 0) continue;
      ctx.strokeStyle = `rgba(${color},${k * 0.22})`;
      ctx.lineWidth = 14 * k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = `rgba(255,${190 + 60 * k},${200 + 55 * k},${k * 0.9})`;
      ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _tick = (now) => {
    requestAnimationFrame(this._tick);
    const dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now;
    this._t += dt;
    shared.uTime.value = this._t;
    const ch = this.current;
    if (!ch) return;

    const p = this.pointer;
    if (p.down && p.moved < HOLD_SLOP) p.holdTime += dt;
    else if (p.down) p.holdTime = 0;

    this._chargeSet = false;
    ch.update(dt, this._t);
    if (!this._chargeSet) { this.chargeEl.classList.remove('on', 'full'); }

    this.bloomPass.strength = damp(this.bloomPass.strength, ch.bloom.strength, 6, dt);
    this.bloomPass.radius = ch.bloom.radius;
    this.bloomPass.threshold = ch.bloom.threshold;
    this.renderer.toneMappingExposure = damp(this.renderer.toneMappingExposure, ch.exposure, 6, dt);

    // colour grade
    const u = this.cinePass.uniforms;
    const g = ch.grade;
    u.uTime.value = this._t;
    u.uGrain.value = damp(u.uGrain.value, g.grain, 4, dt);
    u.uVig.value = damp(u.uVig.value, g.vig, 4, dt);
    u.uCA.value = damp(u.uCA.value, g.ca, 6, dt);
    u.uSat.value = damp(u.uSat.value, g.sat, 5, dt);
    u.uTintAmt.value = damp(u.uTintAmt.value, g.tintAmt, 5, dt);
    u.uTint.value.lerp(this._tint.set(g.tint), 1 - Math.exp(-5 * dt));
    this.flashAmt = damp(this.flashAmt, 0, 7, dt);
    u.uFlash.value = this.flashAmt;

    this.composer.render(dt);
    this._drawTrail(now);
  };
}
