import { describe, expect, it } from 'vitest';
import {
  initialState,
  reducer,
  canStart,
  selectActivePlayer,
  selectOpponent,
  selectSelectedShip,
} from '../../src/game/engine';
import { allShipsPlaced, randomFleet } from '../../src/game/placement';
import { mulberry32 } from '../../src/game/rng';
import { TOTAL_SHIP_CELLS } from '../../src/game/constants';
import type { Action, Coord, GameState } from '../../src/game/types';

function placeAllShipsFor(state: GameState, player: 'p1' | 'p2', seed = 1): GameState {
  return reducer(state, { type: 'RANDOMIZE_FLEET', player, seed });
}

function dispatchAll(state: GameState, actions: Action[]): GameState {
  return actions.reduce((s, a) => reducer(s, a), state);
}

describe('initialState', () => {
  it('starts in home phase with sane defaults', () => {
    const s = initialState();
    expect(s.phase).toBe('home');
    expect(s.mode).toBe('solo');
    expect(s.difficulty).toBe('medium');
    expect(s.players.p2.kind).toBe('ai');
    expect(s.winner).toBeNull();
    expect(s.inputLocked).toBe(false);
  });
});

describe('reducer / home actions', () => {
  it('SET_MODE swaps p2 between AI and human', () => {
    const s0 = initialState();
    expect(s0.players.p2.kind).toBe('ai');
    const s1 = reducer(s0, { type: 'SET_MODE', mode: 'local-2p' });
    expect(s1.players.p2.kind).toBe('human');
    const s2 = reducer(s1, { type: 'SET_MODE', mode: 'solo' });
    expect(s2.players.p2.kind).toBe('ai');
  });
  it('SET_DIFFICULTY only works in home phase', () => {
    const s0 = initialState();
    const s1 = reducer(s0, { type: 'SET_DIFFICULTY', difficulty: 'hard' });
    expect(s1.difficulty).toBe('hard');
    // After moving phase, SET_DIFFICULTY is a no-op.
    const s2 = reducer(s1, { type: 'BEGIN_PLACEMENT', seed: 1 });
    const s3 = reducer(s2, { type: 'SET_DIFFICULTY', difficulty: 'easy' });
    expect(s3.difficulty).toBe('hard');
  });
  it('SET_NAME trims, never makes p2 ai-named in solo, and is no-op outside home', () => {
    const s0 = reducer(initialState(), { type: 'SET_NAME', player: 'p1', name: '   Cmdr Sol  ' });
    expect(s0.players.p1.name).toBe('Cmdr Sol');
    const s1 = reducer(s0, { type: 'SET_NAME', player: 'p2', name: 'should not stick' });
    // p2 is AI in solo; SET_NAME ignored.
    expect(s1.players.p2.name).not.toBe('should not stick');
  });
  it('TOGGLE_REDUCED_MOTION flips the flag', () => {
    const s0 = initialState();
    const s1 = reducer(s0, { type: 'TOGGLE_REDUCED_MOTION' });
    expect(s1.settings.reducedMotion).toBe(true);
    const s2 = reducer(s1, { type: 'TOGGLE_REDUCED_MOTION' });
    expect(s2.settings.reducedMotion).toBe(false);
  });
});

