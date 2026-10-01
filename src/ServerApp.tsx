import { useEffect, useMemo, useState } from 'react';
import { App } from './App';
import { useAuthState } from './app/auth';
import { type Services } from './app/services';
import { systemClock } from './core/time';
import { createSupabaseRepositories, toDataError, type ServerConfig } from './data';
import type { ServerBackend } from './data/supabase/client';
import { LoginPage } from './features/auth/LoginPage';
import { he } from './i18n/he';

type Backend = { status: 'loading' } | { status: 'ready'; backend: ServerBackend };

/**
 * The app when data lives on the server: connects to Supabase (loaded on demand, so the on-device build
 * never pays for it), shows the sign-in screen until someone is signed in, then the app itself.
 */
export function ServerApp({ config }: { config: ServerConfig }) {
  const [connection, setConnection] = useState<Backend>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    void import('./data/supabase/client').then(({ createServerBackend }) => {
      if (active) setConnection({ status: 'ready', backend: createServerBackend(config) });
    });
    return () => {
      active = false;
    };
  }, [config]);

  if (connection.status === 'loading') return <Splash />;
  return <SignedInOrLogin backend={connection.backend} />;
}

function Splash() {
  return (
    <p role="status" className="p-6 text-muted">
      {he.loading}
    </p>
  );
}

function SignedInOrLogin({ backend }: { backend: ServerBackend }) {
  const state = useAuthState(backend.auth);
  const userId = state.status === 'signed_in' ? state.user.id : null;
  const email = state.status === 'signed_in' ? state.user.email : null;

  // One set of services per signed-in user. Keyed below, so signing out (or in as someone else) starts
  // the app over with an empty cache: nothing of the previous user can show up.
  const services = useMemo<Services | null>(
    () =>
      userId === null
        ? null
        : {
            repos: createSupabaseRepositories({ gateway: backend.gateway, clock: systemClock }),
            clock: systemClock,
            persistent: true,
            account: {
              email,
              signOut: () => backend.auth.signOut(),
              deleteAccount: async () => {
                try {
                  await backend.gateway.rpc('delete_my_account');
                } catch (error) {
                  throw toDataError(error);
                }
                // The account is gone; end the session on this device (the server may already refuse it).
                await backend.auth.signOut().catch(() => undefined);
              },
            },
          },
    [backend, userId, email],
  );

  if (state.status === 'loading') return <Splash />;
  if (!services || userId === null) return <LoginPage auth={backend.auth} />;
  return <App key={userId} services={services} synced />;
}
