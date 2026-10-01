import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite, type Transaction } from '@electric-sql/pglite';

/**
 * A real Postgres (PGlite, running in-process - no Docker) with the Supabase pieces the migrations rely on
 * stubbed in: the three API roles, `auth.users`, `auth.uid()` and Supabase's habit of handing new tables to
 * `anon`/`authenticated` by default. The migrations in supabase/migrations are applied unchanged, so these tests
 * exercise the same SQL that will run on the server (docs/TEST_PLAN.md: DB / RLS tests).
 *
 * What PGlite cannot show: truly parallel connections (it has one) and PostgREST/Auth themselves. Those need the
 * real Supabase project (docs/SECURITY_PLAN.md).
 */

const MIGRATIONS_DIR = new URL('../../supabase/migrations/', import.meta.url);

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  -- What a fresh Supabase project does: everything new in public is open to the API roles.
  -- The migration has to take that away again.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export interface Session {
  /** Runs one statement in its own transaction as this session's role. Errors reject. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs several statements in one transaction (they commit or roll back together). */
  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}

export interface TestDb {
  pg: PGlite;
  /** A signed-in user: role `authenticated`, `auth.uid()` = userId. */
  as(userId: string): Session;
  /** Not signed in: role `anon`. */
  anon: Session;
  /** Signed-in role but with no user id in the token (a malformed session). */
  noUser: Session;
  /** The database owner - bypasses RLS. For set-up and for looking at what was really stored. */
  admin: Session;
  /** Creates a user in `auth.users` and returns the id. */
  newUser(): Promise<string>;
  /** Creates a user with a profile (Asia/Jerusalem, adult) - the usual starting point. */
  newUserWithProfile(timezone?: string): Promise<string>;
  /** Evaluates a SQL expression for a timestamp and returns it as an ISO string (the database's own clock). */
  timestamp(expression: string): Promise<string>;
  close(): Promise<void>;
}

function session(pg: PGlite, role: string | null, userId: string | null): Session {
  const run = async <T>(work: (tx: Transaction) => Promise<T>): Promise<T> =>
    pg.transaction(async (tx) => {
      if (role) {
        await tx.query(`set local role ${role}`);
        if (userId) {
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: userId, role }),
          ]);
        }
      }
      return work(tx);
    });
  return {
    query: <T>(sql: string, params: unknown[] = []) =>
      run(async (tx) => (await tx.query<T>(sql, params)).rows),
    transaction: run,
  };
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await pg.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
  }

  const admin = session(pg, null, null);
  const db: TestDb = {
    pg,
    as: (userId) => session(pg, 'authenticated', userId),
    anon: session(pg, 'anon', null),
    noUser: session(pg, 'authenticated', null),
    admin,
    async newUser() {
      const id = randomUUID();
      await pg.query('insert into auth.users (id, email) values ($1, $2)', [
        id,
        `${id}@example.test`,
      ]);
      return id;
    },
    async newUserWithProfile(timezone = 'Asia/Jerusalem') {
      const id = await db.newUser();
      await db
        .as(id)
        .query('select * from public.save_profile($1::jsonb)', [
          JSON.stringify(profilePayload({ timezone })),
        ]);
      return id;
    },
    async timestamp(expression) {
      const rows = await admin.query<{ t: string }>(
        `select to_char((${expression}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as t`,
      );
      return rows[0]?.t ?? '';
    },
    close: () => pg.close(),
  };
  return db;
}

// --- payload builders (what the app will send; snake_case like the RPC expects) ---

export function profilePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sex: 'female',
    birth_date: '1992-03-15',
    height_cm: 165,
    timezone: 'Asia/Jerusalem',
    disclaimer_ack_at: '2026-10-01T08:00:00Z',
    ...overrides,
  };
}

export function mealPayload(
  eatenAt: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    eaten_at: eatenAt,
    slot: 'lunch',
    name: 'חזה עוף ואורז',
    kcal: 520,
    protein_g: 38,
    carbs_g: 55,
    fat_g: 14,
    items: [],
    source: 'manual',
    ...overrides,
  };
}

/** A schedule the way the engine produces it (3-4 non-overlapping windows). */
export const SCHEDULE = [
  { id: 'breakfast', start: '07:30', end: '09:30', weight: 0.25 },
  { id: 'lunch', start: '12:30', end: '14:30', weight: 0.3 },
  { id: 'snack', start: '16:00', end: '17:30', weight: 0.15 },
  { id: 'dinner', start: '19:00', end: '21:00', weight: 0.3 },
];

export function planPayload(
  effectiveFrom: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    effective_from: effectiveFrom,
    engine_version: '1.0.0',
    goal_type: 'lose',
    kcal_target: 1390,
    kcal_floor: 1200,
    protein_g: 122,
    carbs_g: 133,
    fat_g: 41,
    macro_state: 'ok',
    schedule: SCHEDULE,
    inputs: { weightKg: 71 },
    result: { kcalTarget: 1390 },
    ...overrides,
  };
}

/** The message of a rejected query (Postgres exception text such as `limit_reached`). */
export async function failureOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}
