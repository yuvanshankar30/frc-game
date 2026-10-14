// Robots with a 'raised' lift: auto-tuck under the TRENCH, and blocked by it when raised. (1678's expanding hopper: expand-test.mjs.)
import { chromium } from 'playwright-core';
const url = process.env.URL ?? 'http://localhost:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
for (const team of (process.env.ROBOTS ?? '4414').split(',')) {
  await page.goto(url);
  await page.waitForTimeout(1000);
  await page.getByText('Practice', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByText(new RegExp(`^Team ${team} · `)).first().click();
  await page.getByText('Start Practice').click();
  await page.waitForFunction(() => window.__game?.players?.length);
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const g = window.__game; const rob = g.players[0].robot; const hub = g.field.hubs.blue.center;
    const idle = { x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false };
    const run = (tuck) => {
      if (rob.def.lift) { rob.def.lift.__t ??= rob.def.lift.trench; rob.def.lift.trench = tuck ? rob.def.lift.__t : rob.def.lift.height; }
      rob.teleport(hub.x - 2.6, -3.4, 0);
      for (let k = 0; k < 240; k++) g.stepSim([idle], 1 / 120);
      const raised = rob.liftPos;
      let minLift = 9;
      for (let k = 0; k < 120 * 3; k++) { g.stepSim([{ ...idle, x: 1, refYaw: 0 }], 1 / 120); if (Math.abs(rob.position.x - hub.x) < 0.4) minLift = Math.min(minLift, rob.liftPos); }
      return { raisedIn: +(raised / 0.0254).toFixed(1), underIn: minLift === 9 ? null : +(minLift / 0.0254).toFixed(1), passed: rob.position.x > hub.x + 0.5, x: +(rob.position.x - hub.x).toFixed(2) };
    };
    return { tuck: run(true), noTuck: rob.def.lift ? run(false) : null };
  });
  console.log(team, JSON.stringify(r));
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
