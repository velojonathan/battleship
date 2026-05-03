// Pure-data types shared across the game engine, components, and tests.
// IMPORTANT: this file must not import React or anything UI-specific.

export type Phase =
  | 'home'
  | 'setup-player-one'
  | 'setup-player-two'
  | 'handoff'
  | 'in-progress'
  | 'game-over';

export type Mode = 'solo' | 'local-2p';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type PlayerId = 'p1' | 'p2';
export type Orientation = 'H' | 'V';
export type ShipId = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';
export type ShotOutcome = 'miss' | 'hit' | 'sunk';
export type HandoffReason = 'setup' | 'turn';

export interface Coord {
  row: number;
  col: number;
}

export interface Ship {
  id: ShipId;
  name: string;
  length: number;
  origin: Coord | null;
  orientation: Orientation;
  hits: Coord[];
  sunk: boolean;
}

export interface Cell {
  // shipId is hidden info — never include in opponent-public views.
  shipId: ShipId | null;
  hit: boolean;
  miss: boolean;
}

export interface OwnBoard {
  size: number;
  cells: Cell[][];
}

export interface ShotResult {
  by: PlayerId;
  at: Coord;
  outcome: ShotOutcome;
  // Set when the shot sinks a ship.
  sunkShipId?: ShipId;
}

export interface BattleLogEntry {
  id: string;
  turn: number;
  by: PlayerId;
  at: Coord;
  outcome: ShotOutcome;
  sunkShipId?: ShipId;
  ts: number;
}

export interface PlacementCursor {
  selectedShipId: ShipId | null;
  orientation: Orientation;
}

export interface AIMemory {
  // Serialized "row,col" of every shot the AI has fired.
  shotsFired: string[];
  // Coordinates of unresolved hits (hits not yet attributed to a sunk ship).
  unresolvedHits: Coord[];
  // When two collinear unresolved hits exist, the inferred orientation.
  orientationHypothesis: Orientation | null;
}

export interface PlayerState {
  id: PlayerId;
  kind: 'human' | 'ai';
  name: string;
  ownBoard: OwnBoard;
  shotsTaken: ShotResult[];
  fleet: Ship[];
  placement: PlacementCursor;
  // Present iff kind === 'ai'.
  aiMemory?: AIMemory;
}

export interface Settings {
  reducedMotion: boolean;
}

export interface GameState {
  phase: Phase;
  mode: Mode;
  difficulty: Difficulty;
  players: Record<PlayerId, PlayerState>;
  currentTurn: PlayerId;
  pendingHandoffTo: PlayerId | null;
  handoffReason: HandoffReason | null;
  log: BattleLogEntry[];
  rngSeed: number;
  inputLocked: boolean;
  winner: PlayerId | null;
  rematchCount: number;
  turnNumber: number;
  settings: Settings;
}

export type Action =
  // Home/preferences
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_DIFFICULTY'; difficulty: Difficulty }
  | { type: 'SET_NAME'; player: PlayerId; name: string }
  | { type: 'TOGGLE_REDUCED_MOTION' }
  // Phase entry
  | { type: 'BEGIN_PLACEMENT'; seed: number }
  // Placement actions
  | { type: 'SELECT_SHIP'; player: PlayerId; shipId: ShipId | null }
  | { type: 'ROTATE_SHIP'; player: PlayerId }
  | {
      type: 'PLACE_SHIP';
      player: PlayerId;
      shipId: ShipId;
      origin: Coord;
      orientation: Orientation;
    }
  | { type: 'RANDOMIZE_FLEET'; player: PlayerId; seed: number }
  | { type: 'RESET_FLEET'; player: PlayerId }
  // Player ready / handoff / start
  | { type: 'CONFIRM_PLACEMENT'; seed: number }
  | { type: 'CONFIRM_READY' }
  // Game actions
  | { type: 'FIRE_SHOT'; at: Coord; ts: number }
  | { type: 'COMPLETE_TURN' }
  | { type: 'SET_INPUT_LOCK'; locked: boolean }
  // Reset
  | { type: 'START_REMATCH'; seed: number }
  | { type: 'RETURN_HOME' };

// Public view exposed to the AI module.
// MUST NOT contain hidden ship coordinates.
export interface PublicSunkShip {
  id: ShipId;
  length: number;
  cells: Coord[];
}

export interface PublicOpponentView {
  size: number;
  shots: ShotResult[];
  sunkShips: PublicSunkShip[];
  remainingShipLengths: number[];
}

// AI move input/output.
export interface AIInput {
  view: PublicOpponentView;
  memory: AIMemory;
  difficulty: Difficulty;
  rng: () => number;
}

export interface AIOutput {
  target: Coord;
  memory: AIMemory;
}
