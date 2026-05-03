import { BOARD_SIZE } from './constants';
import type { Coord, Orientation } from './types';

export const COL_LETTERS = 'ABCDEFGHIJ';

export function inBounds(coord: Coord, size: number = BOARD_SIZE): boolean {
  return (
    Number.isInteger(coord.row) &&
    Number.isInteger(coord.col) &&
    coord.row >= 0 &&
    coord.row < size &&
    coord.col >= 0 &&
    coord.col < size
  );
}

export function coordKey(coord: Coord): string {
  return `${coord.row},${coord.col}`;
}

export function coordsEqual(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

export function formatCoord(coord: Coord, size: number = BOARD_SIZE): string {
  if (!inBounds(coord, size)) {
    throw new Error(`Out-of-bounds coord: ${coord.row},${coord.col}`);
  }
  return `${COL_LETTERS[coord.col]}${coord.row + 1}`;
}

const COORD_LABEL_RE = /^([A-J])(\d{1,2})$/i;

export function parseCoord(label: string): Coord {
  const m = COORD_LABEL_RE.exec(label.trim());
  if (!m) throw new Error(`Invalid coord label: ${label}`);
  const colChar = m[1].toUpperCase();
  const col = COL_LETTERS.indexOf(colChar);
  const row = parseInt(m[2], 10) - 1;
  const c: Coord = { row, col };
  if (!inBounds(c)) throw new Error(`Out-of-bounds coord: ${label}`);
  return c;
}

export function shipFootprint(
  origin: Coord,
  length: number,
  orientation: Orientation,
): Coord[] {
  const cells: Coord[] = [];
  for (let i = 0; i < length; i++) {
    cells.push(
      orientation === 'H'
        ? { row: origin.row, col: origin.col + i }
        : { row: origin.row + i, col: origin.col },
    );
  }
  return cells;
}

export function neighbors4(coord: Coord, size: number = BOARD_SIZE): Coord[] {
  return [
    { row: coord.row - 1, col: coord.col },
    { row: coord.row + 1, col: coord.col },
    { row: coord.row, col: coord.col - 1 },
    { row: coord.row, col: coord.col + 1 },
  ].filter((c) => inBounds(c, size));
}
