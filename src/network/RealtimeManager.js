/**
 * Supabase Realtime 연동 관리자
 * 관전 데이터 브로드캐스트와 Presence 관리를 담당한다.
 */

import { LOBBY_CAP, PRESENCE_STATUS, canAdmitUser, dedupePresenceUsers, isSparsePresenceSnapshot, mergePresenceWithHints, preferNewerPresence, presenceViewKey, retainKnownPeers, shouldReplacePresenceHint, usersFromPresenceState } from './LobbyRooms.js';
import { MATCH_SYNC_EVENT, packMatchSync } from './MatchSync.js';
import { PVP_INVITE_EVENT } from './PvpInvite.js';
import { ROOM_STATE_EVENT } from './RoomState.js';
import {
  defaultNickname,
  NICKNAME_LOCKED_HINT,
  nextDotoriNumber,
  readStoredNickname,
  shouldKeepAssignedNickname,
  uniqueLobbyNickname,
  writeStoredNickname,
} from './Nickname.js';
import { parseAcorn } from './AcornPolicy.js';
import {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_STALE_MS,
  activeLobbyUsers,
  isCustomNickname,
  isKeptConnectedNickname,
  keepConnectedUsers,
  reconcileOwnSeat,
  shouldEvictConnectedUser,
  shouldForceLobbyLeave,
} from './PresencePolicy.js';

export const LOBBY_SWEEP_EVENT = 'lobby_sweep';
export const LOBBY_STATE_EVENT = 'lobby_state';

export const LOBBY_CHANNEL = 'dotori-lobby';

/** Supabase channel.send는 예외 없이 'ok' | 'timed out' | 'error'를 돌려준다. */
export function channelSendOk(result) {
  return result === 'ok';
}

export function lobbyChannelConfig(userId) {
  return {
    config: {
      broadcast: { ack: false, self: false },
      presence: { key: String(userId || 'anon') },
    },
  };
}

