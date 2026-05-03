import { describe, expect, it } from 'vitest';
import { emptyStats, recordGame } from '../../src/game/stats';

describe('stats', () => {
  it('emptyStats has zeroed counters', () => {
    const s = emptyStats();
    expect(s.solo.games).toBe(0);
    expect(s.solo.byDifficulty.medium.games).toBe(0);
    expect(s.local2p.games).toBe(0);
  });

  it('records a solo win on medium', () => {
    let s = emptyStats();
    s = recordGame(s, { mode: 'solo', difficulty: 'medium', humanPlayer: 'p1', winner: 'p1' });
    expect(s.solo.games).toBe(1);
    expect(s.solo.wins).toBe(1);
    expect(s.solo.byDifficulty.medium.games).toBe(1);
    expect(s.solo.byDifficulty.medium.wins).toBe(1);
  });

  it('records a solo loss on hard', () => {
    let s = emptyStats();
    s = recordGame(s, { mode: 'solo', difficulty: 'hard', humanPlayer: 'p1', winner: 'p2' });
    expect(s.solo.losses).toBe(1);
    expect(s.solo.byDifficulty.hard.losses).toBe(1);
  });

  it('records 2p games as count only', () => {
    let s = emptyStats();
    s = recordGame(s, { mode: 'local-2p', difficulty: 'easy', humanPlayer: 'p1', winner: 'p2' });
    expect(s.local2p.games).toBe(1);
    expect(s.solo.games).toBe(0);
  });
});