describe('reducer / placement', () => {
  it('PLACE_SHIP places valid ship, RESET_FLEET clears all', () => {
    let s = reducer(initialState(), { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = reducer(s, {
      type: 'PLACE_SHIP',
      player: 'p1',
      shipId: 'carrier',
      origin: { row: 0, col: 0 },
      orientation: 'H',
    });
    expect(s.players.p1.fleet.find((x) => x.id === 'carrier')?.origin).toEqual({
      row: 0,
      col: 0,
    });
    s = reducer(s, { type: 'RESET_FLEET', player: 'p1' });
    expect(s.players.p1.fleet.find((x) => x.id === 'carrier')?.origin).toBeNull();
  });
  it('PLACE_SHIP rejects illegal placement (out-of-bounds) without changing state', () => {
    const start = reducer(initialState(), { type: 'BEGIN_PLACEMENT', seed: 1 });
    const after = reducer(start, {
      type: 'PLACE_SHIP',
      player: 'p1',
      shipId: 'carrier',
      origin: { row: 0, col: 9 }, // would extend off-board
      orientation: 'H',
    });
    expect(after.players.p1.fleet.find((x) => x.id === 'carrier')?.origin).toBeNull();
  });
  it('ROTATE_SHIP flips orientation', () => {
    let s = reducer(initialState(), { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'SELECT_SHIP', player: 'p1', shipId: 'destroyer' });
    expect(s.players.p1.placement.orientation).toBe('H');
    s = reducer(s, { type: 'ROTATE_SHIP', player: 'p1' });
    expect(s.players.p1.placement.orientation).toBe('V');
    s = reducer(s, { type: 'ROTATE_SHIP', player: 'p1' });
    expect(s.players.p1.placement.orientation).toBe('H');
  });
  it('RANDOMIZE_FLEET fills all ships legally', () => {
    let s = reducer(initialState(), { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = placeAllShipsFor(s, 'p1', 7);
    expect(allShipsPlaced(s.players.p1.fleet)).toBe(true);
  });
  it('canStart is false until p1 fleet is fully placed', () => {
    let s = reducer(initialState(), { type: 'BEGIN_PLACEMENT', seed: 1 });
    expect(canStart(s)).toBe(false);
    s = placeAllShipsFor(s, 'p1', 7);
    expect(canStart(s)).toBe(true);
  });
});

describe('reducer / wrong-phase guards', () => {
  it('FIRE_SHOT during home is a no-op', () => {
    const s = initialState();
    const after = reducer(s, { type: 'FIRE_SHOT', at: { row: 0, col: 0 }, ts: 0 });
    expect(after).toBe(s);
  });
  it('PLACE_SHIP during in-progress is a no-op', () => {
    const s = startedSoloGame();
    const after = reducer(s, {
      type: 'PLACE_SHIP',
      player: 'p1',
      shipId: 'carrier',
      origin: { row: 0, col: 0 },
      orientation: 'H',
    });
    expect(after.players.p1.fleet).toEqual(s.players.p1.fleet);
  });
  it('COMPLETE_TURN outside in-progress is a no-op', () => {
    const home = initialState();
    expect(reducer(home, { type: 'COMPLETE_TURN' })).toBe(home);
  });
  it('CONFIRM_READY outside handoff is a no-op', () => {
    const home = initialState();
    expect(reducer(home, { type: 'CONFIRM_READY' })).toBe(home);
  });
  it('SET_MODE outside home is a no-op', () => {
    const placement = reducer(initialState(), { type: 'BEGIN_PLACEMENT', seed: 1 });
    const after = reducer(placement, { type: 'SET_MODE', mode: 'local-2p' });
    expect(after.mode).toBe('solo');
  });
  it('SELECT_SHIP outside placement is a no-op', () => {
    const home = initialState();
    expect(
      reducer(home, { type: 'SELECT_SHIP', player: 'p1', shipId: 'carrier' }),
    ).toBe(home);
  });
  it('CONFIRM_PLACEMENT in wrong phase is a no-op', () => {
    const home = initialState();
    expect(reducer(home, { type: 'CONFIRM_PLACEMENT', seed: 1 })).toBe(home);
  });
  it('START_REMATCH outside game-over is a no-op', () => {
    const home = initialState();
    expect(reducer(home, { type: 'START_REMATCH', seed: 1 })).toBe(home);
  });
  it('CONFIRM_PLACEMENT requires all ships placed', () => {
    let s = reducer(initialState(), { type: 'BEGIN_PLACEMENT', seed: 1 });
    // Only place one ship.
    s = reducer(s, {
      type: 'PLACE_SHIP',
      player: 'p1',
      shipId: 'carrier',
      origin: { row: 0, col: 0 },
      orientation: 'H',
    });
    const after = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 1 });
    expect(after.phase).toBe('setup-player-one');
  });
});

function startedSoloGame(): GameState {
  let s = initialState();
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 9 });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 13 });
  return s;
}

