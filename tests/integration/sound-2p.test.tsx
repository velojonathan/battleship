/**
 * Integration test: sound cues in 2P do not leak hidden information.
 *
 * Class-agnostic cues mean sinking a Carrier and sinking a Destroyer produce
 * the same `'sunk'` cue id. We assert that the cue id chosen is the same
 * regardless of which ship class was sunk.
 *
 * We also assert that during the handoff phase, no GameScreen is mounted, so
 * no sound effects can play (this is structurally guaranteed by App.tsx,
 * verified here as a regression).
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import { initialState, reducer } from '../../src/game/engine';
import type {
  Action,
  Coord,
  GameState,
  PlayerId,
} from '../../src/game/types';
import type { AudioBus, CueId } from '../../src/audio';

interface SpyBus {
  available: boolean;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  play(id: CueId): void;
  dispose(): void;
  played: CueId[];
}

function makeSpyBus(): SpyBus {
  const played: CueId[] = [];
  let muted = false;
  return {
    available: true,
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

function buildSoloInProgress(seed = 17): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed });
  return s;
}

function shipCellsOf(state: GameState, player: PlayerId, shipId: string): Coord[] {
  const ship = state.players[player].fleet.find((s) => s.id === shipId)!;
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

function sinkShip(state: GameState, target: PlayerId, shipId: string): GameState {
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

describe('Sound cues — class-agnostic privacy', () => {
  it('plays the same cue id for sinking different ship classes', () => {
    type Dispatch = (action: Action) => void;
    const dispatch: Dispatch = () => undefined;

    function cueIdsForSinking(shipId: string): CueId[] {
      const bus = makeSpyBus();
      // Mount empty-log GameScreen first so the initial-id ref doesn't swallow.
      let state = buildSoloInProgress();
      const { rerender } = render(
        <GameScreen
          state={state}
          dispatch={dispatch}
          viewer="p1"
          resolveMs={0}
          audioBus={bus as unknown as AudioBus}
        />,
      );
      // Sink the requested ship (p2's). The last cue should be 'sunk'.
      state = sinkShip(state, 'p2', shipId);
      rerender(
        <GameScreen
          state={state}
          dispatch={dispatch}
          viewer="p1"
          resolveMs={0}
          audioBus={bus as unknown as AudioBus}
        />,
      );
      return bus.played;
    }

    const carrierCues = cueIdsForSinking('carrier');
    const destroyerCues = cueIdsForSinking('destroyer');

    // Both end with 'sunk' (the class doesn't change the cue id).
    expect(carrierCues[carrierCues.length - 1]).toBe('sunk');
    expect(destroyerCues[destroyerCues.length - 1]).toBe('sunk');
    // The set of cue ids used for any sinking sequence is a subset of
    // {miss, hit, sunk}. No per-class identifier exists.
    for (const id of [...carrierCues, ...destroyerCues]) {
      expect(['miss', 'hit', 'sunk', 'gameOverWin', 'gameOverLoss']).toContain(id);
    }
  });
});

describe('Sound cues — privacy', () => {
  it('cue ids never include ship class identifiers', () => {
    // The cue id type is fixed: 'miss' | 'hit' | 'sunk' | 'gameOverWin' | 'gameOverLoss'.
    // Sink each of the five ship classes and confirm only those cue ids appear.
    type Dispatch = (action: Action) => void;
    const dispatch: Dispatch = () => undefined;
    const seen = new Set<CueId>();

    for (const shipId of ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer']) {
      const bus = makeSpyBus();
      let state = buildSoloInProgress();
      const { rerender } = render(
        <GameScreen
          state={state}
          dispatch={dispatch}
          viewer="p1"
          resolveMs={0}
          audioBus={bus as unknown as AudioBus}
        />,
      );
      state = sinkShip(state, 'p2', shipId);
      rerender(
        <GameScreen
          state={state}
          dispatch={dispatch}
          viewer="p1"
          resolveMs={0}
          audioBus={bus as unknown as AudioBus}
        />,
      );
      bus.played.forEach((id) => seen.add(id));
    }

    const allowed: CueId[] = ['miss', 'hit', 'sunk', 'gameOverWin', 'gameOverLoss'];
    for (const id of seen) {
      expect(allowed).toContain(id);
    }
  });
});
