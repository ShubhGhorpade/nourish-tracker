// Minimal declarations used only by the local TypeScript static check.
// Supabase Edge Functions provide these globals at runtime.
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
