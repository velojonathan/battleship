import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  loadSession,
  saveSession,
} from '../../src/online/storage';

describe('online sessionStorage helpers', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips a saved session', () => {
    saveSession({ code: 'ABCDEFGH', seat: 'p1', token: 'tok' });
    expect(loadSession()).toEqual({
      code: 'ABCDEFGH',
      seat: 'p1',
      token: 'tok',
    });
  });

  it('clearSession deletes the value', () => {
    saveSession({ code: 'ABCDEFGH', seat: 'p2', token: 't' });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('returns null when no session is stored', () => {
    expect(loadSession()).toBeNull();
  });

  it('returns null and clears storage when the stored value is malformed', () => {
    window.sessionStorage.setItem(
      'battleship:online-session',
      JSON.stringify({ code: 'X', seat: 'p3', token: 't' }),
    );
    expect(loadSession()).toBeNull();
    expect(window.sessionStorage.getItem('battleship:online-session')).toBeNull();
  });

  it('returns null when the stored value is not JSON', () => {
    window.sessionStorage.setItem('battleship:online-session', 'not json');
    expect(loadSession()).toBeNull();
  });

  it('does NOT touch localStorage', () => {
    saveSession({ code: 'ABCDEFGH', seat: 'p1', token: 't' });
    expect(window.localStorage.getItem('battleship:online-session')).toBeNull();
  });
});
