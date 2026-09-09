/**
 * 대기실에서 고른 모드의 선공·시작 권한.
 * 1:1은 방 시드 동전으로 선공을 정하며, 선공만 시작할 수 있다.
 */

import { parseAcorn, SESSION_ACORNS } from './AcornPolicy.js';
import { normalizePvpRoomId, tossFirstPlayerId } from './RoomState.js';

export const ACORN_KEY = 'dotori-alkkagi-acorns';
export const DEFAULT_ACORNS = SESSION_ACORNS;

export const PVP_START_HINT = '호스트(흑)가 먼저 시작합니다. 선공이 시작 버튼을 누릅니다.';
export const PVP_WAIT_HINT = '상대 게이머가 들어올 때까지 대기합니다.';

export function uniquePlayerIds(players) {
  const ids = new Set();
  for (const player of Array.isArray(players) ? players : []) {
    const id = player?.userId ?? player?.id;
    if (id) ids.add(id);
  }
  return ids;
}

export function hasPvpOpponent(players) {
  return uniquePlayerIds(players).size >= 2;
}

export function matchPlayersFromPresence(users, {
  myId,
  myAcorns = DEFAULT_ACORNS,
  mode,
  roomId,
} = {}) {
  const mine = { userId: myId, acorns: Number.isFinite(Number(myAcorns)) ? Number(myAcorns) : DEFAULT_ACORNS };
  const others = (Array.isArray(users) ? users : [])
    .filter((user) => (user?.userId ?? user?.id) && (user.userId ?? user.id) !== myId)
    .filter((user) => user.status === 'playing' && (!mode || user.mode === mode))
    .filter((user) => !roomId || user.roomId === roomId)
    .map((user) => ({
      userId: user.userId ?? user.id,
      acorns: Number.isFinite(Number(user.acorns)) ? Number(user.acorns) : DEFAULT_ACORNS,
    }));
  return mine.userId ? [mine, ...others] : others;
}

/** 방 상태에 적힌 도토리가 Presence보다 우선한다. 상대가 목록에서 빠져도 선공을 유지한다. */
export function overlayRoomAcorns(players, room, { myId, myAcorns } = {}) {
  const byId = new Map();
  for (const player of Array.isArray(players) ? players : []) {
    const id = String(player?.userId ?? player?.id ?? '');
    if (!id) continue;
    byId.set(id, { userId: id, acorns: acornOf(player) });
  }
  const mine = String(myId || '');
  if (mine) {
    const row = byId.get(mine) || { userId: mine, acorns: DEFAULT_ACORNS };
    if (Number.isFinite(Number(myAcorns))) row.acorns = Math.floor(Number(myAcorns));
    byId.set(mine, row);
  }
  if (room?.hostId) {
    const id = String(room.hostId);
    const row = byId.get(id) || { userId: id, acorns: DEFAULT_ACORNS };
    if (room.hostAcorns != null && id !== mine) row.acorns = parseAcorn(room.hostAcorns);
    byId.set(id, row);
  }
  if (room?.guestId) {
    const id = String(room.guestId);
    const row = byId.get(id) || { userId: id, acorns: DEFAULT_ACORNS };
    if (room.guestAcorns != null && id !== mine) row.acorns = parseAcorn(room.guestAcorns);
    byId.set(id, row);
  }
  return Array.from(byId.values());
}

export function acornOf(player) {
  return parseAcorn(player?.acorns, DEFAULT_ACORNS);
}

export function readAcornCount(_storage, fallback = DEFAULT_ACORNS) {
  return parseAcorn(fallback, DEFAULT_ACORNS);
}

export function firstPlayerId(players, room, extras = {}) {
  if (extras.mode === 'solo') {
    return String(room?.hostId || extras.userId || '')
      || [...uniquePlayerIds(players)][0]
      || null;
  }
  const host = tossFirstPlayerId(room);
  if (host) return host;
  const ids = [...uniquePlayerIds(players)];
  if (ids.length < 2) return null;
  return tossFirstPlayerId({ hostId: ids[0], guestId: ids[1] }) || ids[0];
}

