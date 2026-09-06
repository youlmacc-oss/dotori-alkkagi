import { describe, expect, it } from 'vitest';
import {
  canShareInvite,
  inviteShareMessage,
  kakaoTalkHref,
  KAKAO_SHARE_HINT,
  INVITE_COPIED_HINT,
  INVITE_NICK_FALLBACK,
  INVITE_NICK_STORAGE_KEY,
  INVITE_ROOM_GONE_HINT,
  INVITE_SHARE_TEXT,
  INVITE_SHARE_TITLE,
  clearInviteQuery,
  evaluateInviteJoin,
  findInviteRoom,
  inviteMissFallback,
  guestInviteNickname,
  inviteUrlFor,
  idleLobbyInvitees,
  isIdleLobbyUser,
  canInviteLobbyUser,
  buildLobbyInvite,
  evaluateLobbyInvite,
  attemptInviteJoin,
  lobbyInviteAsk,
  presenceInvitePayload,
  shouldOpenPresenceInvite,
  sentInviteFields,
  shouldRepublishOpenRoom,
  LOBBY_INVITE_SENT,
  LOBBY_INVITE_BTN,
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
  readStoredInviteRoom,
  resolveInviteRoom,
  writeStoredInviteRoom,
  shareOrCopyInvite,
  shareViaKakaoTalk,
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
    expect(writeStoredInviteRoom('room_host_1', local)).toBe('room_host_1');
    expect(readStoredInviteRoom(local)).toBe('room_host_1');
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
    expect(resolveInviteRoom([
      { userId: 'host', nickname: '도토리1', status: 'playing', mode: 'pvp', roomId: 'room_host_1' },
    ], 'room_host_1')?.hostId).toBe('host');
    expect(findInviteRoom([waiting], 'room_host_1')).toEqual(waiting);
    expect(evaluateInviteJoin(waiting, 'guest').ok).toBe(true);
    expect(evaluateInviteJoin(full, 'late').ok).toBe(false);
    expect(evaluateInviteJoin(null, 'guest').hint).toBe(INVITE_ROOM_GONE_HINT);
    expect(INVITE_ROOM_GONE_HINT).toContain('종료');
    expect(inviteMissFallback(false)).toEqual({ toLobby: true, hint: INVITE_ROOM_GONE_HINT });
    expect(inviteMissFallback(true)).toEqual({ toLobby: false, hint: '' });
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

  it('방장은 대기방 사람에게 1:1 초대를 보낸다', () => {
    const waiting = { userId: 'guest', nickname: '달이', status: 'lobby' };
    const playing = { userId: 'busy', nickname: '호치', status: 'playing', mode: 'ai' };
    expect(isIdleLobbyUser(waiting)).toBe(true);
    expect(isIdleLobbyUser(playing)).toBe(false);
    expect(idleLobbyInvitees([waiting, playing, { userId: 'host', status: 'lobby' }], 'host'))
      .toEqual([waiting]);
    expect(canInviteLobbyUser({
      mode: 'pvp', inRoom: true, started: false, isHost: true, hasOpponent: false, target: waiting,
    })).toBe(true);
    expect(canInviteLobbyUser({
      mode: 'pvp', inRoom: true, started: false, isHost: true, hasOpponent: false, target: playing,
    })).toBe(false);
    const payload = buildLobbyInvite({
      roomId: 'room_host', hostId: 'host', hostName: '도토리1', targetId: 'guest',
    });
    expect(evaluateLobbyInvite(payload, 'guest').ok).toBe(true);
    expect(evaluateLobbyInvite(payload, 'other').ok).toBe(false);
    expect(evaluateLobbyInvite({ roomId: '', hostId: 'host', targetId: 'guest' }, 'guest').ok).toBe(false);
    expect(lobbyInviteAsk('도토리1')).toContain('도토리1');
    expect(LOBBY_INVITE_SENT).toContain('초대');
    expect(LOBBY_INVITE_BTN).toContain('초대');
    expect(sentInviteFields({
      inRoom: true, started: false, mode: 'pvp', hasOpponent: false,
      sent: { inviteTargetId: 'guest', inviteAt: 9 },
    })).toEqual({ inviteTargetId: 'guest', inviteAt: 9 });
    expect(sentInviteFields({
      inRoom: true, started: false, mode: 'pvp', hasOpponent: true,
      sent: { inviteTargetId: 'guest', inviteAt: 9 },
    })).toEqual({ inviteTargetId: null, inviteAt: null });
    expect(shouldRepublishOpenRoom({ inRoom: true, mode: 'pvp' })).toBe(true);
    expect(shouldRepublishOpenRoom({ inRoom: true, mode: 'solo' })).toBe(true);
    expect(shouldRepublishOpenRoom({ inRoom: false, mode: 'pvp' })).toBe(false);
    const liveInvite = {
      userId: 'host',
      nickname: '호치',
      status: 'playing',
      mode: 'pvp',
      roomId: 'room_host',
      inviteTargetId: 'guest',
      inviteAt: 20,
    };
    expect(shouldOpenPresenceInvite(liveInvite, 'guest')).toBe(true);
    expect(shouldOpenPresenceInvite(liveInvite, 'guest', 20)).toBe(false);
    expect(shouldOpenPresenceInvite(liveInvite, 'other')).toBe(false);
    expect(presenceInvitePayload(liveInvite)).toMatchObject({
      roomId: 'room_host',
      hostId: 'host',
      targetId: 'guest',
    });
  });

  it('수락은 방이 잠깐 없어도 Presence를 다시 보고 붙는다', async () => {
    const rooms = {};
    let refresh = 0;
    const missed = await attemptInviteJoin({
      roomId: 'room_h',
      join: (id) => Boolean(rooms[id]),
      refresh: () => { refresh += 1; rooms.room_h = true; },
      wait: async () => {},
    });
    expect(refresh).toBe(1);
    expect(missed).toEqual({ ok: true, joined: true });
    const gone = await attemptInviteJoin({
      roomId: 'room_gone',
      join: () => false,
      refresh: () => {},
      wait: async () => {},
    });
    expect(gone).toEqual({ ok: false, joined: false });
    const first = await attemptInviteJoin({
      roomId: 'room_ready',
      join: () => true,
      refresh: () => { refresh += 1; },
    });
    expect(first).toEqual({ ok: true, joined: true });
    expect(refresh).toBe(1);
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
    expect(shared[0].text).toContain('https://x.test/?room=a');
    await expect(shareOrCopyInvite('https://x.test/?room=a', {
      share: null,
      clipboard: { writeText: async (text) => { copied.push(text); } },
    })).resolves.toEqual({ ok: true, method: 'copy', hint: INVITE_COPIED_HINT });
    expect(copied).toEqual(['https://x.test/?room=a']);
    expect(inviteShareMessage('https://x.test/?room=a')).toContain('https://x.test/?room=a');
    expect(kakaoTalkHref('https://x.test/?room=a', 'Mozilla/5.0 (Linux; Android 14)')).toContain('com.kakao.talk');
    expect(kakaoTalkHref('https://x.test/?room=a', 'Mozilla/5.0 (Windows NT 10.0)')).toBe('kakaotalk://');
    const opened = [];
    const kakaoCopied = [];
    await expect(shareViaKakaoTalk('https://x.test/?room=a', {
      ua: 'Mozilla/5.0 (Windows NT 10.0)',
      clipboard: { writeText: async (text) => { kakaoCopied.push(text); } },
      open: (href) => { opened.push(href); },
    })).resolves.toEqual({ ok: true, method: 'kakao', hint: KAKAO_SHARE_HINT });
    expect(opened).toEqual(['kakaotalk://']);
    expect(kakaoCopied[0]).toContain('https://x.test/?room=a');
  });
});
