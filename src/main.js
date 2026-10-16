import './styles/tokens.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/sections.css';

import { env, mq, debug, getSharedGL } from './js/env.js';
import { Fields } from './js/fields.js';
import { GlassManager } from './js/glass-manager.js';
import { initNav } from './js/nav.js';
import { initHero } from './js/hero.js';
import { initLoop } from './js/loop.js';
import { initReveal } from './js/reveal.js';
import { initCursorLight } from './js/cursor-light.js';

const html = document.documentElement;
html.classList.add('js');
html.classList.toggle('motion', !env.reduceMotion);
html.classList.toggle('reduce-transparency', env.reduceTransparency);
html.classList.toggle('lg-fallback', !env.glass);

const fields = new Fields({ mobile: env.mobile, still: env.reduceMotion });
document.querySelectorAll('canvas.field').forEach((c) => fields.add(c));

// Inert until start(): the WebGL context is only created once the page has settled.
const manager = new GlassManager({ mobile: env.mobile });
const nav = initNav({ manager, fields });
const hero = initHero();
initLoop({ fields });

initReveal({
  still: env.reduceMotion,
  onSettled(el) {
    manager.refresh(el);
  },
});

if (env.finePointer && !env.reduceMotion) initCursorLight();

// the nav glass follows the backdrop under it; on scroll it updates every frame (nav.js),
// for the slow drift of the light field ~9 times a second is plenty
let lastMirror = 0;
fields.onFrame = () => {
  const now = performance.now();
  if (now - lastMirror > 110) { lastMirror = now; nav.paintMirror(); }
};

const loaded = () => new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
const idle = (timeout) => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout }) : setTimeout(r, 200)));
const firstInteraction = () => new Promise((r) => {
  const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
  const go = () => { events.forEach((e) => removeEventListener(e, go)); r(); };
  events.forEach((e) => addEventListener(e, go, { passive: true, once: true }));
});

let glassStarted = false;
function startGlass() {
  if (!env.glass) return;
  if (glassStarted) { manager.setEnabled(true); return; }
  const shared = getSharedGL();
  if (!shared) { html.classList.add('lg-fallback'); return; }
  glassStarted = true;
  manager.start(shared);
}

async function boot() {
  await document.fonts.ready;
  fields.start();

  for (const root of document.querySelectorAll('[data-lg-root]')) {
    const name = root.dataset.lgRoot;
    const opts = {
      onLive: (inst) => fields.setInstance(root, inst),
      onStop: () => fields.setInstance(root, null),
    };
    if (name === 'nav') {
      Object.assign(opts, { pinned: true, desktopOnly: true, onLive: () => nav.paintMirror() });
    }
    if (name === 'hero') {
      Object.assign(opts, {
        prepare: hero.prepare,
        onLive: (inst) => { fields.setInstance(root, inst); hero.onLive(); },
        onStop: () => { fields.setInstance(root, null); hero.onStop(); },
      });
    }
    manager.register(root, opts);
  }
  if (debug) {
    window.__glass = { manager, fields, live: () => manager.liveNames() };
    manager.onChange((names) => console.info('[glass] live:', names.join(', ')));
  }

  // First paint and interactivity come first. The CSS glass shows meanwhile; the
  // liquid glass crossfades in once the visitor engages or the page has been calm a moment.
  await loaded();
  await idle(1000);
  await Promise.race([firstInteraction(), new Promise((r) => setTimeout(r, env.mobile ? 6000 : 2200))]);
  startGlass();
}

/* respond to preference / breakpoint changes without a reload */
mq.mobile.addEventListener('change', () => {
  fields.setMobile(env.mobile);
  manager.setMobile(env.mobile);
});
const prefsChanged = () => {
  html.classList.toggle('motion', !env.reduceMotion);
  html.classList.toggle('reduce-transparency', env.reduceTransparency);
  html.classList.toggle('lg-fallback', !env.glass || (glassStarted && !getSharedGL()));
  fields.setStill(env.reduceMotion);
  if (env.glass) startGlass();
  else manager.setEnabled(false);
};
mq.reduceMotion.addEventListener('change', prefsChanged);
mq.reduceTransparency.addEventListener('change', prefsChanged);

boot();
