import { useCallback } from 'react';
import { coordKey } from '../game/coordinates';
import type { Action, Coord, GameState, PlayerId } from '../game/types';
import { Board } from './Board';
import type { CellState } from './Cell';
import styles from './EndGameScreen.module.css';

export interface EndGameScreenProps {
  state: GameState;
  dispatch: (action: Action) => void;
  /** Defaults to Date.now() for rematch seed. */
  now?: () => number;
  /** Whose perspective to label "you". Defaults to 'p1'. */
  viewer?: PlayerId;
}

function ownCellState(coord: Coord, ownBoard: GameState['players']['p1']['ownBoard'], shotsAtMe: ReadonlyArray<{ at: Coord; outcome: string }>): CellState {
  const k = coordKey(coord);
  const shot = shotsAtMe.find((s) => coordKey(s.at) === k);
  const cell = ownBoard.cells[coord.row]?.[coord.col];
  if (shot) {
    if (shot.outcome === 'sunk') return 'sunk';
    if (shot.outcome === 'hit') return 'hit';
    if (shot.outcome === 'miss') return 'miss';
  }
  if (cell?.shipId) return 'ship';
  return 'empty';
}

export function EndGameScreen({
  state,
  dispatch,
  now = () => Date.now(),
  viewer = 'p1',
}: EndGameScreenProps): JSX.Element {
  const onRematch = useCallback(() => {
    dispatch({ type: 'START_REMATCH', seed: now() });
  }, [dispatch, now]);

  const onHome = useCallback(() => {
    dispatch({ type: 'RETURN_HOME' });
  }, [dispatch]);

  const winner = state.winner;
  const youWon = winner === viewer;
  const winnerName =
    winner === null ? 'No one' : state.players[winner].name;

  // Each board reveals everyone's ships at game-over.
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  const p1State = (coord: Coord) => ownCellState(coord, p1.ownBoard, p2.shotsTaken);
  const p2State = (coord: Coord) => ownCellState(coord, p2.ownBoard, p1.shotsTaken);

  return (
    <section className={styles.screen} aria-label="End of battle">
      <div className={styles.banner} data-result={youWon ? 'win' : 'loss'}>
        <p className={styles.bannerKicker}>{youWon ? 'Victory' : 'Defeat'}</p>
        <h1 className={styles.bannerTitle}>{winnerName} wins</h1>
        <p className={styles.bannerSub}>
          {state.turnNumber} turn{state.turnNumber === 1 ? '' : 's'} ·{' '}
          {state.mode === 'solo' ? `Difficulty: ${state.difficulty}` : 'Local 2P'}
        </p>
      </div>

      <div className={styles.boards}>
        <div className={styles.boardCol}>
          <h2 className={styles.boardTitle}>{p1.name}'s fleet</h2>
          <Board
            board={p1.ownBoard}
            cellState={p1State}
            readOnly
            ariaLabel={`${p1.name} final fleet`}
          />
        </div>
        <div className={styles.boardCol}>
          <h2 className={styles.boardTitle}>{p2.name}'s fleet</h2>
          <Board
            board={p2.ownBoard}
            cellState={p2State}
            readOnly
            ariaLabel={`${p2.name} final fleet`}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.action} ${styles.actionPrimary}`}
          onClick={onRematch}
          aria-label="Start a rematch"
        >
          Rematch
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={onHome}
          aria-label="Return to home"
        >
          Home
        </button>
      </div>
    </section>
  );
}
