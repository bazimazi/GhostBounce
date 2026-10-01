import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

// Run against a local Vite server. Override BROWSER_PATH and GAME_URL as needed.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: 'msedge' }),
});
const out = '.artifacts/visual';
mkdirSync(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => errors.push(error.message));
const start = async (id) => page.evaluate((id) => {
  const { app, findLevel } = window.ghostBounce;
  app.startLevel(findLevel(id));
}, id);
const screenshot = async (name) => page.screenshot({ path: `${out}/${name}.png` });
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Begin journey' }).waitFor();
  await page.waitForTimeout(500);
  await screenshot('title');
  await page.getByRole('button', { name: 'Begin journey' }).click();
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.ghostBounce.app.play.session.player.x);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  assert.ok(await page.evaluate(() => window.ghostBounce.app.play.session.player.x) > before, 'movement');
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  await screenshot('jump');
  await page.keyboard.up('Space');
  await page.waitForTimeout(2900);
  await screenshot('wake');

  await start('w1-2');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(550);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.ghostBounce.app.play.session.echoes.length), 1, 'record echo');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  await screenshot('echo');
  const tick = await page.evaluate(() => window.ghostBounce.app.play.session.world.tick);
  await page.keyboard.down('KeyZ');
  await page.waitForTimeout(100);
  await screenshot('rewind');
  const rewound = await page.evaluate(() => window.ghostBounce.app.play.session.world.tick);
  await page.keyboard.up('KeyZ');
  assert.ok(rewound < tick, 'rewind');
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.ghostBounce.app.play.session.echoes[0].muted), true, 'mute echo');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await screenshot('pause');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  for (let world = 1; world <= 7; world++) {
    await start(`w${world}-2`);
    await page.evaluate(() => window.ghostBounce.app.play.startDemo());
    await page.waitForTimeout(950);
    await screenshot(`world-${world}`);
  }
  await start('w1-1');
  await page.evaluate(() => window.ghostBounce.app.play.startDemo());
  await page.waitForFunction(() => window.ghostBounce.app.play.session.status === 'won', null, { timeout: 15000 });
  await screenshot('solution-complete');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.ghostBounce.app.play.demoRunning), false, 'exit solution demo');
  // Render every campaign room, including all machinery and material combinations.
  const count = await page.evaluate(async () => {
    const { CAMPAIGN_LEVELS, CHALLENGES } = await import('/src/levels/index.ts');
    const { app } = window.ghostBounce;
    for (const def of [...CAMPAIGN_LEVELS, ...CHALLENGES.map((c) => c.def)]) {
      app.startLevel(def);
      app.play.render();
    }
    return CAMPAIGN_LEVELS.length + CHALLENGES.length;
  });
  console.log(`Rendered ${count} campaign and challenge rooms.`);
  await page.evaluate(() => window.ghostBounce.app.showTitle());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const still1 = await page.locator('#game').screenshot();
  await page.waitForTimeout(150);
  const still2 = await page.locator('#game').screenshot();
  assert.ok(still1.equals(still2), 'reduced-motion title is static');
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.ghostBounce.app.showTitle());
    await page.waitForTimeout(100);
    await screenshot(`mobile-title-${viewport.width}`);
    await page.getByRole('button', { name: 'Explore worlds' }).click();
    await screenshot(`mobile-worlds-${viewport.width}`);
    await page.evaluate(() => {
      const { app } = window.ghostBounce;
      app.save.settings.touch = 'on'; app.applySettings();
    });
    await start('w1-1');
    await page.waitForTimeout(100);
    await screenshot(`mobile-play-${viewport.width}`);
    assert.ok(await page.locator('#touch').isVisible(), 'touch controls visible');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow');
  }
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS: navigation, movement, jump, echo, mute, rewind, pause/settings, seven worlds, reduced motion, mobile.');
} finally {
  await browser.close();
}
