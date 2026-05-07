import { useEffect } from 'react';
import { useGame } from './hooks/useGame';
import { PlacementScreen } from './components/PlacementScreen';
import styles from './App.module.css';

export default function App(): JSX.Element {
  const { state, dispatch } = useGame();

  // Until the home screen lands in CP3, jump directly into Player 1 placement.
  useEffect(() => {
    if (state.phase === 'home') {
      dispatch({ type: 'BEGIN_PLACEMENT', seed: Date.now() });
    }
  }, [state.phase, dispatch]);

  return (
    <main className={styles.shell}>
      {state.phase === 'setup-player-one' && (
        <PlacementScreen state={state} dispatch={dispatch} player="p1" />
      )}
      {state.phase === 'setup-player-two' && (
        <PlacementScreen state={state} dispatch={dispatch} player="p2" />
      )}
      {state.phase !== 'setup-player-one' && state.phase !== 'setup-player-two' && (
        <div className={styles.placeholder}>
          <h1>Battleship</h1>
          <p>Naval command — phase: {state.phase}</p>
          <p>Game screen ships in Checkpoint 3.</p>
        </div>
      )}
    </main>
  );
}
