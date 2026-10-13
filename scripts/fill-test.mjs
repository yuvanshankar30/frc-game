// Feed FUEL into each robot's intake zone until it stops taking more: does every hopper reach its capacity?
// EXTRA=n raises each robot's capacity by n past what its drawn hopper holds (issue #10: capacity decides).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const URL = process.env.URL ?? 'http://localhost:5174/';
const teams = (process.env.TEAMS ?? '4414,971,2910,1690,254,1678').split(',');
const out = {};
for (const team of teams) {
  await page.goto(URL);
  await page.waitForTimeout(1000);
  await page.getByText('Practice', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByText(new RegExp(`^Team ${team} · `)).first().click();
  await page.getByText('Start Practice').click();
  await page.waitForFunction(() => window.__game?.players?.length);
  await page.waitForTimeout(500);
  out[team] = await page.evaluate(`(() => {
    const g = window.__game; const r = g.players[0].robot; const fuel = g.field.fuel;
    r.def.storage.capacity += ${Number(process.env.EXTRA ?? 0)};
    r.teleport(0, 1.5, 0);
    const cmd = (x, rot) => ({ x, z: 0, rot, refYaw: 0, intake: true, shoot: false, eject: false, climb: false });
    for (let k = 0; k < 60; k++) g.stepSim([cmd(0, 0)], 1 / 120);
    const z = r.def.intake.zones[0];
    let last = 0, stall = 0;
    for (let k = 0; k < 120 * 30; k++) {
      // Drop a loose ball into the intake zone every few steps.
      if (k % 4 === 0) {
        let i = -1;
        for (let j = 0; j < fuel.capacity; j++) if (fuel.state[j] === 'field') { const p = fuel.position(j); if (Math.hypot(p.x - r.position.x, p.z - r.position.z) > 2) { i = j; break; } }
        if (i >= 0) fuel.place(i, r.toWorld({ x: z.center[0], y: 0.09, z: (Math.random() - 0.5) * z.size[2] * 0.8 }), { x: 0, y: 0, z: 0 });
      }
      // A little driving so the pile is shaken like in a match.
      const t = k / 120;
      g.stepSim([cmd(Math.sin(t * 1.3) * 0.4, Math.sin(t * 0.7) * 0.3)], 1 / 120);
      if (r.carried > last) { last = r.carried; stall = 0; } else stall++;
      if (r.carried >= r.def.storage.capacity || stall > 120 * 5) break;
    }
    return { cap: r.def.storage.capacity, carried: r.carried, inBox: r.stored.length, overflow: r.overflow.length, missed: r.stats.missedEntry ?? 0, spilled: r.stats.spilled ?? 0 };
  })()`);
}
console.table(out);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
