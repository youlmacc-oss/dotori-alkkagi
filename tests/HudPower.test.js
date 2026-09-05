import { describe, expect, it } from 'vitest';
import { aimChargeRatio, applyPowerFill, timerRingOffset } from '../src/ui/HudPower.js';

describe('POWER 에너지바', () => {
  it('당김이 없으면 0, 당김 비율만큼 채운다', () => {
    expect(aimChargeRatio(null)).toBe(0);
    expect(aimChargeRatio({ active: false, power: 0.8 })).toBe(0);
    expect(aimChargeRatio({ active: true, power: 0.4 })).toBeCloseTo(0.4);
    expect(aimChargeRatio({ active: true, power: 1.4 })).toBe(1);
    expect(aimChargeRatio({
      active: true,
      start: { x: 0, y: 0 },
      current: { x: 180, y: 0 },
    })).toBeCloseTo(0.5);
  });

  it('남은 시간 비율만큼 테두리 dash가 줄어든다', () => {
    expect(timerRingOffset(1)).toBe(0);
    expect(timerRingOffset(0)).toBe(100);
    expect(timerRingOffset(0.4)).toBeCloseTo(60);
  });

  it('게이지 엘리먼트에 scaleX와 충전 클래스를 넣는다', () => {
    const el = { style: {}, classList: { charged: false, hot: false, toggle(name, on) { this[name === 'is-hot' ? 'hot' : 'charged'] = on; } } };
    expect(applyPowerFill(el, 0.8)).toBeCloseTo(0.8);
    expect(el.style.transform).toBe('scaleX(0.8)');
    expect(el.classList.charged).toBe(true);
    expect(el.classList.hot).toBe(true);
  });
});
