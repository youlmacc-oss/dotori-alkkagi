export const PLAYFIELD_HUD = Object.freeze({
  topPx: 76,
  bottomPx: 178,
  nameBottomPx: 248,
  rightFabPx: 0,
  edgePad: 0.03,
});

export function ndcLiftToClearBottom(bounds, box) {
  const need = (box?.bottom ?? -1) - (bounds?.minY ?? 0);
  const room = (box?.top ?? 1) - (bounds?.maxY ?? 0);
  if (need <= 0) return 0;
  return Math.max(0, Math.min(need, Math.max(0, room)));
}

export function playfieldNdcBox(view, hud = PLAYFIELD_HUD) {
  const w = Math.max(1, Number(view?.width) || 1);
  const h = Math.max(1, Number(view?.height) || 1);
  const pad = hud.edgePad ?? 0.03;
  const left = -1 + pad;
  const right = 1 - (2 * (hud.rightFabPx ?? 0)) / w - pad;
  const top = 1 - (2 * (hud.topPx ?? 0)) / h - pad;
  const bottom = -1 + (2 * (hud.bottomPx ?? 0)) / h + pad;
  return {
    left,
    right: Math.max(left + 0.2, right),
    top: Math.max(bottom + 0.2, top),
    bottom,
  };
}

export function ndcBoxToCss(ndc, view) {
  const w = Math.max(1, Number(view?.width) || 1);
  const h = Math.max(1, Number(view?.height) || 1);
  const left = (Number(ndc?.minX) + 1) * 0.5 * w;
  const right = (Number(ndc?.maxX) + 1) * 0.5 * w;
  const top = (1 - Number(ndc?.maxY)) * 0.5 * h;
  const bottom = (1 - Number(ndc?.minY)) * 0.5 * h;
  return {
    left,
    right,
    top,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}

export function ndcBoundsFitBox(bounds, box, eps = 1e-4) {
  return Boolean(
    bounds
    && box
    && bounds.minX >= box.left - eps
    && bounds.maxX <= box.right + eps
    && bounds.minY >= box.bottom - eps
    && bounds.maxY <= box.top + eps,
  );
}

export function visualShellRect(vv, fallback = {}) {
  const width = Math.max(1, Math.round(vv?.width ?? fallback.width ?? 1));
  const height = Math.max(1, Math.round(vv?.height ?? fallback.height ?? 1));
  const top = Math.max(0, Math.round(vv?.offsetTop ?? 0));
  const left = Math.max(0, Math.round(vv?.offsetLeft ?? 0));
  return { width, height, top, left };
}
