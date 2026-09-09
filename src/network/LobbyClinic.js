/**
 * 대기실 자가진단: 기능·연동 포인트를 한 번에 점검한다.
 */

import {
  LOBBY_CAP,
  LOBBY_MODE_HINT,
  canJoinPvpFromLobby,
  canJoinPvpRoom,
  canSpectatePvpRoom,
  isLobbyFullStatus,
  preferNewerPresence,
  ROOM_ENDED_HINT,
  lobbySeatUsers,
  roomsFromPresence,
} from './LobbyRooms.js';
import { SESSION_ACORNS, acornSettleKey, shouldForfeitOnLeave, shouldForfeitOnOpponentGone, shouldSettleAcorns } from './AcornPolicy.js';
import { AI_LOBBY_ACORNS, shouldSettleAiAcorns } from './LobbyAi.js';
import { RESULT_BEAT_MS, RESULT_FALL_HOLD_MS } from '../physics/ResultBeat.js';
import {
  BOARD,
  FORMATION_FIRST_LINE,
  FORMATION_ZONE,
  GAME_MODE,
  PHASE,
  STONE_COLOR,
  boardGridLineMatterY,
  getFormationZones,
  shouldApplyLobbyDefaultMode,
  finalizeStartedMode,
  intendedGameMode,
} from '../physics/GameEngine.js';
import { MY_NICK_LABEL, NICKNAME_MAX } from './Nickname.js';
import { shouldOfferInviteOnlyNotice } from '../ui/GuideBook.js';
import {
  PVP_START_HINT,
  PVP_WAIT_HINT,
  firstPlayerId,
  hasPvpOpponent,
  isPeerBoardReady,
  isPeerMatchStarted,
  matchPlayersFromPresence,
  overlayRoomAcorns,
  presenceStartedFlag,
  isRematchWait,
  shouldFollowPeerStart,
  shouldHoldPvpStartGate,
  shouldReplayHostStart,
  shouldPollGuestStart,
} from './MatchStart.js';
import {
  canInviteLobbyUser,
  canShareInvite,
  joinedMatchRoomId,
  shouldKeepInviteShare,
  evaluateInviteJoin,
  evaluateLobbyInvite,
  guestClaimHeld,
  incomingRejectsMyGuestSeat,
  idleLobbyInvitees,
  pickJoinablePvp,
  roomFromInvite,
  shouldApplyInviteAccept,
  shouldApplyInviteDecline,
  shouldDismissInviteModal,
  shouldKeepHostInviteSheet,
  shouldOpenPresenceInvite,
  sentInviteFields,
  shouldRepublishOpenRoom,
  PVP_WAIT_EXPIRE_MS,
} from './PvpInvite.js';
import {
  MATCH_SYNC_EVENT,
  canApplyRemoteBoard,
  isStaleEndedMatchSync,
  shouldHoldEndedBoard,
  shouldApplyMatchSync,
  shouldApplyRematchStart,
  shouldFollowRemoteStart,
  shouldIgnoreLateStartReplay,
  shouldPublishMatchSync,
  shouldPulseMatchSync,
} from './MatchSync.js';
import {
  applyRoomGuest,
  applyRoomInvite,
  applyRoomLeave,
  applyRoomStart,
  createRoomState,
  incomingClearsOpponent,
  ROOM_STATE_EVENT,
  pvpSeatColor,
  incomingResetsForRematch,
  incomingStaleAfterRematch,
  mergeRoomState,
  tossFirstPlayerId,
  shouldKeepInviteShareFromRoom,
  shouldKeepPvpRematch,
  shouldReturnToPvpWait,
  shouldApplyPresenceOpponentLoss,
} from './RoomState.js';
import { shouldBlockSettingsToLobby } from '../ui/PlayPrefs.js';
import { LOBBY_STATE_EVENT, channelSendOk, channelSendLaunched } from './RealtimeManager.js';
import { shouldConfirmPresenceLeave, shouldPublishLeaveOnUnload } from './PresencePolicy.js';
import { BOOK_PLAY_LABEL, BOOK_SKIP_LABEL } from '../ui/GuideBook.js';
import { seatYawFor } from '../ui/ThreeRenderer.js';
import {
  FIRST_HINT,
  READY_ASK,
  READY_ASK_MS,
  REARRANGE_MS,
  answerReady,
  createMatchReady,
  rearrangeCountDown,
  stepMatchReady,
} from './MatchReady.js';

