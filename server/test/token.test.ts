import { describe, expect, it } from 'vitest';
import {
  generateSeatToken,
  hashToken,
  timingSafeEqual,
  verifyToken,
} from '../src/token';

describe('seat tokens', () => {
  it('generateSeatToken returns base64url-safe characters', () => {
    for (let i = 0; i < 50; i++) {
      const tok = generateSeatToken();
      expect(tok.length).toBeGreaterThan(20);
      expect(/^[A-Za-z0-9_-]+$/.test(tok)).toBe(true);
    }
  });

  it('two random tokens essentially never collide', () => {
    const a = generateSeatToken();
    const b = generateSeatToken();
    expect(a).not.toBe(b);
  });

  it('hashToken is deterministic and 64 hex chars (SHA-256)', async () => {
    const tok = 'abc-123';
    const h1 = await hashToken(tok);
    const h2 = await hashToken(tok);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifyToken accepts the matching token and rejects mismatches', async () => {
    const tok = generateSeatToken();
    const hash = await hashToken(tok);
    expect(await verifyToken(tok, hash)).toBe(true);
    expect(await verifyToken(tok + 'x', hash)).toBe(false);
    expect(await verifyToken('totally-different', hash)).toBe(false);
  });

  it('timingSafeEqual is a strict string-equality predicate', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});
