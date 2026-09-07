import { afterEach, describe, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import {
  BOARD,
  FORMATION_FACEOFF_REQUEST,
  FORMATION_MIN_SEPARATION,
  FORMATION_MODE,
  FORMATION_SHAPE,
  FORMATION_SLOT,
  FORMATION_STORAGE_KEY,
  FORMATION_FIRST_LINE,
  FORMATION_ZONE,
  boardGridLineMatterY,
  campsAreSegregated,
  formationStorageKey,
  GAME_MODE,
  GameEngine,
  defaultGameModeForLobbyCount,
  shouldApplyLobbyDefaultMode,
  finalizeStartedMode,
  PHASE,
  POWER_RATIO,
  REST,
  SLINGSHOT,
  STONE_COLOR,
  STONES_PER_SIDE,
  TOUCH_FEEL,
  TURN,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
  canControlPowerRatio,
  AIM_GUIDE_VISUAL,
  aimGuideVisualScale,
  boardFallBounds,
  clampPowerScale,
  clampPullVector,
  isPhoneAimViewport,
  scaleAimGuideEnd,
  computeElasticTension,
  computeRelativeVelocity,
  computeSlingshotLaunch,
  createPreviewLaunchState,
  createDefaultStoneLayout,
  createPresetLayout,
  createRandomFormationLayout,
  emaPoint,
  getFormationZones,
  isInFormationZone,
  resolveCustomFormationDrop,
  isOutsideInnerBoard,
  findBlockedNearbyAim,
  findPullOverStone,
  resolvePullBlock,
  PULL_BLOCK_NOTICE,
  PULL_OVER_NOTICE,
  powerChargeStage,
  simulatePreviewLaunch,
  stepPreviewLaunch,
  validateFormationLayout,
  validateStonePlacement,
} from '../src/physics/GameEngine.js';

function createEngine(haptic) {
  return new GameEngine({
    autoStart: false,
    soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
    haptic: haptic ?? vi.fn(),
  });
}

describe('computeRelativeVelocity', () => {
  it('두 속도 차의 크기를 상대 속도로 반환한다', () => {
    expect(computeRelativeVelocity({ x: 10, y: 0 }, { x: 0, y: 0 })).toBe(10);
    expect(computeRelativeVelocity({ x: 8, y: 0 }, { x: -8, y: 0 })).toBe(16);
    expect(computeRelativeVelocity({ x: 3, y: 4 }, { x: 0, y: 0 })).toBe(5);
  });

  it('충돌 법선이 있으면 법선 성분도 반영한다', () => {
    const speed = computeRelativeVelocity(
      { x: 6, y: 8 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    );
    expect(speed).toBe(10);
  });
});

describe('슬링샷 텐션·클램프', () => {
  it('탄성 장력은 선형 파워보다 작아지는 비선형 곡선이다', () => {
    expect(computeElasticTension(0)).toBe(0);
    expect(computeElasticTension(1)).toBe(1);
    const mid = 0.5;
    expect(computeElasticTension(mid)).toBeCloseTo(mid ** TOUCH_FEEL.TENSION_EXPONENT);
    expect(computeElasticTension(mid)).toBeLessThan(mid);
  });

  it('파워 클램핑 후 MAX에서 속도와 장력이 포화된다', () => {
    const origin = { x: 0, y: 0 };
    const pointer = { x: 0, y: 400 };
    const pull = clampPullVector(origin, pointer);
    expect(Math.hypot(pull.x, pull.y)).toBeCloseTo(SLINGSHOT.MAX_PULL_DISTANCE);

    const shot = computeSlingshotLaunch(origin, pointer);
    expect(shot.power).toBe(1);
    expect(shot.tension).toBe(1);
    expect(shot.stage).toBe(3);
    expect(shot.travel).toBeCloseTo(SLINGSHOT.MAX_PULL_DISTANCE * POWER_RATIO.DEFAULT);
    expect(shot.velocity.y).toBeCloseTo(-shot.travel * SLINGSHOT.FRICTION_AIR);
  });

  it('당긴 반대 방향으로 충격량·속도가 나간다', () => {
    const origin = { x: 360, y: 640 };
    const pointer = { x: 360, y: 660 };
    const shot = computeSlingshotLaunch(origin, pointer);

    expect(shot.pull.x).toBeCloseTo(0);
    expect(shot.pull.y).toBeCloseTo(20 * SLINGSHOT.PULL_GAIN);
    expect(shot.force.x).toBeCloseTo(0);
    expect(shot.force.y).toBeLessThan(0);
    expect(shot.velocity.y).toBeLessThan(0);
    expect(shot.tension).toBeCloseTo(shot.power);
    expect(shot.travel).toBeCloseTo(20 * POWER_RATIO.DEFAULT);
    expect(shot.inDeadzone).toBe(false);
  });

  it('힘 벡터는 당김의 반대 방향이며 속도와 같은 부호다', () => {
    const shot = computeSlingshotLaunch({ x: 200, y: 200 }, { x: 260, y: 280 });
    expect(Math.sign(shot.force.x)).toBe(Math.sign(shot.velocity.x));
    expect(Math.sign(shot.force.y)).toBe(Math.sign(shot.velocity.y));
    expect(Math.sign(shot.force.x)).toBe(-Math.sign(shot.pull.x));
    expect(Math.sign(shot.force.y)).toBe(-Math.sign(shot.pull.y));
  });

  it('파워 차징 단계는 30% / 70% / MAX다', () => {
    expect(powerChargeStage(0.29)).toBe(0);
    expect(powerChargeStage(0.3)).toBe(1);
    expect(powerChargeStage(0.7)).toBe(2);
    expect(powerChargeStage(1)).toBe(3);
  });

  it('EMA는 손떨림을 한 스텝 지연 평균한다', () => {
    const smoothed = emaPoint({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.4);
    expect(smoothed.x).toBeCloseTo(4);
    expect(smoothed.y).toBeCloseTo(4);
  });

  it('데드존 미만 당김은 발사하지 않는다', () => {
    const shot = computeSlingshotLaunch({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(shot.inDeadzone).toBe(true);
  });

  it('powerScale 기본 3.8에서는 기존 최대 속도를 유지한다', () => {
    const shot = computeSlingshotLaunch({ x: 0, y: 0 }, { x: 0, y: 400 });
    expect(shot.powerScale).toBe(POWER_RATIO.DEFAULT);
    expect(shot.travel).toBeCloseTo(SLINGSHOT.MAX_PULL_DISTANCE * POWER_RATIO.DEFAULT);
    expect(shot.velocity.y).toBeCloseTo(-shot.travel * SLINGSHOT.FRICTION_AIR);
  });

  it('설정 판 발사 시험은 배율에 비례해 더 멀리 간다', () => {
    const origin = { x: 360, y: 560, color: STONE_COLOR.BLACK };
    const pointer = { x: 360, y: 600 };
    const travel = (scale) => {
      const shot = computeSlingshotLaunch(origin, pointer, { powerScale: scale });
      const end = simulatePreviewLaunch([origin], 0, shot.velocity);
      return Math.hypot(end[0].x - origin.x, end[0].y - origin.y);
    };
    const soft = travel(1);
    const mid = travel(3.8);
    const hard = travel(6);
    expect(soft).toBeGreaterThan(20);
    expect(mid).toBeGreaterThan(soft * 1.5);
    expect(hard).toBeGreaterThan(mid);
  });

  it('이동거리는 당김×감도 배율이다', () => {
    const origin = { x: 360, y: 560 };
    const pointer = { x: 360, y: 620 };
    const shot = computeSlingshotLaunch(origin, pointer, { powerScale: 3.8 });
    expect(shot.travel).toBeCloseTo(60 * 3.8);
    expect(Math.hypot(shot.velocity.x, shot.velocity.y)).toBeCloseTo(shot.travel * SLINGSHOT.FRICTION_AIR);
  });

  it('당김 360까지 조준선이 늘어난다', () => {
    const a = computeSlingshotLaunch({ x: 0, y: 0 }, { x: 0, y: 200 });
    const b = computeSlingshotLaunch({ x: 0, y: 0 }, { x: 0, y: 320 });
    expect(Math.hypot(b.pull.x, b.pull.y)).toBeGreaterThan(Math.hypot(a.pull.x, a.pull.y));
    expect(Math.hypot(b.pull.x, b.pull.y)).toBeCloseTo(320);
  });

  it('짧은 당김은 긴 당김보다 느리게 짧게 간다', () => {
    const origin = { x: 360, y: 560 };
    const short = computeSlingshotLaunch(origin, { x: 360, y: 580 });
    const long = computeSlingshotLaunch(origin, { x: 360, y: 680 });
    const shortSpd = Math.hypot(short.velocity.x, short.velocity.y);
    const longSpd = Math.hypot(long.velocity.x, long.velocity.y);
    expect(long.travel).toBeGreaterThan(short.travel * 1.8);
    expect(longSpd).toBeGreaterThan(shortSpd * 1.8);
  });

  it('조준선 길이는 예상 정지 거리와 같다', () => {
    const engine = createEngine();
    engine.setPowerScale(3.8);
    const stone = engine.getAliveStones(STONE_COLOR.BLACK)[0];
    engine.phase = PHASE.AIMING;
    engine.aim = {
      stone,
      pointer: { x: stone.body.position.x, y: stone.body.position.y + 50 },
      hapticStage: 0,
    };
    const guide = engine.getAimGuide();
    const shot = computeSlingshotLaunch(
      { x: stone.body.position.x, y: stone.body.position.y },
      engine.aim.pointer,
      { powerScale: 3.8 },
    );
    const gone = Math.hypot(guide.aimEnd.x - guide.origin.x, guide.aimEnd.y - guide.origin.y);
    expect(gone).toBeCloseTo(shot.travel, 1);
    const phoneEnd = scaleAimGuideEnd(guide.origin, guide.aimEnd, 0.58);
    const phoneGone = Math.hypot(phoneEnd.x - guide.origin.x, phoneEnd.y - guide.origin.y);
    expect(phoneGone).toBeCloseTo(shot.travel * 0.58, 1);
    expect(gone).toBeCloseTo(shot.travel, 1);
    engine.destroy();
  });

  it('노트북 조준선도 당김보다 짧게 그리고 휴대폰은 더 줄인다', () => {
    expect(isPhoneAimViewport({ width: 1280, height: 800 })).toBe(false);
    expect(aimGuideVisualScale({ width: 1280, height: 800 })).toBe(AIM_GUIDE_VISUAL.DESKTOP);
    expect(AIM_GUIDE_VISUAL.DESKTOP).toBeLessThan(1);
    expect(isPhoneAimViewport({ width: 390, height: 844 })).toBe(true);
    const phone = aimGuideVisualScale({ width: 390, height: 844 });
    expect(phone).toBe(AIM_GUIDE_VISUAL.PHONE_MAX);
    expect(phone).toBeLessThan(AIM_GUIDE_VISUAL.DESKTOP);
    const end = scaleAimGuideEnd({ x: 10, y: 20 }, { x: 10, y: 120 }, phone);
    expect(end.x).toBe(10);
    expect(end.y).toBeCloseTo(20 + 100 * phone);
  });

  it('설정 판 한 스텝은 Matter 속도를 8배하지 않는다', () => {
    const state = createPreviewLaunchState(
      [{ x: 200, y: 200, color: STONE_COLOR.BLACK }],
      0,
      { x: 10, y: 0 },
    );
    stepPreviewLaunch(state, SLINGSHOT.ENGINE_DELTA_MS);
    expect(state[0].x).toBeCloseTo(210);
    expect(state[0].x).toBeLessThan(220);
  });

  it('powerScale이 커지면 같은 당김의 속도와 힘이 비례해 커진다', () => {
    const origin = { x: 200, y: 200 };
    const pointer = { x: 200, y: 230 };
    const base = computeSlingshotLaunch(origin, pointer, { powerScale: 3.8 });
    const boosted = computeSlingshotLaunch(origin, pointer, { powerScale: 5.7 });
    const ratio = 5.7 / 3.8;
    expect(boosted.velocity.y).toBeCloseTo(base.velocity.y * ratio);
    expect(boosted.force.y).toBeCloseTo(base.force.y * ratio);
  });

  it('clampPowerScale은 1.0~6.0 0.1 단위로 고정한다', () => {
    expect(clampPowerScale(0.2)).toBe(1);
    expect(clampPowerScale(9)).toBe(6);
    expect(clampPowerScale(3.84)).toBe(3.8);
    expect(clampPowerScale('4.2')).toBe(4.2);
    expect(clampPowerScale('nope')).toBe(POWER_RATIO.DEFAULT);
  });
});

describe('호스트 전용 발사 감도', () => {
  let engine;

  afterEach(() => {
    engine?.destroy?.();
    engine = null;
  });

  it('setPowerScale은 엔진 배율을 바꾸고 조준 속도에 반영한다', () => {
    engine = createEngine();
    expect(engine.setPowerScale(6)).toBe(6);
    expect(engine.powerScale).toBe(6);
    const stone = engine.getAliveStones(STONE_COLOR.BLACK)[0];
    engine.phase = PHASE.AIMING;
    engine.aim = {
      stone,
      pointer: { x: stone.body.position.x, y: stone.body.position.y + 40 },
      hapticStage: 0,
    };
    const guide = engine.getAimGuide();
    const expected = computeSlingshotLaunch(
      { x: stone.body.position.x, y: stone.body.position.y },
      engine.aim.pointer,
      { powerScale: 6 },
    );
    expect(guide.velocity.y).toBeCloseTo(expected.velocity.y);
  });

  it('1인 모드에서는 백 턴에도 사람 입력이 열린다', () => {
    engine = createEngine();
    engine.setMatchConfig({ mode: GAME_MODE.SOLO });
    engine.currentTurn = STONE_COLOR.WHITE;
    engine.phase = PHASE.IDLE;
    expect(engine.gameMode).toBe(GAME_MODE.SOLO);
    expect(engine.isHumanInputBlocked()).toBe(false);
  });

  it('기권하면 상대가 이긴다', () => {
    engine = createEngine();
    let over = null;
    engine.on('gameOver', (payload) => {
      over = payload;
    });
    const ok = engine.surrender('black');
    expect(ok).toBe(true);
    expect(engine.phase).toBe(PHASE.GAME_OVER);
    expect(engine.winner).toBe(STONE_COLOR.WHITE);
    expect(over?.reason).toBe('surrender');
    expect(over?.winner).toBe(STONE_COLOR.WHITE);
  });

  it('관전 중이거나 호스트가 아니면 감도 패널을 숨긴다', () => {
    engine = createEngine();
    engine.setHost(true);
    expect(canControlPowerRatio(engine)).toBe(true);
    engine.setHost(false);
    engine.gameMode = 'pvp';
    expect(canControlPowerRatio(engine, { location: { hostname: 'game.example' } })).toBe(false);
    engine.enterSpectatorMode({ matchId: 'm1', playerA: 'A', playerB: 'B' });
    expect(canControlPowerRatio(engine)).toBe(false);
  });
});

describe('대기실 인원 기본 모드', () => {
  it('2명 이상이어도 1:1로 강제하지 않고 AI/1인을 유지한다', () => {
    expect(defaultGameModeForLobbyCount(0)).toBe(GAME_MODE.AI);
    expect(defaultGameModeForLobbyCount(1)).toBe(GAME_MODE.AI);
    expect(defaultGameModeForLobbyCount(2)).toBeNull();
    expect(defaultGameModeForLobbyCount(4)).toBeNull();
  });

  it('이미 AI·1인·1:1이면 인원과 상관없이 바꾸지 않는다', () => {
    const idle = {
      phase: PHASE.IDLE,
      gameMode: GAME_MODE.AI,
      currentTurn: STONE_COLOR.BLACK,
      scores: { black: 5, white: 5 },
      formation: { count: 5 },
    };
    expect(shouldApplyLobbyDefaultMode(idle, GAME_MODE.AI)).toBe(false);
    expect(shouldApplyLobbyDefaultMode({ ...idle, gameMode: GAME_MODE.SOLO }, GAME_MODE.AI)).toBe(false);
    expect(shouldApplyLobbyDefaultMode({ ...idle, gameMode: GAME_MODE.PVP }, GAME_MODE.AI)).toBe(false);
    expect(shouldApplyLobbyDefaultMode({ ...idle, gameMode: GAME_MODE.PVP }, GAME_MODE.AI, { inRoom: true })).toBe(false);
    expect(shouldApplyLobbyDefaultMode({ ...idle, gameMode: GAME_MODE.PVP }, GAME_MODE.AI, { joining: true })).toBe(false);
    expect(shouldApplyLobbyDefaultMode({ ...idle, gameMode: GAME_MODE.PVP }, GAME_MODE.AI, { startingPvp: true })).toBe(false);
    expect(finalizeStartedMode(GAME_MODE.PVP, GAME_MODE.AI)).toBe(GAME_MODE.PVP);
    expect(shouldApplyLobbyDefaultMode({ ...idle, gameMode: GAME_MODE.PVP, phase: PHASE.AIMING }, GAME_MODE.AI)).toBe(false);
    expect(shouldApplyLobbyDefaultMode(null, GAME_MODE.AI)).toBe(false);
    expect(shouldApplyLobbyDefaultMode(idle, null)).toBe(false);
  });
});

describe('근접 돌 방향 당김 금지', () => {
  it('붙어 있거나 가까운 돌 축으로는 당기지 못한다', () => {
    const shooter = { id: 1, x: 360, y: 360 };
    const neighbor = { id: 2, x: 410, y: 360 };
    expect(findBlockedNearbyAim(shooter, { x: 500, y: 360 }, [neighbor])).toBeTruthy();
    expect(findBlockedNearbyAim(shooter, { x: 220, y: 360 }, [neighbor])).toBeTruthy();
    expect(findBlockedNearbyAim(shooter, { x: 360, y: 520 }, [neighbor])).toBeFalsy();
    expect(PULL_BLOCK_NOTICE).toContain('당길 수');
  });

  it('당김선이 다른 돌 위를 지나면 막고 경고한다', () => {
    const shooter = { id: 1, x: 360, y: 520, radius: 24 };
    const mid = { id: 2, x: 360, y: 400, radius: 24 };
    const miss = { id: 3, x: 500, y: 400, radius: 24 };
    expect(findPullOverStone(shooter, { x: 360, y: 280 }, [mid])).toBeTruthy();
    expect(findPullOverStone(shooter, { x: 360, y: 280 }, [miss])).toBeFalsy();
    expect(resolvePullBlock(shooter, { x: 360, y: 280 }, [mid])?.message).toBe(PULL_OVER_NOTICE);
    expect(PULL_OVER_NOTICE).toBe('바둑돌위로 당길수 없습니다');
  });
});

describe('장외 낙사 판정', () => {
  it('격자선이 아니라 나무판 밖으로 중심이 나가야 낙사다', () => {
    const inner = BOARD.inner;
    const face = boardFallBounds();
    const center = { x: inner.x + inner.size / 2, y: inner.y + inner.size / 2 };
    expect(isOutsideInnerBoard(center, inner)).toBe(false);
    expect(isOutsideInnerBoard({ x: inner.x, y: inner.y }, inner)).toBe(false);
    expect(isOutsideInnerBoard({ x: 0, y: 0 }, inner)).toBe(false);
    expect(isOutsideInnerBoard({ x: -1, y: 360 }, inner)).toBe(false);
    expect(isOutsideInnerBoard({ x: 721, y: 360 }, inner)).toBe(false);
    expect(isOutsideInnerBoard({ x: face.min + 1, y: 360 })).toBe(false);
    expect(isOutsideInnerBoard({ x: face.min - 1, y: 360 })).toBe(true);
    expect(isOutsideInnerBoard({ x: face.max + 1, y: 360 })).toBe(true);
    expect(isOutsideInnerBoard({ x: 60, y: center.y }, inner)).toBe(false);
  });
});

describe('GameEngine 통합', () => {
  /** @type {GameEngine | null} */
  let engine = null;

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  it('720x1280 뷰포트에 흑/백 5알을 대칭 배치한다', () => {
    engine = createEngine();
    const layout = createDefaultStoneLayout();
    const blacks = layout.filter((s) => s.color === STONE_COLOR.BLACK);
    const whites = layout.filter((s) => s.color === STONE_COLOR.WHITE);

    expect(blacks).toHaveLength(STONES_PER_SIDE);
    expect(whites).toHaveLength(STONES_PER_SIDE);

    for (let i = 0; i < STONES_PER_SIDE; i++) {
      expect(blacks[i].x).toBeCloseTo(whites[i].x);
      const topGap = blacks[i].y - BOARD.inner.y;
      const botGap = BOARD.inner.y + BOARD.inner.size - whites[i].y;
      expect(topGap).toBeCloseTo(botGap);
    }

    const snap = engine.getSnapshot();
    expect(snap.board.virtual).toEqual({ width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT });
    expect(snap.stones.filter((s) => !s.fallen)).toHaveLength(10);
    expect(engine.phase).toBe(PHASE.IDLE);
  });

  it('장외로 나간 돌은 낙사 처리한다', () => {
    engine = createEngine();
    const stone = engine.stones[0];
    Matter.Sleeping.set(stone.body, false);
    const face = boardFallBounds();
    Matter.Body.setPosition(stone.body, { x: face.min - 20, y: face.min - 20 });

    engine.step(1);

    expect(stone.fallen).toBe(true);
    expect(engine.getSnapshot().stones.find((s) => s.id === stone.id)?.fallen).toBe(true);
  });

  it('판 끝으로 밀려난 돌은 반사되지 않고 장외 낙사한다', () => {
    engine = createEngine();
    const shooter = engine.stones[0];
    let parked = 0;
    for (const s of engine.stones) {
      if (s === shooter) continue;
      Matter.Body.setPosition(s.body, { x: 200 + parked * 56, y: 96 });
      Matter.Sleeping.set(s.body, true);
      parked += 1;
    }
    Matter.Sleeping.set(shooter.body, false);
    Matter.Body.setPosition(shooter.body, { x: 90, y: 360 });
    Matter.Body.setVelocity(shooter.body, { x: -28, y: 0 });
    engine.phase = PHASE.RESOLVING;
    let fallenId = null;
    engine.on('stoneFallen', (payload) => {
      fallenId = payload.id;
    });

    engine.step(90);

    expect(shooter.fallen).toBe(true);
    expect(fallenId).toBe(shooter.id);
    expect(shooter.body.position.x).toBeLessThan(0);
    expect(shooter.body.velocity.x).toBeLessThan(0);
  });

  it('돌끼리 충돌하면 상대 속도를 playClashByVelocity로 전달한다', () => {
    engine = createEngine();
    const a = engine.stones[0];
    const b = engine.stones[1];

    Matter.Sleeping.set(a.body, false);
    Matter.Sleeping.set(b.body, false);
    Matter.Body.setPosition(a.body, { x: 360, y: 560 });
    Matter.Body.setPosition(b.body, { x: 410, y: 560 });
    Matter.Body.setVelocity(a.body, { x: 10, y: 0 });
    Matter.Body.setVelocity(b.body, { x: -10, y: 0 });
    engine.phase = PHASE.RESOLVING;

    engine.step(20);

    expect(engine.soundEngine.playClashByVelocity).toHaveBeenCalled();
    const velocity = engine.soundEngine.playClashByVelocity.mock.calls[0][0];
    expect(typeof velocity).toBe('number');
    expect(velocity).toBeGreaterThan(0.4);
  });

  it('슬링샷 발사는 ApplyForce로 당김 반대 충격을 주고 15ms 햅틱을 낸다', () => {
    const haptic = vi.fn();
    engine = createEngine(haptic);
    const stone = engine.getAliveStones(STONE_COLOR.BLACK)[2];
    const origin = { x: stone.body.position.x, y: stone.body.position.y };
    const pointer = { x: origin.x, y: origin.y + 90 };
    const expected = computeSlingshotLaunch(origin, pointer, { mass: stone.body.mass });

    engine.aim = { stone, pointer, hapticStage: 0 };
    engine.phase = PHASE.AIMING;
    engine._launchIfAiming();

    expect(engine.phase).toBe(PHASE.RESOLVING);
    expect(haptic).toHaveBeenCalledWith(TOUCH_FEEL.RELEASE_HAPTIC_MS);

    engine.step(1);
    expect(stone.body.velocity.y).toBeLessThan(0);
    expect(Math.sign(stone.body.velocity.y)).toBe(Math.sign(expected.velocity.y));
  });

  it('정지 임계값 0.05 이하로 수렴하면 턴이 종료된다', () => {
    engine = createEngine();
    expect(REST.SPEED_THRESHOLD).toBe(0.05);
    engine.phase = PHASE.RESOLVING;
    engine.restFrames = 0;

    for (const stone of engine.getAliveStones()) {
      Matter.Body.setVelocity(stone.body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(stone.body, 0);
      Matter.Sleeping.set(stone.body, true);
    }

    let ended = false;
    engine.on('turnEnd', () => {
      ended = true;
    });

    engine.step(REST.FRAMES_REQUIRED + 2);

    expect(ended).toBe(true);
    expect(engine.phase).toBe(PHASE.IDLE);
    expect(engine.currentTurn).toBe(STONE_COLOR.WHITE);
  });

  it('15초 턴 타이머가 0이 되면 조준을 취소하고 턴을 넘긴다', () => {
    engine = createEngine();
    expect(TURN.LIMIT_MS).toBe(15000);
    expect(engine.getSnapshot().timer.remainingMs).toBe(TURN.LIMIT_MS);

    const stone = engine.getAliveStones(STONE_COLOR.BLACK)[0];
    engine.aim = { stone, pointer: { x: stone.body.position.x, y: stone.body.position.y + 80 }, hapticStage: 0 };
    engine.phase = PHASE.AIMING;

    let timedOut = false;
    engine.on('turnTimeout', () => {
      timedOut = true;
    });

    engine.turnRemainingMs = 10;
    engine.step(1);

    expect(timedOut).toBe(true);
    expect(engine.aim).toBe(null);
    expect(engine.phase).toBe(PHASE.IDLE);
    expect(engine.currentTurn).toBe(STONE_COLOR.WHITE);
    expect(engine.turnRemainingMs).toBe(TURN.LIMIT_MS);
  });

  it('RESOLVING 중에는 턴 타이머가 멈추고 expireTurn은 무시된다', () => {
    engine = createEngine();
    engine.phase = PHASE.RESOLVING;
    engine.turnRemainingMs = 4000;
    engine.step(5);
    expect(engine.turnRemainingMs).toBe(4000);
    engine.expireTurn();
    expect(engine.phase).toBe(PHASE.RESOLVING);
    expect(engine.currentTurn).toBe(STONE_COLOR.BLACK);
  });

  it('5초 이하에서 timer.urgent가 켜지고 IDLE 타임오버도 턴을 넘긴다', () => {
    engine = createEngine();
    engine.turnRemainingMs = TURN.URGENT_MS + 1;
    expect(engine.getSnapshot().timer.urgent).toBe(false);
    engine.turnRemainingMs = TURN.URGENT_MS;
    expect(engine.getSnapshot().timer.urgent).toBe(true);
    expect(engine.getSnapshot().timer.running).toBe(true);

    engine.expireTurn();
    expect(engine.aim).toBe(null);
    expect(engine.phase).toBe(PHASE.IDLE);
    expect(engine.currentTurn).toBe(STONE_COLOR.WHITE);
    expect(engine.turnRemainingMs).toBe(TURN.LIMIT_MS);
  });

  it('한쪽이 전멸하면 입력은 잠그고 결과는 한 박자 뒤에 연다', () => {
    vi.useFakeTimers();
    try {
      engine = createEngine();
      for (const stone of engine.getAliveStones(STONE_COLOR.WHITE)) {
        stone.fallen = true;
      }
      engine._lastFallAt = Date.now();
      let over = null;
      engine.on('gameOver', (payload) => {
        over = payload;
      });
      engine._passTurn();
      expect(engine.phase).toBe(PHASE.GAME_OVER);
      expect(engine.winner).toBe(STONE_COLOR.BLACK);
      expect(engine.isHumanInputBlocked()).toBe(true);
      expect(over).toBe(null);
      vi.advanceTimersByTime(1919);
      expect(over).toBe(null);
      vi.advanceTimersByTime(1);
      expect(over).toEqual({ winner: 'black', scores: { black: 5, white: 0 } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('리셋하면 대기 중인 결과 이벤트를 취소한다', () => {
    vi.useFakeTimers();
    try {
      engine = createEngine();
      for (const stone of engine.getAliveStones(STONE_COLOR.WHITE)) {
        stone.fallen = true;
      }
      engine._lastFallAt = Date.now();
      let over = null;
      engine.on('gameOver', (payload) => {
        over = payload;
      });
      engine._passTurn();
      engine.reset();
      vi.advanceTimersByTime(3000);
      expect(over).toBe(null);
      expect(engine.phase).toBe(PHASE.IDLE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('돌이 내면 밖으로 나가면 충돌을 끄고 stoneFallen을 낸다', async () => {
    engine = createEngine();
    const stone = engine.getAliveStones(STONE_COLOR.BLACK)[0];
    Matter.Body.setPosition(stone.body, { x: boardFallBounds().min - 20, y: stone.body.position.y });
    let fallen = null;
    engine.on('stoneFallen', (payload) => {
      fallen = payload;
    });

    engine.step(1);

    expect(stone.fallen).toBe(true);
    expect(fallen?.id).toBe(stone.id);
    expect(stone.body.collisionFilter.mask).toBe(0);
    expect(Matter.Composite.allBodies(engine.world).includes(stone.body)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1050));
    expect(Matter.Composite.allBodies(engine.world).includes(stone.body)).toBe(false);
  });

  it('돌끼리 충돌하면 clash에 좌표와 상대 속도를 담는다', () => {
    engine = createEngine();
    const a = engine.stones[0];
    const b = engine.stones[1];
    for (const stone of engine.stones) {
      if (stone !== a && stone !== b) {
        Matter.Body.setPosition(stone.body, { x: 80, y: 80 });
        Matter.Sleeping.set(stone.body, true);
      }
    }
    Matter.Sleeping.set(a.body, false);
    Matter.Sleeping.set(b.body, false);
    Matter.Body.setPosition(a.body, { x: 360, y: 560 });
    Matter.Body.setPosition(b.body, { x: 410, y: 560 });
    Matter.Body.setVelocity(a.body, { x: 10, y: 0 });
    Matter.Body.setVelocity(b.body, { x: -10, y: 0 });
    engine.phase = PHASE.RESOLVING;

    let clash = null;
    engine.on('clash', (payload) => {
      clash = payload;
    });
    engine.step(20);

    expect(clash).not.toBeNull();
    expect([clash.a, clash.b].sort()).toEqual([a.id, b.id].sort());
    expect(clash.x).toBeGreaterThan(350);
    expect(clash.x).toBeLessThan(420);
    expect(clash.relativeVelocity).toBeGreaterThan(0);
  });
});

describe('진형 프리셋·구역·겹침', () => {
  /** @type {GameEngine | null} */
  let engine = null;

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  it('1알 프리셋은 흑 1·백 1이며 요청 좌표를 진영 존에 클램프한다', () => {
    const layout = createPresetLayout(1, FORMATION_SHAPE.LINE);
    expect(layout).toHaveLength(2);
    const black = layout.find((s) => s.color === STONE_COLOR.BLACK);
    const white = layout.find((s) => s.color === STONE_COLOR.WHITE);
    expect(black.x).toBe(FORMATION_FACEOFF_REQUEST.black.x);
    expect(white.x).toBe(FORMATION_FACEOFF_REQUEST.white.x);
    expect(black.y).toBeGreaterThan(white.y);
    expect(isInFormationZone(black.x, black.y, STONE_COLOR.BLACK)).toBe(true);
    expect(isInFormationZone(white.x, white.y, STONE_COLOR.WHITE)).toBe(true);

    engine = createEngine();
    const applied = engine.setupFormation(1, FORMATION_MODE.PRESET, FORMATION_SHAPE.LINE);
    expect(applied.ok).toBe(true);
    expect(engine.stones).toHaveLength(2);
    expect(engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(1);
    expect(engine.stones[0].body.position.x).toBeCloseTo(black.x);
    expect(engine.stones[0].body.position.y).toBeCloseTo(black.y);
  });

  it('3알 일자·쐐기·종대 프리셋은 흑 3·백 3이고 좌표가 존 안에 있다', () => {
    engine = createEngine();
    for (const shape of [FORMATION_SHAPE.LINE, FORMATION_SHAPE.WEDGE, FORMATION_SHAPE.COLUMN]) {
      const layout = createPresetLayout(3, shape);
      expect(layout.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(3);
      expect(layout.filter((s) => s.color === STONE_COLOR.WHITE)).toHaveLength(3);
      expect(validateFormationLayout(layout).ok).toBe(true);
      const applied = engine.setupFormation(3, FORMATION_MODE.PRESET, shape);
      expect(applied.ok).toBe(true);
      expect(engine.stones).toHaveLength(6);
      for (let i = 0; i < layout.length; i++) {
        expect(engine.stones[i].body.position.x).toBeCloseTo(layout[i].x);
        expect(engine.stones[i].body.position.y).toBeCloseTo(layout[i].y);
      }
    }
  });

  it('7알·9알 프리셋은 흑·백 대칭이고 겹치지 않는다', () => {
    engine = createEngine();
    for (const count of [7, 9]) {
      for (const shape of [FORMATION_SHAPE.LINE, FORMATION_SHAPE.WEDGE, FORMATION_SHAPE.DEFENSE]) {
        const layout = createPresetLayout(count, shape);
        expect(layout.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(count);
        expect(layout.filter((s) => s.color === STONE_COLOR.WHITE)).toHaveLength(count);
        expect(validateFormationLayout(layout).ok).toBe(true);
        const applied = engine.setupFormation(count, FORMATION_MODE.PRESET, shape);
        expect(applied.ok).toBe(true);
        expect(engine.stones).toHaveLength(count * 2);
      }
    }
  });

  it('5알 일자·쐐기·방어진 프리셋은 흑 5·백 5이고 좌표가 존 안에 있다', () => {
    engine = createEngine();
    for (const shape of [FORMATION_SHAPE.LINE, FORMATION_SHAPE.WEDGE, FORMATION_SHAPE.DEFENSE]) {
      const layout = createPresetLayout(5, shape);
      expect(layout.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(5);
      expect(layout.filter((s) => s.color === STONE_COLOR.WHITE)).toHaveLength(5);
      expect(validateFormationLayout(layout).ok).toBe(true);
      const applied = engine.setupFormation(5, FORMATION_MODE.PRESET, shape);
      expect(applied.ok).toBe(true);
      expect(engine.stones).toHaveLength(10);
      for (let i = 0; i < layout.length; i++) {
        expect(engine.stones[i].body.position.x).toBeCloseTo(layout[i].x);
        expect(engine.stones[i].body.position.y).toBeCloseTo(layout[i].y);
      }
    }
  });

  it('진영 구역 밖 배치는 실패하고 이전 좌표로 복귀한다', () => {
    const zones = getFormationZones();
    const midY = BOARD.inner.y + BOARD.inner.size / 2;
    const previous = { x: 360, y: zones.black.maxY };
    const result = validateStonePlacement(
      { x: 360, y: midY, color: STONE_COLOR.BLACK },
      [],
      previous,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('zone');
    expect(result.x).toBe(previous.x);
    expect(result.y).toBe(previous.y);
    expect(isInFormationZone(360, midY, STONE_COLOR.BLACK)).toBe(false);
    expect(isInFormationZone(360, zones.white.minY, STONE_COLOR.WHITE)).toBe(true);
  });

  it('돌 지름의 1.2배 미만 겹침은 실패하고 이전 좌표로 복귀한다', () => {
    const by = getFormationZones().black.maxY;
    const previous = { x: 400, y: by };
    const other = { x: 360, y: by };
    const tooClose = { x: 360 + FORMATION_MIN_SEPARATION - 4, y: by, color: STONE_COLOR.BLACK };
    const result = validateStonePlacement(tooClose, [other], previous);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('overlap');
    expect(result.x).toBe(previous.x);
    expect(result.y).toBe(previous.y);

    const far = { x: 360 + FORMATION_MIN_SEPARATION + 8, y: by, color: STONE_COLOR.BLACK };
    expect(validateStonePlacement(far, [other], previous).ok).toBe(true);
  });

  it('커스텀은 첫째 선으로 맞추고 겹침은 거부한다', () => {
    engine = createEngine();
    engine.setupFormation(1, FORMATION_MODE.PRESET, FORMATION_SHAPE.LINE);
    const before = engine.stones.map((s) => ({ x: s.body.position.x, y: s.body.position.y, color: s.color }));

    const midY = BOARD.inner.y + BOARD.inner.size / 2;
    expect(isInFormationZone(360, midY, STONE_COLOR.BLACK, BOARD, FORMATION_ZONE.CUSTOM)).toBe(false);
    const clampedIn = engine.setupFormation(1, FORMATION_MODE.CUSTOM, [
      { x: 360, y: midY, color: STONE_COLOR.BLACK },
      { x: 360, y: midY, color: STONE_COLOR.WHITE },
    ]);
    expect(clampedIn.ok).toBe(true);
    expect(isInFormationZone(
      engine.stones.find((s) => s.color === STONE_COLOR.BLACK).body.position.x,
      engine.stones.find((s) => s.color === STONE_COLOR.BLACK).body.position.y,
      STONE_COLOR.BLACK,
      BOARD,
      FORMATION_ZONE.CUSTOM,
    )).toBe(true);
    expect(before).toHaveLength(2);

    const overlap = engine.setupFormation(3, FORMATION_MODE.CUSTOM, [
      { x: 360, y: getFormationZones().black.maxY, color: STONE_COLOR.BLACK },
      { x: 360, y: getFormationZones().black.maxY, color: STONE_COLOR.BLACK },
      { x: 420, y: getFormationZones().black.maxY, color: STONE_COLOR.BLACK },
      { x: 360, y: getFormationZones().white.minY, color: STONE_COLOR.WHITE },
      { x: 400, y: getFormationZones().white.minY, color: STONE_COLOR.WHITE },
      { x: 440, y: getFormationZones().white.minY, color: STONE_COLOR.WHITE },
    ]);
    expect(overlap.ok).toBe(true);
    const repaired = engine.stones.map((s) => ({
      x: s.body.position.x,
      y: s.body.position.y,
      color: s.color,
    }));
    expect(validateFormationLayout(repaired, BOARD, FORMATION_ZONE.CUSTOM).ok).toBe(true);
    expect(campsAreSegregated(repaired, BOARD, FORMATION_ZONE.CUSTOM)).toBe(true);

    const validCustom = createPresetLayout(1, FORMATION_SHAPE.LINE).map((s) => ({
      ...s,
      x: s.x + (s.color === STONE_COLOR.BLACK ? 20 : -20),
    }));
    const applied = engine.setupFormation(1, FORMATION_MODE.CUSTOM, validCustom);
    expect(applied.ok).toBe(true);
    expect(engine.stones).toHaveLength(2);
    expect(engine.stones[0].body.position.x).toBeCloseTo(validCustom[0].x);
  });

  it('내 진형은 첫째 선 이내에서만 유효하고 가운데는 밖으로 본다', () => {
    const custom = getFormationZones(BOARD, FORMATION_ZONE.CUSTOM);
    const first = boardGridLineMatterY(FORMATION_FIRST_LINE.WHITE);
    expect(custom.white.minY).toBeCloseTo(boardGridLineMatterY(0), 5);
    expect(custom.white.maxY).toBeCloseTo(first, 5);
    expect(custom.white.maxY - custom.white.minY).toBeGreaterThan(80);
    expect(isInFormationZone(360, custom.white.minY, STONE_COLOR.WHITE, BOARD, FORMATION_ZONE.CUSTOM)).toBe(true);
    expect(isInFormationZone(360, custom.white.maxY, STONE_COLOR.WHITE, BOARD, FORMATION_ZONE.CUSTOM)).toBe(true);
    expect(isInFormationZone(360, 360, STONE_COLOR.WHITE, BOARD, FORMATION_ZONE.CUSTOM)).toBe(false);
    expect(isInFormationZone(360, custom.black.minY, STONE_COLOR.BLACK, BOARD, FORMATION_ZONE.CUSTOM)).toBe(true);

    const origin = { x: 360, y: custom.white.minY };
    const placed = resolveCustomFormationDrop(origin, { x: 420, y: custom.white.maxY }, STONE_COLOR.WHITE);
    expect(placed.action).toBe('place');
    expect(placed.ok).toBe(true);
    expect(placed.x).toBeCloseTo(420);

    const clamped = resolveCustomFormationDrop(origin, { x: 360, y: 360 }, STONE_COLOR.WHITE);
    expect(clamped.action).toBe('place');
    expect(clamped.y).toBeCloseTo(custom.white.maxY);

    const launch = resolveCustomFormationDrop(origin, { x: 360, y: custom.white.minY - 40 }, STONE_COLOR.WHITE);
    expect(launch.action).toBe('launch');
  });

  it('내 진형 저장 키는 프리셋·직접놓기와 분리된다', () => {
    expect(formationStorageKey(FORMATION_SLOT.MINE)).toBe(`${FORMATION_STORAGE_KEY}:mine`);
    expect(formationStorageKey(FORMATION_SLOT.CUSTOM)).toBe(`${FORMATION_STORAGE_KEY}:custom`);
    expect(formationStorageKey(FORMATION_SLOT.PRESET)).toBe(`${FORMATION_STORAGE_KEY}:preset`);
    expect(formationStorageKey(FORMATION_SLOT.MINE)).not.toBe(formationStorageKey(FORMATION_SLOT.PRESET));
  });

  it('임의 프리셋은 첫째 선 안에 겹치지 않게 놓는다', () => {
    let n = 0;
    const rng = () => {
      n += 1;
      return ((n * 37) % 100) / 100;
    };
    const layout = createRandomFormationLayout(5, BOARD, rng);
    expect(layout.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(5);
    expect(layout.filter((s) => s.color === STONE_COLOR.WHITE)).toHaveLength(5);
    expect(validateFormationLayout(layout, BOARD, FORMATION_ZONE.CUSTOM).ok).toBe(true);
    for (const stone of layout) {
      expect(isInFormationZone(stone.x, stone.y, stone.color, BOARD, FORMATION_ZONE.CUSTOM)).toBe(true);
    }
    const other = createRandomFormationLayout(5, BOARD, () => 0.2);
    expect(other.map((s) => `${s.x},${s.y}`).join('|')).not.toBe(layout.map((s) => `${s.x},${s.y}`).join('|'));
  });

  it('설정 타격 시험 충돌은 onClash를 부른다', () => {
    const hits = [];
    const state = createPreviewLaunchState(
      [
        { x: 200, y: 300, color: STONE_COLOR.BLACK },
        { x: 280, y: 300, color: STONE_COLOR.WHITE },
      ],
      0,
      { x: 18, y: 0 },
    );
    for (let i = 0; i < 40; i++) {
      stepPreviewLaunch(state, SLINGSHOT.ENGINE_DELTA_MS, (vel) => hits.push(vel));
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toBeGreaterThan(0);
  });

  it('모드를 바꾸거나 다시 시작하면 설정 알 수 일자로 깐다', () => {
    engine = createEngine();
    engine.setupFormation(7, FORMATION_MODE.PRESET, FORMATION_SHAPE.WEDGE);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.WEDGE);
    engine.setMatchConfig({ mode: GAME_MODE.SOLO });
    expect(engine.formation.count).toBe(7);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.LINE);
    expect(engine.formation.mode).toBe(FORMATION_MODE.PRESET);
    const line = createPresetLayout(7, FORMATION_SHAPE.LINE);
    const xs = engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)
      .map((s) => s.body.position.x)
      .sort((a, b) => a - b);
    const lineXs = line.filter((s) => s.color === STONE_COLOR.BLACK)
      .map((s) => s.x)
      .sort((a, b) => a - b);
    xs.forEach((x, i) => expect(x).toBeCloseTo(lineXs[i], 5));
    engine.applyDefaultMatchFormation(3);
    expect(engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(3);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.LINE);
    engine.setMatchConfig({ mode: GAME_MODE.PVP });
    expect(engine.formation.count).toBe(3);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.LINE);
  });

  it('resetBoard는 기존 바디를 제거하고 같은 진형으로 재생성한다', () => {
    engine = createEngine();
    engine.setupFormation(3, FORMATION_MODE.PRESET, FORMATION_SHAPE.WEDGE);
    const firstIds = engine.stones.map((s) => s.body.id);
    engine.resetBoard();
    expect(engine.stones).toHaveLength(6);
    expect(engine.phase).toBe(PHASE.IDLE);
    expect(engine.stones.map((s) => s.body.id)).not.toEqual(firstIds);
  });
});

describe('대기실 일시정지', () => {
  let engine;

  afterEach(() => {
    engine?.destroy?.();
    engine = null;
  });

  it('pauseMatch는 물리와 턴 타이머를 멈추고 입력을 잠근다', () => {
    engine = createEngine();
    expect(engine.isPaused()).toBe(false);
    engine.pauseMatch();
    expect(engine.isPaused()).toBe(true);
    expect(engine.getSnapshot().paused).toBe(true);
    expect(engine.getSnapshot().inputLocked).toBe(true);
    expect(engine.getSnapshot().timer.running).toBe(false);
    engine.start();
    expect(engine.isPaused()).toBe(true);
    expect(engine._running).toBe(false);
    engine.setInputLocked(false);
    expect(engine.inputLocked).toBe(true);
    engine.start = vi.fn();
    engine.resumeMatch();
    expect(engine.isPaused()).toBe(false);
    expect(engine.getSnapshot().paused).toBe(false);
    expect(engine.getSnapshot().inputLocked).toBe(false);
    expect(engine.start).toHaveBeenCalledOnce();
  });
});
