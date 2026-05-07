import type { Orientation, PlayerId, Ship, ShipId } from '../game/types';
import styles from './ShipDock.module.css';

export interface ShipDockProps {
  player: PlayerId;
  fleet: Ship[];
  selectedShipId: ShipId | null;
  orientation: Orientation;
  onSelectShip: (shipId: ShipId | null) => void;
  onRotate: () => void;
  onRandomize: () => void;
  onReset: () => void;
}

export function ShipDock({
  player,
  fleet,
  selectedShipId,
  orientation,
  onSelectShip,
  onRotate,
  onRandomize,
  onReset,
}: ShipDockProps): JSX.Element {
  const placedCount = fleet.filter((s) => s.origin !== null).length;
  const totalCount = fleet.length;

  return (
    <section
      className={styles.dock}
      aria-label={`${player === 'p1' ? 'Player 1' : 'Player 2'} ship dock`}
    >
      <h2 className={styles.heading}>Fleet</h2>
      <div className={styles.orientation} aria-live="polite">
        <span>
          Placed <strong>{placedCount}</strong>/{totalCount}
        </span>
        <span>
          Orientation:{' '}
          <span className={styles.orientationValue}>
            {orientation === 'H' ? 'Horizontal' : 'Vertical'}
          </span>
        </span>
      </div>
      <ul className={styles.list}>
        {fleet.map((ship) => {
          const placed = ship.origin !== null;
          const isSelected = selectedShipId === ship.id;
          const cls = [styles.shipButton, isSelected ? styles.selected : '', placed ? styles.placed : '']
            .filter(Boolean)
            .join(' ');
          const status = placed ? 'Placed' : 'Pending';
          const aria = `${ship.name}, length ${ship.length}, ${status}${
            isSelected ? ', selected' : ''
          }`;
          return (
            <li key={ship.id} className={styles.item}>
              <button
                type="button"
                className={cls}
                aria-pressed={isSelected}
                aria-label={aria}
                onClick={() => {
                  if (!isSelected) onSelectShip(ship.id);
                }}
              >
                <span>{ship.name}</span>
                <span className={styles.length} aria-hidden="true">
                  {Array.from({ length: ship.length }).map((_, i) => (
                    <span
                      key={i}
                      className={`${styles.lengthDot} ${placed ? styles.placed : styles.empty}`}
                    />
                  ))}
                </span>
                <span className={`${styles.status} ${placed ? styles.placed : ''}`}>
                  {status}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={onRotate}
          disabled={!selectedShipId}
          aria-label="Rotate selected ship"
        >
          Rotate (R)
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={onRandomize}
          aria-label="Randomize fleet"
        >
          Randomize
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={onReset}
          aria-label="Reset fleet"
          disabled={placedCount === 0}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
