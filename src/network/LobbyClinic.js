/**
 * 대기실 자가진단: 기능·연동 포인트를 한 번에 점검한다.
 */

import {
  LOBBY_CAP,
  LOBBY_MODE_HINT,
  PVP_WAIT_GUIDE,
  canJoinPvpFromLobby,
  canJoinPvpRoom,
  preferNewerPresence,
  lobbySeatUsers,
  roomsFromPresence,
} from './LobbyRooms.js';
import { SESSION_ACORNS, shouldForfeitOnLeave, shouldSettleAcorns } from './AcornPolicy.js';
import { RESULT_BEAT_MS, RESULT_FALL_HOLD_MS } from '../physics/ResultBeat.js';
import {
  BOARD,
  FORMATION_SECOND_LINE,
  FORMATION_ZONE,
  GAME_MODE,
  PHASE,
  STONE_COLOR,
  boardGridLineMatterY,
  getFormationZones,
  shouldApplyLobbyDefaultMode,
} from '../physics/GameEngine.js';
import { MY_NICK_LABEL, NICKNAME_MAX } from './Nickname.js';
import {
  PVP_START_HINT,
  PVP_WAIT_HINT,
  hasPvpOpponent,
  isPeerMatchStarted,
  matchPlayersFromPresence,
  shouldFollowPeerStart,
  shouldHoldPvpStartGate,
} from './MatchStart.js';
import {
  canInviteLobbyUser,
  canShareInvite,
  evaluateInviteJoin,
  evaluateLobbyInvite,
  idleLobbyInvitees,
  PVP_WAIT_EXPIRE_MS,
} from './PvpInvite.js';
import { LOBBY_STATE_EVENT } from './RealtimeManager.js';
import { BOOK_PLAY_LABEL, BOOK_SKIP_LABEL } from '../ui/GuideBook.js';
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
  return Boolean(name) && name !== 'MockSupabaseClient';
}

export function readyClinicOk() {
  const askOn = stepMatchReady(createMatchReady(0), 0);
  const askOff = stepMatchReady(createMatchReady(0), 0, { askEnabled: false });
  const yes = answerReady(createMatchReady(0), true, 0);
  const counting = stepMatchReady(yes, 0);
  const lastTick = stepMatchReady(yes, REARRANGE_MS - 1);
  const done = stepMatchReady(yes, REARRANGE_MS);
  return READY_ASK.includes('재배치')
    && FIRST_HINT.includes('도토리가 적은 사람')
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
    && canJoinPvpFromLobby(waiting, 'guest')
    && !canJoinPvpRoom(waiting, 'host')
    && evaluateInviteJoin(waiting, 'guest').ok === true;
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
    && shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: isPeerMatchStarted([
        { userId: 'host', status: 'playing', mode: 'pvp', roomId: 'room_host' },
        { userId: 'guest', status: 'playing', mode: 'pvp', roomId: 'room_host', started: true },
      ], { myId: 'host', roomId: 'room_host' }),
      mode: 'pvp',
    })
    && !shouldFollowPeerStart({
      awaitingStart: true,
      started: false,
      peerStarted: false,
      mode: 'pvp',
    })
    && !shouldHoldPvpStartGate({ started: true, hasOpponent: false });
}

export function pvpPresenceClinicOk() {
  const playing = { userId: 'g', status: 'playing', mode: 'pvp', roomId: 'room_h', lastSeen: 0 };
  const staleLobby = { userId: 'g', status: 'lobby', mode: null, roomId: null, lastSeen: 100 };
  const kept = preferNewerPresence(playing, staleLobby);
  const seats = lobbySeatUsers([
    playing,
    { userId: 'idle', status: 'lobby', mode: null, roomId: null },
  ]);
  return kept.status === 'playing'
    && kept.roomId === 'room_h'
    && roomsFromPresence([playing]).length === 1
    && seats.map((u) => u.userId).join() === 'idle'
    && LOBBY_STATE_EVENT === 'lobby_state';
}

export function pvpRearrangeClinicOk() {
  const zones = getFormationZones(BOARD, FORMATION_ZONE.CUSTOM);
  return readyClinicOk()
    && Math.abs(zones.white.maxY - boardGridLineMatterY(FORMATION_SECOND_LINE.WHITE)) < 1e-6
    && Math.abs(zones.black.minY - boardGridLineMatterY(FORMATION_SECOND_LINE.BLACK)) < 1e-6;
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
    && shouldApplyLobbyDefaultMode(idle, GAME_MODE.AI) === true;
}

export function nickClinicOk() {
  return NICKNAME_MAX === 5 && MY_NICK_LABEL === '내닉네임';
}

export function bookSkipClinicOk(input = {}) {
  return Boolean(input.hasBookSkip && input.hasBookPlay)
    && BOOK_SKIP_LABEL.includes('띄우지')
    && BOOK_PLAY_LABEL.includes('바로시작');
}

export function lobbyInviteClinicOk(input = {}) {
  return Boolean(input.hasInviteCopy && input.hasInviteNick && input.hasLobbyInvite && input.hasLobbyInviteModal)
    && canInviteLobbyUser({
      mode: GAME_MODE.PVP,
      inRoom: true,
      started: false,
      isHost: true,
      hasOpponent: false,
      target: { userId: 'guest', status: 'lobby' },
    });
}

