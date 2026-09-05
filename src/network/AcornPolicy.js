/**
 * 접속 중 도토리: 시작 10, 1:1 승 +1 / 패 -1, 음수 허용. 이력 저장 없음.
 */

export const SESSION_ACORNS = 10;
export const ACORN_WIN = 1;
export const ACORN_LOSS = -1;
export const ACORN_HISTORY_KEY = 'dotori-alkkagi-acorns';

export function parseAcorn(value, fallback = SESSION_ACORNS) {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.floor(n);
  const fb = Number(fallback);
  return Number.isFinite(fb) ? Math.floor(fb) : SESSION_ACORNS;
}

export function clearAcornHistory(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(ACORN_HISTORY_KEY);
  } catch {
    /* ignore */
  }
  return SESSION_ACORNS;
}

export function shouldSettleAcorns(result = {}) {
  if (result.mode !== 'pvp') return false; // 1인·AI는 증감 없음
  if (result.started !== true) return false;
  if (result.spectating) return false;
  if (result.winner == null || result.winner === 'draw') return false;
  return result.myColor === 'black' || result.myColor === 'white';
}

export function shouldForfeitOnLeave(state = {}) {
  if (state.mode !== 'pvp') return false;
  if (state.started !== true) return false;
  if (state.spectating) return false;
  if (state.phase === 'gameOver') return false;
  return true;
}

export function settleSessionAcorns(current, result = {}) {
  const now = parseAcorn(current);
  if (!shouldSettleAcorns(result)) return now;
  return now + (result.winner === result.myColor ? ACORN_WIN : ACORN_LOSS);
}
