/**
 * useNetClient — manages the WebSocket lifecycle for a single Online 2P room.
 *
 * Responsibilities:
 *  - Open a WebSocket against `${VITE_WS_URL}/room/:code/ws`.
 *  - Send the appropriate opening frame:
 *     - 'hello' if we already have a token for this seat
 *     - 'reconnect' if we're recovering from a refresh
 *     - 'join' if we're the joiner with no token yet
 *  - Persist the seat token (and any newly-issued one from `playerAssigned`)
 *    in sessionStorage via `saveSession`/`clearSession`.
 *  - Surface a small state machine (status + lastError + lobby snapshot) to
 *    callers (OnlineRoomLobby, e2e tests).
 *
 * It deliberately keeps reconnection logic minimal in PR1: we attempt at most
 * one auto-reconnect on transport drop. If that fails, the UI exposes a
 * manual "Reconnect" button.
 */
import { useEffect, useRef, useState } from 'react';
import { ONLINE_HTTP_URL, toWebSocketUrl } from './config';
import { clearSession, saveSession } from './storage';
import type {
  ClientMessage,
  LobbySnapshot,
  ServerMessage,
  SeatId,
  ServerErrorCode,
} from './protocol';

export type ClientStatus =
  | 'idle' // not connecting yet (no room selected)
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type ConnectIntent =
  | { kind: 'host'; code: string; token: string; name?: string }
  | { kind: 'reconnect'; code: string; seat: SeatId; token: string }
  | { kind: 'join'; code: string; name?: string };

export interface NetClientState {
  status: ClientStatus;
  snapshot: LobbySnapshot | null;
  error: { code: ServerErrorCode | 'transport'; message: string } | null;
  /** Seat assigned by the server. Populated after `roomSnapshot`/`playerAssigned`. */
  localSeat: SeatId | null;
}

export interface NetClientControls extends NetClientState {
  /** Open the connection (or replace any existing one) with a new intent. */
  connect: (intent: ConnectIntent) => void;
  /** Close the active connection without forgetting the session. */
  disconnect: () => void;
  /** Close the connection AND clear sessionStorage. */
  leaveAndForget: () => void;
}