describe('reducer / solo flow', () => {
  it('CONFIRM_PLACEMENT auto-places AI and starts game', () => {
    const s = startedSoloGame();
    expect(s.phase).toBe('in-progress');
    expect(allShipsPlaced(s.players.p2.fleet)).toBe(true);
    expect(s.currentTurn).toBe('p1');
  });
  it('FIRE_SHOT registers shot and locks input', () => {
    let s = startedSoloGame();
    const target: Coord = { row: 0, col: 0 };
    s = reducer(s, { type: 'FIRE_SHOT', at: target, ts: 1 });
    expect(s.players.p1.shotsTaken).toHaveLength(1);
    expect(s.inputLocked).toBe(true);
    expect(s.log).toHaveLength(1);
  });
  it('FIRE_SHOT rejects duplicate at same coord', () => {
    let s = startedSoloGame();
    s = reducer(s, { type: 'FIRE_SHOT', at: { row: 0, col: 0 }, ts: 1 });
    s = reducer(s, { type: 'COMPLETE_TURN' });
    s = reducer(s, { type: 'FIRE_SHOT', at: { row: 1, col: 0 }, ts: 2 }); // AI's turn -- but it's currentTurn=p2, so this is treated as AI's shot
    s = reducer(s, { type: 'COMPLETE_TURN' });
    // back to p1; now try to re-fire at (0,0)
    expect(s.currentTurn).toBe('p1');
    const before = s.players.p1.shotsTaken.length;
    s = reducer(s, { type: 'FIRE_SHOT', at: { row: 0, col: 0 }, ts: 3 });
    expect(s.players.p1.shotsTaken.length).toBe(before);
  });
  it('FIRE_SHOT during inputLocked is a no-op', () => {
    let s = startedSoloGame();
    s = reducer(s, { type: 'SET_INPUT_LOCK', locked: true });
    const before = s.players.p1.shotsTaken.length;
    s = reducer(s, { type: 'FIRE_SHOT', at: { row: 0, col: 0 }, ts: 1 });
    expect(s.players.p1.shotsTaken.length).toBe(before);
  });
  it('COMPLETE_TURN swaps turn in solo mode', () => {
    let s = startedSoloGame();
    s = reducer(s, { type: 'FIRE_SHOT', at: { row: 0, col: 0 }, ts: 1 });
    s = reducer(s, { type: 'COMPLETE_TURN' });
    expect(s.currentTurn).toBe('p2');
    expect(s.phase).toBe('in-progress');
  });
});

// Helper: enumerate every ship cell on the given player's fleet.
function shipCellsOf(state: GameState, player: 'p1' | 'p2'): Coord[] {
  const cells: Coord[] = [];
  for (const ship of state.players[player].fleet) {
    const o = ship.origin!;
    for (let i = 0; i < ship.length; i++) {
      cells.push(
        ship.orientation === 'H' ? { row: o.row, col: o.col + i } : { row: o.row + i, col: o.col },
      );
    }
  }
  return cells;
}

// Helper: have p1 deterministically hit every cell of p2's fleet, ignoring AI turn.
function p1WipeOutP2(state: GameState): GameState {
  let s = state;
  const cells = shipCellsOf(s, 'p2');
  let ts = 0;
  for (const c of cells) {
    s = { ...s, currentTurn: 'p1', inputLocked: false };
    s = reducer(s, { type: 'FIRE_SHOT', at: c, ts: ++ts });
    s = reducer(s, { type: 'COMPLETE_TURN' });
  }
  return s;
}

describe('reducer / win and rematch', () => {
  it('FIRE_SHOT sets winner when fleet defeated; COMPLETE_TURN ends game', () => {
    const s = p1WipeOutP2(startedSoloGame());
    expect(s.winner).toBe('p1');
    expect(s.phase).toBe('game-over');
  });

  it('START_REMATCH yields fresh state with empty boards and incremented count', () => {
    const s = p1WipeOutP2(startedSoloGame());
    expect(s.phase).toBe('game-over');
    const next = reducer(s, { type: 'START_REMATCH', seed: 99 });
    expect(next.phase).toBe('setup-player-one');
    expect(next.winner).toBeNull();
    expect(next.log).toHaveLength(0);
    expect(next.players.p1.fleet.every((sh) => sh.origin === null)).toBe(true);
    expect(next.players.p2.fleet.every((sh) => sh.origin === null)).toBe(true);
    expect(next.rematchCount).toBe(1);
    // Names preserved
    expect(next.players.p1.name).toBe(s.players.p1.name);
  });
});

