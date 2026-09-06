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

/** 1인·AI·1:1 방을 연 사람은 대기실 좌석이 아니라 방 목록에만 둔다. */
export function isMatchRoomOccupant(user) {
  return Boolean(
    user
    && user.status === PRESENCE_STATUS.PLAYING
    && isPlayableLobbyMode(user.mode),
  );
}

export function lobbySeatUsers(users) {
  return (Array.isArray(users) ? users : []).filter((user) => !isMatchRoomOccupant(user));
}

function presenceTime(user) {
  return Number(user?.lastSeen || user?.joinedAt) || 0;
}

export function presenceViewKey(users) {
  return (Array.isArray(users) ? users : [])
    .map((user) => [
      user?.userId ?? user?.id ?? '',
      user?.nickname ?? '',
      user?.status ?? '',
      user?.mode ?? '',
      user?.roomId ?? '',
      user?.seat ?? '',
      user?.rearranging ? '1' : '0',
      user?.started ? '1' : '0',
      user?.inviteTargetId ?? '',
      user?.inviteAt ?? '',
      user?.pvpOpenedAt ?? '',
    ].join('\t'))
    .sort()
    .join('\n');
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
    started: Boolean(playing && input.started),
    inviteTargetId: playing && input.inviteTargetId ? String(input.inviteTargetId) : null,
    inviteAt: playing && Number(input.inviteAt) > 0 ? Math.floor(Number(input.inviteAt)) : null,
    pvpOpenedAt: Number(input.pvpOpenedAt) > 0 ? Math.floor(Number(input.pvpOpenedAt)) : null,
  };
}

export function idleLobbyPresence(input = {}) {
  return presenceFromMatch({
    ...input,
    inRoom: false,
    mode: null,
    phase: 'idle',
    rearranging: false,
    started: false,
    inviteTargetId: null,
    inviteAt: null,
    pvpOpenedAt: null,
  });
}

export function filterOwnIdleRooms(rooms, myId, inMatch = false) {
  const list = Array.isArray(rooms) ? rooms : [];
  if (inMatch || !myId) return list;
  return list.filter((room) => room.hostId !== myId);
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

export function canJoinPvpFromLobby(room, userId) {
  return canJoinPvpRoom(room, userId);
}

export const PVP_WAIT_GUIDE = '1:1 초대 대전 중입니다';
export const PVP_WAIT_ROOM_HINT = '초대 대전중';
export const LOBBY_MODE_HINT = '1인 연습 · AI 대국 · 1:1은 참가 또는 초대';

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

export function presenceIdentity(user) {
  return String(user?.presenceKey || user?.userId || user?.id || '').trim();
}

export function pickLatestPresence(metas) {
  const list = (Array.isArray(metas) ? metas : []).filter(Boolean);
  if (!list.length) return null;
  return list.reduce((best, row) => {
    const nextAt = Number(row.lastSeen || row.joinedAt) || 0;
    const bestAt = Number(best.lastSeen || best.joinedAt) || 0;
    return nextAt >= bestAt ? row : best;
  });
}

/** 힌트는 없을 때이거나 더 새로울 때만 덮는다. 시각이 비면 방 개설이 대기보다 앞선다. */
export function preferNewerPresence(current, incoming) {
  if (!incoming) return current || null;
  if (!current) return { ...incoming };
  const nextAt = presenceTime(incoming);
  const curAt = presenceTime(current);
  const incomingPlay = isMatchRoomOccupant(incoming);
  const currentPlay = isMatchRoomOccupant(current);
  let newer = nextAt > curAt ? incoming : current;
  if (incomingPlay !== currentPlay && (!nextAt || !curAt || nextAt === curAt)) {
    newer = incomingPlay ? incoming : current;
  }
  const older = newer === incoming ? current : incoming;
  const merged = {
    ...older,
    ...newer,
    userId: current.userId || incoming.userId,
    id: current.id || incoming.id,
    presenceKey: current.presenceKey || incoming.presenceKey || current.userId || incoming.userId,
  };
  if (nextAt === curAt && incomingPlay && currentPlay) {
    const newerInv = Number(newer.inviteAt) || 0;
    const olderInv = Number(older.inviteAt) || 0;
    if (olderInv > newerInv && older.inviteTargetId) {
      merged.inviteTargetId = older.inviteTargetId;
      merged.inviteAt = older.inviteAt;
    }
  }
  return merged;
}

/** 방 개설 힌트는 더 오래된 대기 스냅샷에 지우지 않는다. */
export function shouldReplacePresenceHint(live, hint) {
  if (!hint) return false;
  const liveAt = presenceTime(live);
  const hintAt = presenceTime(hint);
  if (isMatchRoomOccupant(hint) && !isMatchRoomOccupant(live)) return liveAt > hintAt;
  return liveAt >= hintAt;
}

export function mergePresenceWithHints(users, hints) {
  const next = (Array.isArray(users) ? users : []).map((user) => ({ ...user }));
  for (const hint of hints || []) {
    const id = String(hint?.userId ?? hint?.id ?? hint?.presenceKey ?? '').trim();
    if (!id) continue;
    const idx = next.findIndex((user) => (
      (user.userId ?? user.id) === id || user.presenceKey === (hint.presenceKey || id)
    ));
    const row = { ...hint, userId: id, id, presenceKey: hint.presenceKey || id };
    if (idx < 0) next.push(row);
    else next[idx] = preferNewerPresence(next[idx], row);
  }
  return next;
}

export function usersFromPresenceState(state = {}) {
  const users = [];
  for (const [key, metas] of Object.entries(state || {})) {
    const presence = pickLatestPresence(metas);
    if (!presence) continue;
    users.push({
      ...presence,
      userId: key,
      id: key,
      presenceKey: key,
      status: presence.status || PRESENCE_STATUS.LOBBY,
      mode: presence.mode ?? null,
      roomId: presence.roomId ?? null,
    });
  }
  return users;
}

export function dedupePresenceUsers(users) {
  const byKey = new Map();
  for (const user of users || []) {
    const key = presenceIdentity(user);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...user, userId: user.userId || key, id: user.id || key, presenceKey: user.presenceKey || key });
      continue;
    }
    const nextAt = presenceTime(user);
    const prevAt = presenceTime(prev);
    const userPlay = isMatchRoomOccupant(user);
    const prevPlay = isMatchRoomOccupant(prev);
    let takeNext = nextAt >= prevAt;
    if (userPlay !== prevPlay && (!nextAt || !prevAt || nextAt === prevAt)) {
      takeNext = userPlay;
    }
    const next = takeNext ? { ...prev, ...user } : { ...user, ...prev };
    byKey.set(key, {
      ...next,
      userId: key,
      id: key,
      presenceKey: key,
    });
  }
  return Array.from(byKey.values());
}

