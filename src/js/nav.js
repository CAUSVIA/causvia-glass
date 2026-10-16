// Floating nav: shrink on scroll, mobile menu, and the mirror canvas.
//
// The nav is position:fixed, so its glass root can't contain the page that
// scrolls underneath. The mirror is an invisible canvas inside the nav root
// that we repaint from the section backdrops currently under the nav, so the
// pill bends the real light field passing beneath it.

const BG = '#0B1220';

export function initNav({ manager, fields }) {
  const nav = document.getElementById('nav');
  const root = nav.querySelector('.nav-root');
  const mirror = root.querySelector('.nav-mirror');
  const ctx = mirror.getContext('2d', { alpha: false });
  const menu = nav.querySelector('.nav-menu');
  const sheet = document.getElementById('nav-sheet');

  /* ---- shrink on scroll ---- */
  let scrolled = null;
  const onScroll = () => {
    const now = scrollY > 24;
    if (now !== scrolled) {
      scrolled = now;
      nav.classList.toggle('is-scrolled', now);
      // the pill changes height over ~900ms; keep its glass re-rendering meanwhile
      manager?.pulse(root, 1100);
    }
    queueMirror();
  };

  /* ---- mirror ---- */
  let queued = false;
  function queueMirror() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; paintMirror(); });
  }

  function paintMirror() {
    const inst = manager?.instanceFor(root);
    if (!inst) return;
    const r = root.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (mirror.width !== w || mirror.height !== h) { mirror.width = w; mirror.height = h; }
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    for (const f of fields.fields) {
      const c = f.canvas;
      if (!f.active || !c.width) continue;
      const fr = c.getBoundingClientRect();
      const ix = Math.max(r.left, fr.left);
      const iy = Math.max(r.top, fr.top);
      const ix2 = Math.min(r.right, fr.right);
      const iy2 = Math.min(r.bottom, fr.bottom);
      if (ix2 <= ix || iy2 <= iy) continue;
      const sx = c.width / fr.width;
      const sy = c.height / fr.height;
      ctx.drawImage(
        c,
        (ix - fr.left) * sx, (iy - fr.top) * sy, (ix2 - ix) * sx, (iy2 - iy) * sy,
        ix - r.left, iy - r.top, ix2 - ix, iy2 - iy,
      );
    }
    inst.markChanged(mirror);
  }

  /* ---- mobile menu ---- */
  const setMenu = (open) => {
    menu.setAttribute('aria-expanded', String(open));
    sheet.hidden = !open;
  };
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  sheet.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) { setMenu(false); menu.focus(); }
  });
  matchMedia('(min-width: 768px)').addEventListener('change', () => setMenu(false));

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', queueMirror);
  new ResizeObserver(queueMirror).observe(root);
  requestAnimationFrame(onScroll);

  return { paintMirror: queueMirror, root };
}
