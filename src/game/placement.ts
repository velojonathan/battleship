import { BOARD_SIZE, FLEET, SHIP_LENGTH } from './constants';
import { inBounds, shipFootprint } from './coordinates';
import { pickInt, shuffle } from './rng';
import type { Cell, Coord, Orientation, OwnBoard, Ship, ShipId } from './types';

export function emptyCell(): Cell {
  return { shipId: null, hit: false, miss: false };
}

export function emptyBoard(size: number = BOARD_SIZE): OwnBoard {
  const cells: Cell[][] = [];
  for (let r = 0; r < size; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < size; c++) row.push(emptyCell());
    cells.push(row);
  }
  return { size, cells };
}

export function emptyFleet(): Ship[] {
  return FLEET.map((spec) => ({
    id: spec.id,
    name: spec.name,
    length: spec.length,
    origin: null,
    orientation: 'H',
    hits: [],
    sunk: false,
  }));
}

export function getShip(fleet: Ship[], id: ShipId): Ship {
  const ship = fleet.find((s) => s.id === id);
  if (!ship) throw new Error(`Ship not found in fleet: ${id}`);
  return ship;
}

export function isPlaced(ship: Ship): boolean {
  return ship.origin !== null;
}

export function allShipsPlaced(fleet: Ship[]): boolean {
  return fleet.every(isPlaced);
}

export type PlacementErrorReason =
  | 'out-of-bounds'
  | 'overlap'
  | 'unknown-ship';

export interface PlacementError {
  reason: PlacementErrorReason;
}

export type PlacementCheck = { ok: true } | { ok: false; error: PlacementError };

export function canPlaceFootprint(
  board: OwnBoard,
  footprint: Coord[],
  ignoreShipId: ShipId | null = null,
): PlacementCheck {
  for (const cell of footprint) {
    if (!inBounds(cell, board.size)) {
      return { ok: false, error: { reason: 'out-of-bounds' } };
    }
    const row = board.cells[cell.row];
    if (!row) return { ok: false, error: { reason: 'out-of-bounds' } };
    const occupant = row[cell.col]?.shipId ?? null;
    if (occupant && occupant !== ignoreShipId) {
      return { ok: false, error: { reason: 'overlap' } };
    }
  }
  return { ok: true };
}

export function canPlaceShip(
  board: OwnBoard,
  shipId: ShipId,
  origin: Coord,
  orientation: Orientation,
): PlacementCheck {
  const length = SHIP_LENGTH[shipId];
  if (!length) return { ok: false, error: { reason: 'unknown-ship' } };
  const footprint = shipFootprint(origin, length, orientation);
  return canPlaceFootprint(board, footprint, shipId);
}

export function cloneBoard(board: OwnBoard): OwnBoard {
  return {
    size: board.size,
    cells: board.cells.map((row) => row.map((cell) => ({ ...cell }))),
  };
}

export function cloneFleet(fleet: Ship[]): Ship[] {
  return fleet.map((s) => ({
    ...s,
    hits: s.hits.map((h) => ({ ...h })),
  }));
}

export function clearShipFromBoard(board: OwnBoard, shipId: ShipId): OwnBoard {
  const next = cloneBoard(board);
  for (let r = 0; r < next.size; r++) {
    const row = next.cells[r];
    if (!row) continue;
    for (let c = 0; c < next.size; c++) {
      const cell = row[c];
      if (cell && cell.shipId === shipId) {
        row[c] = emptyCell();
      }
    }
  }
  return next;
}

/**
 * Place a ship on a (possibly populated) board. Replaces this ship's prior placement
 * if any. Returns the new board if legal; otherwise returns the unchanged board with
 * an error.
 */
export function placeShipOnBoard(
  board: OwnBoard,
  shipId: ShipId,
  origin: Coord,
  orientation: Orientation,
): { board: OwnBoard; check: PlacementCheck } {
  const length = SHIP_LENGTH[shipId];
  if (!length) return { board, check: { ok: false, error: { reason: 'unknown-ship' } } };
  const footprint = shipFootprint(origin, length, orientation);
  const cleared = clearShipFromBoard(board, shipId);
  const check = canPlaceFootprint(cleared, footprint, shipId);
  if (!check.ok) return { board, check };
  for (const cell of footprint) {
    const row = cleared.cells[cell.row];
    if (!row) return { board, check: { ok: false, error: { reason: 'out-of-bounds' } } };
    const c = row[cell.col];
    if (!c) return { board, check: { ok: false, error: { reason: 'out-of-bounds' } } };
    c.shipId = shipId;
  }
  return { board: cleared, check: { ok: true } };
}

