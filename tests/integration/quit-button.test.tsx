// QA hardening — Quit button integration tests.
//
// QA spec §5 explicitly requires that the player can restart from every phase:
//   - Restart from setup
//   - Restart from active game
//   - Restart during AI turn
//   - Restart during animation
//
// The engine already supported RETURN_HOME from any phase, but until the QA
// pass there was no UI surface for it on PlacementScreen / GameScreen /
// HandoffScreen. These tests assert the new QuitButton wires that up.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import App from '../../src/App';

beforeEach(() => {
  // Auto-confirm any window.confirm() prompts the QuitButton may pop.
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function quitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /quit to home/i }) as HTMLButtonElement;
}

describe('Quit button (QA §5)', () => {
  it('PlacementScreen: Quit returns to home with no placement persisted', async () => {
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
    expect(screen.getByLabelText(/ship placement/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
    fireEvent.click(quitButton());

    await waitFor(() => {
      expect(screen.getByLabelText(/^home$/i)).toBeInTheDocument();
    });
    // Re-entering placement starts with a fresh fleet (0 placed).
    fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
    expect(screen.getByText(/Placed/i)).toHaveTextContent('Placed 0/5');
  });

  it('PlacementScreen: Quit DOES NOT confirm when nothing is placed yet', () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
    fireEvent.click(quitButton());
    expect(confirmMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^home$/i)).toBeInTheDocument();
  });

  it('PlacementScreen: Quit confirms when at least one ship has been placed', () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
    fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
    fireEvent.click(quitButton());
    expect(confirmMock).toHaveBeenCalledOnce();
  });

  it('PlacementScreen: rejecting the confirm keeps you in placement', () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockImplementation(() => false);
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
    fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
    fireEvent.click(quitButton());
    expect(confirmMock).toHaveBeenCalled();
    expect(screen.getByLabelText(/ship placement/i)).toBeInTheDocument();
  });

  it('GameScreen: Quit during human turn returns to home with no leftover state', async () => {
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
    fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
    fireEvent.click(screen.getByRole('button', { name: /begin battle/i }));
    await waitFor(() => {
      expect(screen.getByRole('grid', { name: /fire targeting board/i })).toBeInTheDocument();
    });
    fireEvent.click(quitButton());
    await waitFor(() => {
      expect(screen.getByLabelText(/^home$/i)).toBeInTheDocument();
    });
  });

  it('GameScreen: Quit during AI think window does NOT fire an orphan AI shot afterward', async () => {
    // Use a non-zero think delay; the human fires, AI is "thinking", we quit
    // before the AI's setTimeout chain completes. After quitting, no AI shot
    // may register and no further FIRE_SHOT may land.
    const thinkMs = 500;
    render(<App aiThinkMs={thinkMs} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
    fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
    fireEvent.click(screen.getByRole('button', { name: /begin battle/i }));
    await waitFor(() => {
      expect(screen.getByRole('grid', { name: /fire targeting board/i })).toBeInTheDocument();
    });

    const grid = screen.getByRole('grid', { name: /fire targeting board/i });
    const firstCell = grid.querySelector('button[data-coord="0,0"]') as HTMLButtonElement;
    fireEvent.click(firstCell);

    // Quit while AI is "thinking" (haven't waited thinkMs yet).
    fireEvent.click(quitButton());
    await waitFor(() => {
      expect(screen.getByLabelText(/^home$/i)).toBeInTheDocument();
    });

    // Wait long enough for the would-be AI shot timer to have fired.
    await act(async () => {
      await new Promise((res) => setTimeout(res, thinkMs + 100));
    });

    // We should still be on the home screen — no orphan AI shot brought us
    // back to the game-over screen.
    expect(screen.getByLabelText(/^home$/i)).toBeInTheDocument();
  });

  it('HandoffScreen: Quit returns to home cleanly', async () => {
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^local 2p/i }));
    fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));

    fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
    fireEvent.click(screen.getByRole('button', { name: /player 1 ready/i }));

    // Wait for the handoff screen to appear.
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /handoff/i })).toBeInTheDocument();
    });

    fireEvent.click(quitButton());
    await waitFor(() => {
      expect(screen.getByLabelText(/^home$/i)).toBeInTheDocument();
    });
  });
});
