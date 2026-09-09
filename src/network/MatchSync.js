/**
 * 1:1 대국 판 동기. 샷 이후 돌·턴을 같은 방의 상대와 관전자에게 보낸다.
 */

import { PHASE, findRemoteStone } from '../physics/GameEngine.js';
import { PVP_ROOM_ID, normalizePvpRoomId } from './RoomState.js';

export { findRemoteStone };

export function sameMatchSyncRoom(a, b) {
  if (!a || !b) return false;
  if (String(a) === String(b)) return true;
  const left = normalizePvpRoomId(a);
  const right = normalizePvpRoomId(b);
  return Boolean(left && right && left === right
    && (String(a) === PVP_ROOM_ID || String(b) === PVP_ROOM_ID));
}

export const MATCH_SYNC_EVENT = 'spectator_update';
export const TURN_END_WATCHDOG_MS = 900;
export const CAMP_WAIT_MS = 800;
export const HOST_CLOCK_MS = 250;

export function packStoneSync(stone) {
  if (!stone) return null;
  const position = stone.body
    ? { x: stone.body.position.x, y: stone.body.position.y }
    : (stone.position || { x: stone.x, y: stone.y });
  const velocity = stone.body
    ? { x: stone.body.velocity.x, y: stone.body.velocity.y }
    : (stone.velocity || { x: 0, y: 0 });
  return {
    id: stone.id,
    color: stone.color,
    fallen: Boolean(stone.fallen),
    position,
    x: position.x,
    y: position.y,
    velocity,
  };
}

export function packMatchSync(snapshot, extras = {}) {
  const stones = extras.stones || snapshot?.stones || [];
  const event = extras.event || snapshot?.event || '';
  const launch = extras.launch || snapshot?.launch || null;
  return {
    kind: extras.kind || snapshot?.kind || (event === 'launch' ? 'launch' : 'board'),
    event,
    matchId: extras.roomId || extras.matchId || snapshot?.matchId || '',
    roomId: extras.roomId || extras.matchId || '',
    senderId: extras.senderId || '',
    timestamp: Number(extras.timestamp) > 0 ? Number(extras.timestamp) : Date.now(),
    started: extras.started === true,
    phase: snapshot?.phase,
    currentTurn: snapshot?.currentTurn,
    turnRemainingMs: snapshot?.timer?.remainingMs ?? snapshot?.turnRemainingMs,
    winner: snapshot?.winner ?? null,
    scores: snapshot?.scores || extras.scores || null,
    stones: stones.map(packStoneSync).filter(Boolean),
    stoneId: launch?.stoneId ?? extras.stoneId ?? snapshot?.stoneId ?? null,
    x: launch?.x ?? launch?.position?.x ?? extras.x ?? snapshot?.x ?? null,
    y: launch?.y ?? launch?.position?.y ?? extras.y ?? snapshot?.y ?? null,
    velocity: launch?.velocity ?? extras.velocity ?? snapshot?.velocity ?? null,
    force: launch?.force ?? extras.force ?? snapshot?.force ?? null,
    power: launch?.power ?? extras.power ?? snapshot?.power ?? 0,
    color: launch?.color ?? extras.color ?? snapshot?.color ?? null,
    seq: matchSyncSeq(extras.seq ?? snapshot?.seq),
    matchGen: matchSyncGen(extras.matchGen ?? snapshot?.matchGen),
  };
}

