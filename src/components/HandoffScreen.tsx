import { useEffect, useRef } from 'react';
import { allShipsPlaced } from '../game/placement';
import type { Action, GameState } from '../game/types';
import styles from './HandoffScreen.module.css';

export interface HandoffScreenProps {
  state: GameState;
  dispatch: (action: Action) => void;
}

/**
 * Handoff is rendered for two semantically different transitions that the
 * engine collectively models with `handoffReason`:
 *  - 'pre-place'  : next player still needs to place their fleet
 *                   (handoffReason === 'setup' AND that player's fleet is
 *                    not yet fully placed).
 *  - 'pre-battle' : both fleets are placed; next press starts/continues firing
 *                   (handoffReason === 'turn', OR 'setup' but the next
 *                    player's fleet is already fully placed — which the engine
 *                    emits after P2 finishes setup, transitioning straight
 *                    into the in-progress phase on CONFIRM_READY).
 */
type DisplayMode = 'pre-place' | 'pre-battle';

const KICKER: Record<DisplayMode, string> = {
  'pre-place': 'Setup',
  'pre-battle': 'Battle',
};

const HEADLINE: Record<DisplayMode, (name: string) => string> = {
  'pre-place': (name) => `${name}, place your fleet`,
  'pre-battle': (name) => `${name}, fire when ready`,
};

const HELP: Record<DisplayMode, string> = {
  'pre-place':
    'Pass the device to the next player privately. They will place their fleet hidden from you.',
  'pre-battle':
    'Pass the device to the next player privately. The board for the previous player has been cleared from view.',
};

/**
 * HandoffScreen is the privacy gate between every Local 2P phase change.
 *
 * Crucially, while this screen is rendered, NEITHER PlacementScreen NOR
 * GameScreen is mounted. That guarantees the inactive player's hidden ship
 * positions cannot leak into the DOM during the handoff.
 *
 * The screen renders the next player's name, a privacy notice, and a single
 * "I'm ready" button that dispatches CONFIRM_READY. Until that button is
 * pressed, no game data for the new player is rendered.
 */
export function HandoffScreen({ state, dispatch }: HandoffScreenProps): JSX.Element {
  const nextId = state.pendingHandoffTo;
  const reason = state.handoffReason;
  const nextName = nextId ? state.players[nextId].name : 'Next player';
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Auto-focus the ready button so keyboard users can immediately Enter.
  useEffect(() => {
    buttonRef.current?.focus();
  }, [nextId]);

  const onReady = (): void => {
    dispatch({ type: 'CONFIRM_READY' });
  };

  // Resolve the display mode from engine state. The engine reuses
  // handoffReason='setup' both for "you still need to place" AND for
  // "P2 just finished placing, P1 is up to fire". Distinguish them by
  // checking whether the next player's fleet is already placed.
  const mode: DisplayMode | null = (() => {
    if (!reason || !nextId) return null;
    if (reason === 'turn') return 'pre-battle';
    return allShipsPlaced(state.players[nextId].fleet) ? 'pre-battle' : 'pre-place';
  })();

  const kicker = mode ? KICKER[mode] : 'Handoff';
  const headline = mode ? HEADLINE[mode](nextName) : `${nextName}, ready?`;
  const help = mode ? HELP[mode] : 'Pass the device to the next player.';

  return (
    <section
      className={styles.screen}
      aria-label={`Handoff to ${nextName}`}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.card}>
        <p className={styles.kicker}>{kicker}</p>
        <h1 className={styles.title}>{headline}</h1>
        <p className={styles.help}>{help}</p>
        <button
          ref={buttonRef}
          type="button"
          className={styles.button}
          onClick={onReady}
          aria-label={`Confirm handoff to ${nextName}`}
        >
          I&apos;m ready
        </button>
      </div>
    </section>
  );
}
