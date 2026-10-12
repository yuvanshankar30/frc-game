// Copies the OpenCascade WASM importer into public/ so the STEP worker can load it.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/occt-import-js/dist');
const dst = join(root, 'public/occt');
mkdirSync(dst, { recursive: true });
for (const f of ['occt-import-js.js', 'occt-import-js.wasm']) copyFileSync(join(src, f), join(dst, f));
