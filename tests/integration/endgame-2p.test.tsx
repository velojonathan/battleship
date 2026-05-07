// QA hardening — Local 2P end-game framing + localStorage privacy.
//
// Bug discovered in QA: in Local 2P mode the EndGameScreen showed "Victory"
// to BOTH players, because `viewer` auto-resolves to `state.currentTurn`
// (which equals the player who fired the winning shot). That misleads the
// loser. The fix: in 2P, show neutral copy ("Battle complete") instead of
// the viewer-relative "Victory / Defeat" framing.
//
// To keep this test fast we drive the engine reducer directly to game-over
// and then mount EndGameScreen with the resulting state — we don't need to
// click through the entire 2P flow in the UI for a presentational assertion.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState, reducer } from '../../src/game/engine';
import type { Coord, GameState } from '../../src/game/types';
import { EndGameScreen } from '../../src/components/EndGameScreen';

function shipCellsOf(state: GameState, player: 'p1' | 'p2'): Coord[] {
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

/** Build a 2P state where p1 has just sunk every p2 ship. */
function gameOver2PState(seed = 11): GameState {
  let s = initialState();
  s = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  s = reducer(s, { type: 'CONFIRM_READY' });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p2', seed: seed + 1 });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  s = reducer(s, { type: 'CONFIRM_READY' });
  // Now in-progress, p1 fires.
  const cells = shipCellsOf(s, 'p2');
  let ts = 0;
  for (const c of cells) {
    s = { ...s, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
    s = reducer(s, { type: 'FIRE_SHOT', at: c, ts: ++ts });
    if (s.phase !== 'game-over') {
      s = reducer(s, { type: 'COMPLETE_TURN' });
    }
  }
  return s;
}

/** Build a solo state where p1 has just sunk every p2 ship. */
function gameOverSoloState(seed = 11): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  // CONFIRM_PLACEMENT in solo immediately starts the game.
  const cells = shipCellsOf(s, 'p2');
  let ts = 0;
  for (const c of cells) {
    s = { ...s, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
    s = reducer(s, { type: 'FIRE_SHOT', at: c, ts: ++ts });
    if (s.phase !== 'game-over') {
      s = reducer(s, { type: 'COMPLETE_TURN' });
    }
  }
  return s;
}

describe('Local 2P end-game banner (QA §7 — neutral framing)', () => {
  it('Banner uses neutral "Battle complete" copy in Local 2P mode', () => {
    const state = gameOver2PState();
    expect(state.phase).toBe('game-over');
    expect(state.mode).toBe('local-2p');

    const noop = (): void => undefined;
    render(<EndGameScreen state={state} dispatch={noop} viewer="p1" />);
    const banner = screen.getByLabelText(/end of battle/i);

    expect(banner.textContent).toMatch(/battle complete/i);
    // No misleading viewer-relative "Victory" / "Defeat" copy.
    expect(banner.textContent).not.toMatch(/victory/i);
    expect(banner.textContent).not.toMatch(/defeat/i);
  });

  it('Banner data-result is "neutral" in Local 2P (instead of "win"/"loss")', () => {
    const state = gameOver2PState();
    const noop = (): void => undefined;
    render(<EndGameScreen state={state} dispatch={noop} viewer="p1" />);
    const el = document.querySelector('[data-result]')!;
    expect(el.getAttribute('data-result')).toBe('neutral');
  });

  it('The same neutral framing is shown to BOTH viewers in Local 2P (no Victory bias)', () => {
    const state = gameOver2PState();
    const noop = (): void => undefined;
    // Render twice from each viewer perspective; both must see "Battle complete".
    const { unmount: u1 } = render(
      <EndGameScreen state={state} dispatch={noop} viewer="p1" />,
    );
    expect(screen.getByLabelText(/end of battle/i).textContent).toMatch(/battle complete/i);
    u1();
    render(<EndGameScreen state={state} dispatch={noop} viewer="p2" />);
    expect(screen.getByLabelText(/end of battle/i).textContent).toMatch(/battle complete/i);
  });
});

describe('Solo end-game banner (preserves existing Victory/Defeat copy)', () => {
  it('Solo Victory shows "Victory" to viewer p1 (regression — solo behavior unchanged)', () => {
    const state = gameOverSoloState();
    expect(state.mode).toBe('solo');
    expect(state.winner).toBe('p1');
    const noop = (): void => undefined;
    render(<EndGameScreen state={state} dispatch={noop} viewer="p1" />);
    const banner = screen.getByLabelText(/end of battle/i);
    expect(banner.textContent).toMatch(/victory/i);
    const el = document.querySelector('[data-result]')!;
    expect(el.getAttribute('data-result')).toBe('win');
  });

  it('Solo Defeat shows "Defeat" to viewer p2 (regression — solo behavior unchanged)', () => {
    const state = gameOverSoloState();
    // Render from p2's perspective: viewer is the AI, who lost.
    const noop = (): void => undefined;
    render(<EndGameScreen state={state} dispatch={noop} viewer="p2" />);
    const banner = screen.getByLabelText(/end of battle/i);
    expect(banner.textContent).toMatch(/defeat/i);
    const el = document.querySelector('[data-result]')!;
    expect(el.getAttribute('data-result')).toBe('loss');
  });
});

describe('Local 2P game flow does not write hidden state to localStorage (QA §4)', () => {
  it('After driving a full 2P game to game-over, localStorage holds no ship origins', () => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
    // Drive engine all the way to game-over.
    const state = gameOver2PState();
    expect(state.phase).toBe('game-over');

    // No keys at all should be set by the engine — and even if some persistence
    // is added later, it must not contain raw ship origins.
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)!;
      const v = window.localStorage.getItem(k) ?? '';
      expect(v).not.toMatch(/"origin":\s*\{/);
      expect(v).not.toMatch(/"orientation":\s*"[HV]"/);
      expect(v).not.toMatch(
        /"shipId":\s*"(carrier|battleship|cruiser|submarine|destroyer)"/,
      );
    }
  });
});
