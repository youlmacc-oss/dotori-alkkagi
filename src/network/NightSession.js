/**
 * 같은 탭(F5)에서만 닉·도토리·아이디를 유지한다. 영구 전적 없음.
 */

import { parseAcorn, SESSION_ACORNS } from './AcornPolicy.js';

export const NIGHT_USER_KEY = 'dotori-alkkagi-night-user';
export const NIGHT_ACORN_KEY = 'dotori-alkkagi-night-acorns';
export const NIGHT_CLAIM_KEY = 'dotori-alkkagi-night-claim';

export function newNightUserId() {
  return `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newTabToken() {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readClaim(claimStore) {
  try {
    const raw = claimStore?.getItem?.(NIGHT_CLAIM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeNightClaim(userId, tabToken, claimStore = globalThis.localStorage) {
  const row = { userId: String(userId || ''), tab: String(tabToken || ''), at: Date.now() };
  try {
    claimStore?.setItem?.(NIGHT_CLAIM_KEY, JSON.stringify(row));
  } catch {
    /* private mode */
  }
  return row;
}

export function takeNightUserId({
  makeId = newNightUserId,
  storage,
  claimStore = globalThis.localStorage,
  tabToken,
  now = Date.now(),
  liveMs = 8000,
} = {}) {
  const token = String(tabToken || newTabToken());
  let id = readNightUserId(storage);
  const claim = readClaim(claimStore);
  const live = Boolean(claim?.userId && Number(claim.at) > 0 && now - Number(claim.at) < liveMs);
  if (id && live && claim.userId === id && claim.tab && claim.tab !== token) {
    id = '';
  }
  if (!id) {
    id = typeof makeId === 'function' ? makeId() : String(makeId || newNightUserId());
    writeNightUserId(id, storage);
  }
  writeNightClaim(id, token, claimStore);
  return { userId: id, tabToken: token };
}

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

export function ensureNightUserId(makeId = newNightUserId, storage) {
  const existing = readNightUserId(storage);
  if (existing) return existing;
  const next = typeof makeId === 'function' ? makeId() : String(makeId || newNightUserId());
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
