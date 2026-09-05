import { describe, expect, it, vi } from 'vitest';
import {
  FORMATION_ZONE,
  GAME_MODE,
  GameEngine,
  STONE_COLOR,
  getFormationZones,
  isInFormationZone,
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
});
