import { SHIP_NAME, TOTAL_SHIP_CELLS } from '../game/constants';
import type { GameState, PlayerId, Ship, ShipId } from '../game/types';
import { ShipSvg } from './ShipSvg';
import styles from './FleetStatus.module.css';

export interface FleetStatusProps {
  state: GameState;
  player: PlayerId;
  /** When true, ship hit counts are shown (your own fleet). When false, only sunk ships are revealed. */
  reveal: boolean;
  title?: string;
}

interface DerivedShip {
  id: ShipId;
  name: string;
  length: number;
  hits: number;
  sunk: boolean;
}

function deriveOwn(ships: readonly Ship[]): DerivedShip[] {
  return ships.map((s) => ({
    id: s.id,
    name: s.name,
    length: s.length,
    hits: s.hits.length,
    sunk: s.sunk,
  }));
}

/**
 * Derive the *publicly known* status of the opponent's fleet for per-row display.
 * Only sunk ships are revealed; un-sunk ships are shown as "Active" with no hit count.
 * This preserves anti-cheat: per-ship hit counts stay hidden until the ship is sunk.
 *
 * Note: the *aggregate* segment-health number rendered in the header is derived
 * from the source fleet (cells actually hit). That number equals the count of
 * the viewer's hit/sunk shots, which is already public information visible on
 * the board. Surfacing the aggregate adds no new info.
 */
function deriveOpponent(ships: readonly Ship[]): DerivedShip[] {
  return ships.map((s) => ({
    id: s.id,
    name: s.name,
    length: s.length,
    hits: s.sunk ? s.length : 0,
    sunk: s.sunk,
  }));
}

function totalCellsLost(ships: readonly Ship[]): number {
  let n = 0;
  for (const s of ships) n += s.hits.length;
  return n;
}

export function FleetStatus({
  state,
  player,
  reveal,
  title,
}: FleetStatusProps): JSX.Element {
  const ships = state.players[player].fleet;
  const derived = reveal ? deriveOwn(ships) : deriveOpponent(ships);
  // Both panels use the same segment-health metric: cells afloat / TOTAL_SHIP_CELLS.
  // Privacy: the aggregate count for the opponent fleet equals the viewer's own
  // hit/sunk shot count (already in the DOM as cell data-state="hit|sunk").
  const cellsLost = totalCellsLost(ships);
  const cellsAfloat = TOTAL_SHIP_CELLS - cellsLost;
  const allSunk = cellsAfloat === 0;
  const summaryText = `${cellsAfloat}/${TOTAL_SHIP_CELLS} ${allSunk ? 'SUNK' : 'AFLOAT'}`;
  const heading = title ?? `${state.players[player].name} fleet`;
  const ariaLabel = `${heading}, ${cellsAfloat} of ${TOTAL_SHIP_CELLS} cells afloat`;

  return (
    <section className={styles.panel} aria-label={ariaLabel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{heading}</h2>
        <span className={styles.summary} data-summary="segment-health">
          {summaryText}
        </span>
      </header>
      <ul className={styles.list}>
        {derived.map((ship) => {
          const visualState: 'pending' | 'placed' | 'damaged' | 'sunk' = ship.sunk
            ? 'sunk'
            : ship.hits > 0
              ? 'damaged'
              : 'placed';
          return (
            <li
              key={ship.id}
              className={`${styles.ship} ${ship.sunk ? styles.sunk : ''}`}
              data-ship={ship.id}
              data-sunk={ship.sunk ? 'true' : 'false'}
            >
              <span className={styles.silhouette} aria-hidden="true">
                <ShipSvg shipId={ship.id} length={ship.length} state={visualState} width={18} />
              </span>
              <span className={styles.name}>{SHIP_NAME[ship.id]}</span>
              <span className={styles.cells} aria-hidden="true">
                {Array.from({ length: ship.length }).map((_, i) => {
                  const damaged = reveal ? i < ship.hits : ship.sunk;
                  return (
                    <span
                      key={i}
                      className={`${styles.cell} ${damaged ? styles.damaged : ''}`}
                    />
                  );
                })}
              </span>
              <span className={styles.label}>
                {ship.sunk ? 'Sunk' : reveal ? `${ship.length - ship.hits}/${ship.length}` : 'Active'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
