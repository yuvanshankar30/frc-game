// Frame-time breakdown while driving through FUEL and shooting: sim, sync, render (CPU ms) + draw calls.
//   URL=http://localhost:5174/ node scripts/perf-test.mjs
import { chromium } from 'playwright-core';
const url = process.env.URL ?? 'http://localhost:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
for (const team of (process.env.ROBOTS ?? '4414,254').split(',')) {
  await page.goto(url);
  await page.waitForTimeout(1200);
  await page.getByText('Practice', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByText(new RegExp(`^Team ${team} · `)).first().click();
  await page.getByText('Start Practice').click();
  await page.waitForFunction(() => window.__game?.players?.length);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__game;
    const T = (window.__t = { sim: [], sync: [], render: [], frame: [], gap: [], calls: 0, tris: 0, steps: 0 });
    const wrap = (name, key) => {
      const f = g[name].bind(g);
      g[name] = (...a) => { const t0 = performance.now(); const r = f(...a); T[key].push(performance.now() - t0); return r; };
    };
    wrap('stepSim', 'sim');
    T.parts = {};
    const time = (obj, name, label) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const t0 = performance.now(); const r = f(...a); const d = performance.now() - t0; if (d > 20) T.parts[label] = (T.parts[label] ?? []).concat(d.toFixed(0)); return r; }; };
    time(g.players[0].robot, 'sync', 'robotSync');
    time(g.players[0].rig, 'update', 'camera');
    time(g, 'pushHud', 'hud');
    wrap('render', 'render');
    const fs = g.field.sync.bind(g.field);
    g.field.sync = () => { const t0 = performance.now(); fs(); T.sync.push(performance.now() - t0); };
    const loop = g.loop;
    let last = performance.now();
    T.spikes = []; T.t0 = performance.now();
    g.loop = () => { const t0 = performance.now(); T.gap.push(t0 - last); last = t0; const ns = T.sim.length, nr = T.render.length; loop(); const ft = performance.now() - t0; T.frame.push(ft); if (ft > 40) T.spikes.push(`${((t0 - T.t0) / 1000).toFixed(2)}s frame ${ft.toFixed(0)} sim ${T.sim.slice(ns).reduce((a, b) => a + b, 0).toFixed(0)} render ${T.render.slice(nr).reduce((a, b) => a + b, 0).toFixed(0)}`); const i = g.renderer.info.render; T.calls = i.calls; T.tris = i.triangles; };
  });
  // Drive into the FUEL with intake on, then shoot while strafing.
  const k = page.keyboard;
  await page.evaluate(() => { window.__t.sim.length = window.__t.render.length = window.__t.frame.length = window.__t.gap.length = window.__t.sync.length = 0; window.__t.t0 = performance.now(); });
  await k.down('ShiftLeft'); await k.down('KeyW'); await page.waitForTimeout(2500); await k.up('KeyW');
  await k.down('KeyA'); await k.down('Space'); await page.waitForTimeout(3000); await k.up('KeyA'); await k.up('Space'); await k.up('ShiftLeft');
  await k.down('KeyD'); await k.down('ArrowRight'); await page.waitForTimeout(1500); await k.up('KeyD'); await k.up('ArrowRight');
  const r = await page.evaluate(() => {
    const T = window.__t;
    const st = (a) => { const s = [...a].sort((x, y) => x - y); const avg = s.reduce((x, y) => x + y, 0) / Math.max(1, s.length); return `avg ${avg.toFixed(2)} p95 ${(s[Math.floor(s.length * 0.95)] ?? 0).toFixed(2)} max ${(s[s.length - 1] ?? 0).toFixed(1)}`; };
    const long = T.gap.filter((x) => x > 25).length;
    return { frames: T.frame.length, fps: Math.round(T.frame.length / (T.gap.reduce((a, b) => a + b, 0) / 1000)), longFrames: long, frame: st(T.frame), simStep: st(T.sim), stepsPerFrame: (T.sim.length / T.frame.length).toFixed(2), fuelSync: st(T.sync), render: st(T.render), gap: st(T.gap), calls: T.calls, tris: T.tris, spikes: T.spikes, parts: T.parts };
  });
  console.log(team, JSON.stringify(r, null, 1));
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
