// Footer: lays the glass newsletter pill and back-to-top button over the panel
// (glass can't be nested, so they are siblings of the panel inside the same root,
// placed on the empty slots the panel leaves for them), and runs the sign-up form.

import { setConfig } from './glass-manager.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function initFooter({ manager, reduceMotion }) {
  const root = document.querySelector('.footer-root');
  const panel = root.querySelector('.footer-panel');
  const form = root.querySelector('.news');
  const toTop = root.querySelector('.to-top');
  const slotNews = panel.querySelector('.fp-slot-news');
  const slotTop = panel.querySelector('.fp-slot-top');

  /* ---- overlay placement ---- */
  function place() {
    const a = offsetIn(slotNews, root);
    form.style.left = `${a.x}px`;
    form.style.top = `${a.y}px`;
    form.style.width = `${slotNews.offsetWidth}px`;
    const b = offsetIn(slotTop, root);
    toTop.style.left = `${b.x}px`;
    toTop.style.top = `${b.y}px`;
    // the pill's radius follows its height (60px desktop, 56px mobile)
    setConfig(form, { cornerRadius: form.offsetHeight / 2 });
    manager.pulse(root, 400);
  }
  let raf = 0;
  const queue = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  const ro = new ResizeObserver(queue);
  ro.observe(panel);
  ro.observe(root);

  /* the label sits above the pill on phones; on wider screens it is the placeholder */
  const label = form.querySelector('.news-label');
  const wide = matchMedia('(min-width: 768px)');
  const setLabel = () => {
    label.classList.toggle('vh', wide.matches);
    form.querySelector('.news-input').placeholder = wide.matches ? 'Get the monthly evidence note' : 'you@company.com';
  };
  wide.addEventListener('change', setLabel);
  setLabel();

  /* ---- back to top ---- */
  toTop.addEventListener('click', () => {
    scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    document.querySelector('.nav .brand')?.focus({ preventScroll: true });
  });

  /* ---- newsletter ---- */
  const input = form.querySelector('.news-input');
  const trap = form.querySelector('input[name=website]');
  const btn = form.querySelector('.news-btn');
  const msg = form.querySelector('.news-msg');
  const say = (kind, text) => {
    msg.className = `news-msg${kind ? ` is-${kind}` : ''}`;
    msg.textContent = text;
  };

  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') && EMAIL.test(input.value.trim())) {
      input.removeAttribute('aria-invalid');
      say('', '');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim().toLowerCase();
    if (!EMAIL.test(email)) {
      input.setAttribute('aria-invalid', 'true');
      say('err', 'That doesn’t look like an email address. Check it and try again.');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    if (trap.value) { say('ok', 'You’re in.'); return; } // bots fill the hidden field: thank them, store nothing
    if (!SUPABASE_URL || !SUPABASE_KEY) { say('err', 'Sign-ups are paused for a moment. Please try again later.'); return; }

    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    say('', 'Subscribing…');
    try {
      const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
      if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`; // legacy anon JWT
      const res = await fetch(`${SUPABASE_URL}/rest/v1/newsletter_subscribers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, source_page: 'causvia-glass footer' }),
      });
      const body = res.ok ? null : await res.json().catch(() => ({}));
      if (res.ok || res.status === 409 || body?.code === '23505') {
        // already subscribed counts as success: never reveal who is on the list
        say('ok', 'You’re in.');
        input.value = '';
      } else if (body?.code === 'P0001') {
        say('err', 'Lots of sign-ups right now. Please try again in a minute.');
      } else {
        say('err', 'We couldn’t save that just now. Please try again in a moment.');
      }
    } catch {
      say('err', 'We couldn’t reach the server. Check your connection and try again.');
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  });
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
