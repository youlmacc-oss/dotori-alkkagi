/**
 * 대전 중 빈 바둑판 탭 → 카메라만 45° 회전.
 * Matter 좌표·조준·턴 타이머는 바꾸지 않는다.
 */

import { BOARD, PHASE, STONE_PICK_SLOP, STONE_RADIUS } from '../physics/GameEngine.js';

export const BOARD_SPIN_STEP = Math.PI / 4;
export const BOARD_SPIN_MS = 260;
export const BOARD_SPIN_TAP_PX = 14;
export const BOARD_SPIN_CLEAR_SLOP = 1.85;

export function nextBoardSpin(yaw = 0, step = BOARD_SPIN_STEP) {
  return (Number(yaw) || 0) + (Number(step) || 0);
}

export function canBoardSpin(state = {}) {
  if (state.inMatch !== true || state.matchStarted !== true) return false;
  if (state.paused === true || state.placementOnly === true) return false;
  if (state.killCam === true || state.aiming === true) return false;
  if (state.inputBlocked === true) return false;
  if (state.phase != null && state.phase !== PHASE.IDLE) return false;
  return true;
}

/** 대전 시작 후 관전·종료가 아니면 턴 버튼을 보여 준다. */
export function boardSpinFabVisible(state = {}) {
  return state.inMatch === true
    && state.matchStarted === true
    && state.lobby !== true
    && state.spectating !== true
    && state.gameOver !== true;
}

/** 버튼은 내 턴이 아니어도 보기는 돌릴 수 있다. 조준·진행 중만 막는다. */
export function canBoardSpinButton(state = {}) {
  if (!boardSpinFabVisible(state)) return false;
  if (state.paused === true || state.placementOnly === true) return false;
  if (state.killCam === true || state.aiming === true) return false;
  if (state.phase === PHASE.AIMING || state.phase === PHASE.RESOLVING) return false;
  if (state.phase === PHASE.GAME_OVER || state.phase === PHASE.SPECTATING) return false;
  return state.phase == null || state.phase === PHASE.IDLE;
}

export function isBoardSpinTarget(point, stones = [], board = BOARD) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  const outer = board?.outer ?? BOARD.outer;
  if (point.x < outer.x || point.x > outer.x + outer.size) return false;
  if (point.y < outer.y || point.y > outer.y + outer.size) return false;
  const clear = STONE_RADIUS * Math.max(BOARD_SPIN_CLEAR_SLOP, STONE_PICK_SLOP);
  const limit = clear * clear;
  for (const stone of stones) {
    if (!stone || stone.fallen) continue;
    const x = stone.body?.position?.x ?? stone.x;
    const y = stone.body?.position?.y ?? stone.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if ((x - point.x) ** 2 + (y - point.y) ** 2 <= limit) return false;
  }
  return true;
}

export function isBoardSpinTap(from, to, slop = BOARD_SPIN_TAP_PX) {
  if (!from || !to) return false;
  const dx = (Number(to.x) || 0) - (Number(from.x) || 0);
  const dy = (Number(to.y) || 0) - (Number(from.y) || 0);
  return Math.hypot(dx, dy) <= slop;
}
