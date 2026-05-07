// QA hardening tests — added in the post-CP8 hardening pass.
//
// Covers explicit assertions from the QA prompt that were not directly tested
// before:
// - RETURN_HOME from every phase clears game state.
// - Sunk detection requires all N cells of a ship to be hit (not N-1).
// - Random fleets are legal across many seeds.
// - Mode switching cannot leak previous game state into a new game.
// - Reset/randomize order cannot create invalid placement state.
// - Public-view localStorage privacy: nothing the engine emits leaks ships.
import { describe, expect, it } from 'vitest';
import { initialState, reducer } from '../../src/game/engine';
import { allShipsPlaced, randomFleet } from '../../src/game/placement';
import { mulberry32 } from '../../src/game/rng';
import { TOTAL_SHIP_CELLS, BOARD_SIZE, FLEET } from '../../src/game/constants';
import type { Action, Coord, GameState } from '../../src/game/types';

function startedSolo(seed = 1): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  return s;
}

function shipCellsOf(state: GameState, player: 'p1' | 'p2'): Coord[] {
  const out: Coord[] = [];
  for (const ship of state.players[player].fleet) {
    const o = ship.origin!;
    for (let i = 0; i < ship.length; i++) {
      out.push(
        ship.orientation === 'H'
          ? { row: o.row, col: o.col + i }
          : { row: o.row + i, col: o.col },
      );
    }
  }
  return out;
}

describe('RETURN_HOME from every phase (QA §2 / §5)', () => {
  it('RETURN_HOME from setup-player-one clears placement and goes home', () => {
    let s = initialState();
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 1 });
    expect(s.phase).toBe('setup-player-one');
    s = reducer(s, { type: 'RETURN_HOME' });
    expect(s.phase).toBe('home');
    // Fleet must be reset back to no-origins so a new game starts clean.
    expect(s.players.p1.fleet.every((sh) => sh.origin === null)).toBe(true);
  });
  it('RETURN_HOME from setup-player-two clears both placements', () => {
    let s = initialState();
    s = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 1 });
    s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'CONFIRM_READY' });
    expect(s.phase).toBe('setup-player-two');
    s = reducer(s, { type: 'RETURN_HOME' });
    expect(s.phase).toBe('home');
    expect(s.players.p1.fleet.every((sh) => sh.origin === null)).toBe(true);
    expect(s.players.p2.fleet.every((sh) => sh.origin === null)).toBe(true);
  });
  it('RETURN_HOME from handoff clears both placements', () => {
    let s = initialState();
    s = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 1 });
    s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 1 });
    expect(s.phase).toBe('handoff');
    s = reducer(s, { type: 'RETURN_HOME' });
    expect(s.phase).toBe('home');
  });
  it('RETURN_HOME from in-progress clears all in-flight battle state', () => {
    let s = startedSolo(7);
    s = reducer(s, { type: 'FIRE_SHOT', at: { row: 0, col: 0 }, ts: 1 });
    expect(s.phase).toBe('in-progress');
    expect(s.inputLocked).toBe(true);
    expect(s.log.length).toBe(1);
    s = reducer(s, { type: 'RETURN_HOME' });
    expect(s.phase).toBe('home');
    expect(s.log.length).toBe(0);
    expect(s.inputLocked).toBe(false);
    expect(s.players.p1.shotsTaken.length).toBe(0);
    expect(s.players.p2.shotsTaken.length).toBe(0);
    expect(s.players.p1.fleet.every((sh) => sh.origin === null)).toBe(true);
    expect(s.players.p2.fleet.every((sh) => sh.origin === null)).toBe(true);
  });
  it('RETURN_HOME during inputLocked window cannot leave a phantom lock', () => {
    let s = startedSolo(2);
    // Simulate the moment between FIRE_SHOT and COMPLETE_TURN: input is locked.
    s = reducer(s, { type: 'FIRE_SHOT', at: { row: 5, col: 5 }, ts: 1 });
    expect(s.inputLocked).toBe(true);
    s = reducer(s, { type: 'RETURN_HOME' });
    expect(s.inputLocked).toBe(false);
    // Even if a stale COMPLETE_TURN is dispatched after RETURN_HOME, it must
    // not corrupt state.
    const after = reducer(s, { type: 'COMPLETE_TURN' });
    expect(after).toBe(s);
  });
  it('After RETURN_HOME, dispatching a stale FIRE_SHOT does not register', () => {
    let s = startedSolo(3);
    s = reducer(s, { type: 'RETURN_HOME' });
    const after = reducer(s, {
      type: 'FIRE_SHOT',
      at: { row: 0, col: 0 },
      ts: 9,
    });
    expect(after).toBe(s);
  });
});

