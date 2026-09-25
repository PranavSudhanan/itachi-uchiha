/**
 * Synthesized audio (WebAudio only — no files):
 *  - SFX kit
 *  - An original score: a theme for each scene (shakuhachi, koto, low strings, choir, temple bells,
 *    taiko) with in-scene moods (battle, genjutsu) that take over for a while.
 *  - Optional: licensed audio files you add as public/music/<chapter-id>.mp3 (or .ogg / .m4a / .wav) play for
 *    that scene in place of the score.
 */

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  in: [0, 1, 5, 7, 8], // Miyako-bushi: the old Japanese "in" scale, dark and bare
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
/** A scale degree of a theme (may be negative or past the octave) as MIDI. */
const degMidi = (th, deg, oct = 0) => {
  const sc = SCALES[th.scale];
  const n = sc.length;
  const o = Math.floor(deg / n);
  const d = ((deg % n) + n) % n;
  return th.root + sc[d] + 12 * (o + oct);
};
const note = (th, deg, oct = 0) => mtof(degMidi(th, deg, oct));

/*
 * The score: an original theme for each scene, written for this site (not taken from any soundtrack).
 * Each loops 8 bars: a chord per bar (`prog`, scale degrees), a melody of [degree, beats] pairs (null is a
 * rest) on its lead instrument, a koto pattern over the chord (`arp`: chord-tone index per eighth), taiko
 * probabilities per eighth, and how much low strings, choir and temple bells sit under it.
 */
