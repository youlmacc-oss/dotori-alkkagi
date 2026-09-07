/**
 * 로컬 두 탭이 같은 가상 로비에 붙는다. 실 Supabase 없이 1:1 수락·샷을 검증한다.
 */

import { MockSupabaseClient } from './RealtimeManager.js';

export const DUAL_QUERY = 'dual';
export const DUAL_SEAT_QUERY = 'seat';
export const DUAL_BUS_NAME = 'dotori-alkkagi-dual';
export const DUAL_FRAME_ID = 'dual-guest-frame';
export const DUAL_HINT = '가상 2인 상대가 대기실에 붙습니다. 1:1 방을 열고 초대하세요';

export function isDualSearch(search = '') {
  try {
    const raw = String(search ?? '');
    const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
    return new URLSearchParams(query).get(DUAL_QUERY) === '1';
  } catch {
    return false;
  }
}

export function dualHref(loc = globalThis.location) {
  const origin = loc?.origin || '';
  const pathname = loc?.pathname || '/';
  return `${origin}${pathname}?${DUAL_QUERY}=1`;
}

export function isDualGuestSearch(search = '') {
  if (!isDualSearch(search)) return false;
  try {
    const raw = String(search ?? '');
    const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
    return new URLSearchParams(query).get(DUAL_SEAT_QUERY) === 'guest';
  } catch {
    return false;
  }
}

export function dualGuestHref(loc = globalThis.location) {
  return `${dualHref(loc)}&${DUAL_SEAT_QUERY}=guest`;
}

export function shouldSpawnDualGuestFrame({
  dual = false,
  guestSeat = false,
  peerCount = 0,
} = {}) {
  return dual === true && guestSeat !== true && Number(peerCount) < 1;
}

export function mountDualGuestFrame(doc, href) {
  if (!doc?.body || !href || doc.getElementById(DUAL_FRAME_ID)) return null;
  const frame = doc.createElement('iframe');
  frame.id = DUAL_FRAME_ID;
  frame.title = 'dual-guest';
  frame.src = href;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-24px;top:-24px;';
  doc.body.appendChild(frame);
  return frame;
}

export function openDualMatch(win = globalThis) {
  const href = dualHref(win?.location);
  const child = win?.open?.(href, 'dotori-dual-guest');
  if (!isDualSearch(win?.location?.search)) {
    win?.location?.assign?.(href);
  }
  return { ok: true, href, opened: Boolean(child) };
}

export function createMemoryBus() {
  const listeners = new Set();
  return {
    post(msg) {
      for (const fn of [...listeners]) fn(msg);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      listeners.clear();
    },
  };
}

export function createDualBus(name = DUAL_BUS_NAME) {
  if (typeof BroadcastChannel === 'undefined') return createMemoryBus();
  const channel = new BroadcastChannel(name);
  return {
    post(msg) {
      channel.postMessage(msg);
    },
    subscribe(fn) {
      const handler = (event) => fn(event.data);
      channel.addEventListener('message', handler);
      return () => channel.removeEventListener('message', handler);
    },
    close() {
      channel.close();
    },
  };
}

export class DualMockSupabaseClient extends MockSupabaseClient {
  constructor(bus) {
    super();
    this._bus = bus || createDualBus();
    this._tabId = `dual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  channel(name) {
    if (!this.channels.has(name)) {
      const channel = super.channel(name);
      bindDualChannel(channel, this._bus, this._tabId);
      this.channels.set(name, channel);
    }
    return this.channels.get(name);
  }
}

export function bindDualChannel(channel, bus, tabId) {
  if (!channel || channel._dualBound || !bus) return channel;
  channel._dualBound = true;
  channel._dualTabId = tabId;
  channel._localKeys = new Set();
  const send = channel.send.bind(channel);
  const track = channel.track.bind(channel);
  const untrack = channel.untrack.bind(channel);
  const subscribe = channel.subscribe.bind(channel);

  channel.send = async (packet) => {
    const result = await send(packet);
    bus.post({
      type: 'broadcast',
      channel: channel.name,
      event: packet?.event,
      payload: packet?.payload,
      tabId,
    });
    return result;
  };

  channel.track = async (data) => {
    const key = String(data?.presenceKey || data?.userId || '');
    if (key) channel._localKeys.add(key);
    const result = await track(data);
    bus.post({ type: 'presence-track', channel: channel.name, data, tabId });
    return result;
  };

  channel.untrack = async (userId) => {
    const key = String(userId || '');
    if (key) channel._localKeys.delete(key);
    const result = await untrack(userId);
    bus.post({ type: 'presence-leave', channel: channel.name, userId: key, tabId });
    return result;
  };

  channel.subscribe = async (callback) => {
    const result = await subscribe(callback);
    bus.post({ type: 'hello', channel: channel.name, tabId });
    return result;
  };

  channel._dualOff = bus.subscribe((msg) => acceptDualMessage(channel, msg, tabId, bus));
  return channel;
}

export function acceptDualMessage(channel, msg, tabId, bus) {
  if (!channel || !msg || msg.tabId === tabId) return false;
  if (msg.channel && msg.channel !== channel.name) return false;
  if (msg.type === 'broadcast') {
    channel._emitBroadcast(msg.event, msg.payload);
    return true;
  }
  if (msg.type === 'presence-track' && msg.data) {
    const key = String(msg.data.presenceKey || msg.data.userId || '');
    if (!key) return false;
    const next = [{ ...msg.data, userId: msg.data.userId || key, presenceKey: key }];
    const prev = channel._presenceState.get(key);
    if (prev?.length) channel._emitPresence('leave', { key, leftPresences: prev });
    channel._presenceState.set(key, next);
    channel._emitPresence('join', { key, newPresences: next });
    channel._emitPresence('sync', {});
    return true;
  }
  if (msg.type === 'presence-leave') {
    const key = String(msg.userId || '');
    const left = key ? (channel._presenceState.get(key) || []) : [];
    if (key) channel._presenceState.delete(key);
    if (key) channel._emitPresence('leave', { key, leftPresences: left });
    channel._emitPresence('sync', {});
    return true;
  }
  if (msg.type === 'hello') {
    for (const key of channel._localKeys || []) {
      const rows = channel._presenceState.get(key);
      if (!rows?.[0]) continue;
      bus?.post?.({
        type: 'presence-track',
        channel: channel.name,
        data: rows[0],
        tabId,
      });
    }
    return true;
  }
  return false;
}
