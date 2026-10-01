import { describe, expect, it } from 'vitest';
import { AuthError, normalizeCode, normalizeEmail } from '../auth';
import { readServerConfig } from './config';

describe('server configuration', () => {
  it('is on only when both the address and the public key are set', () => {
    expect(
      readServerConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }),
    ).toEqual({ url: 'https://x.supabase.co', anonKey: 'k' });
    expect(readServerConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(
      readServerConfig({
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_ANON_KEY: '  ',
      }),
    ).toBeNull();
    expect(readServerConfig({})).toBeNull();
  });

  it('ignores stray whitespace', () => {
    expect(
      readServerConfig({
        VITE_SUPABASE_URL: ' https://x.supabase.co\n',
        VITE_SUPABASE_ANON_KEY: ' k ',
      }),
    ).toEqual({ url: 'https://x.supabase.co', anonKey: 'k' });
  });
});

describe('sign-in input', () => {
  it('accepts a normal e-mail address and tidies it', () => {
    expect(normalizeEmail('  Dana@Example.COM ')).toBe('dana@example.com');
  });

  it.each([
    '',
    'dana',
    'dana@',
    '@example.com',
    'da na@example.com',
    'dana@example',
    `${'a'.repeat(250)}@x.co`,
  ])('rejects "%s"', (text) => {
    expect(normalizeEmail(text)).toBeNull();
  });

  it('accepts six digits, also pasted with spaces', () => {
    expect(normalizeCode('123456')).toBe('123456');
    expect(normalizeCode(' 123 456 ')).toBe('123456');
  });

  it.each(['', '12345', '1234567', '12a456', '12-456'])('rejects the code "%s"', (text) => {
    expect(normalizeCode(text)).toBeNull();
  });

  it('AuthError carries a code', () => {
    expect(new AuthError('rate_limited').code).toBe('rate_limited');
  });
});
