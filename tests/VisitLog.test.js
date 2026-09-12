import { afterEach, describe, expect, it } from 'vitest';
import {
  VISIT_LOG_KEY,
  VISIT_SESSION_GAP_MS,
  absorbVisitLog,
  formatVisitStamp,
  loadVisitLog,
  mergeVisitLogs,
  noteVisit,
  parseVisitLog,
  queryVisitLog,
} from '../src/network/VisitLog.js';

const memory = new Map();

function installMemoryStorage() {
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: () => { throw new Error('접속이력은 지우면 안 된다'); },
  };
}

describe('접속 이력', () => {
  afterEach(() => {
    memory.clear();
  });

  it('같은 유저를 다시 봐도 예전 첫 접속은 남는다', () => {
    installMemoryStorage();
    noteVisit({ userId: 'u1', nickname: '호치' }, 1_000);
    noteVisit({ userId: 'u1', nickname: '달이' }, 2_000);
    const [row] = loadVisitLog();
    expect(row.firstSeen).toBe(1000);
    expect(row.lastSeen).toBe(2000);
    expect(row.nickname).toBe('달이');
    expect(row.visits).toBe(1);
  });

  it('오래 쉬고 다시 오면 횟수만 늘고 기록은 지우지 않는다', () => {
    installMemoryStorage();
    noteVisit({ userId: 'u1', nickname: '호치' }, 1_000);
    noteVisit({ userId: 'u2', nickname: '달이' }, 1_500);
    noteVisit({ userId: 'u1', nickname: '호치' }, 1_000 + VISIT_SESSION_GAP_MS + 1);
    const rows = loadVisitLog();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.userId === 'u1')?.visits).toBe(2);
    expect(rows.find((r) => r.userId === 'u2')?.nickname).toBe('달이');
  });

  it('다른 기기의 이력을 합쳐도 아무도 빠지지 않는다', () => {
    const merged = mergeVisitLogs(
      [{ userId: 'a', nickname: '갑', firstSeen: 10, lastSeen: 20, visits: 1 }],
      [{ userId: 'b', nickname: '을', firstSeen: 5, lastSeen: 30, visits: 3 }],
    );
    expect(merged.map((r) => r.userId).sort()).toEqual(['a', 'b']);
    expect(merged.find((r) => r.userId === 'b')?.firstSeen).toBe(5);
  });

  it('깨진 저장문이 있어도 유효한 줄만 살린다', () => {
    expect(parseVisitLog('{')).toEqual([]);
    expect(parseVisitLog(JSON.stringify([{ userId: 'ok', nickname: '호치', firstSeen: 1, lastSeen: 2, visits: 1 }]))).toHaveLength(1);
  });

  it('검색은 닉과 아이디만 걸러 보여주고 원본은 그대로다', () => {
    installMemoryStorage();
    noteVisit({ userId: 'user_aa', nickname: '호치' }, 10);
    noteVisit({ userId: 'user_bb', nickname: '달이' }, 20);
    const all = loadVisitLog();
    expect(queryVisitLog(all, '달')).toHaveLength(1);
    expect(loadVisitLog()).toHaveLength(2);
    expect(VISIT_LOG_KEY).toContain('visit-log');
  });

  it('받은 이력을 흡수해도 removeItem을 쓰지 않는다', () => {
    installMemoryStorage();
    absorbVisitLog([{ userId: 'z', nickname: '금동', firstSeen: 1, lastSeen: 2, visits: 4 }]);
    expect(loadVisitLog()[0].visits).toBe(4);
    expect(formatVisitStamp(0)).toBe('-');
    expect(formatVisitStamp(Date.UTC(2026, 8, 12, 4, 7))).toMatch(/2026-09-12/);
  });
});
