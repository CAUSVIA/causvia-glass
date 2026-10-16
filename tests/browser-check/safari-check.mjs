// Real desktop Safari through safaridriver (macOS runner). Safari's own console isn't exposed to
// WebDriver, so the page's ?debug mode keeps script warnings/errors in window.__log for us to read.
// usage: node safari-check.mjs <url>
import { Builder } from 'selenium-webdriver';
import fs from 'node:fs';
import { SECTIONS, PAGE_STATE, scrollToSection, summarise } from './shared.mjs';

const url = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync('out', { recursive: true });
const driver = await new Builder().forBrowser('safari').build();
const report = {};
try {
  const caps = await driver.getCapabilities();
  report.version = `Safari ${caps.get('browserVersion')}`;
  for (const [vp, w, h, query] of [
    ['desktop', 1440, 900, '?debug'], // exactly what visitors get, GPU check included
    ['desktop-forced-glass', 1440, 900, '?debug&glass=on'],
    ['narrow', 390, 844, '?debug&glass=on'], // Safari may not go this narrow; the report shows the real width
  ]) {
    await driver.manage().window().setRect({ x: 0, y: 0, width: w, height: h });
    await driver.get(`${url}/${query}`);
    await sleep(3000);
    await driver.executeScript('window.scrollTo(0, 2)');
    await sleep(4000);
    const states = {};
    for (const id of SECTIONS) {
      await driver.executeScript(scrollToSection(id));
      await sleep(3500);
      states[id] = await driver.executeScript(PAGE_STATE);
      fs.writeFileSync(`out/safari-${vp}-${id}.png`, await driver.takeScreenshot(), 'base64');
    }
    report[vp] = states;
    console.log(summarise(`${report.version} ${vp}`, states));
  }
} finally {
  await driver.quit();
}
fs.writeFileSync('out/report.json', JSON.stringify(report, null, 2));
