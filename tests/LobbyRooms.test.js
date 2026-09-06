import { describe, expect, it } from 'vitest';
import {
  LOBBY_CAP,
  canAdmitUser,
  isPlayableLobbyMode,
  applyLivePresence,
  isSparsePresenceSnapshot,
  isMatchRoomOccupant,
  lobbySeatUsers,
  retainKnownPeers,
  mergeSelfPresence,
  presenceFromMatch,
  openRoomCount,
  roomTitle,
  filterOwnIdleRooms,
  idleLobbyPresence,
  presenceViewKey,
  usersFromPresenceState,
  pickLatestPresence,
  preferNewerPresence,
  shouldReplacePresenceHint,
  mergePresenceWithHints,
  dedupePresenceUsers,
  roomsFromPresence,
  canJoinPvpFromLobby,
  canJoinPvpRoom,
  mergePresenceList,
  lobbyGuideLine,
  lobbyPvpWaitGuide,
  presenceStatusLabel,
  roomStatusLabel,
  userStatusLabel,
  watcherLine,
  watchersForRoom,
  LOBBY_MODE_HINT,
  PVP_WAIT_GUIDE,
  PVP_WAIT_ROOM_HINT,
} from '../src/network/LobbyRooms.js';
import { defaultGameModeForLobbyCount, GAME_MODE } from '../src/physics/GameEngine.js';

function user(id, extra = {}) {
  return {
    userId: id,
    nickname: extra.nickname ?? id,
    character: '🐶',
    status: extra.status ?? 'playing',
    mode: extra.mode ?? 'ai',
    roomId: extra.roomId ?? `room_${id}`,
  };
}

