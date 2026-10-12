// Screenshots each built-in robot's preview in the Garage.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto(process.env.URL ?? 'http://localhost:5273/');
await page.waitForTimeout(1200);
await page.getByText('Garage').first().click();
await page.waitForTimeout(800);
for (const t of ['4414', '971', '2910', '1690', '254', '1678']) {
  await page.getByText(new RegExp(`^${t} · `)).first().click();
  await page.waitForTimeout(1600);
  await page.locator('.preview canvas').screenshot({ path: `${out}/robot-${t}.png` });
}
await browser.close();
