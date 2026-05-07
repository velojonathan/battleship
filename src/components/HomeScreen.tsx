import { useCallback, useState } from 'react';
import type { Action, Difficulty, GameState, Mode } from '../game/types';
import styles from './HomeScreen.module.css';

export interface HomeScreenProps {
  state: GameState;
  dispatch: (action: Action) => void;
  /** Stable seed source — defaults to Date.now() at action time. */
  now?: () => number;
}

const MODES: ReadonlyArray<{ id: Mode; label: string; sublabel: string }> = [
  { id: 'solo', label: 'Solo', sublabel: 'vs. AI Commander' },
  { id: 'local-2p', label: 'Local 2P', sublabel: 'pass-and-play' },
];

const DIFFICULTIES: ReadonlyArray<{ id: Difficulty; label: string; sublabel: string }> = [
  { id: 'easy', label: 'Easy', sublabel: 'random shots' },
  { id: 'medium', label: 'Medium', sublabel: 'hunt and target' },
  { id: 'hard', label: 'Hard', sublabel: 'probability density' },
];

export function HomeScreen({
  state,
  dispatch,
  now = () => Date.now(),
}: HomeScreenProps): JSX.Element {
  const [p1Name, setP1Name] = useState(state.players.p1.name);
  const [p2Name, setP2Name] = useState(state.players.p2.name);

  const onSetMode = useCallback(
    (mode: Mode) => {
      dispatch({ type: 'SET_MODE', mode });
    },
    [dispatch],
  );

  const onSetDifficulty = useCallback(
    (difficulty: Difficulty) => {
      dispatch({ type: 'SET_DIFFICULTY', difficulty });
    },
    [dispatch],
  );

  const onBegin = useCallback(() => {
    if (p1Name.trim()) dispatch({ type: 'SET_NAME', player: 'p1', name: p1Name.trim() });
    if (state.mode === 'local-2p' && p2Name.trim()) {
      dispatch({ type: 'SET_NAME', player: 'p2', name: p2Name.trim() });
    }
    dispatch({ type: 'BEGIN_PLACEMENT', seed: now() });
  }, [dispatch, now, state.mode, p1Name, p2Name]);

  return (
    <section className={styles.screen} aria-label="Home">
      <header className={styles.hero}>
        <p className={styles.kicker}>Naval Command</p>
        <h1 className={styles.title}>Battleship</h1>
        <p className={styles.tagline}>Sink the enemy fleet before they sink yours.</p>
      </header>

      <div className={styles.panel}>
        <fieldset className={styles.field} aria-label="Game mode">
          <legend className={styles.legend}>Mode</legend>
          <div className={styles.options}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`${styles.option} ${state.mode === m.id ? styles.optionSelected : ''}`}
                aria-pressed={state.mode === m.id}
                onClick={() => onSetMode(m.id)}
              >
                <span className={styles.optionLabel}>{m.label}</span>
                <span className={styles.optionSubLabel}>{m.sublabel}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {state.mode === 'solo' && (
          <fieldset className={styles.field} aria-label="AI difficulty">
            <legend className={styles.legend}>Difficulty</legend>
            <div className={styles.options}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`${styles.option} ${state.difficulty === d.id ? styles.optionSelected : ''}`}
                  aria-pressed={state.difficulty === d.id}
                  onClick={() => onSetDifficulty(d.id)}
                >
                  <span className={styles.optionLabel}>{d.label}</span>
                  <span className={styles.optionSubLabel}>{d.sublabel}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className={styles.field} aria-label="Player names">
          <legend className={styles.legend}>Players</legend>
          <div className={styles.names}>
            <label className={styles.nameLabel}>
              <span>{state.mode === 'solo' ? 'Your callsign' : 'Player 1'}</span>
              <input
                type="text"
                className={styles.nameInput}
                value={p1Name}
                maxLength={20}
                onChange={(e) => setP1Name(e.target.value)}
                aria-label="Player 1 name"
              />
            </label>
            {state.mode === 'local-2p' && (
              <label className={styles.nameLabel}>
                <span>Player 2</span>
                <input
                  type="text"
                  className={styles.nameInput}
                  value={p2Name}
                  maxLength={20}
                  onChange={(e) => setP2Name(e.target.value)}
                  aria-label="Player 2 name"
                />
              </label>
            )}
          </div>
        </fieldset>

        <button
          type="button"
          className={styles.beginButton}
          onClick={onBegin}
          aria-label="Begin placement"
        >
          Begin
        </button>
      </div>
    </section>
  );
}