export function setShipPlacement(
  fleet: Ship[],
  shipId: ShipId,
  origin: Coord | null,
  orientation: Orientation,
): Ship[] {
  return fleet.map((s) =>
    s.id === shipId ? { ...s, origin, orientation, hits: [], sunk: false } : s,
  );
}

export function clearShipFromFleet(fleet: Ship[], shipId: ShipId): Ship[] {
  return fleet.map((s) =>
    s.id === shipId ? { ...s, origin: null, hits: [], sunk: false } : s,
  );
}

export interface RandomFleetOptions {
  maxAttempts?: number;
}

export interface RandomFleetResult {
  board: OwnBoard;
  fleet: Ship[];
}

/**
 * Generate a fully placed legal fleet using the supplied RNG. Always returns a legal
 * fleet (or throws — should not be reachable for the standard 10x10/17 fleet).
 */
export function randomFleet(
  rng: () => number,
  options: RandomFleetOptions = {},
): RandomFleetResult {
  const maxAttempts = options.maxAttempts ?? 200;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const out = tryRandomFleet(rng);
    if (out) return out;
  }
  const fallback = backtrackFleet(rng);
  if (!fallback) throw new Error('Failed to generate random fleet');
  return fallback;
}

function tryRandomFleet(rng: () => number): RandomFleetResult | null {
  let board = emptyBoard();
  let fleet = emptyFleet();
  // Place largest first.
  const order = FLEET.slice().sort((a, b) => b.length - a.length);
  for (const spec of order) {
    const placement = pickRandomPlacement(board, spec.id, rng);
    if (!placement) return null;
    const result = placeShipOnBoard(board, spec.id, placement.origin, placement.orientation);
    if (!result.check.ok) return null;
    board = result.board;
    fleet = setShipPlacement(fleet, spec.id, placement.origin, placement.orientation);
  }
  return { board, fleet };
}

function pickRandomPlacement(
  board: OwnBoard,
  shipId: ShipId,
  rng: () => number,
): { origin: Coord; orientation: Orientation } | null {
  const candidates = legalPlacementsFor(board, shipId);
  if (candidates.length === 0) return null;
  const pick = candidates[pickInt(rng, candidates.length)];
  return pick ?? null;
}

export function legalPlacementsFor(
  board: OwnBoard,
  shipId: ShipId,
): Array<{ origin: Coord; orientation: Orientation }> {
  const length = SHIP_LENGTH[shipId];
  if (!length) return [];
  const out: Array<{ origin: Coord; orientation: Orientation }> = [];
  const orientations: Orientation[] = ['H', 'V'];
  for (const orientation of orientations) {
    const maxRow = orientation === 'V' ? board.size - length : board.size - 1;
    const maxCol = orientation === 'H' ? board.size - length : board.size - 1;
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        const origin = { row: r, col: c };
        if (canPlaceShip(board, shipId, origin, orientation).ok) {
          out.push({ origin, orientation });
        }
      }
    }
  }
  return out;
}

function backtrackFleet(rng: () => number): RandomFleetResult | null {
  const order = FLEET.slice().sort((a, b) => b.length - a.length);

  function helper(
    idx: number,
    state: RandomFleetResult,
  ): RandomFleetResult | null {
    if (idx === order.length) return state;
    const spec = order[idx];
    if (!spec) return state;
    const candidates = shuffle(rng, legalPlacementsFor(state.board, spec.id));
    for (const cand of candidates) {
      const placed = placeShipOnBoard(state.board, spec.id, cand.origin, cand.orientation);
      if (!placed.check.ok) continue;
      const nextFleet = setShipPlacement(state.fleet, spec.id, cand.origin, cand.orientation);
      const result = helper(idx + 1, { board: placed.board, fleet: nextFleet });
      if (result) return result;
    }
    return null;
  }

  return helper(0, { board: emptyBoard(), fleet: emptyFleet() });
}
