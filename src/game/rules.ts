import { coordsEqual, inBounds } from './coordinates';
import { cloneBoard, cloneFleet } from './placement';
import { TOTAL_SHIP_CELLS } from './constants';
import type {
  Coord,
  OwnBoard,
  PlayerId,
  PlayerState,
  Ship,
  ShipId,
  ShotOutcome,
  ShotResult,
} from './types';

export type ShotRejectionReason =
  | 'out-of-bounds'
  | 'duplicate'
  | 'game-over';

export type ShotApply =
  | {
      ok: true;
      ownBoard: OwnBoard;
      fleet: Ship[];
      result: ShotResult;
    }
  | {
      ok: false;
      reason: ShotRejectionReason;
    };

/**
 * Apply a shot at `at` on the *receiving* player's board+fleet.
 * Returns the updated board+fleet and the shot result, or a rejection reason.
 */
export function resolveShot(
  receiving: { ownBoard: OwnBoard; fleet: Ship[] },
  by: PlayerId,
  at: Coord,
): ShotApply {
  if (!inBounds(at, receiving.ownBoard.size)) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  const cell = receiving.ownBoard.cells[at.row]?.[at.col];
  if (!cell) return { ok: false, reason: 'out-of-bounds' };
  if (cell.hit || cell.miss) {
    return { ok: false, reason: 'duplicate' };
  }

  const board = cloneBoard(receiving.ownBoard);
  const targetCell = board.cells[at.row]?.[at.col];
  if (!targetCell) return { ok: false, reason: 'out-of-bounds' };

  let fleet = cloneFleet(receiving.fleet);
  let outcome: ShotOutcome;
  let sunkShipId: ShipId | undefined;

  if (cell.shipId === null) {
    targetCell.miss = true;
    outcome = 'miss';
  } else {
    targetCell.hit = true;
    const shipId: ShipId = cell.shipId;
    fleet = fleet.map((s) => {
      if (s.id !== shipId) return s;
      const alreadyHit = s.hits.some((h) => coordsEqual(h, at));
      const hits = alreadyHit ? s.hits : [...s.hits, at];
      const sunk = hits.length >= s.length;
      return { ...s, hits, sunk };
    });
    const ship = fleet.find((s) => s.id === shipId);
    if (ship && ship.sunk) {
      outcome = 'sunk';
      sunkShipId = shipId;
    } else {
      outcome = 'hit';
    }
  }

  const result: ShotResult = sunkShipId
    ? { by, at, outcome, sunkShipId }
    : { by, at, outcome };
  return { ok: true, ownBoard: board, fleet, result };
}

export function isFleetDefeated(fleet: Ship[]): boolean {
  // A fleet is defeated when every placed ship is sunk AND the total hit count
  // equals total ship cells (defensive double-check).
  if (fleet.length === 0) return false;
  if (!fleet.every((s) => s.sunk)) return false;
  const hits = fleet.reduce((acc, s) => acc + s.hits.length, 0);
  return hits === TOTAL_SHIP_CELLS;
}

export function shotsRemainingForPlayer(player: PlayerState): number {
  // How many ship cells the *opponent's* shots have NOT yet hit on this player.
  const totalCells = TOTAL_SHIP_CELLS;
  const hits = player.fleet.reduce((acc, s) => acc + s.hits.length, 0);
  return totalCells - hits;
}

export function alreadyShotAt(prior: ShotResult[], coord: Coord): boolean {
  return prior.some((s) => coordsEqual(s.at, coord));
}

export function isWin(opponent: PlayerState): boolean {
  return isFleetDefeated(opponent.fleet);
}