export function mergePresenceList(prev, next) {
  const prior = new Map();
  for (const user of prev || []) {
    const id = user?.userId ?? user?.id;
    if (id) prior.set(id, user);
  }
  return (next || []).map((user) => {
    const id = user?.userId ?? user?.id;
    const old = id ? prior.get(id) : null;
    if (!old) return user;
    if (user.status === PRESENCE_STATUS.LOBBY) {
      return { ...old, ...user, mode: user.mode ?? null, roomId: user.roomId ?? null };
    }
    return {
      ...old,
      ...user,
      status: user.status || old.status,
      mode: user.mode ?? old.mode,
      roomId: user.roomId != null ? user.roomId : old.roomId,
    };
  });
}

export function mergeSelfPresence(users, self, cap = LOBBY_CAP) {
  const mine = self.userId ?? self.id;
  const next = {
    ...self,
    id: mine,
    userId: mine,
    presenceKey: self.presenceKey || mine,
    isOwner: true,
  };
  const list = Array.isArray(users) ? users.slice() : [];
  const idx = list.findIndex((u) => {
    const id = u.userId ?? u.id;
    return id === mine || presenceIdentity(u) === presenceIdentity(next);
  });
  if (idx < 0) list.unshift(next);
  else list[idx] = { ...list[idx], ...next };
  return dedupePresenceUsers(list).slice(0, cap);
}

/** 빈 스냅샷·나만 남은 동기화는 아직 퇴장으로 보지 않는다. */
export function isSparsePresenceSnapshot(users, selfId) {
  const list = (Array.isArray(users) ? users : []).filter((user) => user?.userId ?? user?.id);
  if (!list.length) return true;
  if (!selfId) return false;
  return list.length === 1 && String(list[0].userId ?? list[0].id) === String(selfId);
}

export function retainKnownPeers(prev, live, { selfId, leftIds } = {}) {
  const next = dedupePresenceUsers(Array.isArray(live) ? live : []);
  if (!isSparsePresenceSnapshot(next, selfId)) return next;
  const left = new Set((leftIds || []).map((id) => String(id)));
  const seen = new Set(next.map((user) => String(user.userId ?? user.id)));
  const kept = [];
  for (const user of prev || []) {
    const id = String(user?.userId ?? user?.id ?? '');
    if (!id || id === String(selfId || '') || left.has(id) || seen.has(id)) continue;
    kept.push(user);
    seen.add(id);
  }
  return dedupePresenceUsers([...next, ...kept]);
}

/** Presence 스냅샷이 권위. 떠난 사람은 이전 목록에 남지 않는다. */
export function applyLivePresence(live, self, cap = LOBBY_CAP) {
  const list = dedupePresenceUsers(Array.isArray(live) ? live : []);
  return self ? mergeSelfPresence(list, self, cap) : list.slice(0, cap);
}
