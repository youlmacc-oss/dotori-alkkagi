import { describe, expect, it, vi } from 'vitest';
import {
  CLASH_COOLDOWN_MS,
  CLASH_REF_VELOCITY,
  CLASH_SPRITE,
  DEFAULT_VOLUME,
  SoundEngine,
  clashHapticMs,
  computeClashIntensity,
  selectClashSprite,
  soundEngine,
} from '../src/audio/SoundEngine.js';

describe('computeClashIntensity', () => {
  it('ARCHITECTURE 식 clamp(V_rel / 25, 0.1, 1.0)을 따른다', () => {
    expect(CLASH_REF_VELOCITY).toBe(25);
    expect(computeClashIntensity(0)).toBe(0.1);
    expect(computeClashIntensity(2.5)).toBe(0.1);
    expect(computeClashIntensity(12.5)).toBe(0.5);
    expect(computeClashIntensity(25)).toBe(1);
    expect(computeClashIntensity(80)).toBe(1);
  });
});

describe('selectClashSprite', () => {
  it('light < 0.3 / medium 0.3~0.7 / heavy > 0.7', () => {
    expect(selectClashSprite(0.1)).toBe(CLASH_SPRITE.LIGHT);
    expect(selectClashSprite(0.29)).toBe(CLASH_SPRITE.LIGHT);
    expect(selectClashSprite(0.3)).toBe(CLASH_SPRITE.MEDIUM);
    expect(selectClashSprite(0.7)).toBe(CLASH_SPRITE.MEDIUM);
    expect(selectClashSprite(0.71)).toBe(CLASH_SPRITE.HEAVY);
    expect(selectClashSprite(1)).toBe(CLASH_SPRITE.HEAVY);
  });
});

describe('SoundEngine.playClashByVelocity', () => {
  it('상대 속도로 타구 합성을 호출하고 햅틱을 전달한다', () => {
    const vibrate = vi.fn();
    const engine = new SoundEngine({ vibrate, storage: { getItem: () => null, setItem: () => {} } });
    const hit = vi.spyOn(engine, 'playStoneHit').mockImplementation(() => {});

    const result = engine.playClashByVelocity(20);

    expect(result).not.toBeNull();
    expect(result.intensity).toBeCloseTo(20 / 25);
    expect(result.sprite).toBe(CLASH_SPRITE.HEAVY);
    expect(result.surface).toBe('stone');
    expect(hit).toHaveBeenCalledWith(result.intensity, 'stone');
    expect(vibrate).toHaveBeenCalledWith(clashHapticMs(result.intensity));
  });

  it('알-판 면과 연속 타구 쿨다운을 구분한다', () => {
    let t = 1000;
    const engine = new SoundEngine({
      vibrate: () => {},
      now: () => t,
      storage: { getItem: () => null, setItem: () => {} },
    });
    vi.spyOn(engine, 'playStoneHit').mockImplementation(() => {});
    expect(engine.playClashByVelocity(12, 'board').surface).toBe('board');
    expect(engine.playClashByVelocity(12, 'board').skipped).toBe(true);
    t += CLASH_COOLDOWN_MS + 1;
    expect(engine.playClashByVelocity(12, 'board').skipped).toBe(false);
  });

  it('임계값 미만 속도는 재생하지 않는다', () => {
    const vibrate = vi.fn();
    const engine = new SoundEngine({ vibrate, storage: { getItem: () => null, setItem: () => {} } });
    const hit = vi.spyOn(engine, 'playStoneHit').mockImplementation(() => {});
    expect(engine.playClashByVelocity(0.1)).toBeNull();
    expect(hit).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('SoundEngine API', () => {
  it('클래스와 싱글톤, 합성 메서드를 내보낸다', () => {
    expect(soundEngine).toBeInstanceOf(SoundEngine);
    expect(typeof soundEngine.playStoneHit).toBe('function');
    expect(typeof soundEngine.playFlick).toBe('function');
    expect(typeof soundEngine.playFall).toBe('function');
    expect(typeof soundEngine.playDoor).toBe('function');
    expect(typeof soundEngine.playStart).toBe('function');
    expect(typeof soundEngine.playTurn).toBe('function');
    expect(typeof soundEngine.playTimerTick).toBe('function');
    expect(typeof soundEngine.playResult).toBe('function');
    expect(typeof soundEngine.playSurrender).toBe('function');
    expect(typeof soundEngine.setPull).toBe('function');
    expect(typeof soundEngine.setAmbience).toBe('function');
    expect(typeof soundEngine.unlock).toBe('function');
  });

  it('문소리는 입장·퇴장 종류를 받는다', () => {
    const engine = new SoundEngine({ storage: { getItem: () => null, setItem: () => {} } });
    vi.spyOn(engine, '_ctx').mockReturnValue(null);
    expect(engine.playDoor('enter')).toBe(false);
    expect(engine.playDoor('leave')).toBe(false);
  });

  it('음량·뮤트가 실효 게인을 정한다', () => {
    const store = {};
    const storage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
    };
    const engine = new SoundEngine({ storage });
    expect(engine.volume).toBe(DEFAULT_VOLUME);
    engine.setVolume(0.4);
    expect(engine.effectiveGain()).toBeCloseTo(0.4);
    engine.setMuted(true);
    expect(engine.effectiveGain()).toBe(0);
    engine.setMuted(false);
    expect(engine.effectiveGain()).toBeCloseTo(0.4);
  });
});
