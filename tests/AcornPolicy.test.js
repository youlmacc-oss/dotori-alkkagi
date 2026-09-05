import { describe, expect, it } from 'vitest';
import {
  ACORN_HISTORY_KEY,
  SESSION_ACORNS,
  clearAcornHistory,
  parseAcorn,
  settleSessionAcorns,
  shouldForfeitOnLeave,
  shouldSettleAcorns,
} from '../src/network/AcornPolicy.js';

describe('접속 중 도토리 정책', () => {
  it('접속 시 10개로 시작하고 이력을 지운다', () => {
    const store = { [ACORN_HISTORY_KEY]: '3' };
    const storage = {
      removeItem: (k) => { delete store[k]; },
    };
    expect(clearAcornHistory(storage)).toBe(SESSION_ACORNS);
    expect(store[ACORN_HISTORY_KEY]).toBeUndefined();
    expect(parseAcorn(undefined)).toBe(10);
  });

  it('1:1이 시작된 뒤에만 승 +1 패 -1이고 음수를 허용한다', () => {
    const win = { mode: 'pvp', started: true, winner: 'black', myColor: 'black' };
    const lose = { mode: 'pvp', started: true, winner: 'white', myColor: 'black' };
    expect(settleSessionAcorns(10, win)).toBe(11);
    expect(settleSessionAcorns(10, lose)).toBe(9);
    expect(settleSessionAcorns(0, lose)).toBe(-1);
    expect(settleSessionAcorns(-1, lose)).toBe(-2);
    expect(shouldSettleAcorns({ mode: 'ai', started: true, winner: 'black', myColor: 'black' })).toBe(false);
    expect(shouldSettleAcorns({ mode: 'solo', started: true, winner: 'black', myColor: 'black' })).toBe(false);
    expect(settleSessionAcorns(10, { mode: 'ai', started: true, winner: 'black', myColor: 'black' })).toBe(10);
    expect(settleSessionAcorns(10, { mode: 'solo', started: true, winner: 'white', myColor: 'black' })).toBe(10);
    expect(settleSessionAcorns(10, { mode: 'pvp', started: false, winner: 'white', myColor: 'black' })).toBe(10);
    expect(settleSessionAcorns(10, { mode: 'pvp', started: true, winner: 'draw', myColor: 'black' })).toBe(10);
    expect(settleSessionAcorns(10, { mode: 'pvp', started: true, winner: 'black', spectating: true, myColor: 'black' })).toBe(10);
  });

  it('1:1이 시작된 뒤 나가기·기권만 몰수하고, 대기 중 나가기는 정산하지 않는다', () => {
    expect(shouldForfeitOnLeave({ mode: 'pvp', started: true, phase: 'idle' })).toBe(true);
    expect(shouldForfeitOnLeave({ mode: 'pvp', started: true, phase: 'resolving' })).toBe(true);
    expect(shouldForfeitOnLeave({ mode: 'pvp', started: false, phase: 'idle' })).toBe(false);
    expect(shouldForfeitOnLeave({ mode: 'pvp', started: true, phase: 'gameOver' })).toBe(false);
    expect(shouldForfeitOnLeave({ mode: 'pvp', started: true, spectating: true, phase: 'spectating' })).toBe(false);
    expect(shouldForfeitOnLeave({ mode: 'ai', started: true, phase: 'idle' })).toBe(false);
    expect(shouldForfeitOnLeave({ mode: 'solo', started: true, phase: 'idle' })).toBe(false);
    const leaveLose = { mode: 'pvp', started: true, winner: 'white', myColor: 'black' };
    expect(settleSessionAcorns(10, leaveLose)).toBe(9);
  });
});
