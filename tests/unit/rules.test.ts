import { describe, expect, it } from 'vitest';
import { TOTAL_SHIP_CELLS } from '../../src/game/constants';
import {
  emptyBoard,
  emptyFleet,
  placeShipOnBoard,
  setShipPlacement,
} from '../../src/game/placement';
import {
  alreadyShotAt,
  isFleetDefeated,
  isWin,
  resolveShot,
  shotsRemainingForPlayer,
} from '../../src/game/rules';
import type { PlayerState, Ship } from '../../src/game/types';

function fleetWithCarrier(): { board: ReturnType<typeof emptyBoard>; fleet: Ship[] } {
  const placed = placeShipOnBoard(emptyBoard(), 'carrier', { row: 0, col: 0 }, 'H');
  if (!placed.check.ok) throw new Error('test setup failed');
  const fleet = setShipPlacement(emptyFleet(), 'carrier', { row: 0, col: 0 }, 'H');
  return { board: placed.board, fleet };
}

describe('resolveShot', () => {
  it('returns miss when targeting an empty cell', () => {
    const { board, fleet } = fleetWithCarrier();
    const r = resolveShot({ ownBoard: board, fleet }, 'p1', { row: 5, col: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.outcome).toBe('miss');
      expect(r.ownBoard.cells[5]?.[5]?.miss).toBe(true);
    }
  });

  it('returns hit when targeting a ship cell', () => {
    const { board, fleet } = fleetWithCarrier();
    const r = resolveShot({ ownBoard: board, fleet }, 'p1', { row: 0, col: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.outcome).toBe('hit');
      expect(r.ownBoard.cells[0]?.[0]?.hit).toBe(true);
    }
  });

  it('returns sunk and updates the ship when last cell is hit', () => {
    let { board, fleet } = fleetWithCarrier();
    for (let i = 0; i < 4; i++) {
      const r = resolveShot({ ownBoard: board, fleet }, 'p1', { row: 0, col: i });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error('shot rejected');
      board = r.ownBoard;
      fleet = r.fleet;
      expect(r.result.outcome).toBe('hit');
    }
    const final = resolveShot({ ownBoard: board, fleet }, 'p1', { row: 0, col: 4 });
    expect(final.ok).toBe(true);
    if (final.ok) {
      expect(final.result.outcome).toBe('sunk');
      expect(final.result.sunkShipId).toBe('carrier');
      expect(final.fleet.find((s) => s.id === 'carrier')?.sunk).toBe(true);
    }
  });

  it('rejects duplicate shots', () => {
    let { board, fleet } = fleetWithCarrier();
    const first = resolveShot({ ownBoard: board, fleet }, 'p1', { row: 5, col: 5 });
    if (!first.ok) throw new Error('first should ok');
    board = first.ownBoard;
    fleet = first.fleet;
    const second = resolveShot({ ownBoard: board, fleet }, 'p1', { row: 5, col: 5 });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('duplicate');
  });

  it('rejects out-of-bounds shots', () => {
    const { board, fleet } = fleetWithCarrier();
    const r = resolveShot({ ownBoard: board, fleet }, 'p1', { row: -1, col: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('out-of-bounds');
  });
});

describe('isFleetDefeated', () => {
  it('is false for an undamaged fleet', () => {
    const { fleet } = fleetWithCarrier();
    expect(isFleetDefeated(fleet)).toBe(false);
  });
  it('is true after every cell of every placed ship is hit', () => {
    // Build a full fleet, hit every ship cell, then assert.
    let board = emptyBoard();
    let fleet = emptyFleet();
    let row = 0;
    for (const ship of fleet) {
      const placed = placeShipOnBoard(board, ship.id, { row, col: 0 }, 'H');
      if (!placed.check.ok) throw new Error('setup failed');
      board = placed.board;
      fleet = setShipPlacement(fleet, ship.id, { row, col: 0 }, 'H');
      row++;
    }
    let totalHits = 0;
    for (const ship of fleet) {
      for (let c = 0; c < ship.length; c++) {
        const r = resolveShot(
          { ownBoard: board, fleet },
          'p1',
          { row: ship.origin!.row, col: c },
        );
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('shot rejected during win-condition setup');
        board = r.ownBoard;
        fleet = r.fleet;
        totalHits++;
      }
    }
    expect(totalHits).toBe(TOTAL_SHIP_CELLS);
    expect(isFleetDefeated(fleet)).toBe(true);
  });
  it('isFleetDefeated is false for an empty fleet', () => {
    expect(isFleetDefeated([])).toBe(false);
  });
});

describe('helpers', () => {
  it('alreadyShotAt detects prior shot', () => {
    expect(alreadyShotAt([], { row: 0, col: 0 })).toBe(false);
    expect(
      alreadyShotAt([{ by: 'p1', at: { row: 0, col: 0 }, outcome: 'miss' }], { row: 0, col: 0 }),
    ).toBe(true);
  });

  it('shotsRemainingForPlayer counts un-hit ship cells', () => {
    const player: PlayerState = {
      id: 'p1',
      kind: 'human',
      name: 'P1',
      ownBoard: emptyBoard(),
      shotsTaken: [],
      fleet: emptyFleet(),
      placement: { selectedShipId: null, orientation: 'H' },
    };
    expect(shotsRemainingForPlayer(player)).toBe(TOTAL_SHIP_CELLS);
  });

  it('isWin reflects fleet defeat', () => {
    const player: PlayerState = {
      id: 'p1',
      kind: 'human',
      name: 'P1',
      ownBoard: emptyBoard(),
      shotsTaken: [],
      fleet: [],
      placement: { selectedShipId: null, orientation: 'H' },
    };
    expect(isWin(player)).toBe(false);
  });
});
