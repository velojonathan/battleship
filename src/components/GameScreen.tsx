import { useCallback, useEffect, useMemo } from 'react';
import { coordKey } from '../game/coordinates';
import type {
  Action,
  Coord,
  GameState,
  PlayerId,
  ShotResult,
} from '../game/types';
import { Board } from './Board';
import { BattleLog } from './BattleLog';
import { FleetStatus } from './FleetStatus';
import type { CellState } from './Cell';
import styles from './GameScreen.module.css';

export interface GameScreenProps {
  state: GameState;
  dispatch: (action: Action) => void;
  /** The local viewing player. In solo mode this is always 'p1'; in 2P this is the active player. */
  viewer: PlayerId;
  /**
   * Delay between FIRE_SHOT and COMPLETE_TURN — covers the hit/miss/sunk
   * animation. Tests pass 0 so they don't have to wait.
   */
  resolveMs?: number;
  /** Override timestamp source for tests. */
  now?: () => number;
}

function otherOf(id: PlayerId): PlayerId {
  return id === 'p1' ? 'p2' : 'p1';
}

/**
 * The map of (row,col) → outcome for a series of shots, keyed for fast lookup.
 */
function indexShots(shots: readonly ShotResult[]): Map<string, ShotResult> {
  const out = new Map<string, ShotResult>();
  for (const s of shots) out.set(coordKey(s.at), s);
  return out;
}

