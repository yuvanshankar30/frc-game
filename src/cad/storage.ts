import { openDB, type IDBPDatabase } from 'idb';
import type { RobotDefinition } from '../robot/schema';
import { parseRobot } from '../robot/schema';

/** A custom robot saved in the browser: definition + a single GLB model. */
export interface StoredRobot {
  id: string;
  def: RobotDefinition;
  glb: ArrayBuffer;
  updated: number;
}

let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  dbp ??= openDB('frc-game', 1, {
    upgrade(d) {
      d.createObjectStore('robots', { keyPath: 'id' });
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

export async function listCustomRobots(): Promise<StoredRobot[]> {
  const all = (await (await db()).getAll('robots')) as StoredRobot[];
  return all
    .map((r) => {
      try {
        return { ...r, def: parseRobot(r.def) };
      } catch {
        return null;
      }
    })
    .filter((r): r is StoredRobot => !!r)
    .sort((a, b) => b.updated - a.updated);
}

export async function getCustomRobot(id: string): Promise<StoredRobot | undefined> {
  const r = (await (await db()).get('robots', id)) as StoredRobot | undefined;
  if (!r) return undefined;
  return { ...r, def: parseRobot(r.def) };
}

export async function saveCustomRobot(def: RobotDefinition, glb: ArrayBuffer) {
  const rec: StoredRobot = { id: def.id, def, glb, updated: Date.now() };
  await (await db()).put('robots', rec);
  return rec;
}

export async function deleteCustomRobot(id: string) {
  await (await db()).delete('robots', id);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    return (await (await db()).get('kv', key)) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown) {
  try {
    await (await db()).put('kv', value, key);
  } catch (e) {
    console.warn('Could not save setting', key, e);
  }
}
