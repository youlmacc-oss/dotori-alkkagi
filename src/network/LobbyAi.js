/**
 * 대기실 AI 좌석. 사람처럼 앉아 있고, 초대만 받으며 항상 수락한다.
 */

import { PRESENCE_STATUS } from './LobbyRooms.js';

export const AI_LOBBY_USER_ID = 'ai_dotori';
export const AI_LOBBY_NICKNAME = '도토리봇';
export const AI_LOBBY_CHARACTER = '🐿️';
export const AI_LOBBY_ACORNS = 12;
export const AI_ACCEPT_HINT = '도토리봇이 초대를 수락했습니다';

export function isLobbyAiUser(user) {
  const id = user?.userId ?? user?.id ?? user;
  return String(id || '') === AI_LOBBY_USER_ID;
}

export function createLobbyAiUser({
  playing = false,
  roomId = null,
  started = false,
} = {}) {
  const inMatch = playing === true;
  return {
    userId: AI_LOBBY_USER_ID,
    id: AI_LOBBY_USER_ID,
    nickname: AI_LOBBY_NICKNAME,
    character: AI_LOBBY_CHARACTER,
    status: inMatch ? PRESENCE_STATUS.PLAYING : PRESENCE_STATUS.LOBBY,
    mode: inMatch ? 'pvp' : null,
    roomId: inMatch ? String(roomId || '') || null : null,
    acorns: AI_LOBBY_ACORNS,
    started: inMatch && started === true,
    inviteTargetId: null,
    inviteAt: null,
    ai: true,
  };
}

export function mergeLobbyAiSeat(users, extras = {}) {
  const list = (Array.isArray(users) ? users : []).filter((user) => !isLobbyAiUser(user));
  return [...list, createLobbyAiUser(extras)];
}

/** AI는 초대하지 않는다. 사람은 대기·빈 방에서 AI에게만 보낸다. */
export function canInviteLobbyAi({
  started = false,
  hasOpponent = false,
  spectating = false,
} = {}) {
  return started !== true && hasOpponent !== true && spectating !== true;
}