export const CLINIC_PASS = 'pass';
export const CLINIC_WARN = 'warn';
export const CLINIC_FAIL = 'fail';

function item(id, label, ok, detail, status) {
  return {
    id,
    label,
    ok: Boolean(ok),
    detail: String(detail || ''),
    status: status || (ok ? CLINIC_PASS : CLINIC_FAIL),
  };
}

export function isLiveRealtime(client) {
  const name = client?.constructor?.name || '';
  return Boolean(name) && name !== 'MockSupabaseClient' && name !== 'DualMockSupabaseClient';
}

export function readyClinicOk() {
  const askOn = stepMatchReady(createMatchReady(0), 0);
  const askOff = stepMatchReady(createMatchReady(0), 0, { askEnabled: false });
  const yes = answerReady(createMatchReady(0), true, 0);
  const counting = stepMatchReady(yes, 0);
  const lastTick = stepMatchReady(yes, REARRANGE_MS - 1);
  const done = stepMatchReady(yes, REARRANGE_MS);
  return READY_ASK.includes('재배치')
    && FIRST_HINT.includes('호스트')
    && READY_ASK_MS === 5000
    && REARRANGE_MS === 10000
    && rearrangeCountDown(REARRANGE_MS) === 10
    && counting.rearranging === true
    && counting.rearrangeCount === 10
    && counting.startVisible === false
    && lastTick.rearrangeCount === 1
    && done.rearranging === false
    && askOn.askVisible === true
    && askOn.startVisible === false
    && askOff.askVisible === false
    && askOff.startVisible === true;
}

export function pvpJoinClinicOk() {
  const waiting = {
    id: 'room_host',
    mode: 'pvp',
    status: 'waiting',
    hostId: 'host',
    players: [{ userId: 'host' }],
  };
  return canJoinPvpRoom(waiting, 'guest')
    && !canJoinPvpFromLobby(waiting, 'guest')
    && !canJoinPvpRoom(waiting, 'host')
    && !canJoinPvpRoom({ ...waiting, started: true }, 'guest')
    && evaluateInviteJoin(waiting, 'guest').ok === true
    && evaluateInviteJoin({ ...waiting, started: true }, 'guest').ok === false
    && guestClaimHeld({ guestId: 'guest' }, 'guest')
    && incomingRejectsMyGuestSeat(
      { roomId: 'room_host', guestId: 'late' },
      { roomId: 'room_host', hostId: 'host', guestId: 'guest' },
      'late',
    );
}

