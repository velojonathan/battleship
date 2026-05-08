/**
 * Wire protocol for Online 2P Lite (PR1).
 *
 * This file is the single source of truth for client/server message shapes.
 * It is intentionally framework-free — no React, no Cloudflare imports —
 * so the same module can be consumed by both the Worker (server/) and the
 * frontend (src/).
 *
 * PR1 scope: room create / join / reconnect, basic lobby snapshot. NO ship
 * placement, NO firing shots, NO chat. Those land in PR2+.
 */

export type SeatId = 'p1' | 'p2';

export type RoomStatus = 'lobby';
// Future statuses: 'placement' | 'in-progress' | 'game-over' (PR2+).

export type ConnState = 'connected' | 'disconnected';

export interface SeatSnapshot {
  seat: SeatId;
  /** Empty string if not yet set. Sanitized server-side. */
  displayName: string;
  conn: ConnState;
}

/**
 * The lobby-only snapshot the server broadcasts to each client.
 * Per-recipient: contains only `localSeat` for the authenticated socket;
 * never contains tokens or game state.
 */
export interface LobbySnapshot {
  type: 'roomSnapshot';
  status: RoomStatus;
  code: string;
  localSeat: SeatId;
  seats: { p1: SeatSnapshot | null; p2: SeatSnapshot | null };
  createdAt: number;
}

/** Confirmation sent to a brand-new joiner with their seat assignment + token. */
export interface PlayerAssigned {
  type: 'playerAssigned';
  seat: SeatId;
  /** Opaque token. Persist in sessionStorage; never log. */
  token: string;
}

export interface OpponentJoined {
  type: 'opponentJoined';
  seat: SeatId;
  displayName: string;
}

export interface OpponentLeft {
  type: 'opponentLeft';
  seat: SeatId;
}

export interface ConnectionChanged {
  type: 'connectionChanged';
  seat: SeatId;
  conn: ConnState;
}

export type ServerErrorCode =
  | 'invalid-message'
  | 'room-not-found'
  | 'room-full'
  | 'invalid-token'
  | 'rate-limited'
  | 'illegal-action';

export interface ServerError {
  type: 'error';
  code: ServerErrorCode;
  /**
   * Short human-readable hint. SHOULD NOT contain server internals.
   */
  message: string;
}

export type ServerMessage =
  | LobbySnapshot
  | PlayerAssigned
  | OpponentJoined
  | OpponentLeft
  | ConnectionChanged
  | ServerError;

/** Sent by host immediately after POST /room. Tied to the seat token from the response. */
export interface ClientHello {
  type: 'hello';
  /** Existing seat assignment from POST /room. */
  seat: SeatId;
  /** Token returned by POST /room. */
  token: string;
  /** Optional display name; defaults to "Player 1" / "Player 2". */
  name?: string;
}

/** Sent by joiner. Server assigns p2 (or rejects with room-full). */
export interface ClientJoin {
  type: 'join';
  /** Optional display name; defaults to "Player 2". */
  name?: string;
}

/** Sent by either player on refresh / reconnect with a previously issued token. */
export interface ClientReconnect {
  type: 'reconnect';
  seat: SeatId;
  token: string;
}

/** Voluntary leave; the server tears the seat down and notifies the opponent. */
export interface ClientLeave {
  type: 'leave';
}

export type ClientMessage =
  | ClientHello
  | ClientJoin
  | ClientReconnect
  | ClientLeave;

/** Response shape for POST /room. */
export interface CreateRoomResponse {
  code: string;
  seat: SeatId;
  token: string;
}

/** Defaults applied when no name is provided. */
export const DEFAULT_NAMES: Record<SeatId, string> = {
  p1: 'Player 1',
  p2: 'Player 2',
};

/** Display names are clamped to this length after trimming. */
export const NAME_MAX_LEN = 20;

/**
 * Parse + validate an inbound client message. Returns `null` for any malformed
 * input — callers should silently drop and never echo back parse errors (to
 * avoid amplifying probing).
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const t = obj['type'];
  if (typeof t !== 'string') return null;

  switch (t) {
    case 'hello': {
      const seat = obj['seat'];
      const token = obj['token'];
      if (seat !== 'p1' && seat !== 'p2') return null;
      if (typeof token !== 'string' || token.length === 0) return null;
      const name = typeof obj['name'] === 'string' ? obj['name'] : undefined;
      const out: ClientHello = { type: 'hello', seat, token };
      if (name !== undefined) out.name = name;
      return out;
    }
    case 'join': {
      const name = typeof obj['name'] === 'string' ? obj['name'] : undefined;
      const out: ClientJoin = { type: 'join' };
      if (name !== undefined) out.name = name;
      return out;
    }
    case 'reconnect': {
      const seat = obj['seat'];
      const token = obj['token'];
      if (seat !== 'p1' && seat !== 'p2') return null;
      if (typeof token !== 'string' || token.length === 0) return null;
      return { type: 'reconnect', seat, token };
    }
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}

/**
 * Sanitize a display name: trim, clamp to NAME_MAX_LEN, strip control chars
 * (including newlines), HTML-unsafe characters are KEPT here — escaping is
 * the renderer's responsibility on the client. We only ensure the name is a
 * single-line plain string.
 */
export function sanitizeName(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  // Strip C0 control + DEL via codepoint scan (eslint no-control-regex compatible).
  let stripped = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    stripped += ch;
  }
  const trimmed = stripped.trim().slice(0, NAME_MAX_LEN);
  return trimmed.length > 0 ? trimmed : fallback;
}
