/**
 * 동시접속용 Realtime 클라이언트.
 * URL·anon key가 있으면 실 Supabase, 없으면 로컬 Mock.
 */

import { createClient } from '@supabase/supabase-js';
import { LOBBY_CHANNEL, MockSupabaseClient, lobbyChannelConfig } from './RealtimeManager.js';

export const SUPABASE_URL_ENV = 'VITE_SUPABASE_URL';
export const SUPABASE_ANON_ENV = 'VITE_SUPABASE_ANON_KEY';
export { LOBBY_CHANNEL, lobbyChannelConfig };

export function readViteSupabaseEnv() {
  return {
    [SUPABASE_URL_ENV]: import.meta.env.VITE_SUPABASE_URL,
    [SUPABASE_ANON_ENV]: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

export function readSupabaseConfig(env) {
  const source = env === undefined ? readViteSupabaseEnv() : env;
  const url = String(source?.[SUPABASE_URL_ENV] ?? source?.supabaseUrl ?? '').trim();
  const anonKey = String(source?.[SUPABASE_ANON_ENV] ?? source?.supabaseAnonKey ?? '').trim();
  const live = /^https:\/\//i.test(url) && anonKey.length > 20;
  return { url, anonKey, live };
}

export function isMockRealtimeClient(client) {
  const name = client?.constructor?.name || '';
  return !name || name === 'MockSupabaseClient';
}

export function createRealtimeClient(env) {
  const { url, anonKey, live } = readSupabaseConfig(env);
  if (!live) return new MockSupabaseClient();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
}
