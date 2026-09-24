/**
 * Synthesized audio (WebAudio only — no files):
 *  - SFX kit
 *  - A generative soundtrack in the Japanese Hirajoshi scale: koto plucks, shakuhachi phrases,
 *    taiko drums, temple bells and a low drone, blended per chapter "mood".
 */

const SCALE = [0, 2, 3, 7, 8]; // Hirajoshi on D: D E F A Bb
const ROOT = 50; // D3
const PROG = [0, -2, 3, 1]; // chord roots (scale degrees), 2 bars each
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const note = (deg, oct = 0) => {
  const n = SCALE.length;
  const o = Math.floor(deg / n);
  const d = ((deg % n) + n) % n;
  return mtof(ROOT + SCALE[d] + 12 * (o + oct));
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Per-mood probabilities per eighth-note step (8 steps per bar). */
const MOODS = {
  calm: {
    koto: [0.9, 0, 0.35, 0.15, 0.6, 0, 0.3, 0.15], kotoOct: 1, flute: 0.75, taiko: null,
    bells: 0.02, pad: 380, padGain: 0.05, bass: true,
  },
  mystic: {
    koto: [0.7, 0, 0.1, 0.3, 0.4, 0.1, 0, 0.3], kotoOct: 1, flute: 0.5, taiko: [0.35, 0, 0, 0, 0, 0, 0, 0],
    bells: 0.12, pad: 300, padGain: 0.06, bass: true,
  },
  tension: {
    koto: [0.8, 0.2, 0.4, 0.2, 0.7, 0.2, 0.5, 0.3], kotoOct: 0, flute: 0.35, taiko: [0.8, 0, 0, 0, 0, 0.45, 0, 0],
    bells: 0.03, pad: 520, padGain: 0.07, bass: true,
  },
  battle: {
    koto: [0.9, 0.5, 0.7, 0.5, 0.9, 0.5, 0.7, 0.6], kotoOct: 0, flute: 0.25, taiko: [1, 0, 0.55, 0, 0.9, 0.6, 0, 0.5],
    bells: 0, pad: 800, padGain: 0.08, bass: true,
  },
  genjutsu: {
    koto: [0.3, 0, 0, 0.2, 0, 0, 0.2, 0], kotoOct: 2, flute: 0.2, taiko: [0.5, 0, 0, 0, 0, 0, 0, 0],
    bells: 0.35, pad: 220, padGain: 0.09, bass: false,
  },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('itachi-audio') || '{}'); } catch (_) { /* ignore */ }
    this.muted = !!saved.muted;
    this.musicOn = saved.music !== false;
    this.mood = 'calm';
    this.step = 0;
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); }
  _emit() {
    try { localStorage.setItem('itachi-audio', JSON.stringify({ muted: this.muted, music: this.musicOn })); } catch (_) { /* ignore */ }
    this.listeners.forEach((fn) => fn(this));
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
    this.musicBus.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.55;
    this.reverb.connect(this.reverbGain).connect(this.musicBus);

    this._noise = this._makeNoise();
    this._startPad();
    this.nextTime = ctx.currentTime + 0.2;
    this._timer = setInterval(() => this._schedule(), 40);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend(); else if (!this.muted) ctx.resume();
    });
  }

  /* ---------------- toggles ---------------- */

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.08);
    this._emit();
  }
  toggleMute() { this.setMuted(!this.muted); }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.3);
    this._emit();
  }
  toggleMusic() { this.setMusic(!this.musicOn); }

  setMood(m) {
    if (!MOODS[m] || m === this.mood) return;
    this.mood = m;
    if (!this.ctx) return;
    const M = MOODS[m];
    const t = this.ctx.currentTime;
    this.padFilter.frequency.setTargetAtTime(M.pad, t, 1.2);
    this.padGain.gain.setTargetAtTime(M.padGain, t, 1.2);
    this.swell();
  }

  /* ---------------- helpers ---------------- */

  get ok() { return !!this.ctx && !this.muted; }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _out(node, { reverb = 0.3, bus = 'music' } = {}) {
    node.connect(bus === 'music' ? this.musicBus : this.sfxBus);
    if (reverb > 0) {
      const s = this.ctx.createGain();
      s.gain.value = reverb;
      node.connect(s).connect(this.reverb);
    }
  }

  /* ---------------- instruments ---------------- */

  _startPad() {
    const ctx = this.ctx;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = MOODS[this.mood].pad;
    this.padFilter.Q.value = 0.7;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padGain.gain.linearRampToValueAtTime(MOODS[this.mood].padGain, ctx.currentTime + 5);
    [[note(0, -1), 'sawtooth', -6], [note(0, -1), 'sawtooth', 6], [note(3, -1), 'triangle', 0], [note(0, -2), 'sine', 0]].forEach(([f, type, det]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(this.padFilter);
      o.start();
    });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.06;
    lg.gain.value = 120;
    lfo.connect(lg).connect(this.padFilter.frequency);
    lfo.start();
    this.padFilter.connect(this.padGain);
    this._out(this.padGain, { reverb: 0.4 });
  }

  koto(freq, t, vel = 0.25, bright = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(9000, freq * 10 * bright), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.5), t + 0.6);
    [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]].forEach(([mult, type, amp]) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * mult * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(freq * mult, t + 0.06);
      og.gain.value = amp;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + 2.4);
    });
    this._env(g, t, 0.004, vel, 2.2);
    f.connect(g);
    this._out(g, { reverb: 0.35 });
  }

  flute(freq, t, dur, vel = 0.12) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o2.type = 'triangle';
    o.frequency.setValueAtTime(freq * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.35);
    o2.frequency.setValueAtTime(freq * 0.94, t);
    o2.frequency.exponentialRampToValueAtTime(freq, t + 0.35);
    const vib = ctx.createOscillator();
    const vg = ctx.createGain();
    vib.frequency.value = 5.2;
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6);
    vib.connect(vg);
    vg.connect(o.frequency);
    vg.connect(o2.frequency);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.18;
    o.connect(g);
    o2.connect(o2g).connect(g);
    // breath
    const n = ctx.createBufferSource();
    n.buffer = this._noise;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = freq * 2;
    nf.Q.value = 1.5;
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    n.connect(nf).connect(ng).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.3);
    g.gain.setValueAtTime(vel, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    [o, o2, vib, n].forEach((s) => { s.start(t, s === n ? Math.random() : undefined); s.stop(t + dur + 0.7); });
    this._out(g, { reverb: 0.6 });
  }

  taiko(t, vel = 0.6) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    this._env(g, t, 0.005, vel, 0.7);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.8);
    const n = ctx.createBufferSource();
    n.buffer = this._noise;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 600;
    const ng = ctx.createGain();
    this._env(ng, t, 0.002, vel * 0.5, 0.12);
    n.connect(nf).connect(ng);
    n.start(t, Math.random());
    n.stop(t + 0.2);
    this._out(g, { reverb: 0.25 });
    this._out(ng, { reverb: 0.2 });
  }

  bell(freq, t, vel = 0.08) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    [[1, 1], [2.76, 0.5], [5.4, 0.25]].forEach(([m, a]) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.frequency.value = freq * m;
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 4);
    });
    this._env(g, t, 0.003, vel, 3.6);
    this._out(g, { reverb: 0.9 });
  }

  swell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 1.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    n.connect(f).connect(g);
    n.start(t, Math.random());
    n.stop(t + 2.5);
    this._out(g, { reverb: 0.6 });
  }

  /* ---------------- sequencer ---------------- */

  _schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const spb = 60 / 72 / 2; // eighth notes at 72 bpm
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      if (this.musicOn && !this.muted) this._playStep(this.step, this.nextTime);
      this.nextTime += spb * (this.step % 2 ? 0.92 : 1.08); // gentle swing
      this.step++;
    }
  }

  _playStep(s, t) {
    const M = MOODS[this.mood];
    const beat = s % 8;
    const bar = Math.floor(s / 8);
    const root = PROG[Math.floor(bar / 2) % PROG.length];
    if (M.bass && beat === 0 && bar % 2 === 0) this.koto(note(root, -1), t, 0.3, 0.5);
    if (Math.random() < M.koto[beat]) {
      const deg = root + pick([0, 1, 2, 3, 4, 5, 7]);
      this.koto(note(deg, M.kotoOct), t, 0.12 + Math.random() * 0.1, 1);
    }
    if (M.taiko && Math.random() < M.taiko[beat]) this.taiko(t, 0.35 + M.taiko[beat] * 0.35);
    if (beat === 0 && bar % 4 === 0 && Math.random() < M.flute) {
      let tt = t + 0.2;
      const n = 2 + Math.floor(Math.random() * 3);
      let deg = root + pick([2, 3, 4]);
      for (let i = 0; i < n; i++) {
        const dur = 0.8 + Math.random() * 1.6;
        this.flute(note(deg, 1), tt, dur);
        tt += dur + 0.15;
        deg += pick([-1, -1, 1, -2, 2]);
      }
    }
    if (Math.random() < M.bells / 4) this.bell(note(root + pick([0, 2, 4, 5]), 2), t);
  }

  /* ---------------- SFX ---------------- */

  tone({ freq = 440, to = null, type = 'sine', dur = 0.25, vol = 0.2, attack = 0.005, delay = 0 } = {}) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    this._env(g, t, attack, vol, dur);
    o.connect(g);
    this._out(g, { bus: 'sfx', reverb: 0.1 });
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  noise({ dur = 0.4, vol = 0.3, type = 'lowpass', freq = 1200, to = null, q = 1, attack = 0.01, delay = 0 } = {}) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, attack, vol, dur);
    s.connect(f).connect(g);
    this._out(g, { bus: 'sfx', reverb: 0.1 });
    s.start(t, Math.random());
    s.stop(t + attack + dur + 0.05);
  }

  startDrone() { /* the pad is part of the soundtrack now */ }

  click() { this.tone({ freq: 880, to: 660, type: 'triangle', dur: 0.08, vol: 0.08 }); }
  hover() { this.tone({ freq: 1320, type: 'sine', dur: 0.05, vol: 0.03 }); }
  whoosh() { this.noise({ dur: 0.45, vol: 0.25, type: 'bandpass', freq: 400, to: 2400, q: 0.8, attack: 0.08 }); }
  swoosh() { this.noise({ dur: 0.25, vol: 0.2, type: 'bandpass', freq: 2500, to: 600, q: 1.2, attack: 0.02 }); }
  slash() { this.noise({ dur: 0.35, vol: 0.4, type: 'bandpass', freq: 4000, to: 500, q: 0.7, attack: 0.01 }); this.tone({ freq: 1800, to: 300, type: 'sawtooth', dur: 0.25, vol: 0.05 }); }
  thud() { this.tone({ freq: 140, to: 50, type: 'sine', dur: 0.25, vol: 0.35 }); this.noise({ dur: 0.08, vol: 0.2, freq: 3000 }); }
  clink() { this.tone({ freq: 2400, to: 1800, type: 'square', dur: 0.06, vol: 0.05 }); this.tone({ freq: 3600, type: 'sine', dur: 0.2, vol: 0.05, delay: 0.01 }); }
  caw() {
    const d = Math.random() * 0.1;
    this.tone({ freq: 620, to: 380, type: 'sawtooth', dur: 0.22, vol: 0.07, delay: d });
    this.noise({ dur: 0.2, vol: 0.08, type: 'bandpass', freq: 1400, q: 6, delay: d });
  }
  flutter() { for (let i = 0; i < 6; i++) this.noise({ dur: 0.06, vol: 0.12, type: 'bandpass', freq: 900 + Math.random() * 600, q: 2, delay: i * 0.045 }); }
  charge(p) {
    if (!this.ok) return;
    if (!this._chargeOsc) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      g.gain.value = 0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      o.connect(f).connect(g);
      this._out(g, { bus: 'sfx', reverb: 0.2 });
      o.start();
      this._chargeOsc = o;
      this._chargeGain = g;
    }
    const t = this.ctx.currentTime;
    this._chargeOsc.frequency.setTargetAtTime(80 + p * 260, t, 0.03);
    this._chargeGain.gain.setTargetAtTime(p > 0 ? 0.03 + p * 0.05 : 0, t, 0.05);
  }
  awaken() {
    this.tone({ freq: 110, to: 55, type: 'sawtooth', dur: 1.2, vol: 0.18, attack: 0.02 });
    this.tone({ freq: 1760, to: 440, type: 'sine', dur: 0.8, vol: 0.08 });
    this.noise({ dur: 0.9, vol: 0.2, type: 'bandpass', freq: 3000, to: 300, q: 2 });
    if (this.ctx) this.bell(note(0, 1), this.ctx.currentTime + 0.05, 0.1);
  }
  flame() { this.noise({ dur: 1.2, vol: 0.28, type: 'lowpass', freq: 300, to: 1200, attack: 0.15 }); this.tone({ freq: 70, to: 40, type: 'sine', dur: 1, vol: 0.2 }); }
  boom() { this.noise({ dur: 1.4, vol: 0.5, type: 'lowpass', freq: 1500, to: 80, attack: 0.01 }); this.tone({ freq: 90, to: 30, type: 'sine', dur: 1.1, vol: 0.45 }); }
  thunder() { this.noise({ dur: 2.8, vol: 0.45, type: 'lowpass', freq: 900, to: 60, attack: 0.02 }); this.noise({ dur: 0.3, vol: 0.3, type: 'highpass', freq: 3000, attack: 0.005 }); }
  chime() { [0, 0.08, 0.16].forEach((d, i) => this.tone({ freq: [660, 880, 1320][i], type: 'sine', dur: 0.5, vol: 0.08, delay: d })); }
  wrong() { this.tone({ freq: 220, to: 110, type: 'square', dur: 0.3, vol: 0.06 }); }
  poof() { this.noise({ dur: 0.6, vol: 0.3, type: 'lowpass', freq: 2000, to: 200, attack: 0.02 }); }
  susanoo() {
    if (!this.ok) return;
    this.tone({ freq: 40, to: 75, type: 'sawtooth', dur: 1.8, vol: 0.2, attack: 0.3 });
    this.tone({ freq: 32, type: 'sine', dur: 1.8, vol: 0.4, attack: 0.15 });
    this.noise({ dur: 1.6, vol: 0.2, type: 'bandpass', freq: 180, to: 900, q: 1.4, attack: 0.35 });
    for (let i = 0; i < 9; i++) this.noise({ dur: 0.05, vol: 0.2, type: 'bandpass', freq: 700 + Math.random() * 900, q: 3, attack: 0.002, delay: 0.1 + Math.random() * 1.1 });
    [110, 164.8, 220, 277.2].forEach((f, k) => this.tone({ freq: f, type: 'sawtooth', dur: 1.9, vol: 0.022, attack: 0.6, delay: 0.1 + k * 0.03 }));
  }
  genjutsu() { this.tone({ freq: 300, to: 40, type: 'sine', dur: 2.2, vol: 0.2, attack: 0.1 }); this.tone({ freq: 2000, to: 80, type: 'triangle', dur: 2.2, vol: 0.05 }); }
  inhale() { this.noise({ dur: 0.9, vol: 0.22, type: 'bandpass', freq: 300, to: 1800, q: 1.2, attack: 0.5 }); this.tone({ freq: 70, to: 140, type: 'sine', dur: 0.9, vol: 0.12, attack: 0.4 }); }
  /** Katon release: a rushing roar that swells, with a low body and crackling fire. */
  roar(dur = 2.5) {
    this.noise({ dur, vol: 0.5, type: 'lowpass', freq: 600, to: 2200, attack: 0.12 });
    this.noise({ dur: dur * 0.9, vol: 0.28, type: 'bandpass', freq: 350, to: 1400, q: 0.7, attack: 0.2 });
    this.noise({ dur: 0.5, vol: 0.35, type: 'highpass', freq: 1500, to: 5000, attack: 0.01 });
    this.tone({ freq: 62, to: 36, type: 'sawtooth', dur, vol: 0.2, attack: 0.08 });
    this.tone({ freq: 48, to: 30, type: 'sine', dur: dur * 0.8, vol: 0.35, attack: 0.03 });
    this.crackle(dur, 70);
  }

  /** Fire crackle: many tiny bright pops scattered over `dur` seconds. */
  crackle(dur = 1.5, n = 40, vol = 0.12) {
    if (!this.ok) return;
    for (let i = 0; i < n; i++) {
      const d = Math.pow(Math.random(), 1.3) * dur;
      this.noise({ dur: 0.012 + Math.random() * 0.03, vol: vol * (0.4 + Math.random()), type: 'bandpass', freq: 1800 + Math.random() * 4500, q: 1.5, attack: 0.001, delay: d });
    }
  }

  /** Hand sign: the sharp cloth-and-palm "shk" of fingers snapping into place, as in the anime. */
  signTone(i = 0) {
    this.noise({ dur: 0.07, vol: 0.32, type: 'bandpass', freq: 2600 + (i % 3) * 300, q: 1.4, attack: 0.002 });
    this.noise({ dur: 0.035, vol: 0.2, type: 'highpass', freq: 5500, attack: 0.001, delay: 0.004 });
    this.tone({ freq: 190, to: 95, type: 'sine', dur: 0.07, vol: 0.18, attack: 0.002 });
    this.tone({ freq: 880 * Math.pow(2, [0, 3, 7, 5, 8, 12][i % 6] / 12), type: 'sine', dur: 0.14, vol: 0.025, delay: 0.01 });
  }

  /** A reversed swell rushing into a hit, the build-up before an eye technique. */
  _rise(dur = 0.4, vol = 0.2, from = 600, to = 7000) {
    this.noise({ dur, vol, type: 'bandpass', freq: from, to, q: 1.1, attack: dur * 0.95 });
  }

  /** Metallic ring built from inharmonic partials (the Sharingan "shing"). */
  _ring(base = 1400, vol = 0.06, dur = 1.4, delay = 0) {
    [[1, 1], [2.32, 0.7], [4.25, 0.45], [6.63, 0.3], [9.1, 0.15]].forEach(([m, a]) =>
      this.tone({ freq: base * m, to: base * m * 0.995, type: 'sine', dur: dur * (1.1 - a * 0.3), vol: vol * a, attack: 0.002, delay }));
  }

  /** Sharingan activating: whoosh up into a bright metallic "shing" over a sub thump. */
  sharingan() {
    if (!this.ok) return;
    this._rise(0.35, 0.18);
    this._ring(1500, 0.07, 1.3, 0.34);
    this.tone({ freq: 95, to: 45, type: 'sine', dur: 0.5, vol: 0.35, attack: 0.004, delay: 0.34 });
    this.noise({ dur: 0.18, vol: 0.18, type: 'highpass', freq: 4000, attack: 0.002, delay: 0.34 });
  }

  /** Mangekyō: slower, darker swell, a deep drop and a lower ring with a temple bell. */
  mangekyo() {
    if (!this.ok) return;
    this._rise(0.7, 0.22, 200, 5000);
    this._ring(700, 0.08, 2.2, 0.68);
    this.tone({ freq: 70, to: 28, type: 'sawtooth', dur: 1.6, vol: 0.14, attack: 0.01, delay: 0.68 });
    this.tone({ freq: 55, to: 30, type: 'sine', dur: 1.3, vol: 0.4, attack: 0.004, delay: 0.68 });
    this.bell(note(0, 0), this.ctx.currentTime + 0.7, 0.1);
  }

  /** Amaterasu: a heavy "fwump" as the black flames catch, then a dark sizzle. */
  amaterasu() {
    if (!this.ok) return;
    this.noise({ dur: 0.7, vol: 0.45, type: 'lowpass', freq: 3500, to: 90, attack: 0.008 });
    this.tone({ freq: 80, to: 32, type: 'sine', dur: 0.9, vol: 0.4, attack: 0.004 });
    this.noise({ dur: 1.8, vol: 0.1, type: 'bandpass', freq: 5000, to: 2500, q: 2, attack: 0.1 });
    this.tone({ freq: 55, type: 'sawtooth', dur: 1.8, vol: 0.06, attack: 0.3 });
    this.crackle(1.6, 30, 0.08);
  }

  /** Tsukuyomi: a reversed cymbal pulling everything in, then time stops on a deep bell. */
  tsukuyomi() {
    if (!this.ok) return;
    this.noise({ dur: 1.1, vol: 0.22, type: 'highpass', freq: 3000, to: 9000, attack: 1.05 });
    this.tone({ freq: 420, to: 35, type: 'sine', dur: 2.6, vol: 0.2, attack: 0.02, delay: 1.05 });
    this.tone({ freq: 1800, to: 60, type: 'triangle', dur: 2.2, vol: 0.05, delay: 1.05 });
    this._ring(520, 0.07, 3, 1.05);
    this.bell(note(0, -1), this.ctx.currentTime + 1.05, 0.14);
  }
  fizzle() { this.noise({ dur: 0.4, vol: 0.18, type: 'highpass', freq: 2000, to: 6000 }); this.tone({ freq: 300, to: 120, type: 'square', dur: 0.25, vol: 0.05 }); }
  hurt() { this.tone({ freq: 160, to: 60, type: 'square', dur: 0.35, vol: 0.12 }); this.noise({ dur: 0.3, vol: 0.3, freq: 800 }); }
}

export const sfx = new AudioEngine();
