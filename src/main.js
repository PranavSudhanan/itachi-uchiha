import { App } from './core/App.js';
import { Hero } from './chapters/Hero.js';
import { Chronicle } from './chapters/Chronicle.js';
import { Relics } from './chapters/Relics.js';
import { Training } from './chapters/Training.js';
import { Precognition } from './chapters/Precognition.js';
import { Crows } from './chapters/Crows.js';
import { Amaterasu } from './chapters/Amaterasu.js';
import { Genjutsu } from './chapters/Genjutsu.js';
import { Susanoo } from './chapters/Susanoo.js';
import { Quiz } from './chapters/Quiz.js';

const loader = document.getElementById('loader');
const bar = document.getElementById('loader-progress');
const enterBtn = document.getElementById('enter-btn');
const progress = (p) => { bar.style.width = `${Math.round(p * 100)}%`; };
const frame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 60); });

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (_) {
    return false;
  }
}

async function boot() {
  if (!webglAvailable()) {
    enterBtn.textContent = 'WebGL 2 is not available on this device';
    return;
  }
  progress(0.1);
  // canvas textures need the web fonts to be ready
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('900 64px Cinzel'),
        document.fonts.load('700 64px Cinzel'),
        document.fonts.load('900 64px "Noto Serif JP"', '写輪眼鴉朱'),
        document.fonts.load('600 32px Inter'),
      ]),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
  } catch (_) { /* fall back to system fonts */ }
  progress(0.35);

  const app = new App();
  window.__itachi = app;
  [Hero, Chronicle, Relics, Training, Precognition, Crows, Amaterasu, Genjutsu, Susanoo, Quiz].forEach((C) => app.add(new C(app)));
  app.buildNav();

  const fromHash = app.chapters.findIndex((c) => c.id === location.hash.slice(1));
  const first = fromHash >= 0 ? fromHash : 0;
  await frame();
  app.ensureBuilt(app.chapters[first]);
  progress(0.75);
  await frame();
  app.start(first);
  progress(1);

  enterBtn.disabled = false;
  enterBtn.textContent = 'Enter the genjutsu';
  enterBtn.focus();
  enterBtn.addEventListener('click', () => {
    app.sfx.unlock();
    app.sfx.setMood(app.current.mood);
    loader.classList.add('done');
    if (app.chapters[first].id === 'prologue') setTimeout(() => app.toast('<b>写輪眼</b> — press and <b>hold</b> the eye to awaken it.', 3200), 1200);
  }, { once: true });
}

boot();