export class RealtimeManager {
  constructor(options = {}) {
    this.supabaseClient = options.supabaseClient;
    this.channelName = options.channelName || LOBBY_CHANNEL;
    this.userId = options.userId || `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.presenceKey = options.presenceKey || this.userId;
    this._fixedNickname = Object.prototype.hasOwnProperty.call(options, 'userNickname');
    this.userNickname = this._fixedNickname ? (options.userNickname || '익명') : '';
    this.userCharacter = options.userCharacter || '🐶';
    this.seat = options.seat ?? null;
    this.nicknameStorage = options.nicknameStorage ?? globalThis.sessionStorage;
    this.lobbyCap = options.lobbyCap ?? LOBBY_CAP;
    this.presence = {
      status: PRESENCE_STATUS.LOBBY,
      mode: null,
      roomId: null,
    };
    
    this.channel = null;
    this.isConnected = false;
    this.onlineUsers = new Map();
    this._listeners = new Map();
    this._lobbyFull = false;
    
    // 콜백 함수들
    this.onPresenceUpdate = options.onPresenceUpdate || (() => {});
    this.onSpectatorData = options.onSpectatorData || (() => {});
    this.onUserJoin = options.onUserJoin || (() => {});
    this.onUserLeave = options.onUserLeave || (() => {});
    this.onLobbyFull = options.onLobbyFull || (() => {});
    this.onStaleLeave = options.onStaleLeave || (() => {});
    this.onSweepLeave = options.onSweepLeave || (() => {});
    this.onPvpInvite = options.onPvpInvite || (() => {});
    this.onRoomState = options.onRoomState || (() => {});
    this.keepNickname = options.keepNickname || null;
    this._disconnectedAt = null;
    this._staleTimer = 0;
    this._heartbeatTimer = 0;
    this._reconciling = false;
    this._sweeping = false;
    this._lobbySwept = false;
    this._nickAssigned = Boolean(this._fixedNickname && this.userNickname);
    this._localSeeds = new Map();
    this._presenceViewKey = '';
    this._connecting = false;
    this._unloading = false;
    this._peerHints = new Map();
    this._leftKeys = new Set();
  }

  rememberLocalPresence(users) {
    for (const user of users || []) {
      if (user?.userId) this._localSeeds.set(user.userId, user);
    }
    return this._localSeeds.size;
  }

  _presenceUsers() {
    return Array.from(this.onlineUsers.values());
  }

  leftPresenceKeys() {
    return Array.from(this._leftKeys);
  }

  canAdmitSelf() {
    const state = this.channel?.presenceState?.() || {};
    const listed = Object.values(state).map((row) => row[0]).filter(Boolean);
    const pool = listed.length ? listed : this._presenceUsers();
    return canAdmitUser(this._visibleUsers(pool), this.userId, this.lobbyCap);
  }

  _mergeLocalSeeds(users) {
    const next = Array.isArray(users) ? users.slice() : [];
    for (const seed of this._localSeeds.values()) {
      if (!next.some((u) => (u.userId ?? u.id) === seed.userId)) next.push(seed);
    }
    return next;
  }

  _mergePeerHints(users) {
    return mergePresenceWithHints(users, Array.from(this._peerHints.values()));
  }

  _visibleUsers(users) {
    return keepConnectedUsers(
      activeLobbyUsers(this._mergeLocalSeeds(this._mergePeerHints(users))),
      this.keepNickname,
    );
  }

  _shouldSelfEvict() {
    return Boolean(this.keepNickname)
      && !isKeptConnectedNickname(this.userNickname, this.keepNickname);
  }

  channelNeedsReconnect() {
    if (!this.channel) return true;
    const state = String(this.channel.state || '').toLowerCase();
    return state === 'closed' || state === 'errored' || state === 'leaving';
  }

  async _teardownChannel({ untrack = false } = {}) {
    const ch = this.channel;
    this.channel = null;
    this.isConnected = false;
    if (!ch) return;
    const key = this.presenceKey || this.userId;
    if (untrack) {
      try { await ch.untrack?.(key); } catch { /* ignore */ }
    }
    try { await ch.unsubscribe(); } catch { /* ignore */ }
    try { await this.supabaseClient?.removeChannel?.(ch); } catch { /* ignore */ }
  }

  /**
   * Realtime 연결을 시작한다.
   */
  async connect(options = {}) {
    const force = Boolean(options.force);
    if (!this.supabaseClient) return undefined;
    if (this._connecting) return this.isConnected ? 'SUBSCRIBED' : undefined;
    if (this.isConnected && !force && !this.channelNeedsReconnect()) {
      return 'SUBSCRIBED';
    }

    try {
      this._connecting = true;
      this._lobbyFull = false;
      this._lobbySwept = false;
      if (this.channel || this.isConnected) {
        await this._teardownChannel({ untrack: false });
      }
      this.channel = this.supabaseClient
        .channel(this.channelName, lobbyChannelConfig(this.presenceKey || this.userId))
        .on('presence', { event: 'sync' }, () => {
          this._handlePresenceSync();
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          this._handlePresenceJoin(key, newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          this._handlePresenceLeave(key, leftPresences);
        })
        .on('broadcast', { event: MATCH_SYNC_EVENT }, ({ payload }) => {
          this._handleSpectatorUpdate(payload);
        })
        .on('broadcast', { event: LOBBY_SWEEP_EVENT }, ({ payload }) => {
          this._handleLobbySweep(payload);
        })
        .on('broadcast', { event: PVP_INVITE_EVENT }, ({ payload }) => {
          this.onPvpInvite?.(payload);
        })
        .on('broadcast', { event: LOBBY_STATE_EVENT }, ({ payload }) => {
          this._handleLobbyState(payload);
        })
        .on('broadcast', { event: ROOM_STATE_EVENT }, ({ payload }) => {
          this.onRoomState?.(payload);
        });

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('realtime timeout')), 15000);
        this.channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            this._handlePresenceSync();
            if (!this.canAdmitSelf()) {
              this._lobbyFull = true;
              clearTimeout(timer);
              resolve('FULL');
              return;
            }
            this.assignJoinIdentity(this._presenceUsers());
            if (this._shouldSelfEvict()) {
              this._lobbySwept = true;
              clearTimeout(timer);
              resolve('SWEPT');
              return;
            }
            await this._trackPresence();
            this.isConnected = true;
            this.noteReconnect();
            await this._broadcastLobbySweep();
            this.emit('connected');
            clearTimeout(timer);
            resolve('SUBSCRIBED');
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            this.noteDisconnect();
            clearTimeout(timer);
            reject(new Error(status));
          }
        });
      });

      if (this._lobbySwept) {
        await this.sweepSelfLeave();
        return 'SWEPT';
      }

      if (this._lobbyFull) {
        await this._teardownChannel({ untrack: true });
        this.emit('lobbyFull');
        this.onLobbyFull();
        return 'FULL';
      }

      return 'SUBSCRIBED';
    } catch (error) {
      console.error('Realtime 연결 실패:', error);
      await this._teardownChannel({ untrack: true });
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  /**
   * Realtime 연결을 종료한다.
   */
  async disconnect() {
    this._stopHeartbeat();
    this._clearStaleTimer();
    const key = this.presenceKey || this.userId;
    await this._broadcastLobbyState({ userId: key, presenceKey: key }, true);
    await this._teardownChannel({ untrack: true });
    this.onlineUsers.clear();
    this._peerHints.clear();
    this._leftKeys.clear();
    this._presenceViewKey = '';
    this.emit('disconnected');
  }

  noteDisconnect(now = Date.now()) {
    if (this._disconnectedAt == null) this._disconnectedAt = Number(now) || Date.now();
    this._armStaleLeave();
    return this._disconnectedAt;
  }

  noteReconnect() {
    this._disconnectedAt = null;
    this._clearStaleTimer();
  }

  _armStaleLeave() {
    this._clearStaleTimer();
    const wait = Math.max(0, PRESENCE_STALE_MS - (Date.now() - (this._disconnectedAt || Date.now())));
    this._staleTimer = setTimeout(() => {
      this.checkStaleLeave();
    }, wait);
  }

  _clearStaleTimer() {
    if (this._staleTimer) clearTimeout(this._staleTimer);
    this._staleTimer = 0;
  }

  startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this.isConnected) this._trackPresence();
    }, PRESENCE_HEARTBEAT_MS);
    if (this.isConnected) this._trackPresence();
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = 0;
  }

  checkStaleLeave(now = Date.now()) {
    if (!shouldForceLobbyLeave(this._disconnectedAt, now)) return false;
    this.forceLobbyLeave();
    return true;
  }

  async sweepSelfLeave() {
    if (this._sweeping) return false;
    this._sweeping = true;
    this.seat = null;
    await this.disconnect();
    this.emit('sweepLeave');
    this.onSweepLeave();
    this._sweeping = false;
    return true;
  }

  async _sendBroadcast(event, payload, retries = 1) {
    if (!this.channel) return false;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await this.channel.send({
          type: 'broadcast',
          event,
          payload,
        });
        if (channelSendOk(result)) return true;
      } catch {
        /* retry */
      }
    }
    return false;
  }

  async _broadcastLobbySweep() {
    if (!this.keepNickname || this._shouldSelfEvict() || !this.channel || !this.isConnected) return false;
    return this._sendBroadcast(LOBBY_SWEEP_EVENT, { keep: this.keepNickname });
  }

  _applyVisiblePresence(raw, { force = false } = {}) {
    const users = retainKnownPeers(
      Array.from(this.onlineUsers.values()),
      dedupePresenceUsers(this._visibleUsers(raw)),
      { selfId: this.userId, leftIds: Array.from(this._leftKeys) },
    );
    const key = presenceViewKey(users);
    const same = key === this._presenceViewKey && this._presenceViewKey !== '';
    this._presenceViewKey = key;
    this.onlineUsers = new Map(users.map((u) => [u.userId ?? u.id, u]));
    if (this.isConnected) {
      if (!same) this._reconcileOwnIdentity(users);
      if (this._shouldSelfEvict()) {
        this.sweepSelfLeave();
        return users;
      }
      if (raw.some((user) => shouldEvictConnectedUser(user, this.keepNickname))) {
        this._broadcastLobbySweep();
      }
    }
    if (!same || force) this.onPresenceUpdate(users);
    return users;
  }

  _handleLobbySweep(payload = {}) {
    const keep = payload.keep || this.keepNickname;
    if (!keep || isKeptConnectedNickname(this.userNickname, keep)) return;
    this.sweepSelfLeave();
  }

  async forceLobbyLeave() {
    if (!isCustomNickname(this.userNickname)) {
      this.userNickname = '';
      writeStoredNickname('', this.nicknameStorage);
      this._nickAssigned = false;
    }
    this.seat = null;
    this.presence = { ...this.presence, joinedAt: undefined };
    await this.disconnect();
    this.emit('staleLeave');
    this.onStaleLeave();
  }

  /**
   * 관전 데이터를 브로드캐스트한다.
   */
  async broadcastPvpInvite(payload) {
    if (!this.channel || !payload?.targetId || !payload?.roomId) return false;
    return this._sendBroadcast(PVP_INVITE_EVENT, payload);
  }

  async broadcastRoomState(payload) {
    if (!this.channel || !payload?.roomId || !payload?.hostId) return false;
    return this._sendBroadcast(ROOM_STATE_EVENT, payload);
  }

  async broadcastSpectatorData(gameState) {
    if (!this.isConnected || !this.channel || !gameState) return false;

    return this._sendBroadcast(MATCH_SYNC_EVENT, packMatchSync(gameState, {
      matchId: gameState.matchId || gameState.roomId || `match_${Date.now()}`,
      roomId: gameState.roomId || gameState.matchId || '',
      senderId: gameState.senderId || '',
      timestamp: gameState.timestamp,
      started: gameState.started === true,
      stones: gameState.stones,
    }));
  }

  /**
   * 현재 사용자의 Presence를 추적한다.
   */
  assignJoinIdentity(users) {
    if (!this.presence.joinedAt) this.presence.joinedAt = Date.now();
    const others = this._visibleUsers(users).filter((u) => (u.userId ?? u.id) !== this.userId);
    this.seat = reconcileOwnSeat({
      others,
      mySeat: this.seat,
      myJoinedAt: this.presence.joinedAt,
      myId: this.userId,
      cap: this.lobbyCap,
    });
    const fallback = defaultNickname(nextDotoriNumber(others));
    if (this._fixedNickname) {
      if (!this.userNickname) this.userNickname = fallback;
      return this.userNickname;
    }
    const stored = readStoredNickname(this.nicknameStorage);
    const already = Boolean(this._nickAssigned && this.userNickname);
    if (shouldKeepAssignedNickname({
      assigned: already,
      nickname: this.userNickname,
      others,
      myId: this.userId,
      myJoinedAt: this.presence.joinedAt,
    })) return this.userNickname;
    const candidate = already
      ? this.userNickname
      : (isCustomNickname(this.userNickname) ? this.userNickname : stored);
    const raw = isCustomNickname(candidate) ? candidate : '';
    const named = uniqueLobbyNickname(raw, others, fallback, this.userId);
    this.userNickname = named.nickname;
    this._nickAssigned = true;
    if (isCustomNickname(this.userNickname)) {
      writeStoredNickname(this.userNickname, this.nicknameStorage);
    } else {
      writeStoredNickname('', this.nicknameStorage);
    }
    return this.userNickname;
  }

  setDisplayNickname(raw, extras = {}) {
    if (extras.locked) {
      return {
        ok: false,
        locked: true,
        nickname: this.userNickname || defaultNickname(this.seat || 1),
        custom: false,
        hint: NICKNAME_LOCKED_HINT,
      };
    }
    const others = this._visibleUsers(extras.users ?? this._presenceUsers())
      .filter((u) => (u.userId ?? u.id) !== this.userId);
    const fallback = defaultNickname(nextDotoriNumber(others));
    const result = uniqueLobbyNickname(raw, others, fallback, this.userId);
    this.userNickname = result.nickname;
    this._nickAssigned = true;
    writeStoredNickname(result.custom ? result.nickname : '', this.nicknameStorage);
    if (this._shouldSelfEvict()) {
      this.sweepSelfLeave();
      return { ...result, swept: true };
    }
    if (this.isConnected) {
      this.updatePresence({ nickname: this.userNickname, seat: this.seat });
    }
    return result;
  }

  async _trackPresence() {
    if (!this.channel) return;

    const roomId = this.presence.roomId ?? null;
    const status = this.presence.status ?? PRESENCE_STATUS.LOBBY;
    const presenceData = {
      userId: this.userId,
      presenceKey: this.presenceKey || this.userId,
      nickname: this.userNickname,
      character: this.userCharacter,
      seat: this.seat,
      role: status === PRESENCE_STATUS.PLAYING && roomId
        ? (roomId === `room_${this.userId}` ? 'host' : 'guest')
        : 'lobby',
      status,
      mode: this.presence.mode ?? null,
      roomId,
      acorns: parseAcorn(this.presence.acorns),
      rearranging: Boolean(this.presence.rearranging),
      started: Boolean(this.presence.started),
      inviteTargetId: this.presence.inviteTargetId ? String(this.presence.inviteTargetId) : null,
      inviteAt: Number(this.presence.inviteAt) > 0 ? this.presence.inviteAt : null,
      pvpOpenedAt: Number(this.presence.pvpOpenedAt) > 0 ? this.presence.pvpOpenedAt : null,
      joinedAt: this.presence.joinedAt ?? Date.now(),
      lastSeen: Date.now(),
    };

    await this.channel.track(presenceData);
    await this._broadcastLobbyState(presenceData);
  }

  async _broadcastLobbyState(user, left = false) {
    if (!this.channel) return false;
    return this._sendBroadcast(LOBBY_STATE_EVENT, { user, left: Boolean(left) });
  }

  _handleLobbyState(payload = {}) {
    const row = payload.user;
    const key = String(row?.presenceKey || row?.userId || row?.id || '').trim();
    if (!key || key === (this.presenceKey || this.userId)) return;
    if (payload.left) {
      this._peerHints.delete(key);
      this.onlineUsers.delete(key);
      this.resyncPresence({ force: true });
      return;
    }
    const incoming = {
      ...row,
      userId: key,
      id: key,
      presenceKey: key,
    };
    const prev = this._peerHints.get(key) || this.onlineUsers.get(key);
    this._peerHints.set(key, preferNewerPresence(prev, incoming));
    this.resyncPresence({ force: true });
  }

  async updatePresence(patch = {}) {
    this.presence = { ...this.presence, ...patch };
    if (patch.nickname != null) this.userNickname = patch.nickname;
    if (patch.seat != null) this.seat = patch.seat;
    if (!this.channel || !this.isConnected) return false;
    await this._trackPresence();
    return true;
  }

  /**
   * Presence 동기화를 처리한다.
   */
  resyncPresence({ force = false } = {}) {
    const state = this.channel?.presenceState?.() || {};
    const users = usersFromPresenceState(state);
    if (!isSparsePresenceSnapshot(users, this.userId)) {
      for (const user of users) {
        const key = String(user.presenceKey || user.userId || '');
        const hint = key ? this._peerHints.get(key) : null;
        if (!hint) continue;
        if (shouldReplacePresenceHint(user, hint)) this._peerHints.delete(key);
      }
    }
    return this._applyVisiblePresence(activeLobbyUsers(users), { force });
  }

  _handlePresenceSync() {
    this.resyncPresence({ force: true });
  }

  /**
   * 사용자 입장을 처리한다.
   */
  _handlePresenceJoin(key, newPresences) {
    this._leftKeys.delete(key);
    const presence = newPresences?.[newPresences.length - 1];
    if (presence) {
      const row = { ...presence, userId: key, id: key, presenceKey: key };
      this.onlineUsers.set(key, row);
      this.onUserJoin(row);
      console.info('[dotori-presence] join', key, presence.nickname || '');
    }
    this.resyncPresence({ force: true });
  }

  _reconcileOwnIdentity(users) {
    if (this._reconciling) return;
    const prevSeat = this.seat;
    const prevNick = this.userNickname;
    this.assignJoinIdentity(users);
    if (prevSeat === this.seat && prevNick === this.userNickname) return;
    this._reconciling = true;
    Promise.resolve(this._trackPresence()).finally(() => {
      this._reconciling = false;
    });
  }

  /**
   * 사용자 퇴장을 처리한다.
   */
  _handlePresenceLeave(key, leftPresences) {
    const rows = Array.isArray(leftPresences) && leftPresences.length
      ? leftPresences
      : [{ userId: key, id: key }];
    rows.forEach((presence) => {
      this._leftKeys.add(key);
      if (presence.userId) this._leftKeys.add(presence.userId);
      this.onlineUsers.delete(key);
      this.onlineUsers.delete(presence.userId);
      this.onlineUsers.delete(presence.id);
      this._localSeeds.delete(key);
      this._localSeeds.delete(presence.userId);
      this._peerHints.delete(key);
      this._peerHints.delete(presence.userId);
      this.onUserLeave(presence);
      console.info('[dotori-presence] leave', key, presence.nickname || '');
    });
    this.resyncPresence({ force: true });
  }

  /**
   * 관전 데이터를 처리한다.
   */
  _handleSpectatorUpdate(payload) {
    this.onSpectatorData(payload);
  }

  /**
   * 이벤트 리스너를 추가한다.
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
  }

  /**
   * 이벤트를 발생시킨다.
   */
  emit(event, data) {
    const callbacks = this._listeners.get(event) || [];
    callbacks.forEach(callback => callback(data));
  }
}

// 임시 Mock 클라이언트 (실제 Supabase 없이 테스트용)
export function bindPresenceUnload(manager, target = globalThis, onLeave) {
  if (!manager || !target?.addEventListener) return () => {};
  const leave = (event) => {
    if (event?.type === 'pagehide' && event.persisted) return;
    try { onLeave?.(); } catch { /* ignore */ }
    manager._unloading = true;
    void manager.disconnect();
  };
  target.addEventListener('pagehide', leave);
  target.addEventListener('beforeunload', leave);
  return () => {
    target.removeEventListener('pagehide', leave);
    target.removeEventListener('beforeunload', leave);
  };
}

export class MockSupabaseClient {
  constructor() {
    this.channels = new Map();
    this.removed = [];
  }

  channel(name) {
    if (!this.channels.has(name)) {
      this.channels.set(name, new MockChannel(name));
    }
    return this.channels.get(name);
  }

  removeChannel(channel) {
    this.removed.push(channel?.name || '');
    if ((channel?._subs || 0) > 0) return 'ok';
    const name = channel?.name;
    if (name && this.channels.get(name) === channel) this.channels.delete(name);
    return 'ok';
  }
}

class MockChannel {
  constructor(name) {
    this.name = name;
    this.state = 'closed';
    this.listeners = new Map();
    this._presenceState = new Map();
    this.isSubscribed = false;
    this._subs = 0;
  }

  on(type, filter, callback) {
    const key = `${type}:${filter.event || 'default'}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(callback);
    return this;
  }

