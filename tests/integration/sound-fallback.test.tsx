/**
 * Integration test: app must remain fully functional when Web Audio is
 * unavailable in the browser (e.g. older browsers, locked-down embeds, the
 * "no AudioContext" path). The sound toggle becomes disabled and clearly
 * labeled "Sound unavailable" but no errors are thrown.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import { initialState, reducer } from '../../src/game/engine';
import type { Action, Coord, GameState } from '../../src/game/types';

const originalAudioContext = (window as unknown as { AudioContext?: unknown }).AudioContext;
const originalWebkit = (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;

beforeEach(() => {
  // Simulate "no Web Audio" — both constructors absent.
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
});

afterEach(() => {
  if (originalAudioContext === undefined) {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  } else {
    (window as unknown as { AudioContext: unknown }).AudioContext = originalAudioContext;
  }
  if (originalWebkit === undefined) {
    delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
  } else {
    (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = originalWebkit;
  }
});

function buildSoloInProgress(seed = 17): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  return s;
}

describe('Sound — graceful degradation when Web Audio is unavailable', () => {
  it('renders the GameScreen and toggle without throwing', () => {
    const state = buildSoloInProgress();
    const dispatch: (a: Action) => void = () => undefined;
    expect(() => {
      render(
        <GameScreen state={state} dispatch={dispatch} viewer="p1" resolveMs={0} />,
      );
    }).not.toThrow();
    const toggle = screen.getByTestId('sound-toggle');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-label', 'Sound unavailable');
  });

  it('firing a shot with no Web Audio does not throw', () => {
    let state = buildSoloInProgress();
    const carrier = state.players.p2.fleet.find((s) => s.id === 'carrier')!;
    const at: Coord = { row: carrier.origin!.row, col: carrier.origin!.col };
    state = reducer(state, { type: 'FIRE_SHOT', at, ts: 1 });

    const dispatch: (a: Action) => void = () => undefined;
    const { rerender } = render(
      <GameScreen state={state} dispatch={dispatch} viewer="p1" resolveMs={0} />,
    );
    state = { ...state, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
    state = reducer(state, {
      type: 'FIRE_SHOT',
      at: { row: at.row, col: at.col + 1 },
      ts: 2,
    });
    expect(() => {
      rerender(
        <GameScreen state={state} dispatch={dispatch} viewer="p1" resolveMs={0} />,
      );
    }).not.toThrow();
  });

  it('disabled toggle does not toggle on click (aria-pressed not set)', () => {
    const state = buildSoloInProgress();
    const dispatch: (a: Action) => void = () => undefined;
    render(<GameScreen state={state} dispatch={dispatch} viewer="p1" resolveMs={0} />);
    const toggle = screen.getByTestId('sound-toggle');
    fireEvent.click(toggle);
    // aria-pressed only appears when the toggle is interactive.
    expect(toggle).not.toHaveAttribute('aria-pressed');
  });
});
