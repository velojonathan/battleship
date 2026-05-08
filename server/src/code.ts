/**
 * 8-character room codes using a Crockford-inspired alphabet.
 *
 * The alphabet excludes visually ambiguous characters (I, L, O, 0, 1) AND
 * also U (commonly excluded to avoid accidental profanity). 30 characters
 * × 8 positions = ~39 bits of entropy, more than enough for "lite" rooms
 * even with thousands of concurrent codes.
 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ROOM_CODE_LENGTH = 8;

/**
 * Generate a fresh room code using the Web Crypto API. We use rejection
 * sampling on a single byte per character to avoid modulo bias against the
 * 30-character alphabet.
 */
export function generateRoomCode(
  rng: { getRandomValues: (b: Uint8Array) => Uint8Array } = crypto,
): string {
  const N = ROOM_CODE_ALPHABET.length;
  // Largest multiple of N that fits in a byte: floor(256 / 30) * 30 = 240.
  // Bytes ≥ threshold are rejected to avoid bias.
  const threshold = Math.floor(256 / N) * N;
  let out = '';
  // We over-allocate so a few rejections don't force a second syscall.
  const buf = new Uint8Array(ROOM_CODE_LENGTH * 2);
  let i = 0;
  while (out.length < ROOM_CODE_LENGTH) {
    if (i >= buf.length) {
      rng.getRandomValues(buf);
      i = 0;
    } else if (i === 0) {
      rng.getRandomValues(buf);
    }
    const byte = buf[i++]!;
    if (byte >= threshold) continue;
    out += ROOM_CODE_ALPHABET[byte % N];
  }
  return out;
}

/**
 * Cheap structural check: 8 chars, all from the alphabet.
 *
 * NOTE: this rejects lowercase, so callers should uppercase user input first.
 */
export function isValidRoomCode(s: string): boolean {
  if (s.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of s) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/**
 * Normalize a user-typed code: uppercase, strip whitespace and dashes (so
 * "abc-defg-h" still works as an invite-link param).
 */
export function normalizeRoomCode(s: string): string {
  return s.replace(/[\s-]/g, '').toUpperCase();
}
