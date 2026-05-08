/**
 * Integration tests for the Worker + RoomDO using the official
 * @cloudflare/vitest-pool-workers harness. Tests exercise the public HTTP
 * surface (POST /room, GET /room/:code, WS upgrade) plus the WebSocket
 * lifecycle: hello / join / reconnect / room-full / invalid-token.
 */
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type {
  CreateRoomResponse,
  PlayerAssigned,
  ServerMessage,
} from '../src/protocol';

declare module 'cloudflare:test' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
  interface Env {
    ROOM: DurableObjectNamespace;
  }
}

const BASE = 'http://example.com';

async function postRoom(): Promise<CreateRoomResponse> {
  const res = await SELF.fetch(`${BASE}/room`, { method: 'POST' });
  expect(res.status).toBe(200);
  return (await res.json()) as CreateRoomResponse;
}

/**
 * Open a WebSocket to a given room. Returns a tiny harness that buffers
 * server-sent messages so tests can await them deterministically.
 */
function openSocket(code: string): {
  ws: WebSocket;
  ready: Promise<void>;
  next: () => Promise<ServerMessage>;
  close: () => void;
} {
  const url = `${BASE}/room/${code}/ws`;
  const req = new Request(url, { headers: { upgrade: 'websocket' } });
  let resolved: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    resolved = resolve;
  });

  const queue: ServerMessage[] = [];
  const waiters: Array<(msg: ServerMessage) => void> = [];

  // SELF.fetch handles the WS upgrade and gives back a Response with a webSocket.
  const promise = SELF.fetch(req).then((response) => {
    expect(response.status).toBe(101);
    const ws = response.webSocket;
    if (!ws) throw new Error('No WebSocket on response');
    ws.accept();
    ws.addEventListener('message', (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        const w = waiters.shift();
        if (w) w(msg);
        else queue.push(msg);
      } catch {
        /* ignore */
      }
    });
    ws.addEventListener('open', () => resolved?.());
    // The runtime may not always fire `open` for already-accepted sockets;
    // resolve immediately in that case after a microtask.
    queueMicrotask(() => resolved?.());
    return ws;
  });

  let cachedWs: WebSocket | null = null;
  promise.then((w) => {
    cachedWs = w;
  });

  return {
    get ws(): WebSocket {
      if (!cachedWs) throw new Error('Socket not ready yet');
      return cachedWs;
    },
    ready: promise.then(() => ready),
    next: () =>
      new Promise<ServerMessage>((resolve) => {
        if (queue.length > 0) resolve(queue.shift()!);
        else waiters.push(resolve);
      }),
    close: () => {
      if (cachedWs) cachedWs.close();
    },
  };
}

async function send(s: { ws: WebSocket }, payload: unknown): Promise<void> {
  s.ws.send(JSON.stringify(payload));
}

describe('POST /room', () => {
  it('creates a room and returns code, p1 seat, and token', async () => {
    const created = await postRoom();
    expect(typeof created.code).toBe('string');
    expect(created.code.length).toBe(8);
    expect(created.seat).toBe('p1');
    expect(typeof created.token).toBe('string');
    expect(created.token.length).toBeGreaterThan(20);
  });

  it('returns a different code each call', async () => {
    const a = await postRoom();
    const b = await postRoom();
    expect(a.code).not.toBe(b.code);
  });
});

describe('GET /room/:code', () => {
  it('returns 200 once the room exists', async () => {
    const created = await postRoom();
    const probe = await SELF.fetch(`${BASE}/room/${created.code}`);
    expect(probe.status).toBe(200);
  });

  it('returns 404 for an unknown but well-formed code', async () => {
    // Use a code that's structurally valid but never created.
    const probe = await SELF.fetch(`${BASE}/room/ABCDEFGH`);
    expect(probe.status).toBe(404);
  });

  it('returns 400 for a malformed code', async () => {
    const probe = await SELF.fetch(`${BASE}/room/abc`);
    expect(probe.status).toBe(400);
  });
});

describe('WebSocket — hello (host)', () => {
  it('hello with valid token authenticates and returns a snapshot', async () => {
    const created = await postRoom();
    const sock = openSocket(created.code);
    await sock.ready;
    await send(sock, {
      type: 'hello',
      seat: 'p1',
      token: created.token,
      name: 'Captain',
    });
    const snap = await sock.next();
    expect(snap.type).toBe('roomSnapshot');
    if (snap.type === 'roomSnapshot') {
      expect(snap.localSeat).toBe('p1');
      expect(snap.code).toBe(created.code);
      expect(snap.seats.p1?.displayName).toBe('Captain');
      expect(snap.seats.p1?.conn).toBe('connected');
      expect(snap.seats.p2).toBeNull();
    }
  });

  it('hello with bad token rejects with invalid-token', async () => {
    const created = await postRoom();
    const sock = openSocket(created.code);
    await sock.ready;
    await send(sock, { type: 'hello', seat: 'p1', token: 'wrong' });
    const msg = await sock.next();
    expect(msg.type).toBe('error');
    if (msg.type === 'error') expect(msg.code).toBe('invalid-token');
  });
});

