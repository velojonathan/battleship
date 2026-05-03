import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, FLEET, TOTAL_SHIP_CELLS } from '../../src/game/constants';
import {
  allShipsPlaced,
  canPlaceShip,
  emptyBoard,
  emptyFleet,
  legalPlacementsFor,
  placeShipOnBoard,
  randomFleet,
} from '../../src/game/placement';
import { mulberry32 } from '../../src/game/rng';

describe('canPlaceShip', () => {
  it('accepts a legal horizontal placement', () => {
    const board = emptyBoard();
    expect(canPlaceShip(board, 'carrier', { row: 0, col: 0 }, 'H').ok).toBe(true);
  });
  it('accepts a legal vertical placement', () => {
    const board = emptyBoard();
    expect(canPlaceShip(board, 'carrier', { row: 0, col: 0 }, 'V').ok).toBe(true);
  });
  it('rejects out-of-bounds horizontally', () => {
    const board = emptyBoard();
    const r = canPlaceShip(board, 'carrier', { row: 0, col: 6 }, 'H');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.reason).toBe('out-of-bounds');
  });
  it('rejects out-of-bounds vertically', () => {
    const board = emptyBoard();
    const r = canPlaceShip(board, 'carrier', { row: 6, col: 0 }, 'V');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.reason).toBe('out-of-bounds');
  });
  it('rejects overlap', () => {
    let board = emptyBoard();
    const placed = placeShipOnBoard(board, 'carrier', { row: 0, col: 0 }, 'H');
    expect(placed.check.ok).toBe(true);
    board = placed.board;
    const r = canPlaceShip(board, 'battleship', { row: 0, col: 2 }, 'H');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.reason).toBe('overlap');
  });
  it('allows touching ships (no buffer rule)', () => {
    let board = emptyBoard();
    board = placeShipOnBoard(board, 'carrier', { row: 0, col: 0 }, 'H').board;
    expect(canPlaceShip(board, 'destroyer', { row: 1, col: 0 }, 'H').ok).toBe(true);
  });
});

describe('placeShipOnBoard', () => {
  it('places the ship and returns a new board', () => {
    const board = emptyBoard();
    const result = placeShipOnBoard(board, 'destroyer', { row: 4, col: 4 }, 'H');
    expect(result.check.ok).toBe(true);
    expect(result.board.cells[4]?.[4]?.shipId).toBe('destroyer');
    expect(result.board.cells[4]?.[5]?.shipId).toBe('destroyer');
    // original board unmodified
    expect(board.cells[4]?.[4]?.shipId).toBe(null);
  });
  it('relocates an already-placed ship', () => {
    let b = emptyBoard();
    b = placeShipOnBoard(b, 'carrier', { row: 0, col: 0 }, 'H').board;
    expect(b.cells[0]?.[0]?.shipId).toBe('carrier');
    const moved = placeShipOnBoard(b, 'carrier', { row: 5, col: 5 }, 'V');
    expect(moved.check.ok).toBe(true);
    expect(moved.board.cells[0]?.[0]?.shipId).toBe(null);
    expect(moved.board.cells[5]?.[5]?.shipId).toBe('carrier');
    expect(moved.board.cells[9]?.[5]?.shipId).toBe('carrier');
  });
});

describe('legalPlacementsFor', () => {
  it('returns all legal H+V placements on an empty board', () => {
    const board = emptyBoard();
    const placements = legalPlacementsFor(board, 'destroyer'); // length 2
    // 10 rows * 9 H + 9 cols * 10 V actually: H -> rows*(BOARD_SIZE-1)=10*9=90, V -> 9*10=90
    expect(placements).toHaveLength(180);
  });
});

describe('randomFleet', () => {
  it('always produces a fully placed legal fleet', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { board, fleet } = randomFleet(mulberry32(seed));
      expect(allShipsPlaced(fleet)).toBe(true);
      // every ship cell is on the board
      let occupied = 0;
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (board.cells[r]?.[c]?.shipId) occupied++;
        }
      }
      expect(occupied).toBe(TOTAL_SHIP_CELLS);
      // no ship overlaps
      for (const ship of fleet) {
        expect(ship.origin).not.toBeNull();
      }
    }
  });
  it('is deterministic given the same seed', () => {
    const a = randomFleet(mulberry32(42));
    const b = randomFleet(mulberry32(42));
    expect(a.fleet).toEqual(b.fleet);
  });
});

describe('emptyFleet', () => {
  it('contains exactly the standard fleet', () => {
    const fleet = emptyFleet();
    const ids = fleet.map((s) => s.id).sort();
    expect(ids).toEqual(FLEET.map((s) => s.id).sort());
    for (const f of FLEET) {
      const ship = fleet.find((s) => s.id === f.id);
      expect(ship?.length).toBe(f.length);
      expect(ship?.origin).toBeNull();
    }
  });
});

describe('randomFleet / backtracker fallback', () => {
  it('produces a legal fleet when forced to use the backtracker', () => {
    const { board, fleet } = randomFleet(mulberry32(42), { maxAttempts: 0 });
    expect(allShipsPlaced(fleet)).toBe(true);
    let occupied = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board.cells[r]?.[c]?.shipId) occupied++;
      }
    }
    expect(occupied).toBe(TOTAL_SHIP_CELLS);
  });
});
