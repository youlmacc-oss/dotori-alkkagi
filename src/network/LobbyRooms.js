/**
 * 대기실 방 목록: 접속자 10명 정원, 1인/AI/1:1 모두 방 개설.
 */

export const LOBBY_CAP = 10;

export const PRESENCE_STATUS = Object.freeze({
  LOBBY: 'lobby',
  PLAYING: 'playing',
  SPECTATING: 'spectating',
});

const PLAYABLE = new Set(['solo', 'ai', 'pvp']);

export function isPlayableLobbyMode(mode) {
  return PLAYABLE.has(mode);
}

export function canAdmitUser(users, userId, cap = LOBBY_CAP) {
  const list = Array.isArray(users) ? users : [];
  if (list.some((u) => (u.userId ?? u.id) === userId)) return true;
  return list.length < cap;
}

export function opponentLabel(mode) {
  if (mode === 'solo') return '1인';
  if (mode === 'ai') return 'AI';
  return '1:1';
}

export function presenceFromMatch(input = {}) {
  const mode = input.mode;
  const phase = input.phase;
  const playing = input.inRoom !== false
    && isPlayableLobbyMode(mode)
    && phase !== 'spectating';
  const status = playing
    ? PRESENCE_STATUS.PLAYING
    : phase === 'spectating'
      ? PRESENCE_STATUS.SPECTATING
      : PRESENCE_STATUS.LOBBY;
  const userId = input.userId;
  const watching = status === PRESENCE_STATUS.SPECTATING;
  return {
    userId,
    nickname: input.nickname,
    character: input.character,
    status,
    mode: playing ? mode : null,
    roomId: playing
      ? (input.roomId || (userId ? `room_${userId}` : null))
      : watching
        ? (input.watchRoomId || input.roomId || null)
        : null,
    acorns: Number.isFinite(Number(input.acorns)) ? Math.floor(Number(input.acorns)) : 10,
    rearranging: Boolean(input.rearranging),
  };
}

export function openRoomCount(users) {
  return roomsFromPresence(users).length;
}

export function roomsFromPresence(users) {
  const playing = (users || []).filter((u) => (
    u.status === PRESENCE_STATUS.PLAYING && isPlayableLobbyMode(u.mode)
  ));
  const byRoom = new Map();
  for (const user of playing) {
    const id = user.roomId || `room_${user.userId ?? user.id}`;
    if (!byRoom.has(id)) {
      byRoom.set(id, {
        id,
        hostId: user.userId ?? user.id,
        hostName: user.nickname,
        mode: user.mode,
        players: [user],
        status: 'playing',
      });
    } else {
      byRoom.get(id).players.push(user);
    }
  }
  return Array.from(byRoom.values()).map((room) => {
    const first = room.players[0];
    const second = room.players[1];
    const waiting = room.mode === 'pvp' && room.players.length < 2;
    return {
      id: room.id,
      hostId: room.hostId,
      hostName: room.hostName,
      mode: room.mode,
      players: room.players,
      playerA: first?.nickname || room.hostName,
      playerB: second?.nickname || opponentLabel(room.mode),
      status: waiting ? 'waiting' : 'playing',
      watchers: watchersForRoom(users, room.id),
    };
  });
}

export function watchersForRoom(users, roomId) {
  if (!roomId) return [];
  return (users || []).filter((u) => (
    u.status === PRESENCE_STATUS.SPECTATING && u.roomId === roomId && u.nickname
  )).map((u) => ({
    id: u.userId ?? u.id,
    nickname: u.nickname,
  }));
}

export function watcherLine(watchers) {
  const names = (watchers || []).map((w) => w.nickname || w).filter(Boolean);
  return names.length ? `관람 ${names.join(', ')}` : '';
}

export function roomTitle(room) {
  if (!room) return '';
  if (room.mode === 'pvp' && room.playerA && room.playerB && room.playerB !== '1:1') {
    return `${room.playerA} vs ${room.playerB}`;
  }
  const label = opponentLabel(room.mode);
  return `${room.hostName || room.playerA || '손님'} · ${label}`;
}

export function isPvpWaiting(room) {
  return Boolean(room && room.mode === 'pvp' && room.status === 'waiting');
}

export function canJoinPvpRoom(room, userId) {
  if (!isPvpWaiting(room) || !userId) return false;
  const seated = (room.players || []).some((p) => (p.userId ?? p.id) === userId);
  return !seated && room.hostId !== userId;
}

export const PVP_WAIT_GUIDE = '1:1 대전방이 게이머를 기다리고 있습니다';
export const PVP_WAIT_ROOM_HINT = '게이머를 기다리고 있습니다';
export const LOBBY_MODE_HINT = '1인 연습 · AI 대국 · 1:1은 상대가 와야 시작';

export function waitingPvpRooms(rooms) {
  return (Array.isArray(rooms) ? rooms : []).filter(isPvpWaiting);
}

export function lobbyPvpWaitGuide(rooms) {
  return waitingPvpRooms(rooms).length ? PVP_WAIT_GUIDE : '';
}

export function lobbyGuideLine(rooms, locationGuide = '') {
  const wait = lobbyPvpWaitGuide(rooms);
  if (wait) return { text: wait, blink: true };
  if (!Array.isArray(rooms) || rooms.length === 0) {
    return { text: LOBBY_MODE_HINT, blink: false };
  }
  return { text: locationGuide, blink: false };
}

export function roomStatusLabel(room) {
  if (isPvpWaiting(room)) return PVP_WAIT_ROOM_HINT;
  return watcherLine(room?.watchers) || '대국 중';
}

export function presenceStatusLabel(user, rooms) {
  const room = (rooms || []).find((r) => r.id && r.id === user?.roomId);
  if (isPvpWaiting(room)) return '상대 대기';
  return userStatusLabel(user?.status);
}

export function userStatusLabel(status) {
  if (status === PRESENCE_STATUS.PLAYING) return '대국 중';
  if (status === PRESENCE_STATUS.SPECTATING) return '관전 중';
  return '대기중';
}

export function mergeSelfPresence(users, self, cap = LOBBY_CAP) {
  const next = { ...self, id: self.userId ?? self.id, isOwner: true };
  const list = Array.isArray(users) ? users.slice() : [];
  const idx = list.findIndex((u) => (u.userId ?? u.id) === next.userId);
  if (idx < 0) list.unshift(next);
  else list[idx] = { ...list[idx], ...next };
  return list.slice(0, cap);
}