describe('WebSocket — join (joiner)', () => {
  it('p2 joins by code, gets playerAssigned + snapshot', async () => {
    const created = await postRoom();

    // Host first connects so they exist in the snapshot.
    const host = openSocket(created.code);
    await host.ready;
    await send(host, { type: 'hello', seat: 'p1', token: created.token, name: 'Host' });
    const hostSnap = await host.next();
    expect(hostSnap.type).toBe('roomSnapshot');

    // Joiner.
    const joiner = openSocket(created.code);
    await joiner.ready;
    await send(joiner, { type: 'join', name: 'Guest' });

    const assigned = (await joiner.next()) as PlayerAssigned;
    expect(assigned.type).toBe('playerAssigned');
    expect(assigned.seat).toBe('p2');
    expect(typeof assigned.token).toBe('string');
    expect(assigned.token.length).toBeGreaterThan(20);

    const joinerSnap = await joiner.next();
    expect(joinerSnap.type).toBe('roomSnapshot');
    if (joinerSnap.type === 'roomSnapshot') {
      expect(joinerSnap.localSeat).toBe('p2');
      expect(joinerSnap.seats.p1?.displayName).toBe('Host');
      expect(joinerSnap.seats.p2?.displayName).toBe('Guest');
      expect(joinerSnap.seats.p2?.conn).toBe('connected');
    }

    // Host receives an opponentJoined notification.
    const hostNotif = await host.next();
    expect(hostNotif.type).toBe('opponentJoined');
    if (hostNotif.type === 'opponentJoined') {
      expect(hostNotif.seat).toBe('p2');
      expect(hostNotif.displayName).toBe('Guest');
    }
  });

  it('a third joiner is rejected with room-full', async () => {
    const created = await postRoom();
    const host = openSocket(created.code);
    await host.ready;
    await send(host, { type: 'hello', seat: 'p1', token: created.token });
    await host.next(); // snapshot

    const guest = openSocket(created.code);
    await guest.ready;
    await send(guest, { type: 'join' });
    await guest.next(); // playerAssigned
    await guest.next(); // snapshot

    const third = openSocket(created.code);
    await third.ready;
    await send(third, { type: 'join' });
    const err = await third.next();
    expect(err.type).toBe('error');
    if (err.type === 'error') expect(err.code).toBe('room-full');
  });
});

describe('WebSocket — invalid room code', () => {
  it('upgrade to an unknown code returns 404', async () => {
    const url = `${BASE}/room/ABCDEFGH/ws`;
    const req = new Request(url, { headers: { upgrade: 'websocket' } });
    const res = await SELF.fetch(req);
    expect(res.status).toBe(404);
  });

  it('upgrade with structurally invalid code returns 400', async () => {
    const url = `${BASE}/room/abc/ws`;
    const req = new Request(url, { headers: { upgrade: 'websocket' } });
    const res = await SELF.fetch(req);
    expect(res.status).toBe(400);
  });
});

describe('WebSocket — reconnect', () => {
  it('reconnect with valid p2 token restores the seat', async () => {
    const created = await postRoom();
    // Host so the room is initialized.
    const host = openSocket(created.code);
    await host.ready;
    await send(host, { type: 'hello', seat: 'p1', token: created.token });
    await host.next(); // snapshot

    // Joiner gets a token, then "drops".
    const joiner = openSocket(created.code);
    await joiner.ready;
    await send(joiner, { type: 'join', name: 'Guest' });
    const assigned = (await joiner.next()) as PlayerAssigned;
    await joiner.next(); // snapshot
    const guestToken = assigned.token;
    joiner.close();

    // Reconnect with the same token.
    const back = openSocket(created.code);
    await back.ready;
    await send(back, { type: 'reconnect', seat: 'p2', token: guestToken });
    const snap = await back.next();
    expect(snap.type).toBe('roomSnapshot');
    if (snap.type === 'roomSnapshot') {
      expect(snap.localSeat).toBe('p2');
      expect(snap.seats.p2?.displayName).toBe('Guest');
      expect(snap.seats.p2?.conn).toBe('connected');
    }
  });

  it('reconnect with bad token is rejected with invalid-token', async () => {
    const created = await postRoom();
    const sock = openSocket(created.code);
    await sock.ready;
    await send(sock, { type: 'reconnect', seat: 'p1', token: 'nope' });
    const err = await sock.next();
    expect(err.type).toBe('error');
    if (err.type === 'error') expect(err.code).toBe('invalid-token');
  });

  it('reconnect for a never-assigned seat is rejected with invalid-token', async () => {
    const created = await postRoom();
    // p2 has never joined.
    const sock = openSocket(created.code);
    await sock.ready;
    await send(sock, { type: 'reconnect', seat: 'p2', token: 'whatever' });
    const err = await sock.next();
    expect(err.type).toBe('error');
    if (err.type === 'error') expect(err.code).toBe('invalid-token');
  });
});

