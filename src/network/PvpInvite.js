/**
 * 대기실 1:1 시선 유도 · 가이드선 선택.
 */

export const PVP_ROOM_HINT = '대국방을 선택하면 게임이 시작됩니다';
export const PVP_GUIDE_ASK = '가이드선을 사용하시겠습니까?';

export function shouldInvitePvp(userCount) {
  return Number(userCount) >= 1;
}

export function parseGuideChoice(value) {
  if (value === true || value === '1' || value === 'on' || value === '사용') return true;
  if (value === false || value === '0' || value === 'off' || value === '미사용') return false;
  return null;
}
