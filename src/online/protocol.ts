/**
 * Wire protocol shapes used by the client. MUST stay in sync with
 * `server/src/protocol.ts` — that file is the source of truth for parsing
 * and validation. We only re-declare the subset of types the client needs
 * to type-check messages it sends/receives. Keep these structurally
 * identical to the server's exports.
 */

export type SeatId = 'p1' | 'p2';
export type RoomStatus = 'lobby';
export type ConnState = 'connected' | 'disconnected';

export interface SeatSnapshot {
  seat: SeatId;
  displayName: string;
  conn: ConnState;
}

export interface LobbySnapshot {
  type: 'roomSnapshot';
  status: RoomStatus;
  code: string;
  localSeat: SeatId;
  seats: { p1: SeatSnapshot | null; p2: SeatSnapshot | null };
  createdAt: number;
}

export interface PlayerAssigned {
  type: 'playerAssigned';
  seat: SeatId;
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
  message: string;
}

export type ServerMessage =
  | LobbySnapshot
  | PlayerAssigned
  | OpponentJoined
  | OpponentLeft
  | ConnectionChanged
  | ServerError;

export interface ClientHello {
  type: 'hello';
  seat: SeatId;
  token: string;
  name?: string;
}

export interface ClientJoin {
  type: 'join';
  name?: string;
}

export interface ClientReconnect {
  type: 'reconnect';
  seat: SeatId;
  token: string;
}

export interface ClientLeave {
  type: 'leave';
}

export type ClientMessage =
  | ClientHello
  | ClientJoin
  | ClientReconnect
  | ClientLeave;

export interface CreateRoomResponse {
  code: string;
  seat: SeatId;
  token: string;
}