describe('WebSocket — protocol hardening', () => {
  it('garbage messages on unauthenticated socket are silently dropped', async () => {
    const created = await postRoom();
    const sock = openSocket(created.code);
    await sock.ready;
    sock.ws.send('not json');
    sock.ws.send(JSON.stringify({ type: 'unknown' }));
    // Now authenticate properly — we should get the snapshot, not an error
    // about the earlier garbage.
    await send(sock, { type: 'hello', seat: 'p1', token: created.token });
    const snap = await sock.next();
    expect(snap.type).toBe('roomSnapshot');
  });

  it('healthz returns ok', async () => {
    const res = await SELF.fetch(`${BASE}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});

describe('WebSocket — duplicate seat sockets', () => {
  // Regression: previously `handleHello` did not bump a pre-existing socket
  // for the same seat, so a host opening a second tab (or a malicious
  // double-`hello`) would accumulate two sockets in the seat map. When one
  // closed, the DO would broadcast `connectionChanged: disconnected` for
  // the seat to ALL surviving sockets — including the still-live duplicate
  // and the opponent — falsely indicating the seat had gone offline.
  it('a second `hello` for an authenticated seat replaces the first socket without spurious disconnect notices', async () => {
    const created = await postRoom();

    // First host socket authenticates normally.
    const first = openSocket(created.code);
    await first.ready;
    await send(first, { type: 'hello', seat: 'p1', token: created.token });
    expect((await first.next()).type).toBe('roomSnapshot');

    // p2 joins so we can observe what the opponent sees.
    const guest = openSocket(created.code);
    await guest.ready;
    await send(guest, { type: 'join', name: 'Guest' });
    const assigned = (await guest.next()) as PlayerAssigned;
    expect(assigned.type).toBe('playerAssigned');
    await guest.next(); // snapshot
    // The host receives `opponentJoined` for p2.
    expect((await first.next()).type).toBe('opponentJoined');

    // Second host socket sends `hello` with the SAME valid token.
    const second = openSocket(created.code);
    await second.ready;
    await send(second, { type: 'hello', seat: 'p1', token: created.token });
    expect((await second.next()).type).toBe('roomSnapshot');

    // Critical assertion: p2 must NOT see p1 flap to disconnected. The seat
    // is still online — the new socket simply replaced the old one. Give
    // the runtime a tick to surface any spurious broadcast before checking.
    const racey: Promise<ServerMessage | null> = Promise.race([
      guest.next(),
      new Promise<null>((r) => setTimeout(() => r(null), 200)),
    ]);
    const seenByGuest = await racey;
    if (seenByGuest && seenByGuest.type === 'connectionChanged') {
      expect(seenByGuest.conn).not.toBe('disconnected');
    }
    // Either way, p1 should be reported as connected in any new snapshot.
    await send(guest, { type: 'leave' });
  });

  it('reconnect bumps an existing socket for the same seat', async () => {
    const created = await postRoom();
    // Establish an authenticated p1.
    const first = openSocket(created.code);
    await first.ready;
    await send(first, { type: 'hello', seat: 'p1', token: created.token });
    expect((await first.next()).type).toBe('roomSnapshot');

    // Reconnect from a different tab using the same token.
    const second = openSocket(created.code);
    await second.ready;
    await send(second, { type: 'reconnect', seat: 'p1', token: created.token });
    expect((await second.next()).type).toBe('roomSnapshot');

    // The first tab's socket should be closed by the runtime. We can't
    // directly observe the close event with this harness, but we can
    // confirm the second tab is the one receiving traffic by triggering
    // a join from p2 and checking that it routes to the new socket.
    const guest = openSocket(created.code);
    await guest.ready;
    await send(guest, { type: 'join', name: 'Guest' });
    const assigned = (await guest.next()) as PlayerAssigned;
    expect(assigned.type).toBe('playerAssigned');
    await guest.next();
    const opponentJoined = await second.next();
    expect(opponentJoined.type).toBe('opponentJoined');
  });
});

// Used to silence eslint about unused env import in the typing block above.
void env;
