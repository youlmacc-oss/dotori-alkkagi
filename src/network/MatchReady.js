/**
 * 대전방 진입 후 재배치 의사 · 시작 버튼 · 선공 안내 타이밍.
 */

import { PVP_WAIT_HINT, tossCoinHint } from './MatchStart.js';
import { roomHasOpponent } from './RoomState.js';

export const READY_ASK = '바둑돌을 재배치 하시겠습니까?';
export const READY_YES = '예';
export const READY_NO = '아니오';
export const READY_ASK_MS = 5000;
export const REARRANGE_MS = 10000;
export const FIRST_HINT_AFTER_MS = 3000;
export const FIRST_HINT = '호스트(흑)가 먼저입니다. 선공이 시작 버튼을 누릅니다.';
export const START_WAIT_HINT = '상대 진형을 맞추고 있습니다';
export const PEER_REARRANGE_HINT = '상대가 바둑알을 재배치하고 있습니다.';

export function createMatchReady(now = 0) {
  return {
    enteredAt: Number(now) || 0,
    answer: null,
    rearrangeUntil: 0,
  };
}

export function answerReady(state, yes, now) {
  if (!state || state.answer != null) return state;
  const at = Number(now) || 0;
  return {
    ...state,
    answer: Boolean(yes),
    rearrangeUntil: yes ? at + REARRANGE_MS : 0,
  };
}

export function skipReadyAsk(state, now) {
  const at = Number(now) || 0;
  const base = state ?? createMatchReady(at);
  return { ...base, enteredAt: at - READY_ASK_MS };
}

export function rearrangeRemainMs(state, now) {
  if (!state || state.answer !== true) return 0;
  return Math.max(0, (Number(state.rearrangeUntil) || 0) - (Number(now) || 0));
}

/** 10 → 1 내림. 0이면 재배치 끝. */
export function rearrangeCountDown(remainMs) {
  const left = Number(remainMs) || 0;
  if (left <= 0) return 0;
  return Math.max(1, Math.min(10, Math.ceil(left / 1000)));
}

export function rearrangeCountHint(count) {
  const n = Math.floor(Number(count) || 0);
  return n > 0 ? String(n) : '';
}

export function stepMatchReady(state, now, extras = {}) {
  const at = Number(now) || 0;
  const s = state ?? createMatchReady(at);
  const elapsed = Math.max(0, at - s.enteredAt);
  const askEnabled = extras.askEnabled !== false;
  const startAt = askEnabled ? READY_ASK_MS : 0;
  const remainMs = rearrangeRemainMs(s, at);
  const rearranging = s.answer === true && remainMs > 0;
  const rearrangeCount = rearranging ? rearrangeCountDown(remainMs) : 0;
  return {
    ...s,
    elapsed,
    remainMs,
    rearrangeCount,
    askVisible: askEnabled && s.answer == null && elapsed < READY_ASK_MS,
    startVisible: !rearranging && elapsed >= startAt,
    firstHint: !rearranging && elapsed >= startAt + FIRST_HINT_AFTER_MS,
    rearranging,
    peerRearranging: Boolean(extras.peerRearranging),
  };
}

/** 재배치·대기 문구를 가리지 않는다. 선공은 항상 호스트. */
export function startGateHint({
  rearranging = false,
  rearrangeCount = 0,
  peerRearranging = false,
  pvp = false,
  ready = false,
  hostStartPending = false,
  startVisible = false,
  firstHint = false,
  room = null,
} = {}) {
  if (rearranging) {
    const text = rearrangeCountHint(rearrangeCount);
    return { text, kind: text ? 'count' : '', face: '' };
  }
  if (peerRearranging) return { text: PEER_REARRANGE_HINT, kind: 'wait', face: '' };
  if (pvp && !roomHasOpponent(room)) return { text: PVP_WAIT_HINT, kind: 'wait', face: '' };
  if (hostStartPending) return { text: START_WAIT_HINT, kind: 'wait', face: '' };
  if (pvp && roomHasOpponent(room)) {
    const text = tossCoinHint(room);
    if (text) return { text, kind: 'wait', face: '' };
  }
  if (pvp && startVisible && firstHint) return { text: FIRST_HINT, kind: 'wait', face: '' };
  return { text: '', kind: '', face: '' };
}

export function isPeerRearranging(users, myId, roomId) {
  return (Array.isArray(users) ? users : []).some((u) => {
    const id = u?.userId ?? u?.id;
    if (!id || id === myId || !u.rearranging) return false;
    if (roomId && u.roomId && u.roomId !== roomId) return false;
    return true;
  });
}
