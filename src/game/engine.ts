import { AI_NAME, DEFAULT_NAMES, PLAYER_IDS } from './constants';
import { coordKey, coordsEqual } from './coordinates';
import {
  allShipsPlaced,
  clearShipFromBoard,
  clearShipFromFleet,
  emptyBoard,
  emptyFleet,
  getShip,
  placeShipOnBoard,
  randomFleet,
  setShipPlacement,
} from './placement';
import { isFleetDefeated, resolveShot } from './rules';
import { mulberry32 } from './rng';
import type {
  Action,
  AIMemory,
  BattleLogEntry,
  GameState,
  HandoffReason,
  Mode,
  PlayerId,
  PlayerState,
  ShotResult,
} from './types';

export function createAIMemory(): AIMemory {
  return {
    shotsFired: [],
    unresolvedHits: [],
    orientationHypothesis: null,
  };
}

interface PlayerOpts {
  kind?: 'human' | 'ai';
  name?: string;
}

export function emptyPlayer(id: PlayerId, opts: PlayerOpts = {}): PlayerState {
  const kind = opts.kind ?? 'human';
  const fallback = kind === 'ai' ? AI_NAME : DEFAULT_NAMES[id];
  const player: PlayerState = {
    id,
    kind,
    name: opts.name ?? fallback,
    ownBoard: emptyBoard(),
    shotsTaken: [],
    fleet: emptyFleet(),
    placement: { selectedShipId: null, orientation: 'H' },
  };
  if (kind === 'ai') player.aiMemory = createAIMemory();
  return player;
}

export interface InitialStateOptions {
  mode?: Mode;
  difficulty?: GameState['difficulty'];
  names?: Partial<Record<PlayerId, string>>;
  reducedMotion?: boolean;
  rngSeed?: number;
}

export function initialState(opts: InitialStateOptions = {}): GameState {
  const mode: Mode = opts.mode ?? 'solo';
  const difficulty = opts.difficulty ?? 'medium';
  const p1: PlayerState = emptyPlayer('p1', { name: opts.names?.p1 ?? DEFAULT_NAMES.p1 });
  const p2: PlayerState =
    mode === 'solo'
      ? emptyPlayer('p2', { kind: 'ai', name: AI_NAME })
      : emptyPlayer('p2', { name: opts.names?.p2 ?? DEFAULT_NAMES.p2 });
  return {
    phase: 'home',
    mode,
    difficulty,
    players: { p1, p2 },
    currentTurn: 'p1',
    pendingHandoffTo: null,
    handoffReason: null,
    log: [],
    rngSeed: opts.rngSeed ?? 1,
    inputLocked: false,
    winner: null,
    rematchCount: 0,
    turnNumber: 0,
    settings: { reducedMotion: opts.reducedMotion ?? false },
  };
}

function otherPlayer(id: PlayerId): PlayerId {
  return id === 'p1' ? 'p2' : 'p1';
}

function setPlayer(
  state: GameState,
  id: PlayerId,
  next: PlayerState,
): GameState {
  return {
    ...state,
    players: { ...state.players, [id]: next },
  };
}

function freshAIMemoryIfNeeded(p: PlayerState): PlayerState {
  return p.kind === 'ai' ? { ...p, aiMemory: createAIMemory() } : p;
}

function makeLogEntry(
  result: ShotResult,
  turn: number,
  ts: number,
): BattleLogEntry {
  const id = `log-${turn}-${result.by}-${coordKey(result.at)}`;
  const entry: BattleLogEntry = {
    id,
    turn,
    by: result.by,
    at: result.at,
    outcome: result.outcome,
    ts,
  };
  if (result.sunkShipId) entry.sunkShipId = result.sunkShipId;
  return entry;
}

function autoPlaceAI(state: GameState, seed: number): GameState {
  if (state.players.p2.kind !== 'ai') return state;
  const rng = mulberry32(seed);
  const generated = randomFleet(rng);
  const ai = state.players.p2;
  const next: PlayerState = {
    ...ai,
    ownBoard: generated.board,
    fleet: generated.fleet,
    placement: { selectedShipId: null, orientation: 'H' },
  };
  return setPlayer(state, 'p2', next);
}

