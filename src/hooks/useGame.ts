import { useCallback, useReducer } from 'react';
import { initialState, reducer, type InitialStateOptions } from '../game/engine';
import type { Action, GameState } from '../game/types';

export type UseGameOptions = InitialStateOptions;

export interface UseGame {
  state: GameState;
  dispatch: (action: Action) => void;
}

/**
 * Lightweight wrapper around `useReducer` that owns the game's `GameState`.
 *
 * The engine reducer is pure, framework-independent, and does not access
 * `Date.now()` or `Math.random()`. Components dispatch actions and render
 * state — they never compute game rules themselves.
 */
export function useGame(opts: UseGameOptions = {}): UseGame {
  const [state, dispatch] = useReducer(reducer, opts, (o) => initialState(o));
  // Stable dispatch identity for memoization downstream.
  const stableDispatch = useCallback((action: Action) => dispatch(action), []);
  return { state, dispatch: stableDispatch };
}
