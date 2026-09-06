import { describe, expect, it } from 'vitest';
import {
  LOCATION_GUIDE,
  MY_NICK_LABEL,
  NICKNAME_HINT,
  NICKNAME_LOCKED_HINT,
  NICKNAME_MAX,
  NICKNAME_TAKEN_HINT,
  canChangeNickname,
  countNicknameChars,
  defaultNickname,
  isCustomNickname,
  locationLabel,
  matchSeatNames,
  funAiNickname,
  FUN_AI_NAMES,
  nextDotoriNumber,
  nextSeat,
  parseDefaultSeat,
  parseDotoriNumber,
  playerSeat,
  sanitizeNickname,
  shouldKeepAssignedNickname,
  sortBySeat,
  uniqueLobbyNickname,
} from '../src/network/Nickname.js';

describe('대기실 닉네임', () => {
  it('접속 순서대로 도토리1부터 기본 닉네임을 준다', () => {
    expect(defaultNickname(1)).toBe('도토리1');
    expect(defaultNickname(2)).toBe('도토리2');
    expect(defaultNickname(10)).toBe('도토리10');
    expect(nextSeat([])).toBe(1);
    expect(nextSeat([{ nickname: '도토리1' }])).toBe(2);
    expect(nextSeat([{ seat: 1 }, { seat: 3, nickname: '민수' }])).toBe(2);
    expect(nextSeat(Array.from({ length: 10 }, (_, i) => ({ seat: i + 1 })))).toBeNull();
    expect(parseDefaultSeat('도토리4')).toBe(4);
    expect(parseDefaultSeat('민수')).toBeNull();
    expect(parseDotoriNumber('도토리11')).toBe(11);
    expect(isCustomNickname('도토리11')).toBe(false);
    expect(nextDotoriNumber([])).toBe(1);
    expect(uniqueLobbyNickname('', []).nickname).toBe('도토리1');
    expect(nextDotoriNumber([{ nickname: '도토리1' }, { nickname: '도토리5' }])).toBe(6);
    expect(uniqueLobbyNickname('', [
      { userId: 'a', nickname: '도토리1' },
      { userId: 'b', nickname: '도토리5' },
    ]).nickname).toBe('도토리6');
    expect(uniqueLobbyNickname('달이', [{ userId: 'a', nickname: '달이' }])).toMatchObject({
      ok: true, nickname: '달이2', custom: true, renamed: true, hint: NICKNAME_TAKEN_HINT,
    });
    expect(uniqueLobbyNickname('가나다라마', [{ userId: 'a', nickname: '가나다라마' }])).toMatchObject({
      ok: true, nickname: '도토리1', custom: false, renamed: true, hint: NICKNAME_TAKEN_HINT,
    });
    expect(shouldKeepAssignedNickname({
      assigned: true, nickname: '도토리1', others: [{ userId: 'b', nickname: '도토리2' }], myId: 'a',
    })).toBe(true);
    expect(shouldKeepAssignedNickname({
      assigned: true,
      nickname: '도토리1',
      myId: 'a',
      myJoinedAt: 1000,
      others: [{ userId: 'b', nickname: '도토리1', joinedAt: 2000 }],
    })).toBe(true);
    expect(shouldKeepAssignedNickname({
      assigned: true,
      nickname: '도토리1',
      myId: 'b',
      myJoinedAt: 2000,
      others: [{ userId: 'a', nickname: '도토리1', joinedAt: 1000 }],
    })).toBe(false);
  });

  it('대기실에서는 바꾸고 대전·관람 중에는 잠근다', () => {
    expect(canChangeNickname({})).toBe(true);
    expect(canChangeNickname({ inMatch: false, spectating: false })).toBe(true);
    expect(canChangeNickname({ inMatch: true })).toBe(false);
    expect(canChangeNickname({ spectating: true })).toBe(false);
    expect(MY_NICK_LABEL).toBe('내닉네임');
    expect(NICKNAME_LOCKED_HINT).toContain('바꿀 수 없');
    expect(NICKNAME_LOCKED_HINT).toContain('대전');
  });

  it('임의 닉네임은 5글자 이내만 받고 안내 문구를 준다', () => {
    expect(NICKNAME_MAX).toBe(5);
    expect(countNicknameChars('가나다라마')).toBe(5);
    expect(sanitizeNickname('', '도토리1')).toEqual({
      ok: true, nickname: '도토리1', custom: false, hint: NICKNAME_HINT,
    });
    expect(sanitizeNickname('  달이  ', '도토리1')).toMatchObject({
      ok: true, nickname: '달이', custom: true, hint: NICKNAME_HINT,
    });
    expect(sanitizeNickname('가나다라마', '도토리1')).toMatchObject({
      ok: true, nickname: '가나다라마',
    });
    expect(sanitizeNickname('가나다라마바', '도토리1')).toMatchObject({
      ok: false, nickname: '가나다라마', custom: true, hint: NICKNAME_HINT,
    });
  });

  it('접속된 게이머 위치는 닉네임과 상관없이 항상 공개한다', () => {
    expect(LOCATION_GUIDE).toContain('위치는 항상 공개');
    expect(playerSeat({ seat: 3, nickname: '달이' })).toBe(3);
    expect(playerSeat({ nickname: '도토리2' })).toBe(2);
    expect(locationLabel(1)).toBe('위치 1');
    expect(locationLabel(null)).toBe('위치 —');
    const ordered = sortBySeat([
      { seat: 4, nickname: '금동' },
      { seat: 1, nickname: '호치' },
      { nickname: '도토리2' },
    ]);
    expect(ordered.map((u) => playerSeat(u))).toEqual([1, 2, 4]);
  });

  it('대전 판 닉네임은 모드·자리에 따라 갈린다', () => {
    expect(matchSeatNames({ mode: 'solo', myName: '달이' })).toEqual({ black: '달이', white: '달이' });
    const ai = matchSeatNames({ mode: 'ai', myName: '달이', seed: 'user_1' });
    expect(ai.black).toBe('달이');
    expect(FUN_AI_NAMES).toContain(ai.white);
    expect(funAiNickname('user_1')).toBe(ai.white);
    expect(Array.from(ai.white).length).toBeLessThanOrEqual(5);
    expect(matchSeatNames({ mode: 'pvp', myName: '호치', opponentName: '금동' }))
      .toEqual({ black: '호치', white: '금동' });
    expect(matchSeatNames({ mode: 'pvp', myName: '호치' }).white).toBe('상대');
  });
});
