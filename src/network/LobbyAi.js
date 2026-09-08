/**
 * 대기실 AI 좌석. 사람처럼 앉아 있고, 초대만 받으며 항상 수락한다.
 * 도토리는 사람 1:1과 같이 10에서 시작해 승패를 누적한다.
 */

import { ACORN_LOSS, ACORN_WIN, parseAcorn, SESSION_ACORNS, shouldSettleAcorns } from './AcornPolicy.js';
import { PRESENCE_STATUS } from './LobbyRooms.js';

export const AI_LOBBY_USER_ID = 'ai_dotori';
export const AI_LOBBY_NICKNAME = '도토리봇';
export const AI_LOBBY_CHARACTER = '🐿️';
export const AI_LOBBY_ACORNS = SESSION_ACORNS;
export const AI_ACORN_KEY = 'dotori-alkkagi-ai-acorns';
export const AI_ACORN_EVENT = 'ai_wallet';
export const AI_ACCEPT_HINT = '도토리봇이 초대를 수락했습니다';

export function isLobbyAiUser(user) {
  const id = user?.userId ?? user?.id ?? user;
  return String(id || '') === AI_LOBBY_USER_ID;
}

export function readAiAcorns(storage = globalThis.localStorage, fallback = AI_LOBBY_ACORNS) {
  try {
    const raw = storage?.getItem?.(AI_ACORN_KEY);
    if (raw == null || raw === '') return parseAcorn(fallback);
    return parseAcorn(raw, fallback);
  } catch {
    return parseAcorn(fallback);
  }
}

export function writeAiAcorns(value, storage = globalThis.localStorage) {
  const n = parseAcorn(value, AI_LOBBY_ACORNS);
  try {
    storage?.setItem?.(AI_ACORN_KEY, String(n));
  } catch {
    /* private mode */
  }
  return n;
}

export function shouldSettleAiAcorns(result = {}) {
  return shouldSettleAcorns(result) && result.aiOpponent === true;
}

/** 사람 기준 결과의 반대. 사람이 이기면 봇은 -1. */
export function settleAiAcorns(current, result = {}) {
  const now = parseAcorn(current, AI_LOBBY_ACORNS);
  if (!shouldSettleAiAcorns(result)) return now;
  return now + (result.winner === result.myColor ? ACORN_LOSS : ACORN_WIN);
}

export function packAiWallet({ acorns, seq, settleKey, timestamp } = {}) {
  return {
    userId: AI_LOBBY_USER_ID,
    acorns: parseAcorn(acorns, AI_LOBBY_ACORNS),
    seq: Math.max(0, Math.floor(Number(seq) || 0)),
    settleKey: String(settleKey || ''),
    timestamp: Number(timestamp) > 0 ? Number(timestamp) : Date.now(),
  };
}

export function shouldApplyAiWallet(incoming, current = {}) {
  if (!incoming || !isLobbyAiUser(incoming)) return false;
  if (!Number.isFinite(Number(incoming.acorns))) return false;
  const inSeq = Math.max(0, Math.floor(Number(incoming.seq) || 0));
  const curSeq = Math.max(0, Math.floor(Number(current.seq) || 0));
  if (incoming.settleKey && current.settleKey && incoming.settleKey === current.settleKey) {
    return false;
  }
  if (inSeq < curSeq) return false;
  if (inSeq > curSeq) return true;
  const inAcorns = parseAcorn(incoming.acorns);
  const curAcorns = parseAcorn(current.acorns, AI_LOBBY_ACORNS);
  if (inAcorns === curAcorns) return false;
  return Number(incoming.timestamp) > Number(current.timestamp || 0);
}

export function createLobbyAiUser({
  playing = false,
  roomId = null,
  started = false,
  acorns,
  storage,
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
    acorns: acorns != null ? parseAcorn(acorns) : readAiAcorns(storage),
    started: inMatch && started === true,
    inviteTargetId: null,
    inviteAt: null,
    ai: true,
  };
}

export function mergeLobbyAiSeat(users) {
  return (Array.isArray(users) ? users : []).filter((user) => !isLobbyAiUser(user));
}

/** AI는 초대하지 않는다. 사람은 대기·빈 방에서 AI에게만 보낸다. */
export function canInviteLobbyAi({
  started = false,
  hasOpponent = false,
  spectating = false,
} = {}) {
  return false;
}
