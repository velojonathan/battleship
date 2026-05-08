import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  isValidRoomCode,
  normalizeRoomCode,
} from '../../src/online/code';

describe('online room code helpers', () => {
  it('alphabet excludes visually ambiguous characters', () => {
    for (const ch of ['I', 'L', 'O', 'U', '0', '1']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    }
    expect(ROOM_CODE_LENGTH).toBe(8);
  });

  it('isValidRoomCode rejects wrong length / unknown chars / case', () => {
    expect(isValidRoomCode('ABCDEFGH')).toBe(true);
    expect(isValidRoomCode('ABCDEFG')).toBe(false);
    expect(isValidRoomCode('ABCDEFGHI')).toBe(false);
    expect(isValidRoomCode('ABCDEFG0')).toBe(false);
    expect(isValidRoomCode('abcdefgh')).toBe(false);
    expect(isValidRoomCode('!@#$%^&*')).toBe(false);
  });

  it('normalizeRoomCode strips whitespace + dashes and uppercases', () => {
    expect(normalizeRoomCode('ab-cd-ef-gh')).toBe('ABCDEFGH');
    expect(normalizeRoomCode('  AbCdEfGh  ')).toBe('ABCDEFGH');
    expect(normalizeRoomCode('AB CD EFGH')).toBe('ABCDEFGH');
  });
});
