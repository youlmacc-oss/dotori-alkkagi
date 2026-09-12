/**
 * 대기실 접속 이력. 앱은 이 기록을 지우지 않는다. 재배포·캐시 소거와도 키가 분리된다.
 */

export const VISIT_LOG_KEY = 'dotori-alkkagi:visit-log';
export const VISIT_LOG_EVENT = 'visit_log';
export const VISIT_SESSION_GAP_MS = 30 * 60 * 1000;

export function visitUserId(row) {
  return String(row?.userId ?? row?.id ?? '').trim();
}

export function normalizeVisit(row, at = Date.now()) {
  const userId = visitUserId(row);
  if (!userId) return null;
  const t = Number(at ?? row?.lastSeen ?? row?.at);
  const when = Number.isFinite(t) && t > 0 ? t : Number(at) || Date.now();
  const first = Number(row?.firstSeen);
  const visits = Math.max(1, Math.floor(Number(row?.visits) || 1));
  return {
    userId,
    nickname: String(row?.nickname ?? '').trim().slice(0, 5),
    firstSeen: Number.isFinite(first) && first > 0 ? first : when,
    lastSeen: when,
    visits,
  };
}

export function mergeVisit(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const newer = b.lastSeen >= a.lastSeen ? b : a;
  return {
    userId: a.userId,
    nickname: newer.nickname || a.nickname || b.nickname,
    firstSeen: Math.min(a.firstSeen, b.firstSeen),
    lastSeen: Math.max(a.lastSeen, b.lastSeen),
    visits: Math.max(a.visits, b.visits),
  };
}

export function mergeVisitLogs(local = [], incoming = []) {
  const byId = new Map();
  for (const raw of [...local, ...incoming]) {
    const row = normalizeVisit(raw, raw?.lastSeen);
    if (!row) continue;
    byId.set(row.userId, mergeVisit(byId.get(row.userId), row));
  }
  return [...byId.values()].sort((a, b) => b.lastSeen - a.lastSeen || a.userId.localeCompare(b.userId));
}

export function parseVisitLog(raw) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : data?.rows;
    return mergeVisitLogs([], Array.isArray(rows) ? rows : []);
  } catch {
    return [];
  }
}

function storeOf(storage) {
  return storage ?? globalThis.localStorage;
}

export function loadVisitLog(storage) {
  try {
    return parseVisitLog(storeOf(storage)?.getItem?.(VISIT_LOG_KEY));
  } catch {
    return [];
  }
}

export function writeVisitLog(rows, storage) {
  const next = mergeVisitLogs([], rows);
  try {
    storeOf(storage)?.setItem?.(VISIT_LOG_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
  return next;
}

export function shouldCountVisit(existing, at = Date.now()) {
  if (!existing) return true;
  return Number(at) - Number(existing.lastSeen) >= VISIT_SESSION_GAP_MS;
}

export function noteVisit(row, at = Date.now(), storage) {
  const incoming = normalizeVisit(row, at);
  if (!incoming) return loadVisitLog(storage);
  const list = loadVisitLog(storage);
  const prev = list.find((item) => item.userId === incoming.userId) || null;
  const count = shouldCountVisit(prev, incoming.lastSeen);
  const next = mergeVisit(prev, incoming);
  if (next) next.visits = (prev?.visits || 0) + (count ? 1 : 0) || 1;
  const merged = mergeVisitLogs(list.filter((item) => item.userId !== incoming.userId), next ? [next] : []);
  return writeVisitLog(merged, storage);
}

export function absorbVisitLog(incoming, storage) {
  return writeVisitLog(mergeVisitLogs(loadVisitLog(storage), incoming), storage);
}

export function queryVisitLog(rows = [], q = '') {
  const text = String(q ?? '').trim().toLowerCase();
  if (!text) return rows;
  return rows.filter((row) => (
    String(row.nickname || '').toLowerCase().includes(text)
    || String(row.userId || '').toLowerCase().includes(text)
  ));
}

export function formatVisitStamp(ts) {
  const d = new Date(Number(ts) || 0);
  if (!Number.isFinite(d.getTime()) || d.getTime() <= 0) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
