import { useCallback, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { coordKey } from '../game/coordinates';
import type { Coord, Orientation, OwnBoard, ShipId } from '../game/types';
import { Cell, type CellState } from './Cell';
import { ShipSvg } from './ShipSvg';
import styles from './Board.module.css';

/**
 * A fully-sunk ship rendered as an overlay on top of the grid. Only data
 * derivable from public state should be passed here for a targeting board;
 * for the own board, the player's own sunk ships are obviously visible to
 * themselves.
 */
export interface SunkShipOverlay {
  id: ShipId;
  origin: Coord;
  orientation: Orientation;
  length: number;
}

const COLUMN_LABELS = 'ABCDEFGHIJ'.split('');

/**
 * Move keyboard focus from `from` toward `dir`, wrapping to the next/previous
 * row when needed. The board is queried via data-coord attributes so this
 * works for both placement and game boards. Returns true if focus moved.
 */
function moveFocus(
  fromEl: HTMLElement,
  from: Coord,
  dir: 'up' | 'down' | 'left' | 'right',
  size: number,
): boolean {
  let { row, col } = from;
  if (dir === 'up') row -= 1;
  else if (dir === 'down') row += 1;
  else if (dir === 'left') col -= 1;
  else col += 1;
  if (row < 0 || row >= size || col < 0 || col >= size) return false;
  const grid = fromEl.closest('[role="grid"]') as HTMLElement | null;
  if (!grid) return false;
  const next = grid.querySelector<HTMLButtonElement>(
    `button[data-coord="${row},${col}"]:not([disabled])`,
  );
  if (next) {
    next.focus();
    return true;
  }
  // If neighbor is disabled, try to step further in the same direction so
  // the player can still skip past resolved cells.
  return moveFocus(fromEl, { row, col }, dir, size);
}

export type BoardVariant = 'placement' | 'own' | 'targeting';

export interface BoardProps {
  /** Board model used for sizing. */
  board: OwnBoard;
  /** Computes per-cell state. Override for own/targeting/preview boards. */
  cellState: (coord: Coord) => CellState;
  /** Optional aria-label per cell (overrides default). */
  cellLabel?: (coord: Coord) => string | undefined;
  /** When true, cells are non-interactive (presentation only). */
  readOnly?: boolean;
  cellDisabled?: (coord: Coord) => boolean;
  onCellClick?: (coord: Coord, event: MouseEvent<HTMLButtonElement>) => void;
  onCellPointerEnter?: (coord: Coord) => void;
  onCellPointerLeave?: (coord: Coord) => void;
  onCellKeyDown?: (coord: Coord, event: KeyboardEvent<HTMLButtonElement>) => void;
  className?: string;
  ariaLabel?: string;
  /**
   * Visual variant. 'targeting' adds a sonar-style scan overlay & glow.
   * 'own' applies a slightly different palette so the two boards are
   * obviously different to the player at a glance. Default is 'placement'.
   */
  variant?: BoardVariant;
  /**
   * Fully-sunk ships to render as a tilted/faded ShipSvg overlay over their
   * grid footprint. For 'targeting' boards, only pass publicly-known sunk
   * ships (privacy: never expose un-sunk opponent positions).
   */
  sunkShips?: readonly SunkShipOverlay[];
}

export function Board({
  board,
  cellState,
  cellLabel,
  readOnly = false,
  cellDisabled,
  onCellClick,
  onCellPointerEnter,
  onCellPointerLeave,
  onCellKeyDown,
  className = '',
  ariaLabel,
  variant = 'placement',
  sunkShips,
}: BoardProps): JSX.Element {
  const size = board.size;
  const style: CSSProperties = {
    ['--board-rows' as never]: size,
    ['--board-cols' as never]: size,
  };
  const rows = Array.from({ length: size }, (_, i) => i);
  const cols = Array.from({ length: size }, (_, i) => i);
  const variantClass =
    variant === 'targeting' ? styles.targeting : variant === 'own' ? styles.own : '';

  // Keyboard navigation: arrow keys move focus to the neighboring cell.
  // The user-supplied onCellKeyDown still runs first; if the user calls
  // event.preventDefault we don't intercept the navigation either.
  const handleCellKey = useCallback(
    (coord: Coord, event: KeyboardEvent<HTMLButtonElement>) => {
      onCellKeyDown?.(coord, event);
      if (event.defaultPrevented) return;
      const dir =
        event.key === 'ArrowUp'
          ? 'up'
          : event.key === 'ArrowDown'
            ? 'down'
            : event.key === 'ArrowLeft'
              ? 'left'
              : event.key === 'ArrowRight'
                ? 'right'
                : null;
      if (!dir) return;
      const moved = moveFocus(event.currentTarget as HTMLElement, coord, dir, size);
      if (moved) event.preventDefault();
    },
    [onCellKeyDown, size],
  );

  return (
    <div
      className={[styles.board, variantClass, className].filter(Boolean).join(' ')}
      style={style}
      role="grid"
      aria-label={ariaLabel ?? 'Battleship board'}
      data-variant={variant}
    >
      {variant === 'targeting' && (
        <>
          <span aria-hidden="true" className={styles.scanRing} />
          <span aria-hidden="true" className={styles.scanSweep} />
          <span aria-hidden="true" className={styles.scanCenter} />
        </>
      )}
      <span aria-hidden="true" className={`${styles.label} ${styles.corner}`} />
      {cols.map((c) => (
        <span key={`col-${c}`} aria-hidden="true" className={styles.label}>
          {COLUMN_LABELS[c]}
        </span>
      ))}
      {rows.map((r) => (
        <Row
          key={`row-${r}`}
          row={r}
          cols={cols}
          cellState={cellState}
          cellLabel={cellLabel}
          readOnly={readOnly}
          cellDisabled={cellDisabled}
          onCellClick={onCellClick}
          onCellPointerEnter={onCellPointerEnter}
          onCellPointerLeave={onCellPointerLeave}
          onCellKeyDown={handleCellKey}
        />
      ))}
      {sunkShips && sunkShips.length > 0 && (
        <SunkOverlayLayer ships={sunkShips} variant={variant} />
      )}
    </div>
  );
}

interface SunkOverlayLayerProps {
  ships: readonly SunkShipOverlay[];
  variant: BoardVariant;
}

/**
 * Absolutely-positioned layer that sits on top of the grid and renders a
 * tilted, faded ShipSvg over each fully-sunk ship's footprint. The layer is
 * pointer-events: none so it never intercepts shot clicks. Each overlay is
 * positioned in CSS using grid-track variables so it lines up with the
 * underlying cells without measuring the DOM.
 */
function SunkOverlayLayer({ ships, variant }: SunkOverlayLayerProps): JSX.Element {
  return (
    <div className={styles.sunkLayer} aria-hidden="true" data-variant={variant}>
      {ships.map((ship) => {
        const isHorizontal = ship.orientation === 'H';
        const overlayStyle: CSSProperties = {
          ['--sunk-row' as never]: ship.origin.row,
          ['--sunk-col' as never]: ship.origin.col,
          ['--sunk-len' as never]: ship.length,
        };
        return (
          <span
            key={ship.id}
            className={`${styles.sunkOverlay} ${isHorizontal ? styles.sunkH : styles.sunkV}`}
            style={overlayStyle}
            data-ship={ship.id}
            data-orientation={ship.orientation}
            data-testid={`sunk-overlay-${ship.id}`}
          >
            <ShipSvg shipId={ship.id} length={ship.length} state="sunk" width={28} />
          </span>
        );
      })}
    </div>
  );
}

interface RowProps {
  row: number;
  cols: number[];
  cellState: BoardProps['cellState'];
  cellLabel?: BoardProps['cellLabel'];
  readOnly: boolean;
  cellDisabled?: BoardProps['cellDisabled'];
  onCellClick?: BoardProps['onCellClick'];
  onCellPointerEnter?: BoardProps['onCellPointerEnter'];
  onCellPointerLeave?: BoardProps['onCellPointerLeave'];
  onCellKeyDown?: BoardProps['onCellKeyDown'];
}

function Row({
  row,
  cols,
  cellState,
  cellLabel,
  readOnly,
  cellDisabled,
  onCellClick,
  onCellPointerEnter,
  onCellPointerLeave,
  onCellKeyDown,
}: RowProps) {
  return (
    <>
      <span aria-hidden="true" className={styles.label}>
        {row + 1}
      </span>
      {cols.map((c) => {
        const coord: Coord = { row, col: c };
        const state = cellState(coord);
        const label = cellLabel?.(coord);
        return (
          <Cell
            key={coordKey(coord)}
            coord={coord}
            state={state}
            interactive={!readOnly}
            disabled={cellDisabled?.(coord) ?? false}
            label={label}
            onClick={onCellClick}
            onPointerEnter={onCellPointerEnter}
            onPointerLeave={onCellPointerLeave}
            onKeyDown={onCellKeyDown}
          />
        );
      })}
    </>
  );
}
