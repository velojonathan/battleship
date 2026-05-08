import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '../src/code';

describe('room code', () => {
  it('alphabet excludes visually ambiguous characters', () => {
    for (const ch of ['I', 'L', 'O', 'U', '0', '1']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    }
  });

  it('generates codes of fixed length using only the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code.length).toBe(ROOM_CODE_LENGTH);
      for (const ch of code) {
        expect(ROOM_CODE_ALPHABET.includes(ch)).toBe(true);
      }
    }
  });

  it('isValidRoomCode rejects wrong length and unknown chars', () => {
    expect(isValidRoomCode('ABCDEFGH')).toBe(true);
    expect(isValidRoomCode('ABCDEFG')).toBe(false);
    expect(isValidRoomCode('ABCDEFGHI')).toBe(false);
    expect(isValidRoomCode('ABCDEFG0')).toBe(false); // 0 excluded
    expect(isValidRoomCode('abcdefgh')).toBe(false); // lowercase
    expect(isValidRoomCode('ABCDEFG?')).toBe(false);
  });

  it('normalizeRoomCode uppercases and strips whitespace and dashes', () => {
    expect(normalizeRoomCode('ab-cd-ef-gh')).toBe('ABCDEFGH');
    expect(normalizeRoomCode('  AbCdEfGh  ')).toBe('ABCDEFGH');
    expect(normalizeRoomCode('AB CD EFGH')).toBe('ABCDEFGH');
  });

  it('reasonable distribution: 200 codes share <50% same first char', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const c = generateRoomCode().charAt(0);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const v of counts.values()) {
      expect(v).toBeLessThan(100);
    }
  });
});
