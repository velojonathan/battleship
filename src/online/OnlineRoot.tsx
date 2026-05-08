/**
 * OnlineRoot — top-level component for Online 2P. Owns the WebSocket
 * lifecycle and switches between OnlineLobby (idle) and OnlineRoomLobby
 * (connected/connecting/etc.).
 *
 * On mount, if sessionStorage holds a valid `{ code, seat, token }`, we
 * auto-attempt a `reconnect` so refreshing the page rejoins the same seat.
 */
import { useEffect, useRef } from 'react';
import { OnlineLobby } from './OnlineLobby';
import { OnlineRoomLobby } from './OnlineRoomLobby';
import { loadSession } from './storage';
import { useNetClient } from './useNetClient';

export interface OnlineRootProps {
  /** Default display name to send with hello/join. */
  displayName: string;
}

export function OnlineRoot({ displayName }: OnlineRootProps): JSX.Element {
  const net = useNetClient();
  const triedAutoReconnect = useRef(false);

  // One-shot reconnect-from-sessionStorage on mount.
  useEffect(() => {
    if (triedAutoReconnect.current) return;
    triedAutoReconnect.current = true;
    const session = loadSession();
    if (session) {
      net.connect({
        kind: 'reconnect',
        code: session.code,
        seat: session.seat,
        token: session.token,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the user typed an invite link with ?room=CODE in the URL but isn't in
  // a session yet, prefill the join input. The OnlineLobby handles its own
  // input state, so we can't pre-set it here without lifting that state up.
  // Leaving this as a future polish in PR2.

  if (
    net.status === 'idle' ||
    (net.status === 'error' && net.snapshot === null)
  ) {
    // Pre-room view: show the lobby (and any one-shot error from a failed
    // auto-reconnect surfaced inline).
    return (
      <div data-testid="online-root" data-status={net.status}>
        <OnlineLobby onConnect={net.connect} displayName={displayName} />
        {net.status === 'error' && net.error && (
          <p
            role="alert"
            data-testid="online-root-error"
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 0.75rem',
              border: '1px solid rgba(255, 100, 120, 0.45)',
              borderRadius: '0.4rem',
              color: 'rgba(255, 200, 210, 0.95)',
              background: 'rgba(60, 16, 22, 0.5)',
              fontSize: '0.85rem',
            }}
          >
            {net.error.message}
          </p>
        )}
      </div>
    );
  }

  // Connecting / connected / disconnected with a known room.
  if (net.snapshot) {
    return (
      <div data-testid="online-root" data-status={net.status}>
        <OnlineRoomLobby
          snapshot={net.snapshot}
          status={net.status}
          error={net.error}
          onLeave={net.leaveAndForget}
          onReconnect={() => {
            const session = loadSession();
            if (session) {
              net.connect({
                kind: 'reconnect',
                code: session.code,
                seat: session.seat,
                token: session.token,
              });
            }
          }}
        />
      </div>
    );
  }

  // Connecting with no snapshot yet (first-time connect): show a thin
  // placeholder. The lobby below remains rendered so user has context.
  return (
    <div data-testid="online-root" data-status={net.status}>
      <p
        role="status"
        data-testid="online-connecting"
        style={{ margin: 0, fontSize: '0.9rem' }}
      >
        Connecting to room…
      </p>
    </div>
  );
}
