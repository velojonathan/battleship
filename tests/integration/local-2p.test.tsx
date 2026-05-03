import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, act, within } from '@testing-library/react';
import App from '../../src/App';

/**
 * Local 2P privacy + handoff integration tests (CP5).
 *
 * Coverage from the test matrix:
 * #38 Local 2P setup handoff appears between placement
 * #39 Local 2P inactive hidden ships are NOT in the rendered DOM
 * #40 Local 2P turn handoff appears between every turn
 * #41 Local 2P rapid double-click only fires one shot
 * #42 Local 2P rematch resets cleanly
 */

function targetingCells(): HTMLButtonElement[] {
  const grid = screen.getByRole('grid', { name: /fire targeting board/i });
  return Array.from(grid.querySelectorAll('button[data-coord]')) as HTMLButtonElement[];
}

/** Walk Home → choose Local 2P → reach setup-player-one (P1 placement). */
function startLocal2P(): void {
  render(<App aiThinkMs={0} resolveMs={0} />);
  fireEvent.click(screen.getByRole('button', { name: /^local 2p/i }));
  fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
}

/** From Player 1's placement screen, randomize and confirm. */
function p1RandomConfirm(): void {
  fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
  fireEvent.click(screen.getByRole('button', { name: /player 1 ready/i }));
}

/** From Player 2's placement screen, randomize and confirm. */
function p2RandomConfirm(): void {
  fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
  fireEvent.click(screen.getByRole('button', { name: /player 2 ready/i }));
}

/** Advance through any active handoff screen by clicking "I'm ready". */
async function clickReady(): Promise<void> {
  const btn = await screen.findByRole('button', { name: /confirm handoff to/i });
  fireEvent.click(btn);
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
}

