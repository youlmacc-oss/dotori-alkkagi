import { describe, expect, it } from 'vitest';
import {
  NIGHT_ACORN_KEY,
  NIGHT_USER_KEY,
  ensureNightUserId,
  readNightAcorns,
  readNightUserId,
  writeNightAcorns,
  writeNightUserId,
} from '../src/network/NightSession.js';
import {
  NICKNAME_STORAGE_KEY,
  clearPermanentNickname,
  readStoredNickname,
  writeStoredNickname,
} from '../src/network/Nickname.js';
import { ACORN_HISTORY_KEY, SESSION_ACORNS, clearAcornHistory } from '../src/network/AcornPolicy.js';

function memoryStore(start = {}) {
  const store = { ...start };
  return {
    store,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

describe('같은 밤 세션', () => {
  it('탭 세션이면 아이디·도토리·닉을 유지하고 음수도 남긴다', () => {
    const storage = memoryStore();
    const id = ensureNightUserId(() => 'user_night', storage);
    expect(ensureNightUserId(() => 'user_other', storage)).toBe(id);
    expect(readNightUserId(storage)).toBe('user_night');
    expect(writeNightAcorns(-2, storage)).toBe(-2);
    expect(readNightAcorns(storage)).toBe(-2);
    writeStoredNickname('달이', storage);
    expect(readStoredNickname(storage)).toBe('달이');
    expect(storage.store[NIGHT_USER_KEY]).toBe('user_night');
    expect(storage.store[NIGHT_ACORN_KEY]).toBe('-2');
    expect(storage.store[NICKNAME_STORAGE_KEY]).toBe('달이');
  });

  it('값이 없으면 도토리 10으로 시작하고, 영구 저장은 지운다', () => {
    const session = memoryStore();
    expect(readNightAcorns(session)).toBe(SESSION_ACORNS);
    expect(writeNightUserId('', session)).toBe('');
    expect(readNightUserId(session)).toBe('');
    const local = memoryStore({
      [NICKNAME_STORAGE_KEY]: '옛닉',
      [ACORN_HISTORY_KEY]: '3',
    });
    clearPermanentNickname(local);
    expect(clearAcornHistory(local)).toBe(SESSION_ACORNS);
    expect(local.store[NICKNAME_STORAGE_KEY]).toBeUndefined();
    expect(local.store[ACORN_HISTORY_KEY]).toBeUndefined();
  });
});
