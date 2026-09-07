import { describe, expect, it, vi } from 'vitest';
import {
  FORMATION_EDGE_LINE,
  FORMATION_SECOND_LINE,
  FORMATION_ZONE,
  GAME_MODE,
  GameEngine,
  STONE_COLOR,
  boardGridLineMatterX,
  boardGridLineMatterY,
  getFormationZones,
  getRearrangeZones,
  isInFormationZone,
  isInRearrangeZone,
  rearrangeZoneRects,
  resolveMatchRearrangeDrop,
} from '../src/physics/GameEngine.js';

function createEngine() {
  return new GameEngine({
    autoStart: false,
    soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
    haptic: vi.fn(),
  });
}

describe('대전방 재배치 규칙', () => {
  it('1인은 어느 색이든 옮기고 커스텀 존을 따른다', () => {
    const engine = createEngine();
    engine.setMatchConfig({ mode: GAME_MODE.SOLO });
    engine.setPlacementOnly(true);
    engine.pauseMatch();
    const black = engine.getAliveStones(STONE_COLOR.BLACK)[0];
    const white = engine.getAliveStones(STONE_COLOR.WHITE)[0];
    expect(engine.canPlaceStone(black)).toBe(true);
    expect(engine.canPlaceStone(white)).toBe(true);
    const zones = getFormationZones(engine.board, FORMATION_ZONE.CUSTOM);
    const dest = { x: black.body.position.x + 18, y: zones.black.maxY - 8 };
    const moved = engine.placeStoneAt(black, dest);
    expect(moved.ok).toBe(true);
    expect(isInFormationZone(moved.x, moved.y, STONE_COLOR.BLACK, engine.board, FORMATION_ZONE.CUSTOM)).toBe(true);
  });

  it('1:1 조인은 자기 진영만 옮기고 겹치면 되돌린다', () => {
    const engine = createEngine();
    engine.setMatchConfig({ mode: GAME_MODE.PVP });
    engine.setHost(false);
    engine.setPlacementOnly(true);
    const black = engine.getAliveStones(STONE_COLOR.BLACK)[0];
    const white = engine.getAliveStones(STONE_COLOR.WHITE)[0];
    expect(engine.canPlaceStone(black)).toBe(false);
    expect(engine.canPlaceStone(white)).toBe(true);
    const origin = { x: white.body.position.x, y: white.body.position.y };
    const neighbor = engine.getAliveStones(STONE_COLOR.WHITE).find((s) => s.id !== white.id);
    const overlap = engine.placeStoneAt(white, { x: neighbor.body.position.x, y: neighbor.body.position.y });
    expect(overlap.ok).toBe(false);
    expect(white.body.position.x).toBeCloseTo(origin.x, 5);
    expect(white.body.position.y).toBeCloseTo(origin.y, 5);
  });

  it('재배치가 꺼지면 발사 입력으로 돌아가지 않고 자리만 유지한다', () => {
    const engine = createEngine();
    engine.setMatchConfig({ mode: GAME_MODE.AI });
    engine.setPlacementOnly(true);
    const black = engine.getAliveStones(STONE_COLOR.BLACK)[0];
    const zones = getFormationZones(engine.board, FORMATION_ZONE.CUSTOM);
    engine.placeStoneAt(black, { x: black.body.position.x - 12, y: zones.black.maxY - 10 });
    const kept = { x: black.body.position.x, y: black.body.position.y };
    engine.setPlacementOnly(false);
    expect(engine.placementOnly).toBe(false);
    expect(black.body.position.x).toBeCloseTo(kept.x, 5);
    expect(black.body.position.y).toBeCloseTo(kept.y, 5);
  });

  it('시작 전 재배치는 둘째 선 밖으로 나가도 발사하지 않고 존 안에 고정한다', () => {
    const engine = createEngine();
    engine.setMatchConfig({ mode: GAME_MODE.AI });
    engine.setPlacementOnly(true);
    engine.pauseMatch();
    const black = engine.getAliveStones(STONE_COLOR.BLACK)[0];
    const zones = getRearrangeZones();
    const origin = { x: black.body.position.x, y: black.body.position.y };
    const offBack = resolveMatchRearrangeDrop(
      origin,
      { x: origin.x, y: zones.black.maxY + 80 },
      STONE_COLOR.BLACK,
    );
    expect(offBack.action).toBe('place');
    expect(offBack.ok).toBe(true);
    expect(offBack.y).toBeCloseTo(zones.black.maxY, 5);

    const towardCenter = { x: origin.x, y: zones.black.minY - 40 };
    const moved = engine.placeStoneAt(black, towardCenter, origin);
    expect(moved.ok).toBe(true);
    expect(isInRearrangeZone(moved.x, moved.y, STONE_COLOR.BLACK)).toBe(true);
    expect(moved.y).toBeGreaterThanOrEqual(zones.black.minY - 1e-6);
    expect(engine.getSnapshot().placementColor).toBe(STONE_COLOR.BLACK);
    expect(rearrangeZoneRects(engine.board, STONE_COLOR.BLACK)).toHaveLength(1);
    expect(rearrangeZoneRects(engine.board)).toHaveLength(2);
  });

  it('재배치는 둘째 선만 막고 좌우·자기 끝은 바둑판 끝까지 연다', () => {
    const zones = getRearrangeZones();
    const left = boardGridLineMatterX(FORMATION_EDGE_LINE.MIN);
    const right = boardGridLineMatterX(FORMATION_EDGE_LINE.MAX);
    const bottom = boardGridLineMatterY(FORMATION_EDGE_LINE.MAX);
    const second = boardGridLineMatterY(FORMATION_SECOND_LINE.BLACK);
    expect(zones.minX).toBeCloseTo(left, 5);
    expect(zones.maxX).toBeCloseTo(right, 5);
    expect(zones.black.maxY).toBeCloseTo(bottom, 5);
    expect(zones.black.minY).toBeCloseTo(second, 5);
    expect(zones.white.minY).toBeCloseTo(boardGridLineMatterY(FORMATION_EDGE_LINE.MIN), 5);
    expect(zones.white.maxY).toBeCloseTo(boardGridLineMatterY(FORMATION_SECOND_LINE.WHITE), 5);
    expect(zones.maxX - zones.minX).toBeGreaterThan(getFormationZones(undefined, FORMATION_ZONE.CUSTOM).maxX
      - getFormationZones(undefined, FORMATION_ZONE.CUSTOM).minX + 40);
    const engine = createEngine();
    engine.setMatchConfig({ mode: GAME_MODE.AI });
    engine.setPlacementOnly(true);
    const black = engine.getAliveStones(STONE_COLOR.BLACK)[0];
    const origin = { x: black.body.position.x, y: black.body.position.y };
    const corner = engine.placeStoneAt(black, { x: left, y: bottom }, origin);
    expect(corner.ok).toBe(true);
    expect(corner.x).toBeCloseTo(left, 5);
    expect(corner.y).toBeCloseTo(bottom, 5);
    expect(isInFormationZone(corner.x, corner.y, STONE_COLOR.BLACK, engine.board, FORMATION_ZONE.CUSTOM)).toBe(false);
  });

  it('1인은 일시정지 중에도 흑백 모두 둘째 선 안에서 옮긴다', () => {
    const engine = createEngine();
    engine.setMatchConfig({ mode: GAME_MODE.SOLO });
    engine.setPlacementOnly(true);
    engine.pauseMatch();
    const white = engine.getAliveStones(STONE_COLOR.WHITE)[0];
    const zones = getFormationZones(engine.board, FORMATION_ZONE.CUSTOM);
    const dest = { x: white.body.position.x + 16, y: zones.white.maxY - 6 };
    const moved = engine.placeStoneAt(white, dest);
    expect(engine.canPlaceStone(white)).toBe(true);
    expect(moved.ok).toBe(true);
    expect(engine.getSnapshot().placementColor).toBeNull();
    expect(engine.getSnapshot().paused).toBe(true);
  });
});
