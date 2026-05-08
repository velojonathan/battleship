/**
 * Online 2P configuration loaded at build time from Vite env vars.
 *
 * `VITE_WS_URL` should point at the deployed Worker's HTTPS URL (without a
 * trailing slash). The same URL is used for both the HTTP `POST /room`
 * endpoint and for upgrading WebSocket connections (`/room/:code/ws`).
 *
 * If the env var is missing OR empty, online mode is "unavailable" — the
 * frontend renders a banner and disables Create/Join. Solo and Local 2P
 * remain fully functional.
 */

interface ImportMetaEnv {
  readonly VITE_WS_URL?: string;
}

interface ImportMetaWithEnv {
  readonly env?: ImportMetaEnv;
}

function readEnvUrl(): string | null {
  const meta = (import.meta as unknown as ImportMetaWithEnv).env;
  const v = meta?.VITE_WS_URL;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

export const ONLINE_HTTP_URL = readEnvUrl();

/** True iff the frontend has a configured Worker URL for online play. */
export const ONLINE_AVAILABLE = ONLINE_HTTP_URL !== null;

/** Convert https://… → wss://…, http://… → ws://…. */
export function toWebSocketUrl(httpUrl: string): string {
  if (httpUrl.startsWith('https://')) return 'wss://' + httpUrl.slice('https://'.length);
  if (httpUrl.startsWith('http://')) return 'ws://' + httpUrl.slice('http://'.length);
  return httpUrl;
}
