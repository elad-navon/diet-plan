import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDb,
  failureOf,
  mealPayload,
  planPayload,
  profilePayload,
  type Session,
  type TestDb,
} from './harness';

/**
 * Who may see and change what (docs/DATA_MODEL.md E.4; docs/TEST_PLAN.md RLS-01..06).
 * Every cell of the matrix is a test: owner (O), another signed-in user (X), anonymous (A).
 */

let db: TestDb;
let alice: string;
let bob: string;
let aliceMealId: string;
let aliceWeightId: string;
let aliceFavoriteId: string;

const TABLES = ['profiles', 'target_plans', 'weight_entries', 'meals', 'favorites', 'audit_events'];

async function today(): Promise<string> {
  const rows = await db.admin.query<{ d: string }>(
    `select ((now() at time zone 'Asia/Jerusalem')::date)::text as d`,
  );
  return rows[0]?.d ?? '';
}

async function count(session: Session, table: string): Promise<number> {
  const rows = await session.query<{ n: string }>(
    `select count(*)::text as n from public.${table}`,
  );
  return Number(rows[0]?.n);
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.newUserWithProfile();
  bob = await db.newUserWithProfile();

  const meal = mealPayload(await db.timestamp("now() - interval '2 hours'"));
  aliceMealId = String(meal['id']);
  await db.as(alice).query('select * from public.add_meal($1::jsonb)', [JSON.stringify(meal)]);
  await db
    .as(alice)
    .query('select * from public.save_plan($1::jsonb)', [
      JSON.stringify(planPayload(await today())),
    ]);
  aliceWeightId = randomUUID();
  await db
    .as(alice)
    .query(
      `insert into public.weight_entries (id, measured_at, tz, weight_kg) values ($1, now(), 'Asia/Jerusalem', 71.4)`,
      [aliceWeightId],
    );
  aliceFavoriteId = randomUUID();
  await db
    .as(alice)
    .query(`insert into public.favorites (id, name, kcal) values ($1, 'שייק חלבון', 180)`, [
      aliceFavoriteId,
    ]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('RLS-01: reading', () => {
  it.each(TABLES)(
    '%s: the owner sees their rows, another user does not see them',
    async (table) => {
      expect(await count(db.as(alice), table)).toBeGreaterThan(0);
      // Bob has his own profile (and the audit trail of creating it) - nothing else exists for him.
      const expected = table === 'profiles' || table === 'audit_events' ? 1 : 0;
      expect(await count(db.as(bob), table)).toBe(expected);
    },
  );

  it('a user only ever sees their own profile and audit entries', async () => {
    const profiles = await db
      .as(bob)
      .query<{ user_id: string }>('select user_id from public.profiles');
    expect(profiles.map((r) => r.user_id)).toEqual([bob]);
    const audit = await db
      .as(bob)
      .query<{ user_id: string }>('select user_id from public.audit_events');
    expect(audit.every((r) => r.user_id === bob)).toBe(true);
  });
});

describe('RLS-04: anonymous visitors', () => {
  it.each(TABLES)('cannot read %s', async (table) => {
    expect(await failureOf(db.anon.query(`select * from public.${table}`))).toMatch(
      /permission denied/,
    );
  });

  it.each([
    ['save_profile', '$1::jsonb', [JSON.stringify(profilePayload())]],
    ['add_meal', '$1::jsonb', [JSON.stringify(mealPayload('2026-10-01T10:00:00Z'))]],
    ['food_usage', '120', []],
    ['delete_my_account', '', []],
  ])('cannot run %s', async (fn, args, params) => {
    expect(await failureOf(db.anon.query(`select * from public.${fn}(${args})`, params))).toMatch(
      /permission denied/,
    );
  });
});

describe('RLS-05: tables that only the server-side functions may write', () => {
  const insertInto: Record<string, string> = {
    profiles: `insert into public.profiles (sex, birth_date, height_cm, timezone, disclaimer_ack_at)
               values ('male', '1990-01-01', 180, 'UTC', now())`,
    meals: `insert into public.meals (id, eaten_at, tz, slot, name, kcal, source)
            values (gen_random_uuid(), now(), 'UTC', 'lunch', 'x', 1, 'manual')`,
    target_plans: `insert into public.target_plans (id, effective_from) values (gen_random_uuid(), current_date)`,
    audit_events: `insert into public.audit_events (user_id, entity, action) values (gen_random_uuid(), 'meals', 'insert')`,
  };

  it.each(Object.keys(insertInto))(
    'a signed-in user cannot insert, update or delete %s directly',
    async (table) => {
      const user = db.as(alice);
      expect(await failureOf(user.query(insertInto[table] ?? ''))).toMatch(/permission denied/);
      const touch = table === 'audit_events' ? `entity = 'x'` : 'created_at = now()';
      expect(await failureOf(user.query(`update public.${table} set ${touch}`))).toMatch(
        /permission denied/,
      );
      expect(await failureOf(user.query(`delete from public.${table}`))).toMatch(
        /permission denied/,
      );
    },
  );

  it('the data is untouched after those attempts, and the proper functions still work', async () => {
    expect(await count(db.as(alice), 'meals')).toBe(1);
    const meal = mealPayload(await db.timestamp("now() - interval '30 minutes'"), { name: 'תפוח' });
    const rows = await db
      .as(alice)
      .query<{ name: string }>('select name from public.add_meal($1::jsonb)', [
        JSON.stringify(meal),
      ]);
    expect(rows[0]?.name).toBe('תפוח');
  });
});

describe('RLS-02/03: weigh-ins and favorites (direct access, owner only)', () => {
  it.each([
    ['weight_entries', () => aliceWeightId],
    ['favorites', () => aliceFavoriteId],
  ])(
    '%s: another user cannot read, change or delete a row they know the id of (IDOR)',
    async (table, id) => {
      const bobSession = db.as(bob);
      expect(await bobSession.query(`select * from public.${table} where id = $1`, [id()])).toEqual(
        [],
      );
      expect(
        await bobSession.query(
          `update public.${table} set version = 99 where id = $1 returning id`,
          [id()],
        ),
      ).toEqual([]);
      expect(
        await bobSession.query(`delete from public.${table} where id = $1 returning id`, [id()]),
      ).toEqual([]);
      const [row] = await db.admin.query<{ version: number }>(
        `select version from public.${table} where id = $1`,
        [id()],
      );
      expect(row?.version).toBe(1);
    },
  );

  it('cannot create a row for another user (WITH CHECK)', async () => {
    const message = await failureOf(
      db
        .as(bob)
        .query(
          `insert into public.favorites (id, user_id, name, kcal) values (gen_random_uuid(), $1, 'x', 1)`,
          [alice],
        ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it('cannot hand a row over to another user', async () => {
    const message = await failureOf(
      db
        .as(alice)
        .query(`update public.favorites set user_id = $1 where id = $2`, [bob, aliceFavoriteId]),
    );
    expect(message).toMatch(/immutable_column|row-level security/);
    const [row] = await db.admin.query<{ user_id: string }>(
      'select user_id from public.favorites where id = $1',
      [aliceFavoriteId],
    );
    expect(row?.user_id).toBe(alice);
  });

  it('the owner can update and delete their own rows', async () => {
    const id = randomUUID();
    const session = db.as(alice);
    await session.query(`insert into public.favorites (id, name, kcal) values ($1, 'לחם', 80)`, [
      id,
    ]);
    const updated = await session.query<{ version: number; kcal: number }>(
      `update public.favorites set kcal = 90 where id = $1 returning version, kcal`,
      [id],
    );
    expect(updated[0]).toEqual({ version: 2, kcal: 90 });
    const removed = await session.query(`delete from public.favorites where id = $1 returning id`, [
      id,
    ]);
    expect(removed).toHaveLength(1);
  });
});

describe('RLS-06: the functions trust the sign-in, never the request', () => {
  it('refuse to run without a signed-in user', async () => {
    const message = await failureOf(
      db.noUser.query('select * from public.add_meal($1::jsonb)', [
        JSON.stringify(mealPayload('2026-10-01T10:00:00Z')),
      ]),
    );
    expect(message).toMatch(/unauthenticated/);
  });

  it('ignore a user_id placed in the request body', async () => {
    const meal = mealPayload(await db.timestamp("now() - interval '10 minutes'"), { user_id: bob });
    await db.as(alice).query('select * from public.add_meal($1::jsonb)', [JSON.stringify(meal)]);
    const [row] = await db.admin.query<{ user_id: string }>(
      'select user_id from public.meals where id = $1',
      [meal['id']],
    );
    expect(row?.user_id).toBe(alice);
  });

  it("cannot read or change another user's meal through the meal functions", async () => {
    const bobSession = db.as(bob);
    expect(
      await failureOf(
        bobSession.query(`select * from public.update_meal($1, 1, '{"kcal": 1}'::jsonb)`, [
          aliceMealId,
        ]),
      ),
    ).toMatch(/not_found/);
    expect(
      await failureOf(bobSession.query('select * from public.delete_meal($1, 1)', [aliceMealId])),
    ).toMatch(/not_found/);
    expect(
      await failureOf(bobSession.query('select * from public.restore_meal($1, 1)', [aliceMealId])),
    ).toMatch(/not_found/);
  });

  it("food_usage counts only the caller's meals", async () => {
    const foodMeal = mealPayload(await db.timestamp("now() - interval '5 minutes'"), {
      items: [{ foodId: 'f-1', grams: 100 }],
      source: 'food_db',
    });
    await db
      .as(alice)
      .query('select * from public.add_meal($1::jsonb)', [JSON.stringify(foodMeal)]);
    const mine = await db
      .as(alice)
      .query<{ food_id: string; uses: string }>('select * from public.food_usage(120)');
    expect(mine.map((r) => [r.food_id, Number(r.uses)])).toEqual([['f-1', 1]]);
    expect(await db.as(bob).query('select * from public.food_usage(120)')).toEqual([]);
  });
});

describe('The set-up itself (guards against a forgotten table or function)', () => {
  it('every table in public has row level security switched on', async () => {
    const rows = await db.admin.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it('every function in public pins its search_path (no hijacking through a look-alike schema)', async () => {
    const rows = await db.admin.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(rows).toEqual([]);
  });

  it('the API roles hold exactly the table privileges we intend, and no more', async () => {
    const rows = await db.admin.query<{
      grantee: string;
      table_name: string;
      privilege_type: string;
    }>(
      `select grantee, table_name, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')`,
    );
    const granted = rows.map((r) => `${r.grantee}:${r.table_name}:${r.privilege_type}`).sort();
    const expected = [
      ...['audit_events', 'meals', 'profiles', 'target_plans'].map(
        (t) => `authenticated:${t}:SELECT`,
      ),
      ...['favorites', 'weight_entries'].flatMap((t) =>
        ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].map((p) => `authenticated:${t}:${p}`),
      ),
    ].sort();
    expect(granted).toEqual(expected);
  });

  it('only signed-in users can run the public functions, except the harmless keep_alive', async () => {
    const rows = await db.admin.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))`,
    );
    expect(rows.map((r) => r.proname)).toEqual(['keep_alive']);
  });

  it('keep_alive answers anyone with the server time and nothing else', async () => {
    const rows = await db.anon.query<{ now: string }>('select public.keep_alive()::text as now');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.now).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });
});
