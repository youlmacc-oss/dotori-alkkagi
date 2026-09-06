import { describe, expect, it } from 'vitest';
import { GAME_MODE, GameEngine, PHASE, STONE_COLOR } from '../src/physics/GameEngine.js';
import { MockSupabaseClient, RealtimeManager } from '../src/network/RealtimeManager.js';
import {
  INVITE_ACTION_ACCEPT,
  buildInviteReply,
  buildLobbyInvite,
  evaluateLobbyInvite,
  shouldRepublishOpenRoom,
} from '../src/network/PvpInvite.js';
import {
  applyRoomGuest,
  applyRoomInvite,
  applyRoomLeave,
  applyRoomRematch,
  applyRoomStart,
  createRoomState,
  incomingClearsOpponent,
  incomingResetsForRematch,
  mergeRoomState,
  pvpSeatColor,
  roomHasOpponent,
} from '../src/network/RoomState.js';
import {
  canApplyRemoteBoard,
  isStaleEndedMatchSync,
  packMatchSync,
  shouldApplyMatchSync,
  shouldFollowRemoteStart,
  shouldPublishMatchSync,
  shouldPulseMatchSync,
} from '../src/network/MatchSync.js';
import { SESSION_ACORNS, acornSettleKey, settleSessionAcorns, shouldSettleAcorns } from '../src/network/AcornPolicy.js';
import { canStartMatch, firstPlayerId, hasPvpOpponent, matchPlayersFromPresence } from '../src/network/MatchStart.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('1:1 한 바퀴', () => {
  it('초대부터 수락·시작·샷·정산·다시하기·퇴장까지 규칙이 이어진다', async () => {
    const client = new MockSupabaseClient();
    const invites = [];
    const rooms = [];
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'pvp-cycle',
      userId: 'host',
      userNickname: '호치',
    });
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'pvp-cycle',
      userId: 'guest',
      userNickname: '달이',
      onPvpInvite: (payload) => invites.push(payload),
      onRoomState: (payload) => rooms.push(payload),
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    await wait(80);

    const invite = buildLobbyInvite({
      roomId: 'room_host',
      hostId: 'host',
      hostName: '호치',
      targetId: 'guest',
    });
    expect(evaluateLobbyInvite(invite, 'guest').ok).toBe(true);
    expect(await host.broadcastPvpInvite(invite)).toBe(true);
    await wait(80);
    expect(invites.at(-1)?.targetId).toBe('guest');

    let room = applyRoomInvite(createRoomState({
      roomId: 'room_host', hostId: 'host', hostName: '호치',
    }), 'guest');
    const accept = buildInviteReply(invite, INVITE_ACTION_ACCEPT, { guestName: '달이' });
    room = applyRoomGuest(room, { guestId: accept.targetId, guestName: accept.guestName });
    expect(roomHasOpponent(room)).toBe(true);
    expect(pvpSeatColor({ myId: 'host', hostId: 'host' })).toBe('black');
    expect(pvpSeatColor({ myId: 'guest', hostId: 'host' })).toBe('white');

    const hostEngine = new GameEngine({ autoStart: false });
    const guestEngine = new GameEngine({ autoStart: false });
    hostEngine.setMatchConfig({ mode: GAME_MODE.PVP });
    guestEngine.setMatchConfig({ mode: GAME_MODE.PVP });
    hostEngine.setHost(true);
    guestEngine.setHost(false);

    const players = matchPlayersFromPresence([
      { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'room_host', acorns: 10 },
      { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'room_host', acorns: 10 },
    ], { myId: 'host', myAcorns: 10, mode: 'pvp', roomId: 'room_host' });
    expect(hasPvpOpponent(players)).toBe(true);
    expect(canStartMatch({ mode: 'pvp', userId: firstPlayerId(players), players })).toBe(true);

    room = applyRoomStart(room);
    expect(shouldFollowRemoteStart({
      awaitingStart: true, started: false, remoteStarted: true, mode: 'pvp',
    })).toBe(true);
    expect(shouldRepublishOpenRoom({ inRoom: true, mode: 'pvp', started: true })).toBe(false);
    expect(shouldPulseMatchSync({ inPvp: true, started: true })).toBe(true);

    hostEngine.phase = PHASE.RESOLVING;
    const moved = hostEngine.stones[0];
    const shot = packMatchSync({
      phase: PHASE.RESOLVING,
      currentTurn: STONE_COLOR.BLACK,
      stones: hostEngine.stones.map((stone, index) => ({
        id: stone.id,
        color: stone.color,
        fallen: false,
        position: {
          x: stone.body.position.x + (index === 0 ? 24 : 0),
          y: stone.body.position.y,
        },
      })),
    }, { roomId: 'room_host', senderId: 'host', started: true, timestamp: 20 });
    expect(shouldPublishMatchSync({ inPvp: true, isHost: true })).toBe(true);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'pulse' })).toBe(true);
    expect(shouldApplyMatchSync(shot, {
      myId: 'guest', roomId: 'room_host', inPvp: true,
    })).toBe(true);
    expect(guestEngine.applyRemoteMatchState(shot)).toBe(true);
    expect(guestEngine.stones[0].body.position.x).toBeCloseTo(moved.body.position.x + 24);

    guestEngine.phase = PHASE.RESOLVING;
    guestEngine.currentTurn = STONE_COLOR.WHITE;
    const hostPulse = packMatchSync({
      phase: PHASE.AIMING,
      currentTurn: STONE_COLOR.WHITE,
      stones: hostEngine.stones.map((stone) => ({
        id: stone.id,
        color: stone.color,
        position: { x: stone.body.position.x, y: stone.body.position.y },
      })),
    }, { roomId: 'room_host', senderId: 'host', started: true, timestamp: 40 });
    expect(canApplyRemoteBoard({
      localPhase: guestEngine.phase,
      remotePhase: hostPulse.phase,
      localTurn: guestEngine.currentTurn,
      remoteTurn: hostPulse.currentTurn,
    })).toBe(false);
    expect(guestEngine.applyRemoteMatchState(hostPulse)).toBe(false);
    expect(guestEngine.stones[0].body.position.x).toBeCloseTo(moved.body.position.x + 24);

    const win = {
      mode: 'pvp', started: true, winner: STONE_COLOR.BLACK, myColor: STONE_COLOR.BLACK,
    };
    expect(shouldSettleAcorns(win)).toBe(true);
    expect(settleSessionAcorns(SESSION_ACORNS, win)).toBe(11);
    expect(settleSessionAcorns(SESSION_ACORNS, {
      ...win, myColor: STONE_COLOR.WHITE,
    })).toBe(9);

    const rematch = applyRoomRematch(room);
    expect(incomingResetsForRematch(room, rematch)).toBe(true);
    expect(mergeRoomState(room, rematch).started).toBe(false);
    expect(mergeRoomState(rematch, { ...room, hostAcorns: 11, guestAcorns: 9 }).started).toBe(false);
    expect(shouldRepublishOpenRoom({ inRoom: true, mode: 'pvp', started: rematch.started })).toBe(true);
    expect(shouldFollowRemoteStart({
      awaitingStart: true, started: false, remoteStarted: true, mode: 'pvp',
      remotePhase: PHASE.GAME_OVER, remoteWinner: STONE_COLOR.BLACK,
    })).toBe(false);
    expect(isStaleEndedMatchSync({
      awaitingStart: true, started: false, remotePhase: PHASE.GAME_OVER, remoteWinner: STONE_COLOR.BLACK,
    })).toBe(true);
    guestEngine.setMatchConfig({ mode: GAME_MODE.PVP });
    guestEngine.setHost(false);
    guestEngine.pauseMatch();
    expect(guestEngine.isPaused()).toBe(true);
    expect(guestEngine.inputLocked).toBe(true);
    expect(canApplyRemoteBoard({
      localPhase: PHASE.GAME_OVER, remotePhase: PHASE.IDLE,
    })).toBe(false);
    hostEngine.phase = PHASE.GAME_OVER;
    expect(hostEngine.applyRemoteMatchState({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.BLACK,
      winner: null,
      stones: hostEngine.stones.map((stone) => ({
        id: stone.id, color: stone.color,
        position: { x: stone.body.position.x, y: stone.body.position.y },
      })),
    })).toBe(false);
    expect(hostEngine.phase).toBe(PHASE.GAME_OVER);
    const leftoverOver = packMatchSync({
      phase: PHASE.GAME_OVER,
      currentTurn: STONE_COLOR.BLACK,
      winner: STONE_COLOR.BLACK,
      stones: hostEngine.stones.map((stone) => ({
        id: stone.id, color: stone.color,
        position: { x: stone.body.position.x, y: stone.body.position.y },
      })),
    }, { roomId: 'room_host', senderId: 'host', started: true, timestamp: 900 });
    expect(isStaleEndedMatchSync({
      awaitingStart: true, started: false,
      remotePhase: leftoverOver.phase, remoteWinner: leftoverOver.winner,
    })).toBe(true);
    expect(guestEngine.phase).toBe(PHASE.IDLE);
    expect(guestEngine.winner).toBeNull();
    const game1Key = acornSettleKey({
      roomId: 'room_host', matchGen: 0, winner: STONE_COLOR.BLACK,
    });
    const game2Key = acornSettleKey({
      roomId: 'room_host', matchGen: rematch.matchGen, winner: STONE_COLOR.BLACK,
    });
    expect(shouldSettleAcorns({
      mode: 'pvp', started: true, winner: STONE_COLOR.BLACK, myColor: STONE_COLOR.WHITE,
      settleKey: game1Key, lastSettledKey: game1Key,
    })).toBe(false);
    expect(shouldSettleAcorns({
      mode: 'pvp', started: true, winner: STONE_COLOR.BLACK, myColor: STONE_COLOR.WHITE,
      settleKey: game2Key, lastSettledKey: game1Key,
    })).toBe(true);

    const left = applyRoomLeave(applyRoomStart(rematch), { leaverId: 'guest' });
    expect(incomingClearsOpponent(applyRoomStart(rematch), left)).toBe(true);
    expect(left.guestId).toBeNull();
    expect(left.started).toBe(false);
    expect(rooms.length).toBeGreaterThanOrEqual(0);
  });
});
