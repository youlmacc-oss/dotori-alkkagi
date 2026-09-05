import { describe, expect, it } from 'vitest';
import { hitHitsFab, matchExitFabsOpen } from '../src/ui/MatchFab.js';

describe('1:1 대기 중 기권·대기방', () => {
  it('게이트가 아니라 FAB 자신을 히트한 경우만 선택 가능하다', () => {
    const fab = { contains: (el) => el === fab || el?.id === 'inner' };
    const gate = { id: 'match-start-gate' };
    expect(hitHitsFab(fab, fab)).toBe(true);
    expect(hitHitsFab({ id: 'inner' }, fab)).toBe(true);
    expect(hitHitsFab(gate, fab)).toBe(false);
    expect(hitHitsFab(null, fab)).toBe(false);
  });

  it('대기 중에도 기권·대기방 버튼은 열려 있다', () => {
    expect(matchExitFabsOpen({ surrenderHidden: false, leaveHidden: false })).toBe(true);
    expect(matchExitFabsOpen({ leaveHidden: true })).toBe(false);
  });
});
