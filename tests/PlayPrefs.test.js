import { describe, expect, it } from 'vitest';
import {
  ACTION_CAM_KEY,
  REARRANGE_ASK_KEY,
  isActionCamEnabled,
  isRearrangeAskEnabled,
  SETTINGS_APPLY_BLOCK,
  setActionCamEnabled,
  setRearrangeAskEnabled,
  shouldBlockSettingsToLobby,
} from '../src/ui/PlayPrefs.js';

function mem(seed = {}) {
  const data = { ...seed };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
}

describe('환경설정 액션캠·재배치 토글', () => {
  it('키가 없으면 둘 다 기본 켜짐이다', () => {
    const storage = mem();
    expect(isActionCamEnabled(storage)).toBe(true);
    expect(isRearrangeAskEnabled(storage)).toBe(true);
  });

  it('끄면 저장되고 다시 읽으면 꺼진 상태다', () => {
    const storage = mem();
    expect(setActionCamEnabled(false, storage)).toBe(false);
    expect(setRearrangeAskEnabled(false, storage)).toBe(false);
    expect(storage.getItem(ACTION_CAM_KEY)).toBe('0');
    expect(storage.getItem(REARRANGE_ASK_KEY)).toBe('0');
    expect(isActionCamEnabled(storage)).toBe(false);
    expect(isRearrangeAskEnabled(storage)).toBe(false);
    expect(shouldBlockSettingsToLobby({ inRoom: true, started: true })).toBe(true);
    expect(shouldBlockSettingsToLobby({ inRoom: true, started: false })).toBe(false);
    expect(shouldBlockSettingsToLobby({ inRoom: true, started: true, spectating: true })).toBe(false);
    expect(SETTINGS_APPLY_BLOCK).toContain('대국 중');
  });
});
