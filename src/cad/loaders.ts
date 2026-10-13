import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { readStepFile, type StepDetail } from './step';

export type CadFormat = 'glb' | 'gltf' | 'stl' | 'obj' | '3mf' | 'fbx' | 'ply' | 'step' | 'iges' | 'brep';

const EXT: Record<string, CadFormat> = {
  glb: 'glb',
  gltf: 'gltf',
  stl: 'stl',
  obj: 'obj',
  '3mf': '3mf',
  fbx: 'fbx',
  ply: 'ply',
  step: 'step',
  stp: 'step',
  iges: 'iges',
  igs: 'iges',
  brep: 'brep',
  brp: 'brep',
};

/** Every extension the importer reads (for file pickers). */
export const CAD_ACCEPT = Object.keys(EXT)
  .map((e) => `.${e}`)
  .join(',');

export function detectFormat(name: string): CadFormat | null {
  return EXT[name.toLowerCase().split('.').pop() ?? ''] ?? null;
}

export interface ImportOptions {
  /** Drop screws, nuts, washers, rivets and other tiny hardware (they're most of a robot's part count). */
  stripHardware?: boolean;
  /** STEP / IGES tessellation detail. */
  detail?: StepDetail;
}

export interface ImportResult {
  model: THREE.Object3D;
  format: CadFormat;
  /** Guessed meters-per-unit for the raw model. */
  unitScale: number;
  /** Guessed up axis of the raw model. */
  upAxis: 'y' | 'z';
  triangles: number;
  /** Parts in the model after cleanup. */
  parts: number;
  /** Hardware / tiny parts removed by `stripHardware`. */
  stripped: number;
  warnings: string[];
}

const defaultMat = () => new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.4, roughness: 0.5 });

export async function loadGlb(buf: ArrayBuffer): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  return gltf.scene;
}

/**
 * A .gltf with external buffers / textures: resolve its relative URIs against the other dropped files
 * (scene.gltf + scene.bin + textures/*.png dropped together).
 */
async function loadGltfWithSidecars(main: File, all: File[]): Promise<THREE.Object3D> {
  const urls = new Map<string, string>();
  for (const f of all) if (f !== main) urls.set(f.name.toLowerCase(), URL.createObjectURL(f));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const name = decodeURIComponent(url.split(/[\\/]/).pop() ?? '').toLowerCase();
    return urls.get(name) ?? url;
  });
  try {
    const gltf = await new GLTFLoader(manager).parseAsync(await main.text(), '');
    return gltf.scene;
  } finally {
    for (const u of urls.values()) URL.revokeObjectURL(u);
  }
}

/** Sidecar files that belong to a .gltf / .obj and aren't models themselves. */
const SIDECAR = /\.(bin|png|jpe?g|webp|ktx2|mtl)$/i;

/** Import one or more CAD files into a single model with uniquely named parts. */
export async function importCad(files: File[], onProgress?: (msg: string) => void, opts: ImportOptions = {}): Promise<ImportResult> {
  const root = new THREE.Group();
  root.name = 'imported';
  const warnings: string[] = [];
  let format: CadFormat = 'glb';
  for (const f of files) {
    const fmt = detectFormat(f.name);
    if (!fmt) {
      if (!SIDECAR.test(f.name)) warnings.push(`Skipped ${f.name}: unsupported format`);
      continue;
    }
    format = fmt;
    onProgress?.(`Reading ${f.name}…`);
    const base = f.name.replace(/\.[^.]+$/, '');
    let obj: THREE.Object3D;
    switch (fmt) {
      case 'glb':
        obj = await loadGlb(await f.arrayBuffer());
        break;
      case 'gltf': {
        const text = await f.text();
        const external = /"uri"\s*:\s*"(?!data:)/.test(text);
        if (external && !files.some((x) => /\.bin$/i.test(x.name))) {
          warnings.push(`${f.name} references external .bin / texture files. Drop them together with the .gltf, or export a single binary .glb.`);
        }
        obj = await loadGltfWithSidecars(f, files);
        break;
      }
      case 'stl': {
        const geo = new STLLoader().parse(await f.arrayBuffer());
        geo.computeVertexNormals();
        const hasColors = !!geo.getAttribute('color');
        obj = new THREE.Mesh(geo, hasColors ? new THREE.MeshStandardMaterial({ vertexColors: true }) : defaultMat());
        obj.name = base;
        break;
      }
      case 'obj':
        obj = new OBJLoader().parse(await f.text());
        obj.name = base;
        break;
      case '3mf':
        obj = new ThreeMFLoader().parse(await f.arrayBuffer());
        obj.name = obj.name || base;
        break;
      case 'fbx':
        obj = new FBXLoader().parse(await f.arrayBuffer(), '');
        obj.name = obj.name || base;
        break;
      case 'ply': {
        const geo = new PLYLoader().parse(await f.arrayBuffer());
        if (!geo.getAttribute('normal')) geo.computeVertexNormals();
        obj = new THREE.Mesh(geo, geo.getAttribute('color') ? new THREE.MeshStandardMaterial({ vertexColors: true }) : defaultMat());
        obj.name = base;
        break;
      }
      case 'step':
      case 'iges':
      case 'brep': {
        onProgress?.(`Tessellating ${f.name} with OpenCascade (this can take a while)…`);
        obj = await readStepFile(await f.arrayBuffer(), fmt, opts.detail);
        obj.name = obj.name || base;
        break;
      }
    }
    root.add(obj);
  }
  if (!root.children.length) throw new Error('No supported model in the dropped files');

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.material) m.material = defaultMat();
  });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const unitScale = guessUnitScale(Math.max(size.x, size.y, size.z), format);

  let stripped = 0;
  if (opts.stripHardware) {
    onProgress?.('Removing fasteners and tiny hardware…');
    stripped = stripHardware(root, unitScale);
  }
  uniquifyNames(root);

  let tris = 0;
  let parts = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      parts++;
      const g = m.geometry as THREE.BufferGeometry;
      tris += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
    }
  });
  if (tris > 1_500_000) warnings.push(`Model has ${(tris / 1e6).toFixed(1)}M triangles. Try "coarse" STEP detail or hide parts before exporting for smooth gameplay.`);
  if (parts > 3000) warnings.push(`${parts.toLocaleString()} parts. The sim merges parts that move together when it loads the robot, but the editor may feel slow.`);

  // CAD tools (Onshape, SolidWorks STEP, most STL/3MF) are Z-up; glTF and FBX are Y-up by convention.
  const upAxis: 'y' | 'z' = format === 'glb' || format === 'gltf' || format === 'fbx' ? 'y' : 'z';
  return { model: root, format, unitScale, upAxis, triangles: Math.round(tris), parts, stripped, warnings };
}