describe('Local 2P privacy + handoff (CP5)', () => {
  it('Setup handoff appears between Player 1 and Player 2 placements (#38)', async () => {
    startLocal2P();
    expect(screen.getByRole('heading', { level: 1, name: /place your fleet/i })).toBeInTheDocument();
    p1RandomConfirm();
    // Now we should be on the handoff screen, NOT directly on P2 placement.
    expect(
      await screen.findByRole('dialog', { name: /handoff to/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm handoff to/i })).toBeInTheDocument();
    // Crucially, P1's placement UI must be unmounted right now.
    expect(screen.queryByRole('button', { name: /player 1 ready/i })).not.toBeInTheDocument();
    await clickReady();
    // Now P2's placement should be visible.
    expect(screen.getByRole('button', { name: /player 2 ready/i })).toBeInTheDocument();
  });

  it("Player 2's hidden fleet is NOT in DOM during Player 1's placement (#39 / setup phase)", () => {
    startLocal2P();
    // Confirm we're on P1 placement.
    expect(screen.getByRole('heading', { level: 1, name: /place your fleet/i })).toBeInTheDocument();
    // P2's placement screen must not be mounted.
    expect(screen.queryByRole('button', { name: /player 2 ready/i })).not.toBeInTheDocument();
    // No cell on screen carries data-state="ship" for P2 (we haven't placed any
    // ships yet, but more importantly no DOM should reference P2's fleet).
    const allCells = document.querySelectorAll('[data-coord]');
    for (const c of allCells) {
      expect(c.getAttribute('data-player') ?? 'p1').not.toBe('p2');
    }
  });

  it('After P1+P2 placement, a handoff appears before Player 1 fires the first shot', async () => {
    startLocal2P();
    p1RandomConfirm();
    await clickReady();
    p2RandomConfirm();
    // We should now be on a handoff back to P1 (start firing).
    expect(
      await screen.findByRole('dialog', { name: /handoff to/i }),
    ).toBeInTheDocument();
    await clickReady();
    // Now we're in-progress with P1 firing.
    expect(screen.getByRole('grid', { name: /fire targeting board/i })).toBeInTheDocument();
  });

  it('Inactive opponent ship cells are NOT rendered in the DOM during a turn (#39)', async () => {
    startLocal2P();
    p1RandomConfirm();
    await clickReady();
    p2RandomConfirm();
    await clickReady();
    // We're now P1's turn. P2's hidden ship cells must NOT appear in the targeting board.
    const targeting = screen.getByRole('grid', { name: /fire targeting board/i });
    const targetingCellsArr = within(targeting).getAllByRole('button');
    // Targeting cells render data-state in {empty, miss, hit, sunk}; never 'ship'.
    for (const c of targetingCellsArr) {
      expect(c.getAttribute('data-state')).not.toBe('ship');
    }
    // The "Your fleet" board shows P1's ships only.
    const ownBoardSection = screen.getByLabelText(/player 1 fleet board/i);
    expect(ownBoardSection).toBeInTheDocument();
    // The "Player 2 fleet board" element must NOT be in the document.
    expect(screen.queryByLabelText(/player 2 fleet board/i)).not.toBeInTheDocument();
  });

  it('A handoff screen appears between every turn (#40)', async () => {
    startLocal2P();
    p1RandomConfirm();
    await clickReady();
    p2RandomConfirm();
    await clickReady();
    // P1 fires.
    fireEvent.click(targetingCells()[0]!);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });
    // After resolve, we should be on the handoff to P2.
    expect(
      await screen.findByRole('dialog', { name: /handoff to player 2/i }),
    ).toBeInTheDocument();
    // The targeting board (which would expose P1's shot history if mistakenly
    // mounted in P2's view) must not be visible during the handoff.
    expect(screen.queryByRole('grid', { name: /fire targeting board/i })).not.toBeInTheDocument();
    await clickReady();
    // Now P2 should be firing.
    expect(screen.getByRole('grid', { name: /fire targeting board/i })).toBeInTheDocument();
  });

  it('Rapid double-click during a Local 2P turn fires only one shot (#41)', async () => {
    startLocal2P();
    p1RandomConfirm();
    await clickReady();
    p2RandomConfirm();
    await clickReady();
    const cells = targetingCells();
    fireEvent.click(cells[0]!);
    fireEvent.click(cells[0]!);
    fireEvent.click(cells[0]!);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });
    // Should now be in handoff to P2 (one shot fired, turn flipped).
    expect(await screen.findByRole('dialog', { name: /handoff to/i })).toBeInTheDocument();
    await clickReady();
    // Verify only one cell ended up disabled (only one shot fired).
    const targetingNow = screen.getByRole('grid', { name: /fire targeting board/i });
    const buttons = within(targetingNow).getAllByRole('button');
    const disabled = buttons.filter((b) => (b as HTMLButtonElement).disabled);
    // P2 sees their own targeting board (their shots vs P1) — they have NOT
    // fired yet, so 0 cells are disabled.
    expect(disabled.length).toBe(0);
  });

  it('After a 2P game ends, Rematch returns to Player 1 setup (#42)', async () => {
    startLocal2P();
    p1RandomConfirm();
    await clickReady();
    p2RandomConfirm();
    await clickReady();
    // Drive a fast game: keep firing every targeting cell until end-game banner
    // appears. We also click through every handoff between turns.
    let safety = 400;
    while (safety-- > 0) {
      if (screen.queryByLabelText(/end of battle/i)) break;
      // Possibly mid-handoff.
      const ready = screen.queryByRole('button', { name: /confirm handoff to/i });
      if (ready) {
        fireEvent.click(ready);
        await act(async () => {
          await new Promise((res) => setTimeout(res, 0));
        });
        continue;
      }
      // Otherwise we're in-progress — fire one enabled cell.
      const grid = screen.queryByRole('grid', { name: /fire targeting board/i });
      if (!grid) {
        await act(async () => {
          await new Promise((res) => setTimeout(res, 0));
        });
        continue;
      }
      const enabled = within(grid)
        .getAllByRole('button')
        .find((b) => !(b as HTMLButtonElement).disabled);
      if (!enabled) break;
      fireEvent.click(enabled);
      await act(async () => {
        await new Promise((res) => setTimeout(res, 0));
      });
    }
    expect(screen.getByLabelText(/end of battle/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start a rematch/i }));
    // Rematch returns to Player 1 placement.
    expect(screen.getByRole('button', { name: /player 1 ready/i })).toBeInTheDocument();
  }, 30000);
});
