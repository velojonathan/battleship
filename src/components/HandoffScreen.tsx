import { useEffect, useRef } from 'react';
import type { Action, GameState, HandoffReason } from '../game/types';
import styles from './HandoffScreen.module.css';

export interface HandoffScreenProps {
  state: GameState;
  dispatch: (action: Action) => void;
}

const REASON_KICKER: Record<HandoffReason, string> = {
  setup: 'Setup',
  turn: 'Battle',
};

const REASON_HEADLINE: Record<HandoffReason, (name: string) => string> = {
  setup: (name) => `${name}, place your fleet`,
  turn: (name) => `${name}, fire when ready`,
};

const REASON_HELP: Record<HandoffReason, string> = {
  setup: 'Pass the device to the next player privately. They will place their fleet hidden from you.',
  turn: 'Pass the device to the next player privately. The board for the previous player has been cleared from view.',
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

  // Defensive: if reason or pendingHandoffTo is somehow null (shouldn't happen),
  // render a generic "ready" prompt that still completes the handoff.
  const kicker = reason ? REASON_KICKER[reason] : 'Handoff';
  const headline = reason ? REASON_HEADLINE[reason](nextName) : `${nextName}, ready?`;
  const help = reason ? REASON_HELP[reason] : 'Pass the device to the next player.';

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
