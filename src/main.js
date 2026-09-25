import { App } from './core/App.js';
import { Hero } from './chapters/Hero.js';
import { Chronicle } from './chapters/Chronicle.js';
import { Memorial } from './chapters/Memorial.js';
import { Relics } from './chapters/Relics.js';
import { Training } from './chapters/Training.js';
import { Precognition } from './chapters/Precognition.js';
import { Crows } from './chapters/Crows.js';
import { Amaterasu } from './chapters/Amaterasu.js';
import { Genjutsu } from './chapters/Genjutsu.js';
import { Susanoo } from './chapters/Susanoo.js';
import { Quiz } from './chapters/Quiz.js';
import { prefetchItachi } from './objects/ItachiGLB.js';
import { setItachiEnvironment } from './objects/ItachiFace.js';
import { prefetchSusanoo } from './objects/SusanooBody.js';
import { voice } from './core/Voice.js';
import { whenIdle } from './core/Assets.js';

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
  progress(0.4);

  const app = new App();
  setItachiEnvironment(app.renderer);
  window.__itachi = app;
  [Hero, Chronicle, Memorial, Relics, Training, Precognition, Crows, Amaterasu, Genjutsu, Susanoo, Quiz].forEach((C) => app.add(new C(app)));
  app.buildNav();

  const fromHash = app.chapters.findIndex((c) => c.id === location.hash.slice(1));
  const first = fromHash >= 0 ? fromHash : 0;
  const ch = app.chapters[first];
  // only the first chapter's own assets hold up the start (the models, when it is one of theirs)
  await app.prepare(ch);
  progress(0.55);
  await frame();
  app.ensureBuilt(ch);
  progress(0.7);
  // the Enter button waits for the first scene's shaders, so its first frames are smooth
  await Promise.race([Promise.all([ch._compiled, app.passesCompiled]), new Promise((r) => setTimeout(r, 8000))]);
  progress(0.9);
  app.start(first);
  await frame();
  await frame();
  progress(1);
  document.querySelector('.loader-eye')?.classList.add('ready'); // the Sharingan turns into the Mangekyō

  // While the loader waits for the click, the next chapter is built, compiled and uploaded, so the first
  // move on is quick. Once the viewer is in, this stops: building then would freeze the scene they see.
  const next = app.chapters[(first + 1) % app.chapters.length];
  const waiting = () => !loader.classList.contains('done');
  setTimeout(async () => {
    if (!waiting()) return;
    await app.prepare(next);
    if (!waiting() || next.built) return;
    app.ensureBuilt(next);
    await next._compiled;
    if (waiting()) app.warm(next);
  }, 250);

  enterBtn.disabled = false;
  enterBtn.textContent = 'Enter the genjutsu';
  enterBtn.focus();
  enterBtn.addEventListener('click', () => {
    if (app.isTouch) app.tilt.request(); // iOS only asks from inside a tap
    app.sfx.unlock();
    voice.preload();
    app.sfx.setScene(app.current.id, app.current.mood);
    loader.classList.add('done');
    if (app.chapters[first].id === 'prologue') setTimeout(() => app.toast('<b>写輪眼</b> — press and <b>hold</b> the eye to awaken it.', 3200), 1200);
    // the model files download in the background, so the chapters that use them open without waiting
    setTimeout(() => whenIdle(() => { prefetchItachi(); prefetchSusanoo(); }), 1500);
  }, { once: true });
}

boot();
