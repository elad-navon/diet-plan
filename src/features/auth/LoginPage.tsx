import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthError, normalizeCode, normalizeEmail, type AuthService } from '../../data';
import { he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';

/** How long before another code may be requested (the server also limits this). */
const RESEND_SECONDS = 60;

type Step = 'email' | 'code';

/**
 * Sign-in with an e-mailed six-digit code. No password to remember; the first sign-in creates the account.
 * Shown instead of the app until someone is signed in.
 */
export function LoginPage({ auth }: { auth: AuthService }) {
  const [step, setStep] = useState<Step>('email');
  const [emailText, setEmailText] = useState('');
  const [email, setEmail] = useState('');
  const [codeText, setCodeText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const codeField = useRef<HTMLDivElement>(null);

  // Count down until a new code may be requested.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Move focus to the code field when the second step opens, so typing can start at once.
  useEffect(() => {
    if (step === 'code') codeField.current?.querySelector('input')?.focus();
    else heading.current?.focus();
  }, [step]);

  const messageFor = (error: unknown): string =>
    he.auth.errors[error instanceof AuthError ? error.code : 'unknown'];

  async function sendCode(address: string): Promise<boolean> {
    setBusy(true);
    setProblem(null);
    try {
      await auth.sendCode(address);
      setCooldown(RESEND_SECONDS);
      return true;
    } catch (error) {
      setProblem(messageFor(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const address = normalizeEmail(emailText);
    if (!address) {
      setFieldError(he.auth.emailInvalid);
      return;
    }
    setFieldError(null);
    if (await sendCode(address)) {
      setEmail(address);
      setCodeText('');
      setStep('code');
    }
  }

  async function submitCode(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const code = normalizeCode(codeText);
    if (!code) {
      setFieldError(he.auth.codeInvalid);
      return;
    }
    setFieldError(null);
    setBusy(true);
    setProblem(null);
    try {
      await auth.verifyCode(email, code);
      // The app opens by itself as soon as the session starts.
    } catch (error) {
      setProblem(messageFor(error));
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">
        {he.appName}
      </h1>
      <h2 className="text-xl font-bold">{he.auth.title}</h2>

      {step === 'email' ? (
        <form onSubmit={(event) => void submitEmail(event)} className="space-y-4" noValidate>
          <p className="text-base text-muted">{he.auth.intro}</p>
          <TextField
            label={he.auth.email}
            value={emailText}
            onChange={setEmailText}
            error={fieldError ?? undefined}
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
          />
          {problem && (
            <p role="alert" className="text-base font-medium">
              ⚠ {problem}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? he.auth.sending : he.auth.sendCode}
          </Button>
        </form>
      ) : (
        <form onSubmit={(event) => void submitCode(event)} className="space-y-4" noValidate>
          <p role="status" className="text-base">
            {he.auth.codeSent(email)}
          </p>
          <div ref={codeField}>
            <TextField
              label={he.auth.code}
              value={codeText}
              onChange={setCodeText}
              error={fieldError ?? undefined}
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={12}
              required
            />
          </div>
          {problem && (
            <p role="alert" className="text-base font-medium">
              ⚠ {problem}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? he.auth.verifying : he.auth.verify}
            </Button>
            <Button disabled={busy || cooldown > 0} onClick={() => void sendCode(email)}>
              {he.auth.resend}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setStep('email');
                setProblem(null);
                setFieldError(null);
              }}
            >
              {he.auth.changeEmail}
            </Button>
          </div>
          {cooldown > 0 && <p className="text-sm text-muted">{he.auth.resendIn(cooldown)}</p>}
        </form>
      )}
    </main>
  );
}
