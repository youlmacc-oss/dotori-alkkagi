import { describe, expect, it } from 'vitest';
import {
  canShareInvite,
  INVITE_COPIED_HINT,
  INVITE_NICK_FALLBACK,
  INVITE_NICK_STORAGE_KEY,
  INVITE_ROOM_GONE_HINT,
  INVITE_SHARE_TEXT,
  INVITE_SHARE_TITLE,
  clearInviteQuery,
  evaluateInviteJoin,
  findInviteRoom,
  guestInviteNickname,
  inviteUrlFor,
  parseGuideChoice,
  persistInviteNickname,
  PVP_WAIT_EXPIRE_HINT,
  PVP_WAIT_EXPIRE_MS,
  roomOpenedAt,
  shouldExpirePvpWait,
  PVP_GUIDE_ASK,
  PVP_ROOM_HINT,
  readInvitePrefill,
  readInviteRoomId,
  shareOrCopyInvite,
  shouldInvitePvp,
} from '../src/network/PvpInvite.js';

describe('대기실 1:1 안내', () => {
  it('유저가 1명이라도 있으면 1:1을 유도한다', () => {
    expect(shouldInvitePvp(0)).toBe(false);
    expect(shouldInvitePvp(1)).toBe(true);
    expect(shouldInvitePvp(3)).toBe(true);
    expect(PVP_ROOM_HINT).toContain('대국방');
    expect(PVP_ROOM_HINT).toContain('시작');
  });

  it('가이드선 사용·미사용을 가린다', () => {
    expect(parseGuideChoice('사용')).toBe(true);
    expect(parseGuideChoice('미사용')).toBe(false);
    expect(parseGuideChoice(true)).toBe(true);
    expect(parseGuideChoice(false)).toBe(false);
    expect(parseGuideChoice('maybe')).toBeNull();
    expect(PVP_GUIDE_ASK).toContain('가이드선');
  });

  it('초대 URL을 읽고 빈 닉은 게스트로 맞춘다', () => {
    expect(readInviteRoomId('?room=room_host_1')).toBe('room_host_1');
    expect(readInviteRoomId('https://x.test/play?room=room_a')).toBe('room_a');
    expect(inviteUrlFor('room_host_1', { origin: 'https://game.test', pathname: '/' }))
      .toBe('https://game.test/?room=room_host_1');
    expect(guestInviteNickname('', []).nickname).toBe(INVITE_NICK_FALLBACK);
    expect(guestInviteNickname('가나다라마바', []).nickname).toBe('가나다라마');
    expect(guestInviteNickname('달이', [{ userId: 'a', nickname: '달이' }]).nickname).toBe('달이2');
    const store = new Map();
    const local = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
    persistInviteNickname('호치', local, local);
    expect(readInvitePrefill({ getItem: () => '' }, local)).toBe('호치');
    expect(store.get(INVITE_NICK_STORAGE_KEY)).toBe('호치');
    const hist = [];
    clearInviteQuery({
      location: { pathname: '/play' },
      document: { title: '도토리' },
      history: { replaceState: (...args) => hist.push(args) },
    });
    expect(hist[0][2]).toBe('/play');
  });

  it('대기 중인 1:1만 초대 입장하고 가득 찬 방은 거절한다', () => {
    const waiting = {
      id: 'room_host_1',
      mode: 'pvp',
      status: 'waiting',
      hostId: 'host',
      players: [{ userId: 'host', nickname: '도토리1' }],
    };
    const full = {
      ...waiting,
      status: 'playing',
      players: [{ userId: 'host' }, { userId: 'guest' }],
    };
    expect(findInviteRoom([waiting], 'room_host_1')).toEqual(waiting);
    expect(evaluateInviteJoin(waiting, 'guest').ok).toBe(true);
    expect(evaluateInviteJoin(full, 'late').ok).toBe(false);
    expect(evaluateInviteJoin(null, 'guest').hint).toBe(INVITE_ROOM_GONE_HINT);
    expect(evaluateInviteJoin({ ...waiting, mode: 'solo' }, 'guest').ok).toBe(false);
    expect(evaluateInviteJoin({ ...waiting, mode: 'ai' }, 'guest').ok).toBe(false);
    expect(canShareInvite({
      mode: 'pvp', inRoom: true, started: false, isHost: true, hasOpponent: false,
    })).toBe(true);
    expect(canShareInvite({
      mode: 'solo', inRoom: true, started: false, isHost: true, hasOpponent: false,
    })).toBe(false);
    expect(canShareInvite({
      mode: 'pvp', inRoom: true, started: false, isHost: true, hasOpponent: true,
    })).toBe(false);
  });

  it('1:1 개설 후 10분이면 대기실로 보낸다', () => {
    expect(PVP_WAIT_EXPIRE_MS).toBe(10 * 60 * 1000);
    expect(PVP_WAIT_EXPIRE_HINT).toContain('10분');
    expect(roomOpenedAt([
      { roomId: 'room_a', pvpOpenedAt: 5000 },
      { roomId: 'room_a', pvpOpenedAt: 2000 },
      { roomId: 'room_b', pvpOpenedAt: 100 },
    ], 'room_a', 9000)).toBe(2000);
    expect(shouldExpirePvpWait({
      mode: 'pvp', openedAt: 1000, started: false, now: 1000 + PVP_WAIT_EXPIRE_MS,
    })).toBe(true);
    expect(shouldExpirePvpWait({
      mode: 'pvp', openedAt: 1000, started: false, now: 1000 + PVP_WAIT_EXPIRE_MS - 1,
    })).toBe(false);
    expect(shouldExpirePvpWait({
      mode: 'pvp', openedAt: 1000, started: true, now: 1000 + PVP_WAIT_EXPIRE_MS,
    })).toBe(false);
    expect(shouldExpirePvpWait({
      mode: 'solo', openedAt: 1000, started: false, now: 1000 + PVP_WAIT_EXPIRE_MS,
    })).toBe(false);
  });

  it('모바일이면 공유하고 아니면 클립보드에 복사한다', async () => {
    const shared = [];
    const copied = [];
    expect(INVITE_SHARE_TITLE).toContain('대전 초대');
    expect(INVITE_SHARE_TEXT).toContain('링크');
    await expect(shareOrCopyInvite('https://x.test/?room=a', {
      share: async (payload) => { shared.push(payload); },
    })).resolves.toEqual({ ok: true, method: 'share', hint: '' });
    expect(shared[0].title).toBe(INVITE_SHARE_TITLE);
    await expect(shareOrCopyInvite('https://x.test/?room=a', {
      share: null,
      clipboard: { writeText: async (text) => { copied.push(text); } },
    })).resolves.toEqual({ ok: true, method: 'copy', hint: INVITE_COPIED_HINT });
    expect(copied).toEqual(['https://x.test/?room=a']);
  });
});
