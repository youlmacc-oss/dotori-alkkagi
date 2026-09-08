import { describe, expect, it } from 'vitest';
import {
  KEEP_CONNECTED_NICKNAME,
  PRESENCE_RETRACK_GRACE_MS,
  PRESENCE_STALE_MS,
  STALE_LEAVE_HINT,
  SWEEP_LEAVE_HINT,
  activeLobbyUsers,
  isCustomNickname,
  isKeptConnectedNickname,
  isRetrackPresenceLeave,
  isStalePresence,
  keepConnectedUsers,
  nicknameForSeat,
  reconcileOwnSeat,
  shouldConfirmPresenceLeave,
  shouldPublishLeaveOnUnload,
  shouldEvictConnectedUser,
  shouldForceLobbyLeave,
} from '../src/network/PresencePolicy.js';

describe('대기실 입장 순 닉네임·5분 퇴장', () => {
  it('기본 닉네임은 자리에 맞추고 임의 닉만 유지한다', () => {
    expect(isCustomNickname('도토리1')).toBe(false);
    expect(isCustomNickname('도토리11')).toBe(false);
    expect(isCustomNickname('달이')).toBe(true);
    expect(nicknameForSeat(3, '도토리1')).toBe('도토리3');
    expect(nicknameForSeat(3, '')).toBe('도토리3');
    expect(nicknameForSeat(2, '달이')).toBe('달이');
  });

  it('같은 자리는 먼저 들어온 사람이 지키고 나중 사람이 다음 번호를 받는다', () => {
    const elder = { userId: 'a', seat: 1, nickname: '도토리1', joinedAt: 1000 };
    const late = { userId: 'b', seat: 1, nickname: '도토리1', joinedAt: 2000 };
    expect(reconcileOwnSeat({
      others: [elder], mySeat: 1, myJoinedAt: 2000, myId: 'b',
    })).toBe(2);
    expect(reconcileOwnSeat({
      others: [late], mySeat: 1, myJoinedAt: 1000, myId: 'a',
    })).toBe(1);
    expect(reconcileOwnSeat({
      others: [elder], mySeat: null, myJoinedAt: 3000, myId: 'c',
    })).toBe(2);
  });

  it('5분 이상 끊기거나 심박이 없으면 대기실에서 빼낸다', () => {
    expect(PRESENCE_STALE_MS).toBe(5 * 60 * 1000);
    expect(STALE_LEAVE_HINT).toContain('5분');
    expect(isStalePresence({ lastSeen: 1 }, 1 + PRESENCE_STALE_MS)).toBe(true);
    expect(isStalePresence({ lastSeen: 100 }, 100 + PRESENCE_STALE_MS - 1)).toBe(false);
    expect(shouldForceLobbyLeave(10, 10 + PRESENCE_STALE_MS)).toBe(true);
    expect(shouldForceLobbyLeave(10, 10 + PRESENCE_STALE_MS - 1)).toBe(false);
    expect(shouldForceLobbyLeave(null, Date.now())).toBe(false);
    expect(isStalePresence({ joinedAt: 1 }, 1 + PRESENCE_STALE_MS)).toBe(false);
    const live = activeLobbyUsers([
      { userId: 'old', lastSeen: 1 },
      { userId: 'now', lastSeen: 1 + PRESENCE_STALE_MS - 100 },
    ], 1 + PRESENCE_STALE_MS);
    expect(live.map((u) => u.userId)).toEqual(['now']);
  });

  it('개발자 도토리1만 남기고 나머지 접속자는 퇴장한다', () => {
    expect(KEEP_CONNECTED_NICKNAME).toBe('도토리1');
    expect(isKeptConnectedNickname('도토리1')).toBe(true);
    expect(isKeptConnectedNickname('달이')).toBe(false);
    expect(shouldEvictConnectedUser({ userId: 'a', nickname: '달이' })).toBe(true);
    expect(shouldEvictConnectedUser({ userId: 'virt_1', nickname: '도토리2' })).toBe(false);
    expect(SWEEP_LEAVE_HINT).toContain('개발자 외');
    const kept = keepConnectedUsers([
      { userId: 'dev', nickname: '도토리1' },
      { userId: 'b', nickname: '도토리2' },
      { userId: 'c', nickname: '달이' },
      { userId: 'virt_3', nickname: '도토리3' },
    ]);
    expect(kept.map((u) => u.userId)).toEqual(['dev', 'virt_3']);
    expect(keepConnectedUsers([{ userId: 'b', nickname: '달이' }], null)).toHaveLength(1);
  });

  it('닉 변경으로 track만 다시 하면 퇴장으로 보지 않는다', () => {
    expect(PRESENCE_RETRACK_GRACE_MS).toBe(2000);
    expect(isRetrackPresenceLeave({
      key: 'g',
      leftPresences: [{ userId: 'g', nickname: '도토리2', lastSeen: 10 }],
      liveUsers: [{ userId: 'g', nickname: '달이', lastSeen: 20 }],
    })).toBe(true);
    expect(shouldConfirmPresenceLeave({
      key: 'g',
      leftPresences: [{ userId: 'g', nickname: '도토리2', lastSeen: 10 }],
      liveUsers: [],
      hint: { userId: 'g', nickname: '달이', lastSeen: 20 },
    })).toBe(false);
    expect(shouldConfirmPresenceLeave({
      key: 'g',
      liveUsers: [],
      explicitLeft: true,
    })).toBe(true);
    expect(shouldConfirmPresenceLeave({
      key: 'g',
      liveUsers: [],
    })).toBe(true);
    expect(shouldConfirmPresenceLeave({
      key: 'me',
      selfLeave: true,
      liveUsers: [],
    })).toBe(false);
    expect(shouldPublishLeaveOnUnload({ type: 'beforeunload' })).toBe(true);
    expect(shouldPublishLeaveOnUnload(
      { type: 'pagehide', persisted: false },
      { visibilityState: 'hidden' },
    )).toBe(false);
    expect(shouldPublishLeaveOnUnload({ type: 'pagehide', persisted: true })).toBe(false);
  });
});
