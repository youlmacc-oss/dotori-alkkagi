import { describe, expect, it } from 'vitest';
import {
  CLINIC_FAIL,
  CLINIC_WARN,
  actionCamClinicOk,
  bookSkipClinicOk,
  isLiveRealtime,
  lobbyInviteClinicOk,
  nickClinicOk,
  pullClinicOk,
  pvpExpireClinicOk,
  pvpHoldClinicOk,
  pvpInviteAcceptClinicOk,
  pvpJoinClinicOk,
  pvpPresenceClinicOk,
  pvpRearrangeClinicOk,
  readyClinicOk,
  runLobbyClinic,
} from '../src/network/LobbyClinic.js';
import {
  BOOK_SEEN_KEY,
  GUIDE_PAGES,
  INVITE_ONLY_NOTICE,
  INVITE_ONLY_OK,
  INVITE_ONLY_SEEN_KEY,
  guidePageAt,
  guidePageCount,
  BOOK_SKIP_KEY,
  hasSeenGuideBook,
  hasSeenInviteOnlyNotice,
  hasSkipGuideOnConnect,
  markGuideBookSeen,
  markInviteOnlyNoticeSeen,
  setSkipGuideOnConnect,
  shouldAutoOpenGuideBook,
  shouldOfferInviteOnlyNotice,
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
      hasLobbyInvite: true,
      hasLobbyInviteModal: true,
      hasInviteOnlyNotice: true,
      hasBookSkip: true,
      hasBookPlay: true,
    });
    expect(report.ok).toBe(true);
    expect(report.fails).toBe(0);
    expect(report.total).toBe(28);
    expect(report.items.find((row) => row.id === 'pvpJoin')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'pvpAccept')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'pvpPresence')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'pvpPlace')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'invite')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'pvpHold')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'bookSkip')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'nick')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'acorn')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'acorn')?.detail).toContain('연습 AI');
    expect(report.items.find((row) => row.id === 'realtime')?.status).toBe(CLINIC_WARN);
    expect(report.items.find((row) => row.id === 'actionCam')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'ready')?.ok).toBe(true);
    expect(report.items.find((row) => row.id === 'pull')?.ok).toBe(true);
    expect(isLiveRealtime({ constructor: { name: 'MockSupabaseClient' } })).toBe(false);
    expect(isLiveRealtime({ constructor: { name: 'DualMockSupabaseClient' } })).toBe(false);
  });

  it('엔진이 없으면 실패하고, 가이드 페이지는 9장이다', () => {
    const report = runLobbyClinic({});
    expect(report.ok).toBe(false);
    expect(report.items.find((row) => row.id === 'engine')?.status).toBe(CLINIC_FAIL);
    expect(guidePageCount()).toBe(10);
    expect(guidePageAt(0).id).toBe('cover');
    expect(guidePageAt(10).id).toBe('cover');
    expect(GUIDE_PAGES.find((page) => page.id === 'ready')?.points.some((line) => line.includes('첫째 선'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'ready')?.points.some((line) => line.includes('10부터'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'invite')?.points.some((line) => line.includes('링크'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'invite')?.lead).toContain('초대에 의해서만');
    expect(GUIDE_PAGES.find((page) => page.id === 'invite')?.points.some((line) => line.includes('거절'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'leave')?.points.some((line) => line.includes('다시하기'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'leave')?.lead).toContain('기권');
    expect(GUIDE_PAGES.find((page) => page.id === 'room')?.points.some((line) => line.includes('관전은 없습니다'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'room')?.lead).toContain('좌석은 2명');
    expect(GUIDE_PAGES.find((page) => page.id === 'sound')?.points.some((line) => line.includes('대국 중'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'cover')?.points.some((line) => line.includes('초대만'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'invite')?.points.some((line) => line.includes('참가하기'))).toBe(false);
    expect(GUIDE_PAGES.find((page) => page.id === 'ready')?.title).toContain('다시 놓기');
    expect(GUIDE_PAGES.find((page) => page.id === 'acorn')?.title).toContain('호스트');
    expect(GUIDE_PAGES.find((page) => page.id === 'acorn')?.lead).toContain('호스트');
    expect(GUIDE_PAGES.find((page) => page.id === 'acorn')?.points.some((line) => line.includes('흑') && line.includes('백'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'acorn')?.points.some((line) => line.includes('호스트가 먼저'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'acorn')?.points.some((line) => line.includes('도토리봇'))).toBe(false);
    expect(GUIDE_PAGES.find((page) => page.id === 'fall')?.points.some((line) => line.includes('액션캠'))).toBe(true);
    expect(GUIDE_PAGES.find((page) => page.id === 'sound')?.title).toContain('액션캠');
    expect(GUIDE_PAGES.find((page) => page.id === 'invite')?.title).toContain('대기방');
    expect(GUIDE_PAGES.find((page) => page.id === 'cover')?.points.some((line) => line.includes('바로시작'))).toBe(true);
    expect(renderGuidePage(GUIDE_PAGES.find((page) => page.id === 'invite'))).toContain('초대');
    expect(renderGuidePage(guidePageAt(0))).toContain('튜토리얼 시작');
    expect(renderGuidePage(guidePageAt(1))).toContain('당기고');
    expect(renderGuidePage(guidePageAt(3))).toContain('재배치');
    expect(renderClinicList(report)).toContain('clinic-row');
    expect(renderClinicList(report)).toContain('액션캠');
    expect(renderClinicList(report)).toContain('기권');
    expect(pvpJoinClinicOk()).toBe(true);
    expect(pvpInviteAcceptClinicOk()).toBe(true);
    expect(pvpPresenceClinicOk()).toBe(true);
    expect(pvpRearrangeClinicOk()).toBe(true);
    expect(readyClinicOk()).toBe(true);
    expect(pvpHoldClinicOk()).toBe(true);
    expect(nickClinicOk()).toBe(true);
    expect(pvpExpireClinicOk()).toBe(true);
    expect(bookSkipClinicOk({ hasBookSkip: true, hasBookPlay: true })).toBe(true);
    expect(INVITE_ONLY_NOTICE).toContain('초대에 의해서만');
    expect(INVITE_ONLY_NOTICE).toContain('대전방 개설후');
    expect(INVITE_ONLY_OK).toBe('확인');
    expect(shouldOfferInviteOnlyNotice({ guidebookClosed: true })).toBe(true);
    expect(shouldOfferInviteOnlyNotice({ tutorialEnded: true })).toBe(true);
    expect(shouldOfferInviteOnlyNotice({ tutorialSkipped: true })).toBe(true);
    expect(shouldOfferInviteOnlyNotice({ guidebookSkippedOnConnect: true })).toBe(true);
    expect(shouldOfferInviteOnlyNotice({ guidebookClosed: true, alreadyShown: true })).toBe(false);
    expect(shouldOfferInviteOnlyNotice({ tutorialSkipped: true, inviteJoin: true })).toBe(false);
    expect(shouldOfferInviteOnlyNotice({})).toBe(false);
    expect(lobbyInviteClinicOk({
      hasInviteCopy: true,
      hasInviteNick: true,
      hasLobbyInvite: true,
      hasLobbyInviteModal: true,
      hasInviteOnlyNotice: true,
    })).toBe(true);
    expect(lobbyInviteClinicOk({
      hasInviteCopy: true,
      hasInviteNick: true,
      hasLobbyInvite: true,
      hasLobbyInviteModal: true,
    })).toBe(false);
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
    expect(shouldAutoOpenGuideBook({ session: storage, local: storage })).toBe(false);
    const fresh = {
      getItem: (k) => (k === BOOK_SKIP_KEY ? store[k] ?? null : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
    expect(shouldAutoOpenGuideBook({ session: fresh, local: fresh })).toBe(true);
    expect(hasSkipGuideOnConnect(fresh)).toBe(false);
    setSkipGuideOnConnect(true, fresh);
    expect(hasSkipGuideOnConnect(fresh)).toBe(true);
    expect(shouldAutoOpenGuideBook({ session: fresh, local: fresh })).toBe(false);
    setSkipGuideOnConnect(false, fresh);
    expect(shouldAutoOpenGuideBook({ session: fresh, local: fresh })).toBe(true);
    expect(hasSeenInviteOnlyNotice(storage)).toBe(false);
    markInviteOnlyNoticeSeen(storage);
    expect(hasSeenInviteOnlyNotice(storage)).toBe(true);
    expect(store[INVITE_ONLY_SEEN_KEY]).toBe('1');
  });
});
