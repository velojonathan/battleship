import { describe, expect, it } from 'vitest';
import {
  coordKey,
  coordsEqual,
  formatCoord,
  inBounds,
  neighbors4,
  parseCoord,
  shipFootprint,
} from '../../src/game/coordinates';

describe('coordinates / inBounds', () => {
  it('accepts cells inside a 10x10 grid', () => {
    expect(inBounds({ row: 0, col: 0 })).toBe(true);
    expect(inBounds({ row: 9, col: 9 })).toBe(true);
    expect(inBounds({ row: 4, col: 7 })).toBe(true);
  });
  it('rejects cells outside the grid', () => {
    expect(inBounds({ row: -1, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: -1 })).toBe(false);
    expect(inBounds({ row: 10, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: 10 })).toBe(false);
  });
  it('rejects non-integer coordinates', () => {
    expect(inBounds({ row: 1.5, col: 0 })).toBe(false);
    expect(inBounds({ row: NaN, col: 0 })).toBe(false);
  });
});

describe('coordinates / parseCoord & formatCoord', () => {
  it('round-trips A1 to J10', () => {
    const labels = ['A1', 'A10', 'B5', 'J1', 'J10'];
    for (const l of labels) {
      expect(formatCoord(parseCoord(l))).toBe(l);
    }
  });
  it('lowercase and whitespace tolerant', () => {
    expect(formatCoord(parseCoord('  c7  '))).toBe('C7');
  });
  it('rejects garbage', () => {
    expect(() => parseCoord('K1')).toThrow();
    expect(() => parseCoord('A0')).toThrow();
    expect(() => parseCoord('A11')).toThrow();
    expect(() => parseCoord('foo')).toThrow();
  });

  it('formatCoord throws on out-of-bounds coords', () => {
    expect(() => formatCoord({ row: -1, col: 0 })).toThrow();
    expect(() => formatCoord({ row: 0, col: 10 })).toThrow();
  });
});

describe('coordinates / helpers', () => {
  it('coordKey is unique per cell', () => {
    expect(coordKey({ row: 1, col: 2 })).toBe('1,2');
  });
  it('coordsEqual is correct', () => {
    expect(coordsEqual({ row: 1, col: 2 }, { row: 1, col: 2 })).toBe(true);
    expect(coordsEqual({ row: 1, col: 2 }, { row: 2, col: 1 })).toBe(false);
  });
  it('shipFootprint H/V is correct', () => {
    expect(shipFootprint({ row: 0, col: 0 }, 3, 'H')).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
    expect(shipFootprint({ row: 0, col: 0 }, 3, 'V')).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ]);
  });
  it('neighbors4 stays in bounds', () => {
    expect(neighbors4({ row: 0, col: 0 })).toEqual([
      { row: 1, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(neighbors4({ row: 5, col: 5 })).toHaveLength(4);
  });
});
