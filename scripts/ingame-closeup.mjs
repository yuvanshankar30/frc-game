// In-game close-ups of one robot with its intake deployed (and optionally shooting), from several angles.
//   node scripts/ingame-closeup.mjs <team> <outDir>
import { chromium } from 'playwright-core';
const [team, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL ?? 'http://localhost:5174/');
await page.waitForTimeout(1000);
await page.getByText('Practice', { exact: true }).first().click();
await page.waitForTimeout(400);
await page.getByText(new RegExp(`^${team} · `)).first().click();
await page.getByText('Start Practice').click();
await page.waitForFunction(() => window.__game?.players?.length);
await page.waitForTimeout(600);
await page.addStyleTag({ content: '.hud, .scorebar, .driver-panel, .minimap, .banner, [class*="hud"], [class*="panel"] { display: none !important; }' });
await page.evaluate(() => {
  const g = window.__game;
  const r = g.players[0].robot;
  r.teleport(-1.6, -2.6, 0);
  const cmd = { x: 0, z: 0, rot: 0, refYaw: 0, intake: true, shoot: false, eject: false, climb: false };
  for (let k = 0; k < 150; k++) g.stepSim([cmd], 1 / 120);
  const rig = g.players[0].rig;
  rig.update = () => {};
  window.__shot = (k) => {
    const p = r.position;
    const a = Math.PI / 5 + (k * Math.PI) / 2;
    rig.camera.position.set(p.x + Math.cos(a) * 1.7, 0.95, p.z - Math.sin(a) * 1.7);
    rig.camera.lookAt(p.x, 0.25, p.z);
  };
});
for (let k = 0; k < 4; k++) {
  await page.evaluate((k) => window.__shot(k), k);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${team}-game-${k}.png` });
}
console.log(errors.length ? errors.join('\n') : 'ok');
await browser.close();
