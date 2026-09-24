import { sfx } from './Audio.js';

/**
 * Jutsu call-outs, spoken in Japanese the way they are in the anime ("Katon: Gōkakyū no Jutsu!").
 *
 * Recorded clips come first: drop audio you have the rights to into public/audio/voice/ named after the
 * line (fireball.mp3, amaterasu.mp3, … — see LINES; .mp3 .ogg .m4a .wav) and it plays instead of the
 * speech engine, mixed with the game audio (a touch of reverb, the music ducking under it).
 *
 * Uses the browser's own speech engine with a Japanese voice (Edge: Keita / Nanami, Chrome: Google 日本語,
 * macOS / iOS: Otoya / Kyoko, Android: built-in). Where no Japanese voice is installed, the line is read
 * phonetically by an English voice instead. A subtitle shows the kanji and romaji either way, and the
 * soundtrack ducks under the line.
 */

// ja = what the Japanese engine reads (kana, so every engine pronounces it right)
// say = phonetic spelling for an English engine, jp / romaji = the subtitle
// As Itachi says them in the anime: the technique's name alone, calm and clipped, never shouted.
// Single-word names are in katakana so the engine reads each as one word (スサノオ, not "susa no o").
export const LINES = {
  fireball: { ja: 'かとん、ごうかきゅうのじゅつ。', jp: '火遁・豪火球の術', romaji: 'Katon: Gōkakyū no Jutsu', say: 'Kah-tone. Goh-kah-kyoo no joots.', dur: 1.9 },
  phoenix: { ja: 'かとん、ほうせんかつまべに。', jp: '火遁・鳳仙花爪紅', romaji: 'Katon: Hōsenka Tsumabeni', say: 'Kah-tone. Hoh-sen-kah tsoo-mah-beh-nee.', dur: 1.9 },
  summon: { ja: 'くちよせのじゅつ。', jp: '口寄せの術', romaji: 'Kuchiyose no Jutsu', say: 'Koo-chee-yoh-seh no joots.', dur: 1.3 },
  sharingan: { ja: 'シャリンガン。', jp: '写輪眼', romaji: 'Sharingan', say: 'Shah-reen-gahn.', dur: 1.0 },
  mangekyo: { ja: 'マンゲキョウシャリンガン。', jp: '万華鏡写輪眼', romaji: 'Mangekyō Sharingan', say: 'Mahn-geh-kyoh Shah-reen-gahn.', dur: 1.7 },
  amaterasu: { ja: 'アマテラス。', jp: '天照', romaji: 'Amaterasu', say: 'Ah-mah-teh-rah-soo.', dur: 1.1 },
  tsukuyomi: { ja: 'ツクヨミ。', jp: '月読', romaji: 'Tsukuyomi', say: 'Tsoo-koo-yoh-mee.', dur: 1.0 },
  izanami: { ja: 'イザナミ。', jp: 'イザナミ', romaji: 'Izanami', say: 'Ee-zah-nah-mee.', dur: 1.0 },
  susanoo: { ja: 'スサノオ。', jp: '須佐能乎', romaji: 'Susanoo', say: 'Soo-sah-noh-oh.', dur: 1.0 },
  totsuka: { ja: 'とつかのつるぎ。', jp: '十拳剣', romaji: 'Totsuka no Tsurugi', say: 'Toh-tsoo-kah no tsoo-roo-ghee.', dur: 1.4 },
  yata: { ja: 'やたのかがみ。', jp: '八咫鏡', romaji: 'Yata no Kagami', say: 'Yah-tah no kah-gah-mee.', dur: 1.3 },
  kotoamatsukami: { ja: 'コトアマツカミ。', jp: '別天神', romaji: 'Kotoamatsukami', say: 'Koh-toh-ah-mah-tsoo-kah-mee.', dur: 1.4 },
};

const MALE_JA = /keita|ichiro|otoya|takumi|daichi|naoki|hattori|kenji|male/i;
const MALE_EN = /david|mark|guy|daniel|alex|fred|ryan|christopher|eric|uk english male|male/i;

