/**
 * 대기실 닉네임: 기본은 접속 중 도토리 최후 번호 다음, 임의 변경은 5글자 이내·중복 시 다른 이름.
 */

import { LOBBY_CAP } from './LobbyRooms.js';

export const NICKNAME_MAX = 5;
export const NICKNAME_PREFIX = '도토리';
export const NICKNAME_HINT = '닉네임은 5글자 이내';
export const NICKNAME_TAKEN_HINT = '이미 있는 닉이라 다른 이름으로 저장했습니다';
export const NICKNAME_LOCKED_HINT = '대전·관람 중에는 닉네임을 바꿀 수 없습니다';
export const MY_NICK_LABEL = '내닉네임';

export function canChangeNickname(state = {}) {
  if (typeof state === 'boolean') return state !== true;
  return !state.inMatch && !state.spectating;
}
export const LOCATION_GUIDE = '접속된 게이머의 위치는 항상 공개됩니다';
export const NICKNAME_STORAGE_KEY = 'dotori-alkkagi-nickname';

export function defaultNickname(seat) {
  const n = Number(seat);
  return `${NICKNAME_PREFIX}${n >= 1 ? n : 1}`;
}

export function parseDotoriNumber(name) {
  const match = String(name ?? '').match(/^도토리(\d+)$/);
  const n = Number(match?.[1]);
  return n >= 1 ? n : null;
}

export function parseDefaultSeat(name) {
  const n = parseDotoriNumber(name);
  return n >= 1 && n <= LOBBY_CAP ? n : null;
}

export function isCustomNickname(name) {
  const text = String(name ?? '').trim();
  return Boolean(text) && parseDotoriNumber(text) == null;
}

export function nextDotoriNumber(users) {
  let max = 0;
  for (const user of users || []) {
    const n = parseDotoriNumber(user?.nickname);
    if (n > max) max = n;
  }
  return max + 1;
}

export function shouldKeepAssignedNickname({
  assigned = false,
  nickname = '',
  others = [],
  myId = '',
  myJoinedAt = 0,
} = {}) {
  const name = String(nickname || '').trim();
  if (!assigned || !name) return false;
  const conflicts = (Array.isArray(others) ? others : []).filter((user) => {
    const id = user?.userId ?? user?.id;
    if (myId && id === myId) return false;
    return String(user?.nickname ?? '').trim() === name;
  });
  if (!conflicts.length) return true;
  const mineAt = Number(myJoinedAt) || 0;
  const mineId = String(myId || '');
  return conflicts.every((user) => {
    const theirAt = Number(user.joinedAt) || 0;
    const theirId = String(user.userId ?? user.id ?? '');
    if (mineAt && theirAt) {
      if (mineAt < theirAt) return true;
      if (mineAt > theirAt) return false;
    } else if (mineAt && !theirAt) return true;
    else if (!mineAt && theirAt) return false;
    return mineId && theirId ? mineId <= theirId : false;
  });
}

export function takenNicknames(users, myId) {
  const taken = new Set();
  for (const user of users || []) {
    const id = user?.userId ?? user?.id;
    if (myId && id === myId) continue;
    const nick = String(user?.nickname ?? '').trim();
    if (nick) taken.add(nick);
  }
  return taken;
}

export function uniqueLobbyNickname(raw, users = [], fallback = defaultNickname(1), myId) {
  const taken = takenNicknames(users, myId);
  const first = sanitizeNickname(raw, fallback);
  const dotori = parseDotoriNumber(first.nickname);

  const nextUnusedDotori = (renamed) => {
    let n = nextDotoriNumber(users);
    let name = defaultNickname(n);
    while (taken.has(name)) {
      n += 1;
      name = defaultNickname(n);
    }
    return {
      ok: true,
      nickname: name,
      custom: false,
      hint: renamed ? NICKNAME_TAKEN_HINT : first.hint,
      renamed,
    };
  };

  if (dotori != null && (!first.custom || taken.has(first.nickname))) {
    return nextUnusedDotori(Boolean(first.custom && taken.has(first.nickname)));
  }
  if (!taken.has(first.nickname)) return { ...first, renamed: false };

  const base = first.nickname;
  const baseLen = Array.from(base).length;
  for (let i = 2; i <= 99; i += 1) {
    const suffix = String(i);
    if (baseLen + suffix.length > NICKNAME_MAX) break;
    const next = `${base}${suffix}`;
    if (!taken.has(next)) {
      return {
        ok: true,
        nickname: next,
        custom: true,
        hint: NICKNAME_TAKEN_HINT,
        renamed: true,
      };
    }
  }
  return nextUnusedDotori(true);
}

export function nextSeat(users, cap = LOBBY_CAP) {
  const taken = new Set();
  for (const user of users || []) {
    const seat = Number(user.seat);
    if (seat >= 1 && seat <= cap) taken.add(seat);
    else {
      const parsed = parseDefaultSeat(user.nickname);
      if (parsed) taken.add(parsed);
    }
  }
  for (let i = 1; i <= cap; i += 1) {
    if (!taken.has(i)) return i;
  }
  return null;
}

export function countNicknameChars(text) {
  return Array.from(String(text ?? '')).length;
}

export function sanitizeNickname(raw, fallback) {
  const trimmed = String(raw ?? '').replace(/\s+/g, '').trim();
  if (!trimmed) {
    return { ok: true, nickname: fallback, custom: false, hint: NICKNAME_HINT };
  }
  const chars = Array.from(trimmed);
  const clipped = chars.length > NICKNAME_MAX;
  return {
    ok: !clipped,
    nickname: chars.slice(0, NICKNAME_MAX).join(''),
    custom: true,
    hint: NICKNAME_HINT,
  };
}

export function readStoredNickname(storage = globalThis.sessionStorage) {
  try {
    return storage?.getItem?.(NICKNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearPermanentNickname(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(NICKNAME_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function playerSeat(user, cap = LOBBY_CAP) {
  const seat = Number(user?.seat);
  if (seat >= 1 && seat <= cap) return seat;
  return parseDefaultSeat(user?.nickname);
}

export function locationLabel(seat) {
  const n = Number(seat);
  return n >= 1 ? `위치 ${n}` : '위치 —';
}

export const FUN_AI_NAMES = Object.freeze([
  '도토봇', '알까킹', '튕김이', '꿀밤이', '깍두기',
  '솔방울', '밤톨이', '쿵덕이', '싹둑이', '통통이',
]);

export function funAiNickname(seed) {
  const text = String(seed ?? 'ai');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % FUN_AI_NAMES.length;
  return FUN_AI_NAMES[index];
}

export function matchSeatNames(input = {}) {
  const mine = input.myName || defaultNickname(1);
  const mode = input.mode;
  if (mode === 'solo') return { black: mine, white: mine };
  if (mode === 'ai') return { black: mine, white: input.aiName || funAiNickname(input.seed) };
  return { black: mine, white: input.opponentName || '상대' };
}

export function sortBySeat(users, cap = LOBBY_CAP) {
  return [...(users || [])].sort((a, b) => {
    const left = playerSeat(a, cap) ?? (cap + 1);
    const right = playerSeat(b, cap) ?? (cap + 1);
    return left - right;
  });
}

export function writeStoredNickname(value, storage = globalThis.sessionStorage) {
  try {
    if (!value) storage?.removeItem?.(NICKNAME_STORAGE_KEY);
    else storage?.setItem?.(NICKNAME_STORAGE_KEY, value);
  } catch {
    /* private mode */
  }
  return value;
}
