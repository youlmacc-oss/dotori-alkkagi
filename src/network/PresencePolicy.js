/**
 * 대기실 Presence: 입장 순 좌석 · 5분 끊김 퇴장.
 */

import { LOBBY_CAP } from './LobbyRooms.js';
import { defaultNickname, isCustomNickname, nextSeat, parseDefaultSeat } from './Nickname.js';

export const PRESENCE_STALE_MS = 5 * 60 * 1000;
export const PRESENCE_HEARTBEAT_MS = 30 * 1000;
export const PRESENCE_RETRACK_GRACE_MS = 400;
export const STALE_LEAVE_HINT = '접속이 5분 이상 끊겨 대기실에서 나갔습니다';
export const KEEP_CONNECTED_NICKNAME = '도토리1';
export const SWEEP_LEAVE_HINT = '개발자 외 접속은 대기실에서 나갔습니다';
export const VIRTUAL_USER_PREFIX = 'virt_';

export function isKeptConnectedNickname(name, keep = KEEP_CONNECTED_NICKNAME) {
  return String(name ?? '').trim() === String(keep ?? '').trim();
}

export function isVirtualLobbyUser(user) {
  return String(user?.userId ?? user?.id ?? '').startsWith(VIRTUAL_USER_PREFIX);
}

export function shouldEvictConnectedUser(user, keep = KEEP_CONNECTED_NICKNAME) {
  if (!keep) return false;
  if (isVirtualLobbyUser(user)) return false;
  return !isKeptConnectedNickname(user?.nickname, keep);
}

export function keepConnectedUsers(users, keep = KEEP_CONNECTED_NICKNAME) {
  const list = Array.isArray(users) ? users : [];
  if (!keep) return list;
  return list.filter((user) => !shouldEvictConnectedUser(user, keep));
}

export { isCustomNickname };

export function nicknameForSeat(seat, stored) {
  if (isCustomNickname(stored)) return stored;
  return defaultNickname(seat);
}

export function isStalePresence(user, now = Date.now(), ttl = PRESENCE_STALE_MS) {
  const at = Number(user?.lastSeen);
  if (!Number.isFinite(at) || at <= 0) return false;
  return now - at >= ttl;
}

export function activeLobbyUsers(users, now = Date.now(), ttl = PRESENCE_STALE_MS) {
  return (Array.isArray(users) ? users : []).filter((u) => !isStalePresence(u, now, ttl));
}

export function shouldForceLobbyLeave(disconnectedAt, now = Date.now(), ttl = PRESENCE_STALE_MS) {
  const at = Number(disconnectedAt);
  if (!Number.isFinite(at) || at <= 0) return false;
  return now - at >= ttl;
}

function presenceLeaveId(user) {
  return String(user?.presenceKey || user?.userId || user?.id || '').trim();
}

function presenceLeaveAt(user) {
  return Number(user?.lastSeen || user?.joinedAt) || 0;
}

/** track() 재전송으로 옛 metas만 떠난 경우는 퇴장으로 보지 않는다. */
export function isRetrackPresenceLeave({
  key,
  leftPresences = [],
  liveUsers = [],
  hint = null,
} = {}) {
  const id = String(key || '').trim();
  if (!id) return false;
  const stillLive = (Array.isArray(liveUsers) ? liveUsers : []).some(
    (user) => presenceLeaveId(user) === id,
  );
  if (stillLive) return true;
  if (presenceLeaveId(hint) !== id) return false;
  const leftAt = Math.max(0, ...(Array.isArray(leftPresences) ? leftPresences : []).map(presenceLeaveAt));
  return presenceLeaveAt(hint) >= leftAt;
}

export function shouldConfirmPresenceLeave(opts = {}) {
  if (opts.explicitLeft) return true;
  return !isRetrackPresenceLeave(opts);
}

export function reconcileOwnSeat({
  others = [],
  mySeat = null,
  myJoinedAt = 0,
  myId = '',
  cap = LOBBY_CAP,
} = {}) {
  const live = activeLobbyUsers(others);
  const seat = Number(mySeat);
  const mineAt = Number(myJoinedAt) || 0;
  const takenByElder = live.some((user) => {
    const theirs = Number(user.seat) || parseDefaultSeat(user.nickname);
    if (theirs !== seat) return false;
    const theirAt = Number(user.joinedAt) || 0;
    if (theirAt < mineAt) return true;
    if (theirAt === mineAt && String(user.userId ?? '') < String(myId)) return true;
    return false;
  });
  if (seat >= 1 && seat <= cap && !takenByElder) return seat;
  return nextSeat(live, cap) || 1;
}
