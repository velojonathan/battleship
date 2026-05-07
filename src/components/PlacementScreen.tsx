import { useCallback, useEffect, useMemo, useState } from 'react';
import { coordKey, shipFootprint } from '../game/coordinates';
import { canPlaceShip, getShip } from '../game/placement';
import type { Action, Coord, GameState, PlayerId, ShipId } from '../game/types';
import { Board } from './Board';
import { QuitButton } from './QuitButton';
import { ShipDock } from './ShipDock';
import type { CellState } from './Cell';
import styles from './PlacementScreen.module.css';

export interface PlacementScreenProps {
  state: GameState;
  dispatch: (action: Action) => void;
  player: PlayerId;
  /** Stable seed source for randomize/confirm — defaults to Date.now() at action time. */
  now?: () => number;
}

const REASON_TEXT: Record<string, string> = {
  'out-of-bounds': 'Ship would go off the board.',
  overlap: 'Ship overlaps another vessel.',
  'unknown-ship': 'Unknown ship.',
};

export function PlacementScreen({
  state,
  dispatch,
  player,
  now = () => Date.now(),
}: PlacementScreenProps): JSX.Element {
  const playerState = state.players[player];
  const { fleet, ownBoard, placement } = playerState;
  const { selectedShipId, orientation } = placement;

  const [hover, setHover] = useState<Coord | null>(null);
  const [error, setError] = useState<string>('');

  // Clear hover/error when the player or selected ship changes. Note that we
  // intentionally do NOT depend on `orientation`: rotating in-place must
  // preserve the hovered cell so the live preview updates immediately
  // (the previewCells useMemo recomputes on orientation change).
  useEffect(() => {
    setHover(null);
    setError('');
  }, [player, selectedShipId]);

  // Listen for keyboard rotation while in placement.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'r' || e.key === 'R') {
        dispatch({ type: 'ROTATE_SHIP', player });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, player]);

  const previewCells = useMemo<{ cells: Set<string>; valid: boolean }>(() => {
    if (!hover || !selectedShipId) return { cells: new Set(), valid: false };
    const ship = fleet.find((s) => s.id === selectedShipId);
    if (!ship) return { cells: new Set(), valid: false };
    const footprint = shipFootprint(hover, ship.length, orientation);
    const check = canPlaceShip(ownBoard, selectedShipId, hover, orientation);
    return {
      cells: new Set(footprint.map(coordKey)),
      valid: check.ok,
    };
  }, [hover, selectedShipId, orientation, ownBoard, fleet]);

  const cellState = useCallback(
    (coord: Coord): CellState => {
      const key = coordKey(coord);
      const cell = ownBoard.cells[coord.row]?.[coord.col];
      if (previewCells.cells.has(key)) {
        return previewCells.valid ? 'preview-valid' : 'preview-invalid';
      }
      if (cell?.shipId) return 'ship';
      return 'empty';
    },
    [ownBoard, previewCells],
  );

  const onCellClick = useCallback(
    (coord: Coord) => {
      if (!selectedShipId) {
        setError('Select a ship from the dock first.');
        return;
      }
      const check = canPlaceShip(ownBoard, selectedShipId, coord, orientation);
      if (!check.ok) {
        setError(REASON_TEXT[check.error.reason] ?? 'Invalid placement.');
        return;
      }
      dispatch({
        type: 'PLACE_SHIP',
        player,
        shipId: selectedShipId,
        origin: coord,
        orientation,
      });
      setError('');
      // The engine auto-advances selectedShipId to the next unplaced ship
      // (in fleet order) and resets orientation to that ship's stored
      // orientation, keeping selectedShipId and orientation consistent.
      // We intentionally do NOT dispatch SELECT_SHIP here.
    },
    [dispatch, player, selectedShipId, orientation, ownBoard],
  );

  const onSelectShip = useCallback(
    (shipId: ShipId | null) => {
      dispatch({ type: 'SELECT_SHIP', player, shipId });
      setError('');
    },
    [dispatch, player],
  );

  const onRotate = useCallback(() => {
    dispatch({ type: 'ROTATE_SHIP', player });
  }, [dispatch, player]);

  const onRandomize = useCallback(() => {
    dispatch({ type: 'RANDOMIZE_FLEET', player, seed: now() });
    setError('');
  }, [dispatch, now, player]);

  const onReset = useCallback(() => {
    dispatch({ type: 'RESET_FLEET', player });
    setError('');
  }, [dispatch, player]);

  const onStart = useCallback(() => {
    dispatch({ type: 'CONFIRM_PLACEMENT', seed: now() });
  }, [dispatch, now]);

  const allPlaced = fleet.every((s) => s.origin !== null);
  const startLabel = state.mode === 'solo'
    ? 'Begin battle'
    : player === 'p1'
      ? 'Player 1 ready'
      : 'Player 2 ready';

  // Dynamic helper text for unselected/no-ship state.
  const helper = !selectedShipId
    ? allPlaced
      ? 'Fleet ready. Click "Begin battle" to engage.'
      : 'Select a ship from the dock, then tap a cell to place it. Press R to rotate.'
    : `Tap a cell to place ${getShip(fleet, selectedShipId).name} (length ${getShip(fleet, selectedShipId).length}). R to rotate.`;

  // Only confirm-prompt the player if they've already placed at least one ship
  // (i.e. they've actually invested effort that quitting would lose).
  const placedSomething = fleet.some((s) => s.origin !== null);

  return (
    <section className={styles.screen} aria-label="Ship placement">
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            {player === 'p1' ? playerState.name : playerState.name} — Place your fleet
          </h1>
          <QuitButton
            dispatch={dispatch}
            confirm={placedSomething}
            confirmText="Quit to home? Your placement will be lost."
          />
        </div>
        <p className={styles.subtitle}>{helper}</p>
      </header>
      <div className={styles.layout}>
        <ShipDock
          player={player}
          fleet={fleet}
          selectedShipId={selectedShipId}
          orientation={orientation}
          onSelectShip={onSelectShip}
          onRotate={onRotate}
          onRandomize={onRandomize}
          onReset={onReset}
        />
        <div className={styles.boardArea}>
          <Board
            board={ownBoard}
            cellState={cellState}
            ariaLabel={`${playerState.name} placement board`}
            onCellClick={onCellClick}
            onCellPointerEnter={setHover}
            onCellPointerLeave={() => setHover(null)}
          />
          <p
            className={`${styles.error} ${error ? '' : styles.empty}`}
            role="alert"
            aria-live="assertive"
          >
            {error}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.startButton}
              disabled={!allPlaced}
              onClick={onStart}
              aria-label={startLabel}
            >
              {startLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}


