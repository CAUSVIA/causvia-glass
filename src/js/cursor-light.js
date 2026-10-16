// A soft light that follows the cursor on desktop. Eased, never snappy.

export function initCursorLight() {
  const el = document.querySelector('.cursor-light');
  if (!el) return;
  let x = innerWidth / 2;
  let y = innerHeight / 3;
  let tx = x;
  let ty = y;
  let raf = 0;

  const tick = () => {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(tick) : 0;
  };

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    tx = e.clientX;
    ty = e.clientY;
    el.classList.add('is-on');
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => el.classList.remove('is-on'));
}
