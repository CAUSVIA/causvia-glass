// Shared bits for the browser checks: which sections to visit and what to read from the page.
export const SECTIONS = ['top', 'problem', 'how', 'skeptic', 'autonomy', 'trust', 'start', 'site-footer'];

// Runs inside the page (as a function body). Plain DOM, so it works through Playwright and WebDriver.
export const PAGE_STATE = `return (() => {
  const g = window.__glass;
  const gl = g && g.manager.shared && g.manager.shared.gl;
  const blank = [];
  document.querySelectorAll('.lg-on > .glass > canvas').forEach((c) => {
    const r = c.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    if (d[3] < 200) blank.push(c.parentElement.className);
  });
  return {
    innerWidth,
    innerHeight,
    live: g ? g.live() : null,
    glassMode: document.documentElement.classList.contains('lg-fallback') ? 'css-fallback' : 'webgl',
    contextLost: gl ? gl.isContextLost() : null,
    blankGlass: blank,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    log: window.__log || [],
  };
})()`;

export const scrollToSection = (id) => `
  if (${JSON.stringify(id)} === 'top') { window.scrollTo(0, 0); return; }
  document.getElementById(${JSON.stringify(id)}).scrollIntoView({ block: ${JSON.stringify(id === 'site-footer' ? 'end' : 'center')} });
`;

export function summarise(label, states, extra) {
  const s = Object.values(states);
  const live = s.map((x) => (x.live || []).length);
  return `${label}: width=${s[0].innerWidth} glass=${s[0].glassMode} maxLive=${Math.max(...live)} `
    + `overflowX=${s.some((x) => x.overflowX)} blankGlass=${s.flatMap((x) => x.blankGlass).length} `
    + `contextLost=${s.some((x) => x.contextLost)} pageLog=${[...new Set(s.flatMap((x) => x.log))].join(' | ') || 'clean'}`
    + (extra ? ` ${extra}` : '');
}
