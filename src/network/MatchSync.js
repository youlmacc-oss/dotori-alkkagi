/**
 * 1:1 대국 판 동기. 샷 이후 돌·턴을 같은 방의 상대와 관전자에게 보낸다.
 */

import { PHASE } from '../physics/GameEngine.js';

export const MATCH_SYNC_EVENT = 'spectator_update';

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
    stones: event === 'launch' ? [] : stones.map(packStoneSync).filter(Boolean),
    stoneId: launch?.stoneId ?? extras.stoneId ?? snapshot?.stoneId ?? null,
    velocity: launch?.velocity ?? extras.velocity ?? snapshot?.velocity ?? null,
    force: launch?.force ?? extras.force ?? snapshot?.force ?? null,
    power: launch?.power ?? extras.power ?? snapshot?.power ?? 0,
    color: launch?.color ?? extras.color ?? snapshot?.color ?? null,
  };
}

export function packLaunchSync(launch, extras = {}) {
  return packMatchSync({ phase: PHASE.RESOLVING, currentTurn: extras.currentTurn || launch?.color }, {
    ...extras,
    event: 'launch',
    kind: 'launch',
    launch,
    stones: [],
  });
}

export function isLaunchSync(payload) {
  return payload?.kind === 'launch' || payload?.event === 'launch';
}

export function shouldApplyMatchSync(payload, {
  myId,
  roomId,
  lastTs = 0,
  spectating = false,
  inPvp = false,
} = {}) {
  if (!payload) return false;
  if (myId && payload.senderId && String(payload.senderId) === String(myId)) return false;
  if (roomId && payload.roomId && String(payload.roomId) !== String(roomId)) return false;
  const ts = Number(payload.timestamp) || 0;
  if (ts && Number(lastTs) > 0 && ts <= Number(lastTs)) return false;
  return spectating === true || inPvp === true;
}

export function shouldPublishMatchSync({
  inPvp = false,
  isHost = false,
  force = false,
  event = '',
} = {}) {
  if (!inPvp || force !== true) return false;
  if (event === 'launch') return true;
  if (event === 'turnEnd' || event === 'gameOver' || event === 'start') return isHost === true;
  return false;
}

/** 플레이 중 풀판 pulse는 끈다. 샷·정지 스냅샷만 보낸다. */
export function shouldPulseMatchSync({
  inPvp: _inPvp = false,
  started: _started = false,
  spectating: _spectating = false,
} = {}) {
  return false;
}

export function canApplyRemoteBoard({
  localPhase,
  remotePhase,
  localTurn,
  remoteTurn,
  remoteEvent = '',
} = {}) {
  if (shouldHoldEndedBoard({ localPhase, remotePhase })) return false;
  if (remoteEvent === 'turnEnd' || remoteEvent === 'gameOver' || remoteEvent === 'start') {
    return true;
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

/** 결과창(GAME_OVER)은 다시하기 IDLE/AIMING으로 덮음 금지. */
export function shouldHoldEndedBoard({ localPhase, remotePhase } = {}) {
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

export function findRemoteStone(stones, data, index) {
  const list = Array.isArray(stones) ? stones : [];
  if (data?.id != null) {
    const found = list.find((stone) => stone.id === data.id);
    if (found) return found;
  }
  return list[index] || null;
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
