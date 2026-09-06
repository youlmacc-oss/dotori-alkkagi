/**
 * 1:1 방 권위. Presence가 아니라 이 객체 하나가 초대·입장·시작을 정한다.
 */

export const ROOM_STATE_EVENT = 'room_state';

export function createRoomState({
  roomId,
  hostId,
  hostName,
} = {}) {
  const id = String(roomId || '').trim();
  const host = String(hostId || '').trim();
  return {
    roomId: id,
    hostId: host,
    hostName: String(hostName || '').trim(),
    guestId: null,
    guestName: null,
    inviteTargetId: null,
    started: false,
    phase: 'waiting',
    matchGen: 0,
    hostAcorns: null,
    guestAcorns: null,
  };
}

export function roomMatchGen(state) {
  const n = Number(state?.matchGen);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function stampRoomAcorns(state, { myId, acorns } = {}) {
  if (!state?.roomId || !myId) return state;
  const value = Number(acorns);
  if (!Number.isFinite(value)) return state;
  const next = Math.floor(value);
  if (String(state.hostId) === String(myId)) return { ...state, hostAcorns: next };
  if (String(state.guestId) === String(myId)) return { ...state, guestAcorns: next };
  return state;
}

export function applyRoomInvite(state, targetId) {
  if (!state?.roomId || state.started || state.guestId) return state;
  const target = String(targetId || '').trim();
  if (!target) return state;
  return { ...state, inviteTargetId: target, phase: 'waiting' };
}

export function applyRoomClearInvite(state) {
  if (!state?.roomId) return state;
  return { ...state, inviteTargetId: null };
}

export function applyRoomGuest(state, { guestId, guestName } = {}) {
  if (!state?.roomId) return state;
  const guest = String(guestId || '').trim();
  if (!guest || guest === state.hostId) return state;
  if (state.guestId && state.guestId !== guest) return state;
  return {
    ...state,
    guestId: guest,
    guestName: String(guestName || state.guestName || '').trim() || null,
    inviteTargetId: null,
    phase: state.started ? 'playing' : 'ready',
  };
}

export function applyRoomStart(state) {
  if (!state?.roomId || !state.guestId) return state;
  return { ...state, started: true, inviteTargetId: null, phase: 'playing' };
}

/** 한 명이 나가면 상대를 비우고 대기로 되돌린다. */
export function applyRoomLeave(state, { leaverId } = {}) {
  if (!state?.roomId) return state;
  const who = String(leaverId || '').trim();
  if (who && who !== state.hostId && who !== state.guestId) return state;
  const leftoverId = who === state.hostId ? state.guestId : (who === state.guestId ? state.hostId : null);
  return {
    ...state,
    guestId: null,
    guestName: null,
    inviteTargetId: null,
    started: false,
    phase: 'waiting',
    matchGen: 0,
    leaverId: who || null,
    leftoverId: leftoverId || null,
  };
}

export function incomingClearsOpponent(current, incoming) {
  if (!current?.roomId || !incoming?.roomId) return false;
  if (String(current.roomId) !== String(incoming.roomId)) return false;
  if (incoming.guestId) return false;
  if (incoming.started === true) return false;
  if (incoming.phase && incoming.phase !== 'waiting') return false;
  return Boolean(current.guestId || current.started);
}

export function shouldReturnToPvpWait({
  inRoom,
  mode,
  spectating,
  hadOpponent,
  hasOpponent,
  started,
  phase,
} = {}) {
  if (started === true && phase !== 'gameOver') return false;
  return mode === 'pvp'
    && inRoom === true
    && spectating !== true
    && hadOpponent === true
    && hasOpponent !== true;
}

export function applyRoomRematch(state) {
  if (!state?.roomId || !state.guestId) return state;
  const nextGen = state.started === true
    ? roomMatchGen(state) + 1
    : Math.max(roomMatchGen(state), 1);
  return {
    ...state,
    started: false,
    phase: 'ready',
    matchGen: nextGen,
    inviteTargetId: null,
    leaverId: null,
    leftoverId: null,
  };
}

export function incomingResetsForRematch(current, incoming) {
  if (!current?.roomId || !incoming?.roomId) return false;
  if (String(current.roomId) !== String(incoming.roomId)) return false;
  if (!current.guestId || !incoming.guestId) return false;
  if (String(current.guestId) !== String(incoming.guestId)) return false;
  return current.started === true && incoming.started !== true;
}

/** 다시하기 뒤에 도착한 1국 started=true는 시작으로 되돌리지 않는다. */
export function incomingStaleAfterRematch(current, incoming) {
  if (!current?.roomId || !incoming?.roomId) return false;
  if (String(current.roomId) !== String(incoming.roomId)) return false;
  if (current.started === true) return false;
  if (incoming.started !== true) return false;
  if (!current.guestId || !incoming.guestId) return false;
  if (String(current.guestId) !== String(incoming.guestId)) return false;
  const curGen = roomMatchGen(current);
  const inGen = roomMatchGen(incoming);
  return inGen < curGen || (curGen > 0 && inGen === 0);
}

export function shouldKeepPvpRematch({
  mode,
  inRoom,
  roomId,
  hostId,
  guestId,
} = {}) {
  return mode === 'pvp'
    && inRoom === true
    && Boolean(roomId)
    && Boolean(hostId)
    && Boolean(guestId);
}

export function mergeRoomState(current, incoming) {
  if (!incoming?.roomId) return current || null;
  if (!current) return { ...createRoomState(incoming), ...incoming };
  if (current.roomId !== incoming.roomId) return current;
  if (incomingClearsOpponent(current, incoming)) {
    return applyRoomLeave(current, { leaverId: incoming.leaverId || current.guestId });
  }
  if (incomingResetsForRematch(current, incoming)) {
    return applyRoomRematch({
      ...current,
      ...incoming,
      guestId: current.guestId,
      guestName: current.guestName || incoming.guestName,
      hostAcorns: incoming.hostAcorns ?? current.hostAcorns,
      guestAcorns: incoming.guestAcorns ?? current.guestAcorns,
    });
  }
  if (incomingStaleAfterRematch(current, incoming)) {
    return {
      ...current,
      hostAcorns: incoming.hostAcorns ?? current.hostAcorns,
      guestAcorns: incoming.guestAcorns ?? current.guestAcorns,
      hostName: incoming.hostName || current.hostName,
      guestName: incoming.guestName || current.guestName,
    };
  }
  const withGuest = applyRoomGuest(current, incoming);
  const next = {
    ...withGuest,
    hostName: incoming.hostName || withGuest.hostName,
    guestName: incoming.guestName || withGuest.guestName,
    started: Boolean(withGuest.started || incoming.started),
    matchGen: Math.max(roomMatchGen(withGuest), roomMatchGen(incoming)),
    hostAcorns: incoming.hostAcorns ?? withGuest.hostAcorns,
    guestAcorns: incoming.guestAcorns ?? withGuest.guestAcorns,
    inviteTargetId: (withGuest.guestId || incoming.guestId)
      ? null
      : (incoming.inviteTargetId || withGuest.inviteTargetId || null),
  };
  if (next.started) return applyRoomStart({ ...next, guestId: next.guestId || incoming.guestId });
  return next;
}

export function shouldApplyRoomState(payload, { myId, roomId, inRoom } = {}) {
  if (!payload?.roomId) return false;
  if (roomId && String(payload.roomId) !== String(roomId)) return false;
  const mine = String(myId || '');
  if (!mine) return true;
  if (payload.hostId === mine || payload.guestId === mine || payload.inviteTargetId === mine) return true;
  if (payload.leftoverId && String(payload.leftoverId) === mine) return true;
  return Boolean(inRoom && roomId && String(payload.roomId) === String(roomId));
}

export function roomHasOpponent(state) {
  return Boolean(state?.guestId);
}

/** 흑은 호스트, 백은 게스트. 방 id가 내 방이 아니면 백. */
export function pvpSeatColor({ myId, hostId, roomId } = {}) {
  if (hostId && myId && String(hostId) === String(myId)) return 'black';
  if (hostId && myId && String(hostId) !== String(myId)) return 'white';
  const own = myId ? `room_${myId}` : '';
  if (roomId && own && String(roomId) !== own) return 'white';
  return 'black';
}

export function shouldKeepInviteShareFromRoom(state, {
  myId,
  inRoom,
  mode,
} = {}) {
  return mode === 'pvp'
    && Boolean(inRoom)
    && Boolean(state?.roomId)
    && state.hostId === myId
    && !state.started
    && !state.guestId;
}
