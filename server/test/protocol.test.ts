import { describe, expect, it } from 'vitest';
import {
  NAME_MAX_LEN,
  parseClientMessage,
  sanitizeName,
} from '../src/protocol';

describe('parseClientMessage', () => {
  it('accepts well-formed hello / join / reconnect / leave', () => {
    expect(
      parseClientMessage(JSON.stringify({ type: 'hello', seat: 'p1', token: 'tok' })),
    ).toEqual({ type: 'hello', seat: 'p1', token: 'tok' });

    expect(
      parseClientMessage(JSON.stringify({ type: 'hello', seat: 'p1', token: 'tok', name: 'Han' })),
    ).toEqual({ type: 'hello', seat: 'p1', token: 'tok', name: 'Han' });

    expect(parseClientMessage(JSON.stringify({ type: 'join' }))).toEqual({
      type: 'join',
    });
    expect(parseClientMessage(JSON.stringify({ type: 'join', name: 'Pat' }))).toEqual({
      type: 'join',
      name: 'Pat',
    });
    expect(
      parseClientMessage(JSON.stringify({ type: 'reconnect', seat: 'p2', token: 'tok' })),
    ).toEqual({ type: 'reconnect', seat: 'p2', token: 'tok' });

    expect(parseClientMessage(JSON.stringify({ type: 'leave' }))).toEqual({
      type: 'leave',
    });
  });

  it('rejects unknown types and shapes', () => {
    expect(parseClientMessage(JSON.stringify({}))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'hello' }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: 'hello', seat: 'p3', token: 'x' })),
    ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: 'hello', seat: 'p1', token: '' })),
    ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: 'hello', seat: 'p1', token: 42 })),
    ).toBeNull();
    expect(parseClientMessage('{')).toBeNull();
    expect(parseClientMessage(123 as unknown)).toBeNull();
    expect(parseClientMessage('a'.repeat(5000))).toBeNull();
  });
});

describe('sanitizeName', () => {
  it('falls back to default for empty / undefined / whitespace', () => {
    expect(sanitizeName(undefined, 'Player 1')).toBe('Player 1');
    expect(sanitizeName('', 'Player 1')).toBe('Player 1');
    expect(sanitizeName('   ', 'Player 1')).toBe('Player 1');
  });

  it('clamps to NAME_MAX_LEN', () => {
    const long = 'A'.repeat(NAME_MAX_LEN + 5);
    expect(sanitizeName(long, 'fallback').length).toBe(NAME_MAX_LEN);
  });

  it('strips control characters and newlines', () => {
    expect(sanitizeName('Han\nSolo\t\x00!', 'fallback')).toBe('HanSolo!');
  });

  it('keeps spaces and most punctuation', () => {
    expect(sanitizeName('Captain Sparrow', 'fallback')).toBe('Captain Sparrow');
    expect(sanitizeName('  Boba   ', 'fallback')).toBe('Boba');
  });
});
