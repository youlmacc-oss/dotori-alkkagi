import { describe, expect, it } from 'vitest';
import {
  PVP_GUIDE_ASK,
  PVP_ROOM_HINT,
  parseGuideChoice,
  shouldInvitePvp,
} from '../src/network/PvpInvite.js';

describe('대기실 1:1 안내', () => {
  it('유저가 1명이라도 있으면 1:1을 유도한다', () => {
    expect(shouldInvitePvp(0)).toBe(false);
    expect(shouldInvitePvp(1)).toBe(true);
    expect(shouldInvitePvp(3)).toBe(true);
    expect(PVP_ROOM_HINT).toContain('대국방');
    expect(PVP_ROOM_HINT).toContain('시작');
  });

  it('가이드선 사용·미사용을 가린다', () => {
    expect(parseGuideChoice('사용')).toBe(true);
    expect(parseGuideChoice('미사용')).toBe(false);
    expect(parseGuideChoice(true)).toBe(true);
    expect(parseGuideChoice(false)).toBe(false);
    expect(parseGuideChoice('maybe')).toBeNull();
    expect(PVP_GUIDE_ASK).toContain('가이드선');
  });
});
