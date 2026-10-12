import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { readStepFile } from './step';

export type CadFormat = 'glb' | 'gltf' | 'stl' | 'obj' | 'step' | 'iges' | 'brep';

export function detectFormat(name: string): CadFormat | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'glb') return 'glb';
  if (ext === 'gltf') return 'gltf';
  if (ext === 'stl') return 'stl';
  if (ext === 'obj') return 'obj';
  if (ext === 'step' || ext === 'stp') return 'step';
  if (ext === 'iges' || ext === 'igs') return 'iges';
  if (ext === 'brep' || ext === 'brp') return 'brep';
  return null;
}

export interface ImportResult {
  model: THREE.Object3D;
  format: CadFormat;
  /** Guessed meters-per-unit for the raw model. */
  unitScale: number;
  /** Guessed up axis of the raw model. */
  upAxis: 'y' | 'z';
  triangles: number;
  warnings: string[];
}

const defaultMat = () => new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.4, roughness: 0.5 });

export async function loadGlb(buf: ArrayBuffer): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  return gltf.scene;
}

/** Import one or more CAD files into a single model with uniquely named parts. */
export async function importCad(files: File[], onProgress?: (msg: string) => void): Promise<ImportResult> {
  const root = new THREE.Group();
  root.name = 'imported';
  const warnings: string[] = [];
  let format: CadFormat = 'glb';
  for (const f of files) {
    const fmt = detectFormat(f.name);
    if (!fmt) {
      warnings.push(`Skipped ${f.name}: unsupported format`);
      continue;
    }
    format = fmt;
    onProgress?.(`Reading ${f.name}…`);
    const buf = await f.arrayBuffer();
    const base = f.name.replace(/\.[^.]+$/, '');
    let obj: THREE.Object3D;
    switch (fmt) {
      case 'glb':
      case 'gltf': {
        if (fmt === 'gltf' && files.length === 1 && new TextDecoder().decode(buf.slice(0, 2000)).includes('"uri"') && !new TextDecoder().decode(buf).includes('data:')) {
          warnings.push('This .gltf references external files; export a single binary .glb instead if parts are missing.');
        }
        const gltf = await new GLTFLoader().parseAsync(buf, '');
        obj = gltf.scene;
        break;
      }
      case 'stl': {
        const geo = new STLLoader().parse(buf);
        geo.computeVertexNormals();
        const hasColors = !!geo.getAttribute('color');
        obj = new THREE.Mesh(geo, hasColors ? new THREE.MeshStandardMaterial({ vertexColors: true }) : defaultMat());
        obj.name = base;
        break;
      }
      case 'obj': {
        obj = new OBJLoader().parse(new TextDecoder().decode(buf));
        obj.name = base;
        break;
      }
      case 'step':
      case 'iges':
      case 'brep': {
        onProgress?.(`Tessellating ${f.name} with OpenCascade (this can take a while)…`);
        obj = await readStepFile(buf, fmt);
        obj.name = obj.name || base;
        break;
      }
    }
    root.add(obj);
  }
  uniquifyNames(root);
  let tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const g = m.geometry as THREE.BufferGeometry;
      tris += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
      if (!m.material) m.material = defaultMat();
    }
  });
  if (tris > 1_500_000) warnings.push(`Model has ${(tris / 1e6).toFixed(1)}M triangles — consider simplifying it (hide fasteners, export at lower quality) for smooth gameplay.`);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const unitScale = guessUnitScale(maxDim, format);
  // CAD tools (Onshape, SolidWorks STEP, most STL) are Z-up; glTF is Y-up by spec.
  const upAxis: 'y' | 'z' = format === 'glb' || format === 'gltf' ? 'y' : 'z';
  return { model: root, format, unitScale, upAxis, triangles: Math.round(tris), warnings };
}

/** Guess meters-per-unit from the largest dimension (FRC robots are ~0.5–1.3m). */
export function guessUnitScale(maxDim: number, format: CadFormat): number {
  if (format === 'step' || format === 'iges') return 1; // worker outputs meters
  if (maxDim > 150) return 0.001; // millimeters
  if (maxDim > 8) return 0.0254; // inches
  if (maxDim > 3) return 0.01; // centimeters? unusual
  return 1;
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
