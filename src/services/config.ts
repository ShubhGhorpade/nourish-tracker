export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  backendFunctionUrl: string;
}

export function runtimeConfig(): RuntimeConfig {
  const c = window.NOURISH_CONFIG ?? {};
  return {
    supabaseUrl: (c.supabaseUrl ?? '').replace(/\/$/, ''),
    supabaseAnonKey: c.supabaseAnonKey ?? '',
    backendFunctionUrl: c.backendFunctionUrl ?? ''
  };
}

export function backendConfigured(): boolean {
  const c = runtimeConfig();
  return Boolean(c.backendFunctionUrl);
}
