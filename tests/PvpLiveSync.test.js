import { describe, expect, it } from 'vitest';
import { GAME_MODE, GameEngine, PHASE, STONE_COLOR, findLaunchStone } from '../src/physics/GameEngine.js';
import {
  incomingMatchSyncAction,
  isLaunchSync,
  shouldOpenGuestFromHostLive,
  nextMatchBoardReady,
  packLaunchSync,
  packMatchSync,
  shouldIgnoreLateStartReplay,
  shouldPublishSettledTurnEnd,
  shouldSyncSceneAfterHostStart,
} from '../src/network/MatchSync.js';
import { shouldReplayHostStart } from '../src/network/MatchStart.js';
import {
  applyIncomingRematchRoom,
  applyRoomGuest,
  applyRoomRematch,
  applyRoomStart,
  createRoomState,
  incomingResetsForRematch,
  roomMatchGen,
} from '../src/network/RoomState.js';

function startBoard(engine, extras = {}) {
  return packMatchSync({
    phase: PHASE.IDLE,
    currentTurn: STONE_COLOR.BLACK,
    winner: null,
    stones: engine.stones.map((stone) => ({
      id: stone.id,
      color: stone.color,
      fallen: Boolean(stone.fallen),
      position: { x: stone.body.position.x, y: stone.body.position.y },
    })),
  }, {
    event: 'start',
    roomId: 'dotori-pvp',
    senderId: extras.senderId || 'host',
    started: true,
    timestamp: extras.timestamp || 10,
    seq: extras.seq || 1,
    matchGen: extras.matchGen || 0,
  });
}

function liveCtx(engine, extras = {}) {
  return {
    myId: extras.myId || 'guest',
    roomId: 'dotori-pvp',
    inPvp: true,
    lastSeq: extras.lastSeq || 0,
    lastLaunchAt: extras.lastLaunchAt || 0,
    isHost: extras.isHost,
    senderIsHost: extras.senderIsHost,
    matchGen: extras.matchGen || 0,
    awaitingStart: extras.awaitingStart === true,
    matchStarted: extras.matchStarted !== false,
    boardReady: extras.boardReady === true,
    localPhase: engine.phase,
    localTurn: engine.currentTurn,
    spectating: false,
  };
}

