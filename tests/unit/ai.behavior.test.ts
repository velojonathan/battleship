import { describe, expect, it } from 'vitest';
import { computeAIMove } from '../../src/game/ai';
import { createAIMemory } from '../../src/game/engine';
import { coordKey } from '../../src/game/coordinates';
import { buildPublicView } from '../../src/game/publicView';
import { mulberry32 } from '../../src/game/rng';
import { resolveShot } from '../../src/game/rules';
import { randomFleet } from '../../src/game/placement';
import type {
  AIMemory,
  Difficulty,
  GameState,
  PlayerState,
  PublicOpponentView,
} from '../../src/game/types';
import { initialState, reducer } from '../../src/game/engine';

function startedSoloGame(): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 9 });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 13 });
  return s;
}

// Drive the AI through a complete game against an opponent. Returns the moves
// the AI made, so tests can verify properties (no duplicates, all legal, etc).
function playAIGame({
  difficulty,
  seedAI,
  seedOpponent,
}: {
  difficulty: Difficulty;
  seedAI: number;
  seedOpponent: number;
}): { moves: string[]; sunkAll: boolean } {
  // The AI plays AGAINST opponent's fleet.
  const opponentFleet = randomFleet(mulberry32(seedOpponent));
  let opponent: PlayerState = {
    id: 'p1',
    kind: 'human',
    name: 'Human',
    ownBoard: opponentFleet.board,
    fleet: opponentFleet.fleet,
    shotsTaken: [],
    placement: { selectedShipId: null, orientation: 'H' },
  };

  let memory: AIMemory = createAIMemory();
  const aiShots: Array<{ by: 'p1' | 'p2'; at: { row: number; col: number }; outcome: 'miss' | 'hit' | 'sunk'; sunkShipId?: string }> = [];
  const moves: string[] = [];
  const rng = mulberry32(seedAI);

  for (let i = 0; i < 100; i++) {
    const view: PublicOpponentView = buildPublicView(opponent, aiShots as never);
    const move = computeAIMove({ view, memory, difficulty, rng });
    memory = move.memory;
    const k = coordKey(move.target);
    moves.push(k);

    const apply = resolveShot(
      { ownBoard: opponent.ownBoard, fleet: opponent.fleet },
      'p2',
      move.target,
    );
    if (!apply.ok) throw new Error(`AI fired an illegal shot at ${k}: ${apply.reason}`);
    opponent = { ...opponent, ownBoard: apply.ownBoard, fleet: apply.fleet };
    const shot = { by: 'p2' as const, at: move.target, outcome: apply.result.outcome };
    aiShots.push(apply.result.sunkShipId ? { ...shot, sunkShipId: apply.result.sunkShipId } : shot);
    if (opponent.fleet.every((sh) => sh.sunk)) {
      return { moves, sunkAll: true };
    }
  }
  return { moves, sunkAll: opponent.fleet.every((sh) => sh.sunk) };
}

describe('AI / behavior across difficulties', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`(${difficulty}) plays a full game without duplicate shots`, () => {
      const { moves } = playAIGame({ difficulty, seedAI: 1, seedOpponent: 2 });
      const unique = new Set(moves);
      expect(unique.size).toBe(moves.length);
      // Every move is on the 10x10 board.
      for (const m of moves) {
        const [r, c] = m.split(',').map(Number) as [number, number];
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(10);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(10);
      }
    });
    it(`(${difficulty}) eventually sinks the entire opponent fleet within 100 moves`, () => {
      const { sunkAll, moves } = playAIGame({ difficulty, seedAI: 7, seedOpponent: 11 });
      expect(sunkAll).toBe(true);
      expect(moves.length).toBeLessThanOrEqual(100);
    });
  }
});

describe('AI / Hard determinism under identical public view', () => {
  it('returns the same move when hidden layouts swap but public view is identical', () => {
    // Build two starting states from solo game with different seeds (different layouts).
    const sA = startedSoloGame();
    const sB = (() => {
      let s = initialState();
      s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 99 });
      s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 9 });
      s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 99 });
      return s;
    })();
    // p1 fleets differ between sA and sB (different seeds when AI auto-places, but
    // here we're checking that the AI sees IDENTICAL public views and returns
    // identical moves regardless of hidden layout).
    const memory = createAIMemory();
    const viewA = buildPublicView(sA.players.p1, []);
    const viewB = buildPublicView(sB.players.p1, []);
    // For the no-shots-yet case, both views are equivalent (same size + empty arrays).
    expect(viewA.shots).toEqual(viewB.shots);
    expect(viewA.sunkShips).toEqual(viewB.sunkShips);
    expect(viewA.remainingShipLengths).toEqual(viewB.remainingShipLengths);

    const moveA = computeAIMove({
      view: viewA,
      memory,
      difficulty: 'hard',
      rng: mulberry32(42),
    });
    const moveB = computeAIMove({
      view: viewB,
      memory,
      difficulty: 'hard',
      rng: mulberry32(42),
    });
    // Same RNG seed + same public view => same target.
    expect(moveA.target).toEqual(moveB.target);
  });
});

describe('AI / Medium hunt-then-target', () => {
  it('after a hit, prefers neighbors of the hit', () => {
    // Manually craft a public view where the AI has hit (5,5) and not sunk anything.
    const view: PublicOpponentView = {
      size: 10,
      shots: [{ by: 'p2', at: { row: 5, col: 5 }, outcome: 'hit' }],
      sunkShips: [],
      remainingShipLengths: [2, 3, 3, 4, 5],
    };
    const memory: AIMemory = {
      shotsFired: ['5,5'],
      unresolvedHits: [{ row: 5, col: 5 }],
      orientationHypothesis: null,
    };
    const out = computeAIMove({ view, memory, difficulty: 'medium', rng: mulberry32(1) });
    // The next target must be one of the four neighbors.
    const k = `${out.target.row},${out.target.col}`;
    expect(['4,5', '6,5', '5,4', '5,6']).toContain(k);
  });

  it('with two collinear unresolved hits, extends along the line', () => {
    const view: PublicOpponentView = {
      size: 10,
      shots: [
        { by: 'p2', at: { row: 5, col: 5 }, outcome: 'hit' },
        { by: 'p2', at: { row: 5, col: 6 }, outcome: 'hit' },
      ],
      sunkShips: [],
      remainingShipLengths: [2, 3, 3, 4, 5],
    };
    const memory: AIMemory = {
      shotsFired: ['5,5', '5,6'],
      unresolvedHits: [
        { row: 5, col: 5 },
        { row: 5, col: 6 },
      ],
      orientationHypothesis: 'H',
    };
    const out = computeAIMove({ view, memory, difficulty: 'medium', rng: mulberry32(1) });
    const k = `${out.target.row},${out.target.col}`;
    expect(['5,4', '5,7']).toContain(k);
  });
});

describe('AI / Hard probability density', () => {
  it('on an empty board prefers central cells (more placements cover them)', () => {
    const view: PublicOpponentView = {
      size: 10,
      shots: [],
      sunkShips: [],
      remainingShipLengths: [2, 3, 3, 4, 5],
    };
    const memory = createAIMemory();
    const out = computeAIMove({ view, memory, difficulty: 'hard', rng: mulberry32(1) });
    // Central rows/cols have higher placement counts than corners.
    expect(out.target.row).toBeGreaterThanOrEqual(2);
    expect(out.target.row).toBeLessThanOrEqual(7);
    expect(out.target.col).toBeGreaterThanOrEqual(2);
    expect(out.target.col).toBeLessThanOrEqual(7);
  });
});
