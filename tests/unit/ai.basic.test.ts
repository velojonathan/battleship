import { describe, expect, it } from 'vitest';
import { initialState, reducer, createAIMemory } from '../../src/game/engine';
import { computeAIMove, listLegalCells } from '../../src/game/ai';
import { buildPublicView } from '../../src/game/publicView';
import { mulberry32 } from '../../src/game/rng';
import type { GameState } from '../../src/game/types';

function startedSoloGame(): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 9 });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 13 });
  return s;
}

describe('AI basic shape (Checkpoint 1 stub)', () => {
  it('returns a legal coordinate at every difficulty', () => {
    const s = startedSoloGame();
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const view = buildPublicView(s.players.p1, []);
      const out = computeAIMove({
        view,
        memory: createAIMemory(),
        difficulty,
        rng: mulberry32(1),
      });
      expect(out.target.row).toBeGreaterThanOrEqual(0);
      expect(out.target.row).toBeLessThan(view.size);
      expect(out.target.col).toBeGreaterThanOrEqual(0);
      expect(out.target.col).toBeLessThan(view.size);
    }
  });

  it('memory after move includes the new shot key', () => {
    const s = startedSoloGame();
    const view = buildPublicView(s.players.p1, []);
    const out = computeAIMove({
      view,
      memory: createAIMemory(),
      difficulty: 'easy',
      rng: mulberry32(1),
    });
    const key = `${out.target.row},${out.target.col}`;
    expect(out.memory.shotsFired).toContain(key);
  });

  it('listLegalCells excludes already-fired cells', () => {
    const s = startedSoloGame();
    const view = buildPublicView(s.players.p1, []);
    const memory = createAIMemory();
    expect(listLegalCells(view, memory).length).toBe(view.size * view.size);
    memory.shotsFired.push('0,0');
    expect(listLegalCells(view, memory).length).toBe(view.size * view.size - 1);
  });
});
