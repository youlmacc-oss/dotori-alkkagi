/**
 * 대기실 시나리오: 가상 접속자가 1인/AI/1:1 방을 연다.
 * 정원 10명 = 대기 본인 1 + 대국 9 (유형별 3).
 */

import { PRESENCE_STATUS } from './LobbyRooms.js';

export const VIRTUAL_GUEST_COUNT = 9;
export const VIRTUAL_MODES = Object.freeze(['solo', 'ai', 'pvp']);

const CHARACTERS = ['🐱', '🦊', '🐼', '🐯', '🐸', '🐵', '🐰', '🐻', '🐨'];

export function seedPlayingGuests(count = VIRTUAL_GUEST_COUNT) {
  const n = Math.max(0, Math.min(9, Number(count) || 0));
  return Array.from({ length: n }, (_, i) => {
    const mode = VIRTUAL_MODES[i % VIRTUAL_MODES.length];
    return {
      userId: `virt_${i + 1}`,
      nickname: `도토리${i + 1}`,
      character: CHARACTERS[i] || '🐶',
      seat: i + 1,
      status: PRESENCE_STATUS.PLAYING,
      mode,
      roomId: `room_virt_${i + 1}`,
      acorns: 3 + (i % 8),
    };
  });
}

export function applySeededPresence(manager, guests) {
  const channel = manager?.channel;
  if (!channel?._presenceState || !Array.isArray(guests)) return 0;
  for (const user of guests) {
    if (!user?.userId) continue;
    channel._presenceState.set(user.userId, [user]);
  }
  manager._handlePresenceSync?.();
  return guests.filter((u) => u?.userId).length;
}

export function virtualRoomTypes(guests) {
  const list = Array.isArray(guests) ? guests : [];
  return {
    solo: list.filter((u) => u.mode === 'solo').length,
    ai: list.filter((u) => u.mode === 'ai').length,
    pvp: list.filter((u) => u.mode === 'pvp').length,
  };
}
