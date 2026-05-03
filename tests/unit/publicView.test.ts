import { describe, expect, it } from 'vitest';
import { initialState, reducer } from '../../src/game/engine';
import { buildPublicView, deepFreeze } from '../../src/game/publicView';
import type { Coord, GameState, ShotResult } from '../../src/game/types';

function startedSoloGame(): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 9 });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 13 });
  return s;
}

describe('buildPublicView', () => {
  it('does NOT expose hidden ship cells', () => {
    const s = startedSoloGame();
    const view = buildPublicView(s.players.p2, []);
    // Sunk ships are empty; remaining ship lengths are full standard fleet.
    expect(view.sunkShips).toEqual([]);
    expect([...view.remainingShipLengths].sort()).toEqual([2, 3, 3, 4, 5]);
    // Crucially, the view object has no `ownBoard` or fleet origins.
    const json = JSON.stringify(view);
    expect(json).not.toContain('"shipId"');
    expect(json).not.toContain('"origin"');
    expect(json).not.toContain('"orientation"');
  });

  it('reveals cells of sunk ships only', () => {
    let s = startedSoloGame();
    // Sink the destroyer (length 2). To keep p1 firing at p2 throughout, we
    // override currentTurn between shots (otherwise COMPLETE_TURN flips to p2).
    const destroyer = s.players.p2.fleet.find((sh) => sh.id === 'destroyer')!;
    const o = destroyer.origin!;
    const cells: Coord[] = [];
    for (let i = 0; i < destroyer.length; i++) {
      cells.push(
        destroyer.orientation === 'H'
          ? { row: o.row, col: o.col + i }
          : { row: o.row + i, col: o.col },
      );
    }
    let ts = 0;
    for (const c of cells) {
      s = { ...s, currentTurn: 'p1', inputLocked: false };
      s = reducer(s, { type: 'FIRE_SHOT', at: c, ts: ++ts });
      s = reducer(s, { type: 'COMPLETE_TURN' });
    }
    const view = buildPublicView(s.players.p2, s.players.p1.shotsTaken);
    expect(view.sunkShips).toHaveLength(1);
    expect(view.sunkShips[0]?.id).toBe('destroyer');
    expect([...view.remainingShipLengths].sort()).toEqual([3, 3, 4, 5]);
  });

  it('produced view is recursively frozen (cannot be mutated)', () => {
    const s = startedSoloGame();
    const view = buildPublicView(s.players.p2, []);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.shots)).toBe(true);
    expect(Object.isFrozen(view.sunkShips)).toBe(true);
    expect(Object.isFrozen(view.remainingShipLengths)).toBe(true);
  });
});

describe('deepFreeze', () => {
  it('freezes nested objects and arrays', () => {
    const o = { a: { b: { c: 1, arr: [1, 2, 3] } } };
    deepFreeze(o);
    expect(Object.isFrozen(o)).toBe(true);
    expect(Object.isFrozen(o.a)).toBe(true);
    expect(Object.isFrozen(o.a.b)).toBe(true);
    expect(Object.isFrozen(o.a.b.arr)).toBe(true);
  });
});

// Sanity: a ShotResult passes through cleanly.
describe('public view shots', () => {
  it('mirrors firing player shots without mutation', () => {
    const s = startedSoloGame();
    const fakeShots: ShotResult[] = [
      { by: 'p1', at: { row: 0, col: 0 }, outcome: 'miss' },
    ];
    const view = buildPublicView(s.players.p2, fakeShots);
    expect(view.shots).toHaveLength(1);
    expect(view.shots[0]?.outcome).toBe('miss');
  });
});
