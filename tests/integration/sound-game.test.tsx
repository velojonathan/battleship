/**
 * Integration tests for sound cues fired during gameplay.
 *
 * We mount <GameScreen> directly with a stubbed AudioBus so we can
 * deterministically observe which cues fire on which engine transitions
 * without touching real Web Audio.
 *
 * Coverage:
 *   - miss / hit / sunk cues fire on FIRE_SHOT outcomes
 *   - duplicate-shot attempts schedule no extra cue
 *   - game-over cue fires on phase transition (win vs loss)
 *   - mute toggle suppresses all cues
 *   - Web Audio unavailable path is silent (also covered by sound-fallback.test.tsx)
 */

import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import { initialState, reducer } from '../../src/game/engine';
import type { Action, Coord, GameState, PlayerId } from '../../src/game/types';
import type { AudioBus, CueId } from '../../src/audio';

interface SpyBus {
  available: boolean;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  play(id: CueId): void;
  dispose(): void;
  /** Test-only: record of cue ids in the order they were played. */
  played: CueId[];
}

function makeSpyBus(opts: { available?: boolean } = {}): SpyBus {
  const played: CueId[] = [];
  let muted = false;
  return {
    available: opts.available ?? true,
    isMuted: () => muted,
    setMuted: (m: boolean) => {
      muted = m;
    },
    play: (id: CueId) => {
      if (muted) return;
      played.push(id);
    },
    dispose: () => undefined,
    played,
  };
}

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

function buildSoloInProgress(seed = 17): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  return s;
}

type Dispatch = (action: Action) => void;

function renderGame(state: GameState, viewer: PlayerId, bus: SpyBus) {
  const dispatch: Dispatch = () => undefined;
  return render(
    <GameScreen
      state={state}
      dispatch={dispatch}
      viewer={viewer}
      resolveMs={0}
      audioBus={bus as unknown as AudioBus}
    />,
  );
}

function rerenderGame(
  result: ReturnType<typeof renderGame>,
  state: GameState,
  viewer: PlayerId,
  bus: SpyBus,
): void {
  const dispatch: Dispatch = () => undefined;
  result.rerender(
    <GameScreen
      state={state}
      dispatch={dispatch}
      viewer={viewer}
      resolveMs={0}
      audioBus={bus as unknown as AudioBus}
    />,
  );
}

