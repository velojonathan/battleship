import type { ShipId, PlayerId } from './types';

export const BOARD_SIZE = 10;

export interface FleetSpec {
  id: ShipId;
  name: string;
  length: number;
}

export const FLEET: readonly FleetSpec[] = [
  { id: 'carrier', name: 'Carrier', length: 5 },
  { id: 'battleship', name: 'Battleship', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
];

export const SHIP_LENGTH: Readonly<Record<ShipId, number>> = {
  carrier: 5,
  battleship: 4,
  cruiser: 3,
  submarine: 3,
  destroyer: 2,
};

export const SHIP_NAME: Readonly<Record<ShipId, string>> = {
  carrier: 'Carrier',
  battleship: 'Battleship',
  cruiser: 'Cruiser',
  submarine: 'Submarine',
  destroyer: 'Destroyer',
};

export const TOTAL_SHIP_CELLS = FLEET.reduce((sum, s) => sum + s.length, 0); // 17

export const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'];

export const DEFAULT_NAMES: Readonly<Record<PlayerId, string>> = {
  p1: 'Player 1',
  p2: 'Player 2',
};

export const AI_NAME = 'AI Commander';

export const PERSISTENCE_KEY = 'battleship:v1';
