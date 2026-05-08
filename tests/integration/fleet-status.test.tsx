/**
 * Fleet counter QA — both panels must use the same `/17` segment-health metric.
 *
 * Bug pre-FP1: own panel showed `X/17 afloat` (segment health), opponent panel
 * showed `X/5 active` (ship count). FP1 unifies both to `X/17 AFLOAT` and
 * `0/17 SUNK` when wiped.
 *
 * Privacy: the aggregate count for the opponent fleet is publicly knowable
 * (= viewer's hit/sunk shot count). Per-ship hit attribution stays hidden
 * for un-sunk opponent ships (covered by deriveOpponent + DOM regression test).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState, reducer } from '../../src/game/engine';
import type { Coord, GameState, PlayerId } from '../../src/game/types';
import { FleetStatus } from '../../src/components/FleetStatus';
import { TOTAL_SHIP_CELLS } from '../../src/game/constants';

function shipCellsOf(state: GameState, player: PlayerId): Coord[] {
  const out: Coord[] = [];
  for (const ship of state.players[player].fleet) {
    const o = ship.origin!;
    for (let i = 0; i < ship.length; i++) {
      out.push(
        ship.orientation === 'H'
          ? { row: o.row, col: o.col + i }
          : { row: o.row + i, col: o.col },
      );
    }
  }
  return out;
}

/** Build an in-progress 2P state with both fleets randomized & ready. */
function inProgress2P(seed = 17): GameState {
  let s = initialState();
  s = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  s = reducer(s, { type: 'CONFIRM_READY' });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p2', seed: seed + 1 });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  s = reducer(s, { type: 'CONFIRM_READY' });
  return s;
}

function fireN(state: GameState, shooter: PlayerId, cells: Coord[], n: number): GameState {
  let s = state;
  let ts = 0;
  for (let i = 0; i < n && i < cells.length; i++) {
    s = { ...s, currentTurn: shooter, inputLocked: false, phase: 'in-progress' };
    s = reducer(s, { type: 'FIRE_SHOT', at: cells[i], ts: ++ts });
    if (s.phase !== 'game-over') s = reducer(s, { type: 'COMPLETE_TURN' });
  }
  return s;
}

function summaryFor(panel: HTMLElement): string {
  const el = panel.querySelector('[data-summary="segment-health"]');
  return el?.textContent ?? '';
}

const noop = (): void => undefined;

describe('FleetStatus — segment-health header is consistent across both panels', () => {
  it('Fresh fleet renders 17/17 AFLOAT for own panel', () => {
    const s = inProgress2P();
    const { container } = render(
      <FleetStatus state={s} player="p1" reveal title="P1 fleet" />,
    );
    expect(summaryFor(container)).toBe(`${TOTAL_SHIP_CELLS}/${TOTAL_SHIP_CELLS} AFLOAT`);
  });

  it('Fresh fleet renders 17/17 AFLOAT for opponent panel (no ship-count summary)', () => {
    const s = inProgress2P();
    const { container } = render(
      <FleetStatus state={s} player="p2" reveal={false} title="P2 fleet" />,
    );
    expect(summaryFor(container)).toBe(`${TOTAL_SHIP_CELLS}/${TOTAL_SHIP_CELLS} AFLOAT`);
    // Make absolutely sure the old "X/5 active" summary is gone.
    expect(container.textContent).not.toMatch(/\d+\/5\s*active/i);
  });

  it('After 3 hits on opponent, opponent panel reads 14/17 AFLOAT (segment-health)', () => {
    let s = inProgress2P();
    const p2Cells = shipCellsOf(s, 'p2');
    s = fireN(s, 'p1', p2Cells, 3);
    const { container } = render(
      <FleetStatus state={s} player="p2" reveal={false} title="P2 fleet" />,
    );
    expect(summaryFor(container)).toBe(`${TOTAL_SHIP_CELLS - 3}/${TOTAL_SHIP_CELLS} AFLOAT`);
  });

  it('After all opponent ships sunk, opponent panel reads 0/17 SUNK (header word changes)', () => {
    let s = inProgress2P();
    const p2Cells = shipCellsOf(s, 'p2');
    s = fireN(s, 'p1', p2Cells, TOTAL_SHIP_CELLS);
    const { container } = render(
      <FleetStatus state={s} player="p2" reveal={false} title="P2 fleet" />,
    );
    expect(summaryFor(container)).toBe(`0/${TOTAL_SHIP_CELLS} SUNK`);
  });

  it('Solo: the AI fleet header uses /17 too (regression — both fleets same metric)', () => {
    let s = initialState();
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 7 });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 7 });
    s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 7 });
    // Solo: now in-progress.
    const { container } = render(
      <FleetStatus state={s} player="p2" reveal={false} title="AI fleet" />,
    );
    expect(summaryFor(container)).toBe(`${TOTAL_SHIP_CELLS}/${TOTAL_SHIP_CELLS} AFLOAT`);
  });

  it('Aria-label uses cells-afloat phrasing, not ship-count phrasing', () => {
    const s = inProgress2P();
    render(<FleetStatus state={s} player="p2" reveal={false} title="AI fleet" />);
    expect(screen.getByLabelText(/AI fleet, 17 of 17 cells afloat/i)).toBeTruthy();
  });

  it('Privacy: opponent panel does not expose per-ship hit counts before sinking', () => {
    let s = inProgress2P();
    const p2Cells = shipCellsOf(s, 'p2');
    // Fire 2 hits — not enough to sink any 3+ length ship.
    s = fireN(s, 'p1', p2Cells, 2);
    const { container } = render(
      <FleetStatus state={s} player="p2" reveal={false} title="P2 fleet" />,
    );
    // The header reveals "15/17 AFLOAT" (an aggregate already public via shot history).
    expect(summaryFor(container)).toBe(`${TOTAL_SHIP_CELLS - 2}/${TOTAL_SHIP_CELLS} AFLOAT`);
    // But individual ship rows must NOT expose per-ship damage counts:
    // every un-sunk row should read "Active" (no fractional X/N).
    const rows = container.querySelectorAll('[data-ship]');
    rows.forEach((row) => {
      const sunkAttr = row.getAttribute('data-sunk');
      if (sunkAttr === 'false') {
        // No "X/Y" fraction text.
        expect(row.textContent).not.toMatch(/\d+\/\d+/);
      }
    });
  });
});

