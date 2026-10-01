/**
 * Where the server is (public values: the anon key is meant to be shipped, the data is protected by row
 * level security). When either is missing the app runs on-device only, which is also how tests and
 * `npm run dev` work without any account.
 */
export interface ServerConfig {
  url: string;
  anonKey: string;
}

export function readServerConfig(
  env: Record<string, string | boolean | undefined>,
): ServerConfig | null {
  const url = typeof env['VITE_SUPABASE_URL'] === 'string' ? env['VITE_SUPABASE_URL'].trim() : '';
  const anonKey =
    typeof env['VITE_SUPABASE_ANON_KEY'] === 'string' ? env['VITE_SUPABASE_ANON_KEY'].trim() : '';
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
