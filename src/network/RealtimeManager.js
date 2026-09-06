/**
 * Supabase Realtime 연동 관리자
 * 관전 데이터 브로드캐스트와 Presence 관리를 담당한다.
 */

import { LOBBY_CAP, PRESENCE_STATUS, canAdmitUser, mergePresenceList, presenceViewKey, usersFromPresenceState } from './LobbyRooms.js';
import { PVP_INVITE_EVENT } from './PvpInvite.js';
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

export const LOBBY_CHANNEL = 'dotori-lobby';

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

  _visibleUsers(users) {
    return keepConnectedUsers(activeLobbyUsers(this._mergeLocalSeeds(users)), this.keepNickname);
  }

  _shouldSelfEvict() {
    return Boolean(this.keepNickname)
      && !isKeptConnectedNickname(this.userNickname, this.keepNickname);
  }

  /**
   * Realtime 연결을 시작한다.
   */
  async connect() {
    if (!this.supabaseClient || this.isConnected) return this.isConnected ? 'SUBSCRIBED' : undefined;

    try {
      this._lobbyFull = false;
      this._lobbySwept = false;
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
        .on('broadcast', { event: 'spectator_update' }, ({ payload }) => {
          this._handleSpectatorUpdate(payload);
        })
        .on('broadcast', { event: LOBBY_SWEEP_EVENT }, ({ payload }) => {
          this._handleLobbySweep(payload);
        })
        .on('broadcast', { event: PVP_INVITE_EVENT }, ({ payload }) => {
          this.onPvpInvite?.(payload);
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
        if (this.channel) {
          await this.channel.unsubscribe();
          this.channel = null;
        }
        this.isConnected = false;
        this.emit('lobbyFull');
        this.onLobbyFull();
        return 'FULL';
      }

      return 'SUBSCRIBED';
    } catch (error) {
      console.error('Realtime 연결 실패:', error);
      try {
        await this.channel?.unsubscribe();
      } catch {
        /* ignore */
      }
      this.channel = null;
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Realtime 연결을 종료한다.
   */
  async disconnect() {
    this._stopHeartbeat();
    this._clearStaleTimer();
    if (this.channel) {
      try { await this.channel.untrack?.(this.userId); } catch { /* ignore */ }
      await this.channel.unsubscribe();
      this.channel = null;
    }
    this.isConnected = false;
    this.onlineUsers.clear();
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

  async _broadcastLobbySweep() {
    if (!this.keepNickname || this._shouldSelfEvict() || !this.channel || !this.isConnected) return false;
    try {
      await this.channel.send({
        type: 'broadcast',
        event: LOBBY_SWEEP_EVENT,
        payload: { keep: this.keepNickname },
      });
      return true;
    } catch {
      return false;
    }
  }

  _applyVisiblePresence(raw) {
    const users = mergePresenceList(
      Array.from(this.onlineUsers.values()),
      this._visibleUsers(raw),
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
    if (!same) this.onPresenceUpdate(users);
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
    try {
      await this.channel.send({
        type: 'broadcast',
        event: PVP_INVITE_EVENT,
        payload,
      });
      return true;
    } catch {
      return false;
    }
  }

  async broadcastSpectatorData(gameState) {
    if (!this.isConnected || !this.channel || !gameState) return false;

    const spectatorUpdate = {
      matchId: gameState.matchId || `match_${Date.now()}`,
      timestamp: Date.now(),
      phase: gameState.phase,
      currentTurn: gameState.currentTurn,
      turnRemainingMs: gameState.turnRemainingMs,
      stones: gameState.stones?.map(stone => ({
        id: stone.id,
        position: stone.body ? { x: stone.body.position.x, y: stone.body.position.y } : stone.position,
        velocity: stone.body ? stone.body.velocity : { x: 0, y: 0 },
        fallen: stone.fallen,
        color: stone.color
      })) || [],
      winner: gameState.winner
    };

    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'spectator_update',
        payload: spectatorUpdate
      });
      return true;
    } catch (error) {
      console.error('관전 데이터 브로드캐스트 실패:', error);
      return false;
    }
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

    const presenceData = {
      userId: this.userId,
      nickname: this.userNickname,
      character: this.userCharacter,
      seat: this.seat,
      status: this.presence.status ?? PRESENCE_STATUS.LOBBY,
      mode: this.presence.mode ?? null,
      roomId: this.presence.roomId ?? null,
      acorns: parseAcorn(this.presence.acorns),
      rearranging: Boolean(this.presence.rearranging),
      pvpOpenedAt: Number(this.presence.pvpOpenedAt) > 0 ? this.presence.pvpOpenedAt : null,
      joinedAt: this.presence.joinedAt ?? Date.now(),
      lastSeen: Date.now(),
    };

    await this.channel.track(presenceData);
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
  _handlePresenceSync() {
    const users = usersFromPresenceState(this.channel.presenceState());
    this.onlineUsers = new Map(users.map((user) => [user.userId, user]));
    this._applyVisiblePresence(activeLobbyUsers(users));
  }

  /**
   * 사용자 입장을 처리한다.
   */
  _handlePresenceJoin(key, newPresences) {
    newPresences.forEach((presence, index) => {
      const slot = (newPresences.length > 1 ? `${key}#${index}` : key);
      const row = { ...presence, userId: slot, id: slot, presenceKey: key };
      this.onlineUsers.set(slot, row);
      this.onUserJoin(row);
    });

    this._applyVisiblePresence(activeLobbyUsers(Array.from(this.onlineUsers.values())));
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
    leftPresences.forEach(presence => {
      this.onlineUsers.delete(key);
      this.onlineUsers.delete(presence.userId);
      this.onlineUsers.delete(presence.id);
      this.onUserLeave(presence);
    });

    const users = this._visibleUsers(Array.from(this.onlineUsers.values()));
    this.onlineUsers = new Map(users.map((u) => [u.userId, u]));
    this.onPresenceUpdate(users);
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
export class MockSupabaseClient {
  constructor() {
    this.channels = new Map();
  }

  channel(name) {
    if (!this.channels.has(name)) {
      this.channels.set(name, new MockChannel(name));
    }
    return this.channels.get(name);
  }
}

class MockChannel {
  constructor(name) {
    this.name = name;
    this.listeners = new Map();
    this._presenceState = new Map();
    this.isSubscribed = false;
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
    setTimeout(() => callback('SUBSCRIBED'), 10);
    return 'SUBSCRIBED';
  }

  async unsubscribe() {
    this._subs = Math.max(0, (this._subs || 1) - 1);
    if (this._subs === 0) {
      this.isSubscribed = false;
      this.listeners.clear();
      this._presenceState.clear();
    }
  }

  async track(data) {
    this._presenceState.set(data.userId, [data]);
    this._emitPresence('sync');
    return data;
  }

  async untrack(userId) {
    this._presenceState.delete(userId);
    this._emitPresence('sync');
  }

  async send({ type, event, payload }) {
    // Mock 브로드캐스트 - 실제로는 다른 클라이언트에게 전달됨
    setTimeout(() => {
      this._emitBroadcast(event, payload);
    }, 50);
  }

  presenceState() {
    const state = {};
    this._presenceState.forEach((presences, userId) => {
      state[userId] = presences;
    });
    return state;
  }

  _emitPresence(event) {
    const key = `presence:${event}`;
    const callbacks = this.listeners.get(key) || [];
    callbacks.forEach(callback => callback());
  }

  _emitBroadcast(event, payload) {
    const key = `broadcast:${event}`;
    const callbacks = this.listeners.get(key) || [];
    callbacks.forEach(callback => callback({ payload }));
  }
}