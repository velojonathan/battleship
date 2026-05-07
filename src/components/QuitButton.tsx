import { useCallback } from 'react';
import type { Action } from '../game/types';
import styles from './QuitButton.module.css';

export interface QuitButtonProps {
  dispatch: (action: Action) => void;
  /**
   * When true, ask the user via window.confirm() before quitting. Used during
   * placement and active gameplay so a stray click doesn't trash a session.
   */
  confirm?: boolean;
  /**
   * Custom prompt text. Defaults to a generic message describing what's lost.
   */
  confirmText?: string;
  label?: string;
}

const DEFAULT_CONFIRM =
  'Quit to home? The current placement and any in-progress game will be lost.';

/**
 * Small text-style button that returns the player to the home screen.
 *
 * Wires up the engine's existing RETURN_HOME action — which is allowed from
 * every phase — so QA scenarios "Restart from setup", "Restart from active
 * game", "Restart during AI turn", and "Restart during animation" actually
 * have a UI surface.
 */
export function QuitButton({
  dispatch,
  confirm = true,
  confirmText = DEFAULT_CONFIRM,
  label = 'Quit',
}: QuitButtonProps): JSX.Element {
  const onClick = useCallback(() => {
    if (confirm) {
      const ok =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(confirmText)
          : true;
      if (!ok) return;
    }
    dispatch({ type: 'RETURN_HOME' });
  }, [dispatch, confirm, confirmText]);

  return (
    <button
      type="button"
      className={styles.quit}
      onClick={onClick}
      aria-label="Quit to home"
    >
      {label}
    </button>
  );
}
