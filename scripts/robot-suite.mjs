// Drives every built-in robot through a scripted test in a real browser and prints a report.
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5273/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const ids = ['builtin-4414', 'builtin-971', 'builtin-2910', 'builtin-1690', 'builtin-254', 'builtin-1678'];
const results = [];
for (const id of ids) {
  await page.goto(url);
  await page.evaluate((id) => localStorage.clear(), id);
  await page.waitForTimeout(1500);
  await page.getByText('Practice', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByText(new RegExp(`^${id.split('-')[1]} · `)).first().click();
  await page.getByText('Start Practice').click();
  await page.waitForFunction(() => window.__game?.players?.length, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.players[0];
    const rob = p.robot;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const hub = g.field.hubs.blue.center;
    const out = { name: rob.def.name, shots: {} };
    // Shooting from several distances (robot facing the HUB; fixed shooters rely on assist rotation).
    for (const d of [2, 3.5, 5]) {
      rob.stored.splice(0).forEach((i) => g.field.fuel.hold(i, 'free'));
      const a = (35 * Math.PI) / 180;
      rob.teleport(hub.x - d * Math.cos(a), -d * Math.sin(a), 0.3);
      rob.preload(g.field.fuel, 10);
      rob.stats.shots = 0; rob.stats.scored = 0;
      await sleep(300);
      // hold shoot via synthetic input
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      await sleep(3500);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
      await sleep(2200);
      out.shots[d] = `${rob.stats.scored}/${rob.stats.shots}`;
    }
    // Intake: drive forward into the neutral FUEL grid.
    rob.teleport(-2.2, 0, 0);
    rob.stored.splice(0).forEach((i) => g.field.fuel.hold(i, 'free'));
    await sleep(200);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await sleep(2500);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    out.intaked = rob.stored.length;
    // Bump: drive from the alliance zone over the bump into the neutral zone.
    rob.teleport(hub.x - 1.4, 1.52, 0);
    await sleep(200);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    let maxY = 0;
    for (let k = 0; k < 25; k++) { await sleep(100); maxY = Math.max(maxY, rob.position.y); }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    out.bump = { x: +(rob.position.x - hub.x).toFixed(2), maxY: +maxY.toFixed(3) };
    // Trench: drive under the arm along the guardrail.
    rob.teleport(hub.x - 1.6, -3.4, 0);
    await sleep(200);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await sleep(2200);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    out.trench = +(rob.position.x - hub.x).toFixed(2);
    // Climb.
    const t = g.field.towers.blue;
    rob.teleport(t.rungX + rob.halfLength + 0.4, t.rungZ, Math.PI);
    await sleep(300);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
    await sleep(50);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
    await sleep((rob.def.climber?.climbTime ?? 0) * 1000 + 1800);
    out.climb = { state: rob.climb, level: rob.climbLevel, y: +rob.position.y.toFixed(2) };
    out.fps = g.fps;
    return out;
  });
  results.push(r);
  await page.screenshot({ path: `${process.argv[2] ?? '.'}/suite-${id}.png` });
}
console.table(results.map((r) => ({ robot: r.name, '2m': r.shots[2], '3.5m': r.shots[3.5], '5m': r.shots[5], intaked: r.intaked, bumpX: r.bump.x, bumpMaxY: r.bump.maxY, trenchX: r.trench, climb: `${r.climb.state} L${r.climb.level} y=${r.climb.y}`, fps: r.fps })));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
