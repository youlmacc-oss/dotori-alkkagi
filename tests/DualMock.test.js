import { describe, expect, it } from 'vitest';
import {
  DUAL_FRAME_ID,
  DUAL_HINT,
  DualMockSupabaseClient,
  createMemoryBus,
  dualGuestHref,
  dualHref,
  isDualGuestSearch,
  isDualSearch,
  mountDualGuestFrame,
  openDualMatch,
  shouldSpawnDualGuestFrame,
} from '../src/network/DualMock.js';
import { isLiveRealtime } from '../src/network/LobbyClinic.js';
import { isMockRealtimeClient } from '../src/network/RealtimeClient.js';
import { PVP_INVITE_EVENT } from '../src/network/PvpInvite.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('가상 2인 접속', () => {
  it('?dual=1 만 가상 대전으로 보고 Dual은 Mock으로 친다', () => {
    expect(isDualSearch('?dual=1')).toBe(true);
    expect(isDualSearch('/?dual=1')).toBe(true);
    expect(isDualSearch('?room=room_1')).toBe(false);
    expect(dualHref({ origin: 'http://localhost:5173', pathname: '/' })).toBe('http://localhost:5173/?dual=1');
    const assigned = [];
    const opened = openDualMatch({
      location: { origin: 'http://localhost:5173', pathname: '/', search: '', assign: (href) => assigned.push(href) },
      open: () => ({ name: 'child' }),
    });
    expect(opened.opened).toBe(true);
    expect(assigned[0]).toContain('dual=1');
    const client = new DualMockSupabaseClient(createMemoryBus());
    expect(isMockRealtimeClient(client)).toBe(true);
    expect(isLiveRealtime(client)).toBe(false);
    expect(DUAL_HINT).toContain('1:1');
    expect(isDualGuestSearch('?dual=1&seat=guest')).toBe(true);
    expect(isDualGuestSearch('?dual=1')).toBe(false);
    expect(shouldSpawnDualGuestFrame({ dual: true, guestSeat: false, peerCount: 0 })).toBe(true);
    expect(shouldSpawnDualGuestFrame({ dual: true, guestSeat: false, peerCount: 1 })).toBe(false);
    expect(shouldSpawnDualGuestFrame({ dual: true, guestSeat: true, peerCount: 0 })).toBe(false);
    expect(dualGuestHref({ origin: 'http://localhost:5176', pathname: '/' })).toBe('http://localhost:5176/?dual=1&seat=guest');
    const doc = {
      body: { appendChild(node) { this.child = node; } },
      getElementById: () => null,
      createElement: () => ({ setAttribute() {}, style: { cssText: '' } }),
    };
    expect(mountDualGuestFrame(doc, 'http://localhost:5176/?dual=1&seat=guest')?.id).toBe(DUAL_FRAME_ID);
  });

  it('같은 버스의 두 클라이언트가 Presence와 초대를 나눈다', async () => {
    const bus = createMemoryBus();
    const host = new DualMockSupabaseClient(bus);
    const guest = new DualMockSupabaseClient(bus);
    const hostCh = host.channel('dotori-lobby');
    const guestCh = guest.channel('dotori-lobby');
    const invites = [];
    guestCh.on('broadcast', { event: PVP_INVITE_EVENT }, ({ payload }) => invites.push(payload));
    await hostCh.subscribe(() => {});
    await guestCh.subscribe(() => {});
    await wait(20);
    await hostCh.track({ userId: 'host', nickname: '호치', presenceKey: 'host', status: 'playing', mode: 'pvp' });
    await wait(20);
    expect(guestCh.presenceState().host?.[0]?.nickname).toBe('호치');
    await hostCh.send({
      type: 'broadcast',
      event: PVP_INVITE_EVENT,
      payload: { roomId: 'room_host', hostId: 'host', targetId: 'guest' },
    });
    await wait(80);
    expect(invites.at(-1)?.targetId).toBe('guest');
    bus.close();
  });
});