/** Guess meters-per-unit from the largest dimension (FRC robots are ~0.5–1.3m). */
export function guessUnitScale(maxDim: number, format: CadFormat): number {
  if (format === 'step' || format === 'iges' || format === 'brep') return 1; // the worker outputs meters
  if (maxDim > 150) return 0.001; // millimeters
  if (maxDim > 8) return 0.0254; // inches
  if (maxDim > 3) return 0.01; // centimeters? unusual
  return 1;
}

/**
 * Names of off-the-shelf hardware in FRC CAD: socket/button/flat head cap screws, nuts, washers, rivets, set screws,
 * and McMaster-Carr part numbers (e.g. 91251A537, almost always fasteners).
 */
export const HARDWARE_NAME =
  /(^|[^a-z])(screws?|bolts?|nuts?|washers?|rivets?|shcs|bhcs|fhcs|shss|nylocs?|nyloc|keps|locknuts?|set[\s_-]?screws?|hex[\s_-]?nut|t[\s_-]?nuts?|pop[\s_-]?rivet)([^a-z]|$)|^\d{4,5}a\d{2,4}/i;

/**
 * Remove fasteners and tiny parts from an imported model. A robot STEP is often thousands of screws and rivets that
 * nobody sees in game but every one costs a draw call. Removes nodes named like hardware, and any mesh smaller than
 * ~8 mm across. Returns how many parts were removed.
 */
export function stripHardware(root: THREE.Object3D, unitScale: number): number {
  const remove: THREE.Object3D[] = [];
  const tmp = new THREE.Box3();
  const size = new THREE.Vector3();
  root.traverse((o) => {
    if (o === root) return;
    const m = o as THREE.Mesh;
    if (!m.isMesh && !HARDWARE_NAME.test(o.name)) return;
    tmp.setFromObject(o).getSize(size);
    const across = size.length() * unitScale;
    // A hardware-named node is only removed if it's fastener-sized (a "Bolt-on Bracket" subassembly stays); any other
    // part under ~8 mm is a washer, spacer or rivet the name didn't give away.
    if (HARDWARE_NAME.test(o.name) ? across < 0.15 : across < 0.008) remove.push(o);
  });
  let n = 0;
  for (const o of remove) {
    // Skip nodes already removed with an ancestor.
    let p: THREE.Object3D | null = o.parent;
    let attached = false;
    while (p) {
      if (p === root) {
        attached = true;
        break;
      }
      p = p.parent;
    }
    if (!attached) continue;
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) n++;
    });
    o.removeFromParent();
  }
  // Drop groups left empty.
  const empty: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && !(o as THREE.Mesh).isMesh && !hasMesh(o)) empty.push(o);
  });
  for (const o of empty) o.removeFromParent();
  return n;
}

function hasMesh(o: THREE.Object3D) {
  let found = false;
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) found = true;
  });
  return found;
}

/** Give every node a unique, stable name so definitions can refer to parts. */
export function uniquifyNames(root: THREE.Object3D) {
  const seen = new Map<string, number>();
  let i = 0;
  root.traverse((o) => {
    if (o === root) return;
    let base = (o.name || ((o as THREE.Mesh).isMesh ? 'part' : 'group')).replace(/[^\w\-#]/g, '_').slice(0, 60);
    if (!base) base = 'node';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    o.name = n === 0 ? base : `${base}_${n}`;
    i++;
  });
  return i;
}

export async function exportGlb(obj: THREE.Object3D): Promise<ArrayBuffer> {
  const res = await new GLTFExporter().parseAsync(obj, { binary: true, onlyVisible: false });
  return res as ArrayBuffer;
}
