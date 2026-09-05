/**
 * 같은 탭(F5)에서만 닉·도토리·아이디를 유지한다. 영구 전적 없음.
 */

import { parseAcorn, SESSION_ACORNS } from './AcornPolicy.js';

export const NIGHT_USER_KEY = 'dotori-alkkagi-night-user';
export const NIGHT_ACORN_KEY = 'dotori-alkkagi-night-acorns';

function nightStore(storage) {
  return storage ?? globalThis.sessionStorage;
}

export function readNightUserId(storage) {
  try {
    return nightStore(storage)?.getItem?.(NIGHT_USER_KEY) || '';
  } catch {
    return '';
  }
}

export function writeNightUserId(userId, storage) {
  const id = String(userId || '');
  try {
    const store = nightStore(storage);
    if (!id) store?.removeItem?.(NIGHT_USER_KEY);
    else store?.setItem?.(NIGHT_USER_KEY, id);
  } catch {
    /* private mode */
  }
  return id;
}

export function ensureNightUserId(makeId = () => `user_${Date.now()}`, storage) {
  const existing = readNightUserId(storage);
  if (existing) return existing;
  const next = typeof makeId === 'function' ? makeId() : String(makeId || `user_${Date.now()}`);
  return writeNightUserId(next, storage);
}

export function readNightAcorns(storage, fallback = SESSION_ACORNS) {
  try {
    const raw = nightStore(storage)?.getItem?.(NIGHT_ACORN_KEY);
    if (raw == null || raw === '') return parseAcorn(fallback);
    return parseAcorn(raw, fallback);
  } catch {
    return parseAcorn(fallback);
  }
}

export function writeNightAcorns(value, storage) {
  const n = parseAcorn(value);
  try {
    nightStore(storage)?.setItem?.(NIGHT_ACORN_KEY, String(n));
  } catch {
    /* private mode */
  }
  return n;
}
