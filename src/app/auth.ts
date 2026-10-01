import { useEffect, useState } from 'react';
import { type AuthService, type AuthUser } from '../data';

export type AuthState =
  { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; user: AuthUser };

const fromUser = (user: AuthUser | null): AuthState =>
  user ? { status: 'signed_in', user } : { status: 'signed_out' };

/** Who is signed in, kept current as sessions start, refresh and expire. */
export function useAuthState(service: AuthService): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    const unsubscribe = service.onChange((user) => {
      if (active) setState(fromUser(user));
    });
    // Covers a service that does not report the starting state by itself.
    service
      .currentUser()
      .then((user) => {
        if (active)
          setState((current) => (current.status === 'loading' ? fromUser(user) : current));
      })
      .catch(() => {
        if (active)
          setState((current) => (current.status === 'loading' ? fromUser(null) : current));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);
  return state;
}
