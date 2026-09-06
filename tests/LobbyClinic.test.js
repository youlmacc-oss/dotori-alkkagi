import { describe, expect, it } from 'vitest';
import {
  CLINIC_FAIL,
  CLINIC_WARN,
  actionCamClinicOk,
  isLiveRealtime,
  pullClinicOk,
  readyClinicOk,
  runLobbyClinic,
} from '../src/network/LobbyClinic.js';
import {
  BOOK_SEEN_KEY,
  GUIDE_PAGES,
  guidePageAt,
  guidePageCount,
  hasSeenGuideBook,
  markGuideBookSeen,
  renderClinicList,
  renderGuidePage,
} from '../src/ui/GuideBook.js';

describe('대기실 자가진단', () => {
  it('핵심 룰과 연동이 붙으면 실패 없이 통과한다', () => {
    const report = runLobbyClinic({
      engine: {},
      renderer: {},
      soundUnlocked: true,
      volume: 0.8,
      muted: false,
      userId: 'user_1',
      nickname: '달이',
      acorns: 9,
      nightUserId: 'user_1',
      hasSolo: true,
      hasAi: true,
      hasPvp: true,
      pvpWaitHint: '상대 게이머가 들어올 때까지 대기합니다.',
      hasStartGate: true,
      hasReadyAsk: true,
      hasSurrender: true,
      hasLeave: true,
      hasVolume: true,
      hasActionCam: true,
      hasRearrangeAsk: true,
      actionCamOn: true,
      rearrangeAskOn: true,
      pullOverNotice: '바둑돌위로 당길수 없습니다',
      pullBlockNotice: '붙어 있는 돌 방향으로는 당길 수 없습니다.',
      killCamSlowMo: 1.5,
      killCamOffSkips: true,
      realtimeLive: false,
      connected: false,
      lobbyCap: 10,
      hasInviteCopy: true,
      hasInviteNick: true,
    });
    expect(report.ok).toBe(true);
    expect(report.fails).toBe(0);
    expect(report.total).toBe(20);
    expect(report.items.find((row) => row.id === 'realtime')?.status).toBe(CLINIC_WARN);
    expect(report.items.find((row) => row.id === 'actionCam')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'ready')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'pull')?.ok).toBe(true);
    expect(isLiveRealtime({ constructor: { name: 'MockSupabaseClient' } })).toBe(false);
  });

  it('엔진이 없으면 실패하고, 가이드 페이지는 9장이다', () => {
    const report = runLobbyClinic({});
    expect(report.ok).toBe(false);
    expect(report.items.find((row) => row.id === 'engine')?.status).toBe(CLINIC_FAIL);
    expect(guidePageCount()).toBe(9);
    expect(guidePageAt(0).id).toBe('cover');
    expect(guidePageAt(9).id).toBe('cover');
    expect(GUIDE_PAGES[3].id).toBe('ready');
    expect(GUIDE_PAGES[3].title).toContain('다시 놓기');
    expect(GUIDE_PAGES[4].title).toContain('먼저');
    expect(GUIDE_PAGES[5].points.some((line) => line.includes('액션캠'))).toBe(true);
    expect(GUIDE_PAGES[8].title).toContain('액션캠');
    expect(renderGuidePage(guidePageAt(0))).toContain('튜토리얼 시작');
    expect(renderGuidePage(guidePageAt(1))).toContain('당기고');
    expect(renderGuidePage(guidePageAt(3))).toContain('재배치');
    expect(renderClinicList(report)).toContain('clinic-row');
    expect(renderClinicList(report)).toContain('액션캠');
    expect(readyClinicOk()).toBe(true);
    expect(actionCamClinicOk({ hasActionCam: true, killCamOffSkips: true })).toBe(true);
    expect(actionCamClinicOk({ hasActionCam: true, killCamOffSkips: false })).toBe(false);
    expect(pullClinicOk({
      pullOverNotice: '바둑돌위로 당길수 없습니다',
      pullBlockNotice: '붙어 있는 돌 방향으로는 당길 수 없습니다.',
    })).toBe(true);
    const store = {};
    const storage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
    };
    expect(hasSeenGuideBook(storage)).toBe(false);
    markGuideBookSeen(storage);
    expect(hasSeenGuideBook(storage)).toBe(true);
    expect(store[BOOK_SEEN_KEY]).toBe('1');
  });
});
