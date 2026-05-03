import { useEffect, useRef } from 'react';
import { formatCoord } from '../game/coordinates';
import { SHIP_NAME } from '../game/constants';
import type { BattleLogEntry, GameState, PlayerId } from '../game/types';
import styles from './BattleLog.module.css';

export interface BattleLogProps {
  state: GameState;
  /** Maximum number of recent entries to display. Defaults to 50. */
  limit?: number;
}

function describe(entry: BattleLogEntry, names: Record<PlayerId, string>): string {
  const who = names[entry.by];
  const where = formatCoord(entry.at);
  switch (entry.outcome) {
    case 'miss':
      return `${who} fired at ${where} — miss.`;
    case 'hit':
      return `${who} fired at ${where} — direct hit!`;
    case 'sunk':
      return `${who} sank ${entry.sunkShipId ? SHIP_NAME[entry.sunkShipId] : 'the enemy ship'} at ${where}!`;
    default: {
      const _exhaustive: never = entry.outcome;
      void _exhaustive;
      return `${who} fired at ${where}.`;
    }
  }
}

export function BattleLog({ state, limit = 50 }: BattleLogProps): JSX.Element {
  const ref = useRef<HTMLOListElement>(null);
  const names: Record<PlayerId, string> = {
    p1: state.players.p1.name,
    p2: state.players.p2.name,
  };
  const recent = state.log.slice(-limit);

  useEffect(() => {
    // Always show the latest entry.
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [state.log.length]);

  return (
    <section className={styles.panel} aria-label="Battle log">
      <header className={styles.header}>
        <h2 className={styles.title}>Battle Log</h2>
        <span className={styles.turn}>Turn {Math.max(state.turnNumber, 1)}</span>
      </header>
      <ol className={styles.list} ref={ref} aria-live="polite">
        {recent.length === 0 && (
          <li className={`${styles.entry} ${styles.empty}`}>Awaiting first salvo…</li>
        )}
        {recent.map((entry) => (
          <li
            key={entry.id}
            className={`${styles.entry} ${styles[entry.outcome] ?? ''}`}
            data-outcome={entry.outcome}
          >
            <span className={styles.bullet} aria-hidden="true">
              {entry.outcome === 'sunk' ? '✕' : entry.outcome === 'hit' ? '!' : '·'}
            </span>
            <span className={styles.text}>{describe(entry, names)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