/** 1인·설정 AI는 guestId가 없다. applyRoomStart는 guest 없이 started를 켜지 못한다. */
export function usesPeerStart(mode) {
  return mode === 'pvp';
}

/** 1인·설정 AI는 시작 클릭이 곧 국 시작이다. 상대 camp를 기다리지 않는다. */
export function shouldStartWithoutPeer(mode) {
  return usesPeerStart(mode) !== true;
}

/** 결과판에서 다시 열 때 1인·AI를 1:1로 바꾸지 않는다. */
export function startResetMode(mode) {
  if (mode === 'solo') return 'solo';
  if (mode === 'pvp') return 'pvp';
  if (mode === 'spectate') return 'spectate';
  return 'ai';
}

export function tossCoinFace(room) {
  return tossFirstPlayerId(room) ? 'host' : '';
}

export function tossCoinHint(room) {
  return tossFirstPlayerId(room) ? '호스트(흑) 선공' : '';
}

export function canStartMatch({ mode, userId, players, room } = {}) {
  if (mode === 'solo' || mode === 'ai') return true;
  if (mode !== 'pvp') return false;
  const mine = userId;
  if (!mine) return false;
  const list = Array.isArray(players) ? players : [];
  const seat = list.some((p) => (p.userId ?? p.id) === mine)
    ? list
    : [{ userId: mine, acorns: DEFAULT_ACORNS }, ...list];
  if (!hasPvpOpponent(seat)) return false;
  const lead = firstPlayerId(seat, room);
  if (!lead) return false;
  return lead === mine;
}

/** 1인·1:1 모두 호스트(흑) 선공. */
export function firstStoneColor({ mode, players, room, userId } = {}) {
  if (mode === 'solo') return 'black';
  const lead = firstPlayerId(players, room, { mode, userId });
  if (!lead || !room?.hostId) return 'black';
  return String(lead) === String(room.hostId) ? 'black' : 'white';
}

export const HOST_START_REPLAY_MS = 800;

/** 손님이 시작을 못 따라가면 호스트가 현재 판을 start로 다시 보낸다. */
export function shouldReplayHostStart({
  isHost = false,
  matchStarted = false,
  guestStarted = false,
  hasOpponent = false,
  lastReplayAt = 0,
  now = 0,
  minIntervalMs = HOST_START_REPLAY_MS,
  localPhase = '',
  hasLaunched = false,
} = {}) {
  if (isHost !== true || matchStarted !== true || hasOpponent !== true) return false;
  if (guestStarted === true) return false;
  if (hasLaunched === true) return false;
  if (
    localPhase === 'resolving'
    || localPhase === 'aiming'
    || localPhase === 'gameOver'
  ) return false;
  const gap = Number(now) - Number(lastReplayAt);
  return !Number(lastReplayAt) || gap >= (Number(minIntervalMs) || HOST_START_REPLAY_MS);
}

/** 시작 게이트에 남았거나 판을 못 받은 손님은 rAF가 멈춰도 다시 묻는다. */
export function shouldPollGuestStart({
  awaitingStart = false,
  inPvp = false,
  spectating = false,
  boardReady = true,
  isHost = false,
  matchStarted = false,
  roomStarted = false,
} = {}) {
  if (inPvp !== true || spectating === true) return false;
  if (isHost === true) return false;
  if (matchStarted === true || roomStarted === true) return false;
  if (awaitingStart === true) return true;
  return boardReady !== true;
}

/** 방 started가 먼저 켜져도 Presence는 그걸 올려야 후공이 따라온다. */
export function presenceStartedFlag({ matchStarted = false, roomStarted = false } = {}) {
  return matchStarted === true || roomStarted === true;
}

