// Match flow + mechanics checks: countdown, AUTO→TELEOP disable, shooting while rotating, rotor feeding, beaching.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const URL = process.env.URL ?? 'http://localhost:5174/';
async function start(mode, team) {
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.getByText(mode, { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText(new RegExp(`^${team} · `)).first().click();
  await page.getByText(`Start ${mode}`).click();
  await page.waitForFunction(() => window.__game?.players?.length);
  await page.waitForTimeout(300);
}
const idle = `({ x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false })`;
// 1) Match flow.
await start('Match', '4414');
const flow = await page.evaluate(`(() => {
  const g = window.__game; const r = g.players[0].robot; const idle = () => (${idle});
  const out = {};
  out.atStart = g.match.phase;
  const x0 = r.position.x;
  for (let k = 0; k < 120 * 2; k++) g.stepSim([{ ...idle(), x: 1 }], 1 / 120);
  out.movedDuringCountdown = +(r.position.x - x0).toFixed(3);
  for (let k = 0; k < 120 * 1.5; k++) g.stepSim([idle()], 1 / 120);
  out.afterCountdown = g.match.phase;
  for (let k = 0; k < 120 * 20.2; k++) g.stepSim([idle()], 1 / 120);
  out.afterAuto = g.match.phase;
  const x1 = r.position.x;
  for (let k = 0; k < 120 * 1.5; k++) g.stepSim([{ ...idle(), x: 1, shoot: true }], 1 / 120);
  out.movedDuringPause = +(r.position.x - x1).toFixed(3);
  for (let k = 0; k < 120 * 2; k++) g.stepSim([idle()], 1 / 120);
  out.afterPause = g.match.phase;
  const x2 = r.position.x;
  for (let k = 0; k < 120 * 0.8; k++) g.stepSim([{ ...idle(), x: 1 }], 1 / 120);
  out.movesInTeleop = +(r.position.x - x2).toFixed(2);
  return out;
})()`);
console.log('flow', JSON.stringify(flow));
// 2) Shooting while rotating (turret + fixed drum) and rotor feeding.
const rot = {};
for (const t of ['4414', '2910', '254']) {
  await start('Practice', t);
  rot[t] = await page.evaluate(`(() => {
    const g = window.__game; const r = g.players[0].robot; const hub = g.field.hubs.blue.center; const idle = () => (${idle});
    r.teleport(hub.x - 2.8, -1.4, 0.0); r.preload(g.field.fuel, 20);
    for (let k = 0; k < 60; k++) g.stepSim([idle()], 1 / 120);
    r.stats.shots = 0; r.stats.scored = 0;
    let rotorMoved = 0; const rj = r.assembly.joints.get('rotor'); const v0 = rj ? rj.value : 0;
    for (let k = 0; k < 120 * 4; k++) { g.stepSim([{ ...idle(), rot: 0.6, shoot: true }], 1 / 120); if (rj) rotorMoved = Math.max(rotorMoved, Math.abs(rj.value - v0)); }
    for (let k = 0; k < 120 * 2.5; k++) g.stepSim([idle()], 1 / 120);
    return { shots: r.stats.shots, scored: r.stats.scored, rotorDeg: Math.round(rotorMoved) };
  })()`);
}
console.log('rotating', JSON.stringify(rot));
// 3) Hard driving with spills: robot must never ride up on FUEL.
await start('Practice', '4414');
const beach = await page.evaluate(`(() => {
  const g = window.__game; const r = g.players[0].robot; const idle = () => (${idle});
  let maxY = 0, spilled = 0;
  r.teleport(-2.6, 0, 0); r.preload(g.field.fuel, 70);
  for (let k = 0; k < 120 * 8; k++) {
    const t = k / 120;
    const cmd = { ...idle(), x: Math.sin(t * 2.3), z: Math.cos(t * 1.7), rot: Math.sin(t * 3.1), intake: true };
    const before = r.stored.length; g.stepSim([cmd], 1 / 120); if (r.stored.length < before) spilled += before - r.stored.length;
    maxY = Math.max(maxY, r.position.y);
  }
  return { maxLift: +maxY.toFixed(3), spilled, stored: r.stored.length };
})()`);
console.log('beach', JSON.stringify(beach));
// 5) Worst case: drop every robot straight onto FUEL placed under its frame, then drive hard. Must never lift/tilt.
const under = {};
for (const team of ['4414', '971', '2910', '1690', '254', '1678']) {
  await start('Practice', team);
  under[team] = await page.evaluate(`(() => {
    const g = window.__game; const r = g.players[0].robot; const f = g.field.fuel; const idle = () => (${idle});
    r.teleport(-1.5, 2, 0); r.clearHopper?.();
    let j = 0; const nextBall = () => { const a = f.alloc(); if (a >= 0) return a; while (f.state[j] !== 'field') j++; return j++; };
    for (let dx = -0.25; dx <= 0.25; dx += 0.125) for (let dz = -0.25; dz <= 0.25; dz += 0.125)
      f.place(nextBall(), { x: -1.5 + dx, y: 0.076, z: 2 + dz }, { x: 0, y: 0, z: 0 });
    let maxY = 0, maxTilt = 0;
    for (let k = 0; k < 120 * 6; k++) {
      const t = k / 120;
      g.stepSim([{ ...idle(), x: Math.sin(t * 4.1), z: Math.cos(t * 3.3), rot: Math.sin(t * 2.7) }], 1 / 120);
      if (k > 30) { maxY = Math.max(maxY, r.position.y); const q = r.body.rotation(); maxTilt = Math.max(maxTilt, 2 * Math.asin(Math.min(1, Math.hypot(q.x, q.z)))); }
    }
    // Balls left inside the frame footprint (should be none: they get squeezed out).
    const p = r.position, h = r.yaw; let inside = 0;
    for (let i = 0; i < f.bodies.length; i++) if (f.state[i] === 'field') {
      const b = f.bodies[i].translation(); const dx = b.x - p.x, dz = b.z - p.z;
      const lx = dx * Math.cos(h) - dz * Math.sin(h), lz = dx * Math.sin(h) + dz * Math.cos(h);
      if (Math.abs(lx) < r.halfLength - 0.05 && Math.abs(lz) < r.halfWidth - 0.05 && b.y < 0.2) inside++;
    }
    return { maxLift: +maxY.toFixed(3), maxTiltDeg: +(maxTilt * 57.3).toFixed(1), ballsUnder: inside };
  })()`);
}
console.log('under', JSON.stringify(under));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
