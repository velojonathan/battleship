/**
 * OnlineRoomLobby — what we show once we're connected to a room. Displays:
 *   - the room code (large, monospace)
 *   - a "Copy invite link" button that puts a sharable URL on the clipboard
 *   - one card per seat (p1, p2) with display name and connection state
 *   - a banner for transient transport / opponent state
 *   - a "Leave" button that closes the WS and clears sessionStorage
 *
 * No game state is rendered. PR1 is lobby-only; placement and gameplay are
 * deferred to subsequent PRs.
 */
import { useCallback, useState } from 'react';
import type { LobbySnapshot, SeatId, ServerErrorCode } from './protocol';
import styles from './OnlineRoomLobby.module.css';

export interface OnlineRoomLobbyProps {
  snapshot: LobbySnapshot;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error: { code: ServerErrorCode | 'transport'; message: string } | null;
  onLeave: () => void;
  onReconnect: () => void;
}

export function OnlineRoomLobby({
  snapshot,
  status,
  error,
  onLeave,
  onReconnect,
}: OnlineRoomLobbyProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const inviteLink = buildInviteLink(snapshot.code);

  const onCopy = useCallback(async () => {
    const ok = await copyToClipboard(inviteLink);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [inviteLink]);

  return (
    <div
      className={styles.lobby}
      data-testid="online-room-lobby"
      data-room-code={snapshot.code}
    >
      <div className={styles.code} aria-label="Room code">
        <span className={styles.codeLabel}>Room code</span>
        <span className={styles.codeValue} data-testid="online-room-code">
          {snapshot.code}
        </span>
        <button
          type="button"
          className={styles.copyButton}
          onClick={() => {
            void onCopy();
          }}
          data-copied={copied ? 'true' : 'false'}
          data-testid="online-copy-link"
          aria-label="Copy invite link"
          title={inviteLink}
        >
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
      </div>

      <div className={styles.seats} aria-label="Players in room">
        {(['p1', 'p2'] as const).map((seat) => (
          <SeatCard
            key={seat}
            seat={seat}
            snapshot={snapshot}
            isLocal={seat === snapshot.localSeat}
          />
        ))}
      </div>

      {status === 'disconnected' && (
        <div className={styles.banner} role="status" data-testid="online-disconnected">
          Lost connection to the room.{' '}
          <button
            type="button"
            className={styles.actionButton}
            onClick={onReconnect}
            data-testid="online-reconnect"
          >
            Reconnect
          </button>
        </div>
      )}

      {status === 'error' && error && (
        <div
          className={`${styles.banner} ${styles.bannerError}`}
          role="alert"
          data-testid="online-room-error"
        >
          {error.message}
        </div>
      )}

      {status === 'connected' && (
        <p className={styles.note}>
          {snapshot.seats.p1 && snapshot.seats.p2
            ? 'Both players are in. Placement and gameplay land in the next update.'
            : 'Waiting for the other player to join…'}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionButton}
          onClick={onLeave}
          data-testid="online-leave"
        >
          Leave room
        </button>
      </div>
    </div>
  );
}

function SeatCard({
  seat,
  snapshot,
  isLocal,
}: {
  seat: SeatId;
  snapshot: LobbySnapshot;
  isLocal: boolean;
}): JSX.Element {
  const data = snapshot.seats[seat];
  const conn = data?.conn ?? 'disconnected';
  const label = seat === 'p1' ? 'Player 1 (host)' : 'Player 2';
  return (
    <div
      className={styles.seat}
      data-testid={`online-seat-${seat}`}
      data-seat={seat}
      data-conn={conn}
    >
      <span className={styles.seatTitle}>{label}</span>
      <span className={styles.seatName}>
        {data ? data.displayName : 'Empty seat'}
        {isLocal && <span className={styles.youBadge}>You</span>}
      </span>
      <span className={styles.seatStatus} data-conn={conn}>
        {data ? (conn === 'connected' ? 'Connected' : 'Disconnected') : 'Waiting…'}
      </span>
    </div>
  );
}

function buildInviteLink(code: string): string {
  if (typeof window === 'undefined') return `?room=${code}`;
  const url = new URL(window.location.href);
  url.search = `?room=${code}`;
  url.hash = '';
  return url.toString();
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  // Legacy fallback for older browsers without clipboard API.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
