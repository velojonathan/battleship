import { useEffect, useRef } from 'react';
import { computeAIMove } from '../game/ai';
import { mulberry32 } from '../game/rng';
import { buildPublicView } from '../game/publicView';
import type { Action, GameState, PlayerId } from '../game/types';

export interface UseAITurnOptions {
  state: GameState;
  dispatch: (action: Action) => void;
  /** Delay before the AI shot is fired (lets the human see the board). */
  thinkMs?: number;
  /** Delay between FIRE_SHOT and COMPLETE_TURN — covers the hit/miss/sunk animation. */
  resolveMs?: number;
  /** Override timestamp source (used in tests). */
  now?: () => number;
  /** Override RNG seed (used in tests). Defaults to state.rngSeed + turn count. */
  seedOverride?: number;
}

interface InFlight {
  forTurn: number;
  cancel: () => void;
}

/**
 * Drives the AI's turn during solo play.
 *
 * Uses `state.turnNumber` to identify a single AI action chain. Once a chain
 * is scheduled for turn N, subsequent re-renders for the same turn do nothing
 * — they don't re-arm and they don't cancel. A chain is cancelled only when
 * the phase leaves 'in-progress', a winner appears, or the component unmounts.
 *
 * This is what prevents a "ghost" AI shot after RETURN_HOME, rematch, or
 * unmount, while still allowing the FIRE_SHOT → COMPLETE_TURN micro-cascade
 * to complete reliably mid-render-storm.
 */
export function useAITurn({
  state,
  dispatch,
  thinkMs = 700,
  resolveMs = 700,
  now = () => Date.now(),
  seedOverride,
}: UseAITurnOptions): void {
  const inFlight = useRef<InFlight | null>(null);

  // Unmount cleanup only — never cancel mid-chain on dep changes.
  useEffect(() => {
    return () => {
      if (inFlight.current) {
        inFlight.current.cancel();
        inFlight.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // If we left 'in-progress' (rematch, return home, game-over), cancel any
    // pending AI work. We INTENTIONALLY don't cancel on winner-set-but-still-
    // in-progress: the AI's resolveTimer must run to dispatch COMPLETE_TURN,
    // which is what transitions the engine to 'game-over'.
    if (state.phase !== 'in-progress') {
      if (inFlight.current) {
        inFlight.current.cancel();
        inFlight.current = null;
      }
      return;
    }

    // If a chain for the current turn is in-flight, never re-arm or cancel —
    // let it complete naturally (it will dispatch COMPLETE_TURN, which is what
    // moves the game to either the next turn or 'game-over' on a winning shot).
    if (inFlight.current && inFlight.current.forTurn === state.turnNumber) return;

    // From here on, no chain is in flight for the current turn. Decide whether
    // to start one.
    if (state.winner !== null) return;
    const shooter: PlayerId = state.currentTurn;
    const shooterPlayer = state.players[shooter];
    if (shooterPlayer.kind !== 'ai') {
      // Human's turn — drop any in-flight AI work belonging to a previous turn.
      if (inFlight.current) {
        inFlight.current.cancel();
        inFlight.current = null;
      }
      return;
    }

    // Cancel any stale chain belonging to a previous turn.
    if (inFlight.current) {
      inFlight.current.cancel();
      inFlight.current = null;
    }

    let cancelled = false;
    let thinkTimer: ReturnType<typeof setTimeout> | null = null;
    let resolveTimer: ReturnType<typeof setTimeout> | null = null;

    const cancel = (): void => {
      cancelled = true;
      if (thinkTimer !== null) clearTimeout(thinkTimer);
      if (resolveTimer !== null) clearTimeout(resolveTimer);
    };

    const myTurn = state.turnNumber;
    inFlight.current = { forTurn: myTurn, cancel };

    thinkTimer = setTimeout(() => {
      if (cancelled) return;
      const target = state.players[shooter === 'p1' ? 'p2' : 'p1'];
      const view = buildPublicView(target, shooterPlayer.shotsTaken);
      const memory = shooterPlayer.aiMemory ?? {
        shotsFired: [],
        unresolvedHits: [],
        orientationHypothesis: null,
      };
      const seed = seedOverride ?? state.rngSeed + myTurn * 1009 + 7919;
      const rng = mulberry32(seed);
      const { target: at } = computeAIMove({
        view,
        memory,
        difficulty: state.difficulty,
        rng,
      });
      dispatch({ type: 'FIRE_SHOT', at, ts: now() });
      resolveTimer = setTimeout(() => {
        if (cancelled) return;
        dispatch({ type: 'COMPLETE_TURN' });
        if (inFlight.current && inFlight.current.forTurn === myTurn) {
          inFlight.current = null;
        }
      }, resolveMs);
    }, thinkMs);
  }, [
    state.phase,
    state.currentTurn,
    state.winner,
    state.turnNumber,
    state.rngSeed,
    state.difficulty,
    state.players,
    dispatch,
    thinkMs,
    resolveMs,
    now,
    seedOverride,
  ]);
}
