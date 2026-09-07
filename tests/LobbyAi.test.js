import { describe, expect, it } from 'vitest';
import {
  AI_ACCEPT_HINT,
  AI_ACORN_EVENT,
  AI_ACORN_KEY,
  AI_LOBBY_ACORNS,
  AI_LOBBY_NICKNAME,
  AI_LOBBY_USER_ID,
  canInviteLobbyAi,
  createLobbyAiUser,
  isLobbyAiUser,
  mergeLobbyAiSeat,
  packAiWallet,
  readAiAcorns,
  settleAiAcorns,
  shouldApplyAiWallet,
  shouldSettleAiAcorns,
  writeAiAcorns,
} from '../src/network/LobbyAi.js';
import { SESSION_ACORNS, shouldSettleAcorns } from '../src/network/AcornPolicy.js';
import { NIGHT_ACORN_KEY, writeNightAcorns } from '../src/network/NightSession.js';
import { canInviteLobbyUser } from '../src/network/PvpInvite.js';
import { GAME_MODE, GameEngine, PHASE, STONE_COLOR } from '../src/physics/GameEngine.js';
import { TurnManager } from '../src/ai/TurnManager.js';

function memoryStore(init = {}) {
  const data = { ...init };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}

describe('대기실 도토리봇', () => {
  it('항상 한 명이 앉고 사람에게만 초대가 열린다', () => {
    const bot = createLobbyAiUser();
    expect(isLobbyAiUser(bot)).toBe(true);
    expect(bot.nickname).toBe(AI_LOBBY_NICKNAME);
    expect(bot.userId).toBe(AI_LOBBY_USER_ID);
    expect(mergeLobbyAiSeat([{ userId: 'host', status: 'lobby' }, bot])).toHaveLength(2);
    expect(canInviteLobbyAi({ started: false, hasOpponent: false })).toBe(true);
    expect(canInviteLobbyAi({ started: true })).toBe(false);
    expect(canInviteLobbyUser({
      mode: 'ai', inRoom: false, started: false, isHost: false, hasOpponent: false, target: bot,
    })).toBe(true);
    expect(canInviteLobbyUser({
      mode: 'pvp', inRoom: false, started: false, isHost: false, hasOpponent: false,
      target: { userId: 'guest', status: 'lobby' },
    })).toBe(false);
    expect(AI_ACCEPT_HINT).toContain('수락');
  });

  it('1:1 방에 앉으면 봇 턴에만 AI가 쏜다', () => {
    const engine = new GameEngine({ autoStart: false });
    engine.setMatchConfig({ mode: GAME_MODE.PVP });
    engine.setAiOpponent(true, STONE_COLOR.WHITE);
    engine.phase = PHASE.IDLE;
    engine.currentTurn = STONE_COLOR.WHITE;
    const turns = new TurnManager({ engine, rng: () => 0.5, thinkMinMs: 0, thinkMaxMs: 0, aimMs: 0 });
    expect(turns.isAiControlling()).toBe(true);
    engine.currentTurn = STONE_COLOR.BLACK;
    expect(turns.isAiControlling()).toBe(false);
    engine.setAiOpponent(false);
    engine.currentTurn = STONE_COLOR.WHITE;
    expect(turns.isAiControlling()).toBe(false);
  });

  it('봇 도토리는 10에서 시작해 사람 1:1과 반대로 누적한다', () => {
    const store = memoryStore();
    expect(AI_LOBBY_ACORNS).toBe(10);
    expect(AI_LOBBY_ACORNS).toBe(SESSION_ACORNS);
    expect(AI_ACORN_EVENT).toBe('ai_wallet');
    expect(createLobbyAiUser({ storage: store }).acorns).toBe(10);
    expect(writeAiAcorns(9, store)).toBe(9);
    expect(readAiAcorns(store)).toBe(9);
    expect(createLobbyAiUser({ storage: store }).acorns).toBe(9);
    writeNightAcorns(3, store);
    expect(store.getItem(NIGHT_ACORN_KEY)).toBe('3');
    expect(store.getItem(AI_ACORN_KEY)).toBe('9');
    expect(readAiAcorns(store)).toBe(9);

    const pvp = { mode: 'pvp', started: true, winner: 'black', myColor: 'black' };
    expect(shouldSettleAcorns(pvp)).toBe(true);
    expect(shouldSettleAiAcorns(pvp)).toBe(false);
    expect(shouldSettleAiAcorns({ ...pvp, aiOpponent: true })).toBe(true);
    expect(settleAiAcorns(10, { ...pvp, aiOpponent: true })).toBe(9);
    expect(settleAiAcorns(10, { ...pvp, winner: 'white', aiOpponent: true })).toBe(11);
    expect(settleAiAcorns(10, { ...pvp, mode: 'ai', aiOpponent: true })).toBe(10);
    expect(shouldSettleAcorns({ ...pvp, mode: 'ai' })).toBe(false);
    expect(shouldSettleAiAcorns({ ...pvp, mode: 'ai', aiOpponent: true })).toBe(false);
  });

  it('다른 기기의 봇 지갑은 더 새로운 seq만 받는다', () => {
    const current = packAiWallet({ acorns: 9, seq: 2, settleKey: 'room_a:0:black', timestamp: 100 });
    expect(shouldApplyAiWallet(packAiWallet({ acorns: 10, seq: 0, timestamp: 999 }), current)).toBe(false);
    expect(shouldApplyAiWallet(packAiWallet({ acorns: 8, seq: 3, settleKey: 'room_b:0:white' }), current)).toBe(true);
    expect(shouldApplyAiWallet(packAiWallet({ acorns: 8, seq: 2, settleKey: 'room_a:0:black' }), current)).toBe(false);
    expect(shouldApplyAiWallet(packAiWallet({ acorns: 9, seq: 2, timestamp: 200 }), current)).toBe(false);
    expect(shouldApplyAiWallet({ userId: 'human', acorns: 8, seq: 9 }, current)).toBe(false);
  });
});
