import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FORMATION_MODE,
  FORMATION_SHAPE,
  FORMATION_SLOT,
  FORMATION_ZONE,
  GAME_MODE,
  GameEngine,
  STONE_COLOR,
  campsAreSegregated,
  clampLayoutToFormationZone,
  commitPlayLayout,
  createPresetLayout,
} from '../src/physics/GameEngine.js';
import {
  applySavedPlayFormation,
  loadPlayFormation,
  playFormationPickVisible,
  savePlayFormation,
  selectPlayFormationCount,
  selectPlayFormationShape,
} from '../src/ui/FormationModal.js';

const memory = new Map();

function installMemoryStorage() {
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
  };
}

describe('설정 저장 → 본판 진형', () => {
  afterEach(() => {
    memory.clear();
  });

  it('저장한 7·9알 배치를 다시 읽어도 본판 수가 같다', () => {
    installMemoryStorage();
    const engine = new GameEngine({
      autoStart: false,
      soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
    });
    const layout = commitPlayLayout(7, [], undefined, FORMATION_ZONE.CUSTOM);
    engine.setupFormation(7, FORMATION_MODE.CUSTOM, layout);
    savePlayFormation({
      count: 7,
      mode: FORMATION_MODE.CUSTOM,
      shape: 'line',
      positions: layout,
    });
    const loaded = loadPlayFormation();
    expect(loaded.count).toBe(7);
    expect(loaded.positions).toHaveLength(14);
    expect(campsAreSegregated(loaded.positions, undefined, FORMATION_ZONE.CUSTOM)).toBe(true);
    const again = engine.setupFormation(loaded.count, FORMATION_MODE.CUSTOM, loaded.positions);
    expect(again.ok).toBe(true);
    expect(engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(7);
    expect(engine.stones.filter((s) => s.color === STONE_COLOR.WHITE)).toHaveLength(7);
    const started = applySavedPlayFormation(engine, loaded);
    expect(started.ok).toBe(true);
    expect(engine.formation.count).toBe(7);
    expect(engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(7);
    const savedXs = layout.filter((s) => s.color === STONE_COLOR.BLACK)
      .map((s) => s.x)
      .sort((a, b) => a - b);
    const liveXs = engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)
      .map((s) => s.body.position.x)
      .sort((a, b) => a - b);
    liveXs.forEach((x, i) => expect(x).toBeCloseTo(savedXs[i], 5));
    engine.destroy();
  });

  it('설정에서 저장한 쐐기를 본판에 그대로 올린다', () => {
    installMemoryStorage();
    const engine = new GameEngine({
      autoStart: false,
      soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
    });
    const wedge = clampLayoutToFormationZone(
      createPresetLayout(5, FORMATION_SHAPE.WEDGE),
      undefined,
      FORMATION_ZONE.CUSTOM,
    );
    savePlayFormation({
      count: 5,
      mode: FORMATION_MODE.PRESET,
      shape: FORMATION_SHAPE.WEDGE,
      slot: FORMATION_SLOT.PRESET,
      positions: wedge,
    });
    engine.setMatchConfig({ mode: GAME_MODE.AI });
    const applied = applySavedPlayFormation(engine, loadPlayFormation());
    expect(applied.ok).toBe(true);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.WEDGE);
    const savedYs = wedge.filter((s) => s.color === STONE_COLOR.BLACK)
      .map((s) => s.y)
      .sort((a, b) => a - b);
    const liveYs = engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)
      .map((s) => s.body.position.y)
      .sort((a, b) => a - b);
    liveYs.forEach((y, i) => expect(y).toBeCloseTo(savedYs[i], 5));
    engine.destroy();
  });

  it('시작 전 일자형·쐐기형·방어형을 고르면 본판 진형이 바뀐다', () => {
    installMemoryStorage();
    const engine = new GameEngine({
      autoStart: false,
      soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
    });
    savePlayFormation({
      count: 5,
      mode: FORMATION_MODE.PRESET,
      shape: FORMATION_SHAPE.LINE,
      positions: createPresetLayout(5, FORMATION_SHAPE.LINE),
    });
    expect(selectPlayFormationShape(engine, FORMATION_SHAPE.WEDGE).ok).toBe(true);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.WEDGE);
    expect(selectPlayFormationShape(engine, FORMATION_SHAPE.DEFENSE).ok).toBe(true);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.DEFENSE);
    expect(selectPlayFormationShape(engine, FORMATION_SHAPE.LINE).ok).toBe(true);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.LINE);
    expect(loadPlayFormation().shape).toBe(FORMATION_SHAPE.LINE);
    engine.destroy();
  });

  it('모드를 바꿔 다시 깔아도 설정해 둔 진형을 다시 올린다', () => {
    installMemoryStorage();
    const engine = new GameEngine({
      autoStart: false,
      soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
    });
    const wedge = clampLayoutToFormationZone(
      createPresetLayout(5, FORMATION_SHAPE.WEDGE),
      undefined,
      FORMATION_ZONE.CUSTOM,
    );
    savePlayFormation({
      count: 5,
      mode: FORMATION_MODE.PRESET,
      shape: FORMATION_SHAPE.WEDGE,
      slot: FORMATION_SLOT.PRESET,
      positions: wedge,
    });
    engine.setMatchConfig({ mode: GAME_MODE.AI });
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.LINE);
    const again = applySavedPlayFormation(engine, loadPlayFormation());
    expect(again.ok).toBe(true);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.WEDGE);
    engine.destroy();
  });

  it('시작 전 3·5·7·9알을 고르면 본판 수가 바뀐다', () => {
    installMemoryStorage();
    const engine = new GameEngine({
      autoStart: false,
      soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
    });
    savePlayFormation({
      count: 5,
      mode: FORMATION_MODE.PRESET,
      shape: FORMATION_SHAPE.WEDGE,
      positions: createPresetLayout(5, FORMATION_SHAPE.WEDGE),
    });
    expect(selectPlayFormationCount(engine, 7).ok).toBe(true);
    expect(engine.formation.count).toBe(7);
    expect(engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(7);
    expect(engine.formation.shape).toBe(FORMATION_SHAPE.WEDGE);
    expect(selectPlayFormationCount(engine, 3).ok).toBe(true);
    expect(engine.formation.count).toBe(3);
    expect(engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(3);
    expect(loadPlayFormation().count).toBe(3);
    expect(selectPlayFormationCount(engine, 9).ok).toBe(true);
    expect(engine.formation.count).toBe(9);
    expect(engine.stones.filter((s) => s.color === STONE_COLOR.BLACK)).toHaveLength(9);
    engine.destroy();
  });

  it('1인·AI만 시작 전에 진형 고르기를 보여 준다', () => {
    const wait = { inMatch: true, awaitingStart: true };
    expect(playFormationPickVisible({ ...wait, mode: GAME_MODE.SOLO })).toBe(true);
    expect(playFormationPickVisible({ ...wait, mode: GAME_MODE.AI })).toBe(true);
    expect(playFormationPickVisible({ ...wait, mode: GAME_MODE.PVP })).toBe(false);
    expect(playFormationPickVisible({ ...wait, mode: GAME_MODE.AI, awaitingStart: false })).toBe(false);
    expect(playFormationPickVisible({ ...wait, mode: GAME_MODE.AI, lobby: true })).toBe(false);
  });

  it('미리보기만 바꿔도 본판 돌 수는 그대로다', () => {
    const engine = new GameEngine({
      autoStart: false,
      soundEngine: { playClashByVelocity: vi.fn(), unlock: vi.fn() },
    });
    const before = engine.stones.length;
    const preview = commitPlayLayout(9, [], undefined, FORMATION_ZONE.CUSTOM);
    expect(preview).toHaveLength(18);
    expect(engine.stones).toHaveLength(before);
    engine.destroy();
  });
});
