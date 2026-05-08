/**
 * sessionStorage helpers for the seat token.
 *
 * IMPORTANT: this module deliberately does NOT use localStorage — per the
 * Online 2P Lite scope, the seat token is ephemeral and dies with the tab.
 * On refresh (same tab) the value survives and lets us reconnect; on a fresh
 * tab the user is treated as a brand-new joiner.
 */
import type { SeatId } from './protocol';

const KEY = 'battleship:online-session';

export interface OnlineSession {
  code: string;
  seat: SeatId;
  token: string;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    // Safari with sandbox restrictions can throw on access. Treat as
    // unavailable; the lobby still works, just without reconnect.
    return null;
  }
}

export function loadSession(): OnlineSession | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnlineSession>;
    if (
      parsed &&
      typeof parsed.code === 'string' &&
      (parsed.seat === 'p1' || parsed.seat === 'p2') &&
      typeof parsed.token === 'string' &&
      parsed.code.length > 0 &&
      parsed.token.length > 0
    ) {
      return { code: parsed.code, seat: parsed.seat, token: parsed.token };
    }
  } catch {
    /* fall through to clear */
  }
  storage.removeItem(KEY);
  return null;
}

export function saveSession(session: OnlineSession): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* quota or sandbox; nothing to do */
  }
}

export function clearSession(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