describe('FleetStatus — duplicate shots do not alter the counter', () => {
  it('Firing the same cell twice does not change the displayed afloat count', () => {
    let s = inProgress2P();
    const p2Cells = shipCellsOf(s, 'p2');
    s = fireN(s, 'p1', p2Cells, 1);
    const after1 = JSON.parse(JSON.stringify(s));
    // Try to fire the same cell again. The engine must reject duplicates.
    s = { ...s, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
    s = reducer(s, { type: 'FIRE_SHOT', at: p2Cells[0], ts: 999 });
    expect(s.players.p1.shotsTaken.length).toBe(after1.players.p1.shotsTaken.length);
    const { container } = render(
      <FleetStatus state={s} player="p2" reveal={false} title="P2 fleet" />,
    );
    expect(summaryFor(container)).toBe(`${TOTAL_SHIP_CELLS - 1}/${TOTAL_SHIP_CELLS} AFLOAT`);
  });
});

describe('FleetStatus — RETURN_HOME / new game resets to 17/17', () => {
  it('After firing several shots, RETURN_HOME and starting a new game shows 17/17 again', () => {
    let s = inProgress2P();
    const p2Cells = shipCellsOf(s, 'p2');
    s = fireN(s, 'p1', p2Cells, 5);
    s = reducer(s, { type: 'RETURN_HOME' });
    // Now start fresh.
    s = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 99 });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 99 });
    s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 99 });
    s = reducer(s, { type: 'CONFIRM_READY' });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p2', seed: 100 });
    s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 99 });
    s = reducer(s, { type: 'CONFIRM_READY' });
    const { container } = render(
      <FleetStatus state={s} player="p2" reveal={false} title="P2 fleet" />,
    );
    expect(summaryFor(container)).toBe(`${TOTAL_SHIP_CELLS}/${TOTAL_SHIP_CELLS} AFLOAT`);
  });

  it('Rematch (START_REMATCH) returns counters to 17/17', () => {
    let s = inProgress2P();
    const p2Cells = shipCellsOf(s, 'p2');
    s = fireN(s, 'p1', p2Cells, TOTAL_SHIP_CELLS);
    expect(s.phase).toBe('game-over');
    s = reducer(s, { type: 'START_REMATCH', seed: 12345 });
    // Confirm both fleets back to fresh.
    const { container: c1 } = render(
      <FleetStatus state={s} player="p1" reveal title="P1 fleet" />,
    );
    expect(summaryFor(c1)).toBe(`${TOTAL_SHIP_CELLS}/${TOTAL_SHIP_CELLS} AFLOAT`);
    const { container: c2 } = render(
      <FleetStatus state={s} player="p2" reveal={false} title="P2 fleet" />,
    );
    expect(summaryFor(c2)).toBe(`${TOTAL_SHIP_CELLS}/${TOTAL_SHIP_CELLS} AFLOAT`);
  });
});

// Suppress eslint warnings on the noop (we keep it referenced via render props elsewhere).
void noop;
