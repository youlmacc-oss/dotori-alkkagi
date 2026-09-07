/**
 * 대기실 1:1 시선 유도 · 가이드선 선택 · 초대 링크 입장.
 */

import { PRESENCE_STATUS, canJoinPvpRoom, isPlayableLobbyMode, roomsFromPresence } from './LobbyRooms.js';
import { canInviteLobbyAi, isLobbyAiUser } from './LobbyAi.js';
import { hasPvpOpponent, matchPlayersFromPresence } from './MatchStart.js';
import {
  NICKNAME_MAX,
  NICKNAME_STORAGE_KEY,
  readStoredNickname,
  uniqueLobbyNickname,
  writeStoredNickname,
} from './Nickname.js';

/**
 * 1:1 공개 진입. 배포·개발 모두 기본 연다.
 * VITE_PVP_PUBLIC=0 으로만 숨길 수 있다.
 */
export function readPvpPublicEnabled(env = import.meta.env) {
  const raw = String(env?.VITE_PVP_PUBLIC ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  return true;
}

export const PVP_PUBLIC_ENABLED = readPvpPublicEnabled();

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

/** 초대 payload만으로 대기 1:1 방을 만든다. Presence가 늦어도 수락 입장에 쓴다. */
export function roomFromInvite(invite) {
  const roomId = String(invite?.roomId || '').trim();
  const hostId = String(invite?.hostId || '').trim()
    || (roomId.startsWith('room_') ? roomId.slice(5) : '');
  if (!roomId || !hostId) return null;
  const started = invite?.started === true;
  return {
    id: roomId,
    mode: 'pvp',
    status: started ? 'playing' : 'waiting',
    started,
    hostId,
    hostName: String(invite?.hostName || '').trim(),
    players: [{
      userId: hostId,
      nickname: String(invite?.hostName || '').trim(),
      mode: 'pvp',
      status: 'playing',
      roomId,
      started,
    }],
  };
}

export function pickJoinablePvp(candidates, userId) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(Boolean);
  return list.find((room) => evaluateInviteJoin(room, userId).ok) || list[0] || null;
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
  const started = host.started === true;
  return {
    id,
    mode: 'pvp',
    status: started ? 'playing' : 'waiting',
    started,
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

/** 수락으로 들어가는 방 id. joining 중에는 내 방으로 덮지 않는다. */
export function joinedMatchRoomId({ joiningRoomId, joining, myId } = {}) {
  const join = String(joiningRoomId || '').trim();
  if (join) return join;
  if (joining) return '';
  return myId ? `room_${myId}` : '';
}

/** 같은 방에 상대가 붙으면 초대 시트는 바로 접는다. */
export function shouldKeepInviteShare({
  mode,
  inRoom,
  started,
  isHost,
  users,
  myId,
  roomId,
  myAcorns,
} = {}) {
  return canShareInvite({
    mode,
    inRoom,
    started,
    isHost,
    hasOpponent: hasPvpOpponent(matchPlayersFromPresence(users, {
      myId,
      myAcorns,
      mode,
      roomId,
    })),
  });
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
  spectating,
  target,
} = {}) {
  const id = target?.userId ?? target?.id;
  if (!id || !isIdleLobbyUser(target)) return false;
  if (isLobbyAiUser(target)) {
    return canInviteLobbyAi({ started, hasOpponent, spectating });
  }
  return canShareInvite({ mode, inRoom, started, isHost, hasOpponent });
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

export const INVITE_ACCEPT_RETRY_MS = 200;

/** 수락 직후 방 목록이 비어 있으면 Presence를 한 번 다시 보고 붙는다. */
export async function attemptInviteJoin({
  roomId,
  join,
  refresh,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  retryMs = INVITE_ACCEPT_RETRY_MS,
} = {}) {
  const id = String(roomId || '').trim();
  if (!id || typeof join !== 'function') return { ok: false, joined: false };
  if (join(id)) return { ok: true, joined: true };
  refresh?.();
  await wait(retryMs);
  if (join(id)) return { ok: true, joined: true };
  return { ok: false, joined: false };
}

export function evaluateLobbyInvite(payload, myId) {
  const invite = buildLobbyInvite(payload || {});
  if (isInviteReply(payload)) {
    return { ok: false, invite, hint: '', action: payload.action };
  }
  if (!invite.roomId || !invite.hostId || !invite.targetId) {
    return { ok: false, invite, hint: INVITE_ROOM_GONE_HINT };
  }
  if (String(myId || '') !== invite.targetId) {
    return { ok: false, invite, hint: '' };
  }
  return { ok: true, invite, hint: '' };
}

export const INVITE_ACTION_DECLINE = 'decline';
export const INVITE_ACTION_CANCEL = 'cancel';
export const INVITE_ACTION_ACCEPT = 'accept';
export const INVITE_ACTION_HELLO = 'hello';
export const INVITE_ACTION_ACK = 'ack';
export const HELLO_RETRY_MS = 1500;
export const HELLO_RETRY_MAX = 2;

export function isInviteReply(payload) {
  const action = String(payload?.action || '');
  return action === INVITE_ACTION_DECLINE
    || action === INVITE_ACTION_CANCEL
    || action === INVITE_ACTION_ACCEPT
    || action === INVITE_ACTION_HELLO
    || action === INVITE_ACTION_ACK;
}

export function buildInviteReply(invite, action, extras = {}) {
  const guestName = String(extras.guestName || invite?.guestName || '').trim();
  return {
    ...buildLobbyInvite(invite || {}),
    action: String(action || ''),
    ...(guestName ? { guestName } : {}),
  };
}

export function shouldApplyInviteDecline(payload, { myId, sentTargetId } = {}) {
  return payload?.action === INVITE_ACTION_DECLINE
    && Boolean(myId)
    && String(payload.hostId) === String(myId)
    && (!sentTargetId || String(payload.targetId) === String(sentTargetId));
}

export function shouldApplyInviteAccept(payload, {
  myId,
  sentTargetId,
  roomId,
  inRoom,
  guestId,
} = {}) {
  const action = String(payload?.action || '');
  if (
    (action !== INVITE_ACTION_ACCEPT && action !== INVITE_ACTION_HELLO)
    || !myId
  ) return false;
  if (String(payload.hostId) !== String(myId)) return false;
  if (inRoom === false) return false;
  if (roomId && payload.roomId && String(payload.roomId) !== String(roomId)) return false;
  const incomingGuest = String(payload.targetId || payload.guestId || '').trim();
  if (!incomingGuest || !payload.roomId) return false;
  const seated = String(guestId || '').trim();
  if (seated && seated !== incomingGuest) return false;
  if (
    sentTargetId
    && String(payload.targetId || incomingGuest) !== String(sentTargetId)
    && seated
  ) return false;
  return true;
}

export function buildRoomHello(invite, extras = {}) {
  const guestId = String(extras.guestId || extras.targetId || invite?.targetId || '').trim();
  return {
    ...buildInviteReply(invite, INVITE_ACTION_HELLO, extras),
    action: INVITE_ACTION_HELLO,
    guestId,
    targetId: guestId || String(invite?.targetId || ''),
    seq: 0,
  };
}

export function buildRoomAck(state, extras = {}) {
  const guestId = String(extras.guestId || state?.guestId || '').trim();
  return {
    roomId: String(state?.roomId || extras.roomId || '').trim(),
    hostId: String(state?.hostId || extras.hostId || '').trim(),
    hostName: String(extras.hostName || state?.hostName || '').trim(),
    targetId: guestId,
    guestId,
    guestName: String(extras.guestName || state?.guestName || '').trim(),
    action: INVITE_ACTION_ACK,
    seq: Number(extras.seq) >= 0 ? Number(extras.seq) : 0,
  };
}

export function shouldApplyRoomAck(payload, { myId, roomId } = {}) {
  if (payload?.action !== INVITE_ACTION_ACK || !myId) return false;
  if (roomId && payload.roomId && String(payload.roomId) !== String(roomId)) return false;
  const guest = String(payload.guestId || payload.targetId || '');
  return guest === String(myId) && Boolean(payload.roomId && payload.hostId);
}

export function shouldKeepHostInviteSheet({
  room,
  myId,
  inRoom,
  mode,
  hasOpponent,
} = {}) {
  return mode === 'pvp'
    && Boolean(inRoom)
    && Boolean(room?.roomId)
    && room.hostId === myId
    && room.started !== true
    && !room.guestId
    && hasOpponent !== true;
}

export function shouldDismissInviteModal(openInvite, payload, myId) {
  if (!openInvite || !payload) return false;
  if (payload.action !== INVITE_ACTION_CANCEL) return false;
  if (String(payload.hostId) !== String(openInvite.hostId)) return false;
  return String(payload.targetId) === String(myId || openInvite.targetId);
}

export function guestClaimHeld(state, myId) {
  return Boolean(state?.guestId && myId && String(state.guestId) === String(myId));
}

export function incomingRejectsMyGuestSeat(current, incoming, myId) {
  if (!incoming?.roomId || !incoming?.guestId || !myId) return false;
  if (String(incoming.hostId) === String(myId)) return false;
  if (String(incoming.guestId) === String(myId)) return false;
  if (current?.roomId && String(current.roomId) !== String(incoming.roomId)) return false;
  return String(current?.guestId) === String(myId)
    || Boolean(current?.roomId && String(current.roomId) === String(incoming.roomId));
}

/** Presence에 올릴 초대. selfPresence 안에서 matchPlayers를 부르면 순환한다. */
export function sentInviteFields({
  inRoom,
  started,
  mode,
  sent,
  hasOpponent,
} = {}) {
  if (!inRoom || started || mode !== 'pvp' || hasOpponent) {
    return { inviteTargetId: null, inviteAt: null };
  }
  return sent || { inviteTargetId: null, inviteAt: null };
}

/** 대기 중인 방만 Presence를 자주 올린다. 시작된 판은 track 폭풍으로 방송이 끊긴다. */
export function shouldRepublishOpenRoom({ inRoom, mode, started } = {}) {
  return Boolean(inRoom && isPlayableLobbyMode(mode) && started !== true);
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