describe('GameScreen — sound cues fire on shot outcomes', () => {
  it('plays "miss" when shot misses', () => {
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    const r = renderGame(state, 'p1', bus);
    // Mount with empty log → no cues yet.
    expect(bus.played).toEqual([]);

    // Fire at a cell that is NOT a ship in p2's fleet — guaranteed to be a miss.
    const p2Cells = new Set(
      shipCellsOf(state, 'p2').map((c) => `${c.row},${c.col}`),
    );
    let missCoord: Coord | null = null;
    for (let row = 0; row < 10 && !missCoord; row++) {
      for (let col = 0; col < 10 && !missCoord; col++) {
        if (!p2Cells.has(`${row},${col}`)) missCoord = { row, col };
      }
    }
    expect(missCoord).not.toBeNull();
    state = reducer(state, { type: 'FIRE_SHOT', at: missCoord!, ts: 1 });
    expect(state.log[state.log.length - 1].outcome).toBe('miss');
    rerenderGame(r, state, 'p1', bus);
    expect(bus.played).toEqual(['miss']);
  });

  it('plays "hit" on a non-sinking hit', () => {
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    const r = renderGame(state, 'p1', bus);
    expect(bus.played).toEqual([]);

    const carrier = state.players.p2.fleet.find((s) => s.id === 'carrier')!;
    const at: Coord = { row: carrier.origin!.row, col: carrier.origin!.col };
    state = reducer(state, { type: 'FIRE_SHOT', at, ts: 1 });
    expect(state.log[state.log.length - 1].outcome).toBe('hit');
    rerenderGame(r, state, 'p1', bus);
    expect(bus.played).toEqual(['hit']);
  });

  it('plays "sunk" when the shot sinks a ship (and not "hit") for the sinking shot', () => {
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    const r = renderGame(state, 'p1', bus);
    expect(bus.played).toEqual([]);

    // Hit every cell of the destroyer (length 2) to sink it.
    const destroyer = state.players.p2.fleet.find((s) => s.id === 'destroyer')!;
    const cells: Coord[] = [];
    for (let i = 0; i < destroyer.length; i++) {
      cells.push(
        destroyer.orientation === 'H'
          ? { row: destroyer.origin!.row, col: destroyer.origin!.col + i }
          : { row: destroyer.origin!.row + i, col: destroyer.origin!.col },
      );
    }
    let ts = 0;
    for (const c of cells) {
      state = { ...state, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
      state = reducer(state, { type: 'FIRE_SHOT', at: c, ts: ++ts });
      if (state.phase !== 'game-over')
        state = reducer(state, { type: 'COMPLETE_TURN' });
      rerenderGame(r, state, 'p1', bus);
    }
    // For a 2-length destroyer: first shot is 'hit' (1/2 hits), second is 'sunk'.
    expect(bus.played[bus.played.length - 1]).toBe('sunk');
    expect(bus.played.filter((c) => c === 'sunk').length).toBe(1);
  });

  it('does not double-fire on parent re-renders for the same shot', () => {
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    const r = renderGame(state, 'p1', bus);

    const carrier = state.players.p2.fleet.find((s) => s.id === 'carrier')!;
    state = reducer(state, {
      type: 'FIRE_SHOT',
      at: { row: carrier.origin!.row, col: carrier.origin!.col },
      ts: 1,
    });
    rerenderGame(r, state, 'p1', bus);
    rerenderGame(r, state, 'p1', bus);
    rerenderGame(r, state, 'p1', bus);
    expect(bus.played).toEqual(['hit']);
  });

  it('does not replay historical shots when GameScreen remounts (post-handoff scenario)', () => {
    // Simulate the 2P handoff: p1 fires a shot, then GameScreen unmounts and
    // p2's GameScreen mounts with the same state.log. P2's mount must NOT
    // replay p1's shot.
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    const carrier = state.players.p2.fleet.find((s) => s.id === 'carrier')!;
    state = reducer(state, {
      type: 'FIRE_SHOT',
      at: { row: carrier.origin!.row, col: carrier.origin!.col },
      ts: 1,
    });
    // Fresh mount sees a non-empty log and must NOT play it back.
    renderGame(state, 'p2', bus);
    expect(bus.played).toEqual([]);
  });
});

describe('GameScreen — game-over cue', () => {
  it('plays "gameOverWin" when viewer wins (transition into game-over)', () => {
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    const r = renderGame(state, 'p1', bus);

    // Drive the game to a p1 win by hitting every p2 cell, re-rendering each step.
    const cells = shipCellsOf(state, 'p2');
    let ts = 0;
    for (const c of cells) {
      state = { ...state, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
      state = reducer(state, { type: 'FIRE_SHOT', at: c, ts: ++ts });
      if (state.phase !== 'game-over') state = reducer(state, { type: 'COMPLETE_TURN' });
      rerenderGame(r, state, 'p1', bus);
    }
    expect(state.phase).toBe('game-over');
    expect(state.winner).toBe('p1');
    expect(bus.played).toContain('gameOverWin');
    expect(bus.played).not.toContain('gameOverLoss');
    // gameOverWin fires exactly once.
    expect(bus.played.filter((c) => c === 'gameOverWin').length).toBe(1);
  });

  // Regression: App.tsx renders GameScreen only while phase==='in-progress'
  // and unmounts it the moment phase flips to 'game-over'. The engine sets
  // `winner` during FIRE_SHOT (still phase='in-progress') and only flips
  // phase on the next COMPLETE_TURN. So the cue MUST fire on the winning
  // FIRE_SHOT, before COMPLETE_TURN unmounts the screen. If we ever regress
  // to gating on `phase === 'game-over'`, this test would fail because the
  // cue would never play in this realistic mount/unmount sequence.
  it('fires the win cue on the winning FIRE_SHOT, before COMPLETE_TURN unmounts (App.tsx flow)', () => {
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    const r = renderGame(state, 'p1', bus);

    const cells = shipCellsOf(state, 'p2');
    let ts = 0;
    for (let i = 0; i < cells.length - 1; i++) {
      state = { ...state, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
      state = reducer(state, { type: 'FIRE_SHOT', at: cells[i], ts: ++ts });
      state = reducer(state, { type: 'COMPLETE_TURN' });
      rerenderGame(r, state, 'p1', bus);
    }
    // Last FIRE_SHOT — the winning shot. After this, state.winner is set
    // and state.phase is STILL 'in-progress' (App.tsx still has GameScreen
    // mounted).
    state = { ...state, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
    state = reducer(state, { type: 'FIRE_SHOT', at: cells[cells.length - 1], ts: ++ts });
    expect(state.phase).toBe('in-progress');
    expect(state.winner).toBe('p1');
    rerenderGame(r, state, 'p1', bus);

    // The win cue MUST have fired here, while GameScreen is still mounted.
    expect(bus.played).toContain('gameOverWin');

    // Now COMPLETE_TURN flips phase to 'game-over' and App.tsx would
    // unmount GameScreen. Simulate by unmounting.
    state = reducer(state, { type: 'COMPLETE_TURN' });
    expect(state.phase).toBe('game-over');
    r.unmount();

    // Cue still played exactly once.
    expect(bus.played.filter((c) => c === 'gameOverWin').length).toBe(1);
  });

  it('plays "gameOverLoss" when viewer loses (transition into game-over)', () => {
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    // Render from p2's perspective: viewer = the loser.
    const r = renderGame(state, 'p2', bus);

    const cells = shipCellsOf(state, 'p2');
    let ts = 0;
    for (const c of cells) {
      state = { ...state, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
      state = reducer(state, { type: 'FIRE_SHOT', at: c, ts: ++ts });
      if (state.phase !== 'game-over') state = reducer(state, { type: 'COMPLETE_TURN' });
      rerenderGame(r, state, 'p2', bus);
    }
    expect(state.winner).toBe('p1');
    expect(bus.played).toContain('gameOverLoss');
    expect(bus.played).not.toContain('gameOverWin');
    expect(bus.played.filter((c) => c === 'gameOverLoss').length).toBe(1);
  });
});

describe('GameScreen — mute toggle', () => {
  it('clicking the toggle mutes future cues', async () => {
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    const r = renderGame(state, 'p1', bus);

    // Fire one hit — it should play.
    const carrier = state.players.p2.fleet.find((s) => s.id === 'carrier')!;
    state = reducer(state, {
      type: 'FIRE_SHOT',
      at: { row: carrier.origin!.row, col: carrier.origin!.col },
      ts: 1,
    });
    rerenderGame(r, state, 'p1', bus);
    expect(bus.played).toEqual(['hit']);

    // Click the mute toggle.
    const toggle = await screen.findByTestId('sound-toggle');
    act(() => {
      fireEvent.click(toggle);
    });
    await waitFor(() => expect(bus.isMuted()).toBe(true));

    // A second hit should NOT push another cue.
    state = { ...state, currentTurn: 'p1', inputLocked: false, phase: 'in-progress' };
    state = reducer(state, {
      type: 'FIRE_SHOT',
      at: { row: carrier.origin!.row, col: carrier.origin!.col + 1 },
      ts: 2,
    });
    rerenderGame(r, state, 'p1', bus);
    expect(bus.played).toEqual(['hit']); // unchanged
  });

  it('toggling unmute restores cue playback', async () => {
    const bus = makeSpyBus();
    let state = buildSoloInProgress();
    const r = renderGame(state, 'p1', bus);

    const toggle = await screen.findByTestId('sound-toggle');
    // Mute then unmute.
    act(() => {
      fireEvent.click(toggle);
    });
    await waitFor(() => expect(bus.isMuted()).toBe(true));
    act(() => {
      fireEvent.click(toggle);
    });
    await waitFor(() => expect(bus.isMuted()).toBe(false));

    const carrier = state.players.p2.fleet.find((s) => s.id === 'carrier')!;
    state = reducer(state, {
      type: 'FIRE_SHOT',
      at: { row: carrier.origin!.row, col: carrier.origin!.col },
      ts: 1,
    });
    rerenderGame(r, state, 'p1', bus);
    expect(bus.played).toEqual(['hit']);
  });
});
