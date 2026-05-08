/**
 * OnlineLobby — the entry screen for Online 2P. Shows two side-by-side
 * actions:
 *   1. Create a new room (POST /room → save session → connect as host)
 *   2. Join an existing room by code or invite link
 *
 * If `VITE_WS_URL` is missing, this component renders a graceful "Online
 * unavailable" notice and disables both actions. The user can still pick
 * Solo or Local 2P from the mode row above.
 */
import { useCallback, useState } from 'react';
import { createRoom, roomExists } from './api';
import { isValidRoomCode, normalizeRoomCode } from './code';
import { ONLINE_AVAILABLE } from './config';
import { saveSession } from './storage';
import type { ConnectIntent } from './useNetClient';
import styles from './OnlineLobby.module.css';

export interface OnlineLobbyProps {
  /** Called when a session is ready and we want to open a WebSocket. */
  onConnect: (intent: ConnectIntent) => void;
  /** Default display name to send with hello/join. */
  displayName: string;
}

type LocalError =
  | { kind: 'unreachable' }
  | { kind: 'unavailable' }
  | { kind: 'server-error' }
  | { kind: 'room-not-found' }
  | { kind: 'invalid-code' }
  | null;

export function OnlineLobby({
  onConnect,
  displayName,
}: OnlineLobbyProps): JSX.Element {
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [joinInput, setJoinInput] = useState('');
  const [error, setError] = useState<LocalError>(null);

  const onCreate = useCallback(async () => {
    setError(null);
    setBusy('create');
    const result = await createRoom();
    setBusy(null);
    if (!result.ok) {
      setError({ kind: result.reason === 'unavailable' ? 'unavailable' : result.reason === 'unreachable' ? 'unreachable' : 'server-error' });
      return;
    }
    const { code, seat, token } = result.data;
    saveSession({ code, seat, token });
    onConnect({ kind: 'host', code, token, name: displayName });
  }, [displayName, onConnect]);

  const onJoin = useCallback(async () => {
    setError(null);
    const code = extractCode(joinInput);
    if (!isValidRoomCode(code)) {
      setError({ kind: 'invalid-code' });
      return;
    }
    setBusy('join');
    const probe = await roomExists(code);
    setBusy(null);
    if (!probe.ok) {
      setError({ kind: probe.reason === 'unavailable' ? 'unavailable' : 'unreachable' });
      return;
    }
    if (!probe.exists) {
      setError({ kind: 'room-not-found' });
      return;
    }
    onConnect({ kind: 'join', code, name: displayName });
  }, [displayName, joinInput, onConnect]);

  if (!ONLINE_AVAILABLE) {
    return (
      <div
        className={styles.lobby}
        data-testid="online-lobby"
        data-online-available="false"
      >
        <p className={styles.intro}>
          Online 2P lets you play against a friend over the internet via an
          invite code or link.
        </p>
        <div
          className={styles.unavailable}
          role="status"
          data-testid="online-unavailable"
        >
          <strong>Online unavailable</strong>
          The Online 2P backend hasn&apos;t been configured for this build. Solo
          and Local 2P remain fully playable below.
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.lobby}
      data-testid="online-lobby"
      data-online-available="true"
    >
      <p className={styles.intro}>
        Create a room and share the invite link, or paste a friend&apos;s
        invite code below to join theirs.
      </p>

      <div className={styles.actions}>
        <section className={styles.action} aria-label="Create a new room">
          <p className={styles.actionTitle}>Create</p>
          <p className={styles.actionHelp}>
            Start a new room. You&apos;ll get an invite code to share.
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                void onCreate();
              }}
              disabled={busy !== null}
              data-testid="online-create"
            >
              {busy === 'create' ? 'Creating…' : 'Create room'}
            </button>
          </div>
        </section>

        <section className={styles.action} aria-label="Join an existing room">
          <p className={styles.actionTitle}>Join</p>
          <p className={styles.actionHelp}>
            Paste an invite code or full link. 8 letters/digits.
          </p>
          <div className={styles.row}>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className={styles.input}
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="ABCD1234"
              maxLength={64}
              aria-label="Invite code or link"
              data-testid="online-join-input"
            />
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                void onJoin();
              }}
              disabled={busy !== null || joinInput.trim().length === 0}
              data-testid="online-join-submit"
            >
              {busy === 'join' ? 'Joining…' : 'Join'}
            </button>
          </div>
        </section>
      </div>

      {error && (
        <div
          className={styles.error}
          role="alert"
          data-testid="online-lobby-error"
        >
          {messageForError(error)}
        </div>
      )}
    </div>
  );
}

function extractCode(raw: string): string {
  // Accept either an 8-char code or a full URL like
  // https://example.com/?room=ABCDEFGH (or #/room/ABCDEFGH).
  const trimmed = raw.trim();
  const urlMatch = /room[=/]([2-9A-Z]{8})/i.exec(trimmed);
  if (urlMatch) return urlMatch[1].toUpperCase();
  return normalizeRoomCode(trimmed);
}

function messageForError(err: NonNullable<LocalError>): string {
  switch (err.kind) {
    case 'invalid-code':
      return 'That doesn’t look like a valid invite code. Codes are 8 characters.';
    case 'room-not-found':
      return 'No room with that code is currently active.';
    case 'unreachable':
      return 'Couldn’t reach the online backend. Check your connection and try again.';
    case 'unavailable':
      return 'Online play isn’t configured for this build.';
    case 'server-error':
      return 'The online backend is having trouble. Try again in a moment.';
  }
}
