import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import App from '../../src/App';

/**
 * Helpers
 */

function targetingCells(): HTMLButtonElement[] {
  const grid = screen.getByRole('grid', { name: /fire targeting board/i });
  return Array.from(grid.querySelectorAll('button[data-coord]')) as HTMLButtonElement[];
}

function targetingCellAt(row: number, col: number): HTMLButtonElement {
  const grid = screen.getByRole('grid', { name: /fire targeting board/i });
  const node = grid.querySelector(`button[data-coord="${row},${col}"]`);
  if (!node) throw new Error(`No targeting cell at ${row},${col}`);
  return node as HTMLButtonElement;
}

/** Walk Home → Begin → Randomize → Begin Battle. Returns when phase=in-progress. */
async function startSoloGame(opts: { aiThinkMs?: number; resolveMs?: number } = {}): Promise<void> {
  const aiThinkMs = opts.aiThinkMs ?? 0;
  const resolveMs = opts.resolveMs ?? 0;
  render(<App aiThinkMs={aiThinkMs} resolveMs={resolveMs} />);
  fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
  fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
  fireEvent.click(screen.getByRole('button', { name: /begin battle/i }));
  await waitFor(() => {
    expect(screen.getByRole('grid', { name: /fire targeting board/i })).toBeInTheDocument();
  });
}

/** Wait for the human to be allowed to fire again (turn returned, not locked). */
async function waitForHumanTurn(): Promise<void> {
  await waitFor(() => {
    const banner = screen.getByText((_, n) => Boolean(n?.getAttribute?.('data-turn')));
    expect(banner.getAttribute('data-turn')).toBe('mine');
    // Banner says "Player 1 — fire" when ready (not "Resolving…")
    expect(banner.textContent).toMatch(/fire$/i);
  });
}

/**
 * Drive the game forward by firing one shot per human turn until either the
 * game ends (EndGameScreen renders) or our safety cap is hit. Used by the
 * end-game / rematch / return-home tests.
 */
async function playUntilGameOver(): Promise<void> {
  let safety = 300;
  while (safety-- > 0) {
    // Game over? Done.
    if (screen.queryByLabelText(/end of battle/i)) return;
    // Wait for our turn to come up. If the game ends mid-wait, bail out.
    try {
      await waitFor(
        () => {
          if (screen.queryByLabelText(/end of battle/i)) return;
          const banner = document.querySelector('[data-turn="mine"]');
          expect(banner).toBeTruthy();
          expect(banner!.textContent).toMatch(/fire$/i);
        },
        { timeout: 2000 },
      );
    } catch {
      if (screen.queryByLabelText(/end of battle/i)) return;
      throw new Error('Stuck waiting for human turn');
    }
    if (screen.queryByLabelText(/end of battle/i)) return;
    const next = targetingCells().find((c) => !c.disabled);
    if (!next) return;
    fireEvent.click(next);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });
  }
}

describe('Solo gameplay flow (CP3)', () => {
  it('Player can fire and the AI responds with its own shot (#35)', async () => {
    await startSoloGame();
    expect(targetingCells().filter((c) => c.dataset.state !== 'empty')).toHaveLength(0);

    fireEvent.click(targetingCellAt(2, 3));

    await waitFor(() => {
      expect(['miss', 'hit', 'sunk']).toContain(targetingCellAt(2, 3).dataset.state);
    });

    // The AI eventually fires back: at least one cell on YOUR board must
    // become hit/miss/sunk.
    const yourFleetGrid = screen.getByRole('grid', { name: /fleet board$/i });
    await waitFor(() => {
      const shotCells = yourFleetGrid.querySelectorAll(
        '[data-state="miss"], [data-state="hit"], [data-state="sunk"]',
      );
      expect(shotCells.length).toBeGreaterThan(0);
    });
  });

  it('Rapid double-click only fires one shot (#36)', async () => {
    // Use slow timing so the resolve hasn't completed yet on the 3rd click.
    await startSoloGame({ resolveMs: 5000, aiThinkMs: 5000 });

    const target = targetingCellAt(0, 0);
    fireEvent.click(target);
    fireEvent.click(target);
    fireEvent.click(target);

    // The cell at (0,0) shows the resolved outcome from the FIRST shot.
    await waitFor(() => {
      expect(['miss', 'hit', 'sunk']).toContain(targetingCellAt(0, 0).dataset.state);
    });

    // No second cell should have a shot outcome — the input lock prevented it.
    const targeted = targetingCells().filter((c) =>
      ['miss', 'hit', 'sunk'].includes(c.dataset.state ?? ''),
    );
    expect(targeted).toHaveLength(1);
    expect(targeted[0]!.dataset.coord).toBe('0,0');
  });

  it('End-game banner appears when one fleet is fully sunk (#37)', async () => {
    await startSoloGame();
    await playUntilGameOver();
    expect(screen.getByLabelText(/end of battle/i)).toBeInTheDocument();
    expect(screen.getByText(/wins/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start a rematch/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return to home/i })).toBeInTheDocument();
  }, 30000);

  it('Rematch button restarts the game flow', async () => {
    await startSoloGame();
    await playUntilGameOver();
    expect(screen.getByLabelText(/end of battle/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start a rematch/i }));
    // Rematch lands back in placement (Begin Battle button visible).
    expect(screen.getByRole('button', { name: /begin battle/i })).toBeInTheDocument();
  }, 30000);

  it('Return Home from game over goes back to the home screen', async () => {
    await startSoloGame();
    await playUntilGameOver();
    expect(screen.getByLabelText(/end of battle/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /return to home/i }));
    expect(screen.getByRole('button', { name: /begin placement/i })).toBeInTheDocument();
  }, 30000);

  it('Targeting cells expose Fire-at-coord ARIA labels and disable after firing', async () => {
    await startSoloGame();
    const cell = targetingCellAt(5, 5);
    expect(cell.getAttribute('aria-label')).toMatch(/fire at f6/i);
    fireEvent.click(cell);
    await waitFor(() => {
      expect(targetingCellAt(5, 5)).toBeDisabled();
    });
    void waitForHumanTurn;
  });

  it('Battle log records each shot with a turn number', async () => {
    await startSoloGame();
    fireEvent.click(targetingCellAt(0, 0));
    await waitFor(() => {
      const log = screen.getByLabelText(/battle log/i);
      expect(log.textContent ?? '').toMatch(/A1/);
    });
  });

  it('Choosing Easy difficulty on home propagates into the game state', async () => {
    render(<App aiThinkMs={0} resolveMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^easy/i }));
    fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
    fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
    fireEvent.click(screen.getByRole('button', { name: /begin battle/i }));
    // Find the scoreboard slot for the opponent (AI Commander). It contains
    // both the name and the difficulty label as siblings.
    await waitFor(() => {
      const slot = screen
        .getAllByText(/ai commander/i)
        .map((n) => n.parentElement)
        .find((el): el is HTMLElement => Boolean(el?.textContent?.match(/easy/i)));
      expect(slot).toBeTruthy();
    });
  });
});
