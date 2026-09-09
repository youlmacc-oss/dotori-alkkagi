import { describe, expect, it } from 'vitest';
import {
  GUIDE_COLOR_DEFAULT,
  GUIDE_COLOR_KEY,
  GUIDE_COLOR_PRESETS,
  guideColorNumber,
  loadGuideColor,
  parseGuideColor,
  saveGuideColor,
} from '../src/ui/ThreeRenderer.js';

describe('조준선 색', () => {
  it('6자리 hex만 쓰고 잘못된 값은 기본 금색이다', () => {
    expect(parseGuideColor('#FFCC00')).toBe('#ffcc00');
    expect(parseGuideColor('4de4ff')).toBe('#4de4ff');
    expect(parseGuideColor('#7cf')).toBe('#77ccff');
    expect(parseGuideColor('nope')).toBe(GUIDE_COLOR_DEFAULT);
    expect(parseGuideColor('')).toBe(GUIDE_COLOR_DEFAULT);
    expect(parseGuideColor(null)).toBe(GUIDE_COLOR_DEFAULT);
    expect(GUIDE_COLOR_DEFAULT).toBe('#ffcc00');
    expect(guideColorNumber('#ffcc00')).toBe(0xffcc00);
    expect(GUIDE_COLOR_PRESETS).toContain(GUIDE_COLOR_DEFAULT);
  });

  it('접속 중 저장·불러오기가 미리보기 값을 유지한다', () => {
    const store = {};
    const storage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
    };
    expect(loadGuideColor(storage)).toBe(GUIDE_COLOR_DEFAULT);
    expect(saveGuideColor('#4DE4FF', storage)).toBe('#4de4ff');
    expect(store[GUIDE_COLOR_KEY]).toBe('#4de4ff');
    expect(loadGuideColor(storage)).toBe('#4de4ff');
    expect(saveGuideColor('not-a-color', storage)).toBe(GUIDE_COLOR_DEFAULT);
  });
});
