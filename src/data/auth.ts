/** Signing in with an e-mailed one-time code (docs/PRODUCT_SPEC.md B1: no passwords). */

export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthErrorCode =
  'invalid_email' | 'invalid_code' | 'rate_limited' | 'network' | 'unknown';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

export interface AuthService {
  /** The user signed in on this device, if any (no network needed). */
  currentUser(): Promise<AuthUser | null>;
  /** Called whenever the user signs in or out (also when the session expires). Returns an unsubscribe. */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  /** E-mails a one-time code. Creates the account on first use. */
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<AuthUser>;
  /** Ends the session on this device only; other devices stay signed in. */
  signOut(): Promise<void>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The server decides the code length (6 by default, up to 10; this project uses 8), so accept any of them. */
const CODE_PATTERN = /^\d{6,10}$/;

/** Trimmed, lower-cased address, or null if it does not look like one. */
export function normalizeEmail(text: string): string | null {
  const email = text.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

/** The digits of the code, or null. Spaces are ignored: codes are often pasted as "1234 5678". */
export function normalizeCode(text: string): string | null {
  const code = text.replace(/\s+/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}