  async subscribe(callback) {
    this._subs = (this._subs || 0) + 1;
    this.isSubscribed = true;
    this.state = 'joined';
    setTimeout(() => callback('SUBSCRIBED'), 10);
    return 'SUBSCRIBED';
  }

  async unsubscribe() {
    this._subs = Math.max(0, (this._subs || 1) - 1);
    if (this._subs === 0) {
      this.isSubscribed = false;
      this.state = 'closed';
      this.listeners.clear();
      this._presenceState.clear();
    }
  }

  async track(data) {
    const key = String(data?.presenceKey || data?.userId || '');
    if (!key) return data;
    this._presenceState.set(key, [{ ...data, userId: data.userId || key, presenceKey: key }]);
    this._emitPresence('join', { key, newPresences: this._presenceState.get(key) });
    this._emitPresence('sync', {});
    return data;
  }

  async untrack(userId) {
    const key = String(userId || '');
    const left = key ? (this._presenceState.get(key) || []) : [];
    if (key) this._presenceState.delete(key);
    if (key) this._emitPresence('leave', { key, leftPresences: left });
    this._emitPresence('sync', {});
  }

  async send({ type, event, payload }) {
    setTimeout(() => {
      this._emitBroadcast(event, payload);
    }, 50);
    return 'ok';
  }

  presenceState() {
    const state = {};
    this._presenceState.forEach((presences, userId) => {
      state[userId] = presences;
    });
    return state;
  }

  _emitPresence(event, payload = {}) {
    const key = `presence:${event}`;
    const callbacks = this.listeners.get(key) || [];
    callbacks.forEach((callback) => callback(payload));
  }

  _emitBroadcast(event, payload) {
    const key = `broadcast:${event}`;
    const callbacks = this.listeners.get(key) || [];
    callbacks.forEach(callback => callback({ payload }));
  }
}