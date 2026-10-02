import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { computePlan, type PlanInputs } from '../src/core/nutrition';
import { DEFAULT_SCHEDULE } from '../src/core/schedule';
import { he } from '../src/i18n/he';
import { TODAY } from './helpers';

/**
 * Sign-in and server-backed data, against a build of the app that has a (fake) server address. Every call to
 * the server is answered here, in the formats Supabase really uses, so these tests need no account and no
 * network. (The real project is checked by hand with the checklist in docs/SERVER_SETUP.md.)
 */

const USER_ID = '6f1d1c0e-8a54-4c55-9d38-0b1f1f3e2a11';
const EMAIL = 'dana@example.com';
const AUTH_STORAGE_KEY = 'diet-plan.auth';

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** A token that looks like Supabase's (header.payload.signature); the app never checks the signature. */
const FAKE_JWT = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
  sub: USER_ID,
  role: 'authenticated',
  exp: 4_102_444_800,
})}.signature`;

const session = {
  access_token: FAKE_JWT,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: 'refresh-token',
  user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL },
};

const inputs: PlanInputs = {
  sex: 'female',
  birthDate: '1992-03-15',
  onDate: TODAY,
  heightCm: 165,
  weightKg: 71,
  activity: 'light',
  goal: { type: 'lose', targetWeightKg: 62, request: { mode: 'rate', weeklyRateKg: 0.5 } },
};

function serverRows() {
  const outcome = computePlan(inputs);
  if (outcome.kind !== 'plan') throw new Error('test setup: expected a plan');
  const { plan } = outcome;
  return {
    profile: {
      user_id: USER_ID,
      sex: 'female',
      birth_date: '1992-03-15',
      height_cm: 165,
      timezone: 'Asia/Jerusalem',
      disclaimer_ack_at: '2026-10-01T08:00:00+00:00',
      version: 1,
    },
    plan: {
      id: 'b1f2c3d4-0000-4000-8000-000000000001',
      user_id: USER_ID,
      effective_from: TODAY,
      engine_version: plan.engineVersion,
      goal_type: plan.goalType,
      kcal_target: plan.kcalTarget,
      kcal_floor: plan.kcalFloor,
      protein_g: plan.macros?.proteinG ?? null,
      carbs_g: plan.macros?.carbsG ?? null,
      fat_g: plan.macros?.fatG ?? null,
      macro_state: plan.macroState,
      schedule: DEFAULT_SCHEDULE,
      inputs,
      result: plan,
      created_at: '2026-10-02T06:00:00+00:00',
    },
    meal: {
      id: 'c1f2c3d4-0000-4000-8000-000000000002',
      user_id: USER_ID,
      eaten_at: '2026-10-02T05:30:00+00:00',
      tz: 'Asia/Jerusalem',
      local_date: TODAY,
      slot: 'breakfast',
      name: 'חביתה מהשרת',
      kcal: 280,
      protein_g: 18,
      carbs_g: 12,
      fat_g: 18,
      items: [],
      source: 'manual',
      food_db_version: null,
      entered_at: '2026-10-02T05:31:00+00:00',
      deleted_at: null,
      version: 1,
    },
  };
}

interface FakeServer {
  /** "METHOD /path" of every request the app made to the server, in order. */
  requests: string[];
  bodies: Map<string, unknown>;
}

interface FakeOptions {
  /** What the server holds for this person. */
  data?: 'new-user' | 'with-data';
  otp?: { status: number; body: object };
  verify?: { status: number; body: object };
}

async function fakeServer(page: Page, options: FakeOptions = {}): Promise<FakeServer> {
  const server: FakeServer = { requests: [], bodies: new Map() };
  const rows = serverRows();
  const withData = options.data === 'with-data';

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: status === 204 ? '' : JSON.stringify(body),
    });

  await page.route(/\/(auth|rest)\/v1\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    server.requests.push(key);
    const body = request.postData();
    if (body) server.bodies.set(key, JSON.parse(body));

    switch (key) {
      case 'POST /auth/v1/otp':
        return json(route, options.otp?.status ?? 200, options.otp?.body ?? {});
      case 'POST /auth/v1/verify':
        return json(route, options.verify?.status ?? 200, options.verify?.body ?? session);
      case 'POST /rest/v1/rpc/delete_my_account':
        return json(route, 200, null);
      case 'POST /auth/v1/logout':
        return json(route, 204, null);
      case 'GET /rest/v1/profiles':
        return json(route, 200, withData ? [rows.profile] : []);
      case 'GET /rest/v1/target_plans':
        return json(route, 200, withData ? [rows.plan] : []);
      case 'GET /rest/v1/meals':
        return json(route, 200, withData ? [rows.meal] : []);
      case 'POST /rest/v1/rpc/food_usage':
      case 'GET /rest/v1/weight_entries':
      case 'GET /rest/v1/favorites':
        return json(route, 200, []);
      default:
        return json(route, 404, { message: `unexpected request: ${key}` });
    }
  });
  return server;
}

/** Starts the page already signed in, as if the person had signed in earlier on this device. */
async function startSignedIn(page: Page): Promise<void> {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: AUTH_STORAGE_KEY,
    value: JSON.stringify(session),
  });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(`${TODAY}T10:00:00+03:00`);
});

test.describe('signing in', () => {
  test('asks for an e-mail address first, and explains a bad one without contacting the server', async ({
    page,
  }) => {
    const server = await fakeServer(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: he.auth.title })).toBeVisible();

    await page.getByLabel(he.auth.email).fill('dana');
    await page.getByRole('button', { name: he.auth.sendCode }).click();
    await expect(page.getByText(he.auth.emailInvalid)).toBeVisible();
    expect(server.requests.filter((r) => r.includes('/otp'))).toEqual([]);
  });

  test('sends a code, then lets the person in with it (a new person lands in first-run setup)', async ({
    page,
  }) => {
    const server = await fakeServer(page, { data: 'new-user' });
    await page.goto('/');
    await page.getByLabel(he.auth.email).fill('  Dana@Example.com ');
    await page.getByRole('button', { name: he.auth.sendCode }).click();

    await expect(page.getByText(he.auth.codeSent(EMAIL))).toBeVisible();
    await expect(page.getByLabel(he.auth.code)).toBeFocused();
    expect(server.bodies.get('POST /auth/v1/otp')).toMatchObject({ email: EMAIL });

    await page.getByLabel(he.auth.code).fill('123 456');
    await page.getByRole('button', { name: he.auth.verify }).click();
    expect(server.bodies.get('POST /auth/v1/verify')).toMatchObject({
      email: EMAIL,
      token: '123456',
      type: 'email',
    });
    await expect(
      page.getByRole('heading', { level: 1, name: he.onboarding.stepBody }),
    ).toBeVisible();
  });

  test('a wrong or expired code is explained and can be retried', async ({ page }) => {
    await fakeServer(page, {
      verify: {
        status: 403,
        body: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' },
      },
    });
    await page.goto('/');
    await page.getByLabel(he.auth.email).fill(EMAIL);
    await page.getByRole('button', { name: he.auth.sendCode }).click();
    await page.getByLabel(he.auth.code).fill('000000');
    await page.getByRole('button', { name: he.auth.verify }).click();
    await expect(page.getByRole('alert')).toContainText(he.auth.errors.invalid_code);
    await expect(page.getByLabel(he.auth.code)).toBeVisible();
    // A malformed code never reaches the server.
    await page.getByLabel(he.auth.code).fill('12');
    await page.getByRole('button', { name: he.auth.verify }).click();
    await expect(page.getByText(he.auth.codeInvalid)).toBeVisible();
  });

  test('an unexpected failure says so and shows what went wrong, so it can be fixed', async ({
    page,
  }) => {
    await fakeServer(page, {
      verify: {
        status: 500,
        body: { code: 500, error_code: 'unexpected_failure', msg: 'Database error' },
      },
    });
    await page.goto('/');
    await page.getByLabel(he.auth.email).fill(EMAIL);
    await page.getByRole('button', { name: he.auth.sendCode }).click();
    await page.getByLabel(he.auth.code).fill('12345678');
    await page.getByRole('button', { name: he.auth.verify }).click();
    await expect(page.getByRole('alert')).toContainText(he.auth.errors.unknown);
    await expect(page.getByText(he.auth.technical)).toContainText('500');
  });

  test('too many requests are explained', async ({ page }) => {
    await fakeServer(page, {
      otp: {
        status: 429,
        body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'rate limit' },
      },
    });
    await page.goto('/');
    await page.getByLabel(he.auth.email).fill(EMAIL);
    await page.getByRole('button', { name: he.auth.sendCode }).click();
    await expect(page.getByRole('alert')).toContainText(he.auth.errors.rate_limited);
  });

  test('when new accounts are closed, a stranger is told entry is by invitation only', async ({
    page,
  }) => {
    await fakeServer(page, {
      otp: {
        status: 422,
        body: {
          code: 422,
          error_code: 'signup_disabled',
          msg: 'Signups not allowed for this instance',
        },
      },
    });
    await page.goto('/');
    await page.getByLabel(he.auth.email).fill('stranger@example.com');
    await page.getByRole('button', { name: he.auth.sendCode }).click();
    await expect(page.getByRole('alert')).toContainText(he.auth.errors.signups_closed);
    await expect(page.getByLabel(he.auth.code)).toHaveCount(0);
  });

  test('a new code cannot be requested straight away, and the address can be changed', async ({
    page,
  }) => {
    await fakeServer(page);
    await page.goto('/');
    await page.getByLabel(he.auth.email).fill(EMAIL);
    await page.getByRole('button', { name: he.auth.sendCode }).click();
    await expect(page.getByRole('button', { name: he.auth.resend })).toBeDisabled();
    await expect(page.getByText(/אפשר לבקש קוד חדש בעוד \d+ שניות/)).toBeVisible();
    await page.getByRole('button', { name: he.auth.changeEmail }).click();
    await expect(page.getByLabel(he.auth.email)).toBeVisible();
  });

  test('the sign-in screens have no serious accessibility problems', async ({ page }) => {
    await fakeServer(page);
    await page.goto('/');
    const scan = async () =>
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(await scan()).toEqual([]);
    await page.getByLabel(he.auth.email).fill(EMAIL);
    await page.getByRole('button', { name: he.auth.sendCode }).click();
    await expect(page.getByLabel(he.auth.code)).toBeVisible();
    expect(await scan()).toEqual([]);
  });
});

test.describe('signed in', () => {
  test('opens straight into the app and shows what the server holds', async ({ page }) => {
    const server = await fakeServer(page, { data: 'with-data' });
    await startSignedIn(page);
    await page.goto('/today');
    await expect(page.locator('p').filter({ hasText: 'חביתה מהשרת' })).toBeVisible();
    expect(server.requests).toContain('GET /rest/v1/profiles');
    expect(server.requests.filter((r) => r.includes('/otp'))).toEqual([]);
  });

  test('a person who left setup half-way (profile but no plan) is sent back to finish it', async ({
    page,
  }) => {
    await fakeServer(page, { data: 'with-data' });
    await page.route('**/rest/v1/target_plans*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await startSignedIn(page);
    await page.goto('/today');
    await expect(
      page.getByRole('heading', { level: 1, name: he.onboarding.stepBody }),
    ).toBeVisible();
  });

  test('when the data cannot be loaded the screen says so, never "no meals yet"', async ({
    page,
  }) => {
    await fakeServer(page, { data: 'with-data' });
    await page.route('**/rest/v1/meals*', (route) => route.abort('connectionfailed'));
    await startSignedIn(page);
    await page.goto('/today');
    await expect(page.getByText(he.loadFailed)).toBeVisible();
    await expect(page.getByRole('button', { name: he.retry })).toBeVisible();
    await expect(page.getByText('חביתה מהשרת')).toHaveCount(0);
  });

  test('settings shows the account, and signing out returns to the sign-in screen', async ({
    page,
  }) => {
    const server = await fakeServer(page, { data: 'with-data' });
    await startSignedIn(page);
    await page.goto('/settings');
    await expect(page.getByText(he.auth.signedInAs(EMAIL))).toBeVisible();
    await page.getByRole('button', { name: he.auth.signOut }).click();
    await expect(page.getByRole('heading', { level: 2, name: he.auth.title })).toBeVisible();
    expect(server.requests).toContain('POST /auth/v1/logout');
    // Nothing of the signed-out person remains in the device's storage.
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), AUTH_STORAGE_KEY),
    ).toBeNull();
  });

  test('deleting the account asks first, then removes it and returns to sign-in', async ({
    page,
  }) => {
    const server = await fakeServer(page, { data: 'with-data' });
    await startSignedIn(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: he.auth.deleteAccount }).click();
    await expect(page.getByText(he.auth.deleteAccountBody)).toBeVisible();
    expect(server.requests).not.toContain('POST /rest/v1/rpc/delete_my_account');
    await page.getByRole('button', { name: he.auth.deleteAccountAction }).click();
    await expect(page.getByRole('heading', { level: 2, name: he.auth.title })).toBeVisible();
    expect(server.requests).toContain('POST /rest/v1/rpc/delete_my_account');
  });
});