export function pvpExpireClinicOk() {
  return PVP_WAIT_EXPIRE_MS === 10 * 60 * 1000;
}

export function runLobbyClinic(input = {}) {
  const win = {
    mode: 'pvp',
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
      '1인 / AI / 1:1',
      Boolean(input.hasSolo && input.hasAi && input.hasPvp),
      input.hasSolo && input.hasAi && input.hasPvp ? LOBBY_MODE_HINT : '모드 버튼 누락',
    ),
    item(
      'pvpWait',
      '1:1 상대 대기',
      String(input.pvpWaitHint || PVP_WAIT_HINT).includes('상대')
        && String(PVP_WAIT_GUIDE).includes('초대')
        && pvpHoldClinicOk(),
      pvpHoldClinicOk() ? '사람이 올 때까지 대기 · AI로 바뀌지 않음' : '1:1 방이 AI로 덮일 수 있음',
    ),
    item(
      'pvpHold',
      '1:1 방 유지',
      pvpHoldClinicOk(),
      pvpHoldClinicOk() ? '혼자 개설해도 1:1 대기 유지' : '대기 중 AI 전환',
    ),
    item(
      'expire',
      '1:1 10분 만료',
      pvpExpireClinicOk(),
      pvpExpireClinicOk() ? '10분 미시작이면 대기실' : '만료 시간 없음',
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
      String(PVP_START_HINT).includes('도토리가 적은 사람'),
      PVP_START_HINT,
    ),
    item(
      'acorn',
      '도토리 정산',
      shouldSettleAcorns(win)
        && !shouldSettleAcorns({ ...win, mode: 'ai' })
        && !shouldSettleAcorns({ ...win, started: false }),
      `시작 10 · 1:1만 ±1 · 음수 허용 (${SESSION_ACORNS})`,
    ),
    item(
      'forfeit',
      '시작 후 나가기=패',
      shouldForfeitOnLeave({ mode: 'pvp', started: true, phase: 'idle' })
        && !shouldForfeitOnLeave({ mode: 'pvp', started: false, phase: 'idle' }),
      '대기 중 나가기는 정산 없음',
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
      'pvpJoin',
      '1:1 참가',
      pvpJoinClinicOk(),
      pvpJoinClinicOk() ? '대기 1:1은 참가하기 · 호스트는 불가' : '1:1 참가 규칙 오류',
    ),
    item(
      'pvpAccept',
      '1:1 초대 수락',
      pvpInviteAcceptClinicOk(),
      pvpInviteAcceptClinicOk() ? '수락하면 호스트 방에 붙고 선공 시작을 따라간다' : '초대 수락·시작 동기 오류',
    ),
    item(
      'pvpPresence',
      '1:1 실시간 입장',
      pvpPresenceClinicOk(),
      pvpPresenceClinicOk() ? '방 개설은 대기실에 보이고 좌석에서는 빠짐' : '입장 동기화 오류',
    ),
    item(
      'pvpPlace',
      '1:1 둘째 선 재배치',
      pvpRearrangeClinicOk() && Boolean(input.hasReadyAsk && input.hasRearrangeAsk),
      pvpRearrangeClinicOk()
        ? (input.rearrangeAskOn === false ? '꺼짐 · 시작 버튼 바로 표시' : '예 하면 10초 내림 카운트 · 둘째 선 안')
        : '재배치 카운트/둘째 선 오류',
    ),
    item(
      'ready',
      '시작 전 재배치',
      readyClinicOk() && Boolean(input.hasReadyAsk && input.hasRearrangeAsk),
      input.rearrangeAskOn === false
        ? '꺼짐 · 시작 버튼 바로 표시'
        : '5초 질문 · 예 하면 10초 내림 카운트',
    ),
    item(
      'pull',
      '당김 금지',
      pullClinicOk(input),
      pullClinicOk(input) ? '돌 위·밀착 축은 당길 수 없음' : '당김 금지 문구 없음',
    ),
    item('cap', '대기실 정원', LOBBY_CAP === 10 && Number(input.lobbyCap ?? 10) === 10, `${LOBBY_CAP}명`),
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
      Boolean(input.hasVolume && input.hasActionCam && input.hasRearrangeAsk),
      input.hasVolume && input.hasActionCam && input.hasRearrangeAsk
        ? `음량 · 액션캠 ${input.actionCamOn === false ? '꺼짐' : '켜짐'} · 재배치 ${input.rearrangeAskOn === false ? '꺼짐' : '켜짐'}`
        : '음량/액션캠/재배치 설정 누락',
    ),
    item(
      'invite',
      '초대 · 대기방',
      lobbyInviteClinicOk(input),
      lobbyInviteClinicOk(input) ? '링크 · 대기방 초대 · 수락/거절' : '초대 UI 없음',
    ),
    item(
      'realtime',
      '실시간 접속',
      true,
      input.realtimeLive
        ? (input.connected ? 'Supabase 연결됨 · 같은 주소로 동시접속' : '원격 클라이언트 · 미접속')
        : input.liveConfigured
          ? '설정은 있으나 아직 Mock'
          : '로컬 Mock — 친구와 같은 대기실이 아님',
      input.realtimeLive ? (input.connected ? CLINIC_PASS : CLINIC_WARN) : CLINIC_WARN,
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
