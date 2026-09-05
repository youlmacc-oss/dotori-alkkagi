import { describe, expect, it } from 'vitest';
import {
  RESULT_BEAT_MS,
  RESULT_FALL_HOLD_MS,
  resultRevealDelayMs,
  resultSubLine,
} from '../src/physics/ResultBeat.js';

describe('결과 한 박자', () => {
  it('낙사 직후면 킬캠+한 박자를 기다리고, 없으면 바로 연다', () => {
    expect(resultRevealDelayMs(0, 10000)).toBe(0);
    expect(resultRevealDelayMs(null, 10000)).toBe(0);
    expect(resultRevealDelayMs(10000, 10000)).toBe(RESULT_FALL_HOLD_MS);
    expect(resultRevealDelayMs(10000, 10000 + 800)).toBe(RESULT_FALL_HOLD_MS - 800);
    expect(resultRevealDelayMs(10000, 10000 + RESULT_FALL_HOLD_MS + 10)).toBe(0);
    expect(RESULT_BEAT_MS).toBe(420);
    expect(RESULT_FALL_HOLD_MS).toBe(1920);
  });

  it('결과 부제는 한 줄로 고정한다', () => {
    expect(resultSubLine({ winner: 'draw' })).toBe('양측이 동시에 장외로 나갔습니다');
    expect(resultSubLine({ reason: 'surrender', winner: 'white' })).toBe('기권으로 승부가 갈렸습니다');
    expect(resultSubLine({ winner: 'black' }, 'ai')).toBe('AI 돌이 전멸했습니다');
    expect(resultSubLine({ winner: 'white' }, 'ai')).toBe('내 돌이 전멸했습니다');
    expect(resultSubLine({ winner: 'black' }, 'pvp')).toBe('한 쪽 돌이 모두 장외로 나갔습니다');
  });
});
