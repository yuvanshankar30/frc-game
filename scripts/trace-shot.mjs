import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5273/');
await page.waitForTimeout(1200);
await page.getByText('Practice', { exact: true }).first().click();
await page.waitForTimeout(500);
await page.getByText(new RegExp(`^${process.argv[2]} · `)).first().click();
await page.getByText('Start Practice').click();
await page.waitForFunction(() => window.__game?.players?.length);
await page.waitForTimeout(500);
const r = await page.evaluate(async ([dist, NOSPREAD, NBALLS, PRE]) => {
  const g = window.__game; const rob = g.players[0].robot; const f = g.field.fuel;
  if (NOSPREAD) rob.def.shooter.spread = 0;
  const hub = g.field.hubs.blue.target;
  const sleep0 = (ms) => new Promise((res) => setTimeout(res, ms));
  if (PRE) {
    rob.preload(f, 10);
    rob.teleport(hub.x - PRE * Math.cos(0.61), -PRE * Math.sin(0.61), 0.3);
    await sleep0(300);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await sleep0(3500);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    await sleep0(2200);
  }
  rob.stats.shots = 0; rob.stats.scored = 0;
  rob.stored.splice(0).forEach((i) => f.hold(i, 'free'));
  rob.preload(f, NBALLS);
  rob.teleport(hub.x - dist * Math.cos(0.61), -dist * Math.sin(0.61), 0.3);
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  await sleep(300);
  const tracked = new Map();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  const out = [];
  for (let t = 0; t < 300; t++) {
    await new Promise((res) => requestAnimationFrame(res));
    for (let i = 0; i < f.capacity; i++) {
      if (f.state[i] === 'field' && f.lastShooter[i] === rob.id) {
        const p = f.position(i), v = f.velocity(i);
        const prev = tracked.get(i);
        if (t % 10 === 0 && i === [...tracked.keys()][0]) { const q = rob.body.rotation(); const lv = rob.body.linvel(); out.push({ robot: { t, pos: [rob.position.x - hub.x, rob.position.y, rob.position.z].map((x) => +x.toFixed(3)), yaw: +rob.yaw.toFixed(3), q: [q.x, q.z].map((x) => +x.toFixed(3)), lv: [lv.x, lv.y, lv.z].map((x) => +x.toFixed(2)), turret: rob.turretYaw.map((x) => +x.toFixed(3)), stored: rob.stored.length } }); }
        if (false) out.push({ t, p: [p.x - hub.x, p.y, p.z - hub.z].map((x) => +x.toFixed(2)), v: [v.x, v.y, v.z].map((x) => +x.toFixed(1)) });
        if (prev && prev.y >= hub.y && p.y < hub.y && v.y < 0 && !prev.done) {
          out.push({ ball: i, dx: +(p.x - hub.x).toFixed(3), dz: +(p.z - hub.z).toFixed(3) });
          prev.done = true;
        }
        tracked.set(i, { y: p.y, done: prev?.done });
      }
      if (f.state[i] === 'hub' && tracked.has(i) && !tracked.get(i).done) { out.push({ ball: i, scored: true }); tracked.get(i).done = true; }
    }
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  return { out, aim: rob.aimCache?.barrels, hood: rob.hoodAngle, scored: rob.stats.scored, shots: rob.stats.shots };
}, [Number(process.argv[3] ?? 5), process.env.NOSPREAD === '1', Number(process.env.NBALLS ?? 3), Number(process.env.PRE ?? 0)]);
console.log(JSON.stringify(r, null, 1));
await browser.close();
