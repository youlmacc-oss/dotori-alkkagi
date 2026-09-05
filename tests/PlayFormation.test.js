import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FORMATION_MODE,
  FORMATION_ZONE,
  GameEngine,
  STONE_COLOR,
  campsAreSegregated,
  commitPlayLayout,
} from '../src/physics/GameEngine.js';
import { loadPlayFormation, savePlayFormation } from '../src/ui/FormationModal.js';

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
    engine.destroy();
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
