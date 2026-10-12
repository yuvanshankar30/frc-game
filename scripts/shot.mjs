// Headless smoke test / screenshot helper: node scripts/shot.mjs <out-dir> [steps.json]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });
const url = process.env.URL ?? 'http://localhost:5273/';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
const steps = JSON.parse(process.env.STEPS ?? '[]');
let n = 0;
for (const s of steps) {
  if (s.click) await page.getByText(s.click, { exact: s.exact ?? false }).first().click();
  if (s.css) await page.locator(s.css).first().click();
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.press) await page.keyboard.press(s.press);
  if (s.eval) logs.push(`[eval] ${JSON.stringify(await page.evaluate(s.eval))}`);
  if (s.shot) await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${s.shot}.png` });
}
writeFileSync(`${out}/console.log`, logs.join('\n'));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 30).join('\n') || 'no errors');
await browser.close();
