import './styles/tokens.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/sections.css';

import { env, mq, debug, shared } from './js/env.js';
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

const manager = env.webgl ? new GlassManager({ mobile: env.mobile, shared }) : null;
if (manager && !env.glass) manager.setEnabled(false);
const nav = initNav({ manager, fields });
const hero = initHero();
initLoop({ fields });

initReveal({
  still: env.reduceMotion,
  onSettled(el) {
    manager?.refresh(el);
  },
});

if (env.finePointer && !env.reduceMotion) initCursorLight();

fields.onFrame = () => nav.paintMirror();

async function boot() {
  await document.fonts.ready;
  fields.start();
  if (!manager) return;

  // Let the first paint and the intro settle before the WebGL work starts.
  await new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
  await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 900 }) : setTimeout(r, 300)));

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
  manager.start();

  if (debug) {
    window.__glass = { manager, fields, live: () => manager.liveNames() };
    manager.onChange((names) => console.info('[glass] live:', names.join(', ')));
  }
}

/* respond to preference / breakpoint changes without a reload */
mq.mobile.addEventListener('change', () => {
  fields.setMobile(env.mobile);
  manager?.setMobile(env.mobile);
});
const prefsChanged = () => {
  html.classList.toggle('motion', !env.reduceMotion);
  html.classList.toggle('reduce-transparency', env.reduceTransparency);
  html.classList.toggle('lg-fallback', !env.glass);
  fields.setStill(env.reduceMotion);
  manager?.setEnabled(env.glass);
};
mq.reduceMotion.addEventListener('change', prefsChanged);
mq.reduceTransparency.addEventListener('change', prefsChanged);

boot();
