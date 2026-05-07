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
  Coord,
  Difficulty,
  PlayerState,
  PublicOpponentView,
  ShotResult,
} from '../../src/game/types';

/**
 * Drive the AI for `numShots` moves against a real opponent fleet.
 * Returns the public shot history that this game produced (which is exactly
 * the input the AI saw, plus the public view fields that depend on it).
 *
 * If different opponent layouts produce DIFFERENT public outcomes (e.g. a hit
 * vs a miss at the same cell because the hidden ship is somewhere else), then
 * the test using this helper will validly diverge — that's not cheating,
 * that's reality. We only run identical-public-view tests by sticking with a
 * single layout and re-running with replicated shot histories.
 */
function runAI({
  difficulty,
  seedAI,
  opponentFleet,
  numShots,
}: {
  difficulty: Difficulty;
  seedAI: number;
  opponentFleet: { board: PlayerState['ownBoard']; fleet: PlayerState['fleet'] };
  numShots: number;
}): { shots: ShotResult[]; targets: Coord[] } {
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
  const shots: ShotResult[] = [];
  const targets: Coord[] = [];
  const rng = mulberry32(seedAI);

  for (let i = 0; i < numShots; i++) {
    const view: PublicOpponentView = buildPublicView(opponent, shots);
    const move = computeAIMove({ view, memory, difficulty, rng });
    memory = move.memory;
    targets.push(move.target);
    const apply = resolveShot(
      { ownBoard: opponent.ownBoard, fleet: opponent.fleet },
      'p2',
      move.target,
    );
    if (!apply.ok) throw new Error(`illegal shot: ${apply.reason}`);
    opponent = { ...opponent, ownBoard: apply.ownBoard, fleet: apply.fleet };
    const next: ShotResult = {
      by: 'p2',
      at: move.target,
      outcome: apply.result.outcome,
    };
    if (apply.result.sunkShipId) next.sunkShipId = apply.result.sunkShipId;
    shots.push(next);
    if (opponent.fleet.every((sh) => sh.sunk)) break;
  }
  return { shots, targets };
}

describe('AI / anti-cheat — Hard difficulty', () => {
  it('depends only on PublicOpponentView: identical view + identical RNG yield identical move', () => {
    // Two different hidden layouts.
    const layoutA = randomFleet(mulberry32(11));
    const layoutB = randomFleet(mulberry32(22));

    // Construct an identical PRE-RECORDED public shot history for both
    // (a series of misses that don't actually correspond to either fleet's
    // hidden cells — but the AI can't know that). The view is what matters.
    const fakeShots: ShotResult[] = [
      { by: 'p2', at: { row: 0, col: 0 }, outcome: 'miss' },
      { by: 'p2', at: { row: 9, col: 9 }, outcome: 'miss' },
      { by: 'p2', at: { row: 5, col: 5 }, outcome: 'miss' },
    ];

    // Build a "fake" opponent state that has NO sunk ships (so sunkShips
    // section of view is empty regardless of layout).
    const oppA: PlayerState = {
      id: 'p1', kind: 'human', name: 'A',
      ownBoard: layoutA.board, fleet: layoutA.fleet,
      shotsTaken: [], placement: { selectedShipId: null, orientation: 'H' },
    };
    const oppB: PlayerState = {
      id: 'p1', kind: 'human', name: 'B',
      ownBoard: layoutB.board, fleet: layoutB.fleet,
      shotsTaken: [], placement: { selectedShipId: null, orientation: 'H' },
    };
    const viewA = buildPublicView(oppA, fakeShots);
    const viewB = buildPublicView(oppB, fakeShots);

    // Public views must be byte-equivalent.
    expect(JSON.stringify(viewA)).toBe(JSON.stringify(viewB));

    const memory: AIMemory = {
      shotsFired: fakeShots.map((s) => coordKey(s.at)),
      unresolvedHits: [],
      orientationHypothesis: null,
    };
    const moveA = computeAIMove({ view: viewA, memory, difficulty: 'hard', rng: mulberry32(99) });
    const moveB = computeAIMove({ view: viewB, memory, difficulty: 'hard', rng: mulberry32(99) });
    expect(moveA.target).toEqual(moveB.target);
  });

  it('ignores PlayerState fields not in the public view (membership / hidden cells)', () => {
    // Manually craft two views with same shots/sunk/lengths but different
    // hypothetical hidden layouts (we can't pass those in — the API surface
    // physically prevents it). This test asserts that the function signature
    // forces public-only inputs by verifying that two builds from different
    // layouts produce equal views.
    const layoutA = randomFleet(mulberry32(101));
    const layoutB = randomFleet(mulberry32(202));
    const oppA: PlayerState = {
      id: 'p1', kind: 'human', name: 'A',
      ownBoard: layoutA.board, fleet: layoutA.fleet,
      shotsTaken: [], placement: { selectedShipId: null, orientation: 'H' },
    };
    const oppB: PlayerState = {
      id: 'p1', kind: 'human', name: 'B',
      ownBoard: layoutB.board, fleet: layoutB.fleet,
      shotsTaken: [], placement: { selectedShipId: null, orientation: 'H' },
    };
    const v1 = buildPublicView(oppA, []);
    const v2 = buildPublicView(oppB, []);
    expect(v1).toEqual(v2);
  });
});

describe('AI / Hard finishes within sane bound for many seeds', () => {
  // The shape of standard Battleship is that with optimal probability-density
  // play, a 10x10 standard fleet typically falls in well under 60 moves on
  // average. We assert that across 10 distinct seeds the AI finishes within
  // 100 moves on each. This is a smoke test against regressions, not a
  // strength claim.
  for (let seed = 1; seed <= 10; seed++) {
    it(`(seed=${seed}) Hard finishes within 100 moves`, () => {
      const opp = randomFleet(mulberry32(seed * 31));
      const { shots } = runAI({
        difficulty: 'hard',
        seedAI: seed,
        opponentFleet: opp,
        numShots: 100,
      });
      const finished = shots.length < 100 || shots.filter((s) => s.outcome === 'sunk').length === 5;
      expect(finished).toBe(true);
    });
  }
});

describe('AI / never repeats a shot (full game, all difficulties)', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`(${difficulty}) never repeats over a full game`, () => {
      const opp = randomFleet(mulberry32(7));
      const { targets } = runAI({
        difficulty,
        seedAI: 13,
        opponentFleet: opp,
        numShots: 100,
      });
      const seen = new Set<string>();
      for (const t of targets) {
        const k = coordKey(t);
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    });
  }
});
