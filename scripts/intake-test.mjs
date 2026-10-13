// Drive through the center FUEL field with intake on/off: speed loss, intake count, stuck "entering" balls.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const URL = process.env.URL ?? 'http://localhost:5174/';
const teams = (process.env.TEAMS ?? '4414,971,2910,1690,254,1678').split(',');
const out = {};
for (const team of teams) {
  for (const intake of [false, true]) {
    await page.goto(URL);
    await page.waitForTimeout(1000);
    await page.getByText('Practice', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.getByText(new RegExp(`^Team ${team} · `)).first().click();
    await page.getByText('Start Practice').click();
    await page.waitForFunction(() => window.__game?.players?.length);
    await page.waitForTimeout(500);
    const r = await page.evaluate(`(() => {
      const g = window.__game; const r = g.players[0].robot;
      r.clearHopper?.(); r.teleport(-2.2, 0.6, 0);
      const cmd = (x) => ({ x, z: 0, rot: 0, refYaw: 0, intake: ${intake}, shoot: false, eject: false, climb: false });
      for (let k = 0; k < 60; k++) g.stepSim([cmd(0)], 1 / 120);
      let dist = 0, minV = 99, last = r.position.x; const vs = [];
      for (let k = 0; k < 120 * ${+process.env.SECS || 1.5}; k++) {
        g.stepSim([cmd(1)], 1 / 120);
        const v = Math.hypot(r.body.linvel().x, r.body.linvel().z); if (k > 90) { minV = Math.min(minV, v); vs.push(v); }
      }
      const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
      return { avgV: +avg.toFixed(2), minV: +minV.toFixed(2), x: +r.position.x.toFixed(2), stored: r.stored.length, entering: r.entering?.size ?? 0, intaked: r.stats.intaked, missed: r.stats.missedEntry ?? 0, spilled: r.stats.spilled ?? 0 };
    })()`);
    out[`${team}${intake ? '+in' : ''}`] = r;
  }
}
console.table(out);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
