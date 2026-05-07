import { useGame } from './hooks/useGame';
import { useAITurn } from './hooks/useAITurn';
import { HomeScreen } from './components/HomeScreen';
import { PlacementScreen } from './components/PlacementScreen';
import { GameScreen } from './components/GameScreen';
import { EndGameScreen } from './components/EndGameScreen';
import styles from './App.module.css';

export interface AppProps {
  /** AI think delay before firing — defaults to 700ms in production. */
  aiThinkMs?: number;
  /** Time between FIRE_SHOT and COMPLETE_TURN — covers the resolve animation. */
  resolveMs?: number;
}

export default function App({ aiThinkMs, resolveMs }: AppProps = {}): JSX.Element {
  const { state, dispatch } = useGame();
  // Drives the AI's turn during solo play. Cleans itself up on phase change.
  useAITurn({ state, dispatch, thinkMs: aiThinkMs, resolveMs });

  return (
    <main className={styles.shell}>
      {state.phase === 'home' && <HomeScreen state={state} dispatch={dispatch} />}
      {state.phase === 'setup-player-one' && (
        <PlacementScreen state={state} dispatch={dispatch} player="p1" />
      )}
      {state.phase === 'setup-player-two' && (
        <PlacementScreen state={state} dispatch={dispatch} player="p2" />
      )}
      {state.phase === 'in-progress' && (
        <GameScreen state={state} dispatch={dispatch} viewer="p1" resolveMs={resolveMs} />
      )}
      {state.phase === 'game-over' && (
        <EndGameScreen state={state} dispatch={dispatch} viewer="p1" />
      )}
      {state.phase === 'handoff' && (
        <div className={styles.placeholder}>
          <h1>Handoff</h1>
          <p>Local 2P handoff arrives in Checkpoint 5.</p>
        </div>
      )}
    </main>
  );
}
