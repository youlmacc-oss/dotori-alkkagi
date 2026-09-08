import { describe, expect, it } from 'vitest';
import {
  ACORN_KEY,
  DEFAULT_ACORNS,
  PVP_START_HINT,
  PVP_WAIT_HINT,
  acornOf,
  canStartMatch,
  firstPlayerId,
  firstStoneColor,
  hasPvpOpponent,
  isHostStartPending,
  isPeerMatchStarted,
  matchPlayersFromPresence,
  shouldArmCampWait,
  overlayRoomAcorns,
  readAcornCount,
  shouldFollowPeerStart,
  shouldHoldPvpStartGate,
} from '../src/network/MatchStart.js';
import { AI_LOBBY_USER_ID } from '../src/network/LobbyAi.js';
import {
  applyRoomGuest,
  applyRoomRematch,
  applyRoomStart,
  createRoomState,
  tossFirstPlayerId,
} from '../src/network/RoomState.js';

describe('선공·시작 권한', () => {
  it('1인·AI는 유저가 선공과 시작 권한을 갖는다', () => {
    expect(canStartMatch({ mode: 'solo', userId: 'u1', players: [] })).toBe(true);
    expect(canStartMatch({ mode: 'ai', userId: 'u1', players: [] })).toBe(true);
    expect(firstPlayerId([], { hostId: 'u1', guestId: 'ai_dotori' }, { mode: 'solo', userId: 'u1' })).toBe('u1');
    expect(firstPlayerId([{ userId: 'u1' }], null, { mode: 'solo', userId: 'u1' })).toBe('u1');
  });

  it('1:1은 상대가 오기 전에는 시작할 수 없다', () => {
    expect(hasPvpOpponent([{ userId: 'solo', acorns: 3 }])).toBe(false);
    expect(canStartMatch({ mode: 'pvp', userId: 'solo', players: [{ userId: 'solo', acorns: 3 }] })).toBe(false);
    expect(canStartMatch({ mode: 'pvp', userId: 'solo', players: [] })).toBe(false);
    const afterInvite = matchPlayersFromPresence([
      { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'room_host', acorns: 10 },
      { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'room_host', acorns: 8 },
      { userId: 'idle', status: 'lobby', mode: null, roomId: null },
    ], { myId: 'host', myAcorns: 10, mode: 'pvp', roomId: 'room_host' });
    expect(hasPvpOpponent(afterInvite)).toBe(true);
    expect(afterInvite.map((p) => p.userId)).toEqual(['host', 'guest']);
    expect(hasPvpOpponent(matchPlayersFromPresence([
      { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'room_host' },
      { userId: 'guest', status: 'lobby', mode: null, roomId: null },
    ], { myId: 'host', mode: 'pvp', roomId: 'room_host' }))).toBe(false);
    expect(PVP_WAIT_HINT).toContain('상대');
    expect(PVP_WAIT_HINT).toContain('대기');
  });

  it('1:1은 동전으로 선공을 정하고 양쪽이 같은 사람을 본다', () => {
    const room = { roomId: 'room_host', hostId: 'rich', guestId: 'poor', matchGen: 0 };
    const players = [
      { userId: 'rich', acorns: 20 },
      { userId: 'poor', acorns: 3 },
    ];
    const lead = tossFirstPlayerId(room);
    expect(lead).toBe(firstPlayerId(players, room));
    expect(firstPlayerId(players, room)).toBe(firstPlayerId(players, { ...room, hostAcorns: 99 }));
    expect(canStartMatch({ mode: 'pvp', userId: lead, players, room })).toBe(true);
    expect(canStartMatch({ mode: 'pvp', userId: lead === 'poor' ? 'rich' : 'poor', players, room })).toBe(false);
    const fromRoom = overlayRoomAcorns([], {
      ...room, hostAcorns: 11, guestAcorns: 9,
    }, { myId: 'rich', myAcorns: 11 });
    expect(fromRoom.map((p) => p.userId).sort()).toEqual(['poor', 'rich']);
    expect(canStartMatch({ mode: 'pvp', userId: lead, players: fromRoom, room })).toBe(true);
  });

  it('봇이 동전 선공이어도 사람이 시작 버튼을 누를 수 있다', () => {
    const room = {
      roomId: 'room_host', hostId: 'host', guestId: AI_LOBBY_USER_ID, matchGen: 0,
    };
    const players = [
      { userId: 'host', acorns: 10 },
      { userId: AI_LOBBY_USER_ID, acorns: 10 },
    ];
    expect(firstPlayerId(players, room)).toBe(tossFirstPlayerId(room));
    expect(canStartMatch({ mode: 'pvp', userId: 'host', players, room })).toBe(true);
    expect(canStartMatch({ mode: 'pvp', userId: AI_LOBBY_USER_ID, players, room })).toBe(
      firstPlayerId(players, room) === AI_LOBBY_USER_ID,
    );
  });

  it('선공이 시작하면 후공은 시작 버튼을 기다리지 않고 따라간다', () => {
    const room = [
      { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'room_host', acorns: 10 },
      { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'room_host', acorns: 8, started: true },
    ];
    expect(isPeerMatchStarted(room, { myId: 'host', roomId: 'room_host' })).toBe(true);
    expect(isPeerMatchStarted(room, { myId: 'guest', roomId: 'room_host' })).toBe(false);
    expect(isPeerMatchStarted(room.map((p) => ({ ...p, started: false })), {
      myId: 'host',
      roomId: 'room_host',
    })).toBe(false);
    expect(shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: true,
      mode: 'pvp',
    })).toBe(true);
    expect(shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: true,
      mode: 'ai',
    })).toBe(false);
    expect(shouldFollowPeerStart({
      awaitingStart: false,
      started: true,
      peerStarted: true,
      mode: 'pvp',
    })).toBe(false);
    expect(isHostStartPending({
      isHost: true, awaitingStart: true, matchStarted: false, roomStarted: true,
    })).toBe(true);
    expect(shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: true,
      mode: 'pvp',
      isHost: true,
      roomStarted: true,
    })).toBe(false);
    expect(shouldArmCampWait(false)).toBe(true);
    expect(shouldArmCampWait(true)).toBe(false);
    expect(shouldHoldPvpStartGate({ started: false, hasOpponent: false })).toBe(true);
    expect(shouldHoldPvpStartGate({ started: true, hasOpponent: false })).toBe(false);
    expect(shouldHoldPvpStartGate({ started: false, hasOpponent: true })).toBe(false);
  });

  it('1:1과 도토리봇 대전에서 선공·시작이 갈리지 않는다', () => {
    const human = applyRoomGuest(createRoomState({
      roomId: 'room_h', hostId: 'host', hostName: '호치',
    }), { guestId: 'guest', guestName: '달이' });
    const people = overlayRoomAcorns([], human, { myId: 'host', myAcorns: 10 });
    const lead = firstPlayerId(people, human);
    const other = lead === 'host' ? 'guest' : 'host';
    expect(tossFirstPlayerId(human)).toBe(lead);
    expect(firstPlayerId(people, human)).toBe(firstPlayerId(people, { ...human }));
    expect(canStartMatch({ mode: 'pvp', userId: lead, players: people, room: human })).toBe(true);
    expect(canStartMatch({ mode: 'pvp', userId: other, players: people, room: human })).toBe(false);
    expect(firstStoneColor({ mode: 'pvp', players: people, room: human })).toBe(
      lead === 'host' ? 'black' : 'white',
    );
    expect(shouldFollowPeerStart({
      awaitingStart: true, started: false, peerStarted: true, mode: 'pvp',
    })).toBe(true);
    expect(applyRoomStart(human).started).toBe(true);

    const rematch = applyRoomRematch(applyRoomStart(human));
    expect(tossFirstPlayerId(rematch)).toBe(firstPlayerId(people, rematch));
    expect(canStartMatch({
      mode: 'pvp', userId: tossFirstPlayerId(rematch), players: people, room: rematch,
    })).toBe(true);

    const vsBot = applyRoomGuest(createRoomState({
      roomId: 'room_ai', hostId: 'host',
    }), { guestId: AI_LOBBY_USER_ID, guestName: '도토리봇' });
    const botSeats = overlayRoomAcorns([], vsBot, { myId: 'host', myAcorns: 10 });
    expect(canStartMatch({ mode: 'pvp', userId: 'host', players: botSeats, room: vsBot })).toBe(true);
    expect(firstStoneColor({ mode: 'pvp', players: botSeats, room: vsBot })).toBe(
      firstPlayerId(botSeats, vsBot) === 'host' ? 'black' : 'white',
    );
    expect(canStartMatch({ mode: 'ai', userId: 'host', players: [] })).toBe(true);
    expect(firstStoneColor({ mode: 'solo', room: { hostId: 'host', guestId: 'guest' }, userId: 'host' })).toBe('black');
  });

  it('같은 방 동전은 항상 같고 앞뒤가 한쪽으로만 몰리지 않는다', () => {
    let hostWins = 0;
    for (let i = 0; i < 200; i++) {
      const room = { roomId: `room_${i}`, hostId: 'host', guestId: 'guest', matchGen: 0 };
      const lead = tossFirstPlayerId(room);
      expect(tossFirstPlayerId({ ...room })).toBe(lead);
      if (lead === 'host') hostWins += 1;
    }
    expect(hostWins).toBeGreaterThan(60);
    expect(hostWins).toBeLessThan(140);
  });

  it('도토리 수와 안내 문구를 읽는다', () => {
    expect(acornOf({ acorns: 7.9 })).toBe(7);
    expect(acornOf({ acorns: -2 })).toBe(-2);
    expect(acornOf({})).toBe(DEFAULT_ACORNS);
    const storage = { getItem: (k) => (k === ACORN_KEY ? '4' : null) };
    expect(readAcornCount(storage)).toBe(DEFAULT_ACORNS);
    expect(PVP_START_HINT).toContain('반반');
    expect(PVP_START_HINT).toContain('시작');
  });
});
