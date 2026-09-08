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
  isRematchWait,
  isPeerBoardReady,
  isPeerMatchStarted,
  presenceStartedFlag,
  shouldReplayHostStart,
  shouldPollGuestStart,
  matchPlayersFromPresence,
  shouldArmCampWait,
  overlayRoomAcorns,
  readAcornCount,
  shouldFollowPeerStart,
  shouldGuestFollowHostStart,
  shouldHoldPvpStartGate,
  shouldStartWithoutPeer,
  startResetMode,
  tossCoinFace,
  tossCoinHint,
  usesPeerStart,
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
    expect(usesPeerStart('solo')).toBe(false);
    expect(usesPeerStart('ai')).toBe(false);
    expect(usesPeerStart('pvp')).toBe(true);
    expect(shouldStartWithoutPeer('solo')).toBe(true);
    expect(shouldStartWithoutPeer('ai')).toBe(true);
    expect(shouldStartWithoutPeer('pvp')).toBe(false);
    expect(startResetMode('solo')).toBe('solo');
    expect(startResetMode('ai')).toBe('ai');
    expect(startResetMode('pvp')).toBe('pvp');
    expect(startResetMode('pvp')).not.toBe('ai');
    expect(shouldHoldPvpStartGate({ mode: 'solo', started: false, hasOpponent: false })).toBe(false);
    expect(shouldHoldPvpStartGate({ mode: 'ai', started: false, hasOpponent: false })).toBe(false);
    expect(shouldHoldPvpStartGate({ mode: 'pvp', started: false, hasOpponent: false })).toBe(true);
    expect(applyRoomStart(createRoomState({ roomId: 'room_u1', hostId: 'u1' })).started).toBe(false);
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

  it('1:1 선공은 항상 호스트이고 호스트만 시작한다', () => {
    const room = { roomId: 'dotori-pvp', hostId: 'rich', guestId: 'poor', matchGen: 0 };
    const players = [
      { userId: 'rich', acorns: 20 },
      { userId: 'poor', acorns: 3 },
    ];
    const lead = tossFirstPlayerId(room);
    expect(lead).toBe('rich');
    expect(tossCoinHint(room)).toBe('호스트(흑) 선공');
    expect(tossCoinHint({ hostId: 'rich' })).toBe('');
    expect(tossCoinFace(room)).toBe('host');
    expect(lead).toBe(firstPlayerId(players, room));
    expect(firstPlayerId(players, room)).toBe(firstPlayerId(players, { ...room, hostAcorns: 99 }));
    expect(canStartMatch({ mode: 'pvp', userId: 'rich', players, room })).toBe(true);
    expect(canStartMatch({ mode: 'pvp', userId: 'poor', players, room })).toBe(false);
    const fromRoom = overlayRoomAcorns([], {
      ...room, hostAcorns: 11, guestAcorns: 9,
    }, { myId: 'rich', myAcorns: 11 });
    expect(fromRoom.map((p) => p.userId).sort()).toEqual(['poor', 'rich']);
    expect(canStartMatch({ mode: 'pvp', userId: 'rich', players: fromRoom, room })).toBe(true);
  });

  it('대기실 봇 좌석은 더 이상 선공·시작에 쓰지 않는다', () => {
    const room = {
      roomId: 'dotori-pvp', hostId: 'host', guestId: AI_LOBBY_USER_ID, matchGen: 0,
    };
    const players = [
      { userId: 'host', acorns: 10 },
      { userId: AI_LOBBY_USER_ID, acorns: 10 },
    ];
    expect(firstPlayerId(players, room)).toBe('host');
    expect(canStartMatch({ mode: 'pvp', userId: 'host', players, room })).toBe(true);
    expect(canStartMatch({ mode: 'pvp', userId: AI_LOBBY_USER_ID, players, room })).toBe(false);
  });

  it('선공이 시작하면 후공은 시작 버튼을 기다리지 않고 따라간다', () => {
    const room = [
      { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'room_host', acorns: 10 },
      { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'room_host', acorns: 8, started: true },
    ];
    expect(isPeerMatchStarted(room, { myId: 'host', roomId: 'room_host' })).toBe(true);
    expect(isPeerMatchStarted(room, { myId: 'guest', roomId: 'room_host' })).toBe(false);
    expect(isPeerMatchStarted([
      { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'dotori-pvp', started: true },
      { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'dotori-pvp' },
    ], { myId: 'guest', roomId: 'dotori-pvp' })).toBe(true);
    expect(presenceStartedFlag({ matchStarted: false, roomStarted: true })).toBe(true);
    expect(presenceStartedFlag({ matchStarted: true, roomStarted: false })).toBe(true);
    expect(presenceStartedFlag({ matchStarted: false, roomStarted: false })).toBe(false);
    expect(shouldReplayHostStart({
      isHost: true, matchStarted: true, guestStarted: false, hasOpponent: true,
    })).toBe(true);
    expect(shouldReplayHostStart({
      isHost: true, matchStarted: true, guestStarted: true, hasOpponent: true,
    })).toBe(false);
    expect(isPeerBoardReady([
      { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'dotori-pvp', started: true },
    ], { myId: 'host', roomId: 'dotori-pvp', matchGen: 1 })).toBe(false);
    expect(isPeerBoardReady([
      {
        userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'dotori-pvp',
        started: true, boardReady: true, matchGen: 1,
      },
    ], { myId: 'host', roomId: 'dotori-pvp', matchGen: 1 })).toBe(true);
    expect(isPeerMatchStarted([
      { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'dotori-pvp', started: true, matchGen: 0 },
    ], { myId: 'host', roomId: 'dotori-pvp', matchGen: 1 })).toBe(false);
    expect(shouldPollGuestStart({ awaitingStart: false, inPvp: true, boardReady: false })).toBe(true);
    expect(shouldReplayHostStart({
      isHost: true, matchStarted: true, guestStarted: false, hasOpponent: true,
      lastReplayAt: 1000, now: 1500, minIntervalMs: 2000,
    })).toBe(false);
    expect(shouldPollGuestStart({ awaitingStart: true, inPvp: true })).toBe(true);
    expect(shouldPollGuestStart({ awaitingStart: false, inPvp: true })).toBe(false);
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
    expect(isRematchWait({ matchGen: 1, roomStarted: false, matchStarted: false })).toBe(true);
    expect(isRematchWait({ matchGen: 0, roomStarted: false, matchStarted: false })).toBe(false);
    expect(shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: true,
      mode: 'pvp',
      rematchWait: true,
    })).toBe(false);
    expect(shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: true,
      mode: 'pvp',
      rematchWait: true,
      roomStarted: true,
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
    expect(shouldGuestFollowHostStart({
      isHost: false, awaitingStart: true, matchStarted: false, roomStarted: true, mode: 'pvp',
    })).toBe(true);
    expect(shouldGuestFollowHostStart({
      isHost: true, awaitingStart: true, matchStarted: false, roomStarted: true, mode: 'pvp',
    })).toBe(false);
    expect(shouldArmCampWait(false)).toBe(true);
    expect(shouldArmCampWait(true)).toBe(false);
    expect(shouldHoldPvpStartGate({ started: false, hasOpponent: false })).toBe(true);
    expect(shouldHoldPvpStartGate({ started: true, hasOpponent: false })).toBe(false);
    expect(shouldHoldPvpStartGate({ started: false, hasOpponent: true })).toBe(false);
  });

  it('1:1은 호스트가 선공·시작을 갖고 다시해도 같다', () => {
    const human = applyRoomGuest(createRoomState({
      roomId: 'dotori-pvp', hostId: 'host', hostName: '호치',
    }), { guestId: 'guest', guestName: '달이' });
    const people = overlayRoomAcorns([], human, { myId: 'host', myAcorns: 10 });
    expect(tossFirstPlayerId(human)).toBe('host');
    expect(firstPlayerId(people, human)).toBe('host');
    expect(canStartMatch({ mode: 'pvp', userId: 'host', players: people, room: human })).toBe(true);
    expect(canStartMatch({ mode: 'pvp', userId: 'guest', players: people, room: human })).toBe(false);
    expect(firstStoneColor({ mode: 'pvp', players: people, room: human })).toBe('black');
    expect(shouldFollowPeerStart({
      awaitingStart: true, started: false, peerStarted: true, mode: 'pvp',
    })).toBe(true);
    expect(applyRoomStart(human).started).toBe(true);

    const rematch = applyRoomRematch(applyRoomStart(human));
    expect(tossFirstPlayerId(rematch)).toBe('host');
    expect(canStartMatch({
      mode: 'pvp', userId: 'host', players: people, room: rematch,
    })).toBe(true);
    expect(canStartMatch({ mode: 'ai', userId: 'host', players: [] })).toBe(true);
    expect(firstStoneColor({ mode: 'solo', room: { hostId: 'host', guestId: 'guest' }, userId: 'host' })).toBe('black');
  });

  it('방·판이 바뀌어도 선공은 호스트다', () => {
    for (let i = 0; i < 20; i++) {
      const room = { roomId: `room_${i}`, hostId: 'host', guestId: 'guest', matchGen: i };
      expect(tossFirstPlayerId(room)).toBe('host');
    }
  });

  it('도토리 수와 안내 문구를 읽는다', () => {
    expect(acornOf({ acorns: 7.9 })).toBe(7);
    expect(acornOf({ acorns: -2 })).toBe(-2);
    expect(acornOf({})).toBe(DEFAULT_ACORNS);
    const storage = { getItem: (k) => (k === ACORN_KEY ? '4' : null) };
    expect(readAcornCount(storage)).toBe(DEFAULT_ACORNS);
    expect(PVP_START_HINT).toContain('호스트');
    expect(PVP_START_HINT).toContain('시작');
  });
});