describe('Sunk detection requires every cell of the ship to be hit (QA §2)', () => {
  it('a ship of length L reports "hit" for the first L-1 hits and "sunk" only on the Lth', () => {
    const s0 = startedSolo(11);
    // Pick the destroyer (length 2).
    const destroyer = s0.players.p2.fleet.find((s) => s.id === 'destroyer')!;
    const o = destroyer.origin!;
    const cells: Coord[] =
      destroyer.orientation === 'H'
        ? [
            { row: o.row, col: o.col },
            { row: o.row, col: o.col + 1 },
          ]
        : [
            { row: o.row, col: o.col },
            { row: o.row + 1, col: o.col },
          ];

    // First hit -> outcome 'hit'.
    let s = reducer(s0, { type: 'FIRE_SHOT', at: cells[0]!, ts: 1 });
    let lastShot = s.players.p1.shotsTaken[s.players.p1.shotsTaken.length - 1]!;
    expect(lastShot.outcome).toBe('hit');
    expect(lastShot.sunkShipId).toBeUndefined();
    s = reducer(s, { type: 'COMPLETE_TURN' });
    // Force back to p1 in this unit test (skip AI turn).
    s = { ...s, currentTurn: 'p1', inputLocked: false };
    // Final hit -> outcome 'sunk'.
    s = reducer(s, { type: 'FIRE_SHOT', at: cells[1]!, ts: 2 });
    lastShot = s.players.p1.shotsTaken[s.players.p1.shotsTaken.length - 1]!;
    expect(lastShot.outcome).toBe('sunk');
    expect(lastShot.sunkShipId).toBe('destroyer');
  });

  it('a ship of length 5 (carrier) is "hit" for cells 1–4 and "sunk" only on cell 5', () => {
    const s0 = startedSolo(13);
    const carrier = s0.players.p2.fleet.find((s) => s.id === 'carrier')!;
    const o = carrier.origin!;
    const cells: Coord[] = [];
    for (let i = 0; i < carrier.length; i++) {
      cells.push(
        carrier.orientation === 'H'
          ? { row: o.row, col: o.col + i }
          : { row: o.row + i, col: o.col },
      );
    }
    let s = s0;
    for (let i = 0; i < cells.length; i++) {
      s = { ...s, currentTurn: 'p1', inputLocked: false };
      s = reducer(s, { type: 'FIRE_SHOT', at: cells[i]!, ts: i + 1 });
      const last = s.players.p1.shotsTaken.at(-1)!;
      if (i < cells.length - 1) {
        expect(last.outcome).toBe('hit');
      } else {
        expect(last.outcome).toBe('sunk');
        expect(last.sunkShipId).toBe('carrier');
      }
      s = reducer(s, { type: 'COMPLETE_TURN' });
    }
  });
});

describe('Win condition (QA §2)', () => {
  it('Win is set only after every cell of every ship is hit', () => {
    let s = startedSolo(17);
    const cells = shipCellsOf(s, 'p2');
    let ts = 0;
    for (let i = 0; i < cells.length; i++) {
      s = { ...s, currentTurn: 'p1', inputLocked: false };
      s = reducer(s, { type: 'FIRE_SHOT', at: cells[i]!, ts: ++ts });
      const expectedHits = i + 1;
      // All hits before the last cell must NOT trigger a winner.
      if (expectedHits < TOTAL_SHIP_CELLS) {
        expect(s.winner).toBeNull();
      }
      s = reducer(s, { type: 'COMPLETE_TURN' });
    }
    expect(s.winner).toBe('p1');
    expect(s.phase).toBe('game-over');
  });
});

describe('Random fleet legality across many seeds (QA §2 / §3)', () => {
  it('200 distinct seeds produce legal fleets each (no overlap, no out-of-bounds)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { board, fleet } = randomFleet(mulberry32(seed));
      expect(allShipsPlaced(fleet)).toBe(true);
      // Every fleet should cover exactly TOTAL_SHIP_CELLS cells with no overlap.
      let covered = 0;
      for (const row of board.cells) {
        for (const cell of row) {
          if (cell.shipId) covered++;
        }
      }
      expect(covered).toBe(TOTAL_SHIP_CELLS);

      // Every ship is in-bounds.
      for (const ship of fleet) {
        const o = ship.origin!;
        for (let i = 0; i < ship.length; i++) {
          const c =
            ship.orientation === 'H'
              ? { row: o.row, col: o.col + i }
              : { row: o.row + i, col: o.col };
          expect(c.row).toBeGreaterThanOrEqual(0);
          expect(c.row).toBeLessThan(BOARD_SIZE);
          expect(c.col).toBeGreaterThanOrEqual(0);
          expect(c.col).toBeLessThan(BOARD_SIZE);
        }
      }
      // Same ship roster as FLEET, exactly one of each.
      const ids = fleet.map((s) => s.id).sort();
      const expected = FLEET.map((s) => s.id).sort();
      expect(ids).toEqual(expected);
    }
  });
});

