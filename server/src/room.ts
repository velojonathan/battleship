/**
 * RoomDO — one Durable Object per Battleship online room.
 *
 * Responsibilities (PR1):
 *   - Hold seat assignments (p1, p2) and per-seat token hashes.
 *   - Accept WebSocket connections from authenticated clients (host arrives
 *     after POST /room with a `hello` envelope; joiner sends `join`; either
 *     reconnects with `reconnect`).
 *   - Broadcast a per-seat lobby snapshot whenever assignments change.
 *
 * NOT in PR1:
 *   - Ship placement, fire shots, turn sync, game-over, rematch.
 *   - Chat.
 *   - DO setInterval heartbeat. We rely on the hibernation auto-response API
 *     (`ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(...))`)
 *     so heartbeats DO NOT wake the DO.
 *
 * The DO is SQLite-backed (see `new_sqlite_classes` in wrangler.toml). We use
 * the key/value Storage API on top of it — sufficient for PR1's tiny state.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  type ClientMessage,
  type ConnState,
  type LobbySnapshot,
  type SeatId,
  type SeatSnapshot,
  type ServerErrorCode,
  type ServerMessage,
  DEFAULT_NAMES,
  parseClientMessage,
  sanitizeName,
} from './protocol';
import { generateSeatToken, hashToken, verifyToken } from './token';
import type { Env } from './env';

interface SeatRecord {
  tokenHash: string;
  displayName: string;
}

interface SocketAttachment {
  seat: SeatId;
}

const STORAGE_KEYS = {
  code: 'code',
  createdAt: 'createdAt',
  seatP1: 'seat:p1',
  seatP2: 'seat:p2',
} as const;

export class RoomDO extends DurableObject<Env> {
  /** Map of live WebSocket → seat. Repopulated from hibernation in constructor. */
  private readonly sockets = new Map<WebSocket, SeatId>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // After the DO wakes from hibernation, repopulate `sockets` from the
    // serialized attachments on each surviving WebSocket so we know which
    // seat each one belongs to.
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment && (attachment.seat === 'p1' || attachment.seat === 'p2')) {
        this.sockets.set(ws, attachment.seat);
      }
    }

    // Hibernation-friendly heartbeat: client sends "ping", runtime auto-replies
    // "pong" without waking the DO. No setInterval needed, no billable wake.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RPC: initialize a brand-new room. Called by the Worker after generating
  // a fresh code. Returns the host's token, OR 'collision' if this DO already
  // exists (so the Worker can retry with a different code).
  // ───────────────────────────────────────────────────────────────────────────
  async initRoom(code: string): Promise<{ token: string } | 'collision'> {
    const existing = await this.ctx.storage.get<string>(STORAGE_KEYS.code);
    if (existing && existing !== code) {
      // Another room already lives here. The Worker will retry.
      return 'collision';
    }
    if (existing === code) {
      // Same room re-init. Keep state idempotent: do nothing if seat:p1 is
      // already set, else fall through to set it.
      const seatP1 = await this.ctx.storage.get<SeatRecord>(STORAGE_KEYS.seatP1);
      if (seatP1) return 'collision';
    }

    const token = generateSeatToken();
    const tokenHash = await hashToken(token);
    const now = Date.now();
    await this.ctx.storage.put({
      [STORAGE_KEYS.code]: code,
      [STORAGE_KEYS.createdAt]: now,
      [STORAGE_KEYS.seatP1]: {
        tokenHash,
        displayName: '',
      } satisfies SeatRecord,
    });
    return { token };
  }

  /**
   * RPC: shape probe for the Worker's GET /room/:code endpoint. Returns true
   * if this DO has been initialized (i.e. has a `code` key). Useful for the
   * "is this code valid?" check before opening a WS.
   */
  async exists(): Promise<boolean> {
    const code = await this.ctx.storage.get<string>(STORAGE_KEYS.code);
    return typeof code === 'string';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // WebSocket entry. The Worker forwards the WS upgrade request here.
  // ───────────────────────────────────────────────────────────────────────────
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    // Reject WS upgrades to uninitialized rooms outright.
    if (!(await this.exists())) {
      return new Response('Room not found', { status: 404 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernation: tells the runtime this WS is "hibernatable" — the DO can
    // be evicted from memory while the connection stays open.
    this.ctx.acceptWebSocket(server);

    // The seat is unknown until the client sends its first envelope (hello /
    // join / reconnect). We do NOT serialize an attachment yet so a hibernation
    // wake-up before authentication will simply ignore the orphan socket.

    return new Response(null, { status: 101, webSocket: client });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // WebSocket handlers (hibernation API). The runtime calls these in place of
  // event listeners, so the DO can hibernate between calls.
  // ───────────────────────────────────────────────────────────────────────────
  override async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message !== 'string') {
      // Binary frames are not used in the protocol. Drop silently.
      return;
    }
    const parsed = parseClientMessage(message);
    if (parsed === null) {
      // Malformed; drop silently to avoid amplifying probing.
      return;
    }

    const seat = this.sockets.get(ws);
    if (seat === undefined) {
      // Unauthenticated socket — only hello / join / reconnect are accepted.
      await this.handleAuth(ws, parsed);
      return;
    }
    // Authenticated post-PR1 messages would dispatch here. PR1 only supports
    // `leave` post-auth.
    if (parsed.type === 'leave') {
      this.send(ws, { type: 'connectionChanged', seat, conn: 'disconnected' });
      ws.close(1000, 'leave');
      return;
    }
    // All other authenticated messages are unknown in PR1; drop silently.
  }

  override async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const seat = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (seat) {
      // Notify the OTHER seat (if any) that we're now disconnected. We do NOT
      // delete seat assignments — the player can reconnect within the room
      // TTL with their token.
      this.broadcastExcept(ws, {
        type: 'connectionChanged',
        seat,
        conn: 'disconnected',
      });
    }
  }

  override async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    // Treat errors like clean closes for our state-machine purposes.
    await this.webSocketClose(ws, 1011, 'error', false);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Auth: hello / join / reconnect handling on a not-yet-authenticated socket.
  // ───────────────────────────────────────────────────────────────────────────
  private async handleAuth(ws: WebSocket, msg: ClientMessage): Promise<void> {
    if (msg.type === 'hello') {
      await this.handleHello(ws, msg.seat, msg.token, msg.name);
      return;
    }
    if (msg.type === 'reconnect') {
      await this.handleReconnect(ws, msg.seat, msg.token);
      return;
    }
    if (msg.type === 'join') {
      await this.handleJoin(ws, msg.name);
      return;
    }
    // Any other message-type before auth: silently close.
    this.sendError(ws, 'illegal-action', 'Authenticate first');
    ws.close(1008, 'unauthenticated');
  }

  private async handleHello(
    ws: WebSocket,
    seat: SeatId,
    token: string,
    name?: string,
  ): Promise<void> {
    const record = await this.getSeat(seat);
    if (!record) {
      this.sendError(ws, 'invalid-token', 'No such seat for this room');
      ws.close(1008, 'invalid-token');
      return;
    }
    if (!(await verifyToken(token, record.tokenHash))) {
      this.sendError(ws, 'invalid-token', 'Token did not match');
      ws.close(1008, 'invalid-token');
      return;
    }

    // Hello may also set the display name on the host's first connect.
    const sanitized = sanitizeName(name, DEFAULT_NAMES[seat]);
    const updated: SeatRecord = { ...record, displayName: sanitized };
    await this.ctx.storage.put(seatKey(seat), updated);

    await this.attachSocket(ws, seat);
  }

  private async handleReconnect(
    ws: WebSocket,
    seat: SeatId,
    token: string,
  ): Promise<void> {
    const record = await this.getSeat(seat);
    if (!record) {
      this.sendError(ws, 'invalid-token', 'No such seat for this room');
      ws.close(1008, 'invalid-token');
      return;
    }
    if (!(await verifyToken(token, record.tokenHash))) {
      this.sendError(ws, 'invalid-token', 'Token did not match');
      ws.close(1008, 'invalid-token');
      return;
    }
    // If a previous socket for this seat is still attached, close it — only
    // one connection per seat at a time. (Tab-duplication avoidance: the
    // older tab gets bumped.)
    for (const [otherWs, otherSeat] of this.sockets) {
      if (otherSeat === seat && otherWs !== ws) {
        otherWs.close(1000, 'replaced');
        this.sockets.delete(otherWs);
      }
    }
    await this.attachSocket(ws, seat);
  }

  private async handleJoin(ws: WebSocket, name: string | undefined): Promise<void> {
    // Only p2 can be assigned by `join`. p1 is always created via initRoom().
    const seatP1 = await this.getSeat('p1');
    const seatP2 = await this.getSeat('p2');
    if (!seatP1) {
      this.sendError(ws, 'room-not-found', 'Room not initialized');
      ws.close(1008, 'room-not-found');
      return;
    }
    if (seatP2) {
      this.sendError(ws, 'room-full', 'This room already has two players');
      ws.close(1008, 'room-full');
      return;
    }

    const token = generateSeatToken();
    const tokenHash = await hashToken(token);
    const sanitized = sanitizeName(name, DEFAULT_NAMES.p2);
    const record: SeatRecord = { tokenHash, displayName: sanitized };
    await this.ctx.storage.put(STORAGE_KEYS.seatP2, record);

    // Hand the joiner their seat token first, then attach.
    this.send(ws, { type: 'playerAssigned', seat: 'p2', token });
    await this.attachSocket(ws, 'p2', { announce: false });

    // Notify p1 (if connected) that the opponent has joined. We send
    // opponentJoined INSTEAD of connectionChanged for joins because
    // opponentJoined carries the display name and implies "connected".
    this.broadcastExcept(ws, {
      type: 'opponentJoined',
      seat: 'p2',
      displayName: sanitized,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Socket bookkeeping
  // ───────────────────────────────────────────────────────────────────────────
  private async attachSocket(
    ws: WebSocket,
    seat: SeatId,
    opts: { announce?: boolean } = {},
  ): Promise<void> {
    this.sockets.set(ws, seat);
    ws.serializeAttachment({ seat } satisfies SocketAttachment);

    // Send the snapshot to the new socket.
    const snap = await this.buildSnapshot(seat);
    this.send(ws, snap);

    // For hello / reconnect (`announce` defaults to true), notify the OTHER
    // seat that this seat just transitioned to connected. For join,
    // `announce: false` lets the caller send `opponentJoined` instead.
    if (opts.announce !== false) {
      this.broadcastExcept(ws, {
        type: 'connectionChanged',
        seat,
        conn: 'connected',
      });
    }
  }

  private async buildSnapshot(localSeat: SeatId): Promise<LobbySnapshot> {
    const code = (await this.ctx.storage.get<string>(STORAGE_KEYS.code)) ?? '';
    const createdAt = (await this.ctx.storage.get<number>(STORAGE_KEYS.createdAt)) ?? 0;
    const p1 = await this.seatSnapshot('p1');
    const p2 = await this.seatSnapshot('p2');
    return {
      type: 'roomSnapshot',
      status: 'lobby',
      code,
      localSeat,
      seats: { p1, p2 },
      createdAt,
    };
  }

  private async seatSnapshot(seat: SeatId): Promise<SeatSnapshot | null> {
    const rec = await this.getSeat(seat);
    if (!rec) return null;
    const conn: ConnState = this.isSeatConnected(seat) ? 'connected' : 'disconnected';
    return {
      seat,
      displayName: rec.displayName,
      conn,
    };
  }

  private isSeatConnected(seat: SeatId): boolean {
    for (const s of this.sockets.values()) {
      if (s === seat) return true;
    }
    return false;
  }

  private async getSeat(seat: SeatId): Promise<SeatRecord | null> {
    const rec = await this.ctx.storage.get<SeatRecord>(seatKey(seat));
    return rec ?? null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Send helpers
  // ───────────────────────────────────────────────────────────────────────────
  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Closed sockets throw on send; clean up on next webSocketClose.
    }
  }

  private sendError(ws: WebSocket, code: ServerErrorCode, message: string): void {
    this.send(ws, { type: 'error', code, message });
  }

  private broadcastExcept(except: WebSocket, msg: ServerMessage): void {
    for (const ws of this.sockets.keys()) {
      if (ws === except) continue;
      this.send(ws, msg);
    }
  }
}

function seatKey(seat: SeatId): string {
  return seat === 'p1' ? STORAGE_KEYS.seatP1 : STORAGE_KEYS.seatP2;
}
