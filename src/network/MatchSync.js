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
  return {
    matchId: extras.roomId || extras.matchId || snapshot?.matchId || '',
    roomId: extras.roomId || extras.matchId || '',
    senderId: extras.senderId || '',
    timestamp: Number(extras.timestamp) > 0 ? Number(extras.timestamp) : Date.now(),
    started: extras.started === true,
    phase: snapshot?.phase,
    currentTurn: snapshot?.currentTurn,
    turnRemainingMs: snapshot?.timer?.remainingMs ?? snapshot?.turnRemainingMs,
    winner: snapshot?.winner ?? null,
    stones: stones.map(packStoneSync).filter(Boolean),
  };
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

export function canApplyRemoteBoard({ localPhase, remotePhase } = {}) {
  if (localPhase === PHASE.AIMING && (remotePhase === PHASE.AIMING || remotePhase === PHASE.IDLE)) {
    return false;
  }
  if (localPhase === PHASE.RESOLVING && remotePhase === PHASE.RESOLVING) {
    return false;
  }
  return true;
}

export function findRemoteStone(stones, data, index) {
  const list = Array.isArray(stones) ? stones : [];
  if (data?.id != null) {
    const found = list.find((stone) => stone.id === data.id);
    if (found) return found;
  }
  return list[index] || null;
}

export function shouldFollowRemoteStart({ awaitingStart, started, remoteStarted, mode } = {}) {
  return mode === 'pvp'
    && awaitingStart === true
    && started !== true
    && remoteStarted === true;
}