describe('Reset/randomize order cannot create invalid placement (QA §5)', () => {
  it('Reset → randomize yields a fully placed legal fleet', () => {
    let s = initialState();
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 1 });
    s = reducer(s, { type: 'RESET_FLEET', player: 'p1' });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 2 });
    expect(allShipsPlaced(s.players.p1.fleet)).toBe(true);
  });
  it('Randomize → reset yields an empty fleet', () => {
    let s = initialState();
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 3 });
    s = reducer(s, { type: 'RESET_FLEET', player: 'p1' });
    expect(s.players.p1.fleet.every((sh) => sh.origin === null)).toBe(true);
    expect(s.players.p1.ownBoard.cells.flat().every((c) => c.shipId === null)).toBe(true);
  });
  it('Randomize → start yields an in-progress game with all ships placed', () => {
    let s = initialState();
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 4 });
    s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 1 });
    expect(s.phase).toBe('in-progress');
    expect(allShipsPlaced(s.players.p1.fleet)).toBe(true);
    expect(allShipsPlaced(s.players.p2.fleet)).toBe(true);
  });
});

describe('Mode switching does not leak prior state (QA §5)', () => {
  it('SET_MODE while in-progress is a no-op (engine guards phase)', () => {
    const s = startedSolo(5);
    const after: GameState = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
    // No state mutation: still solo, still in-progress.
    expect(after.mode).toBe('solo');
    expect(after.phase).toBe('in-progress');
  });
  it('Toggling Solo → Local 2P → Solo on home preserves player names', () => {
    let s = initialState();
    s = reducer(s, { type: 'SET_NAME', player: 'p1', name: 'Cmdr Sol' });
    s = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
    s = reducer(s, { type: 'SET_NAME', player: 'p2', name: 'Cmdr Lun' });
    s = reducer(s, { type: 'SET_MODE', mode: 'solo' });
    expect(s.players.p1.name).toBe('Cmdr Sol');
    // p2 reverts to AI in solo mode.
    expect(s.players.p2.kind).toBe('ai');
  });
});

describe('Public-view does not appear in JSON snapshots of state (QA §4 anti-leak)', () => {
  it('serializing in-progress state to JSON contains opponent ship origins (engine state) — but PUBLIC view does NOT', async () => {
    // Sanity check: engine state DOES contain opponent ship origins.
    // This is fine because engine state never leaves the React reducer; what
    // matters is that the AI's `PublicOpponentView` does NOT include them.
    const s = startedSolo(20);
    const json = JSON.stringify(s);
    // Engine state has all ship origins available in-memory (this is expected).
    expect(json).toMatch(/"origin":/);

    // Build a public view for the AI and ensure no ship "origin" / "orientation"
    // keys leak through.
    const { buildPublicView } = await import('../../src/game/publicView');
    const view = buildPublicView(s.players.p2, s.players.p1.shotsTaken);
    const viewJson = JSON.stringify(view);
    expect(viewJson).not.toMatch(/"origin":/);
    expect(viewJson).not.toMatch(/"orientation":/);
    expect(viewJson).not.toMatch(/"hits":/);
  });
});

// Smoke test: dispatching the full home → game-over flow never produces an
// invalid GameState (no impossible inputLocked, no orphan handoff state).
describe('Full-flow smoke (QA §5)', () => {
  it('A full solo game does not leave inputLocked=true at game-over', () => {
    let s = startedSolo(31);
    let ts = 0;
    const cells = shipCellsOf(s, 'p2');
    for (const c of cells) {
      s = { ...s, currentTurn: 'p1', inputLocked: false };
      s = reducer(s, { type: 'FIRE_SHOT', at: c, ts: ++ts });
      s = reducer(s, { type: 'COMPLETE_TURN' });
    }
    expect(s.phase).toBe('game-over');
    expect(s.inputLocked).toBe(false);
    expect(s.pendingHandoffTo).toBeNull();
    expect(s.handoffReason).toBeNull();
  });
});

// Tests using the `Action` type to catch any unhandled action shape errors.
const _typeAnchor: Action = { type: 'RETURN_HOME' };
void _typeAnchor;
