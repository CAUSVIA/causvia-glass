// Firefox (and optionally Chromium / WebKit) through Playwright, at 1440px and at 390px.
// usage: node playwright-check.mjs <url> [firefox,chromium,webkit]
import { firefox, chromium, webkit } from 'playwright';
import fs from 'node:fs';
import { SECTIONS, PAGE_STATE, scrollToSection, summarise } from './shared.mjs';

const url = process.argv[2];
const engines = { firefox, chromium, webkit };
const which = (process.argv[3] || 'firefox').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync('out', { recursive: true });
const report = {};

for (const name of which) {
  const browser = await engines[name].launch();
  report[`${name}-version`] = browser.version();
  for (const [vp, opts] of [
    ['desktop', { viewport: { width: 1440, height: 900 } }],
    ['mobile-390', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, ...(name === 'firefox' ? {} : { isMobile: true }) }],
  ]) {
    const page = await browser.newPage(opts);
    const messages = [];
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') messages.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
    // glass=on: CI machines have no GPU, so skip the software-renderer check and run the real glass anyway
    await page.goto(`${url}/?debug&glass=on`, { waitUntil: 'load' });
    await page.mouse.move(200, 200);
    await page.evaluate(() => window.scrollTo(0, 2));
    await sleep(4000);
    const states = {};
    for (const id of SECTIONS) {
      await page.evaluate(new Function(scrollToSection(id)));
      await sleep(3500);
      states[id] = await page.evaluate(new Function(PAGE_STATE));
      await page.screenshot({ path: `out/${name}-${vp}-${id}.png` });
    }
    report[`${name}-${vp}`] = { console: messages, states };
    console.log(summarise(`${name} ${report[`${name}-version`]} ${vp}`, states, `console=${messages.length ? messages.join(' | ') : 'clean'}`));
    await page.close();
  }
  await browser.close();
}
fs.writeFileSync('out/report.json', JSON.stringify(report, null, 2));
