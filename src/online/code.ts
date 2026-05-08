/**
 * Client-side helpers for normalizing and validating room codes typed by the
 * user. Mirrors the alphabet/length defined in `server/src/code.ts`.
 */

export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ROOM_CODE_LENGTH = 8;

export function normalizeRoomCode(s: string): string {
  return s.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidRoomCode(s: string): boolean {
  if (s.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of s) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
