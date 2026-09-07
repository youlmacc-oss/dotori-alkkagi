/**
 * 대전방 진입 후 재배치 의사 · 시작 버튼 · 선공 안내 타이밍.
 */

export const READY_ASK = '바둑돌을 재배치 하시겠습니까?';
export const READY_YES = '예';
export const READY_NO = '아니오';
export const READY_ASK_MS = 5000;
export const REARRANGE_MS = 10000;
export const FIRST_HINT_AFTER_MS = 3000;
export const FIRST_HINT = '도토리가 적은 사람이 시작 버튼을 누르고 선공합니다.';
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

export function isPeerRearranging(users, myId, roomId) {
  return (Array.isArray(users) ? users : []).some((u) => {
    const id = u?.userId ?? u?.id;
    if (!id || id === myId || !u.rearranging) return false;
    if (roomId && u.roomId && u.roomId !== roomId) return false;
    return true;
  });
}