const THEMES = {
  // the Crow of the Leaf: a lone shakuhachi over low strings, grave and tender
  prologue: {
    bpm: 58, root: 50, scale: 'minor', chord: [0, 2, 4], prog: [0, 5, 2, 6, 0, 3, 4, 0],
    lead: 'flute', leadOct: 2,
    melody: [[4, 3], [5, 1], [4, 2], [2, 2], [1, 3], [2, 1], [0, 4], [4, 3], [5, 1], [6, 2], [7, 2], [5, 3], [4, 1], [4, 4]],
    arp: [0, null, null, 1, null, 2, null, null], arpOct: 1, arpVel: 0.12,
    taiko: null, strings: 0.05, choir: 0, bells: 0.15, bass: true, pad: 340, padGain: 0.035,
  },
  // the path of his life: warm, wistful, koto walking beside the flute
  chronicle: {
    bpm: 66, root: 55, scale: 'major', chord: [0, 2, 4], prog: [0, 4, 5, 3, 0, 4, 3, 4],
    lead: 'flute', leadOct: 1,
    melody: [[2, 1], [4, 1], [5, 2], [4, 1], [2, 1], [1, 2], [0, 1], [1, 1], [2, 2], [4, 4], [5, 1], [4, 1], [5, 2], [7, 2], [6, 2], [4, 2], [2, 2], [1, 2], [0, 2]],
    arp: [0, 1, 2, 1, 3, 2, 1, 2], arpOct: 1, arpVel: 0.1,
    taiko: null, strings: 0.035, choir: 0, bells: 0.05, bass: true, pad: 420, padGain: 0.03,
  },
  // the shrine hall: temple bells carry the tune, very still
  relics: {
    bpm: 52, root: 52, scale: 'in', chord: [0, 2, 5], prog: [0, 0, 3, 3, 0, 0, 1, 1],
    lead: 'bells', leadOct: 2,
    melody: [[4, 4], [3, 2], [2, 2], [null, 4], [1, 2], [0, 2], [null, 8], [4, 2], [5, 2], [4, 4], [null, 4]],
    arp: [0, null, null, null, 1, null, null, null], arpOct: 1, arpVel: 0.08,
    taiko: null, strings: 0.03, choir: 0.02, bells: 0, bass: false, pad: 300, padGain: 0.04,
  },
  // the clearing: a driving koto ostinato and light drums, the flute determined
  training: {
    bpm: 84, root: 57, scale: 'minor', chord: [0, 2, 4], prog: [0, 0, 5, 6, 0, 0, 3, 4],
    lead: 'flute', leadOct: 1,
    melody: [[0, 1], [2, 1], [4, 2], [3, 1], [2, 1], [0, 2], [4, 1], [5, 1], [6, 2], [4, 4], [0, 1], [2, 1], [4, 2], [3, 1], [4, 1], [5, 2], [4, 1], [2, 1], [1, 2], [0, 4]],
    arp: [0, 1, 2, 1, 3, 2, 1, 2], arpOct: 0, arpVel: 0.1,
    taiko: [0.9, 0, 0.3, 0, 0.6, 0, 0.3, 0.2], strings: 0.03, choir: 0, bells: 0, bass: true, pad: 520, padGain: 0.03,
  },
  // the ambush: no tune, only a pulse, a heartbeat drum and strings that won't resolve
  precognition: {
    bpm: 92, root: 48, scale: 'minor', chord: [0, 2, 4], prog: [0, 0, 1, 0, 0, 0, 5, 4],
    lead: null, melody: null,
    arp: [0, null, 0, null, 0, null, 1, null], arpOct: 0, arpVel: 0.07,
    taiko: [0.9, 0, 0.55, 0, 0, 0, 0, 0], strings: 0.045, choir: 0, bells: 0, bass: false, pulse: true, pad: 600, padGain: 0.04,
  },
  // the murder of crows: a flute that circles and dives, bells, dusk
  crows: {
    bpm: 70, root: 54, scale: 'in', chord: [0, 2, 5], prog: [0, 0, 3, 2, 0, 0, 1, 0],
    lead: 'flute', leadOct: 1,
    melody: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [3, 2], [2, 1], [3, 1], [2, 1], [1, 1], [0, 4], [4, 1], [3, 1], [4, 1], [5, 1], [6, 2], [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]],
    arp: [0, null, 1, null, null, 2, null, 1], arpOct: 1, arpVel: 0.09,
    taiko: [0.35, 0, 0, 0, 0, 0, 0, 0], strings: 0.03, choir: 0.015, bells: 0.3, bass: true, pad: 320, padGain: 0.04,
  },
  // black flames: low strings carrying a heavy line, a choir, a single drum each bar
  amaterasu: {
    bpm: 56, root: 49, scale: 'minor', chord: [0, 2, 4], prog: [0, 0, 5, 5, 3, 3, 4, 4],
    lead: 'strings', leadOct: 0,
    melody: [[0, 4], [1, 2], [-1, 2], [0, 8], [2, 4], [1, 2], [0, 2], [-2, 8]],
    arp: null, taiko: [1, 0, 0, 0, 0, 0, 0, 0], strings: 0.05, choir: 0.04, bells: 0, bass: true, pad: 260, padGain: 0.05,
  },
  // the mirror world: bells and a far-off flute over a held choir
  tsukuyomi: {
    bpm: 50, root: 47, scale: 'in', chord: [0, 2, 5], prog: [0, 0, 1, 1, 0, 0, 3, 2],
    lead: 'flute', leadOct: 2,
    melody: [[4, 4], [5, 2], [4, 2], [1, 8], [2, 2], [1, 2], [0, 4], [null, 8]],
    arp: [0, null, null, null, null, null, 2, null], arpOct: 2, arpVel: 0.06,
    taiko: null, strings: 0.02, choir: 0.035, bells: 0.4, bass: false, pad: 240, padGain: 0.045,
  },
  // the Susanoo: drums, strings driving, a choir, the tune rising
  susanoo: {
    bpm: 76, root: 50, scale: 'minor', chord: [0, 2, 4], prog: [0, 5, 3, 4, 0, 5, 6, 4],
    lead: 'strings', leadOct: 1,
    melody: [[0, 2], [4, 2], [3, 1], [2, 1], [1, 2], [2, 2], [4, 2], [7, 4], [6, 2], [5, 1], [4, 1], [5, 2], [4, 2], [2, 2], [1, 2], [0, 4]],
    arp: [0, 0, 1, 0, 2, 0, 1, 0], arpOct: 0, arpVel: 0.08,
    taiko: [1, 0, 0.4, 0, 0.8, 0, 0.5, 0.3], strings: 0.05, choir: 0.045, bells: 0, bass: true, pad: 500, padGain: 0.04,
  },
  // the chamber under the shrine: koto and bells, thoughtful
  trials: {
    bpm: 64, root: 55, scale: 'dorian', chord: [0, 2, 4], prog: [0, 3, 0, 3, 5, 4, 3, 0],
    lead: 'flute', leadOct: 1,
    melody: [[2, 2], [1, 1], [0, 1], [1, 4], [2, 2], [4, 2], [3, 4], [2, 2], [1, 1], [2, 1], [4, 4], [3, 2], [1, 2], [0, 4]],
    arp: [0, null, 1, 2, null, 1, null, 2], arpOct: 1, arpVel: 0.09,
    taiko: null, strings: 0.025, choir: 0, bells: 0.2, bass: true, pad: 380, padGain: 0.03,
  },
  // in-scene moods that take over for a while
  battle: {
    bpm: 112, root: 50, scale: 'minor', chord: [0, 2, 4], prog: [0, 0, 5, 6, 0, 0, 3, 4],
    lead: null, melody: null,
    arp: [0, 1, 2, 1, 0, 2, 1, 2], arpOct: 0, arpVel: 0.1,
    taiko: [1, 0, 0.55, 0.3, 0.9, 0.6, 0.4, 0.5], strings: 0.045, choir: 0.02, bells: 0, bass: true, pad: 800, padGain: 0.04,
  },
  genjutsu: {
    bpm: 44, root: 46, scale: 'in', chord: [0, 1, 3], prog: [0, 0, 1, 0],
    lead: 'bells', leadOct: 2,
    melody: [[4, 2], [3, 2], [1, 4], [null, 4], [5, 2], [4, 2], [0, 4], [null, 4]],
    arp: null, taiko: [0.5, 0, 0, 0, 0, 0, 0, 0], strings: 0.03, choir: 0.05, bells: 0, bass: false, pad: 200, padGain: 0.06,
  },
};
// older mood names map onto the nearest theme
THEMES.calm = THEMES.chronicle;
THEMES.mystic = THEMES.crows;
THEMES.tension = THEMES.precognition;
const OVERRIDES = new Set(['battle', 'genjutsu']);
const MUSIC_EXT = ['mp3', 'ogg', 'm4a', 'wav'];
const SFX_KEY = { root: 50, scale: 'minor' }; // D: the key the effects' bells ring in
const pick = (a) => a[Math.floor(Math.random() * a.length)];

