import { sfx } from './Audio.js';

/**
 * Jutsu call-outs, spoken in Japanese the way they are in the anime ("Katon: Gōkakyū no Jutsu!").
 *
 * Uses the browser's own speech engine with a Japanese voice (Edge: Keita / Nanami, Chrome: Google 日本語,
 * macOS / iOS: Otoya / Kyoko, Android: built-in). Where no Japanese voice is installed, the line is read
 * phonetically by an English voice instead. A subtitle shows the kanji and romaji either way, and the
 * soundtrack ducks under the line.
 */

// ja = what the Japanese engine reads (kana, so every engine pronounces it right)
// say = phonetic spelling for an English engine, jp / romaji = the subtitle
// ja = what the Japanese engine reads (kana, so every engine pronounces it right)
// say = phonetic spelling for an English engine, jp / romaji = the subtitle
export const LINES = {
  fireball: { ja: 'かとん、ごうかきゅうのじゅつ！', jp: '火遁・豪火球の術', romaji: 'Katon: Gōkakyū no Jutsu!', say: 'Kah-tone! Goh-kah-kyoo no joots!', dur: 1.9 },
  phoenix: { ja: 'かとん、ほうせんかのじゅつ！', jp: '火遁・鳳仙火の術', romaji: 'Katon: Hōsenka no Jutsu!', say: 'Kah-tone! Hoh-sen-kah no joots!', dur: 1.9 },
  summon: { ja: 'くちよせのじゅつ！', jp: '口寄せの術', romaji: 'Kuchiyose no Jutsu!', say: 'Koo-chee-yoh-seh no joots!', dur: 1.3 },
  sharingan: { ja: 'しゃりんがん。', jp: '写輪眼', romaji: 'Sharingan', say: 'Shah-reen-gahn.', dur: 1.0 },
  mangekyo: { ja: 'まんげきょう、しゃりんがん。', jp: '万華鏡写輪眼', romaji: 'Mangekyō Sharingan', say: 'Mahn-geh-kyoh, Shah-reen-gahn.', dur: 1.7 },
  amaterasu: { ja: 'あまてらす。', jp: '天照', romaji: 'Amaterasu', say: 'Ah-mah-teh-rah-soo.', dur: 1.1 },
  tsukuyomi: { ja: 'つくよみ。', jp: '月読', romaji: 'Tsukuyomi', say: 'Tsoo-koo-yoh-mee.', dur: 1.0 },
  izanami: { ja: 'いざなみ。', jp: 'イザナミ', romaji: 'Izanami', say: 'Ee-zah-nah-mee.', dur: 1.0 },
  susanoo: { ja: 'すさのお！', jp: '須佐能乎', romaji: 'Susanoo!', say: 'Soo-sah-noh-oh!', dur: 1.0 },
  totsuka: { ja: 'とつかのつるぎ！', jp: '十拳剣', romaji: 'Totsuka no Tsurugi!', say: 'Toh-tsoo-kah no tsoo-roo-ghee!', dur: 1.4 },
  yata: { ja: 'やたのかがみ。', jp: '八咫鏡', romaji: 'Yata no Kagami', say: 'Yah-tah no kah-gah-mee.', dur: 1.3 },
  kotoamatsukami: { ja: 'ことあまつかみ。', jp: '別天神', romaji: 'Kotoamatsukami', say: 'Koh-toh-ah-mah-tsoo-kah-mee.', dur: 1.4 },
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
    if (!this.synth) return;
    this._pick();
    this.synth.addEventListener?.('voiceschanged', () => this._pick());
    sfx.onChange((a) => { if (a.muted) this.stop(); });
  }

  _pick() {
    const vs = this.synth.getVoices();
    if (!vs.length) return;
    const ja = vs.filter((v) => /^ja/i.test(v.lang));
    // a male voice, then a natural/online one, then anything Japanese
    this.ja = ja.find((v) => MALE_JA.test(v.name)) || ja.find((v) => /natural|online|google/i.test(v.name)) || ja[0] || null;
    const en = vs.filter((v) => /^en/i.test(v.lang));
    this.en = en.find((v) => MALE_EN.test(v.name) && v.localService) || en.find((v) => MALE_EN.test(v.name)) || en[0] || null;
  }

  get japanese() { return !!this.ja; }

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
    if (!this.synth || !sfx.ok) return line.dur;
    if (!this.ja && !this.en) this._pick();
    const go = () => {
      if (!sfx.ok) return;
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(this.ja ? line.ja : line.say);
      const v = this.ja || this.en;
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'ja-JP';
      // Itachi's delivery: low, calm, deliberate
      const male = v && (this.ja ? MALE_JA : MALE_EN).test(v.name);
      u.pitch = male ? 0.72 : 0.45;
      u.rate = this.ja ? 0.92 : 0.82;
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
    this._duck(false);
  }

  _duck(on) {
    if (!sfx.ctx || !sfx.musicBus) return;
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
