import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MEAL_LIMITS } from '../../src/core/contracts';
import { SCHEDULE, createTestDb, failureOf, mealPayload, type TestDb } from './harness';

/**
 * Meals on the server: derived day, idempotent adds, edit conflicts, soft delete, limits, audit trail
 * (docs/TEST_PLAN.md DB-01..07, INT-01..09, TIME-01/07/09).
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

interface MealRow {
  id: string;
  user_id: string;
  eaten_at: string;
  tz: string;
  local_date: string;
  slot: string;
  name: string;
  kcal: number;
  protein_g: string | null;
  version: number;
  entered_at: string;
  deleted_at: string | null;
  source: string;
}

const MEAL_COLUMNS = `id, user_id, eaten_at::text, tz, local_date::text, slot, name, kcal, protein_g::text,
  version, entered_at::text, deleted_at::text, source`;

async function addMeal(user: string, payload: Record<string, unknown>): Promise<MealRow> {
  const rows = await db
    .as(user)
    .query<MealRow>(`select ${MEAL_COLUMNS} from public.add_meal($1::jsonb)`, [
      JSON.stringify(payload),
    ]);
  return rows[0] as MealRow;
}

const hoursAgo = (hours: number) => db.timestamp(`now() - interval '${hours} hours'`);

describe('DB-01 / TIME-01: the day is decided by the server, from the instant and the user zone', () => {
  it('puts 01:59:59.999 and 02:00:00.000 (Jerusalem) on consecutive days', async () => {
    const user = await db.newUserWithProfile('Asia/Jerusalem');
    // A day of eating runs from 02:00 to 02:00: the last moment of the day three days ago is 01:59:59.999 on the
    // calendar date after it, and 02:00:00 on that date starts the next day.
    const lastMoment = await db.timestamp(
      `(((now() at time zone 'Asia/Jerusalem')::date - 2) + time '01:59:59.999') at time zone 'Asia/Jerusalem'`,
    );
    const firstMoment = await db.timestamp(
      `(((now() at time zone 'Asia/Jerusalem')::date - 2) + time '02:00:00') at time zone 'Asia/Jerusalem'`,
    );
    const late = await addMeal(user, mealPayload(lastMoment));
    const early = await addMeal(user, mealPayload(firstMoment));
    const [expectedLate] = await db.admin.query<{ d: string }>(
      `select ((now() at time zone 'Asia/Jerusalem')::date - 3)::text as d`,
    );
    const [expectedEarly] = await db.admin.query<{ d: string }>(
      `select ((now() at time zone 'Asia/Jerusalem')::date - 2)::text as d`,
    );
    expect(late.local_date).toBe(expectedLate?.d);
    expect(early.local_date).toBe(expectedEarly?.d);
  });

  it('uses the zone stored in the profile, not anything the client sends', async () => {
    const user = await db.newUserWithProfile('America/New_York');
    const instant = await db.timestamp(
      `(((now() at time zone 'America/New_York')::date - 1) + time '23:30') at time zone 'America/New_York'`,
    );
    const meal = await addMeal(
      user,
      mealPayload(instant, { tz: 'Asia/Tokyo', local_date: '2001-01-01' }),
    );
    expect(meal.tz).toBe('America/New_York');
    const [expected] = await db.admin.query<{ d: string }>(
      `select ((now() at time zone 'America/New_York')::date - 1)::text as d`,
    );
    expect(meal.local_date).toBe(expected?.d);
  });

  it('overwrites a local_date supplied on a direct write to the table', async () => {
    const user = await db.newUserWithProfile();
    const stored = await db.admin.query<{ local_date: string }>(
      `insert into public.meals (id, user_id, eaten_at, tz, local_date, slot, name, kcal, source)
       values (gen_random_uuid(), $1, now() - interval '1 hour', 'Asia/Jerusalem', '2001-01-01', 'lunch', 'x', 10, 'manual')
       returning local_date::text`,
      [user],
    );
    expect(stored[0]?.local_date).not.toBe('2001-01-01');
  });
});

describe('TIME-07 / TIME-09: how far from "now" a meal may be', () => {
  it('rejects a meal more than 5 minutes in the future, accepts one a minute ahead', async () => {
    const user = await db.newUserWithProfile();
    const message = await failureOf(
      addMeal(
        user,
        mealPayload(
          await db.timestamp(
            `now() + interval '${MEAL_LIMITS.futureToleranceMinutes + 1} minutes'`,
          ),
        ),
      ),
    );
    expect(message).toMatch(/eaten_at_in_future/);
    await expect(
      addMeal(
        user,
        mealPayload(
          await db.timestamp(
            `now() + interval '${MEAL_LIMITS.futureToleranceMinutes - 1} minutes'`,
          ),
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('accepts back-dating up to 31 days and rejects older', async () => {
    const user = await db.newUserWithProfile();
    await expect(
      addMeal(
        user,
        mealPayload(await db.timestamp(`now() - interval '${MEAL_LIMITS.backfillDays - 1} days'`)),
      ),
    ).resolves.toBeDefined();
    const message = await failureOf(
      addMeal(
        user,
        mealPayload(await db.timestamp(`now() - interval '${MEAL_LIMITS.backfillDays + 1} days'`)),
      ),
    );
    expect(message).toMatch(/eaten_at_too_old/);
  });

  it('records when the entry was really made, whatever the eaten time claims', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(
      user,
      mealPayload(await hoursAgo(20), { entered_at: '2001-01-01T00:00:00Z' }),
    );
    const [serverNow] = await db.admin.query<{ gap: string }>(
      `select (abs(extract(epoch from now() - $1::timestamptz)) < 60)::text as gap`,
      [meal.entered_at],
    );
    expect(serverNow?.gap).toBe('true');
  });

  it('refuses to add a meal before a profile exists', async () => {
    const user = await db.newUser();
    expect(await failureOf(addMeal(user, mealPayload(await hoursAgo(1))))).toMatch(/no_profile/);
  });
});

describe('DB-03: value bounds (the same limits as the app: src/core/contracts/meal.ts)', () => {
  let user: string;
  beforeAll(async () => {
    user = await db.newUserWithProfile();
  });

  const accepts = async (overrides: Record<string, unknown>) =>
    addMeal(user, mealPayload(await hoursAgo(1), overrides));
  const rejects = async (overrides: Record<string, unknown>) =>
    failureOf(addMeal(user, mealPayload(await hoursAgo(1), overrides)));

  it('calories 0..3000', async () => {
    await accepts({ kcal: 0 });
    await accepts({ kcal: MEAL_LIMITS.kcalMax });
    expect(await rejects({ kcal: MEAL_LIMITS.kcalMax + 1 })).toMatch(/violates check constraint/);
    expect(await rejects({ kcal: -1 })).toMatch(/violates check constraint/);
  });

  it('name 1..80 characters, no markup or control characters', async () => {
    await accepts({ name: 'א' });
    await accepts({ name: 'א'.repeat(MEAL_LIMITS.nameMax) });
    expect(await rejects({ name: 'א'.repeat(MEAL_LIMITS.nameMax + 1) })).toMatch(
      /violates check constraint/,
    );
    expect(await rejects({ name: '   ' })).toMatch(/violates check constraint/);
    expect(await rejects({ name: '<img src=x onerror=alert(1)>' })).toMatch(
      /violates check constraint/,
    );
    expect(await rejects({ name: 'שורה\nשנייה' })).toMatch(/violates check constraint/);
  });

  it('macros 0..500 g, all three or none', async () => {
    await accepts({
      protein_g: MEAL_LIMITS.macroMaxG,
      carbs_g: MEAL_LIMITS.macroMaxG,
      fat_g: MEAL_LIMITS.macroMaxG,
    });
    await accepts({ protein_g: null, carbs_g: null, fat_g: null });
    expect(await rejects({ protein_g: MEAL_LIMITS.macroMaxG + 0.1, carbs_g: 1, fat_g: 1 })).toMatch(
      /violates check constraint/,
    );
    expect(await rejects({ protein_g: 10, carbs_g: null, fat_g: null })).toMatch(
      /violates check constraint/,
    );
  });

  it('items: at most 30 entries and 16 KB', async () => {
    await accepts({
      items: Array.from({ length: MEAL_LIMITS.itemsMax }, (_, i) => ({ foodId: `f${i}` })),
    });
    expect(
      await rejects({
        items: Array.from({ length: MEAL_LIMITS.itemsMax + 1 }, (_, i) => ({ foodId: `f${i}` })),
      }),
    ).toMatch(/violates check constraint/);
    expect(await rejects({ items: [{ blob: 'x'.repeat(17_000) }] })).toMatch(
      /violates check constraint/,
    );
    expect(await rejects({ items: { not: 'a list' } })).toMatch(/violates check constraint/);
  });

  it('slot and source must be known values', async () => {
    expect(await rejects({ slot: 'brunch' })).toMatch(/violates check constraint/);
    expect(await rejects({ source: 'ai' })).toMatch(/violates check constraint/);
  });
});

describe('INT-01..03: adding is idempotent', () => {
  it('the same request twice gives one meal, unchanged', async () => {
    const user = await db.newUserWithProfile();
    const payload = mealPayload(await hoursAgo(2));
    const first = await addMeal(user, payload);
    const second = await addMeal(user, payload);
    expect(second).toEqual(first);
    const rows = await db.admin.query('select 1 from public.meals where user_id = $1', [user]);
    expect(rows).toHaveLength(1);
  });

  it('ten simultaneous retries still give one meal', async () => {
    const user = await db.newUserWithProfile();
    const payload = mealPayload(await hoursAgo(2));
    const results = await Promise.all(Array.from({ length: 10 }, () => addMeal(user, payload)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.every((r) => r.version === 1)).toBe(true);
    const rows = await db.admin.query('select 1 from public.meals where user_id = $1', [user]);
    expect(rows).toHaveLength(1);
  });

  it('the same id with different content is a conflict, and the original is untouched', async () => {
    const user = await db.newUserWithProfile();
    const payload = mealPayload(await hoursAgo(2));
    const original = await addMeal(user, payload);
    expect(await failureOf(addMeal(user, { ...payload, kcal: 999 }))).toMatch(/id_conflict/);
    const [stored] = await db.admin.query<{ kcal: number }>(
      'select kcal from public.meals where id = $1',
      [original.id],
    );
    expect(stored?.kcal).toBe(original.kcal);
  });

  it("someone else's id is a conflict too, and says nothing about whose it is", async () => {
    const owner = await db.newUserWithProfile();
    const other = await db.newUserWithProfile();
    const payload = mealPayload(await hoursAgo(2));
    await addMeal(owner, payload);
    const message = await failureOf(addMeal(other, payload));
    expect(message).toMatch(/id_conflict/);
    expect(message).not.toContain(owner);
    const rows = await db.admin.query('select 1 from public.meals where id = $1', [payload['id']]);
    expect(rows).toHaveLength(1);
  });

  it('a retry that arrives after a successful save returns the saved meal (timeout case)', async () => {
    const user = await db.newUserWithProfile();
    const payload = mealPayload(await hoursAgo(2));
    await addMeal(user, payload); // the server saved it, the answer never reached the phone
    const retry = await addMeal(user, payload);
    expect(retry.id).toBe(payload['id']);
  });
});

describe('INT-06: editing and deleting with version checks', () => {
  it('an edit with the right version succeeds and bumps the version', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2)));
    const rows = await db
      .as(user)
      .query<MealRow>(`select ${MEAL_COLUMNS} from public.update_meal($1, $2, $3::jsonb)`, [
        meal.id,
        meal.version,
        JSON.stringify({ kcal: 480, name: 'חזה עוף' }),
      ]);
    expect(rows[0]).toMatchObject({ kcal: 480, name: 'חזה עוף', version: 2 });
  });

  it('an edit based on an old version is refused and changes nothing', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2)));
    await db
      .as(user)
      .query('select * from public.update_meal($1, 1, $2::jsonb)', [
        meal.id,
        JSON.stringify({ kcal: 400 }),
      ]);
    const message = await failureOf(
      db
        .as(user)
        .query('select * from public.update_meal($1, 1, $2::jsonb)', [
          meal.id,
          JSON.stringify({ kcal: 1 }),
        ]),
    );
    expect(message).toMatch(/version_conflict/);
    const [stored] = await db.admin.query<{ kcal: number; version: number }>(
      'select kcal, version from public.meals where id = $1',
      [meal.id],
    );
    expect(stored).toEqual({ kcal: 400, version: 2 });
  });

  it('cannot change the identity, origin or entry time of a meal', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2)));
    for (const column of [
      'entered_at = now()',
      "source = 'copy'",
      'user_id = gen_random_uuid()',
      'created_at = now()',
    ]) {
      expect(
        await failureOf(
          db.admin.query(`update public.meals set ${column} where id = $1`, [meal.id]),
        ),
      ).toMatch(/immutable_column/);
    }
  });

  it('moving the eaten time re-derives the day', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2)));
    const yesterdayNoon = await db.timestamp(
      `(((now() at time zone 'Asia/Jerusalem')::date - 1) + time '12:00') at time zone 'Asia/Jerusalem'`,
    );
    const rows = await db
      .as(user)
      .query<MealRow>(`select ${MEAL_COLUMNS} from public.update_meal($1, 1, $2::jsonb)`, [
        meal.id,
        JSON.stringify({ eaten_at: yesterdayNoon }),
      ]);
    const [expected] = await db.admin.query<{ d: string }>(
      `select ((now() at time zone 'Asia/Jerusalem')::date - 1)::text as d`,
    );
    expect(rows[0]?.local_date).toBe(expected?.d);
  });
});

describe('INT-09: soft delete and undo', () => {
  it('delete hides the meal from the day but keeps the row; restore brings it back', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2)));
    const deleted = await db
      .as(user)
      .query<MealRow>(`select ${MEAL_COLUMNS} from public.delete_meal($1, 1)`, [meal.id]);
    expect(deleted[0]?.deleted_at).not.toBeNull();
    expect(deleted[0]?.version).toBe(2);
    const [stillThere] = await db.admin.query<{ n: string }>(
      'select count(*)::text as n from public.meals where id = $1',
      [meal.id],
    );
    expect(stillThere?.n).toBe('1');

    const restored = await db
      .as(user)
      .query<MealRow>(`select ${MEAL_COLUMNS} from public.restore_meal($1, 2)`, [meal.id]);
    expect(restored[0]?.deleted_at).toBeNull();
    expect(restored[0]?.version).toBe(3);
  });

  it('deleting twice is harmless (a double click does not raise or bump the version again)', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2)));
    await db.as(user).query('select * from public.delete_meal($1, 1)', [meal.id]);
    const again = await db
      .as(user)
      .query<MealRow>('select * from public.delete_meal($1, 1)', [meal.id]);
    expect(again[0]?.version).toBe(2);
  });

  it('an edit made on a stale copy of a meal deleted elsewhere is a conflict', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2)));
    await db.as(user).query('select * from public.delete_meal($1, 1)', [meal.id]); // phone A
    const message = await failureOf(
      db
        .as(user)
        .query('select * from public.update_meal($1, 1, $2::jsonb)', [
          meal.id,
          JSON.stringify({ kcal: 1 }),
        ]), // phone B, still showing version 1
    );
    expect(message).toMatch(/version_conflict/);
  });

  it('a stale undo of a meal that is already back is a harmless no-op', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2)));
    await db.as(user).query('select * from public.delete_meal($1, 1)', [meal.id]);
    await db.as(user).query('select * from public.restore_meal($1, 2)', [meal.id]);
    await db
      .as(user)
      .query('select * from public.update_meal($1, 3, $2::jsonb)', [
        meal.id,
        JSON.stringify({ kcal: 100 }),
      ]);
    const rows = await db
      .as(user)
      .query<MealRow>('select * from public.restore_meal($1, 2)', [meal.id]);
    expect(rows[0]).toMatchObject({ kcal: 100, deleted_at: null, version: 4 });
  });
});

describe('DB-06: limits', () => {
  it('allows 60 meals a day and refuses the 61st; deleted meals do not count', async () => {
    const user = await db.newUserWithProfile();
    const base = await hoursAgo(3);
    const ids: string[] = [];
    for (let i = 0; i < MEAL_LIMITS.mealsPerDayMax; i += 1) {
      const meal = await addMeal(user, mealPayload(base, { name: `ארוחה ${i}` }));
      ids.push(meal.id);
    }
    expect(await failureOf(addMeal(user, mealPayload(base)))).toMatch(/limit_reached/);

    await db.as(user).query('select * from public.delete_meal($1, 1)', [ids[0]]);
    await expect(addMeal(user, mealPayload(base))).resolves.toBeDefined();
    // Restoring the deleted one would make 61 again.
    expect(
      await failureOf(db.as(user).query('select * from public.restore_meal($1, 2)', [ids[0]])),
    ).toMatch(/limit_reached/);
  }, 60_000);

  it('moving a meal onto a full day is refused too', async () => {
    const user = await db.newUserWithProfile();
    // Two fixed past days (whatever the time of day is now), so the test cannot depend on midnight.
    const at = (daysAgo: number) =>
      db.timestamp(
        `(((now() at time zone 'Asia/Jerusalem')::date - ${daysAgo}) + time '10:00') at time zone 'Asia/Jerusalem'`,
      );
    const full = await at(3);
    for (let i = 0; i < MEAL_LIMITS.mealsPerDayMax; i += 1) {
      await addMeal(user, mealPayload(full));
    }
    const other = await addMeal(user, mealPayload(await at(2)));
    const message = await failureOf(
      db
        .as(user)
        .query('select * from public.update_meal($1, 1, $2::jsonb)', [
          other.id,
          JSON.stringify({ eaten_at: full }),
        ]),
    );
    expect(message).toMatch(/limit_reached/);
  }, 60_000);

  it('allows 200 favorites and refuses the 201st', async () => {
    const user = await db.newUser();
    await db.as(user).transaction(async (tx) => {
      for (let i = 0; i < MEAL_LIMITS.favoritesMax; i += 1) {
        await tx.query(`insert into public.favorites (id, name, kcal) values ($1, $2, 100)`, [
          randomUUID(),
          `מועדף ${i}`,
        ]);
      }
    });
    const message = await failureOf(
      db
        .as(user)
        .query(`insert into public.favorites (id, name, kcal) values ($1, 'עוד אחד', 1)`, [
          randomUUID(),
        ]),
    );
    expect(message).toMatch(/limit_reached/);
  }, 60_000);
});

describe('DB-07: the audit trail', () => {
  it('records create, edit and delete with the before and after values', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2), { kcal: 500 }));
    await db
      .as(user)
      .query('select * from public.update_meal($1, 1, $2::jsonb)', [
        meal.id,
        JSON.stringify({ kcal: 450 }),
      ]);
    await db.as(user).query('select * from public.delete_meal($1, 2)', [meal.id]);

    const events = await db
      .as(user)
      .query<{ action: string; before: { kcal?: number } | null; after: { kcal?: number } | null }>(
        `select action, before, after from public.audit_events where entity = 'meals' and entity_id = $1 order by id`,
        [meal.id],
      );
    expect(events.map((e) => e.action)).toEqual(['insert', 'update', 'update']);
    expect(events[0]?.before).toBeNull();
    expect(events[0]?.after?.kcal).toBe(500);
    expect(events[1]?.before?.kcal).toBe(500);
    expect(events[1]?.after?.kcal).toBe(450);
  });

  it('cannot be altered or removed by the user it describes', async () => {
    const user = await db.newUserWithProfile();
    await addMeal(user, mealPayload(await hoursAgo(2)));
    for (const sql of [
      `delete from public.audit_events`,
      `update public.audit_events set action = 'insert'`,
      `insert into public.audit_events (user_id, entity, action) values ('${user}', 'meals', 'insert')`,
    ]) {
      expect(await failureOf(db.as(user).query(sql))).toMatch(/permission denied/);
    }
  });
});

describe('DB-08: deleting the account', () => {
  it('removes everything stored for the user and nothing of anyone else', async () => {
    const leaving = await db.newUserWithProfile();
    const staying = await db.newUserWithProfile();
    for (const user of [leaving, staying]) {
      await addMeal(user, mealPayload(await hoursAgo(2)));
      await db
        .as(user)
        .query(`insert into public.favorites (id, name, kcal) values ($1, 'x', 1)`, [randomUUID()]);
      await db
        .as(user)
        .query(
          `insert into public.weight_entries (id, measured_at, tz, weight_kg) values ($1, now(), 'UTC', 70)`,
          [randomUUID()],
        );
      await db.admin.query(
        `insert into public.target_plans (id, user_id, effective_from, engine_version, goal_type, kcal_target, kcal_floor,
           macro_state, schedule, inputs, result)
         values (gen_random_uuid(), $1, current_date, '1', 'maintain', 1800, 1200, 'conflict',
           $2::jsonb, '{}'::jsonb, '{}'::jsonb)`,
        [user, JSON.stringify(SCHEDULE)],
      );
    }

    await db.as(leaving).query('select public.delete_my_account()');

    for (const table of [
      'profiles',
      'target_plans',
      'weight_entries',
      'meals',
      'favorites',
      'audit_events',
    ]) {
      const [left] = await db.admin.query<{ n: string }>(
        `select count(*)::text as n from public.${table} where user_id = $1`,
        [leaving],
      );
      expect(left?.n, `${table} rows left for the deleted user`).toBe('0');
      const [kept] = await db.admin.query<{ n: string }>(
        `select count(*)::text as n from public.${table} where user_id = $1`,
        [staying],
      );
      expect(Number(kept?.n), `${table} rows of the other user`).toBeGreaterThan(0);
    }
    const [account] = await db.admin.query<{ n: string }>(
      'select count(*)::text as n from auth.users where id = $1',
      [leaving],
    );
    expect(account?.n).toBe('0');
  });
});

describe('reset_my_data: "delete all my data" keeps the login', () => {
  it('empties every table for the user, audit trail included, and leaves the account', async () => {
    const user = await db.newUserWithProfile();
    const other = await db.newUserWithProfile();
    await addMeal(user, mealPayload(await hoursAgo(2)));
    await addMeal(other, mealPayload(await hoursAgo(2)));
    await db
      .as(user)
      .query(`insert into public.favorites (id, name, kcal) values ($1, 'x', 1)`, [randomUUID()]);

    await db.as(user).query('select public.reset_my_data()');

    for (const table of [
      'profiles',
      'target_plans',
      'weight_entries',
      'meals',
      'favorites',
      'audit_events',
    ]) {
      const [left] = await db.admin.query<{ n: string }>(
        `select count(*)::text as n from public.${table} where user_id = $1`,
        [user],
      );
      expect(left?.n, table).toBe('0');
    }
    const [account] = await db.admin.query<{ n: string }>(
      'select count(*)::text as n from auth.users where id = $1',
      [user],
    );
    expect(account?.n).toBe('1');
    expect(await db.as(other).query('select 1 from public.meals')).toHaveLength(1);
  });
});

describe('mark_favorite_used', () => {
  it('counts uses for the owner only', async () => {
    const owner = await db.newUser();
    const other = await db.newUser();
    const id = randomUUID();
    await db
      .as(owner)
      .query(`insert into public.favorites (id, name, kcal) values ($1, 'x', 1)`, [id]);
    await db.as(owner).query('select public.mark_favorite_used($1)', [id]);
    await db.as(owner).query('select public.mark_favorite_used($1)', [id]);
    await db.as(other).query('select public.mark_favorite_used($1)', [id]);
    const [row] = await db.admin.query<{ use_count: number; last_used_at: string | null }>(
      'select use_count, last_used_at::text from public.favorites where id = $1',
      [id],
    );
    expect(row?.use_count).toBe(2);
    expect(row?.last_used_at).not.toBeNull();
  });
});

describe('added sugar of a meal', () => {
  it('is stored with one decimal, may be absent, and comes back with the meal', async () => {
    const user = await db.newUserWithProfile();
    const withSugar = await db
      .as(user)
      .query<{ added_sugar_g: string | null }>(
        'select added_sugar_g::text from public.add_meal($1::jsonb)',
        [JSON.stringify(mealPayload(await hoursAgo(2), { added_sugar_g: 12.34 }))],
      );
    expect(withSugar[0]?.added_sugar_g).toBe('12.3');
    const without = await db
      .as(user)
      .query<{ added_sugar_g: string | null }>(
        'select added_sugar_g::text from public.add_meal($1::jsonb)',
        [JSON.stringify(mealPayload(await hoursAgo(2)))],
      );
    expect(without[0]?.added_sugar_g).toBeNull();
  });

  it('accepts 0 and the same upper bound as the macros, and refuses anything else', async () => {
    const user = await db.newUserWithProfile();
    const add = async (value: unknown) =>
      failureOf(
        db
          .as(user)
          .query('select * from public.add_meal($1::jsonb)', [
            JSON.stringify(mealPayload(await hoursAgo(2), { added_sugar_g: value })),
          ]),
      );
    expect(await add(0)).toBe('');
    expect(await add(MEAL_LIMITS.macroMaxG)).toBe('');
    expect(await add(MEAL_LIMITS.macroMaxG + 0.1)).toMatch(/violates check constraint/);
    expect(await add(-1)).toMatch(/violates check constraint/);
  });

  it('is part of what makes a retry "the same request"', async () => {
    const user = await db.newUserWithProfile();
    const payload = mealPayload(await hoursAgo(2), { added_sugar_g: 5 });
    await addMeal(user, payload);
    expect(await failureOf(addMeal(user, { ...payload, added_sugar_g: 9 }))).toMatch(/id_conflict/);
    await expect(addMeal(user, payload)).resolves.toBeDefined();
  });

  it('can be changed, cleared and left alone by an edit', async () => {
    const user = await db.newUserWithProfile();
    const meal = await addMeal(user, mealPayload(await hoursAgo(2), { added_sugar_g: 5 }));
    const read = async (patch: object, version: number) =>
      (
        await db
          .as(user)
          .query<{ added_sugar_g: string | null }>(
            'select added_sugar_g::text from public.update_meal($1, $2, $3::jsonb)',
            [meal.id, version, JSON.stringify(patch)],
          )
      )[0]?.added_sugar_g;
    expect(await read({ kcal: 400 }, 1)).toBe('5.0'); // untouched
    expect(await read({ added_sugar_g: 8.5 }, 2)).toBe('8.5');
    expect(await read({ added_sugar_g: null }, 3)).toBeNull();
  });
});