export function pvpInviteAcceptClinicOk() {
  const invite = evaluateLobbyInvite({
    roomId: 'room_host',
    hostId: 'host',
    hostName: '호치',
    targetId: 'guest',
  }, 'guest');
  const players = matchPlayersFromPresence([
    { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'room_host' },
    { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'room_host' },
  ], { myId: 'host', mode: 'pvp', roomId: 'room_host' });
  return invite.ok
    && hasPvpOpponent(players)
    && idleLobbyInvitees([{ userId: 'guest', status: 'lobby' }], 'host').length === 1
    && canShareInvite({
      mode: GAME_MODE.PVP,
      inRoom: true,
      started: false,
      isHost: true,
      hasOpponent: false,
    })
    && !canShareInvite({
      mode: GAME_MODE.PVP,
      inRoom: true,
      started: false,
      isHost: true,
      hasOpponent: true,
    })
    && !shouldKeepInviteShare({
      mode: GAME_MODE.PVP,
      inRoom: true,
      started: false,
      isHost: true,
      myId: 'host',
      roomId: 'room_host',
      users: [
        { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'room_host' },
        { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'room_host' },
      ],
    })
    && joinedMatchRoomId({ joiningRoomId: 'room_host', joining: true, myId: 'guest', mode: 'pvp' }) === 'dotori-pvp'
    && !shouldKeepInviteShareFromRoom(
      applyRoomGuest(createRoomState({ roomId: 'room_host', hostId: 'host' }), { guestId: 'guest' }),
      { myId: 'host', inRoom: true, mode: GAME_MODE.PVP },
    )
    && ROOM_STATE_EVENT === 'room_state'
    && joinedMatchRoomId({ joining: false, myId: 'host', mode: 'pvp' }) === 'dotori-pvp'
    && shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: isPeerMatchStarted([
        { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'room_host' },
        { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'room_host', started: true },
      ], { myId: 'host', roomId: 'room_host' }),
      mode: 'pvp',
    })
    && shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: isPeerMatchStarted([
        { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'dotori-pvp', started: true },
        { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'dotori-pvp' },
      ], { myId: 'guest', roomId: 'dotori-pvp' }),
      mode: 'pvp',
    })
    && !shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: false,
      mode: 'pvp',
    })
    && !shouldHoldPvpStartGate({ started: true, hasOpponent: false })
    && incomingClearsOpponent(
      applyRoomStart(applyRoomGuest(createRoomState({ roomId: 'room_host', hostId: 'host' }), { guestId: 'guest' })),
      applyRoomLeave(applyRoomStart(applyRoomGuest(createRoomState({ roomId: 'room_host', hostId: 'host' }), { guestId: 'guest' })), { leaverId: 'guest' }),
    )
    && !incomingClearsOpponent(
      applyRoomGuest(createRoomState({ roomId: 'room_host', hostId: 'host' }), { guestId: 'guest' }),
      applyRoomInvite(createRoomState({ roomId: 'room_host', hostId: 'host' }), 'guest'),
    )
    && shouldReturnToPvpWait({
      inRoom: true, mode: GAME_MODE.PVP, hadOpponent: true, hasOpponent: false,
    })
    && !shouldReturnToPvpWait({
      inRoom: true, mode: GAME_MODE.PVP, hadOpponent: true, hasOpponent: true,
    })
    && shouldRepublishOpenRoom({ inRoom: true, mode: 'pvp' })
    && sentInviteFields({
      inRoom: true, started: false, mode: 'pvp', hasOpponent: false,
      sent: { inviteTargetId: 'guest', inviteAt: 1 },
    }).inviteTargetId === 'guest'
    && sentInviteFields({
      inRoom: true, started: false, mode: 'pvp', hasOpponent: true,
      sent: { inviteTargetId: 'guest', inviteAt: 1 },
    }).inviteTargetId == null
    && shouldOpenPresenceInvite({
      userId: 'host',
      status: 'playing',
      mode: 'pvp',
      roomId: 'room_host',
      inviteTargetId: 'guest',
      inviteAt: 10,
    }, 'guest')
    && !shouldOpenPresenceInvite({
      userId: 'host',
      status: 'playing',
      mode: 'pvp',
      roomId: 'room_host',
      inviteTargetId: 'guest',
      inviteAt: 10,
    }, 'guest', 10)
    && shouldFollowRemoteStart({
      awaitingStart: true, started: false, remoteStarted: true, mode: 'pvp',
    })
    && shouldApplyMatchSync({
      senderId: 'host', roomId: 'room_host', timestamp: 2,
    }, { myId: 'guest', roomId: 'room_host', inPvp: true })
    && pvpSeatColor({ myId: 'guest', hostId: 'host' }) === STONE_COLOR.WHITE
    && seatYawFor(GAME_MODE.PVP, STONE_COLOR.BLACK, STONE_COLOR.WHITE) === Math.PI
    && !shouldPublishMatchSync({ inPvp: true, isHost: true })
    && !shouldPublishMatchSync({ inPvp: true, isHost: false })
    && shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'launch' })
    && shouldPublishMatchSync({ inPvp: true, isHost: true, force: true, event: 'turnEnd' })
    && !shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'pulse' })
    && !shouldPulseMatchSync({ inPvp: true, started: true })
    && mergeRoomState(
      { roomId: 'room_h', hostId: 'h', guestId: 'g', started: true, phase: 'playing' },
      { roomId: 'room_h', hostId: 'h', guestId: 'g', started: false, phase: 'ready', matchGen: 1 },
    )?.started === false
    && mergeRoomState(
      { roomId: 'room_h', hostId: 'h', guestId: 'g', started: true, phase: 'playing' },
      { roomId: 'room_h', hostId: 'h', guestId: 'g', started: false, phase: 'ready' },
    )?.started === true
    && presenceStartedFlag({ matchStarted: false, roomStarted: true })
    && !presenceStartedFlag({ matchStarted: false, roomStarted: false })
    && shouldReplayHostStart({
      isHost: true, matchStarted: true, guestStarted: false, hasOpponent: true,
    })
    && !shouldReplayHostStart({
      isHost: true, matchStarted: true, guestStarted: true, hasOpponent: true,
    })
    && !shouldApplyPresenceOpponentLoss({
      roomHasOpponent: true, presenceHasOpponent: false, confirmedLeave: false,
    })
    && !shouldApplyPresenceOpponentLoss({
      roomHasOpponent: true, presenceHasOpponent: false, confirmedLeave: true,
    })
    && shouldApplyPresenceOpponentLoss({
      roomHasOpponent: false, presenceHasOpponent: false, confirmedLeave: true,
    })
    && shouldPollGuestStart({ awaitingStart: true, inPvp: true })
    && !shouldPollGuestStart({ awaitingStart: false, inPvp: true })
    && shouldPollGuestStart({ awaitingStart: false, inPvp: true, boardReady: false })
    && !isPeerBoardReady([
      { userId: 'guest', status: 'playing', roomId: 'dotori-pvp', started: true },
    ], { myId: 'host', roomId: 'dotori-pvp', matchGen: 1 })
    && isPeerBoardReady([
      {
        userId: 'guest', status: 'playing', roomId: 'dotori-pvp',
        started: true, boardReady: true, matchGen: 1,
      },
    ], { myId: 'host', roomId: 'dotori-pvp', matchGen: 1 })
    && !shouldPublishLeaveOnUnload(
      { type: 'pagehide', persisted: false },
      { visibilityState: 'hidden' },
    )
    && shouldPublishLeaveOnUnload({ type: 'beforeunload' })
    && incomingStaleAfterRematch(
      { roomId: 'room_h', guestId: 'g', started: false, matchGen: 1 },
      { roomId: 'room_h', guestId: 'g', started: true, matchGen: 0 },
    )
    && mergeRoomState(
      { roomId: 'room_h', hostId: 'h', guestId: 'g', started: false, phase: 'ready', matchGen: 1 },
      { roomId: 'room_h', hostId: 'h', guestId: 'g', started: true, phase: 'playing', matchGen: 0 },
    )?.started === false
    && !isStaleEndedMatchSync({
      awaitingStart: true, started: false, remotePhase: PHASE.IDLE,
    })
    && isStaleEndedMatchSync({
      awaitingStart: true, started: false, remotePhase: PHASE.GAME_OVER, remoteWinner: STONE_COLOR.BLACK,
    })
    && !shouldFollowRemoteStart({
      awaitingStart: true, started: false, remoteStarted: true, mode: 'pvp',
      remotePhase: PHASE.GAME_OVER, remoteWinner: STONE_COLOR.BLACK,
    })
    && overlayRoomAcorns([], {
      hostId: 'h', guestId: 'g', hostAcorns: 11, guestAcorns: 9,
    }, { myId: 'h', myAcorns: 11 }).length === 2
    && !shouldPulseMatchSync({ inPvp: true, started: false })
    && shouldPublishMatchSync({ inPvp: true, isHost: true, force: true, event: 'launch' })
    && shouldRepublishOpenRoom({ inRoom: true, mode: 'pvp', started: false })
    && !shouldRepublishOpenRoom({ inRoom: true, mode: 'pvp', started: true })
    && canApplyRemoteBoard({ localPhase: PHASE.RESOLVING, remotePhase: PHASE.RESOLVING })
    && shouldIgnoreLateStartReplay({ localPhase: PHASE.AIMING, remoteEvent: 'start' })
    && !shouldIgnoreLateStartReplay({
      localPhase: PHASE.AIMING,
      remoteEvent: 'start',
      localTurn: STONE_COLOR.WHITE,
      remoteTurn: STONE_COLOR.BLACK,
    })
    && !canApplyRemoteBoard({
      localPhase: PHASE.AIMING,
      remotePhase: PHASE.IDLE,
      remoteEvent: 'start',
    })
    && canApplyRemoteBoard({
      localPhase: PHASE.AIMING,
      remotePhase: PHASE.IDLE,
      remoteEvent: 'start',
      localTurn: STONE_COLOR.WHITE,
      remoteTurn: STONE_COLOR.BLACK,
    })
    && !canApplyRemoteBoard({
      localPhase: PHASE.RESOLVING,
      remotePhase: PHASE.AIMING,
      localTurn: STONE_COLOR.WHITE,
      remoteTurn: STONE_COLOR.WHITE,
    })
    && shouldHoldEndedBoard({ localPhase: PHASE.GAME_OVER, remotePhase: PHASE.IDLE })
    && !canApplyRemoteBoard({ localPhase: PHASE.GAME_OVER, remotePhase: PHASE.IDLE })
    && shouldApplyInviteDecline(
      { action: 'decline', hostId: 'host', targetId: 'guest' },
      { myId: 'host', sentTargetId: 'guest' },
    )
    && shouldApplyInviteAccept(
      { action: 'accept', hostId: 'host', targetId: 'guest', roomId: 'room_host' },
      { myId: 'host', roomId: 'room_host', inRoom: true },
    )
    && !shouldKeepHostInviteSheet({
      room: { roomId: 'room_host', hostId: 'host', guestId: null },
      myId: 'host', inRoom: true, mode: 'pvp', hasOpponent: true,
    })
    && shouldKeepHostInviteSheet({
      room: { roomId: 'room_host', hostId: 'host', guestId: null },
      myId: 'host', inRoom: true, mode: 'pvp', hasOpponent: false,
    })
    && evaluateInviteJoin(roomFromInvite({
      roomId: 'room_host', hostId: 'host', hostName: '호치',
    }), 'guest').ok === true
    && pickJoinablePvp([
      { id: 'room_host', mode: 'pvp', status: 'playing', started: true, hostId: 'host' },
      roomFromInvite({ roomId: 'room_host', hostId: 'host' }),
    ], 'guest')?.status === 'waiting'
    && shouldDismissInviteModal(
      { hostId: 'host', targetId: 'guest' },
      { action: 'cancel', hostId: 'host', targetId: 'guest' },
      'guest',
    )
    && channelSendOk('ok')
    && channelSendLaunched('ok')
    && channelSendLaunched('pending')
    && !channelSendOk('error')
    && !channelSendOk('timed out');
}

