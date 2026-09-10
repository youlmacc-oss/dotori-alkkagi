import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_DIFFICULTY,
  BOARD,
  GAME_MODE,
  GameEngine,
  PHASE,
  STONE_COLOR,
  createPresetLayout,
} from '../src/physics/GameEngine.js';
import {
  AI_ERROR_DEG,
  AI_THINK,
  aimErrorDeg,
  aimHitsStone,
  calculateShot,
  findDoubleShot,
  bestKnockoutPair,
  pointerFromAim,
} from '../src/ai/AIBot.js';
import { TurnManager } from '../src/ai/TurnManager.js';

function pack(layout) {
  const ai = [];
  const player = [];
  let aiId = 100;
  let playerId = 1;
  for (const spot of layout) {
    if (spot.color === STONE_COLOR.WHITE) {
      ai.push({ id: aiId++, x: spot.x, y: spot.y });
    } else {
      player.push({ id: playerId++, x: spot.x, y: spot.y });
    }
  }
  return { ai, player };
}

function createEngine() {
  return new GameEngine({
    autoStart: false,
    soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
    haptic: vi.fn(),
  });
}

describe('aimHitsStone', () => {
  it('정면은 맞고 40도 빗각은 먼 거리에서 빗나간다', () => {
    const shooter = { x: 200, y: 500 };
    const target = { x: 400, y: 200 };
    const direct = Math.atan2(200 - 500, 400 - 200);
    expect(aimHitsStone(shooter, direct, target)).toBe(true);
    expect(aimHitsStone(shooter, direct - 40 * Math.PI / 180, target)).toBe(false);
    expect(aimHitsStone(shooter, direct + Math.PI, target)).toBe(false);
  });
});

describe('AIBot 조준 오차', () => {
  it('초급·중급·고급 조준 오차는 0도이다', () => {
    expect(AI_ERROR_DEG[AI_DIFFICULTY.BEGINNER]).toBe(0);
    expect(AI_ERROR_DEG[AI_DIFFICULTY.INTERMEDIATE]).toBe(0);
    expect(AI_ERROR_DEG[AI_DIFFICULTY.EXPERT]).toBe(0);
    expect(aimErrorDeg(AI_DIFFICULTY.BEGINNER, () => 0)).toBe(0);
    expect(aimErrorDeg(AI_DIFFICULTY.BEGINNER, () => 1)).toBe(0);
    expect(aimErrorDeg(AI_DIFFICULTY.INTERMEDIATE, () => 1)).toBe(0);
    expect(aimErrorDeg(AI_DIFFICULTY.EXPERT, () => 0.37)).toBe(0);
  });
});

