// Scroll reveal: fade + slight rise, 900ms, cubic-bezier(0.22, 1, 0.36, 1).
// When an element has finished revealing, `onSettled` lets the glass take a
// fresh snapshot of it (a snapshot taken while it was invisible would stay blank).

export function initReveal({ still, onSettled }) {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (still) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach((el) => io.observe(el));

  document.addEventListener('transitionend', (e) => {
    if (e.propertyName !== 'opacity') return;
    const el = e.target.closest?.('[data-reveal]');
    if (el && el === e.target) onSettled?.(el);
  });
}
