import { useCallback, useEffect, useMemo, useRef } from 'react';
import { coordKey } from '../game/coordinates';
import type {
  Action,
  Coord,
  GameState,
  PlayerId,
  ShotResult,
} from '../game/types';
import type { AudioBus, CueId } from '../audio';
import { useAudio } from '../hooks/useAudio';
import { Board } from './Board';
import { BattleLog } from './BattleLog';
import { FleetStatus } from './FleetStatus';
import { QuitButton } from './QuitButton';
import { SoundToggle } from './SoundToggle';
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
  /**
   * Inject an AudioBus for tests; falls back to a real, lazy-created bus.
   * Allows tests to spy on cue calls without touching real Web Audio.
   */
  audioBus?: AudioBus;
}

function shotCue(outcome: ShotResult['outcome']): CueId {
  if (outcome === 'miss') return 'miss';
  if (outcome === 'sunk') return 'sunk';
  return 'hit';
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
  audioBus,
}: GameScreenProps): JSX.Element {
  const opponent = otherOf(viewer);
  const me = state.players[viewer];
  const them = state.players[opponent];

  const audio = useAudio({ bus: audioBus });
  // Track the last log entry id we've already played a cue for, so the
  // effect doesn't re-fire on every parent re-render or under React 18
  // StrictMode's double-invocation. Initialized lazily on first render so
  // freshly mounted (post-handoff) GameScreens don't replay historical shots.
  const lastShotIdRef = useRef<string | null>(null);
  const lastShotIdInitialized = useRef(false);
  if (!lastShotIdInitialized.current) {
    const lastEntry = state.log[state.log.length - 1];
    lastShotIdRef.current = lastEntry?.id ?? null;
    lastShotIdInitialized.current = true;
  }
  const gameOverPlayedRef = useRef(false);

  // Targeting board: shots viewer has fired against opponent.
  const myShotsIndex = useMemo(() => indexShots(me.shotsTaken), [me.shotsTaken]);
  // Own board: opponent's shots against viewer.
  const theirShotsIndex = useMemo(() => indexShots(them.shotsTaken), [them.shotsTaken]);

  // Sunk-ship overlays for the own board: trivially derived from viewer's
  // own fleet (they obviously know where their own ships are).
  const ownSunkShips = useMemo(
    () =>
      me.fleet
        .filter((s) => s.sunk && s.origin !== null)
        .map((s) => ({
          id: s.id,
          origin: s.origin as Coord,
          orientation: s.orientation,
          length: s.length,
        })),
    [me.fleet],
  );
  // Sunk-ship overlays for the targeting board: ONLY publicly-known sunk
  // ships, identified by ship.sunk===true. Privacy: un-sunk opponent ships
  // are NOT included, so their cells/origin/orientation are never rendered.
  const publicSunkShips = useMemo(
    () =>
      them.fleet
        .filter((s) => s.sunk && s.origin !== null)
        .map((s) => ({
          id: s.id,
          origin: s.origin as Coord,
          orientation: s.orientation,
          length: s.length,
        })),
    [them.fleet],
  );

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

  // Play a sound cue when a new shot lands in the log. We dedupe via the log
  // entry id so React StrictMode's double-effect cannot double-play, and so
  // remounting GameScreen (post-handoff) doesn't replay historical shots.
  useEffect(() => {
    const lastEntry = state.log[state.log.length - 1];
    if (!lastEntry) return;
    if (lastEntry.id === lastShotIdRef.current) return;
    lastShotIdRef.current = lastEntry.id;
    audio.play(shotCue(lastEntry.outcome));
  }, [state.log, audio]);

  // Play a single game-over cue on the transition into 'game-over'.
  useEffect(() => {
    if (state.phase !== 'game-over') {
      // Reset for the next round so a rematch correctly fires the cue again.
      gameOverPlayedRef.current = false;
      return;
    }
    if (gameOverPlayedRef.current) return;
    gameOverPlayedRef.current = true;
    const won = state.winner === viewer;
    audio.play(won ? 'gameOverWin' : 'gameOverLoss');
  }, [state.phase, state.winner, viewer, audio]);

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
        <div className={styles.headerActions}>
          <SoundToggle
            muted={audio.muted}
            available={audio.available}
            onToggle={audio.toggleMuted}
          />
          <QuitButton
            dispatch={dispatch}
            confirm
            confirmText="Quit to home? The current battle will end."
          />
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
            sunkShips={publicSunkShips}
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
            sunkShips={ownSunkShips}
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
