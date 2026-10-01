import { createClient } from '@supabase/supabase-js';
import { type AuthService } from '../auth';
import { type ServerGateway } from './gateway';
import { createSupabaseAuthService } from './auth-service';
import { type ServerConfig } from './config';
import { createSupabaseGateway } from './supabase-gateway';

export interface ServerBackend {
  auth: AuthService;
  gateway: ServerGateway;
}

/** Connects to the Supabase project. One per page load. */
export function createServerBackend(config: ServerConfig): ServerBackend {
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
    },
  });
  return { auth: createSupabaseAuthService(client), gateway: createSupabaseGateway(client) };
}
