/**
 * Thin HTTP wrapper over the Worker. Only `createRoom` lives here; WebSocket
 * lifecycle is in `useNetClient.ts`.
 */
import { ONLINE_HTTP_URL } from './config';
import type { CreateRoomResponse } from './protocol';

export type CreateRoomFailure =
  | 'unavailable' // VITE_WS_URL missing
  | 'unreachable' // network/DNS/CORS error
  | 'server-error'; // 5xx or unparseable response

export type CreateRoomResult =
  | { ok: true; data: CreateRoomResponse }
  | { ok: false; reason: CreateRoomFailure };

export async function createRoom(): Promise<CreateRoomResult> {
  if (!ONLINE_HTTP_URL) return { ok: false, reason: 'unavailable' };
  let res: Response;
  try {
    res = await fetch(`${ONLINE_HTTP_URL}/room`, { method: 'POST' });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!res.ok) return { ok: false, reason: 'server-error' };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: 'server-error' };
  }
  if (!isCreateRoomResponse(data)) return { ok: false, reason: 'server-error' };
  return { ok: true, data };
}

export type RoomExistsResult =
  | { ok: true; exists: boolean }
  | { ok: false; reason: 'unavailable' | 'unreachable' };

export async function roomExists(code: string): Promise<RoomExistsResult> {
  if (!ONLINE_HTTP_URL) return { ok: false, reason: 'unavailable' };
  let res: Response;
  try {
    res = await fetch(`${ONLINE_HTTP_URL}/room/${encodeURIComponent(code)}`);
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (res.status === 200) return { ok: true, exists: true };
  if (res.status === 404) return { ok: true, exists: false };
  return { ok: false, reason: 'unreachable' };
}

function isCreateRoomResponse(d: unknown): d is CreateRoomResponse {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  return (
    typeof o.code === 'string' &&
    (o.seat === 'p1' || o.seat === 'p2') &&
    typeof o.token === 'string'
  );
}
