/**
 * 환경설정 토글 — 액션캠 · 게임시작전 재배치. 기본값은 켜짐.
 */

export const ACTION_CAM_KEY = 'dotori-alkkagi-action-cam';
export const REARRANGE_ASK_KEY = 'dotori-alkkagi-rearrange-ask';

export function readEnabledPref(key, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(key);
    if (raw == null || raw === '') return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

export function writeEnabledPref(key, on, storage = globalThis.localStorage) {
  const next = Boolean(on);
  try {
    storage?.setItem?.(key, next ? '1' : '0');
  } catch { /* ignore */ }
  return next;
}

export function isActionCamEnabled(storage = globalThis.localStorage) {
  return readEnabledPref(ACTION_CAM_KEY, storage);
}

export function setActionCamEnabled(on, storage = globalThis.localStorage) {
  return writeEnabledPref(ACTION_CAM_KEY, on, storage);
}

export function isRearrangeAskEnabled(storage = globalThis.localStorage) {
  return readEnabledPref(REARRANGE_ASK_KEY, storage);
}

export const SETTINGS_APPLY_BLOCK = '대국 중에는 적용할 수 없습니다';

export function shouldBlockSettingsToLobby({ inRoom, started, spectating } = {}) {
  return inRoom === true && started === true && spectating !== true;
}

export function setRearrangeAskEnabled(on, storage = globalThis.localStorage) {
  return writeEnabledPref(REARRANGE_ASK_KEY, on, storage);
}
