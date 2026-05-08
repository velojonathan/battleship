/**
 * OnlineLobby integration tests (PR1).
 *
 * Coverage:
 *  - Online 2P mode button is visible on the home screen
 *  - Clicking Online 2P switches the home screen into the Online 2P fieldset
 *  - When VITE_WS_URL is missing (default in test env), the lobby shows the
 *    graceful "Online unavailable" banner and does not expose Create/Join
 *  - Solo and Local 2P remain selectable after touching Online 2P
 *
 * NOTE: WebSocket lifecycle / token persistence are not exercised here because
 * Vitest's jsdom environment doesn't implement WebSocket against a real
 * server. Those flows are covered by server unit tests (see
 * `server/test/room.test.ts`) and will be covered end-to-end in PR2+ via
 * Playwright + a local Worker.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

describe('Online 2P lobby (PR1)', () => {
  it('renders an Online 2P mode button on home', () => {
    render(<App aiThinkMs={0} resolveMs={0} />);
    expect(screen.getByRole('button', { name: /online 2p/i })).toBeTruthy();
  });

  it('Online 2P shows graceful "Online unavailable" banner when VITE_WS_URL is missing', () => {
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /online 2p/i }));
    expect(screen.getByTestId('online-lobby')).toHaveProperty(
      'dataset.onlineAvailable',
      'false',
    );
    expect(screen.getByTestId('online-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('online-create')).toBeNull();
    expect(screen.queryByTestId('online-join-input')).toBeNull();
  });

  it('Online 2P hides the local Begin button (no engine entry)', () => {
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /online 2p/i }));
    expect(screen.queryByRole('button', { name: /begin placement/i })).toBeNull();
  });

  it('switching back to Solo restores the engine controls', () => {
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /online 2p/i }));
    fireEvent.click(screen.getByRole('button', { name: /^solo/i }));
    expect(screen.getByRole('button', { name: /begin placement/i })).toBeTruthy();
    expect(screen.queryByTestId('online-lobby')).toBeNull();
  });

  it('does NOT render any opponent ship cells in the Online 2P lobby', () => {
    // Privacy gate: PR1 lobby ships zero game state. Anything resembling
    // opponent ship rendering is a leak.
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /online 2p/i }));
    expect(document.querySelectorAll('[data-state="ship"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-coord]')).toHaveLength(0);
  });
});
