import { describe, expect, it } from 'vitest';
import {
  LOBBY_CHANNEL,
  createRealtimeClient,
  isLoopTestSearch,
  isMockRealtimeClient,
  lobbyChannelConfig,
  readSupabaseConfig,
  readViteSupabaseEnv,
} from '../src/network/RealtimeClient.js';
import { MockSupabaseClient } from '../src/network/RealtimeManager.js';

describe('동시접속 Realtime 클라이언트', () => {
  it('환경값이 없으면 Mock이고 live가 아니다', () => {
    expect(readSupabaseConfig({}).live).toBe(false);
    const client = createRealtimeClient({});
    expect(client).toBeInstanceOf(MockSupabaseClient);
    expect(isMockRealtimeClient(client)).toBe(true);
  });

  it('URL과 anon key가 있으면 실접속 설정으로 본다', () => {
    const cfg = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://abcd.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo-key',
    });
    expect(cfg.live).toBe(true);
    expect(cfg.url).toContain('supabase.co');
    expect(LOBBY_CHANNEL).toBe('dotori-lobby');
    expect(lobbyChannelConfig('user_1').config.presence.key).toBe('user_1');
  });

  it('loop=1이면 화면 검증이 실 로비에 붙지 않는다', () => {
    expect(isLoopTestSearch('?loop=1')).toBe(true);
    expect(isLoopTestSearch('?room=room_1&loop=1')).toBe(true);
    expect(isLoopTestSearch('?room=room_1')).toBe(false);
  });

  it('Vite 환경키는 import.meta.env에서 직접 꺼낸다', () => {
    const env = readViteSupabaseEnv();
    expect(env).toHaveProperty('VITE_SUPABASE_URL');
    expect(env).toHaveProperty('VITE_SUPABASE_ANON_KEY');
  });
});
