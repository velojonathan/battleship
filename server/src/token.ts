/**
 * Seat tokens.
 *
 * The token is opaque to the client: 32 random bytes encoded as base64url,
 * stored in `sessionStorage`. The server NEVER stores the raw token — only
 * the SHA-256 hex digest. A token leak is therefore valid only until the
 * room expires, and a database leak alone cannot impersonate a player.
 */

/** ~256 bits of entropy; well in excess of the 30-char alphabet of room codes. */
const TOKEN_BYTES = 32;

/** base64url with no padding, matching the WebCrypto convention. */
function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateSeatToken(
  rng: { getRandomValues: (b: Uint8Array) => Uint8Array } = crypto,
): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  rng.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** Hex SHA-256 of the token. Stored in DO storage; safe to log only when comparing. */
export async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(token));
  const arr = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Constant-time string comparison.
 *
 * Equal-length comparison runs an XOR over the entire string. Different
 * lengths short-circuit only AFTER reading both fully (so the timing leak is
 * the much smaller "len(a) === len(b)?" not "where do they differ?").
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still scan the longer one to keep timing closer to equal-length
    // comparisons. The boolean is determined entirely by the length check.
    let dummy = 0;
    const longer = a.length > b.length ? a : b;
    for (let i = 0; i < longer.length; i++) dummy |= longer.charCodeAt(i);
    void dummy;
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Compare a candidate token against a stored hex digest in constant time. */
export async function verifyToken(candidate: string, storedHash: string): Promise<boolean> {
  const candidateHash = await hashToken(candidate);
  return timingSafeEqual(candidateHash, storedHash);
}
