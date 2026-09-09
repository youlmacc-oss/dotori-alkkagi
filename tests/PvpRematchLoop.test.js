import { describe, expect, it } from 'vitest';
import { GAME_MODE, GameEngine, PHASE, STONE_COLOR } from '../src/physics/GameEngine.js';
import { PVP_ROOM_ID, applyRoomLeave, applyRoomStart, roomMatchGen } from '../src/network/RoomState.js';
import {
  PVP_LOOP_ROUNDS,
  applyGuestRoom,
  hostCanStart,
  openPvpLoopSeats,
  stepPvpLoopRound,
} from '../src/network/PvpMatchLoop.js';
import { acornSettleKey, settleSessionAcorns, shouldSettleAcorns } from '../src/network/AcornPolicy.js';

describe('1:1 재대전 루프', () => {
  it('같은 좌석으로 12국을 돌리고 다시하기마다 호스트 선공·gen이 맞는다', () => {
    let { host, guest } = openPvpLoopSeats();
    const keys = new Set();
    let hostAcorns = 10;
    let lastKey = '';

    for (let round = 1; round <= PVP_LOOP_ROUNDS; round += 1) {
      const coalesce = round % 2 === 0;
      const winner = round % 3 === 0 ? STONE_COLOR.WHITE : STONE_COLOR.BLACK;
      const step = stepPvpLoopRound(host, guest, { coalesceStart: coalesce, winner });

      expect(step.hostCanStart, `r${round} 호스트 시작`).toBe(true);
      expect(step.guestCanStart, `r${round} 게스트는 시작 불가`).toBe(false);
      expect(step.firstIsHost, `r${round} 선공은 호스트`).toBe(true);
      expect(step.guestFollowed, `r${round} 게스트가 시작을 따름`).toBe(true);
      expect(step.hostStarted.started).toBe(true);
      expect(step.guestStarted.started).toBe(true);
      expect(step.holdGateAfterStart).toBe(false);
      expect(step.lateStartWhileAiming).toBe(true);
      expect(step.staleEndedBlocked).toBe(true);
      expect(step.rematchWaitBlocksStale, `r${round} 1국 Presence로 다시하기를 열지 않음`).toBe(true);
      expect(step.rematchStartOnResult).toBe(true);
      expect(step.gensMatch, `r${round} 양쪽 matchGen`).toBe(true);
      expect(roomMatchGen(step.rematch)).toBe(round);
      expect(step.settleKey).toBe(acornSettleKey({
        roomId: PVP_ROOM_ID, matchGen: roomMatchGen(step.hostStarted), winner,
      }));
      expect(keys.has(step.settleKey)).toBe(false);
      keys.add(step.settleKey);
      expect(shouldSettleAcorns({
        mode: 'pvp', started: true, winner, myColor: STONE_COLOR.BLACK,
        settleKey: step.settleKey, lastSettledKey: lastKey,
      })).toBe(false);
      hostAcorns = settleSessionAcorns(hostAcorns, {
        mode: 'pvp', started: true, winner, myColor: STONE_COLOR.BLACK,
        settleKey: step.settleKey, lastSettledKey: lastKey,
      });
      lastKey = step.settleKey;

      if (coalesce) {
        expect(step.afterHost.started).toBe(true);
        expect(step.afterGuest.started).toBe(true);
        expect(roomMatchGen(step.afterHost)).toBe(round);
        expect(roomMatchGen(step.afterGuest)).toBe(round);
        expect(step.rematchStartFollowsRoom).toBe(true);
        host = step.afterHost;
        guest = step.afterGuest;
      } else {
        expect(step.afterHost.started).toBe(false);
        expect(step.afterGuest.started).toBe(false);
        expect(hostCanStart(step.afterHost)).toBe(true);
        host = step.afterHost;
        guest = step.afterGuest;
      }
    }

    expect(keys.size).toBe(PVP_LOOP_ROUNDS);
    expect(hostAcorns).toBe(10);
    const left = applyRoomLeave(applyRoomStart(host), { leaverId: 'guest' });
    expect(left.guestId).toBeNull();
    expect(left.started).toBe(false);
    expect(left.hostId).toBe('host');
  });

  it('12국 동안 양쪽 엔진이 결과판 위 시작과 늦은 start 재전송을 견딘다', () => {
    const hostEngine = new GameEngine({ autoStart: false });
    const guestEngine = new GameEngine({ autoStart: false });
    hostEngine.setMatchConfig({ mode: GAME_MODE.PVP });
    guestEngine.setMatchConfig({ mode: GAME_MODE.PVP });
    hostEngine.setHost(true);
    guestEngine.setHost(false);

    let { host, guest } = openPvpLoopSeats();

    for (let round = 1; round <= PVP_LOOP_ROUNDS; round += 1) {
      hostEngine.phase = PHASE.GAME_OVER;
      hostEngine.winner = STONE_COLOR.BLACK;
      guestEngine.phase = PHASE.GAME_OVER;
      guestEngine.winner = STONE_COLOR.BLACK;

      const rematch = stepPvpLoopRound(host, guest, { coalesceStart: true });
      expect(rematch.gensMatch).toBe(true);

      const startBoard = {
        event: 'start',
        phase: PHASE.IDLE,
        currentTurn: STONE_COLOR.BLACK,
        winner: null,
        stones: hostEngine.stones.map((stone) => ({
          id: stone.id,
          color: stone.color,
          position: { x: stone.body.position.x, y: stone.body.position.y },
        })),
      };
      expect(hostEngine.applyRemoteMatchState(startBoard)).toBe(true);
      expect(guestEngine.applyRemoteMatchState(startBoard)).toBe(true);
      expect(hostEngine.phase).toBe(PHASE.IDLE);
      expect(guestEngine.phase).toBe(PHASE.IDLE);
      expect(hostEngine.winner).toBeNull();
      expect(guestEngine.winner).toBeNull();
      expect(hostEngine.currentTurn).toBe(STONE_COLOR.BLACK);
      expect(guestEngine.currentTurn).toBe(STONE_COLOR.BLACK);

      hostEngine.phase = PHASE.AIMING;
      const replay = { ...startBoard, currentTurn: STONE_COLOR.BLACK };
      expect(hostEngine.applyRemoteMatchState(replay)).toBe(false);
      expect(hostEngine.phase).toBe(PHASE.AIMING);

      host = rematch.afterHost;
      guest = rematch.afterGuest;
      if (!host.started) host = applyRoomStart(host);
      if (!guest.started) guest = applyGuestRoom(guest, host);
    }

    expect(roomMatchGen(host)).toBe(PVP_LOOP_ROUNDS);
    expect(roomMatchGen(guest)).toBe(PVP_LOOP_ROUNDS);
  });
});
