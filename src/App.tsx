import { useGame } from './hooks/useGame';
import { useAITurn } from './hooks/useAITurn';
import { HomeScreen } from './components/HomeScreen';
import { PlacementScreen } from './components/PlacementScreen';
import { GameScreen } from './components/GameScreen';
import { EndGameScreen } from './components/EndGameScreen';
import { HandoffScreen } from './components/HandoffScreen';
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

  // In Local 2P, the active viewer follows whichever player's turn it is.
  // In Solo, the human is always p1 (the AI is p2).
  const viewer = state.mode === 'local-2p' ? state.currentTurn : 'p1';

  return (
    <main className={styles.shell}>
      {state.phase === 'home' && <HomeScreen state={state} dispatch={dispatch} />}
      {state.phase === 'setup-player-one' && (
        <PlacementScreen state={state} dispatch={dispatch} player="p1" />
      )}
      {state.phase === 'setup-player-two' && (
        <PlacementScreen state={state} dispatch={dispatch} player="p2" />
      )}
      {state.phase === 'handoff' && (
        <HandoffScreen state={state} dispatch={dispatch} />
      )}
      {state.phase === 'in-progress' && (
        <GameScreen
          state={state}
          dispatch={dispatch}
          viewer={viewer}
          resolveMs={resolveMs}
        />
      )}
      {state.phase === 'game-over' && (
        <EndGameScreen state={state} dispatch={dispatch} viewer={viewer} />
      )}
    </main>
  );
}
