/**
 * 대기실에서 고른 모드의 선공·시작 권한.
 * 1:1은 도토리가 적은 쪽이 선공이며, 선공만 시작할 수 있다.
 */

import { parseAcorn, SESSION_ACORNS } from './AcornPolicy.js';

export const ACORN_KEY = 'dotori-alkkagi-acorns';
export const DEFAULT_ACORNS = SESSION_ACORNS;

export const PVP_START_HINT = '도토리가 적은 사람이 선공입니다. 선공이 시작 버튼을 눌러야 게임이 시작됩니다.';
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

export function acornOf(player) {
  return parseAcorn(player?.acorns, DEFAULT_ACORNS);
}

export function readAcornCount(_storage, fallback = DEFAULT_ACORNS) {
  return parseAcorn(fallback, DEFAULT_ACORNS);
}

export function firstPlayerId(players) {
  const list = (Array.isArray(players) ? players : [])
    .map((p) => ({
      userId: p?.userId ?? p?.id ?? '',
      acorns: acornOf(p),
    }))
    .filter((p) => p.userId);
  if (!list.length) return null;
  list.sort((a, b) => {
    const ac = a.acorns - b.acorns;
    if (ac !== 0) return ac;
    return String(a.userId).localeCompare(String(b.userId));
  });
  return list[0].userId;
}

export function canStartMatch({ mode, userId, players } = {}) {
  if (mode === 'solo' || mode === 'ai') return true;
  if (mode !== 'pvp') return false;
  const mine = userId;
  if (!mine) return false;
  const list = Array.isArray(players) ? players : [];
  const seat = list.some((p) => (p.userId ?? p.id) === mine)
    ? list
    : [{ userId: mine, acorns: DEFAULT_ACORNS }, ...list];
  if (!hasPvpOpponent(seat)) return false;
  return firstPlayerId(seat) === mine;
}
