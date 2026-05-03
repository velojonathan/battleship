import { memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { formatCoord } from '../game/coordinates';
import type { Coord } from '../game/types';
import styles from './Cell.module.css';

export type CellState =
  | 'empty'
  | 'ship' // own ship visible to owning player
  | 'preview-valid'
  | 'preview-invalid'
  | 'hit'
  | 'miss'
  | 'sunk';

export interface CellProps {
  coord: Coord;
  state: CellState;
  /** Aria-label override; defaults to coord-aware label. */
  label?: string;
  /** When false, the cell renders as a non-interactive square. */
  interactive?: boolean;
  disabled?: boolean;
  onClick?: (coord: Coord, event: MouseEvent<HTMLButtonElement>) => void;
  onPointerEnter?: (coord: Coord) => void;
  onPointerLeave?: (coord: Coord) => void;
  onKeyDown?: (coord: Coord, event: KeyboardEvent<HTMLButtonElement>) => void;
  /** Surface class injected on the wrapper for board-level theming. */
  className?: string;
  /** Additional inline style — used by Board to position cells in the grid. */
  style?: CSSProperties;
}

const STATE_CLASS: Record<CellState, string> = {
  empty: '',
  ship: styles.ship ?? '',
  'preview-valid': styles.previewValid ?? '',
  'preview-invalid': styles.previewInvalid ?? '',
  hit: styles.hit ?? '',
  miss: styles.miss ?? '',
  sunk: styles.sunk ?? '',
};

const LABEL_HINT: Record<CellState, string> = {
  empty: '',
  ship: ', your ship',
  'preview-valid': ', preview',
  'preview-invalid': ', invalid placement',
  hit: ', hit',
  miss: ', miss',
  sunk: ', sunk',
};

function defaultLabel(coord: Coord, state: CellState): string {
  return `${formatCoord(coord)}${LABEL_HINT[state]}`;
}

function CellInner({
  coord,
  state,
  label,
  interactive = true,
  disabled = false,
  onClick,
  onPointerEnter,
  onPointerLeave,
  onKeyDown,
  className = '',
  style,
}: CellProps) {
  const cls = [styles.cell, STATE_CLASS[state], className].filter(Boolean).join(' ');
  const a11y = label ?? defaultLabel(coord, state);

  if (!interactive) {
    return (
      <span
        role="presentation"
        aria-label={a11y}
        className={cls}
        style={style}
        data-coord={`${coord.row},${coord.col}`}
        data-state={state}
      >
        {(state === 'hit' || state === 'sunk') && <span className={styles.marker} />}
        {state === 'miss' && <span className={`${styles.marker} ${styles.miss}`} />}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={a11y}
      className={cls}
      style={style}
      disabled={disabled}
      data-coord={`${coord.row},${coord.col}`}
      data-state={state}
      onClick={(e) => onClick?.(coord, e)}
      onPointerEnter={() => onPointerEnter?.(coord)}
      onPointerLeave={() => onPointerLeave?.(coord)}
      onKeyDown={(e) => onKeyDown?.(coord, e)}
    >
      {(state === 'hit' || state === 'sunk') && <span className={styles.marker} />}
      {state === 'miss' && <span className={`${styles.marker} ${styles.miss}`} />}
    </button>
  );
}

export const Cell = memo(CellInner);