// Actions whose phase is wrong are no-ops. They never throw, so the UI never crashes
// from a stale dispatch.
export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SET_MODE': {
      if (state.phase !== 'home') return state;
      if (state.mode === action.mode) return state;
      const isSolo = action.mode === 'solo';
      const p2 =
        isSolo && state.players.p2.kind !== 'ai'
          ? emptyPlayer('p2', { kind: 'ai', name: AI_NAME })
          : !isSolo && state.players.p2.kind === 'ai'
            ? emptyPlayer('p2', { name: DEFAULT_NAMES.p2 })
            : state.players.p2;
      return { ...state, mode: action.mode, players: { ...state.players, p2 } };
    }
    case 'SET_DIFFICULTY': {
      if (state.phase !== 'home') return state;
      return { ...state, difficulty: action.difficulty };
    }
    case 'SET_NAME': {
      if (state.phase !== 'home') return state;
      const player = state.players[action.player];
      if (player.kind === 'ai') return state;
      const trimmed = action.name.trim() || DEFAULT_NAMES[action.player];
      return setPlayer(state, action.player, { ...player, name: trimmed });
    }
    case 'TOGGLE_REDUCED_MOTION': {
      return {
        ...state,
        settings: { ...state.settings, reducedMotion: !state.settings.reducedMotion },
      };
    }
    case 'BEGIN_PLACEMENT': {
      if (state.phase !== 'home') return state;
      // Reset player fleets/boards. Preserve mode/difficulty/names/settings.
      const p1: PlayerState = {
        ...state.players.p1,
        ownBoard: emptyBoard(),
        fleet: emptyFleet(),
        shotsTaken: [],
        placement: { selectedShipId: 'carrier', orientation: 'H' },
      };
      const p2Base: PlayerState =
        state.mode === 'solo'
          ? emptyPlayer('p2', { kind: 'ai', name: AI_NAME })
          : {
              ...state.players.p2,
              ownBoard: emptyBoard(),
              fleet: emptyFleet(),
              shotsTaken: [],
              placement: { selectedShipId: 'carrier', orientation: 'H' },
            };
      return {
        ...state,
        phase: 'setup-player-one',
        players: { p1, p2: p2Base },
        currentTurn: 'p1',
        pendingHandoffTo: null,
        handoffReason: null,
        log: [],
        rngSeed: action.seed,
        inputLocked: false,
        winner: null,
        turnNumber: 0,
      };
    }
    case 'SELECT_SHIP': {
      if (!isPlacementPhaseFor(state, action.player)) return state;
      const player = state.players[action.player];
      return setPlayer(state, action.player, {
        ...player,
        placement: { ...player.placement, selectedShipId: action.shipId },
      });
    }
    case 'ROTATE_SHIP': {
      if (!isPlacementPhaseFor(state, action.player)) return state;
      const player = state.players[action.player];
      const next = player.placement.orientation === 'H' ? 'V' : 'H';
      return setPlayer(state, action.player, {
        ...player,
        placement: { ...player.placement, orientation: next },
      });
    }
    case 'PLACE_SHIP': {
      if (!isPlacementPhaseFor(state, action.player)) return state;
      const player = state.players[action.player];
      const place = placeShipOnBoard(
        player.ownBoard,
        action.shipId,
        action.origin,
        action.orientation,
      );
      if (!place.check.ok) return state;
      const fleet = setShipPlacement(
        player.fleet,
        action.shipId,
        action.origin,
        action.orientation,
      );
      // Auto-advance selection to next unplaced ship in fleet order.
      const nextSelected = fleet.find((s) => s.origin === null) ?? null;
      return setPlayer(state, action.player, {
        ...player,
        ownBoard: place.board,
        fleet,
        placement: {
          selectedShipId: nextSelected ? nextSelected.id : null,
          orientation: nextSelected
            ? nextSelected.orientation
            : player.placement.orientation,
        },
      });
    }
    case 'RANDOMIZE_FLEET': {
      if (!isPlacementPhaseFor(state, action.player)) return state;
      const player = state.players[action.player];
      const rng = mulberry32(action.seed);
      const generated = randomFleet(rng);
      return setPlayer(state, action.player, {
        ...player,
        ownBoard: generated.board,
        fleet: generated.fleet,
        placement: { selectedShipId: null, orientation: 'H' },
      });
    }
    case 'RESET_FLEET': {
      if (!isPlacementPhaseFor(state, action.player)) return state;
      const player = state.players[action.player];
      let board = player.ownBoard;
      let fleet = player.fleet;
      for (const ship of fleet) {
        board = clearShipFromBoard(board, ship.id);
        fleet = clearShipFromFleet(fleet, ship.id);
      }
      return setPlayer(state, action.player, {
        ...player,
        ownBoard: board,
        fleet,
        placement: { selectedShipId: 'carrier', orientation: 'H' },
      });
    }
    case 'CONFIRM_PLACEMENT': {
      if (state.phase === 'setup-player-one') {
        const p1 = state.players.p1;
        if (!allShipsPlaced(p1.fleet)) return state;
        if (state.mode === 'solo') {
          const withAI = autoPlaceAI(state, action.seed);
          return {
            ...withAI,
            phase: 'in-progress',
            currentTurn: 'p1',
            pendingHandoffTo: null,
            handoffReason: null,
            inputLocked: false,
            turnNumber: 1,
          };
        }
        // local-2p: handoff to P2 for setup
        return {
          ...state,
          phase: 'handoff',
          pendingHandoffTo: 'p2',
          handoffReason: 'setup',
          inputLocked: false,
        };
      }
      if (state.phase === 'setup-player-two') {
        const p2 = state.players.p2;
        if (!allShipsPlaced(p2.fleet)) return state;
        // both placed, handoff to P1 to start firing
        return {
          ...state,
          phase: 'handoff',
          pendingHandoffTo: 'p1',
          handoffReason: 'setup',
          inputLocked: false,
        };
      }
      return state;
    }
    case 'CONFIRM_READY': {
      if (state.phase !== 'handoff') return state;
      const reason: HandoffReason | null = state.handoffReason;
      const target = state.pendingHandoffTo;
      if (!reason || !target) return state;
      if (reason === 'setup') {
        // Either entering P2 setup or starting the battle.
        if (target === 'p2' && !allShipsPlaced(state.players.p2.fleet)) {
          return {
            ...state,
            phase: 'setup-player-two',
            currentTurn: 'p2',
            pendingHandoffTo: null,
            handoffReason: null,
            inputLocked: false,
          };
        }
        // Otherwise both fleets placed: start the battle with `target` to fire.
        return {
          ...state,
          phase: 'in-progress',
          currentTurn: target,
          pendingHandoffTo: null,
          handoffReason: null,
          inputLocked: false,
          turnNumber: state.turnNumber === 0 ? 1 : state.turnNumber,
        };
      }
      // reason === 'turn': resume in-progress with target to fire.
      return {
        ...state,
        phase: 'in-progress',
        currentTurn: target,
        pendingHandoffTo: null,
        handoffReason: null,
        inputLocked: false,
      };
    }
    case 'FIRE_SHOT': {
      if (state.phase !== 'in-progress') return state;
      if (state.inputLocked) return state;
      if (state.winner !== null) return state;
      const shooter = state.currentTurn;
      const targetId = otherPlayer(shooter);
      const target = state.players[targetId];
      const shooterPlayer = state.players[shooter];
      // Reject duplicate shots.
      const dup = shooterPlayer.shotsTaken.some((s) => coordsEqual(s.at, action.at));
      if (dup) return state;
      const apply = resolveShot(
        { ownBoard: target.ownBoard, fleet: target.fleet },
        shooter,
        action.at,
      );
      if (!apply.ok) return state;
      const updatedTarget: PlayerState = {
        ...target,
        ownBoard: apply.ownBoard,
        fleet: apply.fleet,
      };
      const updatedShooter: PlayerState = {
        ...shooterPlayer,
        shotsTaken: [...shooterPlayer.shotsTaken, apply.result],
      };
      const won = isFleetDefeated(apply.fleet);
      const log: BattleLogEntry[] = [
        ...state.log,
        makeLogEntry(apply.result, state.turnNumber, action.ts),
      ];
      return {
        ...state,
        players: {
          ...state.players,
          [shooter]: updatedShooter,
          [targetId]: updatedTarget,
        },
        log,
        inputLocked: true,
        winner: won ? shooter : null,
      };
    }
    case 'COMPLETE_TURN': {
      if (state.phase !== 'in-progress') return state;
      // If a winner was set during FIRE_SHOT, end the game.
      if (state.winner !== null) {
        return {
          ...state,
          phase: 'game-over',
          inputLocked: false,
          pendingHandoffTo: null,
          handoffReason: null,
        };
      }
      const next = otherPlayer(state.currentTurn);
      if (state.mode === 'local-2p') {
        return {
          ...state,
          phase: 'handoff',
          currentTurn: next,
          pendingHandoffTo: next,
          handoffReason: 'turn',
          inputLocked: false,
          turnNumber: state.turnNumber + 1,
        };
      }
      // Solo: just swap turn. The hook orchestrating the AI will see currentTurn change.
      return {
        ...state,
        currentTurn: next,
        inputLocked: false,
        turnNumber: state.turnNumber + 1,
      };
    }
    case 'SET_INPUT_LOCK': {
      return { ...state, inputLocked: action.locked };
    }
    case 'START_REMATCH': {
      if (state.phase !== 'game-over') return state;
      // Build fresh state preserving mode/difficulty/names/settings, but reset everything else.
      const fresh = initialState({
        mode: state.mode,
        difficulty: state.difficulty,
        names: { p1: state.players.p1.name, p2: state.players.p2.name },
        reducedMotion: state.settings.reducedMotion,
        rngSeed: action.seed,
      });
      return {
        ...fresh,
        // BEGIN_PLACEMENT-equivalent: go straight to setup-player-one.
        phase: 'setup-player-one',
        players: {
          p1: {
            ...fresh.players.p1,
            placement: { selectedShipId: 'carrier', orientation: 'H' },
          },
          p2:
            state.mode === 'solo'
              ? freshAIMemoryIfNeeded(fresh.players.p2)
              : {
                  ...fresh.players.p2,
                  placement: { selectedShipId: 'carrier', orientation: 'H' },
                },
        },
        rematchCount: state.rematchCount + 1,
      };
    }
    case 'RETURN_HOME': {
      // Preserve preferences: mode, difficulty, names, settings.
      return initialState({
        mode: state.mode,
        difficulty: state.difficulty,
        names: { p1: state.players.p1.name, p2: state.players.p2.name },
        reducedMotion: state.settings.reducedMotion,
        rngSeed: state.rngSeed,
      });
    }
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}

function isPlacementPhaseFor(state: GameState, id: PlayerId): boolean {
  if (id === 'p1') return state.phase === 'setup-player-one';
  if (id === 'p2') return state.phase === 'setup-player-two';
  return false;
}

// Public selectors (read-only helpers safe for components).
export function canStart(state: GameState): boolean {
  if (state.phase === 'setup-player-one') return allShipsPlaced(state.players.p1.fleet);
  if (state.phase === 'setup-player-two') return allShipsPlaced(state.players.p2.fleet);
  return false;
}

export function selectActivePlayer(state: GameState): PlayerState {
  if (state.phase === 'setup-player-one') return state.players.p1;
  if (state.phase === 'setup-player-two') return state.players.p2;
  return state.players[state.currentTurn];
}

export function selectOpponent(state: GameState): PlayerState {
  return state.players[otherPlayer(state.currentTurn)];
}

export function selectSelectedShip(state: GameState, player: PlayerId) {
  const p = state.players[player];
  if (!p.placement.selectedShipId) return null;
  try {
    return getShip(p.fleet, p.placement.selectedShipId);
  } catch {
    return null;
  }
}

export { PLAYER_IDS };
