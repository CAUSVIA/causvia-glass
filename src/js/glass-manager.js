// Lifecycle for the liquid glass roots.
//
// Rules this enforces (from the library's own constraints):
// - one root per section, glass elements are direct children of their root
// - a root starts only when it scrolls near the viewport, and is destroyed when it is far away
// - never more than 4 live roots on desktop (nav + 3 sections) or 2 on mobile
// - fonts are loaded before init
// - every destroyed root also releases its WebGL context, so the browser limit is never approached

// Brief's starting values were refraction 0.7, blurAmount 0.15, chromAberration 0.04,
// edgeHighlight 0.08, specular 0.25, fresnel 1, shadowOpacity 0.35, then tuned by eye.
// specular is 0: the library's highlight lights point along +y, which in its DOM-space
// coordinates is the *bottom* of each panel, so any specular drew a bright line inside the
// bottom edge and a tick in the bottom-right corner. The top rim comes from edgeHighlight.
// (The dome lens sets its own specular: on a sphere a highlight anywhere reads correctly.)
const DEFAULTS = {
  refraction: 0.7,
  blurAmount: 0.15,
  chromAberration: 0.04,
  edgeHighlight: 0.08,
  specular: 0,
  fresnel: 0.6,
  shadowOpacity: 0.35,
};

let libPromise = null;
const loadLibrary = () => (libPromise ||= import('@ybouane/liquidglass'));

/**
 * Start a LiquidGlass instance on the page's single shared WebGL context.
 *
 * The library opens a new context per init(). Browsers cap live contexts, and
 * WebKit keeps counting a context even after WEBGL_lose_context, so a long scroll
 * with roots starting and stopping ends in "too many active WebGL contexts".
 * Each renderer sets all of its GL state on every pass, so they can share one
 * context safely: while the constructor runs (synchronously, inside init()) we
 * hand its getContext('webgl') call the shared context, then point the renderer
 * at the shared canvas before its first frame.
 */
async function initOnShared(LiquidGlass, options, shared) {
  const proto = HTMLCanvasElement.prototype;
  const original = proto.getContext;
  let stub = null;
  proto.getContext = function getContext(type, attrs) {
    if (!stub && type === 'webgl' && attrs?.preserveDrawingBuffer && attrs.premultipliedAlpha === false) {
      stub = this;
      return shared.gl;
    }
    return original.call(this, type, attrs);
  };
  let pending;
  try {
    pending = LiquidGlass.init(options);
  } finally {
    proto.getContext = original;
  }
  try {
    const inst = await pending;
    inst.renderer.canvas = shared.canvas;
    shareShaderPrograms(inst.renderer, shared.gl);
    return inst;
  } finally {
    stub?.remove();
  }
}

/**
 * Every renderer compiles the same three shader programs (~60-90ms on Windows/ANGLE).
 * On the shared context they only need compiling once: later renderers adopt the
 * programs of the first, and destroy() is kept from deleting them.
 */
const PROGRAM_FIELDS = ['blitP', 'blitU', 'blurP', 'blurU', 'glassP', 'glassU'];
let programs = null;
function shareShaderPrograms(renderer, gl) {
  if (!programs) programs = Object.fromEntries(PROGRAM_FIELDS.map((k) => [k, renderer[k]]));
  const proto = Object.getPrototypeOf(renderer);
  if (proto.__sharedPrograms) return;
  proto.__sharedPrograms = true;
  const compile = proto._initPrograms;
  proto._initPrograms = function initPrograms() {
    if (programs && this.gl === gl && !gl.isContextLost()) Object.assign(this, programs);
    else compile.call(this);
  };
  const deleteProgram = gl.deleteProgram.bind(gl);
  gl.deleteProgram = (p) => {
    if (programs && (p === programs.blitP || p === programs.blurP || p === programs.glassP)) return;
    deleteProgram(p);
  };
}

function readConfig(el) {
  try { return JSON.parse(el.dataset.config || '{}') || {}; } catch { return {}; }
}