export function presenceMatchGen(user) {
  const n = Number(user?.matchGen);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 같은 1:1 방에서 상대가 이미 시작했는지. matchGen이 있으면 그 국만 본다. */
export function isPeerMatchStarted(users, { myId, roomId, matchGen } = {}) {
  const rid = normalizePvpRoomId(roomId) || String(roomId || '').trim();
  const needGen = matchGen == null ? null : presenceMatchGen({ matchGen });
  return (Array.isArray(users) ? users : []).some((user) => {
    const id = user?.userId ?? user?.id;
    if (!id || id === myId) return false;
    if (user.status !== 'playing') return false;
    if (rid) {
      const uidRoom = normalizePvpRoomId(user.roomId) || String(user.roomId || '').trim();
      if (uidRoom !== rid) return false;
    }
    if (user.started !== true) return false;
    if (needGen != null && presenceMatchGen(user) !== needGen) return false;
    return true;
  });
}

/** 손님이 이 국의 호스트 판을 실제로 받았는지. started만으로는 1국 leftover다. */
export function isPeerBoardReady(users, { myId, roomId, matchGen = 0 } = {}) {
  const rid = normalizePvpRoomId(roomId) || String(roomId || '').trim();
  const needGen = presenceMatchGen({ matchGen });
  return (Array.isArray(users) ? users : []).some((user) => {
    const id = user?.userId ?? user?.id;
    if (!id || id === myId) return false;
    if (user.status !== 'playing') return false;
    if (rid) {
      const uidRoom = normalizePvpRoomId(user.roomId) || String(user.roomId || '').trim();
      if (uidRoom !== rid) return false;
    }
    return user.started === true
      && user.boardReady === true
      && presenceMatchGen(user) === needGen;
  });
}

/** 호스트가 이미 시작을 눌러 방만 started인 상태. 자기 신호를 상대 시작으로 보지 않는다. */
export function isHostStartPending({
  isHost = false,
  awaitingStart = false,
  matchStarted = false,
  roomStarted = false,
} = {}) {
  return isHost === true
    && awaitingStart === true
    && matchStarted !== true
    && roomStarted === true;
}

/** 다시하기 대기(gen이 올랐고 방은 아직 시작 전)는 1국 Presence started를 따르지 않는다. */
export function isRematchWait({
  matchGen = 0,
  roomStarted = false,
  matchStarted = false,
} = {}) {
  const gen = Number(matchGen);
  return Number.isFinite(gen) && gen > 0
    && roomStarted !== true
    && matchStarted !== true;
}

export function shouldFollowPeerStart({
  awaitingStart,
  started,
  peerStarted,
  mode,
  isHost = false,
  roomStarted = false,
  rematchWait = false,
} = {}) {
  if (isHostStartPending({
    isHost,
    awaitingStart,
    matchStarted: started,
    roomStarted,
  })) return false;
  if (rematchWait === true && roomStarted !== true) return false;
  return mode === 'pvp'
    && awaitingStart === true
    && started !== true
    && peerStarted === true;
}

/** 후공은 방 started를 받으면 시작 대기를 닫는다. start 판은 그다음 spectator_update다. */
export function shouldGuestFollowHostStart({
  isHost = false,
  awaitingStart = false,
  matchStarted = false,
  roomStarted = false,
  mode,
} = {}) {
  return shouldFollowPeerStart({
    awaitingStart,
    started: matchStarted,
    peerStarted: roomStarted,
    mode,
    isHost,
    roomStarted,
  }) && isHost !== true;
}

/** camp 대기 타이머가 있으면 매 프레임 리셋하지 않는다. */
export function shouldArmCampWait(timerOn = false) {
  return timerOn !== true;
}

/** 시작된 대국은 상대 Presence가 잠깐 빠져도 시작 대기로 되돌리지 않는다. 1인·AI는 상대 없음으로 게이트를 다시 열지 않는다. */
export function shouldHoldPvpStartGate({ started, hasOpponent, mode } = {}) {
  if (mode != null && usesPeerStart(mode) !== true) return false;
  return started !== true && hasOpponent !== true;
}
