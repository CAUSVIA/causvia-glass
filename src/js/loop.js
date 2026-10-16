// The loop: seven glass pills on an elliptical orbit (wide screens),
// a vertical list joined by a hairline (narrow screens).

import { syncRadius } from './glass-manager.js';

const TAU = Math.PI * 2;
const ORBIT_H = 720;

export function initLoop({ fields }) {
  const root = document.querySelector('.loop-root');
  const steps = [...root.querySelectorAll(':scope > .step')];
  const note = root.querySelector('.loop-note');
  const mark = root.querySelector('.orbit-mark');
  const owners = steps.map((s) => (s.querySelector('.who-human') ? 'human' : 'ai'));
  const wide = matchMedia('(min-width: 960px)');

  function layout() {
    const orbit = wide.matches;
    root.classList.toggle('is-orbit', orbit);
    root.style.setProperty('--orbit-h', `${ORBIT_H}px`);
    let geo;
    if (orbit) {
      const cs = getComputedStyle(root);
      const padL = parseFloat(cs.paddingLeft);
      const contentW = root.clientWidth - padL - parseFloat(cs.paddingRight);
      const cx = padL + contentW / 2;
      const bottom = note.offsetTop - 8;
      const cy = bottom - ORBIT_H / 2;
      const rx = Math.min((contentW / 2 - 116) / 0.98, 480);
      const ry = 250;
      const points = steps.map((s, i) => {
        const a = -Math.PI / 2 + (i * TAU) / steps.length;
        const x = cx + rx * Math.cos(a);
        const y = cy + ry * Math.sin(a);
        s.style.left = `${Math.round(x - s.offsetWidth / 2)}px`;
        s.style.top = `${Math.round(y - s.offsetHeight / 2)}px`;
        return { x, y };
      });
      if (mark) {
        mark.style.left = `${Math.round(cx - 38)}px`;
        mark.style.top = `${Math.round(cy - 28)}px`;
      }
      geo = { mode: 'orbit', cx, cy, rx, ry, points, owners };
    } else {
      for (const s of steps) { s.style.left = ''; s.style.top = ''; }
      const points = steps.map((s) => ({ x: s.offsetLeft - 18, y: s.offsetTop + 30 }));
      geo = { mode: 'list', points, owners };
    }
    steps.forEach(syncRadius);
    fields.setGeometry(root, geo);
  }

  let raf = 0;
  const queue = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  };
  new ResizeObserver(queue).observe(root);
  wide.addEventListener('change', queue);
  layout();
}
