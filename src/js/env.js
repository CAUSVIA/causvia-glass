// Environment checks that decide between the WebGL glass and the CSS fallback.

const params = new URLSearchParams(location.search);

export const mq = {
  reduceMotion: matchMedia('(prefers-reduced-motion: reduce)'),
  reduceTransparency: matchMedia('(prefers-reduced-transparency: reduce)'),
  mobile: matchMedia('(max-width: 767.98px)'),
  finePointer: matchMedia('(hover: hover) and (pointer: fine)'),
};

// ?fallback forces the CSS version; ?glass=on skips the software-renderer check (used for headless tests).
const forceFallback = params.has('fallback');
const forceGlass = params.get('glass') === 'on';
export const debug = params.has('debug');

// The glass library's renderer attributes. The probe context is created with exactly
// these, and is then shared by every glass root (see glass-manager.js), so the whole
// page only ever holds one WebGL context.
export const GL_ATTRIBUTES = { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true };

let sharedGL;
/** Created lazily (it costs ~100ms), after the page has loaded. null when WebGL can't run well. */
export function getSharedGL() {
  if (sharedGL !== undefined) return sharedGL;
  sharedGL = null;
  if (forceFallback) return sharedGL;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { ...GL_ATTRIBUTES, failIfMajorPerformanceCaveat: !forceGlass });
    if (gl) sharedGL = { canvas, gl };
  } catch { /* stays null: CSS glass */ }
  return sharedGL;
}

export const env = {
  get reduceMotion() { return mq.reduceMotion.matches; },
  get reduceTransparency() { return mq.reduceTransparency.matches; },
  get mobile() { return mq.mobile.matches; },
  get finePointer() { return mq.finePointer.matches; },
  /** true when the user's preferences allow the WebGL glass (WebGL itself is checked at boot) */
  get glass() { return !forceFallback && !this.reduceMotion && !this.reduceTransparency; },
};