/** Keep cornerRadius equal to the element's real CSS radius (the brief: "cornerRadius to match the element"). */
export function syncRadius(el) {
  const cfg = readConfig(el);
  if (el.dataset.radius === 'fixed') return;
  const raw = getComputedStyle(el).borderTopLeftRadius;
  let r = parseFloat(raw) || 0;
  if (raw.endsWith('%')) r = (r / 100) * Math.min(el.offsetWidth, el.offsetHeight);
  r = Math.min(r, Math.min(el.offsetWidth, el.offsetHeight) / 2);
  if (Math.abs((cfg.cornerRadius ?? -1) - r) < 0.5) return;
  cfg.cornerRadius = Math.round(r * 10) / 10;
  el.dataset.config = JSON.stringify(cfg);
}

export function setConfig(el, patch) {
  const cfg = { ...readConfig(el), ...patch };
  const next = JSON.stringify(cfg);
  if (next !== el.dataset.config) el.dataset.config = next;
}

const glassChildren = (root) => [...root.children].filter((c) => c.classList.contains('glass'));

export class GlassManager {
  constructor({ mobile }) {
    this.mobile = mobile;
    this.shared = null;
    this.contextLost = false;
    this.roots = new Map();
    this.near = new Set();
    this.far = new Set();
    this.enabled = true;
    this.running = false;
    this.again = false;
    this.listeners = new Set();
  }

  get cap() { return this.mobile ? 2 : 4; }

  /**
   * @param {HTMLElement} el root element
   * @param {object} opts
   *   pinned      always wanted while allowed (the nav)
   *   desktopOnly never started on mobile (mobile nav uses the CSS glass)
   *   prepare     (el, mobile) => void, runs right before init
   *   onLive      (instance) => void
   *   onStop      () => void
   */
  register(el, opts = {}) {
    this.roots.set(el, { el, name: el.dataset.lgRoot, inst: null, starting: false, failed: false, ...opts });
  }

