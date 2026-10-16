// Hero signature: a dome lens resting on the word "command".
// Live (WebGL): the library's bevelMode 1 lens, draggable on desktop, static on mobile.
// Fallback: the same lens, static, with a scaled copy of the headline inside it.

import { setConfig } from './glass-manager.js';

const MAGNIFY = 1.32;

export function initHero() {
  const root = document.querySelector('.hero-root');
  const title = root.querySelector('.hero-title');
  const target = title.querySelector('[data-lens-target]');
  const lens = root.querySelector('.lens');
  const hint = root.querySelector('.lens-hint');
  const sub = root.querySelector('.hero-sub');
  let dragged = false;
  let clip = null;

  function place() {
    if (!lens.offsetWidth) return;
    const size = lens.offsetWidth;
    // layout positions inside the root (offsets ignore the intro transforms)
    const { x: tx, y: ty } = offsetIn(target, root);
    const cx = tx + target.offsetWidth * 0.42;
    const cy = ty + target.offsetHeight * 0.52;
    const left = cx - size / 2;
    const top = cy - size / 2;
    lens.style.left = `${left}px`;
    lens.style.top = `${top}px`;

    // hint sits just under the lens, unless that would touch the subhead
    const hintTop = top + size + 12;
    hint.style.left = `${left + size * 0.5 - 8}px`;
    hint.style.top = `${hintTop}px`;
    const subTop = offsetIn(sub, root).y;
    hint.hidden = hintTop + 20 > subTop;

    // the CSS magnifier is always built; CSS hides it while the WebGL lens is live
    buildClone(left, top, size, cx, cy);
  }

  // CSS-only magnifier: a scaled copy of the headline clipped to the lens
  function buildClone(left, top, size, cx, cy) {
    if (!clip) {
      clip = document.createElement('div');
      clip.className = 'lens-clip';
      const copy = title.cloneNode(true);
      copy.removeAttribute('id');
      copy.setAttribute('aria-hidden', 'true');
      clip.appendChild(copy);
      lens.appendChild(clip);
    }
    const copy = clip.firstElementChild;
    const { x, y } = offsetIn(title, root);
    copy.style.width = `${title.offsetWidth}px`;
    copy.style.left = `${x - left}px`;
    copy.style.top = `${y - top}px`;
    copy.style.transformOrigin = `${cx - x}px ${cy - y}px`;
    copy.style.transform = `scale(${MAGNIFY})`;
    lens.classList.add('is-placed');
  }

  lens.addEventListener('pointerdown', () => {
    if (dragged) return;
    dragged = true;
    hint.classList.remove('is-shown');
  });

  const ro = new ResizeObserver(() => { if (!dragged) place(); });
  ro.observe(title);
  place();

  return {
    root,
    /** called right before the glass library starts on this root */
    prepare(_root, mobile) {
      if (!dragged) place();
      const r = lens.offsetWidth / 2;
      setConfig(lens, { floating: !mobile, cornerRadius: r, zRadius: r });
    },
    onLive() {
      const cfg = JSON.parse(lens.dataset.config || '{}');
      if (cfg.floating && !dragged) hint.classList.add('is-shown');
    },
    onStop() {
      hint.classList.remove('is-shown');
    },
  };
}

function offsetIn(el, root) {
  let x = 0;
  let y = 0;
  let node = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return { x, y };
}
