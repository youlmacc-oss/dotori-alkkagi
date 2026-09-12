import { describe, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import {
  GAME_MODE,
  GameEngine,
  PHASE,
  STONE_COLOR,
} from '../src/physics/GameEngine.js';
import {
  SAME_COLOR_BOND,
  bondAxis,
  collectSameColorBonds,
  effectiveBondSpeed,
  incomingFacingCos,
  planSameColorBondHold,
  sameColorBondThreshold,
  shouldHoldSameColorBond,
  stonesInSameColorContact,
} from '../src/physics/SameColorBond.js';

const { Body } = Matter;

function muteEngine() {
  return new GameEngine({
    autoStart: false,
    soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
  });
}

describe('같은 색 붙임 (단독 모듈)', () => {
  it('다른 색·떨어진 알은 붙임 대상이 아니다', () => {
    const black = { id: 1, color: STONE_COLOR.BLACK, x: 100, y: 100, radius: 24 };
    const white = { id: 2, color: STONE_COLOR.WHITE, x: 148, y: 100, radius: 24 };
    const far = { id: 3, color: STONE_COLOR.BLACK, x: 300, y: 100, radius: 24 };
    const near = { id: 4, color: STONE_COLOR.BLACK, x: 148, y: 100, radius: 24 };
    expect(stonesInSameColorContact(black, white)).toBe(false);
    expect(stonesInSameColorContact(black, far)).toBe(false);
    expect(stonesInSameColorContact(black, near)).toBe(true);
    expect(collectSameColorBonds([black, white, far])).toEqual([]);
  });

  it('정면은 cos 1, 옆은 0, 유효 속력은 그 비율이다', () => {
    expect(incomingFacingCos({ x: 0, y: -1 }, { x: 0, y: -1 })).toBeCloseTo(1);
    expect(incomingFacingCos({ x: 1, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(0);
    expect(effectiveBondSpeed(20, 1)).toBeCloseTo(20);
    expect(effectiveBondSpeed(20, 0)).toBeCloseTo(0);
    expect(effectiveBondSpeed(20, 0.5)).toBeCloseTo(10);
  });

  it('문턱은 단독 30% 샷의 1.5배이고 그보다 약하면 붙임을 유지한다', () => {
    const threshold = sameColorBondThreshold();
    expect(threshold).toBeCloseTo(SAME_COLOR_BOND.BASELINE_SPEED * 1.5);
    expect(shouldHoldSameColorBond(threshold - 0.01)).toBe(true);
    expect(shouldHoldSameColorBond(threshold)).toBe(false);
    expect(shouldHoldSameColorBond(threshold + 1)).toBe(false);
  });

  it('약한 옆 충격은 붙임을 유지하고 강한 정면은 풀어 준다', () => {
    const a = { id: 'b1', color: STONE_COLOR.BLACK, x: 360, y: 640, radius: 24, vx: 0, vy: 0 };
    const b = { id: 'b2', color: STONE_COLOR.BLACK, x: 360, y: 592, radius: 24, vx: 0, vy: 0 };
    const white = { id: 'w1', color: STONE_COLOR.WHITE, x: 300, y: 640, radius: 24 };
    const side = planSameColorBondHold([a, b], [{
      a: white,
      b: a,
      relSpeed: 8,
      velA: { x: 8, y: 0 },
      velB: { x: 0, y: 0 },
    }]);
    expect(side).toHaveLength(1);

    const front = planSameColorBondHold([a, b], [{
      a: white,
      b: a,
      relSpeed: 30,
      velA: { x: 0, y: -30 },
      velB: { x: 0, y: 0 },
    }]);
    expect(front).toHaveLength(0);
  });
});

describe('같은 색 붙임 (엔진 격리)', () => {
  it('RESOLVING에서만 붙이고 다른 색 한 방은 그대로 둔다', () => {
    const engine = muteEngine();
    engine.setMatchConfig({ mode: GAME_MODE.SOLO });
    const blacks = engine.stones.filter((s) => s.color === STONE_COLOR.BLACK);
    const whites = engine.stones.filter((s) => s.color === STONE_COLOR.WHITE);
    Body.setPosition(blacks[0].body, { x: 360, y: 700 });
    Body.setPosition(blacks[1].body, { x: 360, y: 652 });
    Body.setVelocity(blacks[0].body, { x: 0, y: 0 });
    Body.setVelocity(blacks[1].body, { x: 0, y: 0 });
    Body.setPosition(whites[0].body, { x: 200, y: 400 });
    Body.setVelocity(whites[0].body, { x: 12, y: 0 });
    const beforeWhite = { ...whites[0].body.velocity };
    engine.phase = PHASE.IDLE;
    engine.step(4);
    expect(whites[0].body.velocity.x).toBeCloseTo(beforeWhite.x, 4);
    engine.phase = PHASE.RESOLVING;
    engine.step(8);
    const axis = bondAxis(blacks[0], blacks[1]);
    expect(axis.len).toBeLessThan(24 + 24 + SAME_COLOR_BOND.CONTACT_SLOP + 4);
    engine.destroy();
  });
});
