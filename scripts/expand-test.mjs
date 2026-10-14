// 1678's expanding hopper: fill it through the intake (the roof rises once it's full and capacity grows with it),
// shoot it back down (the roof follows the pile), and the TRENCH: under it while the pile allows, blocked when packed.
import { chromium } from 'playwright-core';
const url = process.env.URL ?? 'http://localhost:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForTimeout(1000);
await page.getByText('Practice', { exact: true }).first().click();
await page.waitForTimeout(400);
await page.getByText(/^Team 1678 · /).first().click();
await page.getByText('Start Practice').click();
await page.waitForFunction(() => window.__game?.players?.length);
await page.waitForTimeout(400);
const r = await page.evaluate(() => {
  const g = window.__game; const r = g.players[0].robot; const fuel = g.field.fuel; const hub = g.field.hubs.blue.center;
  const IN = 0.0254;
  const idle = { x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false };
  const snap = (tag) => ({ tag, carried: r.carried, capacity: r.capacity, liftIn: +(r.liftPos / IN).toFixed(2) });
  // Fill through the intake.
  const fill = (target) => {
    const z = r.def.intake.zones[0];
    const log = [];
    let last = 0, stall = 0, mark = r.def.storage.capacity;
    for (let k = 0; k < 120 * 40 && r.carried < target; k++) {
      if (k % 4 === 0) {
        let i = -1;
        for (let j = 0; j < fuel.capacity; j++) if (fuel.state[j] === 'field') { const p = fuel.position(j); if (Math.hypot(p.x - r.position.x, p.z - r.position.z) > 2) { i = j; break; } }
        if (i >= 0) fuel.place(i, r.toWorld({ x: z.center[0], y: 0.09, z: (Math.random() - 0.5) * z.size[2] * 0.8 }), { x: 0, y: 0, z: 0 });
      }
      g.stepSim([{ ...idle, intake: true }], 1 / 120);
      if (r.carried >= mark) { log.push(snap(`k${k}`)); mark += 5; }
      if (r.carried > last) { last = r.carried; stall = 0; } else if (++stall > 120 * 5) break;
    }
    for (let k = 0; k < 240; k++) g.stepSim([idle], 1 / 120);
    log.push(snap('settled'));
    return log;
  };
  r.teleport(-1, 1.5, 0);
  for (let k = 0; k < 120; k++) g.stepSim([idle], 1 / 120);
  const start = snap('start');
  const filled = fill(999);
  // Shoot it down from 2.5 m.
  r.teleport(hub.x - 2.5, 0.5, Math.PI);
  for (let k = 0; k < 120; k++) g.stepSim([idle], 1 / 120);
  const shot = [];
  let mark = r.carried;
  for (let k = 0; k < 120 * 12 && r.carried > 0; k++) {
    g.stepSim([{ ...idle, shoot: true }], 1 / 120);
    if (r.carried <= mark - 5) { shot.push(snap(`k${k}`)); mark = r.carried; }
  }
  for (let k = 0; k < 240; k++) g.stepSim([idle], 1 / 120);
  shot.push(snap('end'));
  // TRENCH runs at a given load.
  const trench = (n) => {
    g.resetMatch();
    r.teleport(-1, 1.5, 0);
    for (let k = 0; k < 60; k++) g.stepSim([idle], 1 / 120);
    if (n > r.carried) fill(n);
    r.teleport(hub.x - 2.6, -3.4, 0);
    for (let k = 0; k < 240; k++) g.stepSim([idle], 1 / 120);
    const before = snap('before');
    let minLift = 99;
    for (let k = 0; k < 120 * 3; k++) { g.stepSim([{ ...idle, x: 1, refYaw: 0 }], 1 / 120); if (Math.abs(r.position.x - hub.x) < 0.4) minLift = Math.min(minLift, r.liftPos); }
    return { ...before, underIn: minLift === 99 ? null : +(minLift / IN).toFixed(2), passed: r.position.x > hub.x + 0.5 };
  };
  return { start, filled, shot, trench: [trench(8), trench(60), trench(74)] };
});
console.log(JSON.stringify(r, null, 1));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
