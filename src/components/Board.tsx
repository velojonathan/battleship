import { type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { coordKey } from '../game/coordinates';
import type { Coord, OwnBoard } from '../game/types';
import { Cell, type CellState } from './Cell';
import styles from './Board.module.css';

const COLUMN_LABELS = 'ABCDEFGHIJ'.split('');

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
          onCellKeyDown={onCellKeyDown}
        />
      ))}
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
