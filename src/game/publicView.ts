import { BOARD_SIZE, FLEET, SHIP_LENGTH } from './constants';
import { shipFootprint } from './coordinates';
import type {
  PlayerState,
  PublicOpponentView,
  PublicSunkShip,
  ShotResult,
  ShipId,
} from './types';

/**
 * Build the AI's view of its opponent. This MUST NOT include hidden ship
 * coordinates: only what would be revealed by the public history of shots.
 *
 * - `shots` is the firing player's own shot history.
 * - `sunkShips` reveals only ships that have been fully sunk (their cells are
 *   visible to anyone watching the game; we reconstruct cells from shot results).
 * - `remainingShipLengths` is the multiset of ship lengths NOT yet sunk.
 *
 * The returned object is recursively frozen so the AI cannot peek into a non-frozen
 * structure or mutate the source.
 */
export function buildPublicView(
  opponent: PlayerState,
  shooterShots: ShotResult[],
  size: number = BOARD_SIZE,
): PublicOpponentView {
  // Extract sunk ships from the opponent's fleet.
  // We use ONLY publicly observable info to reconstruct cells: a ship is "publicly
  // sunk" iff a shot result with sunkShipId matches it. We then collect the
  // `at` coordinates of all `hit`/`sunk` shots whose target was that ship.
  // To do that we must derive ship membership for each hit. The opponent's fleet
  // tells us which cells belong to which ship — but ONLY for sunk ships are those
  // cells public. We never expose un-sunk ships' cells.
  const sunkShips: PublicSunkShip[] = [];
  for (const ship of opponent.fleet) {
    if (!ship.sunk || ship.origin === null) continue;
    sunkShips.push({
      id: ship.id,
      length: ship.length,
      cells: shipFootprint(ship.origin, ship.length, ship.orientation),
    });
  }

  const sunkIds = new Set<ShipId>(sunkShips.map((s) => s.id));
  const remainingShipLengths: number[] = [];
  for (const spec of FLEET) {
    if (!sunkIds.has(spec.id)) remainingShipLengths.push(SHIP_LENGTH[spec.id]);
  }

  const view: PublicOpponentView = {
    size,
    shots: shooterShots.map((s) => {
      const cloned: ShotResult = { by: s.by, at: { ...s.at }, outcome: s.outcome };
      if (s.sunkShipId) cloned.sunkShipId = s.sunkShipId;
      return cloned;
    }),
    sunkShips: sunkShips.map((s) => ({
      id: s.id,
      length: s.length,
      cells: s.cells.map((c) => ({ ...c })),
    })),
    remainingShipLengths,
  };

  return deepFreeze(view);
}

export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}
