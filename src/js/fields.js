// Backdrops behind the glass.
//
// Every section root has one <canvas class="field">. It is the opaque base the
// glass library refracts: navy, slow gold (human) and teal (AI) light, aurora
// ribbons, hairline grids, oversized faint type and product-style line art.
// One loop repaints only the fields that are on screen (~20 fps is plenty for
// motion this slow) and tells the section's glass instance what changed.

const BG = '#0B1220';
const GOLD = [212, 175, 55];
const TEAL = [14, 165, 168];
const DEEP = [34, 64, 128]; // depth tone, not an accent
const WHITE = [255, 255, 255];
const TAU = Math.PI * 2;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* ---------------------------------------------------------------- helpers */

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fade everything drawn so far with a radial mask (keeps grids from ending in hard edges). */
function radialMask(ctx, w, h, cx, cy, rad) {
  const r = rad * Math.max(w, h);
  const g = ctx.createRadialGradient(cx * w, cy * h, 0, cx * w, cy * h, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.55, 'rgba(0,0,0,.75)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function grid(ctx, w, h, { step = 72, alpha = 0.05, ox = 0.5, oy = 0.5 } = {}) {
  ctx.save();
  ctx.strokeStyle = rgba(WHITE, alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const x0 = (ox * w) % step;
  const y0 = (oy * h) % step;
  for (let x = x0; x <= w; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
  for (let y = y0; y <= h; y += step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
  ctx.stroke();
  ctx.restore();
}

function dots(ctx, w, h, { step = 24, r = 1, alpha = 0.08 } = {}) {
  ctx.save();
  ctx.fillStyle = rgba(WHITE, alpha);
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  ctx.restore();
}

function bigText(ctx, text, x, y, { size, alpha = 0.05, weight = 600, family = 'Sora', align = 'center', spacing = -0.04 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${family}, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing * size}px`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(WHITE, alpha);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function hline(ctx, x1, x2, y, color, width = 1, dash = null) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, Math.round(y) + 0.5);
  ctx.lineTo(x2, Math.round(y) + 0.5);
  ctx.stroke();
  ctx.restore();
}

/** Layout rect of an element inside its root, in CSS px. Ignores transforms (reveal animations). */
function relRect(el, root) {
  if (!el) return null;
  let x = 0;
  let y = 0;
  let node = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  if (node !== root) return null;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/* ---------------------------------------------------------------- presets
   orb: c colour, x/y position (0..1), r radius (fraction of the field's size),
        a alpha, ax/ay drift amplitude, p period in seconds, ph phase
   ribbon: soft aurora band made of overlapping ellipses along a slow sine     */

const isAnimated = (preset) => Boolean(preset.orbs?.length || preset.ribbons?.length || preset.animate);

const PRESETS = {
  hero: {
    orbs: [
      { c: GOLD, x: 0.16, y: 0.3, r: 0.4, a: 0.34, ax: 0.05, ay: 0.05, p: 58, ph: 0 },
      { c: TEAL, x: 0.84, y: 0.56, r: 0.46, a: 0.34, ax: 0.05, ay: 0.06, p: 66, ph: 2.1 },
      { c: DEEP, x: 0.5, y: 1.0, r: 0.6, a: 0.5, ax: 0.08, ay: 0.02, p: 90, ph: 1 },
    ],
    ribbons: [
      { c: TEAL, a: 0.07, y: 0.66, amp: 0.07, p: 72, ph: 0.4, tilt: -0.12 },
      { c: GOLD, a: 0.05, y: 0.34, amp: 0.05, p: 96, ph: 2.2, tilt: 0.08 },
    ],
    fadeTop: 0,
    static(ctx, w, h) {
      grid(ctx, w, h, { step: 76, alpha: 0.06, ox: 0.5, oy: 0.42 });
      radialMask(ctx, w, h, 0.42, 0.46, 0.62);
      // one gold flight path, very thin
      ctx.save();
      ctx.strokeStyle = rgba(GOLD, 0.22);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(w * 0.58, h * 0.6, w * 0.62, h * 0.2, -0.16, Math.PI * 1.04, Math.PI * 1.96);
      ctx.stroke();
      ctx.restore();
    },
  },

  problem: {
    orbs: [
      { c: TEAL, x: 0.72, y: 0.62, r: 0.36, a: 0.3, ax: 0.05, ay: 0.04, p: 60, ph: 1 },
      { c: GOLD, x: 0.22, y: 0.36, r: 0.3, a: 0.2, ax: 0.04, ay: 0.04, p: 74, ph: 3 },
    ],
    measure(root) {
      return { panel: relRect(root.querySelector('.problem-panel'), root) };
    },
    static(ctx, w, h, geo) {
      grid(ctx, w, h, { step: 64, alpha: 0.045 });
      radialMask(ctx, w, h, 0.5, 0.5, 0.6);
      const p = geo?.panel ?? { y: h * 0.25, h: h * 0.5, cy: h * 0.5 };
      const size = Math.min(w * 0.46, 600);
      bigText(ctx, '41%', w * 0.5, p.cy, { size, alpha: 0.055 });
      // claimed vs measured: two long hairlines running through the panel
      hline(ctx, 0, w, p.y + p.h * 0.34, rgba(WHITE, 0.14), 1, [3, 7]);
      hline(ctx, 0, w, p.y + p.h * 0.7, rgba(TEAL, 0.42), 1);
    },
  },

  loop: {
    orbs: [
      { c: GOLD, x: 0.2, y: 0.62, r: 0.32, a: 0.22, ax: 0.04, ay: 0.04, p: 70, ph: 0.5 },
      { c: TEAL, x: 0.8, y: 0.44, r: 0.36, a: 0.26, ax: 0.05, ay: 0.04, p: 62, ph: 2.6 },
    ],
    static(ctx, w, h, geo) {
      grid(ctx, w, h, { step: 80, alpha: 0.035 });
      radialMask(ctx, w, h, 0.5, 0.55, 0.55);
      if (!geo?.points) return; // loop.js hasn't laid the pills out yet
      const { points, owners } = geo;
      if (geo.mode === 'orbit') {
        const { cx, cy, rx, ry } = geo;
        ctx.save();
        ctx.lineWidth = 1;
        for (const [k, a] of [[0.72, 0.05], [1.18, 0.04], [1.36, 0.025]]) {
          ctx.strokeStyle = rgba(WHITE, a);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, TAU);
          ctx.stroke();
        }
        // the orbit itself: each arc takes the colour of the step it leaves
        const n = points.length;
        for (let i = 0; i < n; i++) {
          const a0 = -Math.PI / 2 + (i * TAU) / n;
          ctx.strokeStyle = rgba(owners[i] === 'human' ? GOLD : TEAL, 0.42);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, a0, a0 + TAU / n);
          ctx.stroke();
        }
        // faint spokes to the centre
        ctx.strokeStyle = rgba(WHITE, 0.045);
        ctx.setLineDash([2, 6]);
        ctx.beginPath();
        for (const p of points) { ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); }
        ctx.stroke();
        ctx.restore();
      } else if (points.length) {
        ctx.save();
        ctx.lineWidth = 1;
        const x = points[0].x;
        ctx.strokeStyle = rgba(WHITE, 0.14);
        ctx.beginPath();
        ctx.moveTo(x + 0.5, points[0].y);
        ctx.lineTo(x + 0.5, points[points.length - 1].y);
        ctx.stroke();
        points.forEach((p, i) => {
          ctx.fillStyle = rgba(owners[i] === 'human' ? GOLD : TEAL, 0.9);
          ctx.beginPath();
          ctx.arc(p.x + 0.5, p.y, 3, 0, TAU);
          ctx.fill();
        });
        ctx.restore();
      }
    },
    // a single mote travelling the orbit, so the pills visibly bend something moving
    animate(ctx, w, h, t, geo) {
      if (!geo || geo.mode !== 'orbit') return;
      const a = -Math.PI / 2 + ((t / 56) % 1) * TAU;
      const x = geo.cx + geo.rx * Math.cos(a);
      const y = geo.cy + geo.ry * Math.sin(a);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
      g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(0.12, 'rgba(255,255,255,.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 26, y - 26, 52, 52);
    },
  },

  skeptic: {
    orbs: [
      { c: GOLD, x: 0.14, y: 0.7, r: 0.3, a: 0.2, ax: 0.04, ay: 0.03, p: 68, ph: 1.4 },
      { c: TEAL, x: 0.86, y: 0.42, r: 0.36, a: 0.26, ax: 0.05, ay: 0.04, p: 60, ph: 0.2 },
    ],
    ribbons: [{ c: TEAL, a: 0.05, y: 0.72, amp: 0.05, p: 84, ph: 1, tilt: 0.05 }],
    measure(root) {
      const cards = [...root.querySelectorAll(':scope > .verdict')].map((c) => relRect(c, root));
      return { cards };
    },
    static(ctx, w, h, geo) {
      const rnd = mulberry(7);
      // scatter of observations
      ctx.save();
      for (let i = 0; i < 420; i++) {
        const x = rnd() * w;
        const y = h * 0.28 + rnd() * h * 0.66;
        ctx.fillStyle = rgba(WHITE, 0.05 + rnd() * 0.06);
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      ctx.restore();
      // a zero line and confidence intervals running behind the cards
      const cards = geo?.cards?.filter(Boolean) ?? [];
      const baseY = cards.length ? cards[0].y + cards[0].h * 0.58 : h * 0.62;
      hline(ctx, 0, w, baseY, rgba(WHITE, 0.1), 1, [4, 6]);
      const n = 15;
      ctx.save();
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const x = (w * (i + 0.5)) / n;
        const mid = baseY + (rnd() - 0.5) * 120;
        const half = 26 + rnd() * 70;
        ctx.strokeStyle = rgba(WHITE, 0.16);
        ctx.beginPath();
        ctx.moveTo(x, mid - half); ctx.lineTo(x, mid + half);
        ctx.moveTo(x - 5, mid - half); ctx.lineTo(x + 5, mid - half);
        ctx.moveTo(x - 5, mid + half); ctx.lineTo(x + 5, mid + half);
        ctx.stroke();
        ctx.fillStyle = rgba(i % 4 === 1 ? GOLD : WHITE, 0.5);
        ctx.beginPath();
        ctx.arc(x, mid, 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      radialMask(ctx, w, h, 0.5, 0.62, 0.62);
    },
  },

  autonomy: {
    orbs: [
      { c: TEAL, x: 0.24, y: 0.62, r: 0.36, a: 0.3, ax: 0.05, ay: 0.03, p: 64, ph: 0.8 },
      { c: GOLD, x: 0.86, y: 0.6, r: 0.3, a: 0.22, ax: 0.04, ay: 0.04, p: 76, ph: 2.4 },
    ],
    measure(root) {
      const bar = root.querySelector('.bar');
      const panel = root.querySelector('.auto-panel');
      return { bar: relRect(bar, root), panel: relRect(panel, root) };
    },
    static(ctx, w, h, geo) {
      grid(ctx, w, h, { step: 56, alpha: 0.03 });
      radialMask(ctx, w, h, 0.5, 0.6, 0.55);
      const bar = geo?.bar;
      const panel = geo?.panel;
      if (!bar || !panel || bar.w < 10) return;
      const top = panel.y - 90;
      const bottom = panel.y + panel.h + 90;
      ctx.save();
      for (let i = 0; i <= 20; i++) {
        const x = Math.round(bar.x + (bar.w * i) / 20) + 0.5;
        const major = i % 5 === 0;
        ctx.strokeStyle = rgba(WHITE, major ? 0.13 : 0.05);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, major ? top : top + 40);
        ctx.lineTo(x, major ? bottom : bottom - 40);
        ctx.stroke();
        if (major) {
          ctx.font = '500 11px "JetBrains Mono", monospace';
          ctx.fillStyle = rgba(WHITE, 0.3);
          ctx.textAlign = 'center';
          ctx.fillText(i === 20 ? '100%' : String(i * 5), x, bottom + 22);
        }
      }
      ctx.restore();
    },
  },

  product: {
    orbs: [
      { c: GOLD, x: 0.12, y: 0.5, r: 0.3, a: 0.22, ax: 0.04, ay: 0.05, p: 70, ph: 0.3 },
      { c: TEAL, x: 0.82, y: 0.66, r: 0.38, a: 0.28, ax: 0.05, ay: 0.04, p: 58, ph: 1.9 },
    ],
    static(ctx, w, h) {
      dots(ctx, w, h, { step: 22, r: 0.9, alpha: 0.12 });
      radialMask(ctx, w, h, 0.5, 0.62, 0.58);
    },
  },

  principles: {
    orbs: [
      { c: GOLD, x: 0.08, y: 0.5, r: 0.3, a: 0.2, ax: 0.03, ay: 0.08, p: 80, ph: 0.6 },
      { c: TEAL, x: 0.9, y: 0.3, r: 0.32, a: 0.2, ax: 0.04, ay: 0.06, p: 66, ph: 2.9 },
    ],
    ribbons: [{ c: TEAL, a: 0.045, y: 0.55, amp: 0.12, p: 90, ph: 0.8, tilt: -0.05 }],
    measure(root) {
      return { chips: [...root.querySelectorAll(':scope > .chip')].map((c) => relRect(c, root)) };
    },
    static(ctx, w, h, geo) {
      const chips = geo?.chips?.filter(Boolean) ?? [];
      if (!chips.length) return;
      // a gold hairline spine running through the number chips
      const x = Math.round(chips[0].cx) + 0.5;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba(GOLD, 0));
      g.addColorStop(0.2, rgba(GOLD, 0.4));
      g.addColorStop(0.8, rgba(GOLD, 0.4));
      g.addColorStop(1, rgba(GOLD, 0));
      ctx.save();
      ctx.strokeStyle = g;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.strokeStyle = rgba(WHITE, 0.12);
      for (let y = 24; y < h; y += 24) {
        ctx.beginPath();
        ctx.moveTo(x - (y % 96 === 0 ? 10 : 4), y + 0.5);
        ctx.lineTo(x + (y % 96 === 0 ? 10 : 4), y + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  trust: {
    orbs: [
      { c: TEAL, x: 0.3, y: 0.7, r: 0.34, a: 0.26, ax: 0.05, ay: 0.03, p: 64, ph: 1.2 },
      { c: GOLD, x: 0.78, y: 0.4, r: 0.28, a: 0.18, ax: 0.04, ay: 0.04, p: 78, ph: 0.1 },
    ],
    static(ctx, w, h) {
      // ledger rows: the audit trail as texture
      const rnd = mulberry(11);
      ctx.save();
      for (let y = 18; y < h; y += 26) {
        hline(ctx, 0, w, y, rgba(WHITE, 0.035), 1);
        let x = rnd() * 40;
        while (x < w) {
          const len = 20 + rnd() * 90;
          ctx.fillStyle = rgba(WHITE, 0.05 + rnd() * 0.05);
          ctx.fillRect(x, y - 9, len, 2);
          x += len + 30 + rnd() * 160;
        }
      }
      ctx.restore();
      radialMask(ctx, w, h, 0.5, 0.6, 0.6);
    },
  },

  neutrality: {
    orbs: [
      { c: GOLD, x: 0.12, y: 0.55, r: 0.34, a: 0.24, ax: 0.03, ay: 0.04, p: 72, ph: 0 },
      { c: TEAL, x: 0.88, y: 0.55, r: 0.34, a: 0.26, ax: 0.03, ay: 0.04, p: 72, ph: Math.PI },
    ],
    measure(root) {
      return { capsule: relRect(root.querySelector('.neutral-capsule'), root) };
    },
    static(ctx, w, h, geo) {
      const c = geo?.capsule;
      const y = c ? c.cy : h * 0.7;
      const cx = c ? c.cx : w / 2;
      // the balance beam: gold from the left, teal from the right, meeting under the capsule
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, rgba(GOLD, 0));
      g.addColorStop(0.3, rgba(GOLD, 0.5));
      g.addColorStop(0.5, rgba(WHITE, 0.4));
      g.addColorStop(0.7, rgba(TEAL, 0.55));
      g.addColorStop(1, rgba(TEAL, 0));
      hline(ctx, 0, w, y, g, 1);
      ctx.save();
      ctx.strokeStyle = rgba(WHITE, 0.08);
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, y, 120 * i + 40, 34 * i + 10, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  cta: {
    orbs: [
      { c: GOLD, x: 0.3, y: 0.38, r: 0.4, a: 0.3, ax: 0.05, ay: 0.05, p: 60, ph: 0.4 },
      { c: TEAL, x: 0.7, y: 0.64, r: 0.42, a: 0.32, ax: 0.05, ay: 0.05, p: 60, ph: 3.5 },
    ],
    measure(root) {
      return { btn: relRect(root.querySelector('.cta-btn'), root), card: relRect(root.querySelector('.cta-card'), root) };
    },
    static(ctx, w, h, geo) {
      grid(ctx, w, h, { step: 64, alpha: 0.05 });
      radialMask(ctx, w, h, 0.5, 0.5, 0.55);
      const b = geo?.btn;
      if (!b) return;
      ctx.save();
      ctx.lineWidth = 1;
      for (let i = 1; i <= 7; i++) {
        ctx.strokeStyle = rgba(i === 2 ? GOLD : WHITE, i === 2 ? 0.32 : 0.075);
        ctx.beginPath();
        ctx.arc(b.cx, b.cy, 40 + i * 46, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  footer: {
    // the gold-to-teal horizon and the CAUSVIA wordmark are sibling DOM layers (index.html)
    orbs: [],
    fadeBottom: 0,
    static(ctx, w, h) {
      grid(ctx, w, h, { step: 56, alpha: 0.045 });
      radialMask(ctx, w, h, 0.5, 0.85, 0.7);
    },
  },
};

/* ---------------------------------------------------------------- painter */

function paintOrb(ctx, o, t, w, h) {
  const s = Math.min(Math.max(w, h), 1600);
  const k = TAU / o.p;
  const x = (o.x + o.ax * Math.sin(t * k + o.ph)) * w;
  const y = (o.y + o.ay * Math.cos(t * k * 0.83 + o.ph * 1.3)) * h;
  const r = o.r * s;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(o.c, o.a));
  g.addColorStop(0.42, rgba(o.c, o.a * 0.45));
  g.addColorStop(1, rgba(o.c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function paintRibbon(ctx, rb, t, w, h) {
  const blobs = 9;
  const k = TAU / rb.p;
  const ry = h * 0.11;
  const rx = w * 0.16;
  for (let i = 0; i < blobs; i++) {
    const u = -0.1 + (1.2 * i) / (blobs - 1);
    const x = u * w;
    const y = (rb.y + rb.tilt * (u - 0.5) + rb.amp * Math.sin(u * 4.2 + t * k + rb.ph)) * h;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(rb.c, rb.a));
    g.addColorStop(1, rgba(rb.c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
}

function edgeFade(ctx, w, h, top, bottom) {
  if (top > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, top);
    g.addColorStop(0, BG);
    g.addColorStop(1, 'rgba(11,18,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, top);
  }
  if (bottom > 0) {
    const g = ctx.createLinearGradient(0, h - bottom, 0, h);
    g.addColorStop(0, 'rgba(11,18,32,0)');
    g.addColorStop(1, BG);
    ctx.fillStyle = g;
    ctx.fillRect(0, h - bottom, w, bottom);
  }
}

export class Fields {
  constructor({ mobile, still }) {
    this.mobile = mobile;
    this.still = still; // reduced motion: paint once, never animate
    this.fields = [];
    this.loop = this.loop.bind(this);
    this.raf = 0;
    this.last = 0;
    this.onFrame = null;
    this.visibleGlass = new Set();
    this.turn = 0;
  }

  get interval() { return 1000 / (this.mobile ? 14 : 20); }
  get scale() { return Math.min(devicePixelRatio || 1, this.mobile ? 1 : 1.25); }
  /** glass panels re-rendered per animation tick; the rest catch up on later ticks */
  get glassBudget() { return this.mobile ? 1 : 3; }

  add(canvas) {
    const name = canvas.dataset.field;
    const f = {
      canvas,
      root: canvas.parentElement,
      name,
      preset: PRESETS[name] || PRESETS.footer,
      ctx: canvas.getContext('2d', { alpha: false }),
      layer: null,
      geo: null,
      extGeo: null,
      w: 0,
      h: 0,
      s: 1,
      active: false,
      visible: false,
      inst: null,
    };
    this.fields.push(f);
    return f;
  }

  byRoot(root) { return this.fields.find((f) => f.root === root); }

  setInstance(root, inst) {
    const f = this.byRoot(root);
    if (f) f.inst = inst;
  }

  /** Geometry supplied from outside (the loop section lays its pills out in JS). */
  setGeometry(root, geo) {
    const f = this.byRoot(root);
    if (!f) return;
    f.extGeo = geo;
    if (f.active) { this.buildLayer(f); this.paint(f, performance.now() / 1000); f.inst?.markChanged(f.canvas); }
  }

  start() {
    // Allocate canvases only near the viewport; free them when far away.
    this.activeIO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const f = this.fields.find((x) => x.canvas === e.target);
        if (e.isIntersecting) this.activate(f); else this.deactivate(f);
      }
    }, { rootMargin: '120% 0px 120% 0px' });
    this.visibleIO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const f = this.fields.find((x) => x.canvas === e.target);
        f.visible = e.isIntersecting;
      }
      this.kick();
    });
    this.resizeRO = new ResizeObserver((entries) => {
      for (const e of entries) {
        const f = this.fields.find((x) => x.canvas === e.target);
        if (f?.active) this.resize(f);
      }
    });
    for (const f of this.fields) {
      this.activeIO.observe(f.canvas);
      this.visibleIO.observe(f.canvas);
      this.resizeRO.observe(f.canvas);
    }
    // which glass panels are on screen (only those need to follow the drifting light)
    this.glassIO = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? this.visibleGlass.add(e.target) : this.visibleGlass.delete(e.target);
    });
    for (const f of this.fields) {
      for (const g of f.root.children) if (g.classList.contains('glass')) this.glassIO.observe(g);
    }
    document.addEventListener('visibilitychange', () => this.kick());
  }

  setMobile(mobile) {
    if (mobile === this.mobile) return;
    this.mobile = mobile;
    for (const f of this.fields) if (f.active) this.resize(f);
  }

  setStill(still) {
    this.still = still;
    this.kick();
  }

  activate(f) {
    if (f.active) return;
    f.active = true;
    this.resize(f);
  }

  deactivate(f) {
    if (!f.active) return;
    f.active = false;
    f.canvas.width = 0;
    f.canvas.height = 0;
    f.layer = null;
  }

  resize(f) {
    const w = f.canvas.clientWidth;
    const h = f.canvas.clientHeight;
    if (!w || !h) return;
    const s = this.scale;
    if (f.layer && f.w === w && f.h === h && f.s === s) return; // nothing changed
    f.w = w; f.h = h; f.s = s;
    const pw = Math.round(w * s);
    const ph = Math.round(h * s);
    if (f.canvas.width !== pw || f.canvas.height !== ph) {
      f.canvas.width = pw;
      f.canvas.height = ph;
    }
    this.buildLayer(f);
    this.paint(f, performance.now() / 1000);
    f.inst?.markChanged(f.canvas);
    this.onFrame?.();
  }

  buildLayer(f) {
    const { w, h, s, preset } = f;
    if (!w || !h) return;
    f.geo = { ...(preset.measure?.(f.root) ?? {}), ...(f.extGeo ?? {}) };
    if (!preset.static) { f.layer = null; return; }
    const layer = f.layer && f.layer.width === f.canvas.width && f.layer.height === f.canvas.height
      ? f.layer
      : Object.assign(document.createElement('canvas'), { width: f.canvas.width, height: f.canvas.height });
    const ctx = layer.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    preset.static(ctx, w, h, f.geo);
    f.layer = layer;
  }

  paint(f, t) {
    const { ctx, w, h, s, preset } = f;
    if (!w || !h || !f.canvas.width) return;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const o of preset.orbs || []) paintOrb(ctx, o, t, w, h);
    for (const rb of preset.ribbons || []) paintRibbon(ctx, rb, t, w, h);
    ctx.globalCompositeOperation = 'source-over';
    if (f.layer) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(f.layer, 0, 0);
      ctx.setTransform(s, 0, 0, s, 0, 0);
    }
    preset.animate?.(ctx, w, h, t, f.geo);
    edgeFade(ctx, w, h, preset.fadeTop ?? 150, preset.fadeBottom ?? 150);
  }

  /** Ask a few on-screen glass panels to re-render over the new backdrop, in rotation. */
  refreshGlass() {
    const live = [];
    for (const g of this.visibleGlass) {
      const f = this.byRoot(g.parentElement);
      if (f?.inst && f.visible && isAnimated(f.preset)) live.push([g, f.inst]);
    }
    if (!live.length) return;
    const n = Math.min(this.glassBudget, live.length);
    for (let i = 0; i < n; i++) {
      const [g, inst] = live[(this.turn + i) % live.length];
      inst.markChanged(g);
    }
    this.turn = (this.turn + n) % live.length;
  }

  kick() {
    const want = !this.still && document.visibilityState === 'visible' && this.fields.some((f) => f.active && f.visible);
    if (want && !this.raf) this.raf = requestAnimationFrame(this.loop);
    if (!want && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  loop(now) {
    this.raf = 0;
    if (this.still || document.visibilityState !== 'visible') return;
    if (now - this.last >= this.interval) {
      this.last = now;
      const t = now / 1000;
      let any = false;
      for (const f of this.fields) {
        if (!f.active || !f.visible || !isAnimated(f.preset)) continue;
        any = true;
        this.paint(f, t);
      }
      if (any) {
        this.refreshGlass();
        this.onFrame?.();
      }
    }
    this.kick();
  }
}
