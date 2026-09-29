import type { AppData } from '../types.js';
import { ensureSession } from './auth.js';
import { runtimeConfig } from './config.js';

async function sessionHeaders():Promise<{headers:Record<string,string>;userId:string;supabaseUrl:string}>{
  const cfg=runtimeConfig();const session=await ensureSession();
  if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!session?.accessToken||!session.userId)throw new Error('Supabase sync is not configured or you are not signed in.');
  return {headers:{apikey:cfg.supabaseAnonKey,Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'},userId:session.userId,supabaseUrl:cfg.supabaseUrl};
}

export async function pushState(data:AppData):Promise<void>{
  const {headers,userId,supabaseUrl}=await sessionHeaders();
  const response=await fetch(`${supabaseUrl}/rest/v1/user_state?on_conflict=user_id`,{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:userId,payload:data,updated_at:new Date().toISOString()})});
  if(!response.ok){const text=await response.text();throw new Error(`Cloud sync failed (${response.status}): ${text.slice(0,160)}`);}
}

export async function pullState():Promise<AppData|null>{
  const {headers,userId,supabaseUrl}=await sessionHeaders();
  const response=await fetch(`${supabaseUrl}/rest/v1/user_state?user_id=eq.${encodeURIComponent(userId)}&select=payload,updated_at&limit=1`,{headers});
  if(!response.ok)throw new Error(`Cloud pull failed (${response.status}).`);
  const rows=await response.json();return rows?.[0]?.payload??null;
}
