import { describe, expect, it } from 'vitest';
import {
  TURN_END_WATCHDOG_MS,
  canApplyRemoteBoard,
  isLaunchSync,
  mergeCampLayouts,
  ownCampFacesSeat,
  packLaunchSync,
  packMatchSync,
  remoteStonesNeedRebuild,
  shouldApplyMatchSync,
  shouldFireTurnEndWatchdog,
  shouldFollowRemoteStart,
  shouldPublishMatchSync,
  shouldPulseMatchSync,
  findRemoteStone,
} from '../src/network/MatchSync.js';
import { GAME_MODE, GameEngine, PHASE, STONE_COLOR } from '../src/physics/GameEngine.js';
import { seatYawFor, shouldAttachKillCam } from '../src/ui/ThreeRenderer.js';

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
    expect(canApplyRemoteBoard({
      localPhase: PHASE.AIMING,
      remotePhase: PHASE.IDLE,
      localTurn: STONE_COLOR.WHITE,
      remoteTurn: STONE_COLOR.WHITE,
    })).toBe(false);
    expect(canApplyRemoteBoard({
      localPhase: PHASE.AIMING,
      remotePhase: PHASE.IDLE,
      localTurn: STONE_COLOR.WHITE,
      remoteTurn: STONE_COLOR.BLACK,
    })).toBe(true);
    expect(canApplyRemoteBoard({ localPhase: PHASE.AIMING, remotePhase: PHASE.RESOLVING })).toBe(true);
    expect(canApplyRemoteBoard({ localPhase: PHASE.RESOLVING, remotePhase: PHASE.RESOLVING })).toBe(true);
    expect(canApplyRemoteBoard({ localPhase: PHASE.RESOLVING, remotePhase: PHASE.IDLE })).toBe(false);
    expect(canApplyRemoteBoard({
      localPhase: PHASE.RESOLVING,
      remotePhase: PHASE.IDLE,
      remoteEvent: 'turnEnd',
    })).toBe(true);
    expect(canApplyRemoteBoard({
      localPhase: PHASE.RESOLVING,
      remotePhase: PHASE.IDLE,
      localTurn: STONE_COLOR.BLACK,
      remoteTurn: STONE_COLOR.WHITE,
    })).toBe(true);
    expect(canApplyRemoteBoard({
      localPhase: PHASE.RESOLVING,
      remotePhase: PHASE.AIMING,
      localTurn: STONE_COLOR.WHITE,
      remoteTurn: STONE_COLOR.WHITE,
    })).toBe(false);
    expect(canApplyRemoteBoard({ localPhase: PHASE.GAME_OVER, remotePhase: PHASE.IDLE })).toBe(false);
    expect(canApplyRemoteBoard({ localPhase: PHASE.GAME_OVER, remotePhase: PHASE.AIMING })).toBe(false);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: true })).toBe(false);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false })).toBe(false);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'launch' })).toBe(true);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: true, force: true, event: 'turnEnd' })).toBe(true);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'turnEnd' })).toBe(true);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'camp' })).toBe(true);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'pulse' })).toBe(false);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: true, force: true, event: 'start' })).toBe(true);
    expect(shouldPublishMatchSync({ inPvp: true, isHost: false, force: true, event: 'start' })).toBe(false);
    expect(shouldPulseMatchSync({ inPvp: true, started: true })).toBe(false);
    expect(shouldPulseMatchSync({ inPvp: true, started: false })).toBe(false);
    expect(shouldPulseMatchSync({ inPvp: true, started: true, spectating: true })).toBe(false);
    expect(shouldFollowRemoteStart({
      awaitingStart: true, started: false, remoteStarted: true, mode: 'pvp',
    })).toBe(true);
    expect(shouldFollowRemoteStart({
      awaitingStart: true, started: false, remoteStarted: true, mode: 'pvp',
      remotePhase: PHASE.GAME_OVER, remoteWinner: STONE_COLOR.BLACK,
    })).toBe(false);
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
      stones: engine.stones.map((stone, index) => ({
        id: stone.id,
        color: stone.color,
        fallen: false,
        position: index === 0
          ? { x: 111, y: 222 }
          : { x: stone.body.position.x, y: stone.body.position.y },
        velocity: index === 0 ? { x: 1, y: 2 } : { x: 0, y: 0 },
      })),
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

  it('수락한 게스트는 백 좌석이고 자기 돌이 앞에 있다', () => {
    const guest = new GameEngine({ autoStart: false });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setHost(false);
    const snap = guest.getSnapshot();
    expect(snap.myColor).toBe(STONE_COLOR.WHITE);
    expect(seatYawFor(snap.gameMode, snap.currentTurn, snap.myColor)).toBeCloseTo(Math.PI);
    expect(ownCampFacesSeat(snap.myColor, snap.stones)).toBe(true);
    expect(ownCampFacesSeat(STONE_COLOR.BLACK, snap.stones)).toBe(true);
  });

  it('샷이 진행 중에도 호스트 판을 따라가고, 돌 수가 다르면 다시 깐다', () => {
    const host = new GameEngine({ autoStart: false });
    const guest = new GameEngine({ autoStart: false });
    host.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    host.setHost(true);
    guest.setHost(false);
    host.phase = PHASE.RESOLVING;
    guest.phase = PHASE.RESOLVING;
    const moved = host.stones[0];
    const payload = {
      phase: PHASE.RESOLVING,
      currentTurn: STONE_COLOR.BLACK,
      stones: host.stones.map((stone, index) => ({
        id: stone.id,
        color: stone.color,
        fallen: false,
        position: {
          x: stone.body.position.x + (index === 0 ? 18 : 0),
          y: stone.body.position.y,
        },
      })),
    };
    expect(guest.applyRemoteMatchState(payload)).toBe(true);
    expect(guest.stones[0].body.position.x).toBeCloseTo(moved.body.position.x + 18);
    expect(remoteStonesNeedRebuild(guest.stones, [
      { id: 99, color: STONE_COLOR.BLACK, position: { x: 200, y: 520 } },
      { id: 100, color: STONE_COLOR.WHITE, position: { x: 200, y: 180 } },
    ])).toBe(true);
    expect(guest.applyRemoteMatchState({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.WHITE,
      stones: [
        { id: 99, color: STONE_COLOR.BLACK, position: { x: 200, y: 520 } },
        { id: 100, color: STONE_COLOR.WHITE, position: { x: 200, y: 180 } },
      ],
    })).toBe(true);
    expect(guest.stones).toHaveLength(2);
    expect(guest.stones[1].color).toBe(STONE_COLOR.WHITE);
    guest.phase = PHASE.AIMING;
    guest.currentTurn = STONE_COLOR.WHITE;
    expect(guest.applyRemoteMatchState({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.WHITE,
      stones: guest.stones.map((stone) => ({
        id: stone.id,
        color: stone.color,
        position: stone.body.position,
      })),
    })).toBe(false);
  });

  it('상대 샷은 로컬에서 같이 굴리고 킬캠 경로는 그대로다', () => {
    const guest = new GameEngine({ autoStart: false });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setHost(false);
    const stone = guest.stones.find((s) => s.color === STONE_COLOR.BLACK);
    const launches = [];
    guest.on('launch', (payload) => launches.push(payload));
    const packet = packLaunchSync({
      stoneId: stone.id,
      color: stone.color,
      velocity: { x: 10, y: -14 },
      force: { x: 0.04, y: -0.05 },
      power: 0.7,
    }, { currentTurn: STONE_COLOR.BLACK, roomId: 'room_h', senderId: 'host', started: true, timestamp: 80 });
    expect(isLaunchSync(packet)).toBe(true);
    expect(packet.stones).toEqual([]);
    expect(guest.applyRemoteLaunch(packet)).toBe(true);
    expect(guest.phase).toBe(PHASE.RESOLVING);
    expect(launches[0]?.remote).toBe(true);
    expect(guest.applyRemoteLaunch(packet)).toBe(false);
    expect(guest.applyRemoteMatchState({
      event: 'turnEnd',
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.WHITE,
      stones: guest.stones.map((s) => ({
        id: s.id,
        color: s.color,
        position: s.body.position,
      })),
    })).toBe(true);
    expect(guest.phase).toBe(PHASE.IDLE);
    expect(shouldAttachKillCam(true, null)).toBe(true);
  });

  it('seq가 lastSeq보다 클 때만 받고 timestamp는 구패킷 fallback이다', () => {
    const older = packMatchSync({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.WHITE,
      stones: [],
    }, { roomId: 'room_h', senderId: 'host', timestamp: 80, seq: 2, matchGen: 1 });
    expect(shouldApplyMatchSync(older, {
      myId: 'guest', roomId: 'room_h', inPvp: true, lastSeq: 2, matchGen: 1,
    })).toBe(false);
    expect(shouldApplyMatchSync({ ...older, seq: 3 }, {
      myId: 'guest', roomId: 'room_h', inPvp: true, lastSeq: 2, lastTs: 90, matchGen: 1,
    })).toBe(true);
    expect(shouldApplyMatchSync({ ...older, seq: 3, matchGen: 0 }, {
      myId: 'guest', roomId: 'room_h', inPvp: true, lastSeq: 2, matchGen: 2,
    })).toBe(false);
    expect(shouldApplyMatchSync({ ...older, seq: 4, matchGen: 2 }, {
      myId: 'guest', roomId: 'room_h', inPvp: true, lastSeq: 2, matchGen: 2,
    })).toBe(true);
  });

  it('호스트는 흑+백 camp를 한 장으로 합치고 watchdog은 900ms에 한 번이다', () => {
    const merged = mergeCampLayouts(
      [{ id: 'b1', color: STONE_COLOR.BLACK, position: { x: 10, y: 520 } }],
      [{ id: 'w1', color: STONE_COLOR.WHITE, position: { x: 20, y: 180 } }],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].color).toBe(STONE_COLOR.BLACK);
    expect(merged[1].position.x).toBe(20);
    expect(TURN_END_WATCHDOG_MS).toBe(900);
    expect(shouldFireTurnEndWatchdog({
      isHost: true, launchedAt: 1000, now: 1900, gotShooterTurnEnd: false,
    })).toBe(true);
    expect(shouldFireTurnEndWatchdog({
      isHost: true, launchedAt: 1000, now: 1899, gotShooterTurnEnd: false,
    })).toBe(false);
    expect(shouldFireTurnEndWatchdog({
      isHost: false, launchedAt: 1000, now: 2000,
    })).toBe(false);
    expect(shouldFireTurnEndWatchdog({
      isHost: true, launchedAt: 1000, now: 2000, gotShooterTurnEnd: true,
    })).toBe(false);
  });
});