describe('1:1 실시간 샷·다시하기 연동', () => {
  it('시작 뒤 첫 샷은 적용되고 그 위 start 재전송은 버린다', () => {
    const host = new GameEngine({ autoStart: false });
    const guest = new GameEngine({ autoStart: false });
    host.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    host.setHost(true);
    guest.setHost(false);

    const start = startBoard(host, { seq: 1 });
    expect(incomingMatchSyncAction(start, liveCtx(guest, {
      awaitingStart: true, matchStarted: false, boardReady: false,
    }))).toBe('board');
    expect(guest.applyRemoteMatchState(start)).toBe(true);
    expect(guest.phase).toBe(PHASE.IDLE);

    const shooter = host.stones.find((stone) => stone.color === STONE_COLOR.BLACK);
    const launch = packLaunchSync({
      stoneId: shooter.id,
      color: shooter.color,
      x: shooter.body.position.x,
      y: shooter.body.position.y,
      velocity: { x: 12, y: -16 },
      force: { x: 0, y: 0 },
      power: 0.8,
    }, {
      roomId: 'dotori-pvp', senderId: 'host', started: true, timestamp: 20, seq: 2,
      currentTurn: STONE_COLOR.BLACK, matchGen: 0,
    });
    expect(isLaunchSync(launch)).toBe(true);
    expect(incomingMatchSyncAction(launch, liveCtx(guest, {
      lastSeq: 1, matchStarted: true, boardReady: false,
    }))).toBe('launch');
    expect(findLaunchStone(guest.stones, launch)?.color).toBe(STONE_COLOR.BLACK);
    expect(guest.applyRemoteLaunch(launch)).toBe(true);
    expect(guest.phase).toBe(PHASE.RESOLVING);
    const moved = guest.stones.find((stone) => String(stone.id) === String(shooter.id))
      || findLaunchStone(guest.stones, launch);
    const beforeX = moved.body.position.x;

    const replay = startBoard(host, { seq: 3, timestamp: 30 });
    expect(shouldReplayHostStart({
      isHost: true, matchStarted: true, guestStarted: false, hasOpponent: true,
      localPhase: PHASE.RESOLVING,
    })).toBe(false);
    expect(incomingMatchSyncAction(replay, liveCtx(guest, {
      lastSeq: 2, matchStarted: true, boardReady: true,
    }))).toBe('drop-start-replay');
    expect(shouldIgnoreLateStartReplay({
      localPhase: PHASE.RESOLVING, remoteEvent: 'start', matchStarted: true, boardReady: true,
    })).toBe(true);
    expect(guest.applyRemoteMatchState(replay)).toBe(false);
    expect(guest.phase).toBe(PHASE.RESOLVING);
    expect(moved.body.position.x).toBeCloseTo(beforeX);

    const rest = packMatchSync({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.WHITE,
      stones: host.stones.map((stone) => ({
        id: stone.id,
        color: stone.color,
        position: { x: stone.body.position.x, y: stone.body.position.y },
      })),
    }, {
      event: 'turnEnd', roomId: 'dotori-pvp', senderId: 'host', started: true,
      timestamp: 40, seq: 4, matchGen: 0,
    });
    expect(incomingMatchSyncAction(rest, liveCtx(guest, {
      lastSeq: 2, matchStarted: true, boardReady: true,
    }))).toBe('board');
    expect(guest.applyRemoteMatchState(rest)).toBe(true);
    expect(guest.phase).toBe(PHASE.IDLE);
    expect(guest.currentTurn).toBe(STONE_COLOR.WHITE);
  });

  it('두 번째 샷은 굴림 중에도 적용되고 늦은 turnEnd는 덮지 않는다', () => {
    const host = new GameEngine({ autoStart: false });
    const guest = new GameEngine({ autoStart: false });
    host.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    host.setHost(true);
    guest.setHost(false);

    const start = startBoard(host, { seq: 1 });
    expect(guest.applyRemoteMatchState(start)).toBe(true);

    const black = host.stones.find((stone) => stone.color === STONE_COLOR.BLACK);
    const first = packLaunchSync({
      stoneId: black.id,
      color: black.color,
      x: black.body.position.x,
      y: black.body.position.y,
      velocity: { x: 10, y: -12 },
      force: { x: 0, y: 0 },
    }, {
      roomId: 'dotori-pvp', senderId: 'host', started: true, timestamp: 20, seq: 2,
      currentTurn: STONE_COLOR.BLACK,
    });
    expect(guest.applyRemoteLaunch(first)).toBe(true);
    expect(guest.phase).toBe(PHASE.RESOLVING);

    const white = host.stones.find((stone) => stone.color === STONE_COLOR.WHITE);
    const second = packLaunchSync({
      stoneId: white.id,
      color: white.color,
      x: white.body.position.x,
      y: white.body.position.y,
      velocity: { x: -9, y: 11 },
      force: { x: 0, y: 0 },
    }, {
      roomId: 'dotori-pvp', senderId: 'guest', started: true, timestamp: 80, seq: 5,
      currentTurn: STONE_COLOR.WHITE,
    });
    expect(incomingMatchSyncAction(second, liveCtx(host, {
      myId: 'host', lastSeq: 2, matchStarted: true, boardReady: true,
    }))).toBe('launch');
    expect(host.applyRemoteLaunch(second)).toBe(true);
    expect(host.phase).toBe(PHASE.RESOLVING);
    const flying = host.stones.find((stone) => String(stone.id) === String(white.id))
      || findLaunchStone(host.stones, second);
    const beforeX = flying.body.position.x;

    const staleEnd = packMatchSync({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.WHITE,
      stones: guest.stones.map((stone) => ({
        id: stone.id,
        color: stone.color,
        position: { x: stone.body.position.x, y: stone.body.position.y },
      })),
    }, {
      event: 'turnEnd', roomId: 'dotori-pvp', senderId: 'guest', started: true,
      timestamp: 40, seq: 4,
    });
    expect(incomingMatchSyncAction(staleEnd, liveCtx(host, {
      myId: 'host', lastSeq: 3, matchStarted: true, boardReady: true, lastLaunchAt: 80,
      isHost: true, senderIsHost: false,
    }))).toBe('drop-authority');
    expect(host.applyRemoteMatchState(staleEnd)).toBe(false);
    expect(host.phase).toBe(PHASE.RESOLVING);
    expect(flying.body.position.x).toBeCloseTo(beforeX);
  });

  it('끝난 판 다시하기 시작 후 첫 샷과 두 번째 다시하기가 같은 gen으로 이어진다', () => {
    let room = applyRoomStart(applyRoomGuest(createRoomState({
      roomId: 'dotori-pvp', hostId: 'host', hostName: '호치',
    }), { guestId: 'guest', guestName: '달이' }));
    const host = new GameEngine({ autoStart: false });
    const guest = new GameEngine({ autoStart: false });
    host.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    host.setHost(true);
    guest.setHost(false);

    for (let loop = 1; loop <= 2; loop += 1) {
      host.phase = PHASE.GAME_OVER;
      host.winner = STONE_COLOR.BLACK;
      guest.phase = PHASE.GAME_OVER;
      guest.winner = STONE_COLOR.BLACK;

      const rematch = applyRoomRematch(room);
      expect(incomingResetsForRematch(room, rematch)).toBe(true);
      expect(roomMatchGen(rematch)).toBe(loop);
      const guestRoom = applyIncomingRematchRoom(room, applyRoomStart(rematch));
      expect(guestRoom.started).toBe(true);
      expect(roomMatchGen(guestRoom)).toBe(loop);

      const start = startBoard(host, { seq: 10 * loop, matchGen: loop, timestamp: 100 * loop });
      expect(incomingMatchSyncAction(start, liveCtx(guest, {
        awaitingStart: true, matchStarted: false, boardReady: false, matchGen: loop - 1,
        lastSeq: 0,
      }))).toBe('rematch-start');
      host.setMatchConfig({ mode: GAME_MODE.PVP });
      guest.setMatchConfig({ mode: GAME_MODE.PVP });
      expect(guest.applyRemoteMatchState({
        ...start,
        event: 'start',
        winner: null,
        currentTurn: STONE_COLOR.BLACK,
      })).toBe(true);
      expect(guest.phase).toBe(PHASE.IDLE);
      expect(guest.currentTurn).toBe(STONE_COLOR.BLACK);

      const shooter = host.stones.find((stone) => stone.color === STONE_COLOR.BLACK);
      const launch = packLaunchSync({
        stoneId: 99,
        color: STONE_COLOR.BLACK,
        x: shooter.body.position.x,
        y: shooter.body.position.y,
        velocity: { x: 8, y: -10 },
        force: { x: 0, y: 0 },
      }, {
        roomId: 'dotori-pvp', senderId: 'host', started: true,
        timestamp: 100 * loop + 20, seq: 10 * loop + 1, matchGen: loop,
        currentTurn: STONE_COLOR.BLACK,
      });
      expect(incomingMatchSyncAction(launch, liveCtx(guest, {
        lastSeq: 10 * loop, matchStarted: true, boardReady: true, matchGen: loop,
      }))).toBe('launch');
      expect(guest.applyRemoteLaunch(launch)).toBe(true);
      expect(guest.phase).toBe(PHASE.RESOLVING);
      expect(shouldIgnoreLateStartReplay({
        localPhase: PHASE.RESOLVING, remoteEvent: 'start',
        matchStarted: true, boardReady: true,
      })).toBe(true);

      room = applyRoomStart(rematch);
    }
  });

  it('슈터 turnEnd가 어긋난 돌을 덮고 원격 정지는 방송하지 않는다', () => {
    const host = new GameEngine({ autoStart: false });
    const guest = new GameEngine({ autoStart: false });
    host.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    host.setHost(true);
    guest.setHost(false);
    expect(guest.applyRemoteMatchState(startBoard(host, { seq: 1 }))).toBe(true);

    const first = host.stones[0];
    guest.phase = PHASE.RESOLVING;
    expect(guest.applyRemoteMatchState({
      event: 'turnEnd',
      phase: PHASE.RESOLVING,
      currentTurn: STONE_COLOR.BLACK,
      timestamp: 30,
      stones: guest.stones.map((stone, index) => ({
        id: String(stone.id),
        color: stone.color,
        position: {
          x: stone.body.position.x + (index === 0 ? 64 : 0),
          y: stone.body.position.y,
        },
      })),
    })).toBe(true);
    expect(guest.stones[0].body.position.x).not.toBeCloseTo(first.body.position.x, 0);

    const rest = packMatchSync({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.WHITE,
      stones: host.stones.map((stone) => ({
        id: String(stone.id),
        color: stone.color,
        position: { x: stone.body.position.x, y: stone.body.position.y },
      })),
    }, {
      event: 'turnEnd', roomId: 'dotori-pvp', senderId: 'host', started: true,
      timestamp: 50, seq: 3,
    });
    expect(shouldPublishSettledTurnEnd({ remoteShot: true })).toBe(false);
    expect(shouldPublishSettledTurnEnd({ remoteShot: true, inPvp: true, isHost: true })).toBe(true);
    expect(shouldPublishSettledTurnEnd({ inPvp: true, isHost: false })).toBe(false);
    expect(incomingMatchSyncAction(rest, liveCtx(guest, {
      lastSeq: 2, matchStarted: true, boardReady: true, lastLaunchAt: 20,
    }))).toBe('board');
    expect(guest.applyRemoteMatchState(rest)).toBe(true);
    expect(guest.phase).toBe(PHASE.IDLE);
    expect(guest.currentTurn).toBe(STONE_COLOR.WHITE);
    expect(guest.stones[0].body.position.x).toBeCloseTo(first.body.position.x);
    expect(guest.stones[0].body.position.y).toBeCloseTo(first.body.position.y);
    guest.step(16);
    expect(guest.stones[0].body.position.x).toBeCloseTo(first.body.position.x);
  });

  it('시계가 먼저 와도 start와 첫 샷을 버리지 않는다', () => {
    const host = new GameEngine({ autoStart: false });
    const guest = new GameEngine({ autoStart: false });
    host.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    host.setHost(true);
    guest.setHost(false);
    const clock = packMatchSync({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.BLACK,
      turnRemainingMs: 14000,
    }, {
      event: 'timer', roomId: 'dotori-pvp', senderId: 'host', started: true, timestamp: 5, seq: 8,
    });
    expect(incomingMatchSyncAction(clock, liveCtx(guest, {
      awaitingStart: true, matchStarted: false, boardReady: false,
    }))).toBe('board');
    const start = startBoard(host, { seq: 1 });
    expect(incomingMatchSyncAction(start, liveCtx(guest, {
      lastSeq: 8, awaitingStart: true, matchStarted: false, boardReady: false,
    }))).toBe('board');
    const shooter = host.stones.find((stone) => stone.color === STONE_COLOR.BLACK);
    const launch = packLaunchSync({
      stoneId: shooter.id,
      color: shooter.color,
      x: shooter.body.position.x,
      y: shooter.body.position.y,
      velocity: { x: 12, y: -16 },
      force: { x: 0, y: 0 },
      power: 0.8,
    }, {
      roomId: 'dotori-pvp', senderId: 'host', started: true, timestamp: 20, seq: 9,
      currentTurn: STONE_COLOR.BLACK,
    });
    expect(shouldOpenGuestFromHostLive({
      awaitingStart: true, matchStarted: false, remoteStarted: true, event: 'launch',
    })).toBe(true);
    expect(incomingMatchSyncAction(launch, liveCtx(guest, {
      awaitingStart: true, matchStarted: false, boardReady: false,
    }))).toBe('open-launch');
    expect(guest.applyRemoteLaunch(launch, { ignorePause: true })).toBe(true);
    expect(guest.phase).toBe(PHASE.RESOLVING);
  });

  it('게이트를 닫은 뒤 일시정지여도 호스트 샷은 받고 판을 연다', () => {
    const guest = new GameEngine({ autoStart: false });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setHost(false);
    guest.pauseMatch();
    const black = guest.stones.find((stone) => stone.color === STONE_COLOR.BLACK);
    expect(guest.applyRemoteLaunch({
      stoneId: black.id,
      color: black.color,
      x: black.body.position.x,
      y: black.body.position.y,
      velocity: { x: 8, y: -8 },
      force: { x: 0, y: 0 },
    })).toBe(false);
    expect(guest.applyRemoteLaunch({
      stoneId: black.id,
      color: black.color,
      x: black.body.position.x,
      y: black.body.position.y,
      velocity: { x: 8, y: -8 },
      force: { x: 0, y: 0 },
    }, { ignorePause: true })).toBe(true);
    guest.phase = PHASE.IDLE;
    guest._remoteLaunchStoneId = null;
    guest.pauseMatch();
    expect(guest.applyRemoteLaunch({
      stoneId: black.id,
      color: black.color,
      x: 140,
      y: 220,
      velocity: { x: 6, y: -7 },
      force: { x: 0, y: 0 },
    }, { wake: true })).toBe(true);
    expect(guest.isPaused()).toBe(false);
    expect(black.body.position.x).toBeCloseTo(140);
    expect(black.body.position.y).toBeCloseTo(220);
    expect(guest.phase).toBe(PHASE.RESOLVING);
    expect(nextMatchBoardReady({ applied: true, event: 'launch', previous: false })).toBe(true);
    expect(shouldSyncSceneAfterHostStart({
      event: 'launch', boardReady: true, becameReady: true,
    })).toBe(true);
  });

  it('손님 시계는 호스트 timer만 따르고 조준을 지우지 않는다', () => {
    const guest = new GameEngine({ autoStart: false });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    guest.setHost(false);
    guest.setLocalTimer(false);
    guest.turnRemainingMs = 15000;
    guest.currentTurn = STONE_COLOR.WHITE;
    guest.phase = PHASE.AIMING;
    guest.aim = { stone: guest.stones[0], pointer: { x: 10, y: 20 } };
    const clock = packMatchSync({
      phase: PHASE.IDLE,
      currentTurn: STONE_COLOR.WHITE,
      turnRemainingMs: 12800,
    }, {
      event: 'timer', roomId: 'dotori-pvp', senderId: 'host', started: true, timestamp: 90, seq: 8,
    });
    expect(incomingMatchSyncAction(clock, liveCtx(guest, {
      lastSeq: 7, matchStarted: true, boardReady: true, isHost: false, senderIsHost: true,
    }))).toBe('board');
    expect(guest.applyRemoteMatchState(clock)).toBe(true);
    expect(guest.turnRemainingMs).toBe(12800);
    expect(guest.phase).toBe(PHASE.AIMING);
    expect(guest.aim).toBeTruthy();
    guest.step(12);
    expect(guest.turnRemainingMs).toBe(12800);
    guest.setLocalTimer(true);
    guest.setTimerAuthority(false);
    guest.phase = PHASE.IDLE;
    guest.aim = null;
    guest.turnRemainingMs = 800;
    guest._tickTurnTimer(2000);
    expect(guest.turnRemainingMs).toBe(0);
    expect(guest.phase).toBe(PHASE.IDLE);
  });

  it('id가 다른 원격 샷도 색과 좌표로 같은 돌을 굴린다', () => {
    const guest = new GameEngine({ autoStart: false });
    guest.setMatchConfig({ mode: GAME_MODE.PVP });
    const black = guest.stones.find((stone) => stone.color === STONE_COLOR.BLACK);
    expect(findLaunchStone(guest.stones, {
      stoneId: 999, color: STONE_COLOR.BLACK, x: black.body.position.x, y: black.body.position.y,
    })?.id).toBe(black.id);
    expect(guest.applyRemoteLaunch({
      stoneId: 999,
      color: STONE_COLOR.BLACK,
      x: black.body.position.x,
      y: black.body.position.y,
      velocity: { x: 6, y: -8 },
      force: { x: 0, y: 0 },
    })).toBe(true);
  });
});
