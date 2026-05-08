import { describe, expect, it } from 'vitest';
import { initialState, reducer } from '../../src/game/engine';

describe('online-2p mode in the engine', () => {
  it('initialState({ mode: "online-2p" }) creates two human players', () => {
    const s = initialState({ mode: 'online-2p' });
    expect(s.mode).toBe('online-2p');
    expect(s.players.p1.kind).toBe('human');
    expect(s.players.p2.kind).toBe('human');
    expect(s.phase).toBe('home');
  });

  it('SET_MODE to online-2p from solo replaces AI p2 with human p2', () => {
    let s = initialState({ mode: 'solo' });
    expect(s.players.p2.kind).toBe('ai');
    s = reducer(s, { type: 'SET_MODE', mode: 'online-2p' });
    expect(s.mode).toBe('online-2p');
    expect(s.players.p2.kind).toBe('human');
  });

  it('SET_MODE from online-2p back to solo restores AI p2', () => {
    let s = initialState({ mode: 'online-2p' });
    s = reducer(s, { type: 'SET_MODE', mode: 'solo' });
    expect(s.mode).toBe('solo');
    expect(s.players.p2.kind).toBe('ai');
  });
});
