// Runs a full 3v3 match with bots (fast-forwarded) and prints phase/score timeline.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL ?? 'http://localhost:5273/');
await page.waitForTimeout(1200);
await page.getByText('Play Match').first().click();
await page.waitForTimeout(600);
const box = page.getByText('Fill the other 5 slots');
if (!(await page.locator('input[type=checkbox]').first().isChecked())) await box.click();
await page.getByText('Start Match').click();
await page.waitForFunction(() => window.__game?.bots?.length === 5, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/match-start.png` });
const timeline = [];
for (let chunk = 0; chunk < 17; chunk++) {
  const r = await page.evaluate(() => {
    const g = window.__game;
    const idle = () => ({ x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false });
    const t0 = performance.now();
    for (let k = 0; k < 120 * 10; k++) g.stepSim([idle()], 1 / 120);
    const ms = performance.now() - t0;
    const i = g.match.info();
    const s = g.match.score;
    return {
      phase: i.phase + (i.shift ? i.shift : ''), clock: +i.clock.toFixed(1), ms: Math.round(ms),
      blue: s.blue.autoFuel + s.blue.teleopFuel, red: s.red.autoFuel + s.red.teleopFuel,
      wasted: s.blue.wastedFuel + s.red.wastedFuel,
      bots: g.bots.map((b) => `${b.robot.def.team}:${b.robot.stored.length}/${b.robot.stats.scored}${b.robot.climbLevel ? 'L' + b.robot.climbLevel : ''}`).join(' '),
    };
  });
  timeline.push(r);
  if (chunk === 6) await page.screenshot({ path: `${out}/match-mid.png` });
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/match-end.png` });
console.table(timeline);
const res = await page.evaluate(() => ({ score: window.__game.match.score, results: window.__game.results }));
console.log(JSON.stringify(res));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
