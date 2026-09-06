/**
 * 대기실 1:1 시선 유도 · 가이드선 선택 · 초대 링크 입장.
 */

import { canJoinPvpRoom } from './LobbyRooms.js';
import {
  NICKNAME_MAX,
  NICKNAME_STORAGE_KEY,
  readStoredNickname,
  uniqueLobbyNickname,
  writeStoredNickname,
} from './Nickname.js';

export const PVP_ROOM_HINT = '대국방을 선택하면 게임이 시작됩니다';
export const PVP_GUIDE_ASK = '가이드선을 사용하시겠습니까?';
export const INVITE_SHARE_TITLE = '도토리 알까기 대전 초대';
export const INVITE_SHARE_TEXT = '도토리 알까기 한판 승부! 링크를 눌러 입장하세요.';
export const INVITE_COPIED_HINT = '초대 링크가 복사되었습니다! 친구에게 공유해 보세요.';
export const INVITE_ROOM_GONE_HINT = '이미 종료되었거나 정원이 찬 방입니다.';
export const INVITE_NICK_FALLBACK = '게스트';
export const INVITE_NICK_STORAGE_KEY = 'alkagi_nickname';
export const INVITE_NICK_PLACEHOLDER = '닉네임 (5글자 이내)';
export const PVP_WAIT_EXPIRE_MS = 10 * 60 * 1000;
export const PVP_WAIT_EXPIRE_HINT = '10분 동안 시작되지 않아 대기실로 돌아갑니다';

export function shouldInvitePvp(userCount) {
  return Number(userCount) >= 1;
}

export function parseGuideChoice(value) {
  if (value === true || value === '1' || value === 'on' || value === '사용') return true;
  if (value === false || value === '0' || value === 'off' || value === '미사용') return false;
  return null;
}

export function readInviteRoomId(search = '') {
  const raw = String(search ?? '');
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  try {
    return String(new URLSearchParams(query).get('room') || '').trim();
  } catch {
    return '';
  }
}

export function inviteUrlFor(roomId, loc = globalThis.location) {
  const id = String(roomId || '').trim();
  const origin = loc?.origin || '';
  const pathname = loc?.pathname || '/';
  return `${origin}${pathname}?room=${encodeURIComponent(id)}`;
}

export function clearInviteQuery(win = globalThis) {
  const path = win?.location?.pathname || '/';
  try {
    win?.history?.replaceState?.({}, win?.document?.title || '', path);
  } catch {
    /* ignore */
  }
  return path;
}

export function findInviteRoom(rooms, roomId) {
  const id = String(roomId || '').trim();
  if (!id) return null;
  return (rooms || []).find((room) => room.id === id) || null;
}

export function evaluateInviteJoin(room, userId) {
  if (!room || room.mode !== 'pvp') {
    return { ok: false, hint: INVITE_ROOM_GONE_HINT };
  }
  if (canJoinPvpRoom(room, userId)) return { ok: true, room, hint: '' };
  return { ok: false, hint: INVITE_ROOM_GONE_HINT };
}

export function canShareInvite({
  mode,
  inRoom,
  started,
  isHost,
  hasOpponent,
} = {}) {
  return mode === 'pvp'
    && inRoom
    && !started
    && Boolean(isHost)
    && !hasOpponent;
}

export function roomOpenedAt(users, roomId, fallback = 0) {
  const id = String(roomId || '');
  const times = (users || [])
    .filter((user) => !id || (user.roomId || '') === id)
    .map((user) => Number(user.pvpOpenedAt))
    .filter((at) => at > 0);
  const local = Number(fallback);
  if (local > 0) times.push(local);
  return times.length ? Math.min(...times) : 0;
}

export function shouldExpirePvpWait({
  mode,
  openedAt,
  started,
  now = Date.now(),
} = {}) {
  if (mode !== 'pvp' || started) return false;
  const at = Number(openedAt);
  if (!Number.isFinite(at) || at <= 0) return false;
  return Number(now) - at >= PVP_WAIT_EXPIRE_MS;
}

export function readInvitePrefill(sessionStore, localStore = globalThis.localStorage) {
  const session = readStoredNickname(sessionStore);
  if (session) return session;
  try {
    return localStore?.getItem?.(INVITE_NICK_STORAGE_KEY)
      || localStore?.getItem?.(NICKNAME_STORAGE_KEY)
      || '';
  } catch {
    return '';
  }
}

export function persistInviteNickname(name, sessionStore, localStore = globalThis.localStorage) {
  const text = String(name || '').trim();
  writeStoredNickname(text, sessionStore);
  try {
    if (text) localStore?.setItem?.(INVITE_NICK_STORAGE_KEY, text);
    else localStore?.removeItem?.(INVITE_NICK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return text;
}

export function guestInviteNickname(raw, users = [], myId) {
  const named = uniqueLobbyNickname(raw, users, INVITE_NICK_FALLBACK, myId);
  return {
    ...named,
    nickname: named.nickname || INVITE_NICK_FALLBACK,
    max: NICKNAME_MAX,
  };
}

export async function shareOrCopyInvite(url, extras = {}) {
  const share = extras.share ?? (typeof navigator !== 'undefined' ? navigator.share?.bind(navigator) : null);
  const clipboard = extras.clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : null);
  if (typeof share === 'function') {
    await share({ title: INVITE_SHARE_TITLE, text: INVITE_SHARE_TEXT, url });
    return { ok: true, method: 'share', hint: '' };
  }
  if (clipboard?.writeText) {
    await clipboard.writeText(url);
    return { ok: true, method: 'copy', hint: INVITE_COPIED_HINT };
  }
  return { ok: false, method: null, hint: INVITE_COPIED_HINT };
}
