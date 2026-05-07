import { SHIP_NAME } from '../game/constants';
import type { GameState, PlayerId, Ship, ShipId } from '../game/types';
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
 * Derive the *publicly known* status of the opponent's fleet.
 * Only sunk ships are revealed; un-sunk ships show "??" for their hit count.
 * This means we never leak hidden info even if a future bug rendered this twice.
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

export function FleetStatus({
  state,
  player,
  reveal,
  title,
}: FleetStatusProps): JSX.Element {
  const ships = state.players[player].fleet;
  const derived = reveal ? deriveOwn(ships) : deriveOpponent(ships);
  const totalHits = derived.reduce((acc, s) => acc + s.hits, 0);
  const totalCells = derived.reduce((acc, s) => acc + s.length, 0);
  const heading = title ?? `${state.players[player].name} fleet`;
  const ariaLabel = reveal
    ? `${heading}, ${totalHits} of ${totalCells} cells damaged`
    : `${heading}, ${derived.filter((s) => s.sunk).length} of ${derived.length} ships sunk`;

  return (
    <section className={styles.panel} aria-label={ariaLabel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{heading}</h2>
        <span className={styles.summary}>
          {reveal
            ? `${totalCells - totalHits}/${totalCells} afloat`
            : `${derived.filter((s) => !s.sunk).length}/${derived.length} active`}
        </span>
      </header>
      <ul className={styles.list}>
        {derived.map((ship) => (
          <li
            key={ship.id}
            className={`${styles.ship} ${ship.sunk ? styles.sunk : ''}`}
            data-ship={ship.id}
            data-sunk={ship.sunk ? 'true' : 'false'}
          >
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
        ))}
      </ul>
    </section>
  );
}
