import { describe, expect, it } from 'vitest';
import {
  canApplyRemoteBoard,
  packMatchSync,
  shouldApplyMatchSync,
  shouldFollowRemoteStart,
  findRemoteStone,
} from '../src/network/MatchSync.js';
import { GAME_MODE, GameEngine, PHASE, STONE_COLOR } from '../src/physics/GameEngine.js';

describe('1:1 판 동기', () => {
  it('같은 방의 상대 패킷만 적용하고 내 패킷은 버린다', () => {
    const payload = packMatchSync({
      phase: PHASE.RESOLVING,
      currentTurn: STONE_COLOR.WHITE,
      winner: null,
      stones: [{ id: 'b1', x: 10, y: 20, fallen: false, color: STONE_COLOR.BLACK }],
    }, { roomId: 'room_h', senderId: 'host', started: true, timestamp: 50 });
    expect(payload.roomId).toBe('room_h');
    expect(payload.started).toBe(true);
    expect(payload.phase).toBe(PHASE.RESOLVING);
    expect(payload.currentTurn).toBe(STONE_COLOR.WHITE);
    expect(payload.stones).toHaveLength(1);
    expect(shouldApplyMatchSync(payload, {
      myId: 'guest', roomId: 'room_h', inPvp: true,
    })).toBe(true);
    expect(shouldApplyMatchSync(payload, {
      myId: 'host', roomId: 'room_h', inPvp: true,
    })).toBe(false);
    expect(shouldApplyMatchSync(payload, {
      myId: 'guest', roomId: 'room_other', inPvp: true,
    })).toBe(false);
    expect(shouldApplyMatchSync(payload, {
      myId: 'guest', roomId: 'room_h', lastTs: 50, inPvp: true,
    })).toBe(false);
    expect(canApplyRemoteBoard({ localPhase: PHASE.AIMING, remotePhase: PHASE.IDLE })).toBe(false);
    expect(canApplyRemoteBoard({ localPhase: PHASE.AIMING, remotePhase: PHASE.RESOLVING })).toBe(true);
    expect(canApplyRemoteBoard({ localPhase: PHASE.RESOLVING, remotePhase: PHASE.RESOLVING })).toBe(false);
    expect(canApplyRemoteBoard({ localPhase: PHASE.RESOLVING, remotePhase: PHASE.IDLE })).toBe(true);
    expect(shouldFollowRemoteStart({
      awaitingStart: true, started: false, remoteStarted: true, mode: 'pvp',
    })).toBe(true);
  });

  it('상대 판을 받으면 돌과 턴이 같아진다', () => {
    const engine = new GameEngine({ autoStart: false });
    engine.setMatchConfig({ mode: GAME_MODE.PVP });
    engine.setHost(false);
    engine.phase = PHASE.IDLE;
    engine.currentTurn = STONE_COLOR.BLACK;
    const first = engine.stones[0];
    expect(engine.applyRemoteMatchState({
      phase: PHASE.RESOLVING,
      currentTurn: STONE_COLOR.WHITE,
      stones: [{
        id: first.id,
        position: { x: 111, y: 222 },
        velocity: { x: 1, y: 2 },
        fallen: false,
      }],
    })).toBe(true);
    expect(first.body.position.x).toBeCloseTo(111);
    expect(engine.currentTurn).toBe(STONE_COLOR.WHITE);
    expect(engine.phase).toBe(PHASE.RESOLVING);
    engine.phase = PHASE.IDLE;
    engine.currentTurn = STONE_COLOR.BLACK;
    expect(engine.isHumanInputBlocked()).toBe(true);
    engine.currentTurn = STONE_COLOR.WHITE;
    expect(engine.isHumanInputBlocked()).toBe(false);
    expect(findRemoteStone(engine.stones, { id: first.id }, 9)).toBe(first);
    expect(packMatchSync(engine.getSnapshot(), { roomId: 'room_h', senderId: 'g' }).scores)
      .toEqual(engine.getSnapshot().scores);
  });
});