export function pvpPresenceClinicOk() {
  const playing = { userId: 'g', status: 'playing', mode: 'pvp', roomId: 'room_h', lastSeen: 0 };
  const staleLobby = { userId: 'g', status: 'lobby', mode: null, roomId: null, lastSeen: 100 };
  const kept = preferNewerPresence(playing, staleLobby);
  const invited = preferNewerPresence(
    { userId: 'h', status: 'playing', mode: 'pvp', roomId: 'room_h', lastSeen: 10, inviteTargetId: null },
    { userId: 'h', status: 'playing', mode: 'pvp', roomId: 'room_h', lastSeen: 10, inviteTargetId: 'g', inviteAt: 10 },
  );
  const seats = lobbySeatUsers([
    playing,
    { userId: 'idle', status: 'lobby', mode: null, roomId: null },
  ]);
  return kept.status === 'playing'
    && kept.roomId === 'room_h'
    && invited.inviteTargetId === 'g'
    && roomsFromPresence([playing]).length === 1
    && seats.map((u) => u.userId).join() === 'idle'
    && LOBBY_STATE_EVENT === 'lobby_state'
    && MATCH_SYNC_EVENT === 'spectator_update'
    && canSpectatePvpRoom({ mode: 'pvp', status: 'playing' })
    && !canSpectatePvpRoom({ mode: 'ai', status: 'playing' })
    && isLobbyFullStatus('FULL')
    && ROOM_ENDED_HINT.includes('종료')
    && !shouldConfirmPresenceLeave({ key: 'g', liveUsers: [playing] })
    && !shouldConfirmPresenceLeave({
      key: 'g',
      liveUsers: [],
      hint: { userId: 'g', lastSeen: 200, nickname: '달이' },
      leftPresences: [{ userId: 'g', lastSeen: 100, nickname: '도토리2' }],
    })
    && shouldConfirmPresenceLeave({ key: 'g', liveUsers: [], explicitLeft: true })
    && !shouldConfirmPresenceLeave({ key: 'me', selfLeave: true, liveUsers: [] });
}

