import { kvGet, kvSet } from '../cad/storage';

/** One finished match on this computer. */
export interface HighScore {
  score: number;
  robot: string;
  team: string;
  expert: boolean;
  /** ms since epoch */
  at: number;
}

const KEY = 'highscores';
const KEEP = 10;

export async function loadHighScores(): Promise<HighScore[]> {
  return (await kvGet<HighScore[]>(KEY)) ?? [];
}

/**
 * Add a match result to the local table (best 10, highest first). Returns its rank (1 = best), or null if it
 * didn't make the table.
 */
export async function recordHighScore(entry: HighScore): Promise<{ rank: number | null; table: HighScore[] }> {
  const table = [...(await loadHighScores()), entry].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, KEEP);
  await kvSet(KEY, table);
  const i = table.indexOf(entry);
  return { rank: i >= 0 ? i + 1 : null, table };
}