export function GameScreen({
  state,
  dispatch,
  viewer,
  resolveMs = 700,
  now = () => Date.now(),
}: GameScreenProps): JSX.Element {
  const opponent = otherOf(viewer);
  const me = state.players[viewer];
  const them = state.players[opponent];

  // Targeting board: shots viewer has fired against opponent.
  const myShotsIndex = useMemo(() => indexShots(me.shotsTaken), [me.shotsTaken]);
  // Own board: opponent's shots against viewer.
  const theirShotsIndex = useMemo(() => indexShots(them.shotsTaken), [them.shotsTaken]);

  const myTurn = state.currentTurn === viewer;
  const myCanFire =
    state.phase === 'in-progress' &&
    state.winner === null &&
    !state.inputLocked &&
    myTurn;

  // After the engine has processed FIRE_SHOT, kick off COMPLETE_TURN after
  // resolveMs. The engine sets inputLocked=true on FIRE_SHOT and clears it on
  // COMPLETE_TURN, so our gate is `inputLocked && phase === 'in-progress'`.
  // (For the AI's shots, useAITurn schedules its own COMPLETE_TURN after the
  // shot — but harmlessly: COMPLETE_TURN is idempotent in 'game-over'.)
  useEffect(() => {
    if (state.phase !== 'in-progress') return;
    if (!state.inputLocked) return;
    // Only the human-shooter case needs us. If the AI shot, useAITurn already
    // scheduled the COMPLETE_TURN; but it's still safe to schedule another:
    // the engine will no-op the second one because the phase will already be
    // 'game-over' or the turn will already have advanced.
    if (state.currentTurn !== viewer) return;
    const id = setTimeout(() => {
      dispatch({ type: 'COMPLETE_TURN' });
    }, resolveMs);
    return () => clearTimeout(id);
  }, [
    state.phase,
    state.inputLocked,
    state.currentTurn,
    state.turnNumber,
    viewer,
    dispatch,
    resolveMs,
  ]);

  const onFire = useCallback(
    (coord: Coord) => {
      if (!myCanFire) return;
      const key = coordKey(coord);
      // Already shot? Cell is disabled but defensively guard.
      if (myShotsIndex.has(key)) return;
      dispatch({ type: 'FIRE_SHOT', at: coord, ts: now() });
    },
    [dispatch, myCanFire, myShotsIndex, now],
  );

  const targetingCellState = useCallback(
    (coord: Coord): CellState => {
      const shot = myShotsIndex.get(coordKey(coord));
      if (!shot) return 'empty';
      if (shot.outcome === 'miss') return 'miss';
      if (shot.outcome === 'sunk') return 'sunk';
      return 'hit';
    },
    [myShotsIndex],
  );

  const targetingCellLabel = useCallback(
    (coord: Coord): string | undefined => {
      const shot = myShotsIndex.get(coordKey(coord));
      if (!shot) return `Fire at ${formatCoord(coord)}`;
      return undefined;
    },
    [myShotsIndex],
  );

  const targetingCellDisabled = useCallback(
    (coord: Coord): boolean => {
      if (!myCanFire) return true;
      return myShotsIndex.has(coordKey(coord));
    },
    [myCanFire, myShotsIndex],
  );

  const ownCellState = useCallback(
    (coord: Coord): CellState => {
      const shot = theirShotsIndex.get(coordKey(coord));
      const cell = me.ownBoard.cells[coord.row]?.[coord.col];
      if (shot) {
        if (shot.outcome === 'miss') return 'miss';
        if (shot.outcome === 'sunk') return 'sunk';
        if (shot.outcome === 'hit') return 'hit';
      }
      if (cell?.shipId) return 'ship';
      return 'empty';
    },
    [me.ownBoard, theirShotsIndex],
  );

  const ownCellLabel = useCallback(
    (coord: Coord): string | undefined => {
      const shot = theirShotsIndex.get(coordKey(coord));
      const cell = me.ownBoard.cells[coord.row]?.[coord.col];
      if (shot) {
        if (shot.outcome === 'miss') return `${formatCoord(coord)}, enemy missed`;
        if (shot.outcome === 'hit')
          return `${formatCoord(coord)}, enemy hit your ship`;
        if (shot.outcome === 'sunk')
          return `${formatCoord(coord)}, your ship was sunk`;
      }
      if (cell?.shipId) return `${formatCoord(coord)}, your ship`;
      return formatCoord(coord);
    },
    [me.ownBoard, theirShotsIndex],
  );

  const turnLabel = state.winner
    ? state.winner === viewer
      ? 'Victory'
      : 'Defeat'
    : myTurn
      ? state.inputLocked
        ? 'Resolving…'
        : `${me.name} — fire`
      : `${them.name} thinking…`;

  return (
    <section className={styles.screen} aria-label="Game in progress">
      <header className={styles.header}>
        <div className={styles.scoreboard}>
          <span className={`${styles.scoreSlot} ${myTurn ? styles.scoreSlotActive : ''}`}>
            <span className={styles.scoreName}>{me.name}</span>
            <span className={styles.scoreSub}>You</span>
          </span>
          <span aria-hidden="true" className={styles.divider}>vs</span>
          <span
            className={`${styles.scoreSlot} ${!myTurn ? styles.scoreSlotActive : ''}`}
          >
            <span className={styles.scoreName}>{them.name}</span>
            <span className={styles.scoreSub}>{them.kind === 'ai' ? state.difficulty : 'Opponent'}</span>
          </span>
        </div>
        <div
          className={styles.turnBanner}
          data-turn={myTurn ? 'mine' : 'theirs'}
          aria-live="polite"
        >
          {turnLabel}
        </div>
      </header>

      <div className={styles.boards}>
        <div className={styles.boardCol}>
          <h2 className={styles.boardTitle}>Targeting — {them.name}</h2>
          <Board
            board={them.ownBoard /* sized only — no hidden info read in callbacks */}
            cellState={targetingCellState}
            cellLabel={targetingCellLabel}
            cellDisabled={targetingCellDisabled}
            onCellClick={onFire}
            ariaLabel={`Fire targeting board against ${them.name}`}
            variant="targeting"
          />
        </div>
        <div className={styles.boardCol}>
          <h2 className={styles.boardTitle}>Your fleet</h2>
          <Board
            board={me.ownBoard}
            readOnly
            cellState={ownCellState}
            cellLabel={ownCellLabel}
            ariaLabel={`${me.name} fleet board`}
            variant="own"
          />
        </div>
      </div>

      <aside className={styles.sidebar}>
        <FleetStatus state={state} player={opponent} reveal={false} title={`${them.name} fleet`} />
        <FleetStatus state={state} player={viewer} reveal title={`${me.name} fleet`} />
        <BattleLog state={state} />
      </aside>
    </section>
  );
}

// Local helper to keep the import surface small (Board imports formatCoord too).
function formatCoord(c: Coord): string {
  return `${'ABCDEFGHIJ'[c.col] ?? '?'}${c.row + 1}`;
}
