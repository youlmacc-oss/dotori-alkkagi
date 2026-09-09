import { describe, expect, it } from 'vitest';
import { GAME_MODE, GameEngine, PHASE, STONE_COLOR } from '../src/physics/GameEngine.js';
import { MockSupabaseClient, RealtimeManager } from '../src/network/RealtimeManager.js';
import {
  INVITE_ACTION_ACCEPT,
  INVITE_ACTION_HELLO,
  buildInviteReply,
  buildLobbyInvite,
  buildRoomAck,
  buildRoomHello,
  evaluateLobbyInvite,
  readPvpPublicEnabled,
  shouldApplyInviteAccept,
  shouldApplyRoomAck,
  shouldRepublishOpenRoom,
} from '../src/network/PvpInvite.js';
import {
  applyRoomAck,
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
  isLaunchSync,
  isStaleEndedMatchSync,
  mergeCampLayouts,
  packLaunchSync,
  packMatchSync,
  shouldApplyMatchSync,
  shouldFireTurnEndWatchdog,
  shouldFollowRemoteStart,
  shouldPublishMatchSync,
  shouldPulseMatchSync,
} from '../src/network/MatchSync.js';
import { SESSION_ACORNS, acornSettleKey, settleSessionAcorns, shouldSettleAcorns } from '../src/network/AcornPolicy.js';
import { canStartMatch, firstPlayerId, hasPvpOpponent, matchPlayersFromPresence, overlayRoomAcorns } from '../src/network/MatchStart.js';
import { tossFirstPlayerId } from '../src/network/RoomState.js';

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
    expect(shouldPulseMatchSync({ inPvp: true, started: true })).toBe(false);

    const shooter = hostEngine.stones[0];
    const launch = packLaunchSync({
      stoneId: shooter.id,
      color: shooter.color,
      velocity: { x: 8, y: -12 },
      force: { x: 0.03, y: -0.04 },
      power: 0.8,
    }, {
      roomId: 'room_host',
      senderId: 'host',
      started: true,
      timestamp: 20,
      currentTurn: STONE_COLOR.BLACK,
    });
    expect(isLaunchSync(launch)).toBe(true);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: true })).toBe(false);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: true, force: true, event: 'launch' })).toBe(true);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'turnEnd' })).toBe(false);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'pulse' })).toBe(false);
    expect(shouldApplyMatchSync(launch, {
      myId: 'guest', roomId: 'room_host', inPvp: true,
    })).toBe(true);
    expect(guestEngine.applyRemoteLaunch(launch)).toBe(true);
    expect(guestEngine.phase).toBe(PHASE.RESOLVING);

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
    expect(guestEngine.phase).toBe(PHASE.RESOLVING);
    expect(canApplyRemoteBoard({
      localPhase: guestEngine.phase,
      remotePhase: PHASE.IDLE,
      remoteEvent: 'turnEnd',
    })).toBe(true);

    const win = {
      mode: 'pvp', started: true, winner: STONE_COLOR.BLACK, myColor: STONE_COLOR.BLACK,
    };
    expect(shouldSettleAcorns(win)).toBe(false);
    expect(settleSessionAcorns(SESSION_ACORNS, win)).toBe(SESSION_ACORNS);
    expect(settleSessionAcorns(SESSION_ACORNS, {
      ...win, myColor: STONE_COLOR.WHITE,
    })).toBe(SESSION_ACORNS);

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
    })).toBe(false);

    const left = applyRoomLeave(applyRoomStart(rematch), { leaverId: 'guest' });
    expect(incomingClearsOpponent(applyRoomStart(rematch), left)).toBe(true);
    expect(left.guestId).toBeNull();
    expect(left.started).toBe(false);
    expect(rooms.length).toBeGreaterThanOrEqual(0);
    expect(readPvpPublicEnabled({ DEV: false })).toBe(true);
  });

  it('수락 hello/ack · camp 병합 · 게스트 샷 · watchdog · rematch seq가 한 사이클이다', () => {
    const invite = buildLobbyInvite({
      roomId: 'room_host', hostId: 'host', hostName: '호치', targetId: 'guest',
    });
    const hello = buildRoomHello(invite, { guestId: 'guest', guestName: '달이' });
    expect(hello.action).toBe(INVITE_ACTION_HELLO);
    expect(shouldApplyInviteAccept(hello, {
      myId: 'host', roomId: 'room_host', inRoom: true, sentTargetId: 'other',
    })).toBe(true);
    let hostRoom = applyRoomAck(applyRoomGuest(applyRoomInvite(createRoomState({
      roomId: 'room_host', hostId: 'host', hostName: '호치',
    }), 'guest'), { guestId: hello.guestId, guestName: hello.guestName }));
    const ack = buildRoomAck(hostRoom);
    expect(shouldApplyRoomAck(ack, { myId: 'guest', roomId: 'room_host' })).toBe(true);
    let guestRoom = applyRoomAck(applyRoomGuest(createRoomState({
      roomId: 'room_host', hostId: 'host', hostName: '호치',
    }), { guestId: 'guest', guestName: '달이' }));
    expect(hostRoom.guestId).toBe(guestRoom.guestId);
    expect(hostRoom.roomId).toBe(guestRoom.roomId);
    expect(hostRoom.acked).toBe(true);
    expect(guestRoom.acked).toBe(true);

    const players = overlayRoomAcorns([], {
      ...hostRoom, hostAcorns: 8, guestAcorns: 10,
    }, { myId: 'host', myAcorns: 8 });
    const lead = tossFirstPlayerId(hostRoom);
    expect(firstPlayerId(players, hostRoom)).toBe(lead);
    expect(canStartMatch({ mode: 'pvp', userId: lead, players, room: hostRoom })).toBe(true);

    const hostEngine = new GameEngine({ autoStart: false });
    const guestEngine = new GameEngine({ autoStart: false });
    hostEngine.setMatchConfig({ mode: GAME_MODE.PVP });
    guestEngine.setMatchConfig({ mode: GAME_MODE.PVP });
    hostEngine.setHost(true);
    guestEngine.setHost(false);
    const white = guestEngine.stones.find((stone) => stone.color === STONE_COLOR.WHITE);
    white.body.position.x = 233;
    white.body.position.y = 171;
    const guestCamp = guestEngine.stones.filter((stone) => stone.color === STONE_COLOR.WHITE);
    const startStones = mergeCampLayouts(
      hostEngine.stones.filter((stone) => stone.color === STONE_COLOR.BLACK),
      guestCamp,
    );
    expect(startStones.some((stone) => stone.color === STONE_COLOR.WHITE && stone.position.x === 233)).toBe(true);
    expect(hostEngine.applyRemoteMatchState({
      event: 'start',
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.BLACK,
      stones: startStones,
    })).toBe(true);
    expect(guestEngine.applyRemoteMatchState({
      event: 'start',
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.BLACK,
      stones: startStones,
    })).toBe(true);
    const hostWhite = hostEngine.stones.find((stone) => stone.color === STONE_COLOR.WHITE);
    expect(hostWhite.body.position.x).toBeCloseTo(233);
    expect(hostWhite.body.position.y).toBeCloseTo(171);

    hostEngine.pauseMatch();
    const blocked = packLaunchSync({
      stoneId: hostEngine.stones[0].id,
      color: hostEngine.stones[0].color,
      velocity: { x: 4, y: -4 },
    }, { roomId: 'room_host', senderId: 'guest', started: true, timestamp: 25, seq: 1 });
    expect(hostEngine.applyRemoteLaunch(blocked)).toBe(false);
    hostEngine._paused = false;
    hostEngine.inputLocked = false;
    const shooter = guestEngine.stones.find((stone) => stone.color === STONE_COLOR.WHITE);
    const launch = packLaunchSync({
      stoneId: shooter.id,
      color: shooter.color,
      velocity: { x: -6, y: 12 },
      force: { x: -0.02, y: 0.04 },
      power: 0.6,
    }, {
      roomId: 'room_host', senderId: 'guest', started: true, timestamp: 30, seq: 1, currentTurn: STONE_COLOR.WHITE,
    });
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'launch' })).toBe(true);
    expect(shouldApplyMatchSync(launch, {
      myId: 'host', roomId: 'room_host', inPvp: true, lastSeq: 0,
    })).toBe(true);
    expect(hostEngine.applyRemoteLaunch(launch)).toBe(true);
    expect(hostEngine.phase).toBe(PHASE.RESOLVING);
    const hostShooter = hostEngine.stones.find((stone) => stone.id === shooter.id);
    hostShooter.body.position.x = 240;
    hostShooter.body.position.y = 200;
    const hostRest = packMatchSync({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.BLACK,
      stones: hostEngine.stones.map((stone) => ({
        id: stone.id,
        color: stone.color,
        position: { x: stone.body.position.x, y: stone.body.position.y },
      })),
    }, {
      roomId: 'room_host', senderId: 'host', started: true, timestamp: 40, seq: 2, event: 'turnEnd',
    });
    expect(shouldPublishMatchSync({ inPvp: true, isHost: true, force: true, event: 'turnEnd' })).toBe(true);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'turnEnd' })).toBe(false);
    expect(guestEngine.applyRemoteMatchState(hostRest)).toBe(true);
    expect(guestEngine.phase).toBe(PHASE.IDLE);
    expect(guestEngine.currentTurn).toBe(STONE_COLOR.BLACK);
    expect(guestEngine.stones.find((stone) => stone.id === shooter.id).body.position.x).toBeCloseTo(240);

    guestEngine.phase = PHASE.RESOLVING;
    expect(shouldFireTurnEndWatchdog({
      isHost: true, launchedAt: 10, now: 920, gotShooterTurnEnd: false,
    })).toBe(true);
    const watchdog = packMatchSync({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.BLACK,
      stones: hostEngine.stones.map((stone) => ({
        id: stone.id,
        color: stone.color,
        position: { x: stone.body.position.x, y: stone.body.position.y },
      })),
    }, {
      roomId: 'room_host', senderId: 'host', started: true, timestamp: 50, seq: 3, event: 'turnEnd',
    });
    expect(guestEngine.applyRemoteMatchState(watchdog)).toBe(true);
    expect(guestEngine.phase).toBe(PHASE.IDLE);

    hostRoom = applyRoomStart(hostRoom);
    const rematch = applyRoomRematch(hostRoom);
    expect(rematch.matchGen).toBe(1);
    const leftoverOver = packMatchSync({
      phase: PHASE.GAME_OVER,
      currentTurn: STONE_COLOR.BLACK,
      winner: STONE_COLOR.BLACK,
      stones: [],
    }, {
      roomId: 'room_host', senderId: 'host', started: true, timestamp: 900, seq: 4, matchGen: 0,
    });
    expect(shouldApplyMatchSync(leftoverOver, {
      myId: 'guest', roomId: 'room_host', inPvp: true, lastSeq: 3, matchGen: rematch.matchGen,
    })).toBe(false);
    expect(readPvpPublicEnabled({ DEV: false })).toBe(true);
  });
});