describe('대기실 게임방', () => {
  it('1인·AI·1:1은 모두 방 개설로 본다', () => {
    expect(isPlayableLobbyMode(GAME_MODE.SOLO)).toBe(true);
    expect(isPlayableLobbyMode(GAME_MODE.AI)).toBe(true);
    expect(isPlayableLobbyMode(GAME_MODE.PVP)).toBe(true);
    expect(isPlayableLobbyMode(GAME_MODE.SPECTATE)).toBe(false);

    const rooms = roomsFromPresence([
      user('a', { mode: 'solo', nickname: '호치' }),
      user('b', { mode: 'ai', nickname: '달이' }),
      user('c', { mode: 'pvp', nickname: '금동이' }),
      user('d', { status: 'lobby', mode: null, roomId: null }),
    ]);
    expect(rooms).toHaveLength(3);
    expect(rooms.map((r) => r.mode).sort()).toEqual(['ai', 'pvp', 'solo']);
    expect(roomTitle(rooms.find((r) => r.mode === 'solo'))).toBe('호치 · 1인');
    expect(roomTitle(rooms.find((r) => r.mode === 'ai'))).toBe('달이 · AI');
    expect(roomTitle(rooms.find((r) => r.mode === 'pvp'))).toBe('금동이 · 1:1');
    expect(rooms.find((r) => r.mode === 'pvp').status).toBe('waiting');
    expect(roomStatusLabel(rooms.find((r) => r.mode === 'pvp'))).toBe(PVP_WAIT_ROOM_HINT);
    expect(lobbyPvpWaitGuide(rooms)).toBe(PVP_WAIT_GUIDE);
    expect(PVP_WAIT_GUIDE).toContain('초대');
    expect(PVP_WAIT_ROOM_HINT).toContain('초대 대전중');
    expect(canJoinPvpRoom(rooms.find((r) => r.mode === 'pvp'), 'guest')).toBe(true);
    expect(canJoinPvpFromLobby(rooms.find((r) => r.mode === 'pvp'), 'guest')).toBe(true);
    expect(lobbySeatUsers([
      user('a', { mode: 'solo', nickname: '호치' }),
      user('b', { mode: 'ai', nickname: '달이' }),
      user('c', { mode: 'pvp', nickname: '금동이' }),
      user('d', { status: 'lobby', mode: null, roomId: null, nickname: '손님' }),
      {
        userId: 'e', nickname: '관람', status: 'spectating', mode: null, roomId: 'room_c',
      },
    ]).map((u) => u.userId).sort()).toEqual(['d', 'e']);
    expect(isMatchRoomOccupant(user('c', { mode: 'pvp' }))).toBe(true);
    expect(isMatchRoomOccupant(user('d', { status: 'lobby', mode: null, roomId: null }))).toBe(false);
    expect(canJoinPvpRoom(rooms.find((r) => r.mode === 'pvp'), 'c')).toBe(false);
    expect(presenceStatusLabel(user('c', { mode: 'pvp', nickname: '금동이' }), rooms)).toBe('상대 대기');
  });

  it('접속 10명까지 모드 제한 없이 각자 방을 연다', () => {
    const modes = ['solo', 'ai', 'pvp'];
    const users = Array.from({ length: LOBBY_CAP }, (_, i) => user(`u${i}`, {
      mode: modes[i % 3],
      nickname: `유저${i}`,
    }));
    const rooms = roomsFromPresence(users);
    expect(rooms).toHaveLength(10);
    expect(rooms.filter((r) => r.mode === 'solo')).toHaveLength(4);
    expect(rooms.filter((r) => r.mode === 'ai')).toHaveLength(3);
    expect(rooms.filter((r) => r.mode === 'pvp')).toHaveLength(3);
  });

  it('같은 roomId의 1:1은 한 방으로 묶는다', () => {
    const rooms = roomsFromPresence([
      user('a', { mode: 'pvp', nickname: '호치', roomId: 'room_pvp_1' }),
      user('b', { mode: 'pvp', nickname: '달이', roomId: 'room_pvp_1' }),
    ]);
    expect(rooms).toHaveLength(1);
    expect(roomTitle(rooms[0])).toBe('호치 vs 달이');
    expect(rooms[0].status).toBe('playing');
    expect(roomStatusLabel(rooms[0])).toBe('대국 중');
    expect(canJoinPvpRoom(rooms[0], 'guest')).toBe(false);
    expect(lobbyPvpWaitGuide(rooms)).toBe('');
    expect(lobbyGuideLine(rooms, '접속된 게이머의 위치는 항상 공개됩니다')).toEqual({
      text: '접속된 게이머의 위치는 항상 공개됩니다',
      blink: false,
    });
  });

  it('방 없을 때는 모드 한 줄을 쓰고, 1:1 대기면 점멸 안내가 우선한다', () => {
    expect(LOBBY_MODE_HINT).toContain('1인');
    expect(LOBBY_MODE_HINT).toContain('AI');
    expect(LOBBY_MODE_HINT).toContain('1:1');
    expect(lobbyGuideLine([], '위치')).toEqual({ text: LOBBY_MODE_HINT, blink: false });
    expect(lobbyGuideLine(null, '위치')).toEqual({ text: LOBBY_MODE_HINT, blink: false });
    const waiting = roomsFromPresence([
      user('c', { mode: 'pvp', nickname: '금동이' }),
    ]);
    expect(lobbyGuideLine(waiting, '위치')).toEqual({ text: PVP_WAIT_GUIDE, blink: true });
  });

  it('대기·관전은 방을 열지 않는다', () => {
    expect(roomsFromPresence([
      user('a', { status: 'lobby', mode: null }),
      user('b', { status: 'spectating', mode: 'ai' }),
    ])).toHaveLength(0);
    expect(userStatusLabel('playing')).toBe('대국 중');
    expect(userStatusLabel('spectating')).toBe('관전 중');
    expect(userStatusLabel('lobby')).toBe('대기중');
    expect(openRoomCount([
      user('a', { status: 'lobby', mode: null, roomId: null }),
    ])).toBe(0);
  });

  it('presenceFromMatch는 플레이 모드를 방 상태로 올린다', () => {
    expect(presenceFromMatch({
      userId: 'u1', nickname: '호치', mode: 'solo', phase: 'idle',
    })).toMatchObject({ status: 'playing', mode: 'solo', roomId: 'room_u1' });
    expect(presenceFromMatch({
      userId: 'u1', mode: 'ai', phase: 'spectating',
    })).toMatchObject({ status: 'spectating', mode: null, roomId: null });
    expect(presenceFromMatch({
      userId: 'u2', nickname: '달이', phase: 'spectating', watchRoomId: 'room_a',
    })).toMatchObject({ status: 'spectating', roomId: 'room_a' });
    expect(presenceFromMatch({
      userId: 'u1', mode: 'ai', phase: 'idle', inRoom: false,
    })).toMatchObject({ status: 'lobby', mode: null, roomId: null });
    expect(presenceFromMatch({
      userId: 'u1', mode: 'pvp', phase: 'idle', rearranging: true,
    }).rearranging).toBe(true);
    expect(presenceFromMatch({
      userId: 'u1', mode: 'pvp', phase: 'idle', started: true,
    }).started).toBe(true);
    expect(presenceFromMatch({
      userId: 'u1', mode: 'pvp', phase: 'idle', inRoom: false, started: true,
    }).started).toBe(false);
    expect(presenceViewKey([
      { userId: 'a', status: 'playing', mode: 'pvp', roomId: 'room_a', started: false },
    ])).not.toBe(presenceViewKey([
      { userId: 'a', status: 'playing', mode: 'pvp', roomId: 'room_a', started: true },
    ]));
  });

  it('관람자가 들어오면 그 대전 방에 닉네임이 붙는다', () => {
    const users = [
      user('a', { mode: 'ai', nickname: '호치', roomId: 'room_a' }),
      {
        userId: 'b', nickname: '달이', status: 'spectating', mode: null, roomId: 'room_a',
      },
      {
        userId: 'c', nickname: '금동', status: 'spectating', mode: null, roomId: 'room_other',
      },
    ];
    const rooms = roomsFromPresence(users);
    expect(rooms).toHaveLength(1);
    expect(watchersForRoom(users, 'room_a').map((w) => w.nickname)).toEqual(['달이']);
    expect(rooms[0].watchers.map((w) => w.nickname)).toEqual(['달이']);
    expect(watcherLine(rooms[0].watchers)).toBe('관람 달이');
  });

  it('정원 10명을 넘기면 신규 입장만 막는다', () => {
    const ten = Array.from({ length: 10 }, (_, i) => user(`u${i}`));
    expect(canAdmitUser(ten, 'u0')).toBe(true);
    expect(canAdmitUser(ten, 'u10')).toBe(false);
    expect(canAdmitUser(ten.slice(0, 9), 'u9')).toBe(true);
  });

  it('모드를 바꿔도 자기 방 제목만 갱신한다', () => {
    let list = mergeSelfPresence([], presenceFromMatch({
      userId: 'u1', nickname: '호치', mode: 'ai', phase: 'idle',
    }));
    expect(roomTitle(roomsFromPresence(list)[0])).toBe('호치 · AI');
    list = mergeSelfPresence(list, presenceFromMatch({
      userId: 'u1', nickname: '호치', mode: 'solo', phase: 'idle',
    }));
    expect(roomsFromPresence(list)).toHaveLength(1);
    expect(roomTitle(roomsFromPresence(list)[0])).toBe('호치 · 1인');
    list = mergeSelfPresence(list, presenceFromMatch({
      userId: 'u1', nickname: '호치', mode: 'pvp', phase: 'idle',
    }));
    expect(roomTitle(roomsFromPresence(list)[0])).toBe('호치 · 1:1');
    list = mergeSelfPresence(list, idleLobbyPresence({
      userId: 'u1', nickname: '호치',
    }));
    expect(list[0].status).toBe('lobby');
    expect(list[0].roomId).toBeNull();
    expect(roomsFromPresence(list)).toHaveLength(0);
    expect(filterOwnIdleRooms(roomsFromPresence([
      presenceFromMatch({ userId: 'u1', nickname: '호치', mode: 'pvp', phase: 'idle' }),
    ]), 'u1', false)).toHaveLength(0);
    expect(filterOwnIdleRooms(roomsFromPresence([
      presenceFromMatch({ userId: 'u1', nickname: '호치', mode: 'pvp', phase: 'idle' }),
    ]), 'u1', true)).toHaveLength(1);
    const playing = presenceFromMatch({ userId: 'u2', nickname: '달이', mode: 'pvp', phase: 'idle' });
    expect(presenceViewKey([{ ...playing, lastSeen: 1 }]))
      .toBe(presenceViewKey([{ ...playing, lastSeen: 99 }]));
    expect(presenceViewKey([playing]))
      .not.toBe(presenceViewKey([idleLobbyPresence({ userId: 'u2', nickname: '달이' })]));
    expect(usersFromPresenceState({
      pk_a: [{ userId: 'same', nickname: '호치', status: 'playing', mode: 'pvp' }],
      pk_b: [{ userId: 'same', nickname: '랄2', status: 'lobby' }],
    }).map((u) => u.nickname).sort()).toEqual(['랄2', '호치']);
    expect(usersFromPresenceState({
      host: [
        { userId: 'host', nickname: '도토리1', lastSeen: 1000 },
        { userId: 'host', nickname: '도토리1', lastSeen: 2000 },
      ],
    }).map((u) => u.userId)).toEqual(['host']);
    expect(pickLatestPresence([
      { nickname: '도토리1', lastSeen: 1 },
      { nickname: '도토리1', lastSeen: 9 },
    ]).lastSeen).toBe(9);
    const liveJoin = preferNewerPresence(
      { userId: 'g', status: 'playing', mode: 'pvp', roomId: 'room_h', lastSeen: 200 },
      { userId: 'g', status: 'lobby', mode: null, roomId: null, lastSeen: 100 },
    );
    expect(liveJoin.status).toBe('playing');
    expect(liveJoin.roomId).toBe('room_h');
    const hintedJoin = preferNewerPresence(
      { userId: 'g', status: 'lobby', mode: null, roomId: null, lastSeen: 100 },
      { userId: 'g', status: 'playing', mode: 'pvp', roomId: 'room_h', lastSeen: 200 },
    );
    expect(hintedJoin.status).toBe('playing');
    expect(mergePresenceWithHints(
      [{ userId: 'g', status: 'playing', mode: 'pvp', roomId: 'room_h', lastSeen: 200 }],
      [{ userId: 'g', status: 'lobby', mode: null, roomId: null, lastSeen: 100 }],
    )[0].status).toBe('playing');
    expect(preferNewerPresence(
      { userId: 'g', status: 'playing', mode: 'pvp', roomId: 'room_h' },
      { userId: 'g', status: 'lobby', mode: null, roomId: null, lastSeen: 100 },
    )).toMatchObject({ status: 'playing', roomId: 'room_h' });
    expect(dedupePresenceUsers([
      { userId: 'g', status: 'lobby', mode: null, roomId: null, lastSeen: 80 },
      { userId: 'g', status: 'playing', mode: 'ai', roomId: 'room_g' },
    ])[0]).toMatchObject({ status: 'playing', mode: 'ai', roomId: 'room_g' });
    expect(shouldReplacePresenceHint(
      { userId: 'g', status: 'lobby', lastSeen: 80 },
      { userId: 'g', status: 'playing', mode: 'pvp', roomId: 'room_g', lastSeen: 90 },
    )).toBe(false);
    expect(shouldReplacePresenceHint(
      { userId: 'g', status: 'playing', mode: 'pvp', roomId: 'room_g', lastSeen: 120 },
      { userId: 'g', status: 'playing', mode: 'pvp', roomId: 'room_g', lastSeen: 90 },
    )).toBe(true);
    expect(presenceFromMatch({
      userId: 'h', mode: 'pvp', phase: 'idle', inviteTargetId: 'guest', inviteAt: 9,
    })).toMatchObject({ inviteTargetId: 'guest', status: 'playing' });
    expect(dedupePresenceUsers([
      { userId: 'host#0', presenceKey: 'host', nickname: '도토리1' },
      { userId: 'host', presenceKey: 'host', nickname: '도토리1', lastSeen: 5 },
    ])).toHaveLength(1);
    const kept = mergePresenceList(
      [presenceFromMatch({ userId: 'u2', nickname: '달이', mode: 'solo', phase: 'idle' })],
      [{ userId: 'u2', nickname: '달이', status: 'playing' }],
    );
    expect(kept[0].mode).toBe('solo');
    expect(roomsFromPresence(kept)).toHaveLength(1);
  });

  it('조준·진행·종료 중에도 방은 유지되고 관전만 접는다', () => {
    for (const phase of ['idle', 'aiming', 'resolving', 'gameOver']) {
      const row = presenceFromMatch({ userId: 'u1', nickname: '호치', mode: 'pvp', phase });
      expect(row.status).toBe('playing');
      expect(roomsFromPresence([row])).toHaveLength(1);
    }
    expect(roomsFromPresence([
      presenceFromMatch({ userId: 'u1', mode: 'ai', phase: 'spectating' }),
    ])).toHaveLength(0);
  });

  it('대기실 목록은 Presence 스냅샷이 권위이고 떠난 사람을 남기지 않는다', () => {
    const self = { userId: 'me', nickname: '호치', status: 'lobby' };
    const live = applyLivePresence([
      user('a', { status: 'playing', mode: 'solo', nickname: '달이' }),
      { userId: 'me', nickname: '호치', status: 'lobby', mode: null, roomId: null },
    ], self);
    expect(live.map((u) => u.userId).sort()).toEqual(['a', 'me']);
    const afterLeave = applyLivePresence([
      { userId: 'me', nickname: '호치', status: 'lobby', mode: null, roomId: null },
    ], self);
    expect(afterLeave.map((u) => u.userId)).toEqual(['me']);
    expect(roomsFromPresence(afterLeave)).toHaveLength(0);
    expect(isSparsePresenceSnapshot([{ userId: 'me', status: 'lobby' }], 'me')).toBe(true);
    expect(isSparsePresenceSnapshot([
      { userId: 'me', status: 'lobby' },
      { userId: 'a', status: 'lobby' },
    ], 'me')).toBe(false);
    const held = retainKnownPeers(
      [user('a', { status: 'lobby', mode: null, roomId: null, nickname: '달이' }), self],
      [self],
      { selfId: 'me' },
    );
    expect(held.map((u) => u.userId).sort()).toEqual(['a', 'me']);
    expect(retainKnownPeers(
      [user('a', { status: 'lobby', mode: null, roomId: null }), self],
      [self],
      { selfId: 'me', leftIds: ['a'] },
    ).map((u) => u.userId)).toEqual(['me']);
  });

  it('한 명이 나가면 그 방만 사라지고 나머지는 유지된다', () => {
    const users = Array.from({ length: 10 }, (_, i) => user(`u${i}`, {
      mode: ['solo', 'ai', 'pvp'][i % 3],
      nickname: `유저${i}`,
    }));
    const left = users.filter((u) => u.userId !== 'u4');
    const rooms = roomsFromPresence(left);
    expect(rooms).toHaveLength(9);
    expect(rooms.some((r) => r.hostId === 'u4')).toBe(false);
    expect(rooms.some((r) => r.hostId === 'u0')).toBe(true);
  });

  it('접속 10명이어도 모드를 1:1로 강제하지 않는다', () => {
    expect(defaultGameModeForLobbyCount(10)).toBeNull();
    expect(defaultGameModeForLobbyCount(2)).toBeNull();
    expect(defaultGameModeForLobbyCount(1)).toBe(GAME_MODE.AI);
  });
});
