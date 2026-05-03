import { describe, expect, it } from 'vitest';
import {
  defaultPersisted,
  loadPersisted,
  savePersisted,
  clearPersisted,
  type Persisted,
  type StorageLike,
} from '../../src/game/persistence';
import { PERSISTENCE_KEY } from '../../src/game/constants';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k]! : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

describe('persistence', () => {
  it('returns defaults for missing data', () => {
    const s = fakeStorage();
    expect(loadPersisted(s)).toEqual(defaultPersisted());
  });

  it('round-trips a valid blob', () => {
    const s = fakeStorage();
    const data: Persisted = {
      version: 1,
      stats: defaultPersisted().stats,
      lastMode: 'local-2p',
      lastDifficulty: 'hard',
      names: { p1: 'A', p2: 'B' },
      reducedMotion: true,
    };
    expect(savePersisted(data, s)).toBe(true);
    const loaded = loadPersisted(s);
    expect(loaded.lastMode).toBe('local-2p');
    expect(loaded.lastDifficulty).toBe('hard');
    expect(loaded.names.p1).toBe('A');
    expect(loaded.reducedMotion).toBe(true);
  });

  it('returns defaults for invalid JSON', () => {
    const s = fakeStorage({ [PERSISTENCE_KEY]: '{not json' });
    expect(loadPersisted(s)).toEqual(defaultPersisted());
  });

  it('returns defaults for unknown version', () => {
    const s = fakeStorage({ [PERSISTENCE_KEY]: JSON.stringify({ version: 99 }) });
    expect(loadPersisted(s)).toEqual(defaultPersisted());
  });

  it('returns defaults when getItem throws', () => {
    const s: StorageLike = {
      getItem: () => {
        throw new Error('oops');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadPersisted(s)).toEqual(defaultPersisted());
  });

  it('clearPersisted does not throw', () => {
    const s = fakeStorage({ [PERSISTENCE_KEY]: JSON.stringify(defaultPersisted()) });
    expect(() => clearPersisted(s)).not.toThrow();
    expect(loadPersisted(s)).toEqual(defaultPersisted());
  });

  it('survives missing storage', () => {
    expect(loadPersisted(null)).toEqual(defaultPersisted());
    expect(savePersisted(defaultPersisted(), null)).toBe(false);
    expect(() => clearPersisted(null)).not.toThrow();
  });

  it('truncates very long names', () => {
    const long = 'X'.repeat(1000);
    const s = fakeStorage();
    savePersisted(
      {
        version: 1,
        stats: defaultPersisted().stats,
        lastMode: 'solo',
        lastDifficulty: 'easy',
        names: { p1: long, p2: long },
        reducedMotion: null,
      },
      s,
    );
    const loaded = loadPersisted(s);
    expect(loaded.names.p1.length).toBeLessThanOrEqual(40);
  });

  it('coerces invalid mode/difficulty/names/stats to safe defaults', () => {
    const s = fakeStorage({
      [PERSISTENCE_KEY]: JSON.stringify({
        version: 1,
        stats: 'nope', // wrong type
        lastMode: 'BANANA',
        lastDifficulty: 42,
        names: 'NOT AN OBJECT',
        reducedMotion: 'NOPE',
      }),
    });
    const loaded = loadPersisted(s);
    expect(loaded.lastMode).toBe('solo');
    expect(loaded.lastDifficulty).toBe('medium');
    expect(loaded.names.p1).toBe('Player 1');
    expect(loaded.names.p2).toBe('Player 2');
    expect(loaded.reducedMotion).toBeNull();
    expect(loaded.stats.solo.games).toBe(0);
  });

  it('handles partial stats (missing byDifficulty)', () => {
    const s = fakeStorage({
      [PERSISTENCE_KEY]: JSON.stringify({
        version: 1,
        stats: { solo: { games: 5, wins: 2 }, local2p: { games: 1 } },
        lastMode: 'solo',
        lastDifficulty: 'medium',
        names: { p1: 'P', p2: 'Q' },
        reducedMotion: false,
      }),
    });
    const loaded = loadPersisted(s);
    // missing byDifficulty falls back to fallback's stats
    expect(loaded.stats.solo.games).toBe(0);
  });

  it('handles partial stats with proper byDifficulty present', () => {
    const s = fakeStorage({
      [PERSISTENCE_KEY]: JSON.stringify({
        version: 1,
        stats: {
          solo: {
            games: 4,
            wins: 3,
            losses: 1,
            byDifficulty: {
              easy: { games: 1, wins: 1, losses: 0 },
              medium: { games: 2, wins: 1, losses: 1 },
              hard: { games: 1, wins: 1, losses: 0 },
            },
          },
          local2p: { games: 2 },
        },
        lastMode: 'local-2p',
        lastDifficulty: 'easy',
        names: { p1: 'A', p2: 'B' },
        reducedMotion: false,
      }),
    });
    const loaded = loadPersisted(s);
    expect(loaded.stats.solo.games).toBe(4);
    expect(loaded.stats.solo.byDifficulty.medium.games).toBe(2);
    expect(loaded.stats.local2p.games).toBe(2);
  });

  it('savePersisted returns false when setItem throws', () => {
    const s: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    expect(savePersisted(defaultPersisted(), s)).toBe(false);
  });

  it('clearPersisted swallows errors from removeItem', () => {
    const s: StorageLike = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => {
        throw new Error('boom');
      },
    };
    expect(() => clearPersisted(s)).not.toThrow();
  });
});
