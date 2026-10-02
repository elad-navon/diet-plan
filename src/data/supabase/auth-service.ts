import { type AuthError as SupabaseAuthError, type SupabaseClient } from '@supabase/supabase-js';
import { AuthError, type AuthErrorCode, type AuthService, type AuthUser } from '../auth';

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
  return new AuthError(mapped, error.message);
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

    async sendCode(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw toAuthError(error, false);
    },

    async verifyCode(email, code) {
      const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw toAuthError(error, true);
      if (!data.user) throw new AuthError('unknown', 'no user in the answer');
      return toUser(data.user);
    },

    async signOut() {
      // "local": end this device's session only (a global sign-out would also end the phone's).
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw toAuthError(error, false);
    },
  };
}