export function matchSyncSeq(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function matchSyncGen(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function mergeCampLayouts(hostStones = [], guestStones = []) {
  const black = (Array.isArray(hostStones) ? hostStones : [])
    .filter((stone) => stone && stone.color !== 'white')
    .map(packStoneSync)
    .filter(Boolean);
  const white = (Array.isArray(guestStones) ? guestStones : [])
    .filter((stone) => stone && stone.color === 'white')
    .map(packStoneSync)
    .filter(Boolean);
  return [...black, ...white];
}

export function packCampSync(stones, extras = {}) {
  return packMatchSync({
    phase: extras.phase,
    currentTurn: extras.currentTurn,
    stones,
  }, {
    ...extras,
    event: 'camp',
    kind: 'camp',
    stones,
  });
}

export function shouldFireTurnEndWatchdog({
  isHost = false,
  awaitingStart = false,
  launchedAt = 0,
  now = Date.now(),
  gotShooterTurnEnd = false,
} = {}) {
  if (!isHost || awaitingStart === true || gotShooterTurnEnd === true) return false;
  const at = Number(launchedAt);
  if (!Number.isFinite(at) || at <= 0) return false;
  return Number(now) - at >= TURN_END_WATCHDOG_MS;
}

export function packLaunchSync(launch, extras = {}) {
  return packMatchSync({ phase: PHASE.RESOLVING, currentTurn: extras.currentTurn || launch?.color }, {
    ...extras,
    event: 'launch',
    kind: 'launch',
    launch,
    stones: extras.stones || launch?.stones || [],
  });
}

export function isLaunchSync(payload) {
  return payload?.kind === 'launch' || payload?.event === 'launch';
}

export function matchSyncEventName(payload) {
  if (isLaunchSync(payload)) return 'launch';
  return payload?.event || '';
}

/** 손님 판이 열리기 전 timer는 seq를 올리지 않는다. start가 삼켜진다. */
export function shouldIgnoreHostClockUntilBoard({
  event = '',
  boardReady = true,
  awaitingStart = false,
} = {}) {
  return event === 'timer' && (boardReady !== true || awaitingStart === true);
}

/** 시계가 먼저 오면 낮은 seq의 start/첫 샷을 살려야 한다. */
export function shouldBypassStaleMatchSeq({
  event = '',
  boardReady = true,
  awaitingStart = false,
} = {}) {
  if (event !== 'start' && event !== 'launch' && event !== 'turnEnd') return false;
  return boardReady !== true || awaitingStart === true;
}

/** 게이트에 남은 손님이 호스트 실황을 보면 국을 연다. */
export function shouldOpenGuestFromHostLive({
  awaitingStart = false,
  matchStarted = false,
  remoteStarted = false,
  event = '',
} = {}) {
  if (awaitingStart !== true || matchStarted === true) return false;
  if (remoteStarted !== true) return false;
  return event === 'start' || event === 'launch' || event === 'turnEnd';
}

export function shouldApplyMatchSync(payload, {
  myId,
  roomId,
  lastTs = 0,
  lastSeq = 0,
  matchGen = 0,
  spectating = false,
  inPvp = false,
  boardReady = true,
  awaitingStart = false,
} = {}) {
  if (!payload) return false;
  if (myId && payload.senderId && String(payload.senderId) === String(myId)) return false;
  if (roomId && payload.roomId && !sameMatchSyncRoom(payload.roomId, roomId)) return false;
  const incomingGen = matchSyncGen(payload.matchGen);
  const localGen = matchSyncGen(matchGen);
  if (localGen && incomingGen < localGen) return false;
  const event = matchSyncEventName(payload);
  void awaitingStart;
  const seq = matchSyncSeq(payload.seq);
  const seen = matchSyncSeq(lastSeq);
  const live = spectating === true || inPvp === true;
  if (seq > 0) {
    if (seen > 0 && seq <= seen) {
      return live && shouldBypassStaleMatchSeq({ event, boardReady, awaitingStart });
    }
  } else {
    const ts = Number(payload.timestamp) || 0;
    if (ts && Number(lastTs) > 0 && ts <= Number(lastTs)) {
      return live && shouldBypassStaleMatchSeq({ event, boardReady, awaitingStart });
    }
  }
  return live;
}

export function shouldPublishMatchSync({
  inPvp = false,
  isHost = false,
  force = false,
  event = '',
} = {}) {
  if (!inPvp || force !== true) return false;
  if (event === 'launch' || event === 'camp' || event === 'gameOver') return true;
  if (event === 'turnEnd' || event === 'timer') {
    return isHost === true;
  }
  if (event === 'start') return isHost === true;
  return false;
}

/** 1:1 판·시계는 호스트만 보낸다. 손님 로컬 정지는 방송하지 않는다. */
export function shouldPublishSettledTurnEnd({
  remoteShot = false,
  inPvp = false,
  isHost = false,
} = {}) {
  if (inPvp === true) return isHost === true;
  return remoteShot !== true;
}

/** 방이 열렸으면 손님 러너를 끄지 않는다. 끄면 첫 샷이 영원히 멈춘다. */
export function shouldPauseMatchRunner({
  lobby = false,
  awaitingStart = false,
  roomStarted = false,
  spectating = false,
} = {}) {
  if (spectating === true) return false;
  if (lobby === true) return true;
  return awaitingStart === true && roomStarted !== true;
}

/** 손님은 호스트 start 판을 받기 전에 시계를 켜지 않는다. */
export function shouldHoldGuestUntilHostBoard({
  isHost = false,
  inPvp = false,
  boardReady = false,
  roomStarted = false,
} = {}) {
  return inPvp === true && isHost !== true && roomStarted === true && boardReady !== true;
}

/** HUD 시계는 손님도 깎는다. 타임오버는 호스트만. */
export function shouldTickLocalTurnTimer({
  spectating = false,
} = {}) {
  return spectating !== true;
}

export function shouldExpireLocalTurn({
  inPvp = false,
  isHost = false,
  spectating = false,
} = {}) {
  if (spectating === true) return false;
  if (inPvp === true) return isHost === true;
  return true;
}

/** timer는 판이 열리기 전 seq를 올리지 않는다. */
export function shouldNoteMatchSyncSeq({ event = '', boardReady = true } = {}) {
  if (event === 'timer' && boardReady !== true) return false;
  return true;
}

/** timer마다 resume하면 휴대폰 러너가 죽는다. */
export function shouldWakeMatchOnSync({ event = '' } = {}) {
  return event === 'start' || event === 'launch' || event === 'turnEnd' || event === 'gameOver';
}

/** 호스트 조준/대기의 남은 시간을 손님 HUD에 실어 보낸다. */
export function shouldPublishHostClock({
  inPvp = false,
  isHost = false,
  phase = '',
  lastAt = 0,
  now = 0,
  intervalMs = HOST_CLOCK_MS,
  matchStarted = false,
  awaitingStart = false,
} = {}) {
  if (inPvp !== true || isHost !== true) return false;
  if (matchStarted !== true || awaitingStart === true) return false;
  if (phase !== PHASE.IDLE && phase !== PHASE.AIMING) return false;
  const gap = Number(now) - Number(lastAt);
  return !Number(lastAt) || gap >= (Number(intervalMs) || HOST_CLOCK_MS);
}

/** 판 스냅샷은 호스트→손님만. launch/camp는 양쪽. */
export function shouldAcceptMatchBoard({
  isHost = null,
  senderIsHost = null,
  event = '',
} = {}) {
  if (isHost == null || senderIsHost == null) return true;
  if (event === 'launch' || event === 'camp' || event === 'gameOver') return true;
  if (event === 'start' || event === 'turnEnd' || event === 'timer') {
    return isHost !== true && senderIsHost === true;
  }
  return true;
}

/** 손님 홀드만 샷을 통과시킨다. 호스트 재배치 일시정지는 그대로 막는다. */
export function shouldIgnoreLaunchPause({
  matchStarted = false,
  awaitingStart = false,
  isHost = false,
} = {}) {
  return matchStarted === true && awaitingStart !== true && isHost !== true;
}

/** start 적용 뒤에만 손님 일시정지를 푼다. 순서가 바뀌면 첫 샷이 잠긴다. */
export function nextMatchBoardReady({ applied = false, event = '', previous = false } = {}) {
  if (applied === true && (event === 'start' || event === 'turnEnd' || event === 'launch')) {
    return true;
  }
  return previous === true;
}

export function shouldSyncSceneAfterHostStart({
  event = '',
  boardReady = false,
  becameReady = false,
} = {}) {
  return boardReady === true && (event === 'start' || becameReady === true);
}

/** 국이 열릴 때 seq·시계 잔상을 같이 지운다. */
export function resetLiveSyncSession() {
  return {
    lastMatchSyncSeq: 0,
    matchSyncSeq: 0,
    lastMatchSyncTs: 0,
    lastLaunchAt: 0,
    lastHostStartReplayAt: 0,
    matchBoardReady: false,
    gotShooterTurnEnd: false,
    pendingHostLaunch: null,
  };
}

/** 플레이 중 풀판 pulse는 끈다. 샷·정지 스냅샷만 보낸다. */
export function shouldPulseMatchSync({
  inPvp: _inPvp = false,
  started: _started = false,
  spectating: _spectating = false,
} = {}) {
  return false;
}

/** 굴리는 중에 온 이전 샷 turnEnd는 두 번째 공격을 덮는다. */
export function shouldHoldStaleTurnEnd({
  remoteEvent = '',
  localPhase,
  lastLaunchAt = 0,
  remoteTs = 0,
} = {}) {
  if (remoteEvent !== 'turnEnd' || localPhase !== PHASE.RESOLVING) return false;
  const launchAt = Number(lastLaunchAt) || 0;
  const ts = Number(remoteTs) || 0;
  if (!launchAt || !ts) return false;
  return ts < launchAt;
}

/** 이미 조준 중이면 호스트 start 재전송이 백돌 조준을 지운다. 턴이 다르면 다시하기 시작이다. */
export function shouldIgnoreLateStartReplay({
  localPhase,
  remoteEvent = '',
  localTurn,
  remoteTurn,
  boardReady = true,
  matchStarted = false,
  awaitingStart = false,
} = {}) {
  if (remoteEvent !== 'start') return false;
  if (localPhase === PHASE.GAME_OVER) return false;
  if (awaitingStart === true && matchStarted !== true) return false;
  if (matchStarted === true && boardReady !== true) return false;
  const turnFlip = Boolean(remoteTurn && localTurn && remoteTurn !== localTurn);
  if (localPhase === PHASE.AIMING && turnFlip) return false;
  if (localPhase === PHASE.AIMING || localPhase === PHASE.RESOLVING) return true;
  if (matchStarted === true && boardReady === true) return true;
  return false;
}

/** 1국 GAME_OVER에 다시하기 start(gen++)가 오면 판을 리셋한다. */
export function shouldApplyRematchStart({
  localPhase,
  remoteEvent = '',
  remoteGen = 0,
  localGen = 0,
} = {}) {
  return remoteEvent === 'start'
    && localPhase === PHASE.GAME_OVER
    && matchSyncGen(remoteGen) > matchSyncGen(localGen);
}

export function canApplyRemoteBoard({
  localPhase,
  remotePhase,
  localTurn,
  remoteTurn,
  remoteEvent = '',
  boardReady = true,
  matchStarted = false,
  awaitingStart = false,
  lastLaunchAt = 0,
  remoteTs = 0,
} = {}) {
  if (shouldHoldEndedBoard({ localPhase, remotePhase, remoteEvent })) return false;
  if (shouldIgnoreLateStartReplay({
    localPhase, remoteEvent, localTurn, remoteTurn, boardReady, matchStarted, awaitingStart,
  })) return false;
  if (shouldHoldStaleTurnEnd({ remoteEvent, localPhase, lastLaunchAt, remoteTs })) return false;
  if (
    remoteEvent === 'turnEnd'
    || remoteEvent === 'gameOver'
    || remoteEvent === 'start'
    || remoteEvent === 'camp'
    || remoteEvent === 'timer'
  ) {
    return remoteEvent !== 'camp';
  }
  const remoteBehind = remotePhase === PHASE.AIMING || remotePhase === PHASE.IDLE;
  const turnMoved = Boolean(remoteTurn && localTurn && remoteTurn !== localTurn);
  if (localPhase === PHASE.RESOLVING && remoteBehind && !turnMoved) return false;
  if (localPhase === PHASE.AIMING && remoteBehind) {
    if (turnMoved) return true;
    return false;
  }
  return true;
}

/** 결과창(GAME_OVER)은 다시하기 IDLE/AIMING으로 덮음 금지. start는 새 국. */
export function shouldHoldEndedBoard({ localPhase, remotePhase, remoteEvent = '' } = {}) {
  if (remoteEvent === 'start') return false;
  return localPhase === PHASE.GAME_OVER
    && (remotePhase === PHASE.IDLE || remotePhase === PHASE.AIMING);
}

export function remoteStonesNeedRebuild(localStones, remoteStones) {
  if (!Array.isArray(remoteStones) || remoteStones.length === 0) return false;
  const local = Array.isArray(localStones) ? localStones : [];
  if (local.length !== remoteStones.length) return true;
  return remoteStones.some((data, index) => {
    const stone = findRemoteStone(local, data, index);
    if (!stone) return true;
    if (data.color && stone.color && data.color !== stone.color) return true;
    return false;
  });
}

export function ownCampFacesSeat(myColor, stones = [], midY = 360) {
  const mine = (Array.isArray(stones) ? stones : [])
    .filter((stone) => stone?.color === myColor)
    .map((stone) => Number(stone.y ?? stone.position?.y))
    .filter(Number.isFinite);
  if (!mine.length) return false;
  const avg = mine.reduce((sum, y) => sum + y, 0) / mine.length;
  return myColor === 'white' ? avg < midY : avg > midY;
}

export function isStaleEndedMatchSync({
  awaitingStart,
  started,
  remotePhase,
  remoteWinner,
} = {}) {
  return awaitingStart === true
    && started !== true
    && (remotePhase === PHASE.GAME_OVER || Boolean(remoteWinner));
}

export function shouldFollowRemoteStart({
  awaitingStart,
  started,
  remoteStarted,
  mode,
  remotePhase,
  remoteWinner,
} = {}) {
  if (isStaleEndedMatchSync({
    awaitingStart,
    started,
    remotePhase,
    remoteWinner,
  })) return false;
  return mode === 'pvp'
    && awaitingStart === true
    && started !== true
    && remoteStarted === true;
}

/** applyIncomingMatchSync와 같은 분기. 테스트가 main.js를 우회하지 않게 한다. */
export function incomingMatchSyncAction(payload, ctx = {}) {
  if (!shouldApplyMatchSync(payload, ctx)) return 'drop-gate';
  if (isStaleEndedMatchSync({
    awaitingStart: ctx.awaitingStart,
    started: ctx.matchStarted,
    remotePhase: payload?.phase,
    remoteWinner: payload?.winner,
  })) return 'drop-stale-end';
  if (shouldApplyRematchStart({
    localPhase: ctx.localPhase,
    remoteEvent: payload?.event,
    remoteGen: payload?.matchGen,
    localGen: ctx.matchGen,
  })) return 'rematch-start';
  if (payload?.event === 'camp') return 'camp';
  if (isLaunchSync(payload)) {
    if (ctx.spectating) return 'drop-launch-wait';
    if (ctx.awaitingStart === true) {
      return payload?.started === true ? 'open-launch' : 'buffer-launch';
    }
    return 'launch';
  }
  if (!shouldAcceptMatchBoard({
    isHost: ctx.isHost,
    senderIsHost: ctx.senderIsHost,
    event: payload?.event || '',
  })) return 'drop-authority';
  if (ctx.spectating !== true && shouldIgnoreLateStartReplay({
    localPhase: ctx.localPhase,
    remoteEvent: payload?.event,
    localTurn: ctx.localTurn,
    remoteTurn: payload?.currentTurn,
    boardReady: ctx.boardReady,
    matchStarted: ctx.matchStarted,
    awaitingStart: ctx.awaitingStart,
  })) return 'drop-start-replay';
  if (ctx.spectating !== true && !canApplyRemoteBoard({
    localPhase: ctx.localPhase,
    remotePhase: payload?.phase,
    localTurn: ctx.localTurn,
    remoteTurn: payload?.currentTurn,
    remoteEvent: payload?.event,
    boardReady: ctx.boardReady,
    matchStarted: ctx.matchStarted,
    awaitingStart: ctx.awaitingStart,
    lastLaunchAt: ctx.lastLaunchAt,
    remoteTs: payload?.timestamp,
  })) return 'drop-board';
  return 'board';
}
