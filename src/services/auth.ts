import { runtimeConfig } from './config.js';

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  userId?: string;
  isAnonymous?: boolean;
}

const SESSION_KEY = 'nourish-supabase-session-v1';

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as AuthSession : null;
  } catch { return null; }
}

function saveSession(session: AuthSession): AuthSession {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession(): void { localStorage.removeItem(SESSION_KEY); }

async function authRequest(path: string, body: unknown): Promise<any> {
  const cfg = runtimeConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Supabase authentication is not configured. Local-only mode remains available.');
  const response = await fetch(`${cfg.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(json.error_code ?? json.code ?? '');
    if (code === 'anonymous_provider_disabled') {
      throw new Error('Private device access is not enabled yet. In Supabase, turn on Authentication → Providers → Anonymous sign-ins, then try again.');
    }
    throw new Error(json.msg || json.error_description || json.message || `Authentication failed (${response.status}).`);
  }
  return json;
}

function sessionFromResponse(result: any, fallback?: AuthSession): AuthSession {
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token ?? fallback?.refreshToken,
    expiresAt: result.expires_at ?? (result.expires_in ? Math.floor(Date.now()/1000)+Number(result.expires_in) : fallback?.expiresAt),
    email: result.user?.email || fallback?.email,
    userId: result.user?.id ?? fallback?.userId,
    isAnonymous: Boolean(result.user?.is_anonymous ?? fallback?.isAnonymous)
  };
}

/** Returns a usable existing session, refreshing it shortly before expiry when possible. */
export async function ensureSession(): Promise<AuthSession | null> {
  const current = getSession();
  if (!current) return null;
  const now = Math.floor(Date.now()/1000);
  if (!current.expiresAt || current.expiresAt > now + 60) return current;
  if (!current.refreshToken) { clearSession(); return null; }
  try {
    const result = await authRequest('token?grant_type=refresh_token', { refresh_token: current.refreshToken });
    if (!result.access_token) throw new Error('Session refresh did not return an access token.');
    return saveSession(sessionFromResponse(result,current));
  } catch (error) {
    clearSession();
    throw error;
  }
}

/**
 * Creates a private anonymous Supabase session. This lets the personal app call the protected
 * Edge Function without making the user create an account just to use USDA/Gemini.
 */
export async function signInAnonymously(): Promise<AuthSession> {
  const result = await authRequest('signup', {
    data: { app: 'nourish', purpose: 'private-device-session' },
    gotrue_meta_security: {}
  });
  if (!result.access_token) throw new Error('Private device sign-in did not return a session.');
  return saveSession(sessionFromResponse(result));
}

/** Returns an authenticated session for protected backend calls, creating a private device session when needed. */
export async function ensureBackendSession(): Promise<AuthSession> {
  const existing = await ensureSession();
  if (existing?.accessToken) return existing;
  return signInAnonymously();
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const result = await authRequest('token?grant_type=password', { email, password });
  return saveSession(sessionFromResponse(result));
}

export async function signUp(email: string, password: string): Promise<{ session: AuthSession | null; message: string }> {
  const result = await authRequest('signup', { email, password });
  if (!result.access_token) return { session: null, message: 'Account created. Check your email if confirmation is enabled.' };
  const session = saveSession(sessionFromResponse(result));
  return { session, message: 'Signed in.' };
}