describe('calculateShot 3/5/7/9알', () => {
  it.each([3, 5, 7, 9])('%i알에서 유효한 타깃과 발사 벡터를 반환한다', (count) => {
    const { ai, player } = pack(createPresetLayout(count));
    expect(ai.length).toBe(count);
    expect(player.length).toBe(count);

    for (const difficulty of Object.values(AI_DIFFICULTY)) {
      const shot = calculateShot(ai, player, difficulty, { rng: () => 0.5, board: BOARD });
      expect(shot.ok).toBe(true);
      expect(ai.some((s) => s.id === shot.shooterId)).toBe(true);
      expect(player.some((s) => s.id === shot.targetId)).toBe(true);
      expect(Number.isFinite(shot.pointer.x)).toBe(true);
      expect(Number.isFinite(shot.pointer.y)).toBe(true);
      expect(Number.isFinite(shot.velocity.x)).toBe(true);
      expect(Number.isFinite(shot.velocity.y)).toBe(true);
      expect(Math.abs(shot.errorDeg)).toBeLessThanOrEqual(shot.errorCapDeg + 1e-9);
      expect(shot.power).toBeGreaterThan(0.1);
      const shooter = ai.find((s) => s.id === shot.shooterId);
      const target = player.find((s) => s.id === shot.targetId);
      expect(aimHitsStone(shooter, shot.angle, target)).toBe(true);
      expect(aimHitsStone(shooter, Math.atan2(shot.velocity.y, shot.velocity.x), target)).toBe(true);
    }
  });

  it('중급은 가장자리로 밀어내기 쉬운 수를 고른다', () => {
    const ai = [{ id: 10, x: 360, y: 400 }];
    const player = [
      { id: 1, x: 360, y: 500 },
      { id: 2, x: 108, y: 400 },
    ];
    const shot = calculateShot(ai, player, AI_DIFFICULTY.INTERMEDIATE, { rng: () => 0.5, board: BOARD });
    expect(shot.targetId).toBe(2);
    expect(shot.kind).toBe('knockout');
    expect(shot.errorDeg).toBe(0);
  });

  it('근접한 돌 축으로 당기는 조준은 옆으로 꺾는다', () => {
    const ai = [{ id: 10, x: 360, y: 360 }];
    const player = [{ id: 1, x: 408, y: 360 }];
    const shot = calculateShot(ai, player, AI_DIFFICULTY.INTERMEDIATE, { rng: () => 0.5, board: BOARD });
    expect(shot.ok).toBe(true);
    const pull = { x: shot.pointer.x - 360, y: shot.pointer.y - 360 };
    const align = Math.abs(pull.x) / (Math.hypot(pull.x, pull.y) || 1);
    expect(align).toBeLessThan(0.78);
  });

  it('흑백이 붙어 있으면 간격 있는 다른 수를 고른다', () => {
    const ai = [
      { id: 10, x: 360, y: 360 },
      { id: 11, x: 200, y: 520 },
    ];
    const player = [
      { id: 1, x: 408, y: 360 },
      { id: 2, x: 280, y: 520 },
    ];
    for (const difficulty of Object.values(AI_DIFFICULTY)) {
      const shot = calculateShot(ai, player, difficulty, { rng: () => 0.01, board: BOARD });
      expect(shot.ok).toBe(true);
      expect(shot.shooterId).not.toBe(10);
      expect(shot.shooterId === 10 && shot.targetId === 1).toBe(false);
    }
  });

  it('초급은 예전 고급처럼 가장자리 녹아웃을 고른다', () => {
    const ai = [{ id: 10, x: 360, y: 400 }];
    const player = [
      { id: 1, x: 360, y: 500 },
      { id: 2, x: 108, y: 400 },
    ];
    const beginner = calculateShot(ai, player, AI_DIFFICULTY.BEGINNER, { rng: () => 0.5, board: BOARD });
    expect(bestKnockoutPair(ai, player, BOARD.inner).target.id).toBe(2);
    expect(beginner.targetId).toBe(2);
    expect(beginner.kind).toBe('knockout');
    expect(beginner.errorDeg).toBe(0);
    expect(beginner.power).toBeGreaterThanOrEqual(0.8);
  });

  it('난이도를 생략하면 고급으로 친다', () => {
    const ai = [{ id: 10, x: 360, y: 400 }];
    const player = [{ id: 2, x: 108, y: 400 }];
    const shot = calculateShot(ai, player, undefined, { rng: () => 0.5, board: BOARD });
    expect(shot.ok).toBe(true);
    expect(shot.difficulty).toBe(AI_DIFFICULTY.EXPERT);
    expect(shot.power).toBeGreaterThanOrEqual(0.9);
  });

  it('고급은 가장자리로 밀어내기 쉬운 수를 더 세게 친다', () => {
    const ai = [{ id: 10, x: 360, y: 400 }];
    const player = [
      { id: 1, x: 360, y: 500 },
      { id: 2, x: 108, y: 400 },
    ];
    const mid = calculateShot(ai, player, AI_DIFFICULTY.INTERMEDIATE, { rng: () => 0.5, board: BOARD });
    const expert = calculateShot(ai, player, AI_DIFFICULTY.EXPERT, { rng: () => 0.5, board: BOARD });
    expect(mid.targetId).toBe(2);
    expect(expert.targetId).toBe(2);
    expect(expert.kind).toBe('knockout');
    expect(expert.errorDeg).toBe(0);
    expect(expert.power).toBeGreaterThanOrEqual(mid.power);
  });

  it('고급은 일직선 연쇄를 더블 샷으로 고르고 오차가 0이다', () => {
    const ai = [{ id: 10, x: 360, y: 360 }];
    const player = [
      { id: 1, x: 360, y: 460 },
      { id: 2, x: 360, y: 560 },
      { id: 3, x: 520, y: 400 },
    ];
    expect(findDoubleShot(ai, player)?.target.id).toBe(1);
    const shot = calculateShot(ai, player, AI_DIFFICULTY.EXPERT, { rng: () => 0.2 });
    expect(shot.kind).toBe('double');
    expect(shot.targetId).toBe(1);
    expect(shot.errorDeg).toBe(0);
  });

  it('빗나가는 가장자리 여유각 대신 타깃을 맞히는 각을 고른다', () => {
    const ai = [{ id: 10, x: 200, y: 500 }];
    const player = [{ id: 1, x: 400, y: 200 }];
    const direct = Math.atan2(200 - 500, 400 - 200);
    expect(aimHitsStone(ai[0], direct, player[0])).toBe(true);
    expect(aimHitsStone(ai[0], direct - 40 * Math.PI / 180, player[0])).toBe(false);
    for (const difficulty of Object.values(AI_DIFFICULTY)) {
      const shot = calculateShot(ai, player, difficulty, { rng: () => 0.5, board: BOARD });
      expect(shot.ok).toBe(true);
      expect(shot.targetId).toBe(1);
      expect(aimHitsStone(ai[0], shot.angle, player[0])).toBe(true);
      expect(aimHitsStone(ai[0], Math.atan2(shot.velocity.y, shot.velocity.x), player[0])).toBe(true);
    }
  });

  it('남은 돌이 적어도 모든 난이도가 타깃을 맞힌다', () => {
    const fixtures = [
      { ai: [{ id: 10, x: 180, y: 180 }], player: [{ id: 1, x: 520, y: 520 }] },
      { ai: [{ id: 10, x: 400, y: 200 }], player: [{ id: 1, x: 120, y: 400 }] },
      {
        ai: [{ id: 10, x: 360, y: 360 }],
        player: [{ id: 1, x: 200, y: 180 }, { id: 2, x: 540, y: 520 }],
      },
    ];
    for (const { ai, player } of fixtures) {
      for (const difficulty of Object.values(AI_DIFFICULTY)) {
        const shot = calculateShot(ai, player, difficulty, { rng: () => 0.3, board: BOARD });
        expect(shot.ok).toBe(true);
        const shooter = ai.find((s) => s.id === shot.shooterId);
        const target = player.find((s) => s.id === shot.targetId);
        expect(shooter).toBeTruthy();
        expect(target).toBeTruthy();
        expect(aimHitsStone(shooter, shot.angle, target)).toBe(true);
        expect(aimHitsStone(shooter, Math.atan2(shot.velocity.y, shot.velocity.x), target)).toBe(true);
      }
    }
  });

  it('pointerFromAim은 발사 반대 방향으로 당긴다', () => {
    const origin = { x: 100, y: 100 };
    const pointer = pointerFromAim(origin, 0, 1);
    expect(pointer.x).toBeLessThan(origin.x);
    expect(pointer.y).toBeCloseTo(origin.y);
  });
});

