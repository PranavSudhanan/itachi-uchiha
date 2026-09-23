import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { SharinganEye } from '../objects/Eye.js';
import { ParticlePool } from '../objects/Particles.js';
import { createCrowGeometry, createCrowMaterial, addPhases } from '../objects/Crow.js';
import { rand, damp, TAU, h, shuffle, pick } from '../core/utils.js';
import { QUIZ, TRIVIA } from '../data/content.js';

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
    this.bloom = { strength: 1.0, radius: 0.6, threshold: 0.5 };
    this.mood = 'mystic';
    this.trail = false;
    this.state = 'start';
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color(0x080309);
    s.fog = new THREE.FogExp2(0x080309, 0.04);
    s.add(new THREE.AmbientLight(0x442233, 1));

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
    const pn = this.app.pointer.ndc;
    this.eye.group.rotation.y = damp(this.eye.group.rotation.y, (this.app.isTouch ? Math.sin(t * 0.5) * 0.3 : pn.x * 0.5) + 0.25, 5, dt);
    this.eye.group.rotation.x = damp(this.eye.group.rotation.x, this.app.isTouch ? 0 : -pn.y * 0.35, 5, dt);
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
