import { describe, expect, it } from 'vitest';
import {
  ROOM_STATE_EVENT,
  applyRoomAck,
  applyRoomClearInvite,
  applyRoomGuest,
  applyRoomInvite,
  applyRoomLeave,
  applyRoomRematch,
  applyRoomStart,
  createRoomState,
  incomingClearsOpponent,
  incomingResetsForRematch,
  mergeRoomState,
  shouldAdoptHostRoom,
  pvpSeatColor,
  roomHasOpponent,
  shouldApplyPresenceOpponentLoss,
  shouldApplyRoomState,
  shouldKeepInviteShareFromRoom,
  shouldKeepPvpRematch,
  shouldReturnToPvpWait,
  stampRoomAcorns,
  tossFirstPlayerId,
} from '../src/network/RoomState.js';

describe('1:1 방 상태', () => {
  it('수락하면 guestId가 생기고 호스트 초대 시트는 접는다', () => {
    const opened = createRoomState({ roomId: 'room_host', hostId: 'host', hostName: '호치' });
    expect(opened.guestId).toBeNull();
    expect(opened.seq).toBe(0);
    expect(opened.acked).toBe(false);
    expect(shouldKeepInviteShareFromRoom(opened, {
      myId: 'host', inRoom: true, mode: 'pvp',
    })).toBe(true);
    const invited = applyRoomInvite(opened, 'guest');
    expect(invited.inviteTargetId).toBe('guest');
    expect(applyRoomClearInvite(invited).inviteTargetId).toBeNull();
    const joined = applyRoomGuest(invited, { guestId: 'guest', guestName: '달이' });
    expect(joined.guestId).toBe('guest');
    expect(joined.firstId).toBe(tossFirstPlayerId(joined));
    expect(tossFirstPlayerId(joined)).toBe(tossFirstPlayerId({
      roomId: joined.roomId, hostId: joined.hostId, guestId: joined.guestId, matchGen: joined.matchGen,
    }));
    expect(joined.inviteTargetId).toBeNull();
    expect(roomHasOpponent(joined)).toBe(true);
    expect(shouldKeepInviteShareFromRoom(joined, {
      myId: 'host', inRoom: true, mode: 'pvp',
    })).toBe(false);
    expect(applyRoomStart(joined)).toMatchObject({ started: true, phase: 'playing' });
  });

  it('호스트는 상대가 보낸 방 상태를 같은 방에만 합친다', () => {
    const host = createRoomState({ roomId: 'room_host', hostId: 'host' });
    const merged = mergeRoomState(host, {
      roomId: 'room_host',
      hostId: 'host',
      guestId: 'guest',
      guestName: '달이',
    });
    expect(merged.guestId).toBe('guest');
    expect(shouldApplyRoomState(merged, { myId: 'host', roomId: 'room_host' })).toBe(true);
    expect(shouldApplyRoomState(merged, { myId: 'other', roomId: 'room_host' })).toBe(false);
    expect(ROOM_STATE_EVENT).toBe('room_state');
    expect(mergeRoomState(host, { roomId: 'room_other', hostId: 'x', guestId: 'guest' }).guestId).toBeNull();
    const started = {
      roomId: 'room_host', hostId: 'host', guestId: 'guest', started: true, phase: 'playing',
    };
    expect(shouldApplyRoomState(started, {
      myId: 'guest', roomId: 'room_guest', inRoom: true,
    })).toBe(true);
    expect(shouldApplyRoomState(started, {
      myId: 'other', roomId: 'room_guest', inRoom: true,
    })).toBe(false);
    const localOwn = createRoomState({ roomId: 'room_guest', hostId: 'guest' });
    expect(shouldAdoptHostRoom(localOwn, started)).toBe(true);
    expect(mergeRoomState(localOwn, started)).toMatchObject({
      roomId: 'room_host', guestId: 'guest', started: true,
    });
  });

  it('게스트는 백, 호스트는 흑으로 앉는다', () => {
    expect(pvpSeatColor({ myId: 'host', hostId: 'host', roomId: 'room_host' })).toBe('black');
    expect(pvpSeatColor({ myId: 'guest', hostId: 'host', roomId: 'room_host' })).toBe('white');
    expect(pvpSeatColor({ myId: 'guest', roomId: 'room_host' })).toBe('white');
  });

  it('한 명이 나가면 남은 방은 상대 대기로 돌아간다', () => {
    const playing = applyRoomStart(applyRoomGuest(
      createRoomState({ roomId: 'room_host', hostId: 'host' }),
      { guestId: 'guest' },
    ));
    const left = applyRoomLeave(playing, { leaverId: 'guest' });
    expect(playing.firstId).toBe(tossFirstPlayerId(playing));
    expect(left.guestId).toBeNull();
    expect(left.firstId).toBeNull();
    expect(left.started).toBe(false);
    expect(left.phase).toBe('waiting');
    expect(left.leftoverId).toBe('host');
    expect(incomingClearsOpponent(playing, left)).toBe(true);
    expect(mergeRoomState(playing, left).guestId).toBeNull();
    expect(shouldReturnToPvpWait({
      inRoom: true, mode: 'pvp', hadOpponent: true, hasOpponent: false,
    })).toBe(true);
    expect(shouldReturnToPvpWait({
      inRoom: true, mode: 'pvp', hadOpponent: true, hasOpponent: true,
    })).toBe(false);
    expect(shouldReturnToPvpWait({
      inRoom: true, mode: 'pvp', hadOpponent: true, hasOpponent: false, started: true, phase: 'idle',
    })).toBe(false);
    expect(shouldReturnToPvpWait({
      inRoom: true, mode: 'pvp', hadOpponent: true, hasOpponent: false, started: true, phase: 'gameOver',
    })).toBe(true);
    const seated = applyRoomAck(applyRoomGuest(
      createRoomState({ roomId: 'room_host', hostId: 'host' }),
      { guestId: 'guest' },
    ));
    expect(seated.acked).toBe(true);
    const lateInvite = applyRoomInvite(
      createRoomState({ roomId: 'room_host', hostId: 'host' }),
      'guest',
    );
    expect(incomingClearsOpponent(seated, lateInvite)).toBe(false);
    expect(mergeRoomState(seated, lateInvite).guestId).toBe('guest');
    const rematch = applyRoomRematch(playing);
    expect(rematch).toMatchObject({
      guestId: 'guest', started: false, phase: 'ready', matchGen: 1, seq: 0, acked: true,
    });
    expect(incomingResetsForRematch(playing, rematch)).toBe(true);
    expect(incomingResetsForRematch(playing, {
      ...rematch, started: true, phase: 'playing',
    })).toBe(true);
    expect(mergeRoomState(playing, {
      ...rematch, started: true, phase: 'playing',
    })).toMatchObject({ started: true, matchGen: 1 });
    expect(shouldApplyPresenceOpponentLoss({
      roomHasOpponent: true, presenceHasOpponent: false, confirmedLeave: false,
    })).toBe(false);
    expect(shouldApplyPresenceOpponentLoss({
      roomHasOpponent: true, presenceHasOpponent: false, confirmedLeave: true,
    })).toBe(false);
    expect(shouldApplyPresenceOpponentLoss({
      roomHasOpponent: false, presenceHasOpponent: false, confirmedLeave: false,
    })).toBe(false);
    expect(shouldApplyPresenceOpponentLoss({
      roomHasOpponent: false, presenceHasOpponent: false, confirmedLeave: true,
    })).toBe(true);
    expect(incomingResetsForRematch(playing, {
      roomId: playing.roomId, hostId: 'host', guestId: 'guest', started: false, matchGen: 0,
    })).toBe(false);
    expect(mergeRoomState(playing, rematch).started).toBe(false);
    expect(mergeRoomState(rematch, { ...playing, hostAcorns: 11, guestAcorns: 9 }).started).toBe(false);
    expect(mergeRoomState(rematch, { ...rematch, started: true, phase: 'playing' }).started).toBe(true);
    expect(stampRoomAcorns(rematch, { myId: 'host', acorns: 11 }).hostAcorns).toBe(11);
    expect(stampRoomAcorns(rematch, { myId: 'guest', acorns: 9 }).guestAcorns).toBe(9);
    expect(shouldKeepPvpRematch({
      mode: 'pvp', inRoom: true, roomId: 'room_host', hostId: 'host', guestId: 'guest',
    })).toBe(true);
    expect(shouldKeepPvpRematch({
      mode: 'pvp', inRoom: true, roomId: 'room_host', hostId: 'host', guestId: null,
    })).toBe(false);
    expect(shouldApplyRoomState(left, {
      myId: 'host', roomId: 'room_host', inRoom: true,
    })).toBe(true);
    expect(shouldKeepInviteShareFromRoom(left, {
      myId: 'host', inRoom: true, mode: 'pvp',
    })).toBe(true);
  });
});
