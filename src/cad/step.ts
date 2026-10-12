import * as THREE from 'three';

/** Result shape of occt-import-js (subset). */
interface OcctMesh {
  name: string;
  color?: [number, number, number];
  brep_faces?: { first: number; last: number; color: [number, number, number] | null }[];
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
}
interface OcctNode {
  name: string;
  meshes: number[];
  children: OcctNode[];
}
interface OcctResult {
  success: boolean;
  root: OcctNode;
  meshes: OcctMesh[];
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: OcctResult) => void; reject: (e: Error) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(`${import.meta.env.BASE_URL}occt/step-worker.js`);
    worker.onmessage = (ev) => {
      const { id, result, error } = ev.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'STEP worker failed'));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

/** Convert a STEP / IGES / BREP file to a Three.js hierarchy (meters, Z-up as authored). */
export async function readStepFile(buf: ArrayBuffer, format: 'step' | 'iges' | 'brep'): Promise<THREE.Object3D> {
  const id = ++seq;
  const result = await new Promise<OcctResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, format, buffer: buf }, [buf]);
  });
  if (!result?.success) throw new Error('OpenCascade could not read this file');
  return occtToThree(result);
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function colorMat(c: [number, number, number] | null | undefined) {
  const key = c ? c.map((v) => v.toFixed(3)).join(',') : 'default';
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: c ? new THREE.Color(c[0], c[1], c[2]) : new THREE.Color(0x9aa3ad),
      metalness: 0.35,
      roughness: 0.55,
    });
    matCache.set(key, m);
  }
  return m;
}

export function occtToThree(res: OcctResult): THREE.Object3D {
  const meshes = res.meshes.map((m) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
    if (m.attributes.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
    const idx = m.index.array;
    geo.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    if (!m.attributes.normal) geo.computeVertexNormals();
    // Per-face colors become material groups.
    let material: THREE.Material | THREE.Material[] = colorMat(m.color);
    const faces = m.brep_faces ?? [];
    if (faces.some((f) => f.color)) {
      const mats: THREE.Material[] = [];
      const index = new Map<string, number>();
      for (const f of faces) {
        const c = f.color ?? m.color ?? null;
        const k = c ? c.join(',') : 'd';
        if (!index.has(k)) {
          index.set(k, mats.length);
          mats.push(colorMat(c));
        }
        geo.addGroup(f.first * 3, (f.last - f.first + 1) * 3, index.get(k)!);
      }
      material = mats;
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = m.name || 'part';
    return mesh;
  });
  const build = (n: OcctNode): THREE.Object3D => {
    const g = new THREE.Group();
    g.name = n.name || 'assembly';
    for (const i of n.meshes) {
      // A mesh can be instanced by several nodes; clone after the first use.
      const m = meshes[i];
      g.add(m.parent ? m.clone() : m);
    }
    for (const c of n.children) g.add(build(c));
    return g;
  };
  return build(res.root);
}
