import { describe, expect, it } from 'vitest';
import {
  FIRST_HINT,
  FIRST_HINT_AFTER_MS,
  PEER_REARRANGE_HINT,
  READY_ASK,
  READY_ASK_MS,
  READY_NO,
  READY_YES,
  REARRANGE_MS,
  answerReady,
  createMatchReady,
  isPeerRearranging,
  rearrangeCountDown,
  rearrangeCountHint,
  skipReadyAsk,
  stepMatchReady,
} from '../src/network/MatchReady.js';

describe('대전방 재배치·시작 타이밍', () => {
  it('진입 직후 5초만 재배치 의사를 묻고 시작 버튼은 숨긴다', () => {
    const state = createMatchReady(0);
    const t0 = stepMatchReady(state, 0);
    expect(READY_ASK).toContain('재배치');
    expect(READY_YES).toBe('예');
    expect(READY_NO).toBe('아니오');
    expect(t0.askVisible).toBe(true);
    expect(t0.startVisible).toBe(false);
    expect(t0.firstHint).toBe(false);
    expect(t0.rearranging).toBe(false);
    expect(stepMatchReady(state, READY_ASK_MS - 1).askVisible).toBe(true);
    expect(stepMatchReady(state, READY_ASK_MS).askVisible).toBe(false);
    expect(stepMatchReady(state, READY_ASK_MS).startVisible).toBe(true);
  });

  it('예를 누르면 10초 동안 재배치하고 아니오·무응답은 재배치하지 않는다', () => {
    const yes = answerReady(createMatchReady(0), true, 1000);
    expect(stepMatchReady(yes, 1000).rearranging).toBe(true);
    expect(stepMatchReady(yes, 1000 + REARRANGE_MS - 1).rearranging).toBe(true);
    expect(stepMatchReady(yes, 1000 + REARRANGE_MS).rearranging).toBe(false);
    expect(stepMatchReady(yes, 1000).rearrangeCount).toBe(10);
    expect(stepMatchReady(yes, 1000).startVisible).toBe(false);
    expect(stepMatchReady(yes, 1000 + REARRANGE_MS - 1).rearrangeCount).toBe(1);
    expect(rearrangeCountDown(REARRANGE_MS)).toBe(10);
    expect(rearrangeCountHint(10)).toBe('10');
    expect(rearrangeCountHint(0)).toBe('');
    const no = answerReady(createMatchReady(0), false, 500);
    expect(stepMatchReady(no, 500).rearranging).toBe(false);
    const late = answerReady(yes, false, 2000);
    expect(late.answer).toBe(true);
  });

  it('시작 버튼이 나온 뒤 3초가 지나도 시작하지 않으면 선공 안내를 켠다', () => {
    const state = createMatchReady(0);
    expect(FIRST_HINT).toContain('도토리가 적은 사람');
    expect(FIRST_HINT).toContain('시작 버튼');
    expect(FIRST_HINT).toContain('선공');
    expect(stepMatchReady(state, READY_ASK_MS + FIRST_HINT_AFTER_MS - 1).firstHint).toBe(false);
    expect(stepMatchReady(state, READY_ASK_MS + FIRST_HINT_AFTER_MS).firstHint).toBe(true);
  });

  it('재배치 사용이 꺼지면 시작 버튼이 바로 나오고 의사는 묻지 않는다', () => {
    const state = createMatchReady(0);
    const off = { askEnabled: false };
    expect(stepMatchReady(state, 0, off).askVisible).toBe(false);
    expect(stepMatchReady(state, 0, off).startVisible).toBe(true);
    expect(stepMatchReady(state, FIRST_HINT_AFTER_MS - 1, off).firstHint).toBe(false);
    expect(stepMatchReady(state, FIRST_HINT_AFTER_MS, off).firstHint).toBe(true);
  });

  it('상대 재배치 여부와 skip은 테스트·동기화용으로 동작한다', () => {
    expect(PEER_REARRANGE_HINT).toContain('상대');
    expect(PEER_REARRANGE_HINT).toContain('재배치');
    expect(isPeerRearranging([
      { userId: 'me', rearranging: true, roomId: 'r1' },
      { userId: 'you', rearranging: true, roomId: 'r1' },
    ], 'me', 'r1')).toBe(true);
    expect(isPeerRearranging([
      { userId: 'you', rearranging: false, roomId: 'r1' },
    ], 'me', 'r1')).toBe(false);
    const skipped = skipReadyAsk(createMatchReady(9000), 9000);
    expect(stepMatchReady(skipped, 9000).startVisible).toBe(true);
    expect(stepMatchReady(skipped, 9000).askVisible).toBe(false);
  });
});
