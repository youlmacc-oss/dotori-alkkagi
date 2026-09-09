/**
 * 호스트·게스트 1:1 한 국과 다시하기. main.js 방 권위와 같은 순서다.
 */

import {
  PVP_ROOM_ID,
  applyIncomingRematchRoom,
  applyRoomGuest,
  applyRoomRematch,
  applyRoomStart,
  createRoomState,
  incomingResetsForRematch,
  mergeRoomState,
  roomMatchGen,
  tossFirstPlayerId,
} from './RoomState.js';
import {
  canStartMatch,
  firstPlayerId,
  isRematchWait,
  overlayRoomAcorns,
  shouldFollowPeerStart,
  shouldGuestFollowHostStart,
  shouldHoldPvpStartGate,
} from './MatchStart.js';
import {
  shouldApplyRematchStart,
  shouldFollowRemoteStart,
  shouldIgnoreLateStartReplay,
} from './MatchSync.js';
import { PHASE } from '../physics/GameEngine.js';
import { acornSettleKey, shouldSettleAcorns } from './AcornPolicy.js';

export const PVP_LOOP_ROUNDS = 12;

export function openPvpLoopSeats({
  roomId = PVP_ROOM_ID,
  hostId = 'host',
  guestId = 'guest',
} = {}) {
  const seated = applyRoomGuest(createRoomState({
    roomId, hostId, hostName: '호치',
  }), { guestId, guestName: '달이' });
  return { host: { ...seated }, guest: { ...seated } };
}

export function loopPlayers(room, myId = 'host') {
  return overlayRoomAcorns([], room, { myId, myAcorns: 10 });
}

export function hostCanStart(room, hostId = 'host') {
  return canStartMatch({
    mode: 'pvp',
    userId: hostId,
    players: loopPlayers(room, hostId),
    room,
  });
}

export function guestCanStart(room, guestId = 'guest') {
  return canStartMatch({
    mode: 'pvp',
    userId: guestId,
    players: loopPlayers(room, guestId),
    room,
  });
}

export function applyHostStart(room) {
  return applyRoomStart(room);
}

export function guestSeesHostStart(room, extras = {}) {
  return shouldGuestFollowHostStart({
    isHost: false,
    awaitingStart: extras.awaitingStart !== false,
    matchStarted: extras.matchStarted === true,
    roomStarted: room?.started === true,
    mode: 'pvp',
  });
}

export function applyGuestRoom(current, incoming) {
  if (incomingResetsForRematch(current, incoming)) {
    return applyIncomingRematchRoom(current, incoming);
  }
  return mergeRoomState(current, incoming);
}

export function hostRematch(room) {
  return applyRoomRematch(room);
}

export function rematchFollowsStalePresence(room, peerStarted = true) {
  const rematchWait = isRematchWait({
    matchGen: roomMatchGen(room),
    roomStarted: room?.started === true,
    matchStarted: false,
  });
  return shouldFollowPeerStart({
    awaitingStart: true,
    started: false,
    peerStarted,
    mode: 'pvp',
    rematchWait,
    roomStarted: room?.started === true,
  });
}

/** 한 국: 시작 → 정산 키 → 다시하기 → 게스트 동기. coalesce면 다시하기+시작 한 패킷. */
export function stepPvpLoopRound(hostRoom, guestRoom, {
  coalesceStart = false,
  winner = 'black',
} = {}) {
  const hostId = hostRoom.hostId;
  const guestId = hostRoom.guestId;
  const lead = firstPlayerId(loopPlayers(hostRoom, hostId), hostRoom);
  const startedHost = applyHostStart(hostRoom);
  let nextGuest = applyGuestRoom(guestRoom, startedHost);
  if (!nextGuest.started) nextGuest = applyHostStart(nextGuest);

  const settleKey = acornSettleKey({
    roomId: startedHost.roomId,
    matchGen: roomMatchGen(startedHost),
    winner,
  });
  const rematch = hostRematch(startedHost);
  let afterGuest = applyGuestRoom(startedHost, rematch);
  let afterHost = rematch;

  if (coalesceStart) {
    const coalesced = applyHostStart(rematch);
    afterHost = coalesced;
    afterGuest = applyGuestRoom(startedHost, coalesced);
  }

  return {
    lead,
    hostCanStart: hostCanStart(hostRoom, hostId),
    guestCanStart: guestCanStart(hostRoom, guestId),
    guestFollowed: guestSeesHostStart(startedHost),
    hostStarted: startedHost,
    guestStarted: nextGuest,
    settleKey,
    settles: shouldSettleAcorns({
      mode: 'pvp', started: true, winner, myColor: 'black', settleKey,
    }),
    rematch,
    afterHost,
    afterGuest,
    rematchWaitBlocksStale: rematchFollowsStalePresence(rematch, true) === false,
    rematchStartFollowsRoom: guestSeesHostStart(afterHost, {
      awaitingStart: true, matchStarted: false,
    }),
    holdGateAfterStart: shouldHoldPvpStartGate({
      mode: 'pvp', started: true, hasOpponent: true,
    }),
    lateStartWhileAiming: shouldIgnoreLateStartReplay({
      localPhase: PHASE.AIMING, remoteEvent: 'start', boardReady: true,
      localTurn: 'black', remoteTurn: 'black',
    }),
    rematchStartOnResult: shouldApplyRematchStart({
      localPhase: PHASE.GAME_OVER,
      remoteEvent: 'start',
      remoteGen: roomMatchGen(rematch),
      localGen: roomMatchGen(startedHost),
    }),
    staleEndedBlocked: shouldFollowRemoteStart({
      awaitingStart: true,
      started: false,
      remoteStarted: true,
      mode: 'pvp',
      remotePhase: PHASE.GAME_OVER,
      remoteWinner: winner,
    }) === false,
    firstIsHost: lead === hostId && tossFirstPlayerId(afterHost) === hostId,
    gensMatch: roomMatchGen(afterHost) === roomMatchGen(afterGuest),
  };
}
