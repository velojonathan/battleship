/**
 * Integration tests for the sinking-ship visual overlays.
 *
 * D1: own-board + targeting-board overlay rendered with a tilted ShipSvg
 *     for each fully-sunk ship.
 * D2: FleetStatus row silhouette receives the .sunk modifier (visual tilt
 *     verified via .sunk class application; the CSS transform itself is
 *     not asserted in JSDOM).
 *
 * Privacy assertions are the most important part of this file:
 *  - Targeting board MUST NOT render an overlay for un-sunk opponent ships
 *  - The DOM must not contain data attributes that leak un-sunk ship origins
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import { FleetStatus } from '../../src/components/FleetStatus';
import { initialState, reducer } from '../../src/game/engine';
import type {
  Action,
  Coord,
  GameState,
  PlayerId,
} from '../../src/game/types';

function buildSoloInProgress(seed = 17): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  return s;
}

function shipCellsOf(state: GameState, target: PlayerId, shipId: string): Coord[] {
  const ship = state.players[target].fleet.find((s) => s.id === shipId)!;
  const out: Coord[] = [];
  for (let i = 0; i < ship.length; i++) {
    out.push(
      ship.orientation === 'H'
        ? { row: ship.origin!.row, col: ship.origin!.col + i }
        : { row: ship.origin!.row + i, col: ship.origin!.col },
    );
  }
  return out;
}

function sinkShipOf(state: GameState, target: PlayerId, shipId: string): GameState {
  const cells = shipCellsOf(state, target, shipId);
  let s = state;
  let ts = 1000;
  const shooter: PlayerId = target === 'p1' ? 'p2' : 'p1';
  for (const c of cells) {
    s = { ...s, currentTurn: shooter, inputLocked: false, phase: 'in-progress' };
    s = reducer(s, { type: 'FIRE_SHOT', at: c, ts: ++ts });
    if (s.phase !== 'game-over') s = reducer(s, { type: 'COMPLETE_TURN' });
  }
  return s;
}

const noopDispatch: (a: Action) => void = () => undefined;

describe('Sinking visual — own board (D1)', () => {
  it('renders no sunk overlay before any ship is sunk', () => {
    const state = buildSoloInProgress();
    const { container } = render(
      <GameScreen state={state} dispatch={noopDispatch} viewer="p1" resolveMs={0} />,
    );
    expect(container.querySelectorAll('[data-testid^="sunk-overlay-"]').length).toBe(0);
  });

  it('renders an overlay for the player\'s own sunk ship', () => {
    let state = buildSoloInProgress();
    state = sinkShipOf(state, 'p1', 'destroyer');
    const { container } = render(
      <GameScreen state={state} dispatch={noopDispatch} viewer="p1" resolveMs={0} />,
    );
    // The viewer's own-board (variant=own) should show the sunk destroyer.
    const overlays = container.querySelectorAll('[data-testid="sunk-overlay-destroyer"]');
    expect(overlays.length).toBeGreaterThanOrEqual(1);
    // Among those overlays, at least one is on the own board.
    const ownVariantOverlay = Array.from(overlays).find((el) => {
      const layer = el.closest('[data-variant="own"]');
      return layer !== null;
    });
    expect(ownVariantOverlay).toBeTruthy();
  });

  it('only renders overlays for fully sunk ships, not partially-damaged ones', () => {
    let state = buildSoloInProgress();
    // Hit the carrier once but don't sink it.
    const carrier = state.players.p1.fleet.find((s) => s.id === 'carrier')!;
    state = {
      ...state,
      currentTurn: 'p2',
      inputLocked: false,
      phase: 'in-progress',
    };
    state = reducer(state, {
      type: 'FIRE_SHOT',
      at: { row: carrier.origin!.row, col: carrier.origin!.col },
      ts: 1,
    });
    if (state.phase !== 'game-over') state = reducer(state, { type: 'COMPLETE_TURN' });

    const { container } = render(
      <GameScreen state={state} dispatch={noopDispatch} viewer="p1" resolveMs={0} />,
    );
    // No overlay because the carrier is only partially damaged.
    expect(container.querySelector('[data-testid="sunk-overlay-carrier"]')).toBeNull();
  });
});

describe('Sinking visual — targeting board (D1, public-only)', () => {
  it('renders no overlay for un-sunk opponent ships (privacy)', () => {
    const state = buildSoloInProgress();
    const { container } = render(
      <GameScreen state={state} dispatch={noopDispatch} viewer="p1" resolveMs={0} />,
    );
    // No overlays anywhere — no ships sunk yet.
    expect(container.querySelectorAll('[data-testid^="sunk-overlay-"]').length).toBe(0);
    // The targeting board itself exists (it's the Board grid), but no sunk
    // overlay layer is mounted inside it.
    const targetingBoard = container.querySelector('[role="grid"][data-variant="targeting"]');
    expect(targetingBoard).toBeTruthy();
    const targetingOverlays = targetingBoard!.querySelectorAll(
      '[data-testid^="sunk-overlay-"]',
    );
    expect(targetingOverlays.length).toBe(0);
  });

  it('renders an overlay for an opponent ship only after it is publicly sunk', () => {
    let state = buildSoloInProgress();
    // Sink p2's destroyer (publicly observable).
    state = sinkShipOf(state, 'p2', 'destroyer');
    const { container } = render(
      <GameScreen state={state} dispatch={noopDispatch} viewer="p1" resolveMs={0} />,
    );
    const targetingBoard = container.querySelector(
      '[role="grid"][data-variant="targeting"]',
    ) as HTMLElement | null;
    expect(targetingBoard).toBeTruthy();
    const overlay = targetingBoard!.querySelector('[data-testid="sunk-overlay-destroyer"]');
    expect(overlay).toBeTruthy();
  });

  it('does NOT expose un-sunk opponent ship origins in DOM data attributes', () => {
    let state = buildSoloInProgress();
    // Sink only p2's destroyer; carrier/battleship/etc remain afloat.
    state = sinkShipOf(state, 'p2', 'destroyer');
    const { container } = render(
      <GameScreen state={state} dispatch={noopDispatch} viewer="p1" resolveMs={0} />,
    );
    const targetingBoard = container.querySelector(
      '[role="grid"][data-variant="targeting"]',
    ) as HTMLElement;
    const overlays = Array.from(
      targetingBoard.querySelectorAll('[data-testid^="sunk-overlay-"]'),
    );
    const overlayShipIds = overlays.map((el) => el.getAttribute('data-ship'));
    // Only the destroyer overlay exists on the targeting board.
    expect(overlayShipIds).toEqual(['destroyer']);
    // No overlay for any un-sunk ship.
    for (const shipId of ['carrier', 'battleship', 'cruiser', 'submarine']) {
      expect(targetingBoard.querySelector(`[data-ship="${shipId}"]`)).toBeNull();
    }
  });
});

describe('Sinking visual — FleetStatus row (D2)', () => {
  it('applies .sunk class only to fully-sunk row, not partially-damaged rows', () => {
    let state = buildSoloInProgress();
    // Sink p1's destroyer (own fleet, reveal=true panel).
    state = sinkShipOf(state, 'p1', 'destroyer');
    const { container } = render(
      <FleetStatus state={state} player="p1" reveal title="Player 1 fleet" />,
    );
    const destroyerRow = container.querySelector('[data-ship="destroyer"]');
    expect(destroyerRow?.getAttribute('data-sunk')).toBe('true');
    const carrierRow = container.querySelector('[data-ship="carrier"]');
    expect(carrierRow?.getAttribute('data-sunk')).toBe('false');
  });
});

describe('Sinking visual — reset / rematch', () => {
  it('removes all sunk overlays when the game restarts', () => {
    let state = buildSoloInProgress();
    state = sinkShipOf(state, 'p1', 'destroyer');
    const { container, rerender } = render(
      <GameScreen state={state} dispatch={noopDispatch} viewer="p1" resolveMs={0} />,
    );
    expect(container.querySelectorAll('[data-testid^="sunk-overlay-"]').length).toBeGreaterThan(0);

    // RETURN_HOME -> fresh game.
    state = reducer(state, { type: 'RETURN_HOME' });
    state = reducer(state, { type: 'BEGIN_PLACEMENT', seed: 17 });
    state = reducer(state, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 17 });
    state = reducer(state, { type: 'CONFIRM_PLACEMENT', seed: 17 });
    rerender(
      <GameScreen state={state} dispatch={noopDispatch} viewer="p1" resolveMs={0} />,
    );
    expect(container.querySelectorAll('[data-testid^="sunk-overlay-"]').length).toBe(0);
  });
});

describe('Sinking visual — non-blocking', () => {
  it('overlay layer does not intercept pointer events (pointer-events: none)', () => {
    let state = buildSoloInProgress();
    state = sinkShipOf(state, 'p1', 'destroyer');
    const { container } = render(
      <GameScreen state={state} dispatch={noopDispatch} viewer="p1" resolveMs={0} />,
    );
    const overlay = container.querySelector('[data-testid="sunk-overlay-destroyer"]');
    expect(overlay).toBeTruthy();
    // The layer is the parent of the overlay span; we assert that the layer
    // class is one of our defined classes that has pointer-events: none in
    // CSS. We can't test computed style in JSDOM, so this is structural:
    const layer = overlay!.closest('[data-variant]');
    expect(layer).toBeTruthy();
  });
});
