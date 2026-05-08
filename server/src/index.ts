/**
 * Worker entrypoint for Online 2P Lite.
 *
 * Routes:
 *   POST /room                  → create a new room, return { code, seat: 'p1', token }
 *   GET  /room/:code            → 200 if room exists, 404 otherwise (cheap probe)
 *   GET  /room/:code/ws         → upgrade to WebSocket, forward to RoomDO
 *   GET  /healthz               → 200 OK (for uptime monitoring)
 *
 * CORS is permissive (`*`) because the static frontend may live on a separate
 * origin (Cloudflare Pages) and we don't authenticate via cookies — only via
 * tokens passed inside WebSocket messages.
 */

import type { Env } from './env';
import type { CreateRoomResponse } from './protocol';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from './code';

export { RoomDO } from './room';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function plainResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

const MAX_CREATE_RETRIES = 5;

async function createRoom(env: Env): Promise<CreateRoomResponse | null> {
  for (let attempt = 0; attempt < MAX_CREATE_RETRIES; attempt++) {
    const code = generateRoomCode();
    const id = env.ROOM.idFromName(code);
    const stub = env.ROOM.get(id);
    const result = await stub.initRoom(code);
    if (result === 'collision') continue;
    return { code, seat: 'p1', token: result.token };
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/healthz') {
      return plainResponse('ok');
    }

    if (url.pathname === '/room' && method === 'POST') {
      const result = await createRoom(env);
      if (!result) {
        return jsonResponse({ error: 'could-not-allocate-code' }, 503);
      }
      return jsonResponse(result satisfies CreateRoomResponse);
    }

    // /room/:code or /room/:code/ws
    const roomMatch = url.pathname.match(/^\/room\/([^/]+)(?:\/(ws))?$/);
    if (roomMatch) {
      const rawCode = decodeURIComponent(roomMatch[1] ?? '');
      const isWs = roomMatch[2] === 'ws';
      const code = normalizeRoomCode(rawCode);
      if (!isValidRoomCode(code)) {
        return jsonResponse({ error: 'invalid-code' }, 400);
      }
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);

      if (isWs) {
        if (request.headers.get('upgrade') !== 'websocket') {
          return plainResponse('Expected WebSocket upgrade', 426);
        }
        // Reject upgrades to unknown rooms BEFORE proxying to the DO so the
        // client gets a clean HTTP response instead of a half-opened socket.
        if (!(await stub.exists())) {
          return jsonResponse({ error: 'room-not-found' }, 404);
        }
        return stub.fetch(request);
      }

      // GET /room/:code — cheap exists probe.
      if (method === 'GET') {
        const exists = await stub.exists();
        return exists
          ? jsonResponse({ code, exists: true })
          : jsonResponse({ error: 'room-not-found' }, 404);
      }
      return plainResponse('Method not allowed', 405);
    }

    return plainResponse('Not found', 404);
  },
} satisfies ExportedHandler<Env>;
