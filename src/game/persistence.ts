import { PERSISTENCE_KEY } from './constants';
import { emptyStats, type AggregateStats } from './stats';
import type { Difficulty, Mode, PlayerId } from './types';

/**
 * v1 persisted blob. Keep this small and PRIVACY-SAFE: never store in-progress
 * game state, ship coordinates, or per-game logs.
 */
export interface Persisted {
  version: 1;
  stats: AggregateStats;
  lastMode: Mode;
  lastDifficulty: Difficulty;
  names: Record<PlayerId, string>;
  reducedMotion: boolean | null; // null = follow OS preference
}

export function defaultPersisted(): Persisted {
  return {
    version: 1,
    stats: emptyStats(),
    lastMode: 'solo',
    lastDifficulty: 'medium',
    names: { p1: 'Player 1', p2: 'Player 2' },
    reducedMotion: null,
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const g = globalThis as unknown as { localStorage?: StorageLike };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Load persisted state. NEVER throws. Corrupt or unrecognized blobs return defaults.
 */
export function loadPersisted(storage: StorageLike | null = getDefaultStorage()): Persisted {
  if (!storage) return defaultPersisted();
  let raw: string | null;
  try {
    raw = storage.getItem(PERSISTENCE_KEY);
  } catch {
    return defaultPersisted();
  }
  if (raw === null || raw === '') return defaultPersisted();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultPersisted();
  }
  return validatePersisted(parsed);
}

export function savePersisted(
  data: Persisted,
  storage: StorageLike | null = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PERSISTENCE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearPersisted(storage: StorageLike | null = getDefaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PERSISTENCE_KEY);
  } catch {
    /* ignore */
  }
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function validatePersisted(input: unknown): Persisted {
  const fallback = defaultPersisted();
  if (!isPlainObject(input)) return fallback;
  if (input['version'] !== 1) return fallback;
  const stats = validateStats(input['stats']) ?? fallback.stats;
  const lastMode: Mode =
    input['lastMode'] === 'solo' || input['lastMode'] === 'local-2p'
      ? input['lastMode']
      : fallback.lastMode;
  const lastDifficulty: Difficulty =
    input['lastDifficulty'] === 'easy' ||
    input['lastDifficulty'] === 'medium' ||
    input['lastDifficulty'] === 'hard'
      ? input['lastDifficulty']
      : fallback.lastDifficulty;
  const names = isPlainObject(input['names']) ? input['names'] : null;
  const validatedNames: Record<PlayerId, string> = {
    p1: typeof names?.['p1'] === 'string' ? (names['p1'] as string).slice(0, 40) : fallback.names.p1,
    p2: typeof names?.['p2'] === 'string' ? (names['p2'] as string).slice(0, 40) : fallback.names.p2,
  };
  const rm = input['reducedMotion'];
  const reducedMotion: boolean | null =
    rm === true || rm === false ? rm : null;
  return {
    version: 1,
    stats,
    lastMode,
    lastDifficulty,
    names: validatedNames,
    reducedMotion,
  };
}

function validateStats(input: unknown): AggregateStats | null {
  if (!isPlainObject(input)) return null;
  const solo = isPlainObject(input['solo']) ? input['solo'] : null;
  const local2p = isPlainObject(input['local2p']) ? input['local2p'] : null;
  if (!solo || !local2p) return null;
  const byDiff = isPlainObject(solo['byDifficulty']) ? solo['byDifficulty'] : null;
  if (!byDiff) return null;
  const diff = (k: Difficulty) => {
    const obj = isPlainObject(byDiff[k]) ? byDiff[k] : null;
    return {
      games: typeof obj?.['games'] === 'number' ? (obj['games'] as number) : 0,
      wins: typeof obj?.['wins'] === 'number' ? (obj['wins'] as number) : 0,
      losses: typeof obj?.['losses'] === 'number' ? (obj['losses'] as number) : 0,
    };
  };
  return {
    solo: {
      games: typeof solo['games'] === 'number' ? (solo['games'] as number) : 0,
      wins: typeof solo['wins'] === 'number' ? (solo['wins'] as number) : 0,
      losses: typeof solo['losses'] === 'number' ? (solo['losses'] as number) : 0,
      byDifficulty: {
        easy: diff('easy'),
        medium: diff('medium'),
        hard: diff('hard'),
      },
    },
    local2p: {
      games:
        typeof local2p['games'] === 'number' ? (local2p['games'] as number) : 0,
    },
  };
}
