// Shooting while driving / rotating: shots fired and scored per robot and maneuver.
import { chromium } from 'playwright-core';
const url = process.env.URL ?? 'http://localhost:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
for (const team of (process.env.ROBOTS ?? '4414,971,2910,1690,254,1678').split(',')) {
  await page.goto(url);
  await page.waitForTimeout(1200);
  await page.getByText('Practice', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText(new RegExp(`^Team ${team} · `)).first().click();
  await page.getByText('Start Practice').click();
  await page.waitForFunction(() => window.__game?.players?.length);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const g = window.__game; const rob = g.players[0].robot; const hub = g.field.hubs.blue.center;
    const idle = { x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false };
    const out = {};
    const cases = {
      still: () => ({}),
      strafe: (t) => ({ z: 0.6 * Math.sign(Math.sin(t * 1.6)) }),
      spin: () => ({ rot: 1 }),
      strafeSpin: (t) => ({ z: 0.6 * Math.sign(Math.sin(t * 1.6)), rot: 0.7 }),
    };
    for (const [name, fn] of Object.entries(cases)) {
      rob.stored.splice(0).forEach((i) => g.field.fuel.hold(i, 'free'));
      rob.teleport(hub.x - 2.8, 0.4, 0.3);
      rob.preload(g.field.fuel, 16);
      for (let k = 0; k < 60; k++) g.stepSim([idle], 1 / 120);
      rob.stats.shots = 0; rob.stats.scored = 0;
      const y0 = rob.yaw; let turned = 0, last = y0;
      for (let k = 0; k < 120 * 4; k++) { g.stepSim([{ ...idle, ...fn(k / 120), shoot: true }], 1 / 120); const y = rob.yaw; turned += Math.abs(Math.atan2(Math.sin(y - last), Math.cos(y - last))); last = y; }
      for (let k = 0; k < 120 * 2.5; k++) g.stepSim([idle], 1 / 120);
      out[name] = `${rob.stats.scored}/${rob.stats.shots} turn${Math.round(turned * 57.3)}°`;
    }
    return out;
  });
  console.log(team, JSON.stringify(r));
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
