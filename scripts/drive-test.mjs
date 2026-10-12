// Drive physics checks: bump crossing at several angles/speeds (no beaching), top speed, stopping, trench.
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
  await page.getByText(new RegExp(`^${t} · `)).first().click();
  await page.getByText('Start Practice').click();
  await page.waitForFunction(() => window.__game?.players?.length);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const rob = g.players[0].robot;
    const hub = g.field.hubs.blue.center;
    const idle = () => ({ x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false });
    const run = (secs, cmd) => { for (let k = 0; k < secs * 120; k++) g.stepSim([{ ...idle(), ...cmd }], 1 / 120); };
    const out = {};
    // Top speed + stop distance on open carpet (across the field width, clear of FUEL).
    rob.teleport(-2.4, -3.2, -Math.PI / 2); run(0.3, {});
    run(1.2, { z: 1 }); out.vmax = Math.hypot(rob.body.linvel().x, rob.body.linvel().z).toFixed(2);
    const z0 = rob.position.z; run(1.5, {}); out.stop = (rob.position.z - z0).toFixed(2);
    // Bump crossings straight and at 20°, full and 40% throttle; count beaching (stuck on top / against it).
    const cases = [];
    for (const ang of [0, 0.35]) for (const thr of [1, 0.4]) {
      rob.teleport(hub.x - 1.3, 1.52 - Math.sin(ang) * 0.6, ang * 0); run(0.2, {});
      let maxY = 0;
      for (let k = 0; k < 360; k++) { g.stepSim([{ ...idle(), x: Math.cos(ang) * thr, z: Math.sin(ang) * thr }], 1 / 120); maxY = Math.max(maxY, rob.position.y); }
      cases.push(`${(rob.position.x - hub.x).toFixed(1)}${rob.position.x - hub.x > 0.9 ? '✓' : '✗'}`);
    }
    out.bump = cases.join(' ');
    // Drive through the neutral FUEL grid at full speed, sideways and diagonally: never beach on FUEL.
    let maxLift = 0;
    // Straight through the grid along X, diagonally, and across it along Z (stays inside the neutral zone).
    for (const [sx, sz, dx, dz, secs] of [[-2.2, 0.3, 1, 0, 1.1], [-2.0, -2.2, 0.7, 0.7, 1.3], [0.1, -3.1, 0, 1, 1.4]]) {
      g.field.stageFuel();
      rob.teleport(sx, sz, 0); run(0.2, {});
      for (let k = 0; k < secs * 120; k++) { g.stepSim([{ ...idle(), x: dx, z: dz }], 1 / 120); maxLift = Math.max(maxLift, rob.position.y); }
    }
    out.fuelLift = maxLift.toFixed(3);
    // Trench pass.
    rob.teleport(hub.x - 1.6, -3.4, 0); run(0.2, {}); run(2.2, { x: 1 });
    out.trench = (rob.position.x - hub.x).toFixed(2);
    out.grounded = rob.grounded;
    return out;
  });
  rows.push({ robot: t, ...r });
}
console.table(rows);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
