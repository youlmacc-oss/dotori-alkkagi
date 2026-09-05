/**
 * 하단 POWER 게이지 — 당김 거리(0~1)를 에너지바 폭으로 옮긴다.
 */

export function aimChargeRatio(aim) {
  if (!aim?.active) return 0;
  let n = Number(aim.power);
  if (!Number.isFinite(n) || n < 0) n = Number(aim.tension);
  if ((!Number.isFinite(n) || n <= 0) && aim.start && aim.current) {
    const d = Math.hypot(aim.current.x - aim.start.x, aim.current.y - aim.start.y);
    n = d / 360;
  }
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function timerRingOffset(ratio, pathLen = 100) {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  return pathLen * (1 - r);
}

export function applyPowerFill(el, ratio) {
  if (!el) return 0;
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  el.style.transform = `scaleX(${r})`;
  el.style.width = '100%';
  el.classList.toggle('is-charged', r > 0.02);
  el.classList.toggle('is-hot', r >= 0.7);
  return r;
}