export function pvpRearrangeClinicOk() {
  const zones = getFormationZones(BOARD, FORMATION_ZONE.CUSTOM);
  return readyClinicOk()
    && Math.abs(zones.white.maxY - boardGridLineMatterY(FORMATION_FIRST_LINE.WHITE)) < 1e-6
    && Math.abs(zones.black.minY - boardGridLineMatterY(FORMATION_FIRST_LINE.BLACK)) < 1e-6;
}

export function pullClinicOk(input = {}) {
  return String(input.pullOverNotice || '').includes('바둑돌위')
    && String(input.pullBlockNotice || '').includes('붙어');
}

export function actionCamClinicOk(input = {}) {
  return Boolean(input.hasActionCam) && input.killCamOffSkips === true;
}

export function pvpHoldClinicOk() {
  const idle = {
    phase: PHASE.IDLE,
    gameMode: GAME_MODE.PVP,
    currentTurn: STONE_COLOR.BLACK,
    scores: { black: 5, white: 5 },
    formation: { count: 5 },
  };
  return shouldApplyLobbyDefaultMode(idle, GAME_MODE.AI, { inRoom: true }) === false
    && shouldApplyLobbyDefaultMode(idle, GAME_MODE.AI) === false
    && shouldApplyLobbyDefaultMode(idle, GAME_MODE.AI, { joining: true }) === false
    && shouldApplyLobbyDefaultMode(idle, GAME_MODE.AI, { startingPvp: true }) === false
    && finalizeStartedMode(GAME_MODE.PVP, GAME_MODE.AI) === GAME_MODE.AI
    && intendedGameMode(GAME_MODE.PVP) === GAME_MODE.AI;
}

