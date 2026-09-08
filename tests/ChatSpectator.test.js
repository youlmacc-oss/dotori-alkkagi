import { describe, test, expect, beforeEach } from 'vitest';
import { PHASE, GAME_MODE, GameEngine, STONE_COLOR } from '../src/physics/GameEngine.js';
import { RealtimeManager, MockSupabaseClient, bindPresenceUnload, channelSendOk, channelSendLaunched } from '../src/network/RealtimeManager.js';
import { PRESENCE_RETRACK_GRACE_MS } from '../src/network/PresencePolicy.js';
import { canJoinPvpFromLobby, roomsFromPresence } from '../src/network/LobbyRooms.js';
import { idleLobbyInvitees, shouldKeepInviteShare, shouldOpenPresenceInvite } from '../src/network/PvpInvite.js';
import { applyRoomGuest, createRoomState, mergeRoomState, shouldKeepInviteShareFromRoom } from '../src/network/RoomState.js';
import { hasPvpOpponent, matchPlayersFromPresence } from '../src/network/MatchStart.js';

describe('관전 모드 (Spectator Mode)', () => {
  let engine;

  beforeEach(() => {
    engine = new GameEngine({ autoStart: false });
  });

  test('관전 모드 진입 시 SPECTATING 페이즈로 전환', () => {
    const spectatorData = {
      matchId: 'test_match_001',
      playerA: '호치',
      playerB: '달이'
    };

    engine.enterSpectatorMode(spectatorData);

    expect(engine.phase).toBe(PHASE.SPECTATING);
    expect(engine.gameMode).toBe(GAME_MODE.SPECTATE);
    expect(engine.inputLocked).toBe(true);
    expect(engine.spectatorData).toEqual(spectatorData);
  });

  test('관전 모드에서 사용자 입력 차단', () => {
    engine.enterSpectatorMode({
      matchId: 'test_match_001',
      playerA: '호치',
      playerB: '달이'
    });

    // 관전 모드에서는 입력이 차단되어야 함
    expect(engine.isHumanInputBlocked()).toBe(true);

    // 포인터 다운 이벤트가 처리되지 않아야 함
    const mockEvent = {
      preventDefault: () => {},
      clientX: 360,
      clientY: 400
    };

    // 관전 모드에서는 IDLE 상태가 아니므로 포인터 이벤트가 무시됨
    expect(engine.phase).toBe(PHASE.SPECTATING);
    expect(engine.aim).toBeNull();
  });

  test('관전 모드 종료 시 정상 모드로 복귀', () => {
    engine.enterSpectatorMode({
      matchId: 'test_match_001',
      playerA: '호치',
      playerB: '달이'
    });

    engine.exitSpectatorMode();

    expect(engine.phase).toBe(PHASE.IDLE);
    expect(engine.gameMode).toBe(GAME_MODE.AI);
    expect(engine.inputLocked).toBe(false);
    expect(engine.spectatorData).toBeNull();
  });

  test('관전 중에도 AI/1인 모드로 바로 연습할 수 있다', () => {
    engine.enterSpectatorMode({
      matchId: 'test_match_001',
      playerA: '호치',
      playerB: '달이',
    });
    engine.setMatchConfig({ mode: GAME_MODE.SOLO });
    expect(engine.phase).toBe(PHASE.IDLE);
    expect(engine.gameMode).toBe(GAME_MODE.SOLO);
    expect(engine.inputLocked).toBe(false);
    expect(engine.spectatorData).toBeNull();
    expect(engine.isHumanInputBlocked()).toBe(false);

    engine.enterSpectatorMode({
      matchId: 'test_match_002',
      playerA: '호치',
      playerB: '달이',
    });
    engine.setMatchConfig({ mode: GAME_MODE.AI });
    expect(engine.gameMode).toBe(GAME_MODE.AI);
    expect(engine.phase).toBe(PHASE.IDLE);
    expect(engine.spectatorData).toBeNull();
  });

  test('관전 중 게임 상태 업데이트', () => {
    engine.enterSpectatorMode({
      matchId: 'test_match_001',
      playerA: '호치',
      playerB: '달이'
    });

    const mockGameState = {
      phase: PHASE.RESOLVING,
      currentTurn: STONE_COLOR.WHITE,
      turnRemainingMs: 10000,
      stones: [
        {
          position: { x: 100, y: 200 },
          velocity: { x: 5, y: -3 },
          fallen: false
        },
        {
          position: { x: 200, y: 300 },
          velocity: { x: 0, y: 0 },
          fallen: false
        }
      ]
    };

    engine.updateSpectatorState(mockGameState);

    // 관전자는 항상 SPECTATING 페이즈를 유지해야 함
    expect(engine.phase).toBe(PHASE.SPECTATING);
    expect(engine.currentTurn).toBe(STONE_COLOR.WHITE);
    expect(engine.turnRemainingMs).toBe(10000);
  });

  test('관전 모드가 아닐 때 spectator 업데이트 무시', () => {
    // 일반 모드에서는 spectator 업데이트가 무시되어야 함
    const originalPhase = engine.phase;
    const originalTurn = engine.currentTurn;

    engine.updateSpectatorState({
      phase: PHASE.RESOLVING,
      currentTurn: STONE_COLOR.WHITE,
      turnRemainingMs: 5000
    });

    expect(engine.phase).toBe(originalPhase);
    expect(engine.currentTurn).toBe(originalTurn);
  });
});

