import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge the meshes that move together into one mesh per material.
 *
 * Imported CAD is often thousands of parts, each its own draw call. In game, everything bolted to the chassis (or to
 * one joint) moves as a unit, so it can be baked into a few large meshes. `containers` are the moving groups (the
 * chassis and each joint's motion group); meshes are merged into the nearest container above them, and nothing is
 * merged across a `boundary` (another joint's pivot group). Returns the number of meshes removed.
 */
export function mergeStatic(containers: THREE.Object3D[], isBoundary: (o: THREE.Object3D) => boolean): number {
  let removed = 0;
  for (const c of containers) removed += mergeInto(c, isBoundary);
  return removed;
}

function mergeInto(container: THREE.Object3D, isBoundary: (o: THREE.Object3D) => boolean): number {
  container.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const meshes: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const ch of o.children) {
      if (isBoundary(ch)) continue;
      const m = ch as THREE.Mesh;
      if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !m.geometry.morphAttributes.position) {
        meshes.push(m);
      }
      walk(ch);
    }
  };
  walk(container);
  if (meshes.length < 8) return 0;

  // Bucket geometry pieces by material + attribute layout.
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const done: THREE.Mesh[] = [];
  const rel = new THREE.Matrix4();
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.some((x) => !x || (x as THREE.MeshStandardMaterial).transparent)) continue; // keep see-through parts sorted on their own
    rel.multiplyMatrices(inv, m.matrixWorld);
    const base = normalize(m.geometry);
    if (!base) continue;
    base.applyMatrix4(rel);
    const pieces: [THREE.Material, THREE.BufferGeometry][] =
      Array.isArray(m.material) && m.geometry.groups.length
        ? m.geometry.groups.map((g) => [mats[g.materialIndex ?? 0] ?? mats[0], slice(base, g.start, g.count)] as [THREE.Material, THREE.BufferGeometry])
        : [[mats[0], base]];
    for (const [mat, geo] of pieces) {
      const key = `${mat.uuid}|${Object.entries(geo.attributes).map(([k, a]) => `${k}:${(a as THREE.BufferAttribute).normalized ? 'n' : ''}${(a as THREE.BufferAttribute).array.constructor.name}`).sort().join(',')}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat, geos: [] }));
      b.geos.push(geo);
    }
    done.push(m);
  }
  if (done.length < 8) return 0;

  for (const { mat, geos } of buckets.values()) {
    // Keep each merged mesh under 32-bit-safe sizes and reasonable for culling.
    for (let k = 0; k < geos.length; k += 4000) {
      const merged = mergeGeometries(geos.slice(k, k + 4000), false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `merged:${container.name}`;
      container.add(mesh);
    }
  }
  // The originals' geometry may be shared with other clones of the model, so it's only detached, not disposed. Groups
  // left empty stay in place: they may still carry joint pivots.
  for (const m of done) m.removeFromParent();
  return done.length;
}

/** Indexed copy with just position / normal (+ color / uv if present), the layout mergeGeometries needs. */
function normalize(src: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const pos = src.getAttribute('position');
  if (!pos) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos.clone());
  const n = pos.count;
  const idx = src.index ? Array.from(src.index.array as ArrayLike<number>) : Array.from({ length: n }, (_, i) => i);
  g.setIndex(idx);
  if (src.getAttribute('normal')) g.setAttribute('normal', src.getAttribute('normal').clone());
  else g.computeVertexNormals();
  if (src.getAttribute('color')) g.setAttribute('color', src.getAttribute('color').clone());
  if (src.getAttribute('uv')) g.setAttribute('uv', src.getAttribute('uv').clone());
  for (const grp of src.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
  return g;
}

/** Compact sub-geometry for one index range (a material group): only the vertices that range uses. */
function slice(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const idx = g.index!.array as ArrayLike<number>;
  const remap = new Map<number, number>();
  const sub = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const v = idx[start + i];
    let k = remap.get(v);
    if (k === undefined) remap.set(v, (k = remap.size));
    sub[i] = k;
  }
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const attr = a as THREE.BufferAttribute;
    const arr = new Float32Array(remap.size * attr.itemSize);
    for (const [from, to] of remap)
      for (let c = 0; c < attr.itemSize; c++) {
        const raw = attr.getComponent(from, c);
        arr[to * attr.itemSize + c] = attr.normalized ? THREE.MathUtils.denormalize(raw, attr.array as Uint8Array) : raw;
      }
    out.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize));
  }
  out.setIndex(sub);
  return out;
}
