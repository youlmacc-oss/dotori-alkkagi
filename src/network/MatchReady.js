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

export function stepMatchReady(state, now, extras = {}) {
  const at = Number(now) || 0;
  const s = state ?? createMatchReady(at);
  const elapsed = Math.max(0, at - s.enteredAt);
  const askEnabled = extras.askEnabled !== false;
  const startAt = askEnabled ? READY_ASK_MS : 0;
  const rearranging = s.answer === true && at < (Number(s.rearrangeUntil) || 0);
  return {
    ...s,
    elapsed,
    askVisible: askEnabled && s.answer == null && elapsed < READY_ASK_MS,
    startVisible: elapsed >= startAt,
    firstHint: elapsed >= startAt + FIRST_HINT_AFTER_MS,
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