class Voice {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.ja = null;
    this.en = null;
    this.last = new Map();
    this.sub = null;
    this.clips = new Map(); // key → AudioBuffer (recorded lines)
    this._clipsLoading = null;
    if (!this.synth) return;
    this._pick();
    this.synth.addEventListener?.('voiceschanged', () => this._pick());
    sfx.onChange((a) => { if (a.muted) this.stop(); });
  }

  _pick() {
    const vs = this.synth.getVoices();
    if (!vs.length) return;
    const ja = vs.filter((v) => /^ja/i.test(v.lang));
    // a natural (neural) male voice first: they hold a low pitch without turning robotic
    const natural = (v) => /natural|online|neural|premium|enhanced/i.test(v.name);
    this.ja = ja.find((v) => MALE_JA.test(v.name) && natural(v)) || ja.find((v) => MALE_JA.test(v.name))
      || ja.find((v) => /natural|online|google/i.test(v.name)) || ja[0] || null;
    const en = vs.filter((v) => /^en/i.test(v.lang));
    this.en = en.find((v) => MALE_EN.test(v.name) && natural(v)) || en.find((v) => MALE_EN.test(v.name) && v.localService)
      || en.find((v) => MALE_EN.test(v.name)) || en[0] || null;
  }

  get japanese() { return !!this.ja; }

  /** Looks for recorded lines in public/audio/voice/ (call once audio is unlocked). */
  preload() {
    if (this._clipsLoading || !sfx.ctx) return this._clipsLoading;
    const exts = ['mp3', 'ogg', 'm4a', 'wav'];
    const tryKey = async (key) => {
      for (const ext of exts) {
        const url = `./audio/voice/${key}.${ext}`;
        const head = await fetch(url, { method: 'HEAD', cache: 'no-cache' }).catch(() => null);
        if (!head || !head.ok || (head.headers.get('content-type') || '').includes('text/html')) continue;
        try {
          const buf = await (await fetch(url)).arrayBuffer();
          this.clips.set(key, await sfx.ctx.decodeAudioData(buf));
          return;
        } catch (e) { console.warn(`[voice] could not decode ${url}`, e); }
      }
    };
    this._clipsLoading = Promise.all(Object.keys(LINES).map(tryKey)).then(() => this.clips.size);
    return this._clipsLoading;
  }

  /** How long a line runs: the recording's length when there is one. */
  duration(key) {
    const clip = this.clips.get(key);
    return clip ? clip.duration : (LINES[key] ? LINES[key].dur : 0);
  }

  _playClip(buffer) {
    const ctx = sfx.ctx;
    this._stopClip();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 1.1;
    src.connect(g);
    sfx._out(g, { bus: 'sfx', reverb: 0.18 });
    src.onended = () => { if (this._clip === src) { this._clip = null; this._duck(false); } };
    this._duck(true);
    src.start();
    this._clip = src;
  }

  _stopClip() {
    if (this._clip) { try { this._clip.stop(); } catch (_) { /* already stopped */ } this._clip = null; }
  }

  /**
   * Speaks a call-out. `cooldown` (s) stops the same line repeating back to back.
   * Returns the line's approximate length in seconds (0 when nothing was said).
   */
  say(key, { cooldown = 0, subtitle = true, delay = 0 } = {}) {
    const line = LINES[key];
    if (!line) return 0;
    const now = performance.now() / 1000;
    if (cooldown && now - (this.last.get(key) || -1e9) < cooldown) return 0;
    this.last.set(key, now);
    if (subtitle) this._subtitle(line, delay);
    const clip = this.clips.get(key);
    if (clip) {
      if (sfx.ok) {
        if (delay > 0) setTimeout(() => sfx.ok && this._playClip(clip), delay * 1000); else this._playClip(clip);
      }
      return clip.duration;
    }
    if (!this.synth || !sfx.ok) return line.dur;
    if (!this.ja && !this.en) this._pick();
    const go = () => {
      if (!sfx.ok) return;
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(this.ja ? line.ja : line.say);
      const v = this.ja || this.en;
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'ja-JP';
      // Tuned to the reference line: a low, level voice around 90–110 Hz (median ~98 Hz), unhurried.
      // Male engine voices sit near 115 Hz, so a small drop reaches that range; pushing further makes them
      // gravelly and robotic. Female voices can't get there cleanly, so they're only lowered a little.
      const male = v && (this.ja ? MALE_JA : MALE_EN).test(v.name);
      u.pitch = male ? 0.86 : 0.7;
      u.rate = this.ja ? 0.88 : 0.84;
      u.volume = 1;
      u.onstart = () => this._duck(true);
      u.onend = u.onerror = () => this._duck(false);
      this.synth.speak(u);
    };
    if (delay > 0) setTimeout(go, delay * 1000); else go();
    return line.dur;
  }

  stop() {
    if (this.synth) this.synth.cancel();
    this._stopClip();
    this._duck(false);
  }

  _duck(on) {
    if (!sfx.ctx || !sfx.musicBus) return;
    sfx.duckEye(on);
    const target = on ? 0.18 : (sfx.musicOn ? 0.55 : 0);
    sfx.musicBus.gain.setTargetAtTime(target, sfx.ctx.currentTime, on ? 0.05 : 0.4);
  }

  _subtitle(line, delay) {
    if (!this.sub) {
      this.sub = document.createElement('div');
      this.sub.id = 'callout';
      this.sub.setAttribute('aria-live', 'polite');
      this.sub.innerHTML = '<b></b><i></i>';
      document.body.append(this.sub);
    }
    const el = this.sub;
    clearTimeout(this._subT);
    clearTimeout(this._subD);
    this._subD = setTimeout(() => {
      el.querySelector('b').textContent = `「${line.jp}」`;
      el.querySelector('i').textContent = line.romaji;
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
      this._subT = setTimeout(() => el.classList.remove('on'), (line.dur + 1.4) * 1000);
    }, delay * 1000);
  }
}

export const voice = new Voice();