class AudioEngine {
  constructor() {
    this.ctx = null;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('itachi-audio') || '{}'); } catch (_) { /* ignore */ }
    this.muted = !!saved.muted;
    this.musicOn = saved.music !== false;
    this.mood = 'calm';
    this.theme = 'prologue';
    this.scene = null;
    this.step = 0;
    this.mIdx = 0; this.mLeft = 0; this.mLoop = 0;
    this._tracks = new Map(); // chapter id -> url of a user-supplied file, or null
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
    // the eye techniques' ring runs through its own gain so a spoken line can duck it
    this.eyeBus = ctx.createGain();
    this.eyeBus.connect(this.sfxBus);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
    this.musicBus.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.55;
    this.reverb.connect(this.reverbGain).connect(this.musicBus);

    this._noise = this._makeNoise();
    this.trackGain = ctx.createGain();
    this.trackGain.gain.value = 0;
    this.trackGain.connect(this.musicBus);
    this._startPad();
    if (this.scene) this.setScene(this.scene, this.mood);
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

  /** A scene begins: its own theme (or the file you supplied for it). */
  setScene(id, mood) {
    this.scene = id;
    this.mood = mood || this.mood;
    if (!this.ctx) return;
    this._theme(THEMES[id] ? id : this.mood);
    this._loadTrack(id);
  }

  /** In-scene moods: battle and genjutsu take over; anything else returns to the scene's own theme. */
  setMood(m) {
    this.mood = m;
    if (!this.ctx) return;
    this._theme(OVERRIDES.has(m) || !THEMES[this.scene] ? m : this.scene);
    if (this.scene) this._loadTrack(this.scene);
  }

  _theme(key) {
    if (!THEMES[key] || key === this.theme) return;
    this.theme = key;
    const th = THEMES[key];
    const t = this.ctx.currentTime;
    this.padFilter.frequency.setTargetAtTime(th.pad, t, 1.2);
    this.padGain.gain.setTargetAtTime(this.track ? 0 : th.padGain, t, 1.2);
    // the drone moves to the new key
    this.padOsc.forEach(({ o, deg, oct }) => o.frequency.setTargetAtTime(note(th, deg, oct), t, 0.8));
    // the new theme starts from its first bar on the next step
    this.step = 0; this.mIdx = 0; this.mLeft = 0; this.mLoop = 0;
    this.swell();
  }

  /* ---------------- user-supplied music ---------------- */

  /**
   * Which file (if any) plays for a scene: public/music/tracks.json maps scene ids to files (one clip can
   * serve several scenes, each at its own level); otherwise public/music/<id>.(mp3|ogg|m4a|wav). The dev
   * server answers missing files with the page, so the content type is checked.
   */
  async _findTrack(id) {
    if (this._tracks.has(id)) return this._tracks.get(id);
    this._tracks.set(id, null);
    if (!this._manifest) {
      this._manifest = fetch('music/tracks.json', { cache: 'no-cache' })
        .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : {}))
        .catch(() => ({}));
    }
    const m = (await this._manifest)[id];
    if (m && m.file) {
      const clip = (e) => ({ url: `music/${e.file}`, gain: e.gain ?? 0.8 });
      const info = clip(m);
      // a scene may name its own clip for an in-scene mood, e.g. "battle" while a trial or fight runs
      info.moods = {};
      for (const k of OVERRIDES) if (m[k] && m[k].file) info.moods[k] = clip(m[k]);
      this._tracks.set(id, info);
      return info;
    }
    for (const ext of MUSIC_EXT) {
      const url = `music/${id}.${ext}`;
      const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' }).catch(() => null);
      if (r && r.ok && (r.headers.get('content-type') || '').startsWith('audio')) {
        const info = { url, gain: 0.8 };
        this._tracks.set(id, info);
        return info;
      }
    }
    return null;
  }

  /** Decoded once and kept, so returning to a scene is instant. */
  _buffer(url) {
    if (!this._buffers) this._buffers = new Map();
    if (!this._buffers.has(url)) {
      this._buffers.set(url, fetch(url).then((r) => r.arrayBuffer()).then((ab) => this.ctx.decodeAudioData(ab)).catch(() => null));
    }
    return this._buffers.get(url);
  }

  async _loadTrack(id) {
    const entry = await this._findTrack(id);
    // the clip for the scene's current mood, if it has one, else its own
    const info = entry && (entry.moods?.[this.mood] || entry);
    const buf = info ? await this._buffer(info.url) : null;
    if (this.scene !== id || (entry && info !== (entry.moods?.[this.mood] || entry))) return; // moved on while loading
    const t = this.ctx.currentTime;
    const old = this.track;
    if (old && info && old.url === info.url) {
      // the same piece carries on across scenes that share it; only its level changes
      old.gain.gain.setTargetAtTime(info.gain, t, 0.8);
      return;
    }
    if (old) this._stopTrack(old);
    this.track = null;
    if (!info || !buf) {
      this.padGain.gain.setTargetAtTime(THEMES[this.theme].padGain, t, 1.2);
      return;
    }
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.trackGain);
    this.trackGain.gain.value = 1;
    this.track = { url: info.url, buf, gain, voices: [], next: t + 0.05 };
    this._queueLoop(this.track);
    gain.gain.setTargetAtTime(info.gain, t, 0.9);
    this.padGain.gain.setTargetAtTime(0, t, 0.6); // the score steps aside
  }

  /**
   * Short clips loop seamlessly: each pass fades in and out over a few seconds, and the next pass starts
   * before the last one ends, so the seam is a crossfade instead of a jump.
   */
  _queueLoop(tr) {
    const X = Math.min(3, tr.buf.duration * 0.12);
    while (tr.next < this.ctx.currentTime + 4) {
      const at = tr.next;
      const src = this.ctx.createBufferSource();
      src.buffer = tr.buf;
      const g = this.ctx.createGain();
      const end = at + tr.buf.duration;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + X);
      g.gain.setValueAtTime(1, end - X);
      g.gain.linearRampToValueAtTime(0, end);
      src.connect(g).connect(tr.gain);
      src.start(at);
      src.stop(end + 0.05);
      tr.voices.push(src);
      src.onended = () => { tr.voices = tr.voices.filter((v) => v !== src); };
      tr.next = end - X;
    }
  }

  _stopTrack(tr) {
    tr.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
    setTimeout(() => { tr.voices.forEach((v) => { try { v.stop(); } catch (_) { /* already stopped */ } }); tr.gain.disconnect(); }, 2600);
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
    const th0 = THEMES[this.theme];
    this.padFilter.frequency.value = th0.pad;
    this.padFilter.Q.value = 0.7;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padGain.gain.linearRampToValueAtTime(th0.padGain, ctx.currentTime + 5);
    this.padOsc = [[0, -1, 'sawtooth', -6], [0, -1, 'sawtooth', 6], [4, -1, 'triangle', 0], [0, -2, 'sine', 0]].map(([deg, oct, type, det]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = note(th0, deg, oct);
      o.detune.value = det;
      o.connect(this.padFilter);
      o.start();
      return { o, deg, oct };
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

  /** Bowed strings: detuned saws through a soft low-pass, slow to speak and slow to fade. */
  strings(freqs, t, dur, vel = 0.05, bright = 1) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100 * bright;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(0.9, dur * 0.3));
    g.gain.setValueAtTime(vel, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
    for (const fr of freqs) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det + (Math.random() - 0.5) * 4;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 1.3);
      }
    }
    f.connect(g);
    this._out(g, { reverb: 0.55 });
  }

  /** A wordless choir, "ah": buzzy voices through two vowel formants, a slow vibrato. */
  choir(freqs, t, dur, vel = 0.04) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(1.4, dur * 0.4));
    g.gain.setValueAtTime(vel, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.6);
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'bandpass';
    f1.frequency.value = 700; f1.Q.value = 5;
    f2.frequency.value = 1150; f2.Q.value = 7;
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = 4.6; vg.gain.value = 5;
    vib.connect(vg);
    for (const fr of freqs) {
      for (const det of [-9, 0, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det;
        vg.connect(o.detune);
        o.connect(f1); o.connect(f2);
        o.start(t);
        o.stop(t + dur + 1.7);
      }
    }
    vib.start(t); vib.stop(t + dur + 1.7);
    f1.connect(g); f2.connect(g);
    this._out(g, { reverb: 0.8 });
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
    if (this.track) this._queueLoop(this.track);
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      const spb = 60 / THEMES[this.theme].bpm / 2; // an eighth note
      if (this.musicOn && !this.muted && !this.track) this._playStep(this.step, this.nextTime, spb);
      this.nextTime += spb * (this.step % 2 ? 0.95 : 1.05); // a breath of swing
      this.step++;
    }
  }

  _playStep(s, t, spb) {
    const th = THEMES[this.theme];
    const beat = s % 8;
    const bar = Math.floor(s / 8);
    const chordRoot = th.prog[bar % th.prog.length];
    const tone = (i, oct = 0) => note(th, chordRoot + th.chord[i % th.chord.length], oct + Math.floor(i / th.chord.length));
    if (beat === 0) {
      const barDur = spb * 8;
      if (th.bass) this.koto(tone(0, -1), t, 0.26, 0.45);
      if (th.strings) this.strings([tone(0, -1), tone(1, -1), tone(2, -1)], t, barDur * 1.05, th.strings);
      if (th.choir) this.choir([tone(0, 0), tone(2, 0)], t, barDur * 1.05, th.choir);
      if (th.bells && Math.random() < th.bells) this.bell(tone(pick([0, 1, 2]), 2), t + spb * pick([0, 2, 4, 6]), 0.05);
    }
    if (th.arp && th.arp[beat] != null) this.koto(tone(th.arp[beat], th.arpOct), t, th.arpVel * (0.8 + Math.random() * 0.4), 1);
    if (th.taiko && Math.random() < th.taiko[beat]) this.taiko(t, 0.3 + th.taiko[beat] * 0.4);
    if (th.pulse) this.koto(tone(0, -1), t, beat % 2 ? 0.05 : 0.09, 0.35);
    // the tune: written phrases, looping; on later passes a note now and then leaps up an octave
    if (th.melody && th.lead) {
      if (this.mLeft <= 0) {
        const [deg, beats] = th.melody[this.mIdx % th.melody.length];
        this.mIdx++;
        if (this.mIdx % th.melody.length === 0) this.mLoop++;
        this.mLeft = beats * 2;
        if (deg != null) {
          const lift = this.mLoop % 2 === 1 && Math.random() < 0.12 ? 1 : 0;
          const f = note(th, deg, th.leadOct + lift);
          const dur = beats * 2 * spb;
          if (th.lead === 'flute') this.flute(f, t, Math.max(0.35, dur * 0.92), 0.11);
          else if (th.lead === 'strings') this.strings([f], t, dur * 0.95, 0.06, 1.6);
          else if (th.lead === 'bells') this.bell(f, t, 0.09);
        }
      }
      this.mLeft--;
    }
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
    if (this.ctx) this.bell(note(SFX_KEY, 0, 1), this.ctx.currentTime + 0.05, 0.1);
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
  /** A heartbeat (lub-dub) felt more than heard; `vol` lets a sequence fade. */
  heartbeat(vol = 1) {
    if (!this.ok) return;
    this.tone({ freq: 62, to: 38, type: 'sine', dur: 0.2, vol: 0.55 * vol, attack: 0.008 });
    this.noise({ dur: 0.1, vol: 0.12 * vol, type: 'lowpass', freq: 180, attack: 0.005 });
    this.tone({ freq: 55, to: 34, type: 'sine', dur: 0.22, vol: 0.38 * vol, attack: 0.01, delay: 0.26 });
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

  /** Ducks the eye-technique ring under a spoken line. */
  duckEye(on) {
    if (this.eyeBus) this.eyeBus.gain.setTargetAtTime(on ? 0.3 : 1, this.ctx.currentTime, on ? 0.04 : 0.3);
  }

  /**
   * Mangekyō, in the shape of the reference effect, compressed to ~2.4 s so it clears the spoken line:
   * a low tonal swell (~86 Hz with its harmonics) rising into a bright "shing" (noise at ~3 kHz) with a
   * ~170 Hz body, then a shimmering metallic ring of inharmonic partials (3.04, 3.61, 4.18, 6.05 kHz)
   * over a 120 Hz hum.
   */
  mangekyo() {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime, hit = t0 + 0.34;
    if (t0 - (this._mgkT ?? -9) < 0.8) return; // one at a time, never stacked
    this._mgkT = t0;
    const out = (node, reverb) => { node.connect(this.eyeBus); const s = ctx.createGain(); s.gain.value = reverb; node.connect(s).connect(this.reverb); };

    // 1. the swell: a dark saw drone opening up, with a breathy rush
    const sw = ctx.createOscillator(), sw2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), sg = ctx.createGain();
    sw.type = 'sawtooth'; sw.frequency.setValueAtTime(80, t0); sw.frequency.linearRampToValueAtTime(88, hit);
    sw2.type = 'triangle'; sw2.frequency.setValueAtTime(172, t0);
    lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(180, t0); lp.frequency.exponentialRampToValueAtTime(1600, hit);
    sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.24, hit - 0.02); sg.gain.exponentialRampToValueAtTime(0.0001, hit + 0.35);
    sw.connect(lp); sw2.connect(lp); lp.connect(sg); out(sg, 0.15);
    [sw, sw2].forEach((o) => { o.start(t0); o.stop(hit + 0.4); });
    this.noise({ dur: 0.34, vol: 0.12, type: 'bandpass', freq: 400, to: 3200, q: 1.2, attack: 0.32 });

    // 2. the shing and its body
    this.noise({ dur: 0.28, vol: 0.3, type: 'bandpass', freq: 3050, to: 2800, q: 3, attack: 0.003, delay: 0.34 });
    this.noise({ dur: 0.12, vol: 0.14, type: 'highpass', freq: 5000, attack: 0.001, delay: 0.34 });
    this.tone({ freq: 175, to: 82, type: 'sine', dur: 0.45, vol: 0.32, attack: 0.004, delay: 0.34 });

    // 3. the ring: inharmonic partials with a shimmer, fading out by ~2.4 s
    const trem = ctx.createOscillator(), td = ctx.createGain();
    trem.frequency.value = 7.5; td.gain.value = 0.35;
    trem.connect(td);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, hit); rg.gain.exponentialRampToValueAtTime(1.5, hit + 0.01); rg.gain.setTargetAtTime(0, hit + 0.15, 0.5); rg.gain.setTargetAtTime(0, hit + 2.2, 0.03);
    const shim = ctx.createGain(); shim.gain.value = 0.65; td.connect(shim.gain);
    rg.connect(shim); out(shim, 0.35);
    const oscs = [trem];
    [[3040, 0.05], [3607, 0.038], [4177, 0.03], [6050, 0.018], [1520, 0.02]].forEach(([f, a], i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f, hit); o.frequency.exponentialRampToValueAtTime(f * 0.994, hit + 1.9);
      o.detune.value = (i % 2 ? 1 : -1) * 4;
      g.gain.value = a; o.connect(g).connect(rg); oscs.push(o);
    });
    const hum = ctx.createOscillator(), hg = ctx.createGain();
    hum.frequency.value = 120; this._env(hg, hit, 0.05, 0.16, 1.8);
    hum.connect(hg); out(hg, 0.1); oscs.push(hum);
    oscs.forEach((o) => { o.start(hit); o.stop(hit + 2.4); });
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
    this.bell(note(SFX_KEY, 0, -1), this.ctx.currentTime + 1.05, 0.14);
  }
  fizzle() { this.noise({ dur: 0.4, vol: 0.18, type: 'highpass', freq: 2000, to: 6000 }); this.tone({ freq: 300, to: 120, type: 'square', dur: 0.25, vol: 0.05 }); }
  hurt() { this.tone({ freq: 160, to: 60, type: 'square', dur: 0.35, vol: 0.12 }); this.noise({ dur: 0.3, vol: 0.3, freq: 800 }); }
}

export const sfx = new AudioEngine();
