// Close-up turntable shots of one robot from several angles (uses the Garage preview).
import { chromium } from 'playwright-core';
const [team, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL ?? 'http://localhost:5174/');
await page.waitForTimeout(1200);
await page.getByText('Garage', { exact: true }).first().click();
await page.waitForTimeout(600);
await page.getByText(new RegExp(`^Team ${team} · `)).first().click();
await page.waitForTimeout(2500);
// Enlarge the preview canvas and step the orbit.
await page.addStyleTag({ content: '.select{grid-template-columns:1fr 1100px!important}.preview{height:760px!important}' });
await page.waitForTimeout(800);
for (let i = 0; i < 4; i++) {
  await page.mouse.move(1000, 400);
  await page.mouse.down();
  await page.mouse.move(1000 + 120, 400, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.locator('.preview canvas').screenshot({ path: `${out}/${team}-${i}.png` });
}
console.log(errors.length ? errors.join('\n') : 'ok');
await browser.close();
