import { ensureBackendSession } from './auth.js';
import { runtimeConfig } from './config.js';

export async function backendCall<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const cfg = runtimeConfig();
  if (!cfg.backendFunctionUrl) throw new Error('The secure backend is not configured. This feature requires the Supabase Edge Function.');
  const session = await ensureBackendSession();
  if (!session?.accessToken) throw new Error('A secure session could not be created. Ordinary local logging still works.');
  const headers: Record<string,string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` };
  if (cfg.supabaseAnonKey) headers.apikey = cfg.supabaseAnonKey;
  const response = await fetch(cfg.backendFunctionUrl, { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) });
  const json = await response.json().catch(() => ({ error: 'Backend returned an unreadable response.' }));
  if (!response.ok) throw new Error(json.error || `Backend request failed (${response.status}).`);
  return json as T;
}
