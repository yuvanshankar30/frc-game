import type * as THREE from 'three';
import { parseRobot, type RobotDefinition, type RobotDefinitionInput } from '../robot/schema';
import type { BuiltinRobot } from './builtin/common';
import { r4414 } from './builtin/r4414';
import { r971 } from './builtin/r971';
import { r2910 } from './builtin/r2910';
import { r1690 } from './builtin/r1690';
import { r254 } from './builtin/r254';
import { r1678 } from './builtin/r1678';
import { listCustomRobots, getCustomRobot } from '../cad/storage';
import { loadGlb } from '../cad/loaders';

export const BUILTINS: BuiltinRobot[] = [r4414, r971, r2910, r1690, r254, r1678];

export interface RobotEntry {
  id: string;
  builtin: boolean;
  /** Definition metadata for menus (joints/parts may be empty for built-ins until built). */
  def: RobotDefinition;
}

export async function listRobots(): Promise<RobotEntry[]> {
  const out: RobotEntry[] = BUILTINS.map((b) => ({ id: b.def.id, builtin: true, def: parseRobot(b.def) }));
  try {
    for (const c of await listCustomRobots()) out.push({ id: c.def.id, builtin: false, def: c.def });
  } catch (e) {
    console.warn('Custom robots unavailable', e);
  }
  return out;
}

export interface LoadedRobot {
  def: RobotDefinition;
  model: THREE.Object3D;
}

/** Real-CAD overrides for built-ins: public/cad/<id>.frcbot (rigged in the Robot Editor), checked once. */
const cadOverride = new Map<string, Promise<{ def: RobotDefinition; glb: ArrayBuffer } | null>>();
function builtinCad(id: string) {
  let p = cadOverride.get(id);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}cad/${id}.frcbot`);
        if (!r.ok || !(r.headers.get('content-type') ?? '').match(/zip|octet|frcbot/)) return null;
        const { unpackFrcbot } = await import('../cad/frcbot');
        return await unpackFrcbot(await r.arrayBuffer());
      } catch {
        return null;
      }
    })();
    cadOverride.set(id, p);
  }
  return p;
}

/** Build/load the model and the full definition for a robot id. */
export async function loadRobot(id: string): Promise<LoadedRobot> {
  const b = BUILTINS.find((x) => x.def.id === id);
  if (b) {
    const cad = typeof window !== 'undefined' ? await builtinCad(id) : null;
    if (cad) return { def: { ...cad.def, id }, model: await loadGlb(cad.glb) };
    return buildBuiltin(b);
  }
  const c = await getCustomRobot(id);
  if (!c) throw new Error(`Robot ${id} not found`);
  const model = await loadGlb(c.glb);
  return { def: c.def, model };
}

export function buildBuiltin(b: BuiltinRobot): LoadedRobot {
  const built = b.build();
  const input: RobotDefinitionInput = { ...b.def, ...(built.patch ?? {}), joints: built.joints, parts: built.parts };
  return { def: parseRobot(input), model: built.model };
}
