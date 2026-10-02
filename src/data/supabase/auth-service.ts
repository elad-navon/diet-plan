import { type AuthError as SupabaseAuthError, type SupabaseClient } from '@supabase/supabase-js';
import { AuthError, type AuthErrorCode, type AuthService, type AuthUser } from '../auth';

/** "AuthApiError 403 otp_expired: Token has expired" - what support needs to see when something unexpected fails. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const extra = error as Error & { status?: number; code?: string };
  return [error.name, extra.status, extra.code].filter(Boolean).join(' ') + `: ${error.message}`;
}

/** Anything thrown (not returned) by the library - storage blocked, a lock that cannot be taken - comes out as an AuthError. */
async function guard<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof AuthError) throw error;
    console.error('sign-in failed', error);
    throw new AuthError('unknown', describe(error));
  }
}

function toAuthError(error: SupabaseAuthError, whenVerifying: boolean): AuthError {
  const code = error.code ?? '';
  let mapped: AuthErrorCode = 'unknown';
  if (error.status === 429 || /rate_limit/.test(code)) {
    mapped = 'rate_limited';
  } else if (
    /signup_disabled|otp_disabled/.test(code) ||
    /signups? not allowed/i.test(error.message)
  ) {
    // New accounts are switched off in the project: only people who were added can sign in.
    mapped = 'signups_closed';
  } else if (error.status === 0 || /fetch/i.test(error.name + error.message)) {
    mapped = 'network';
  } else if (
    whenVerifying &&
    (code === 'otp_expired' || error.status === 400 || error.status === 403)
  ) {
    mapped = 'invalid_code';
  } else if (/email_address_invalid|validation_failed/.test(code)) {
    mapped = whenVerifying ? 'invalid_code' : 'invalid_email';
  }
  return new AuthError(mapped, describe(error));
}

const toUser = (user: { id: string; email?: string | undefined }): AuthUser => ({
  id: user.id,
  email: user.email ?? null,
});

export function createSupabaseAuthService(client: SupabaseClient): AuthService {
  return {
    async currentUser() {
      const { data } = await client.auth.getSession();
      return data.session ? toUser(data.session.user) : null;
    },

    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Kept synchronous on purpose: awaiting Supabase calls inside this callback can deadlock.
        listener(session ? toUser(session.user) : null);
      });
      return () => data.subscription.unsubscribe();
    },

    sendCode: (email) =>
      guard(async () => {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) throw toAuthError(error, false);
      }),

    verifyCode: (email, code) =>
      guard(async () => {
        const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
        if (error) throw toAuthError(error, true);
        if (!data.user) throw new AuthError('unknown', 'no user in the answer');
        return toUser(data.user);
      }),

    async signOut() {
      // "local": end this device's session only (a global sign-out would also end the phone's).
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw toAuthError(error, false);
    },
  };
}
