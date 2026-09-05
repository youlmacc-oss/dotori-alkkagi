/**
 * 1:1 대기 중에도 기권·대기방 FAB이 시작 게이트에 가리지 않는지.
 */

export function hitHitsFab(hit, fab) {
  if (!hit || !fab) return false;
  return hit === fab || fab.contains(hit);
}

export function matchExitFabsOpen({ surrenderHidden, leaveHidden, leaveAbsent } = {}) {
  return leaveAbsent !== true && surrenderHidden !== true && leaveHidden !== true;
}
