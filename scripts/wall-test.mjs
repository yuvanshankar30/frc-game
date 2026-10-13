// Wall impacts (issues #1, #2): robots slammed into the guardrails / alliance wall at full speed must not sink into or
// climb them, and FUEL bulldozed into a wall must stay on the field.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ids = (process.env.ROBOTS ?? '4414,971,2910,1690,254,1678').split(',');
const rows = [];
for (const t of ids) {
  await page.goto(process.env.URL ?? 'http://localhost:5174/');
  await page.waitForTimeout(1200);
  await page.getByText('Practice', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText(new RegExp(`^Team ${t}`)).first().click();
  await page.getByText('Start Practice').click();
  await page.waitForFunction(() => window.__game?.players?.length);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const rob = g.players[0].robot;
    const idle = () => ({ x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false });
    const HW = 8.07 / 2;
    const HL = 16.54 / 2;
    // Worst overlap of the bumper box past a wall plane, plus lift and tilt, while driving into it.
    const hit = (x, z, yaw, cmd, wall) => {
      rob.teleport(x, z, yaw);
      for (let k = 0; k < 24; k++) g.stepSim([idle()], 1 / 120);
      let pen = 0, lift = 0, tilt = 0;
      for (let k = 0; k < 240; k++) {
        g.stepSim([{ ...idle(), ...cmd }], 1 / 120);
        const p = rob.position;
        const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => rob.toWorld({ x: a * rob.halfLength, y: 0.1, z: b * rob.halfWidth }));
        for (const c of corners) pen = Math.max(pen, wall(c));
        lift = Math.max(lift, p.y);
        const q = rob.body.rotation();
        tilt = Math.max(tilt, 2 * Math.asin(Math.min(1, Math.hypot(q.x, q.z))));
      }
      return `${(pen * 100).toFixed(1)}cm/${(lift * 100).toFixed(1)}cm/${((tilt * 180) / Math.PI).toFixed(1)}°`;
    };
    const out = {};
    out.side = hit(2, HW - 1.2, 0, { z: 1 }, (c) => c.z - HW);
    out.diag = hit(-1, HW - 1.4, 0.5, { x: 0.7, z: 0.7 }, (c) => c.z - HW);
    out.spinIn = hit(2.5, -HW + 0.9, 0, { z: -1, rot: 1 }, (c) => -HW - c.z);
    out.endWall = hit(HL - 2.2, 0.6, 0, { x: 1 }, (c) => c.x - HL);
    out.t25 = hit(HL - 2.2, 2.5, 0, { x: 1 }, (c) => c.x - HL);
    out.t30 = hit(HL - 2.2, 3.0, 0, { x: 1 }, (c) => c.x - HL);
    out.t37 = hit(HL - 2.2, 3.37, 0, { x: 1 }, (c) => c.x - HL);
    out.towerB = hit(-HL + 2.2, 3.37, Math.PI, { x: -1 }, (c) => -HL - c.x);
    // Bulldoze the FUEL grid into the side wall, then sweep along it: count balls that got outside.
    g.field.stageFuel();
    rob.teleport(0.6, -0.5, Math.PI / 2);
    for (let k = 0; k < 24; k++) g.stepSim([idle()], 1 / 120);
    for (let k = 0; k < 240; k++) g.stepSim([{ ...idle(), z: 1 }], 1 / 120);
    for (let k = 0; k < 240; k++) g.stepSim([{ ...idle(), z: 0.6, x: k % 120 < 60 ? 1 : -1, rot: 0.6 }], 1 / 120);
    for (let k = 0; k < 120; k++) g.stepSim([idle()], 1 / 120);
    const f = g.field.fuel;
    let outside = 0;
    for (let i = 0; i < f.capacity; i++) {
      if (f.state[i] !== 'field') continue;
      const p = f.position(i);
      if (Math.abs(p.z) > HW + 0.02 || p.y < -0.2) outside++;
    }
    out.fuelOut = outside;
    return out;
  });
  rows.push({ robot: t, ...r });
}
console.log('pen/lift/tilt per impact');
console.table(rows);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