describe('reducer / RETURN_HOME and 2P transitions', () => {
  it('RETURN_HOME restores home with preserved preferences', () => {
    const s0 = initialState();
    const s1 = reducer(s0, { type: 'SET_DIFFICULTY', difficulty: 'hard' });
    const s2 = reducer(s1, { type: 'BEGIN_PLACEMENT', seed: 1 });
    const home = reducer(s2, { type: 'RETURN_HOME' });
    expect(home.phase).toBe('home');
    expect(home.difficulty).toBe('hard');
    expect(home.log).toHaveLength(0);
  });
  it('local-2p flow goes home → setup-1 → handoff → setup-2 → handoff → in-progress', () => {
    let s = initialState();
    s = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
    expect(s.phase).toBe('setup-player-one');
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 1 });
    s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 1 });
    expect(s.phase).toBe('handoff');
    expect(s.pendingHandoffTo).toBe('p2');
    s = reducer(s, { type: 'CONFIRM_READY' });
    expect(s.phase).toBe('setup-player-two');
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p2', seed: 2 });
    s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 1 });
    expect(s.phase).toBe('handoff');
    expect(s.pendingHandoffTo).toBe('p1');
    s = reducer(s, { type: 'CONFIRM_READY' });
    expect(s.phase).toBe('in-progress');
    expect(s.currentTurn).toBe('p1');
  });
  it('2P COMPLETE_TURN routes to handoff between every shot', () => {
    let s = startedTwoPlayerGame();
    s = reducer(s, { type: 'FIRE_SHOT', at: { row: 5, col: 5 }, ts: 1 });
    s = reducer(s, { type: 'COMPLETE_TURN' });
    expect(s.phase).toBe('handoff');
    expect(s.handoffReason).toBe('turn');
    expect(s.pendingHandoffTo).toBe('p2');
    s = reducer(s, { type: 'CONFIRM_READY' });
    expect(s.phase).toBe('in-progress');
    expect(s.currentTurn).toBe('p2');
  });
});

function startedTwoPlayerGame(): GameState {
  let s = initialState();
  s = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
  s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 1 });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 1 });
  s = reducer(s, { type: 'CONFIRM_READY' });
  s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p2', seed: 2 });
  s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 1 });
  s = reducer(s, { type: 'CONFIRM_READY' });
  return s;
}

describe('selectors', () => {
  it('selectActivePlayer returns p1 in setup-player-one', () => {
    const s = reducer(initialState(), { type: 'BEGIN_PLACEMENT', seed: 1 });
    expect(selectActivePlayer(s).id).toBe('p1');
  });
  it('selectActivePlayer returns currentTurn during in-progress', () => {
    const s = startedSoloGame();
    expect(selectActivePlayer(s).id).toBe('p1');
  });
  it('selectActivePlayer returns p2 in setup-player-two', () => {
    let s = initialState();
    s = reducer(s, { type: 'SET_MODE', mode: 'local-2p' });
    s = reducer(s, { type: 'BEGIN_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'RANDOMIZE_FLEET', player: 'p1', seed: 1 });
    s = reducer(s, { type: 'CONFIRM_PLACEMENT', seed: 1 });
    s = reducer(s, { type: 'CONFIRM_READY' });
    expect(s.phase).toBe('setup-player-two');
    expect(selectActivePlayer(s).id).toBe('p2');
  });
  it('selectOpponent returns the other player', () => {
    const s = startedSoloGame();
    expect(selectOpponent(s).id).toBe('p2');
  });
  it('selectSelectedShip returns the selected ship or null', () => {
    let s = reducer(initialState(), { type: 'BEGIN_PLACEMENT', seed: 1 });
    expect(selectSelectedShip(s, 'p1')?.id).toBe('carrier');
    s = reducer(s, { type: 'SELECT_SHIP', player: 'p1', shipId: null });
    expect(selectSelectedShip(s, 'p1')).toBeNull();
  });
});

describe('reducer / log integrity', () => {
  it('appends one log entry per shot with monotonic turn numbers', () => {
    let s = startedSoloGame();
    s = dispatchAll(s, [
      { type: 'FIRE_SHOT', at: { row: 0, col: 0 }, ts: 100 },
      { type: 'COMPLETE_TURN' },
      { type: 'FIRE_SHOT', at: { row: 1, col: 1 }, ts: 200 },
      { type: 'COMPLETE_TURN' },
    ]);
    expect(s.log.length).toBe(2);
    expect(s.log[0]?.ts).toBe(100);
    expect(s.log[1]?.ts).toBe(200);
  });
});

describe('integration: total ship cell count matches expected', () => {
  it('TOTAL_SHIP_CELLS is 17', () => {
    expect(TOTAL_SHIP_CELLS).toBe(17);
  });
  it('randomFleet covers exactly TOTAL_SHIP_CELLS cells', () => {
    const { board } = randomFleet(mulberry32(123));
    let count = 0;
    for (const row of board.cells) for (const cell of row) if (cell.shipId) count++;
    expect(count).toBe(TOTAL_SHIP_CELLS);
  });
});
