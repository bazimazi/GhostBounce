// Headless screenshot helper for visual checks.
//   node tools/shot.mjs <url> <out.png> [script-steps-json]
// Steps: [{"key":"Space","hold":300}, {"wait":500}, {"click":"text=Start"}, {"eval":"..."}]
import { chromium } from 'playwright-core';

const [url, out, stepsJson] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(800);
const steps = stepsJson ? JSON.parse(stepsJson) : [];
let n = 0;
for (const s of steps) {
  if (s.click) await page.click(s.click);
  if (s.key) {
    await page.keyboard.down(s.key);
    await page.waitForTimeout(s.hold ?? 60);
    await page.keyboard.up(s.key);
  }
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.eval) console.log(await page.evaluate(s.eval));
  if (s.shot) await page.screenshot({ path: s.shot });
  n++;
}
await page.screenshot({ path: out });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