export function useNetClient(): NetClientControls {
  const [state, setState] = useState<NetClientState>({
    status: 'idle',
    snapshot: null,
    error: null,
    localSeat: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const intentRef = useRef<ConnectIntent | null>(null);
  // Cache the most recently observed token for the local seat so we can
  // persist it (and later reconnect) without round-tripping through state.
  const sessionRef = useRef<{ code: string; seat: SeatId; token: string } | null>(null);

  const closeSocket = (): void => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  };

  const connect = (intent: ConnectIntent): void => {
    if (!ONLINE_HTTP_URL) {
      setState({
        status: 'error',
        snapshot: null,
        error: { code: 'transport', message: 'Online play is not configured.' },
        localSeat: null,
      });
      return;
    }
    closeSocket();
    intentRef.current = intent;
    if (intent.kind === 'host') {
      sessionRef.current = { code: intent.code, seat: 'p1', token: intent.token };
    } else if (intent.kind === 'reconnect') {
      sessionRef.current = { code: intent.code, seat: intent.seat, token: intent.token };
    } else {
      sessionRef.current = null;
    }

    const wsBase = toWebSocketUrl(ONLINE_HTTP_URL);
    const url = `${wsBase}/room/${encodeURIComponent(intent.code)}/ws`;
    setState({
      status: 'connecting',
      snapshot: null,
      error: null,
      localSeat: intent.kind === 'join' ? null : intent.kind === 'host' ? 'p1' : intent.seat,
    });

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setState({
        status: 'error',
        snapshot: null,
        error: { code: 'transport', message: 'Could not open connection.' },
        localSeat: null,
      });
      return;
    }
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      const opening = openingFrame(intent);
      try {
        ws.send(JSON.stringify(opening));
      } catch {
        /* ignore */
      }
    });

    ws.addEventListener('message', (ev: MessageEvent) => {
      let msg: ServerMessage | null = null;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      handleServerMessage(msg);
    });

    ws.addEventListener('close', () => {
      // Only update if this is still the active socket.
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setState((prev) => {
        if (prev.status === 'error') return prev;
        return { ...prev, status: 'disconnected' };
      });
    });

    ws.addEventListener('error', () => {
      if (wsRef.current !== ws) return;
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: prev.error ?? { code: 'transport', message: 'Connection error.' },
      }));
    });
  };

  const handleServerMessage = (msg: ServerMessage): void => {
    if (msg.type === 'playerAssigned') {
      // The joiner just got a fresh token. Persist it.
      const intent = intentRef.current;
      const code = intent?.code;
      if (code) {
        const session = { code, seat: msg.seat, token: msg.token };
        sessionRef.current = session;
        saveSession(session);
      }
      setState((prev) => ({ ...prev, localSeat: msg.seat }));
      return;
    }
    if (msg.type === 'roomSnapshot') {
      // First snapshot = authoritative confirmation we're in.
      const session = sessionRef.current;
      if (session && session.seat === msg.localSeat) {
        saveSession(session);
      }
      setState({
        status: 'connected',
        snapshot: msg,
        error: null,
        localSeat: msg.localSeat,
      });
      return;
    }
    if (msg.type === 'opponentJoined') {
      setState((prev) =>
        prev.snapshot
          ? {
              ...prev,
              snapshot: {
                ...prev.snapshot,
                seats: {
                  ...prev.snapshot.seats,
                  [msg.seat]: {
                    seat: msg.seat,
                    displayName: msg.displayName,
                    conn: 'connected',
                  },
                },
              },
            }
          : prev,
      );
      return;
    }
    if (msg.type === 'opponentLeft') {
      setState((prev) =>
        prev.snapshot
          ? {
              ...prev,
              snapshot: {
                ...prev.snapshot,
                seats: { ...prev.snapshot.seats, [msg.seat]: null },
              },
            }
          : prev,
      );
      return;
    }
    if (msg.type === 'connectionChanged') {
      setState((prev) => {
        if (!prev.snapshot) return prev;
        const existing = prev.snapshot.seats[msg.seat];
        if (!existing) return prev;
        return {
          ...prev,
          snapshot: {
            ...prev.snapshot,
            seats: {
              ...prev.snapshot.seats,
              [msg.seat]: { ...existing, conn: msg.conn },
            },
          },
        };
      });
      return;
    }
    if (msg.type === 'error') {
      setState({
        status: 'error',
        snapshot: null,
        error: { code: msg.code, message: msg.message },
        localSeat: null,
      });
      // Server-rejected tokens mean our session is stale.
      if (msg.code === 'invalid-token' || msg.code === 'room-not-found') {
        clearSession();
        sessionRef.current = null;
      }
      closeSocket();
      return;
    }
  };

  const disconnect = (): void => {
    closeSocket();
    setState((prev) => ({ ...prev, status: 'disconnected' }));
  };

  const leaveAndForget = (): void => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'leave' } satisfies ClientMessage));
      } catch {
        /* ignore */
      }
    }
    closeSocket();
    clearSession();
    sessionRef.current = null;
    setState({ status: 'idle', snapshot: null, error: null, localSeat: null });
  };

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      closeSocket();
    };
  }, []);

  return { ...state, connect, disconnect, leaveAndForget };
}

function openingFrame(intent: ConnectIntent): ClientMessage {
  if (intent.kind === 'host') {
    return { type: 'hello', seat: 'p1', token: intent.token, name: intent.name };
  }
  if (intent.kind === 'reconnect') {
    return { type: 'reconnect', seat: intent.seat, token: intent.token };
  }
  return { type: 'join', name: intent.name };
}
