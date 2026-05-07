import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { FLEET } from '../../src/game/constants';

function getCell(row: number, col: number): HTMLButtonElement {
  const node = document.querySelector(`button[data-coord="${row},${col}"]`);
  if (!node) throw new Error(`No cell at ${row},${col}`);
  return node as HTMLButtonElement;
}

function getStartButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /begin battle/i });
}

function dockButton(shipName: string): HTMLButtonElement | null {
  return (
    screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-label')?.startsWith(`${shipName}, length`)) as
      | HTMLButtonElement
      | undefined
  ) ?? null;
}

function selectedShipName(): string | null {
  const btn = screen
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-pressed') === 'true');
  if (!btn) return null;
  const label = btn.getAttribute('aria-label') ?? '';
  return label.split(',')[0]?.trim() ?? null;
}

function placedCells(): HTMLElement[] {
  return Array.from(document.querySelectorAll('button[data-state="ship"]'));
}

describe('PlacementScreen integration (CP2)', () => {
  it('Start button is disabled until the entire fleet is placed (#31)', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(getStartButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /randomize fleet/i }));
    expect(getStartButton()).toBeEnabled();
  });

  it('Rotating updates the preview orientation (#32)', () => {
    render(<App />);
    // Carrier is pre-selected by BEGIN_PLACEMENT (length 5, default H).
    expect(selectedShipName()).toBe('Carrier');

    fireEvent.pointerEnter(getCell(0, 0));
    expect(getCell(0, 0).dataset.state).toBe('preview-valid');
    expect(getCell(0, 4).dataset.state).toBe('preview-valid');
    expect(getCell(4, 0).dataset.state).toBe('empty'); // would only fill if vertical

    // Rotate via button.
    fireEvent.click(screen.getByRole('button', { name: /rotate selected ship/i }));
    fireEvent.pointerEnter(getCell(0, 0));
    expect(getCell(0, 0).dataset.state).toBe('preview-valid');
    expect(getCell(4, 0).dataset.state).toBe('preview-valid');
    expect(getCell(0, 4).dataset.state).toBe('empty');
  });

  it('Randomize fills all 5 ships with legal placements (#33)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /randomize fleet/i }));

    const occupied = placedCells();
    const total = FLEET.reduce((acc, s) => acc + s.length, 0);
    expect(occupied).toHaveLength(total);

    const seen = new Set(occupied.map((el) => el.getAttribute('data-coord')));
    expect(seen.size).toBe(total);

    expect(getStartButton()).toBeEnabled();
  });

  it('Reset clears all placements and disables Start again (#34)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /randomize fleet/i }));
    expect(placedCells().length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /reset fleet/i }));
    expect(placedCells()).toHaveLength(0);
    expect(getStartButton()).toBeDisabled();
  });

  it('Clicking a cell with a selected ship places it on the board', () => {
    render(<App />);
    // Carrier (5, H) at A1 → cells (0,0)..(0,4)
    fireEvent.click(getCell(0, 0));
    for (let c = 0; c < 5; c++) {
      expect(getCell(0, c).dataset.state).toBe('ship');
    }
    expect(getCell(0, 5).dataset.state).toBe('empty');
  });

  it('Clicking on an invalid placement surfaces an error message and does not place', () => {
    render(<App />);
    // Carrier H length 5 at (0,7) → cols 7..11, out of bounds.
    fireEvent.click(getCell(0, 7));
    expect(placedCells()).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(/off the board/i);
  });

  it('Pressing R rotates the selected ship', () => {
    render(<App />);
    fireEvent.pointerEnter(getCell(0, 0));
    expect(getCell(0, 4).dataset.state).toBe('preview-valid'); // H

    fireEvent.keyDown(window, { key: 'R' });
    fireEvent.pointerEnter(getCell(0, 0));
    expect(getCell(4, 0).dataset.state).toBe('preview-valid'); // V
  });

  it('After placing one ship, selection auto-advances to the next unplaced ship', () => {
    render(<App />);
    // Place Carrier
    fireEvent.click(getCell(0, 0));
    // Battleship should now be selected (auto-advance)
    expect(selectedShipName()).toBe('Battleship');
  });

  it('Clicking a cell after randomize+manually clearing selection shows an error', async () => {
    const user = userEvent.setup();
    render(<App />);
    // Randomize fills the fleet AND clears the selection (selectedShipId=null).
    await user.click(screen.getByRole('button', { name: /randomize fleet/i }));
    expect(selectedShipName()).toBeNull();

    // Now reset to clear the board, then deselect manually by clicking the
    // already-selected ship — but our dock keeps selection sticky, so instead
    // simulate the post-randomize-no-selection by clicking an empty cell first.
    // The randomize state already has all cells occupied, so cells are not empty;
    // pick a ship cell — that should hit the "no ship selected" branch.
    const occupied = placedCells();
    expect(occupied.length).toBeGreaterThan(0);
    // Click on any occupied cell — the placement screen rejects with "select a ship".
    fireEvent.click(occupied[0]!);
    expect(screen.getByRole('alert')).toHaveTextContent(/select a ship/i);
  });

  it('Cell aria-labels include coordinate and state', () => {
    render(<App />);
    expect(getCell(0, 0).getAttribute('aria-label')).toBe('A1');
    fireEvent.click(getCell(0, 0));
    expect(getCell(0, 0).getAttribute('aria-label')).toBe('A1, your ship');
  });

  it('Reset button is disabled when no ships have been placed', () => {
    render(<App />);
    const reset = screen.getByRole('button', { name: /reset fleet/i });
    expect(reset).toBeDisabled();
  });

  it('Selected ship is reflected with aria-pressed=true in the dock', () => {
    render(<App />);
    const carrier = dockButton('Carrier')!;
    expect(carrier.getAttribute('aria-pressed')).toBe('true');
    const battleship = dockButton('Battleship')!;
    expect(battleship.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(battleship);
    expect(dockButton('Battleship')!.getAttribute('aria-pressed')).toBe('true');
    expect(dockButton('Carrier')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('Player 1 ship dock label appears (player scoping for CP5 readiness)', () => {
    render(<App />);
    expect(within(screen.getByLabelText(/player 1 ship dock/i)).getByText(/fleet/i)).toBeInTheDocument();
  });
});
