import { describe, expect, it } from 'vitest';
import {
  BOARD,
  FORMATION_MODE,
  FORMATION_SHAPE,
  FORMATION_ZONE,
  GameEngine,
  STONE_COLOR,
  campsAreSegregated,
  commitPlayLayout,
  createPresetLayout,
  createRandomFormationLayout,
  enforceOwnCamps,
  isOnHomeHalf,
  packCampGrid,
  separateCampsForPlay,
  validateFormationLayout,
} from '../src/physics/GameEngine.js';

function campsOf(layout, kind = FORMATION_ZONE.PRESET) {
  return campsAreSegregated(layout, BOARD, kind)
    && layout.every((s) => (
      s.color === STONE_COLOR.WHITE
        ? s.y < BOARD.inner.y + BOARD.inner.size / 2
        : s.y > BOARD.inner.y + BOARD.inner.size / 2
    ));
}

describe('시작 진영 분리', () => {
  it('섞인 좌표를 자기 진영 한 줄로 되돌린다', () => {
    const mixed = [
      { x: 200, y: 360, color: STONE_COLOR.BLACK },
      { x: 400, y: 120, color: STONE_COLOR.BLACK },
      { x: 240, y: 500, color: STONE_COLOR.WHITE },
      { x: 500, y: 360, color: STONE_COLOR.WHITE },
    ];
    const fixed = enforceOwnCamps(mixed, BOARD, FORMATION_ZONE.PRESET, 3);
    expect(fixed.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(3);
    expect(fixed.filter((s) => s.color === STONE_COLOR.WHITE)).toHaveLength(3);
    expect(campsOf(fixed)).toBe(true);
  });

  it('3·5·7·9알 프리셋은 시작 때 진영이 섞이지 않는다', () => {
    for (const count of [3, 5, 7, 9]) {
      for (const shape of [FORMATION_SHAPE.LINE, FORMATION_SHAPE.WEDGE, FORMATION_SHAPE.DEFENSE, FORMATION_SHAPE.COLUMN]) {
        const layout = enforceOwnCamps(createPresetLayout(count, shape), BOARD, FORMATION_ZONE.PRESET, count);
        expect(campsOf(layout)).toBe(true);
      }
    }
  });

  it('임의 배치도 첫째 선 안 자기 진영만 쓴다', () => {
    const layout = createRandomFormationLayout(9, BOARD, () => 0.15);
    expect(campsOf(layout, FORMATION_ZONE.CUSTOM)).toBe(true);
  });

  it('엔진에 섞인 배치를 넣어도 준비 판은 분리된다', () => {
    const engine = new GameEngine({ autoStart: false });
    const mixed = [
      { x: 360, y: 360, color: STONE_COLOR.BLACK },
      { x: 300, y: 200, color: STONE_COLOR.BLACK },
      { x: 360, y: 400, color: STONE_COLOR.WHITE },
      { x: 420, y: 500, color: STONE_COLOR.WHITE },
    ];
    const applied = engine.setupFormation(5, FORMATION_MODE.CUSTOM, [
      ...mixed,
      { x: 180, y: 360, color: STONE_COLOR.BLACK },
      { x: 220, y: 360, color: STONE_COLOR.BLACK },
      { x: 260, y: 360, color: STONE_COLOR.BLACK },
      { x: 180, y: 400, color: STONE_COLOR.WHITE },
      { x: 220, y: 400, color: STONE_COLOR.WHITE },
      { x: 260, y: 400, color: STONE_COLOR.WHITE },
    ]);
    expect(applied.ok).toBe(true);
    expect(engine.stones).toHaveLength(10);
    const live = engine.stones.map((s) => ({ x: s.body.position.x, y: s.body.position.y, color: s.color }));
    expect(campsOf(live, FORMATION_ZONE.CUSTOM)).toBe(true);
    engine.destroy();
  });

  it('7·9알 저장 배치는 겹쳐 있어도 진영이 갈린다', () => {
    const piled = Array.from({ length: 18 }, (_, i) => ({
      x: BOARD.inner.x + BOARD.inner.size / 2,
      y: BOARD.inner.y + BOARD.inner.size / 2,
      color: i < 9 ? STONE_COLOR.BLACK : STONE_COLOR.WHITE,
    }));
    const fixed = commitPlayLayout(9, piled, BOARD, FORMATION_ZONE.CUSTOM);
    expect(fixed).toHaveLength(18);
    expect(validateFormationLayout(fixed, BOARD, FORMATION_ZONE.CUSTOM).ok).toBe(true);
    expect(campsOf(fixed, FORMATION_ZONE.CUSTOM)).toBe(true);
  });

  it('7·9알 프리셋·임의 배치를 엔진에 넣어도 흑백이 섞이지 않는다', () => {
    const engine = new GameEngine({ autoStart: false });
    for (const count of [7, 9]) {
      for (const shape of [FORMATION_SHAPE.LINE, FORMATION_SHAPE.WEDGE, FORMATION_SHAPE.DEFENSE]) {
        const applied = engine.setupFormation(count, FORMATION_MODE.PRESET, shape);
        expect(applied.ok).toBe(true);
        const live = engine.stones.map((s) => ({ x: s.body.position.x, y: s.body.position.y, color: s.color }));
        expect(campsOf(live, FORMATION_ZONE.PRESET)).toBe(true);
      }
      const random = engine.setupFormation(count, FORMATION_MODE.CUSTOM, createRandomFormationLayout(count));
      expect(random.ok).toBe(true);
      const liveRand = engine.stones.map((s) => ({ x: s.body.position.x, y: s.body.position.y, color: s.color }));
      expect(campsOf(liveRand, FORMATION_ZONE.CUSTOM)).toBe(true);
    }
    engine.destroy();
  });

  it('종대 3알도 한쪽 진영 안에만 쌓인다', () => {
    const layout = createPresetLayout(3, FORMATION_SHAPE.COLUMN);
    expect(campsOf(layout)).toBe(true);
    expect(packCampGrid(7, STONE_COLOR.BLACK, BOARD, FORMATION_ZONE.CUSTOM)).toHaveLength(7);
  });

  it('랜덤이 섞여도 최종 재배치는 흑백 진영을 가른다', () => {
    const mid = BOARD.inner.y + BOARD.inner.size / 2;
    for (const count of [7, 9]) {
      for (let i = 0; i < 12; i += 1) {
        const chaos = Array.from({ length: count * 2 }, (_, k) => ({
          x: BOARD.inner.x + ((k * 37) % BOARD.inner.size),
          y: BOARD.inner.y + ((k * 53 + i * 17) % BOARD.inner.size),
          color: k % 2 ? STONE_COLOR.WHITE : STONE_COLOR.BLACK,
        }));
        const fixed = separateCampsForPlay(chaos, count, BOARD, FORMATION_ZONE.CUSTOM);
        expect(fixed.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(count);
        expect(fixed.filter((s) => s.color === STONE_COLOR.WHITE)).toHaveLength(count);
        expect(fixed.every((s) => isOnHomeHalf(s, BOARD))).toBe(true);
        expect(fixed.filter((s) => s.color === STONE_COLOR.WHITE).every((s) => s.y < mid)).toBe(true);
        expect(fixed.filter((s) => s.color === STONE_COLOR.BLACK).every((s) => s.y > mid)).toBe(true);
      }
    }
  });

  it('5알에서 7·9알로 바꿔도 산 돌 색과 진영이 맞다', () => {
    const engine = new GameEngine({ autoStart: false });
    engine.setupFormation(5, FORMATION_MODE.PRESET, FORMATION_SHAPE.LINE);
    for (const count of [7, 9]) {
      engine.setupFormation(count, FORMATION_MODE.CUSTOM, createRandomFormationLayout(count, BOARD, Math.random));
      expect(engine.stones).toHaveLength(count * 2);
      const live = engine.stones.map((s) => ({ x: s.body.position.x, y: s.body.position.y, color: s.color }));
      expect(live.every((s) => isOnHomeHalf(s, BOARD))).toBe(true);
      expect(engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(count);
      expect(engine.stones.filter((s) => s.color === STONE_COLOR.WHITE)).toHaveLength(count);
    }
    engine.destroy();
  });
});
