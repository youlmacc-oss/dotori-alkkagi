import { describe, expect, it } from 'vitest';
import {
  ACORN_KEY,
  DEFAULT_ACORNS,
  PVP_START_HINT,
  PVP_WAIT_HINT,
  acornOf,
  canStartMatch,
  firstPlayerId,
  hasPvpOpponent,
  readAcornCount,
} from '../src/network/MatchStart.js';

describe('선공·시작 권한', () => {
  it('1인·AI는 유저가 선공과 시작 권한을 갖는다', () => {
    expect(canStartMatch({ mode: 'solo', userId: 'u1', players: [] })).toBe(true);
    expect(canStartMatch({ mode: 'ai', userId: 'u1', players: [] })).toBe(true);
  });

  it('1:1은 상대가 오기 전에는 시작할 수 없다', () => {
    expect(hasPvpOpponent([{ userId: 'solo', acorns: 3 }])).toBe(false);
    expect(canStartMatch({ mode: 'pvp', userId: 'solo', players: [{ userId: 'solo', acorns: 3 }] })).toBe(false);
    expect(canStartMatch({ mode: 'pvp', userId: 'solo', players: [] })).toBe(false);
    expect(PVP_WAIT_HINT).toContain('상대');
    expect(PVP_WAIT_HINT).toContain('대기');
  });

  it('1:1은 도토리가 적은 사람이 선공이다', () => {
    const players = [
      { userId: 'rich', acorns: 20 },
      { userId: 'poor', acorns: 3 },
    ];
    expect(firstPlayerId(players)).toBe('poor');
    expect(canStartMatch({ mode: 'pvp', userId: 'poor', players })).toBe(true);
    expect(canStartMatch({ mode: 'pvp', userId: 'rich', players })).toBe(false);
  });

  it('도토리가 같으면 userId 순으로 선공을 정한다', () => {
    expect(firstPlayerId([
      { userId: 'b', acorns: 10 },
      { userId: 'a', acorns: 10 },
    ])).toBe('a');
  });

  it('도토리 수와 안내 문구를 읽는다', () => {
    expect(acornOf({ acorns: 7.9 })).toBe(7);
    expect(acornOf({ acorns: -2 })).toBe(-2);
    expect(acornOf({})).toBe(DEFAULT_ACORNS);
    const storage = { getItem: (k) => (k === ACORN_KEY ? '4' : null) };
    expect(readAcornCount(storage)).toBe(DEFAULT_ACORNS);
    expect(PVP_START_HINT).toContain('도토리가 적은 사람');
    expect(PVP_START_HINT).toContain('시작');
  });
});
