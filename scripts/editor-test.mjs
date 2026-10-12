// Imports a generated STL + GLB into the Robot Editor, adds a joint, saves, and test-drives it.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });
// Simple ASCII STL: a 700 x 650 x 400 mm box "robot" in millimeters, Z up.
const box = (x0, y0, z0, x1, y1, z1) => {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return f.map(([a, b, c]) => `facet normal 0 0 0\n outer loop\n  vertex ${v[a].join(' ')}\n  vertex ${v[b].join(' ')}\n  vertex ${v[c].join(' ')}\n endloop\nendfacet`).join('\n');
};
const stl = `solid robot\n${box(0, 0, 0, 700, 650, 120)}\n${box(200, 100, 120, 500, 550, 400)}\nendsolid robot`;
writeFileSync(`${out}/test-robot.stl`, stl);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(process.env.URL ?? 'http://localhost:5273/');
await page.waitForTimeout(1500);
await page.getByText('Robot Editor').first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/editor-empty.png` });
await page.setInputFiles('input[type=file]', `${out}/test-robot.stl`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/editor-imported.png` });
await page.getByRole('button', { name: 'Robot', exact: true }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/editor-robot-tab.png` });
await page.getByRole('button', { name: 'Joints' }).click();
await page.locator('.tree-row').first().click();
await page.getByText(/\+ Add joint/).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/editor-joint.png` });
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/editor-save.png` });
await page.getByText('Save & test drive').click();
await page.waitForTimeout(5000);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyW');
await page.screenshot({ path: `${out}/editor-testdrive.png` });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