describe('GameEngine AI 모드·입력 잠금', () => {
  /** @type {GameEngine | null} */
  let engine = null;

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  it('기본 gameMode는 ai 이고 setMatchConfig는 판을 리셋한다', () => {
    engine = createEngine();
    expect(engine.gameMode).toBe(GAME_MODE.AI);
    expect(engine.aiDifficulty).toBe(AI_DIFFICULTY.EXPERT);
    const firstId = engine.stones[0].body.id;
    engine.currentTurn = STONE_COLOR.WHITE;
    engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: AI_DIFFICULTY.BEGINNER });
    expect(engine.gameMode).toBe(GAME_MODE.PVP);
    expect(engine.aiDifficulty).toBe(AI_DIFFICULTY.BEGINNER);
    expect(engine.currentTurn).toBe(STONE_COLOR.BLACK);
    expect(engine.stones[0].body.id).not.toBe(firstId);
  });

  it('AI 백 턴이면 유저 포인터 입력을 무시한다', () => {
    engine = createEngine();
    engine.currentTurn = STONE_COLOR.WHITE;
    const stone = engine.getAliveStones(STONE_COLOR.WHITE)[0];
    engine._onPointerDown({
      preventDefault() {},
      pointerId: 1,
      clientX: stone.body.position.x,
      clientY: stone.body.position.y,
    });
    expect(engine.aim).toBe(null);
    expect(engine.phase).toBe(PHASE.IDLE);
  });

  it('beginAiAim 후 dispatchAiShot이 백돌을 발사한다', () => {
    engine = createEngine();
    engine.currentTurn = STONE_COLOR.WHITE;
    engine.setInputLocked(true);
    const ai = engine.getAliveStones(STONE_COLOR.WHITE).map((s) => ({
      id: s.id,
      x: s.body.position.x,
      y: s.body.position.y,
    }));
    const player = engine.getAliveStones(STONE_COLOR.BLACK).map((s) => ({
      id: s.id,
      x: s.body.position.x,
      y: s.body.position.y,
    }));
    const shot = calculateShot(ai, player, AI_DIFFICULTY.INTERMEDIATE, { rng: () => 0.4 });
    expect(engine.beginAiAim(shot)).toBe(true);
    expect(engine.phase).toBe(PHASE.AIMING);
    engine.dispatchAiShot();
    expect(engine.phase).toBe(PHASE.RESOLVING);
  });
});

describe('TurnManager 고민·조준 딜레이', () => {
  /** @type {GameEngine | null} */
  let engine = null;
  /** @type {TurnManager | null} */
  let manager = null;

  afterEach(() => {
    manager?.detach();
    manager = null;
    engine?.destroy();
    engine = null;
    vi.useRealTimers();
  });

  it('AI 백 턴에서 1초 고민 후 0.5초 조준 뒤 발사한다', () => {
    vi.useFakeTimers();
    engine = createEngine();
    manager = new TurnManager({
      engine,
      rng: () => 0.5,
      thinkMinMs: AI_THINK.MIN_MS,
      thinkMaxMs: AI_THINK.MIN_MS,
      aimMs: AI_THINK.AIM_MS,
    });
    manager.attach();
    expect(engine.inputLocked).toBe(false);

    engine.currentTurn = STONE_COLOR.WHITE;
    manager.sync();
    expect(engine.inputLocked).toBe(true);
    expect(engine.phase).toBe(PHASE.IDLE);

    vi.advanceTimersByTime(AI_THINK.MIN_MS);
    expect(engine.phase).toBe(PHASE.AIMING);

    vi.advanceTimersByTime(AI_THINK.AIM_MS);
    expect(engine.phase).toBe(PHASE.RESOLVING);
  });
});
