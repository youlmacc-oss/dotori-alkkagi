import { afterEach, describe, expect, it } from 'vitest';
import {
  FORMATION_SLOT,
  FORMATION_STORAGE_KEY,
  createPresetLayout,
} from '../src/physics/GameEngine.js';
import { loadFormationSlot, saveFormationSlot } from '../src/ui/FormationModal.js';

const memory = new Map();

function installMemoryStorage() {
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
  };
}

describe('내 진형 저장 슬롯', () => {
  afterEach(() => {
    memory.clear();
  });

  it('프리셋으로 저장해도 내 진형 열기는 내 진형만 읽는다', () => {
    installMemoryStorage();
    const mine = createPresetLayout(5);
    const preset = createPresetLayout(3);
    saveFormationSlot(FORMATION_SLOT.MINE, { count: 5, positions: mine });
    saveFormationSlot(FORMATION_SLOT.PRESET, { count: 3, positions: preset });
    localStorage.setItem(FORMATION_STORAGE_KEY, JSON.stringify({
      count: 3,
      source: 'preset',
      positions: preset,
    }));

    const loaded = loadFormationSlot(FORMATION_SLOT.MINE);
    expect(loaded).not.toBeNull();
    expect(loaded.count).toBe(5);
    expect(loaded.positions).toHaveLength(10);
    expect(loadFormationSlot(FORMATION_SLOT.PRESET).count).toBe(3);
  });
});
