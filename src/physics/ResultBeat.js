/**
 * 마지막 알 낙사 연출을 본 뒤 한 박자 쉬고 결과를 연다.
 */

export const RESULT_BEAT_MS = 420;
export const RESULT_FALL_HOLD_MS = 1920;

export function resultRevealDelayMs(lastFallAt, now = Date.now()) {
  const at = Number(lastFallAt);
  if (!Number.isFinite(at) || at <= 0) return 0;
  return Math.max(0, RESULT_FALL_HOLD_MS - (now - at));
}

export function resultSubLine(payload = {}, mode) {
  if (payload.reason === 'surrender') return '기권으로 승부가 갈렸습니다';
  if (payload.winner === 'draw') return '양측이 동시에 장외로 나갔습니다';
  if (mode === 'ai') {
    return payload.winner === 'black' ? 'AI 돌이 전멸했습니다' : '내 돌이 전멸했습니다';
  }
  return '한 쪽 돌이 모두 장외로 나갔습니다';
}
