// Convert a robot CAD assembly (STEP / IGES / BREP) into an optimized GLB for FRC Sim.
//
//   node scripts/cad-to-glb.mjs <input.step> <output.glb> [--units mm|in|m] [--ratio 0.5] [--deflection 0.001]
//
// Keeps the assembly tree and part names (so parts can be mapped to joints in the Robot Editor), keeps colors,
// welds and simplifies meshes (meshoptimizer) to keep triangle counts game-friendly, then writes a binary glTF.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Document, NodeIO } from '@gltf-transform/core';
import { weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: node scripts/cad-to-glb.mjs <input.step|.iges|.brep> <output.glb> [--ratio 0.5] [--deflection 0.001]');
  process.exit(1);
}
const [input, output] = args;
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const ratio = Number(opt('ratio', '0.5'));
const deflection = Number(opt('deflection', '0.001'));
const ext = input.toLowerCase().split('.').pop();
const format = ext === 'igs' || ext === 'iges' ? 'iges' : ext === 'brep' || ext === 'brp' ? 'brep' : 'step';

console.log(`Reading ${input} (${format})…`);
const occt = await require('occt-import-js')();
const t0 = Date.now();
const res = occt.ReadFile(format, new Uint8Array(readFileSync(input)), {
  linearUnit: 'meter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: deflection,
  angularDeflection: 0.5,
});
if (!res.success) {
  console.error('OpenCascade could not read the file.');
  process.exit(1);
}
console.log(`Tessellated ${res.meshes.length} meshes in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('robot');
const materials = new Map();
const matFor = (c) => {
  const key = c ? c.map((v) => v.toFixed(3)).join(',') : 'default';
  if (!materials.has(key)) {
    materials.set(
      key,
      doc
        .createMaterial(key)
        .setBaseColorFactor(c ? [c[0], c[1], c[2], 1] : [0.6, 0.63, 0.67, 1])
        .setMetallicFactor(0.35)
        .setRoughnessFactor(0.55),
    );
  }
  return materials.get(key);
};
const used = new Map();
const unique = (name) => {
  const base = (name || 'part').replace(/[^\w\-#]/g, '_').slice(0, 60) || 'part';
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n ? `${base}_${n}` : base;
};
const meshes = res.meshes.map((m) => {
  const mesh = doc.createMesh(unique(m.name));
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.attributes.position.array)).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', pos);
  if (m.attributes.normal) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.attributes.normal.array)).setBuffer(buffer));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(m.index.array)).setBuffer(buffer));
  const faceColor = (m.brep_faces ?? []).find((f) => f.color)?.color;
  prim.setMaterial(matFor(m.color ?? faceColor ?? null));
  mesh.addPrimitive(prim);
  return mesh;
});
let tris = 0;
for (const m of res.meshes) tris += m.index.array.length / 3;
const build = (n) => {
  const node = doc.createNode(unique(n.name || 'assembly'));
  for (const i of n.meshes) {
    const child = doc.createNode(unique(res.meshes[i].name || 'part')).setMesh(meshes[i]);
    node.addChild(child);
  }
  for (const c of n.children) node.addChild(build(c));
  return node;
};
scene.addChild(build(res.root));

console.log(`Optimizing (${Math.round(tris).toLocaleString()} triangles in)…`);
await MeshoptSimplifier.ready;
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0005 }), prune());
let out = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) out += (p.getIndices()?.getCount() ?? 0) / 3;
const glb = await new NodeIO().writeBinary(doc);
writeFileSync(output, glb);
console.log(`Wrote ${output}: ${Math.round(out).toLocaleString()} triangles, ${(glb.byteLength / 1e6).toFixed(1)} MB`);
console.log('Next: open the Robot Editor → Import → this GLB, set up joints/mechanisms, then Save or Export .frcbot.');
