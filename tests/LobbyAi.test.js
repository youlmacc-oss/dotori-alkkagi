import { describe, expect, it } from 'vitest';
import {
  AI_ACCEPT_HINT,
  AI_LOBBY_NICKNAME,
  AI_LOBBY_USER_ID,
  canInviteLobbyAi,
  createLobbyAiUser,
  isLobbyAiUser,
  mergeLobbyAiSeat,
} from '../src/network/LobbyAi.js';
import { canInviteLobbyUser } from '../src/network/PvpInvite.js';
import { GAME_MODE, GameEngine, PHASE, STONE_COLOR } from '../src/physics/GameEngine.js';
import { TurnManager } from '../src/ai/TurnManager.js';

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
});