export function nickClinicOk() {
  return NICKNAME_MAX === 5 && MY_NICK_LABEL === '내닉네임';
}

export function bookSkipClinicOk(input = {}) {
  return Boolean(input.hasBookSkip && input.hasBookPlay)
    && BOOK_SKIP_LABEL.includes('띄우지')
    && BOOK_PLAY_LABEL.includes('바로시작')
    && !shouldOfferInviteOnlyNotice({ tutorialSkipped: true })
    && !shouldOfferInviteOnlyNotice({ guidebookClosed: true });
}

export function lobbyInviteClinicOk(_input = {}) {
  return !shouldOfferInviteOnlyNotice({ tutorialSkipped: true })
    && !shouldOfferInviteOnlyNotice({ guidebookClosed: true })
    && intendedGameMode(GAME_MODE.PVP) === GAME_MODE.AI;
}

export function pvpExpireClinicOk() {
  return PVP_WAIT_EXPIRE_MS === 0;
}

export function runLobbyClinic(input = {}) {
  const win = {
    mode: 'ai',
    started: true,
    winner: 'black',
    myColor: 'black',
  };
  const items = [
    item('engine', '물리 엔진', Boolean(input.engine), input.engine ? 'Matter 엔진 연결' : '엔진 없음'),
    item('renderer', '3D 판', Boolean(input.renderer), input.renderer ? 'Three 렌더러 연결' : '렌더러 없음'),
    item(
      'sound',
      '사운드',
      true,
      input.soundUnlocked
        ? `해제됨 · 음량 ${Math.round((Number(input.volume) || 0) * 100)}%${input.muted ? ' · 음소거' : ''}`
        : '첫 터치 후 잠금 해제',
      input.soundUnlocked ? CLINIC_PASS : CLINIC_WARN,
    ),
    item(
      'session',
      '탭 세션',
      Boolean(input.userId) && Number.isFinite(Number(input.acorns)),
      `${input.nickname || '닉 없음'} · 도토리 ${Number.isFinite(Number(input.acorns)) ? input.acorns : '?'}`,
    ),
    item(
      'night',
      '새로고침 유지',
      Boolean(input.nightUserId),
      input.nightUserId ? '같은 탭 F5 아이디 유지' : '세션 아이디 없음',
    ),
    item(
      'modes',
      '1인 / AI',
      Boolean(input.hasSolo && input.hasAi),
      input.hasSolo && input.hasAi ? LOBBY_MODE_HINT : '모드 버튼 누락',
    ),
    item(
      'product',
      '1인 · AI만',
      intendedGameMode(GAME_MODE.PVP) === GAME_MODE.AI
        && pvpHoldClinicOk()
        && pvpExpireClinicOk()
        && !canJoinPvpFromLobby({ mode: 'pvp', status: 'waiting' }, 'guest')
        && lobbyInviteClinicOk(input),
      '1:1 참가·초대·대기 안내 없음',
    ),
    item(
      'nick',
      '닉 · 내닉네임',
      nickClinicOk(),
      nickClinicOk() ? `최대 ${NICKNAME_MAX}글자 · ${MY_NICK_LABEL}` : '닉 규칙 누락',
    ),
    item(
      'bookSkip',
      '가이드 바로시작',
      bookSkipClinicOk(input),
      bookSkipClinicOk(input) ? '바로시작 · 다음 접속 숨김' : '바로시작/숨김 UI 없음',
    ),
    item(
      'first',
      '선공 규칙',
      String(PVP_START_HINT).includes('호스트')
        && tossFirstPlayerId({ roomId: 'r', hostId: 'h', guestId: 'g', matchGen: 0 }) === 'h'
        && firstPlayerId([], { hostId: 'u1', guestId: 'g' }, { mode: 'solo', userId: 'u1' }) === 'u1',
      PVP_START_HINT,
    ),
    item(
      'acorn',
      '도토리 정산',
      shouldSettleAcorns(win)
        && shouldSettleAiAcorns({ ...win, aiOpponent: true })
        && !shouldSettleAiAcorns({ ...win, mode: 'pvp', aiOpponent: true })
        && !shouldSettleAcorns({ ...win, mode: 'pvp' })
        && !shouldSettleAcorns({ ...win, mode: 'solo' })
        && !shouldSettleAcorns({ ...win, started: false })
        && AI_LOBBY_ACORNS === SESSION_ACORNS
        && !shouldSettleAcorns({
          ...win,
          settleKey: acornSettleKey({ roomId: 'room_h', matchGen: 0, winner: 'black' }),
          lastSettledKey: acornSettleKey({ roomId: 'room_h', matchGen: 0, winner: 'black' }),
        }),
      `시작 10 · AI 대전 ±1 · 1인 제외 (${SESSION_ACORNS})`,
    ),
    item(
      'forfeit',
      '기권 정산 없음',
      !shouldForfeitOnLeave({ mode: 'pvp', started: true, phase: 'idle' })
        && !shouldForfeitOnLeave({ mode: 'ai', started: true, phase: 'idle' })
        && !shouldForfeitOnOpponentGone({
          mode: 'pvp', started: true, phase: 'idle', hadOpponent: true, hasOpponent: false,
        }),
      '1:1 기권 정산 없음 · AI만 결과 정산',
    ),
    item(
      'result',
      '결과 한 박자',
      RESULT_BEAT_MS === 420
        && RESULT_FALL_HOLD_MS === 1920
        && Number(input.killCamSlowMo) === 1.5
        && input.killCamOffSkips === true,
      `액션캠 ${Number(input.killCamSlowMo) || 1.5}s 후 ${RESULT_FALL_HOLD_MS}ms`,
    ),
    item(
      'actionCam',
      '액션캠',
      actionCamClinicOk(input),
      input.actionCamOn === false
        ? '꺼짐 · 장외 클로즈업 없음'
        : input.hasActionCam
          ? '켜짐 · 판 밖에서 낙사 돌을 봄'
          : '액션캠 설정 없음',
    ),
    item(
      'ready',
      '시작 전 재배치',
      readyClinicOk()
        && pvpRearrangeClinicOk()
        && Boolean(input.hasReadyAsk && input.hasRearrangeAsk),
      input.rearrangeAskOn === false
        ? '꺼짐 · 시작 버튼 바로 표시'
        : '5초 질문 · 예 하면 10초 내림 카운트 · 첫째 선 안',
    ),
    item(
      'pull',
      '당김 금지',
      pullClinicOk(input),
      pullClinicOk(input) ? '돌 위·밀착 축은 당길 수 없음' : '당김 금지 문구 없음',
    ),
    item(
      'cap',
      '혼자 두기',
      true,
      '접속 현황 · 정원 목록 없음',
    ),
    item(
      'gate',
      '시작 게이트',
      Boolean(input.hasStartGate && input.hasReadyAsk),
      input.hasStartGate && input.hasReadyAsk ? '시작 · 재배치 질문 연결' : '시작/재배치 UI 없음',
    ),
    item(
      'fabs',
      '기권 · 대기방',
      Boolean(input.hasSurrender && input.hasLeave),
      input.hasSurrender && input.hasLeave ? 'FAB 연결' : '기권/대기방 누락',
    ),
    item(
      'volume',
      '환경설정',
      Boolean(input.hasVolume && input.hasActionCam && input.hasRearrangeAsk && input.hasGuideColor)
        && shouldBlockSettingsToLobby({ inRoom: true, started: true })
        && !shouldBlockSettingsToLobby({ inRoom: true, started: false }),
      input.hasVolume && input.hasActionCam && input.hasRearrangeAsk && input.hasGuideColor
        ? `음량 · 액션캠 ${input.actionCamOn === false ? '꺼짐' : '켜짐'} · 조준선 · 재배치 ${input.rearrangeAskOn === false ? '꺼짐' : '켜짐'} · 대국 중 적용 불가`
        : '음량/액션캠/조준선/재배치 설정 누락',
    ),
    item(
      'realtime',
      '혼자 두기',
      true,
      '대기실 접속 현황 없음 · 1인·AI만',
      CLINIC_PASS,
    ),
  ];

  const passes = items.filter((row) => row.status === CLINIC_PASS).length;
  const warns = items.filter((row) => row.status === CLINIC_WARN).length;
  const fails = items.filter((row) => row.status === CLINIC_FAIL).length;
  return {
    ok: fails === 0,
    ready: fails === 0 && warns === 0,
    passes,
    warns,
    fails,
    total: items.length,
    items,
    summary: fails
      ? `실패 ${fails} · 주의 ${warns} · 통과 ${passes}`
      : warns
        ? `주의 ${warns} · 통과 ${passes}/${items.length}`
        : `전부 통과 ${passes}/${items.length}`,
  };
}
