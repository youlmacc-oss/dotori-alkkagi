import { describe, expect, it } from 'vitest';
import {
  applySeededPresence,
  seedPlayingGuests,
  virtualRoomTypes,
} from '../src/network/LobbySeed.js';
import { openRoomCount, roomsFromPresence } from '../src/network/LobbyRooms.js';

describe('가상 대기실 시드', () => {
  it('9명이 1인·AI·1:1 방을 고르게 연다', () => {
    const guests = seedPlayingGuests(9);
    expect(guests).toHaveLength(9);
    const types = virtualRoomTypes(guests);
    expect(types).toEqual({ solo: 3, ai: 3, pvp: 3 });
    expect(openRoomCount(guests)).toBe(9);
    expect(roomsFromPresence(guests).map((r) => r.mode).sort()).toEqual([
      'ai', 'ai', 'ai', 'pvp', 'pvp', 'pvp', 'solo', 'solo', 'solo',
    ]);
  });

  it('대기 중인 본인을 합치면 정원 10명·대국 9방이다', () => {
    const guests = seedPlayingGuests(9);
    const users = [
      {
        userId: 'me', nickname: '곶감', status: 'lobby', mode: null, roomId: null,
      },
      ...guests,
    ];
    expect(users).toHaveLength(10);
    expect(openRoomCount(users)).toBe(9);
  });

  it('목 Presence에 심으면 sync가 호출된다', () => {
    const state = new Map();
    let synced = 0;
    const manager = {
      channel: { _presenceState: state },
      _handlePresenceSync: () => { synced += 1; },
    };
    expect(applySeededPresence(manager, seedPlayingGuests(9))).toBe(9);
    expect(state.size).toBe(9);
    expect(synced).toBe(1);
  });
});
