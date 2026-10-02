import { createClient } from '@supabase/supabase-js';
import { type AuthService } from '../auth';
import { browserStorage, resilientStorage } from '../local/storage';
import { type ServerGateway } from './gateway';
import { createSupabaseAuthService } from './auth-service';
import { type ServerConfig } from './config';
import { createSupabaseGateway } from './supabase-gateway';

export interface ServerBackend {
  auth: AuthService;
  gateway: ServerGateway;
  /** False once the browser has refused to keep the sign-in: the person must sign in again next time. */
  storageIsPersistent: () => boolean;
}

/** Connects to the Supabase project. One per page load. */
export function createServerBackend(config: ServerConfig): ServerBackend {
  // The sign-in is kept in the browser's storage; where that is blocked it is kept in memory instead (and the
  // app says so), rather than failing with "quota exceeded".
  const { storage: authStorage, persistent: usable } = browserStorage();
  const auth = resilientStorage(authStorage);
  const client = createClient(config.url, config.anonKey, {
    // Retrying is decided in one place, the app's query settings (src/App.tsx): reads are retried quickly, and
    // saves only when repeating them is safe. A second, hidden retry layer would only make waits longer.
    db: { retry: false },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Sign-in uses a typed code, never a link, so nothing is read from the address bar.
      detectSessionInUrl: false,
      storageKey: 'diet-plan.auth',
      storage: auth.storage,
    },
  });
  return {
    auth: createSupabaseAuthService(client),
    gateway: createSupabaseGateway(client),
    storageIsPersistent: () => usable && auth.persistent(),
  };
}