describe('대기실 접속자 관리 (Lobby Presence)', () => {
  let realtimeManager;
  let mockClient;
  let presenceUpdates;
  let userJoins;
  let userLeaves;

  beforeEach(async () => {
    mockClient = new MockSupabaseClient();
    presenceUpdates = [];
    userJoins = [];
    userLeaves = [];
    
    realtimeManager = new RealtimeManager({
      supabaseClient: mockClient,
      channelName: 'test-lobby',
      userId: 'test_user_001',
      userNickname: '호치',
      userCharacter: '🐶',
      onPresenceUpdate: (users) => {
        presenceUpdates.push([...users]);
      },
      onUserJoin: (user) => {
        userJoins.push(user);
      },
      onUserLeave: (user) => {
        userLeaves.push(user);
      }
    });

    await realtimeManager.connect();
  });

  test('닉네임을 안 주면 접속 순으로 도토리N을 받는다', async () => {
    const client = new MockSupabaseClient();
    const first = new RealtimeManager({
      supabaseClient: client,
      channelName: 'nick-order',
      userId: 'n1',
    });
    const second = new RealtimeManager({
      supabaseClient: client,
      channelName: 'nick-order',
      userId: 'n2',
    });
    expect(await first.connect()).toBe('SUBSCRIBED');
    expect(first.userNickname).toBe('도토리1');
    expect(first.seat).toBe(1);
    const store = new Map();
    const night = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
    const saved = new RealtimeManager({
      supabaseClient: new MockSupabaseClient(),
      channelName: 'nick-reload',
      userId: 'n-reload',
      nicknameStorage: night,
    });
    expect(await saved.connect()).toBe('SUBSCRIBED');
    expect(saved.userNickname).toBe('도토리1');
    const again = new RealtimeManager({
      supabaseClient: new MockSupabaseClient(),
      channelName: 'nick-reload-2',
      userId: 'n-reload',
      nicknameStorage: night,
    });
    expect(await again.connect()).toBe('SUBSCRIBED');
    expect(again.userNickname).toBe('도토리1');
    expect(await second.connect()).toBe('SUBSCRIBED');
    expect(second.userNickname).toBe('도토리2');
    expect(second.seat).toBe(2);
    const late = new RealtimeManager({
      supabaseClient: client,
      channelName: 'nick-order',
      userId: 'n-late',
    });
    late.seat = 1;
    late.presence.joinedAt = (first.presence.joinedAt || 0) + 5000;
    late.assignJoinIdentity([
      { userId: 'n1', seat: 1, nickname: '도토리1', joinedAt: first.presence.joinedAt },
      { userId: 'n2', seat: 2, nickname: '도토리2', joinedAt: second.presence.joinedAt },
    ]);
    expect(late.seat).toBe(3);
    expect(late.userNickname).toBe('도토리3');
    const gapped = new RealtimeManager({
      supabaseClient: new MockSupabaseClient(),
      channelName: 'nick-gap',
      userId: 'n-gap',
    });
    gapped.userNickname = '도토리2';
    gapped.assignJoinIdentity([
      { userId: 'a', seat: 1, nickname: '도토리1', joinedAt: 1000 },
      { userId: 'b', seat: 5, nickname: '도토리5', joinedAt: 2000 },
    ]);
    expect(gapped.userNickname).toBe('도토리6');
  });

  test('저장된 임의 닉네임은 5글자 이내만 쓰고 좌석은 유지한다', async () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
    const client = new MockSupabaseClient();
    const player = new RealtimeManager({
      supabaseClient: client,
      channelName: 'nick-custom',
      userId: 'n3',
      nicknameStorage: storage,
    });
    const tooLong = player.setDisplayNickname('가나다라마바');
    expect(tooLong.ok).toBe(false);
    expect(tooLong.nickname).toBe('가나다라마');
    expect(player.userNickname).toBe('가나다라마');
    const named = player.setDisplayNickname('달이');
    expect(named.ok).toBe(true);
    expect(player.userNickname).toBe('달이');
    expect(await player.connect()).toBe('SUBSCRIBED');
    expect(player.userNickname).toBe('달이');
    expect(player.seat).toBe(1);
    expect(storage.getItem('dotori-alkkagi-nickname')).toBe('달이');
    const renamed = player.setDisplayNickname('호치');
    expect(renamed.ok).toBe(true);
    expect(player.userNickname).toBe('호치');
    const locked = player.setDisplayNickname('민수', { locked: true });
    expect(locked.ok).toBe(false);
    expect(locked.locked).toBe(true);
    expect(player.userNickname).toBe('호치');
    const taken = player.setDisplayNickname('달이', {
      users: [{ userId: 'other', nickname: '달이' }],
    });
    expect(taken.ok).toBe(true);
    expect(taken.renamed).toBe(true);
    expect(player.userNickname).toBe('달이2');
  });

  test('keepNickname이면 도토리1 외 접속자를 목록에서 빼고 퇴장시킨다', async () => {
    const client = new MockSupabaseClient();
    const keeper = new RealtimeManager({
      supabaseClient: client,
      channelName: 'sweep-lobby',
      userId: 'dev1',
      keepNickname: '도토리1',
    });
    expect(await keeper.connect()).toBe('SUBSCRIBED');
    expect(keeper.userNickname).toBe('도토리1');
    keeper.channel._presenceState.set('ghost', [{
      userId: 'ghost', nickname: '도토리3', lastSeen: Date.now(),
    }]);
    keeper.channel._presenceState.set('virt_1', [{
      userId: 'virt_1', nickname: '도토리2', lastSeen: Date.now(),
    }]);
    keeper._handlePresenceSync();
    expect(Array.from(keeper.onlineUsers.keys()).sort()).toEqual(['dev1', 'virt_1']);

    let swept = false;
    const other = new RealtimeManager({
      supabaseClient: client,
      channelName: 'sweep-lobby',
      userId: 'guest1',
      userNickname: '달이',
      keepNickname: '도토리1',
      onSweepLeave: () => { swept = true; },
    });
    expect(await other.connect()).toBe('SWEPT');
    expect(swept).toBe(true);
    expect(other.isConnected).toBe(false);
  });

  test('자신의 Presence 추적', async () => {
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(presenceUpdates.length).toBeGreaterThan(0);
    const lastUpdate = presenceUpdates[presenceUpdates.length - 1];
    expect(lastUpdate.length).toBe(1);
    expect(lastUpdate[0].userId).toBe('test_user_001');
    expect(lastUpdate[0].nickname).toBe('호치');
    expect(lastUpdate[0].character).toBe('🐶');
  });

  test('다른 사용자 Presence 상태 확인', () => {
    const users = Array.from(realtimeManager.onlineUsers.values());
    expect(users.length).toBe(1);
    expect(users[0].userId).toBe('test_user_001');
  });

  test('연결 해제 시 Presence 정리', async () => {
    await realtimeManager.disconnect();
    
    expect(realtimeManager.isConnected).toBe(false);
    expect(realtimeManager.onlineUsers.size).toBe(0);
  });

  test('Presence에 게임방 상태를 올린다', async () => {
    const ok = await realtimeManager.updatePresence({
      status: 'playing',
      mode: 'solo',
      roomId: 'room_test_user_001',
    });
    expect(ok).toBe(true);
    const me = realtimeManager.onlineUsers.get('test_user_001');
    expect(me.status).toBe('playing');
    expect(me.mode).toBe('solo');
    expect(me.roomId).toBe('room_test_user_001');
  });

  test('같은 채널의 다른 클라이언트가 서로의 방을 본다', async () => {
    const client = new MockSupabaseClient();
    const seenByB = [];
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'shared-lobby',
      userId: 'host_a',
      userNickname: '호치',
    });
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'shared-lobby',
      userId: 'guest_b',
      userNickname: '달이',
      onPresenceUpdate: (users) => { seenByB.push([...users]); },
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    await host.updatePresence({ status: 'playing', mode: 'solo', roomId: 'room_host_a' });
    await guest.updatePresence({ status: 'playing', mode: 'ai', roomId: 'room_guest_b' });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const rooms = roomsFromPresence(Array.from(guest.onlineUsers.values()));
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => r.mode).sort()).toEqual(['ai', 'solo']);
  });

  test('1:1 개설이 다른 대기실에 바로 보이고 참가할 수 있다', async () => {
    const client = new MockSupabaseClient();
    const seen = [];
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'join-live',
      userId: 'host_pvp',
      userNickname: '호치',
    });
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'join-live',
      userId: 'guest_pvp',
      userNickname: '달이',
      onPresenceUpdate: (users) => { seen.push([...users]); },
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    await host.updatePresence({ status: 'playing', mode: 'pvp', roomId: 'room_host_pvp' });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const live = Array.from(guest.onlineUsers.values());
    const rooms = roomsFromPresence(live.length ? live : seen.at(-1));
    expect(rooms.some((r) => r.id === 'room_host_pvp' && r.mode === 'pvp')).toBe(true);
    expect(canJoinPvpFromLobby(rooms.find((r) => r.id === 'room_host_pvp'), 'guest_pvp')).toBe(false);
    const invitees = idleLobbyInvitees(Array.from(host.onlineUsers.values()), 'host_pvp');
    expect(invitees.some((u) => (u.userId ?? u.id) === 'guest_pvp')).toBe(true);
  });

  test('presence sync는 보기가 같아도 목록을 다시 돌려 새로고침 없이 그린다', async () => {
    const client = new MockSupabaseClient();
    const seen = [];
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'sync-force',
      userId: 'host_force',
      userNickname: '호치',
    });
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'sync-force',
      userId: 'guest_force',
      userNickname: '달이',
      onPresenceUpdate: (users) => { seen.push(users.map((u) => u.userId).sort().join(',')); },
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    await new Promise((resolve) => setTimeout(resolve, 80));
    const before = seen.length;
    expect(before).toBeGreaterThan(0);
    guest._handlePresenceSync();
    expect(seen.length).toBeGreaterThan(before);
    expect(seen.at(-1)).toContain('host_force');
  });

  test('호스트 초대는 새로고침 없이 상대에게 방송되고 Presence에도 남는다', async () => {
    const client = new MockSupabaseClient();
    const invites = [];
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'invite-live',
      userId: 'host_live',
      userNickname: '호치',
    });
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'invite-live',
      userId: 'guest_live',
      userNickname: '달이',
      onPvpInvite: (payload) => { invites.push(payload); },
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    await host.updatePresence({
      status: 'playing',
      mode: 'pvp',
      roomId: 'room_host_live',
      inviteTargetId: 'guest_live',
      inviteAt: 99,
    });
    const sent = await host.broadcastPvpInvite({
      roomId: 'room_host_live',
      hostId: 'host_live',
      hostName: '호치',
      targetId: 'guest_live',
    });
    expect(sent).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(invites.length).toBeGreaterThanOrEqual(1);
    expect(invites.at(-1)).toEqual(expect.objectContaining({
      roomId: 'room_host_live',
      targetId: 'guest_live',
    }));
    const hostRow = Array.from(guest.onlineUsers.values()).find((u) => u.userId === 'host_live');
    expect(hostRow?.inviteTargetId).toBe('guest_live');
    expect(shouldOpenPresenceInvite(hostRow, 'guest_live')).toBe(true);
  });

  test('수락 방 상태는 새로고침 없이 호스트 초대를 접는다', async () => {
    const client = new MockSupabaseClient();
    const rooms = [];
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'room-auth',
      userId: 'host_room',
      userNickname: '호치',
      onRoomState: (payload) => { rooms.push(payload); },
    });
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'room-auth',
      userId: 'guest_room',
      userNickname: '달이',
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    const opened = createRoomState({ roomId: 'room_host_room', hostId: 'host_room', hostName: '호치' });
    expect(await host.broadcastRoomState(opened)).toBe(true);
    const joined = applyRoomGuest(opened, { guestId: 'guest_room', guestName: '달이' });
    expect(await guest.broadcastRoomState(joined)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const live = mergeRoomState(opened, rooms.at(-1));
    expect(live.guestId).toBe('guest_room');
    expect(shouldKeepInviteShareFromRoom(live, {
      myId: 'host_room', inRoom: true, mode: 'pvp',
    })).toBe(false);
  });

  test('broadcast는 send가 ok일 때만 성공하고 error면 한 번 더 보낸다', async () => {
    expect(channelSendOk('ok')).toBe(true);
    expect(channelSendOk('error')).toBe(false);
    expect(channelSendOk('timed out')).toBe(false);
    expect(channelSendLaunched('ok')).toBe(true);
    expect(channelSendLaunched('pending')).toBe(true);
    expect(channelSendLaunched('timed out')).toBe(false);
    const client = new MockSupabaseClient();
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'invite-ack',
      userId: 'host_ack',
      userNickname: '호치',
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    host.channel.send = async () => 'error';
    expect(await host.broadcastPvpInvite({
      roomId: 'room_host_ack',
      targetId: 'guest_ack',
    })).toBe(false);
    let n = 0;
    host.channel.send = async () => {
      n += 1;
      return n >= 2 ? 'ok' : 'timed out';
    };
    expect(await host.broadcastPvpInvite({
      roomId: 'room_host_ack',
      targetId: 'guest_ack',
    })).toBe(true);
    expect(n).toBeGreaterThanOrEqual(2);
  });

  test('초대 수락 후 오래된 대기 힌트가 호스트의 상대 입장을 덮지 않는다', async () => {
    const client = new MockSupabaseClient();
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'invite-join',
      userId: 'host_inv',
      userNickname: '호치',
    });
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'invite-join',
      userId: 'guest_inv',
      userNickname: '달이',
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    await host.updatePresence({ status: 'playing', mode: 'pvp', roomId: 'room_host_inv' });
    await guest.updatePresence({ status: 'lobby', mode: null, roomId: null });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await guest.updatePresence({ status: 'playing', mode: 'pvp', roomId: 'room_host_inv' });
    host._peerHints.set('guest_inv', {
      userId: 'guest_inv',
      status: 'lobby',
      mode: null,
      roomId: null,
      lastSeen: 1,
    });
    host.resyncPresence({ force: true });
    const live = Array.from(host.onlineUsers.values());
    const guestRow = live.find((u) => (u.userId ?? u.id) === 'guest_inv');
    expect(guestRow?.status).toBe('playing');
    expect(guestRow?.roomId).toBe('room_host_inv');
    expect(hasPvpOpponent(matchPlayersFromPresence(live, {
      myId: 'host_inv',
      mode: 'pvp',
      roomId: 'room_host_inv',
    }))).toBe(true);
    expect(shouldKeepInviteShare({
      mode: 'pvp',
      inRoom: true,
      started: false,
      isHost: true,
      myId: 'host_inv',
      roomId: 'room_host_inv',
      users: live,
    })).toBe(false);
  });

  test('빈 Presence 동기화가 다른 접속자를 지우지 않는다', async () => {
    const client = new MockSupabaseClient();
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'sparse-hold',
      userId: 'hold_b',
      userNickname: '달이',
    });
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'sparse-hold',
      userId: 'hold_a',
      userNickname: '호치',
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(Array.from(guest.onlineUsers.keys()).sort()).toEqual(['hold_a', 'hold_b']);
    client.channel('sparse-hold')._presenceState.delete('hold_a');
    guest.resyncPresence({ force: true });
    expect(Array.from(guest.onlineUsers.keys()).sort()).toEqual(['hold_a', 'hold_b']);
  });

  test('닉 변경 힌트가 있으면 Presence leave를 퇴장으로 보지 않는다', async () => {
    const client = new MockSupabaseClient();
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'nick-hint',
      userId: 'host_h',
      userNickname: '호치',
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    const now = Date.now();
    host._handleLobbyState({
      user: {
        userId: 'guest_h',
        presenceKey: 'guest_h',
        nickname: '달이',
        lastSeen: now,
        status: 'lobby',
      },
      left: false,
    });
    expect(Array.from(host.onlineUsers.keys())).toContain('guest_h');
    host._handlePresenceLeave('guest_h', [{
      userId: 'guest_h',
      nickname: '도토리2',
      lastSeen: now - 50,
    }]);
    expect(Array.from(host.onlineUsers.keys())).toContain('guest_h');
    expect(host.onlineUsers.get('guest_h')?.nickname).toBe('달이');
    expect(host.leftPresenceKeys()).not.toContain('guest_h');
  });

  test('닉네임을 바꿔도 호스트 목록에서 사라지지 않는다', async () => {
    const client = new MockSupabaseClient();
    const seen = [];
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'nick-hold',
      userId: 'host_n',
      userNickname: '호치',
      onPresenceUpdate: (users) => {
        seen.push(users.map((u) => ({ id: u.userId, nick: u.nickname })));
      },
    });
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'nick-hold',
      userId: 'guest_n',
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(seen.at(-1)?.some((u) => u.id === 'guest_n')).toBe(true);
    const renamed = guest.setDisplayNickname('달이');
    expect(renamed.ok).toBe(true);
    expect(renamed.nickname).toBe('달이');
    await new Promise((resolve) => setTimeout(resolve, 80));
    const firstSeen = seen.findIndex((list) => list.some((u) => u.id === 'guest_n'));
    expect(firstSeen).toBeGreaterThanOrEqual(0);
    expect(seen.slice(firstSeen).some((list) => !list.some((u) => u.id === 'guest_n'))).toBe(false);
    expect(seen.at(-1)?.some((u) => u.id === 'guest_n' && u.nick === '달이')).toBe(true);
  });

  test('닉 변경 lobby_state는 같은 시각의 옛 Presence에 덮이지 않는다', async () => {
    const client = new MockSupabaseClient();
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'nick-stale',
      userId: 'host_s',
      userNickname: '호치',
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    const at = Date.now();
    host.channel._presenceState.set('guest_s', [{
      userId: 'guest_s',
      presenceKey: 'guest_s',
      nickname: '도토리2',
      status: 'lobby',
      lastSeen: at,
      joinedAt: at - 60_000,
    }]);
    host.resyncPresence({ force: true });
    expect(host.onlineUsers.get('guest_s')?.nickname).toBe('도토리2');
    host._handleLobbyState({
      user: {
        userId: 'guest_s',
        presenceKey: 'guest_s',
        nickname: '달이',
        status: 'lobby',
        lastSeen: at,
        joinedAt: at - 60_000,
      },
      left: false,
    });
    expect(host.onlineUsers.get('guest_s')?.nickname).toBe('달이');
    host.resyncPresence({ force: true });
    expect(host.onlineUsers.get('guest_s')?.nickname).toBe('달이');
  });

  test('한 클라이언트가 나가면 다른 목록에서 바로 빠진다', async () => {
    const client = new MockSupabaseClient();
    const seen = [];
    const host = new RealtimeManager({
      supabaseClient: client,
      channelName: 'leave-sync',
      userId: 'leave_a',
      userNickname: '호치',
    });
    const guest = new RealtimeManager({
      supabaseClient: client,
      channelName: 'leave-sync',
      userId: 'leave_b',
      userNickname: '달이',
      onPresenceUpdate: (users) => { seen.push(users.map((u) => u.userId).sort()); },
    });
    expect(await host.connect()).toBe('SUBSCRIBED');
    expect(await guest.connect()).toBe('SUBSCRIBED');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(seen.at(-1)).toEqual(['leave_a', 'leave_b']);
    await host.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(seen.at(-1)).toEqual(['leave_b']);
    expect(Array.from(guest.onlineUsers.keys())).toEqual(['leave_b']);
    expect(client.removed).toContain('leave-sync');
  });

  test('페이지를 닫으면 Presence를 바로 내린다', async () => {
    const listeners = new Map();
    const target = {
      addEventListener(type, fn) {
        listeners.set(type, fn);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
    };
    const client = new MockSupabaseClient();
    const manager = new RealtimeManager({
      supabaseClient: client,
      channelName: 'unload-sync',
      userId: 'bye_1',
      userNickname: '호치',
    });
    expect(await manager.connect()).toBe('SUBSCRIBED');
    const unbind = bindPresenceUnload(manager, target);
    listeners.get('beforeunload')({});
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(manager.isConnected).toBe(false);
    expect(client.removed).toContain('unload-sync');
    unbind();
  });

  test('페이지 숨김 pagehide는 대국 퇴장으로 보지 않는다', async () => {
    const listeners = new Map();
    const target = {
      addEventListener(type, fn) {
        listeners.set(type, fn);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
      document: { visibilityState: 'hidden' },
    };
    const client = new MockSupabaseClient();
    const manager = new RealtimeManager({
      supabaseClient: client,
      channelName: 'hide-sync',
      userId: 'hide_1',
      userNickname: '호치',
    });
    expect(await manager.connect()).toBe('SUBSCRIBED');
    const unbind = bindPresenceUnload(manager, target);
    listeners.get('pagehide')({ type: 'pagehide', persisted: false });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(manager.isConnected).toBe(true);
    unbind();
  });

  test('9명이 대국 중이면 10번째는 입장하고 11번째는 거절된다', async () => {
    const client = new MockSupabaseClient();
    const channel = client.channel('cap-step');
    for (let i = 0; i < 9; i += 1) {
      await channel.track({
        userId: `seat_${i}`,
        nickname: `유저${i}`,
        status: 'playing',
        mode: ['solo', 'ai', 'pvp'][i % 3],
        roomId: `room_seat_${i}`,
      });
    }
    const tenth = new RealtimeManager({
      supabaseClient: client,
      channelName: 'cap-step',
      userId: 'seat_9',
      userNickname: '열번째',
    });
    expect(await tenth.connect()).toBe('SUBSCRIBED');
    const eleventh = new RealtimeManager({
      supabaseClient: client,
      channelName: 'cap-step',
      userId: 'seat_10',
      userNickname: '열한번째',
    });
    expect(await eleventh.connect()).toBe('FULL');
    expect(eleventh.isConnected).toBe(false);
    expect(tenth.isConnected).toBe(true);
  });

  test('정원이 차 있어도 기존 유저는 다시 들어온다', async () => {
    const client = new MockSupabaseClient();
    const channel = client.channel('rejoin-lobby');
    for (let i = 0; i < 10; i += 1) {
      await channel.track({
        userId: `old_${i}`,
        nickname: `유저${i}`,
        status: 'playing',
        mode: 'pvp',
        roomId: `room_old_${i}`,
      });
    }
    const again = new RealtimeManager({
      supabaseClient: client,
      channelName: 'rejoin-lobby',
      userId: 'old_3',
      userNickname: '기존',
    });
    expect(await again.connect()).toBe('SUBSCRIBED');
    expect(again.isConnected).toBe(true);
  });

  test('원격 유저가 나가면 방 목록에서 빠진다', async () => {
    const client = new MockSupabaseClient();
    const channel = client.channel('leave-lobby');
    const seen = [];
    const watcher = new RealtimeManager({
      supabaseClient: client,
      channelName: 'leave-lobby',
      userId: 'watch_1',
      userNickname: '감시',
      onPresenceUpdate: (users) => { seen.push([...users]); },
    });
    expect(await watcher.connect()).toBe('SUBSCRIBED');
    await channel.track({
      userId: 'gone_1',
      nickname: '금동이',
      status: 'playing',
      mode: 'solo',
      roomId: 'room_gone_1',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(roomsFromPresence(seen.at(-1)).some((r) => r.hostId === 'gone_1')).toBe(true);
    await channel.untrack('gone_1');
    await new Promise((resolve) => setTimeout(resolve, PRESENCE_RETRACK_GRACE_MS + 40));
    expect(roomsFromPresence(seen.at(-1)).some((r) => r.hostId === 'gone_1')).toBe(false);
  });

  test('대기실이 10명이면 신규 입장을 거부한다', async () => {
    const fullClient = new MockSupabaseClient();
    const channel = fullClient.channel('full-lobby');
    for (let i = 0; i < 10; i += 1) {
      await channel.track({
        userId: `full_${i}`,
        nickname: `유저${i}`,
        status: 'playing',
        mode: i % 2 ? 'ai' : 'solo',
        roomId: `room_full_${i}`,
      });
    }
    const blocked = new RealtimeManager({
      supabaseClient: fullClient,
      channelName: 'full-lobby',
      userId: 'full_11',
      userNickname: '열한번째',
    });
    const status = await blocked.connect();
    expect(status).toBe('FULL');
    expect(blocked.isConnected).toBe(false);
  });
});

describe('관전 데이터 브로드캐스트', () => {
  let realtimeManager;
  let mockClient;
  let spectatorUpdates;

  beforeEach(async () => {
    mockClient = new MockSupabaseClient();
    spectatorUpdates = [];
    
    realtimeManager = new RealtimeManager({
      supabaseClient: mockClient,
      channelName: 'test-match',
      userId: 'spectator_001',
      userNickname: '관전자',
      onSpectatorData: (gameState) => {
        spectatorUpdates.push(gameState);
      }
    });

    await realtimeManager.connect();
  });

  test('게임 상태 브로드캐스트', async () => {
    const gameState = {
      matchId: 'match_001',
      phase: PHASE.RESOLVING,
      currentTurn: STONE_COLOR.BLACK,
      turnRemainingMs: 12000,
      stones: [
        {
          id: 'stone_1',
          body: { 
            position: { x: 100, y: 200 },
            velocity: { x: 2, y: -1 }
          },
          fallen: false,
          color: STONE_COLOR.BLACK
        }
      ],
      winner: null
    };

    const result = await realtimeManager.broadcastSpectatorData(gameState);
    expect(result).toBe(true);

    // Mock 환경에서 브로드캐스트 수신 확인
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(spectatorUpdates.length).toBeGreaterThanOrEqual(1);
    
    const received = spectatorUpdates[0];
    expect(received.matchId).toBe('match_001');
    expect(received.phase).toBe(PHASE.RESOLVING);
    expect(received.currentTurn).toBe(STONE_COLOR.BLACK);
    expect(received.stones.length).toBe(1);
    expect(received.stones[0].position).toEqual({ x: 100, y: 200 });
  });

  test('연결되지 않은 상태에서 브로드캐스트 실패', async () => {
    await realtimeManager.disconnect();
    
    const result = await realtimeManager.broadcastSpectatorData({
      matchId: 'test',
      phase: PHASE.IDLE
    });
    
    expect(result).toBe(false);
  });
});