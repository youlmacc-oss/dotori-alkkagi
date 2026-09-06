/**
 * 대기실 1:1 시선 유도 · 가이드선 선택 · 초대 링크 입장.
 */

import { PRESENCE_STATUS, canJoinPvpRoom, isPlayableLobbyMode, roomsFromPresence } from './LobbyRooms.js';
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
export const KAKAO_SHARE_HINT = '카카오톡이 열리면 붙여넣어 초대 링크를 보내 주세요.';
export const INVITE_ROOM_GONE_HINT = '대전방이 종료되었습니다';
export const INVITE_NICK_FALLBACK = '게스트';
export const INVITE_NICK_STORAGE_KEY = 'alkagi_nickname';
export const INVITE_NICK_PLACEHOLDER = '닉네임 (5글자 이내)';
export const INVITE_ROOM_STORAGE_KEY = 'dotori-alkkagi-invite-room';
export const PVP_WAIT_EXPIRE_MS = 10 * 60 * 1000;
export const PVP_WAIT_EXPIRE_HINT = '10분 동안 시작되지 않아 대기실로 돌아갑니다';
export const PVP_INVITE_EVENT = 'pvp_invite';
export const LOBBY_INVITE_HINT = '대기방 친구를 초대할 수 있습니다';
export const LOBBY_INVITE_EMPTY = '지금 초대할 대기 인원이 없습니다';
export const LOBBY_INVITE_SENT = '초대를 보냈습니다';
export const LOBBY_INVITE_ACCEPT = '수락';
export const LOBBY_INVITE_DECLINE = '거절';
export const LOBBY_INVITE_BTN = '초대하기';

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

export function readStoredInviteRoom(storage = globalThis.sessionStorage) {
  try {
    return String(storage?.getItem?.(INVITE_ROOM_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function writeStoredInviteRoom(roomId, storage = globalThis.sessionStorage) {
  const id = String(roomId || '').trim();
  try {
    if (!id) storage?.removeItem?.(INVITE_ROOM_STORAGE_KEY);
    else storage?.setItem?.(INVITE_ROOM_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export function resolveInviteRoom(users, roomId) {
  const id = String(roomId || '').trim();
  if (!id) return null;
  const found = findInviteRoom(roomsFromPresence(users), id);
  if (found) return found;
  const host = (users || []).find((user) => {
    const uid = user?.userId ?? user?.id;
    const playing = !user?.status || user.status === 'playing';
    return playing && (user?.roomId === id || (uid && `room_${uid}` === id && user?.mode === 'pvp'));
  });
  if (!host || (host.mode && host.mode !== 'pvp')) return null;
  return {
    id,
    mode: 'pvp',
    status: 'waiting',
    hostId: host.userId ?? host.id,
    hostName: host.nickname,
    players: [host],
  };
}

export function evaluateInviteJoin(room, userId) {
  if (!room || room.mode !== 'pvp') {
    return { ok: false, hint: INVITE_ROOM_GONE_HINT };
  }
  if (canJoinPvpRoom(room, userId)) return { ok: true, room, hint: '' };
  return { ok: false, hint: INVITE_ROOM_GONE_HINT };
}

export function inviteMissFallback(joined = false) {
  if (joined) return { toLobby: false, hint: '' };
  return { toLobby: true, hint: INVITE_ROOM_GONE_HINT };
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

export function isIdleLobbyUser(user) {
  if (!user) return false;
  if (user.status === PRESENCE_STATUS.SPECTATING) return false;
  if (user.status === PRESENCE_STATUS.PLAYING && user.mode) return false;
  return true;
}

export function idleLobbyInvitees(users, myId) {
  return (Array.isArray(users) ? users : []).filter((user) => {
    const id = user?.userId ?? user?.id;
    return Boolean(id) && id !== myId && isIdleLobbyUser(user);
  });
}

export function canInviteLobbyUser({
  mode,
  inRoom,
  started,
  isHost,
  hasOpponent,
  target,
} = {}) {
  const id = target?.userId ?? target?.id;
  return canShareInvite({ mode, inRoom, started, isHost, hasOpponent })
    && Boolean(id)
    && isIdleLobbyUser(target);
}

export function buildLobbyInvite({
  roomId,
  hostId,
  hostName,
  targetId,
} = {}) {
  return {
    roomId: String(roomId || '').trim(),
    hostId: String(hostId || '').trim(),
    hostName: String(hostName || '').trim(),
    targetId: String(targetId || '').trim(),
  };
}

export function evaluateLobbyInvite(payload, myId) {
  const invite = buildLobbyInvite(payload || {});
  if (!invite.roomId || !invite.hostId || !invite.targetId) {
    return { ok: false, invite, hint: INVITE_ROOM_GONE_HINT };
  }
  if (String(myId || '') !== invite.targetId) {
    return { ok: false, invite, hint: '' };
  }
  return { ok: true, invite, hint: '' };
}

/** 방을 연 동안 Presence를 자주 올려 대기실이 새로고침 없이 방을 보게 한다. */
export function shouldRepublishOpenRoom({ inRoom, mode } = {}) {
  return Boolean(inRoom && isPlayableLobbyMode(mode));
}

export function presenceInvitePayload(user) {
  return buildLobbyInvite({
    roomId: user?.roomId,
    hostId: user?.userId ?? user?.id,
    hostName: user?.nickname,
    targetId: user?.inviteTargetId,
  });
}

export function shouldOpenPresenceInvite(user, myId, seenAt = 0) {
  if (user?.status !== PRESENCE_STATUS.PLAYING || user?.mode !== 'pvp' || !user?.roomId) {
    return false;
  }
  const target = String(user?.inviteTargetId || '').trim();
  if (!target || target !== String(myId || '')) return false;
  const at = Number(user.inviteAt) || 0;
  return !(at && Number(seenAt) > 0 && at <= Number(seenAt));
}

export function lobbyInviteAsk(hostName) {
  const name = String(hostName || '').trim() || '상대';
  return `${name}님이 1:1 대전에 초대했습니다`;
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

export function inviteShareMessage(url) {
  return `${INVITE_SHARE_TEXT}\n${url}`;
}

export function prefersOsShare(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /Android|iPhone|iPad/i.test(String(ua || ''));
}

export function kakaoTalkHref(url, ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const text = encodeURIComponent(inviteShareMessage(url));
  if (/Android/i.test(String(ua || ''))) {
    return `intent://send?#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.TEXT=${text};package=com.kakao.talk;end`;
  }
  return 'kakaotalk://';
}

export async function shareViaKakaoTalk(url, extras = {}) {
  const clipboard = extras.clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : null);
  const open = extras.open ?? ((href) => {
    if (typeof window !== 'undefined') window.location.href = href;
  });
  const ua = extras.ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  try {
    await clipboard?.writeText?.(inviteShareMessage(url));
  } catch {
    /* ignore */
  }
  open(kakaoTalkHref(url, ua));
  return { ok: true, method: 'kakao', hint: KAKAO_SHARE_HINT };
}

export async function shareOrCopyInvite(url, extras = {}) {
  const share = extras.share ?? (typeof navigator !== 'undefined' ? navigator.share?.bind(navigator) : null);
  const clipboard = extras.clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : null);
  if (typeof share === 'function') {
    await share({
      title: INVITE_SHARE_TITLE,
      text: inviteShareMessage(url),
      url,
    });
    return { ok: true, method: 'share', hint: '' };
  }
  if (clipboard?.writeText) {
    await clipboard.writeText(url);
    return { ok: true, method: 'copy', hint: INVITE_COPIED_HINT };
  }
  return { ok: false, method: null, hint: INVITE_COPIED_HINT };
}