  /** Hand over the page's single WebGL context, then start watching the roots. */
  start(shared) {
    this.shared = shared;
    // If the GPU drops the shared context, fall back to the CSS glass until it returns.
    shared.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      programs = null;
      for (const s of this.roots.values()) if (s.inst) s.inst.renderer.contextLost = true;
      this.setEnabled(false);
    });
    shared.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.setEnabled(true);
    });
    this._observe();
    this.schedule();
  }

  _observe() {
    this.nearIO?.disconnect();
    this.farIO?.disconnect();
    this.near.clear();
    this.far.clear();
    const make = (pct, set) => new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? set.add(e.target) : set.delete(e.target);
      this.schedule();
    }, { rootMargin: `${pct}% 0px ${pct}% 0px` });
    this.nearIO = make(this.mobile ? 50 : 75, this.near);
    this.farIO = make(150, this.far);
    for (const el of this.roots.keys()) {
      this.nearIO.observe(el);
      this.farIO.observe(el);
    }
  }

  setMobile(mobile) {
    if (mobile === this.mobile) return;
    this.mobile = mobile;
    if (!this.shared) return;
    for (const s of this.roots.values()) this._stop(s);
    this._observe();
    this.schedule();
  }

  setEnabled(on) {
    this.enabled = on && !this.contextLost;
    if (!on) for (const s of this.roots.values()) this._stop(s);
    this.schedule();
  }

  schedule() {
    if (this._raf || !this.shared) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.reconcile();
    });
  }

  _allowed(s) {
    return this.enabled && !s.failed && !(s.desktopOnly && this.mobile);
  }

  /** Distance from the viewport centre line to the root (0 when the root spans it). */
  _distance(s) {
    if (s.pinned) return -1;
    const r = s.el.getBoundingClientRect();
    const mid = innerHeight / 2;
    if (r.top <= mid && r.bottom >= mid) return 0;
    return r.top > mid ? r.top - mid : mid - r.bottom;
  }

  async reconcile() {
    if (this.running) { this.again = true; return; }
    this.running = true;
    try {
      do {
        this.again = false;
        const all = [...this.roots.values()];
        const wanted = all
          .filter((s) => this._allowed(s) && (s.pinned || this.near.has(s.el)))
          .sort((a, b) => this._distance(a) - this._distance(b))
          .slice(0, this.cap);
        const wantedSet = new Set(wanted);
        const toStart = wanted.filter((s) => !s.inst);
        let live = all.filter((s) => s.inst);

        // Stop roots that are no longer wanted: always when far away or not allowed,
        // and also when their slot is needed for a root that is closer to the viewport.
        const surplus = live
          .filter((s) => !wantedSet.has(s))
          .sort((a, b) => this._distance(b) - this._distance(a));
        for (const s of surplus) {
          const needSlot = live.length + toStart.length > this.cap;
          if (!this._allowed(s) || !this.far.has(s.el) || needSlot) {
            this._stop(s);
            live = live.filter((x) => x !== s);
          }
        }

        for (const s of toStart) {
          if (live.length >= this.cap) break;
          await this._start(s);
          if (s.inst) live.push(s);
          if (this.again) break;
        }
      } while (this.again);
    } finally {
      this.running = false;
      this._emit();
    }
  }

  async _start(s) {
    s.starting = true;
    try {
      const { LiquidGlass } = await loadLibrary();
      await document.fonts.ready;
      const glass = glassChildren(s.el);
      s.prepare?.(s.el, this.mobile);
      glass.forEach(syncRadius);

      const inst = await initOnShared(LiquidGlass, { root: s.el, glassElements: glass, defaults: DEFAULTS }, this.shared);

      // The world may have moved on while init was running.
      const stillWanted = this._allowed(s) && (s.pinned || this.near.has(s.el) || this.far.has(s.el));
      if (!stillWanted) { release(inst); return; }

      s.inst = inst;
      // The library disables selection on the root for dragging; text must stay selectable.
      s.el.style.removeProperty('user-select');
      s.el.style.removeProperty('-webkit-user-select');
      s.el.classList.add('lg-on');
      s.onLive?.(inst);

      // Re-snapshot glass contents once the CSS material has faded out, so glass that
      // sits on top of other glass (nav button, CTA button, the lens) sees the clean surface.
      s.recapture = setTimeout(() => {
        for (const g of glass) {
          const marker = document.createComment('');
          g.appendChild(marker);
          marker.remove();
        }
      }, 1000);
    } catch (err) {
      // Stay on the CSS glass for this root; never retry in a loop.
      s.failed = true;
      s.el.classList.remove('lg-on');
      if (new URLSearchParams(location.search).has('debug')) console.info('[glass] init failed for', s.name, err);
    } finally {
      s.starting = false;
    }
  }

  _stop(s) {
    if (!s.inst) return;
    clearTimeout(s.recapture);
    s.el.classList.remove('lg-on');
    s.onStop?.();
    release(s.inst);
    s.inst = null;
  }

  /** Make sure the glass re-renders every frame for `ms` (used while a glass element changes size). */
  pulse(rootEl, ms = 1000) {
    const s = this.roots.get(rootEl);
    if (!s?.inst) return;
    const until = performance.now() + ms;
    const tick = () => {
      if (!s.inst) return;
      s.inst.markChanged();
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** A non-glass child of a root changed (e.g. finished fading in): refresh its snapshot. */
  refresh(el) {
    const root = el?.parentElement;
    const s = root && this.roots.get(root);
    if (!s?.inst || el.classList.contains('glass')) return;
    s.inst.capture?.invalidateCache?.(el);
    s.inst.markChanged(el);
  }

  instanceFor(rootEl) {
    return this.roots.get(rootEl)?.inst ?? null;
  }

  liveNames() {
    return [...this.roots.values()].filter((s) => s.inst).map((s) => s.name);
  }

  onChange(fn) { this.listeners.add(fn); }
  _emit() { for (const fn of this.listeners) fn(this.liveNames()); }
}

// Frees the instance's programs, buffers, textures and framebuffers. The shared
// context itself stays alive for the next root.
function release(inst) {
  try { inst.destroy(); } catch { /* already gone */ }
}
