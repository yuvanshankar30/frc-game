// Holding Shoot must always fire: every robot from random spots / headings in its zone, standing and driving.
import { chromium } from 'playwright-core';
const url = process.env.URL ?? 'http://localhost:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
for (const team of (process.env.ROBOTS ?? '4414,971,2910,1690,254,1678').split(',')) {
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
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const fails = []; let cases = 0, shots = 0, made = 0, firstShot = [];
    for (let n = 0; n < 16; n++) {
      const moving = n % 2 === 1;
      const x = hub.x - 1.6 - rnd() * 2.8;
      const z = (rnd() - 0.5) * 5;
      const yaw = rnd() * Math.PI * 2;
      rob.stored.splice(0).forEach((i) => g.field.fuel.hold(i, 'free'));
      rob.teleport(x, z, yaw); rob.preload(g.field.fuel, 6);
      for (let k = 0; k < 60; k++) g.stepSim([idle], 1 / 120);
      rob.stats.shots = 0; rob.stats.scored = 0;
      const dir = rnd() * Math.PI * 2;
      let t1 = -1;
      for (let k = 0; k < 120 * 3.5; k++) {
        g.stepSim([{ ...idle, shoot: true, x: moving ? 0.5 * Math.cos(dir) : 0, z: moving ? 0.5 * Math.sin(dir) : 0 }], 1 / 120);
        if (t1 < 0 && rob.stats.shots > 0) t1 = k / 120;
      }
      for (let k = 0; k < 240; k++) g.stepSim([idle], 1 / 120);
      cases++; shots += rob.stats.shots; made += rob.stats.scored;
      if (t1 >= 0) firstShot.push(t1);
      if (rob.stats.shots === 0) fails.push(`${moving ? 'moving' : 'still'} x${(x - hub.x).toFixed(1)} z${z.toFixed(1)} yaw${Math.round((yaw * 180) / Math.PI)}`);
    }
    firstShot.sort((a, b) => a - b);
    return { cases, noShot: fails.length, shots, made, medianFirstShot: firstShot[Math.floor(firstShot.length / 2)]?.toFixed(2), worstFirstShot: firstShot.at(-1)?.toFixed(2), fails };
  });
  console.log(team, JSON.stringify(r));
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
