import { describe, expect, it } from 'vitest';
import { mulberry32, pickInt, pickOne, shuffle } from '../../src/game/rng';

describe('mulberry32', () => {
  it('is deterministic given the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });
  it('produces values in [0,1)', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('rng helpers', () => {
  it('pickInt returns integers in [0,max)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = pickInt(rng, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });
  it('pickOne picks an element', () => {
    const rng = mulberry32(11);
    const arr = [1, 2, 3, 4];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pickOne(rng, arr));
    }
  });
  it('pickOne throws on empty array', () => {
    expect(() => pickOne(mulberry32(0), [])).toThrow();
  });
  it('shuffle returns a permutation', () => {
    const rng = mulberry32(3);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffle(rng, arr);
    expect(out.slice().sort((a, b) => a - b)).toEqual(arr);
  });
});
