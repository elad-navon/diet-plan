import { randomUUID } from 'node:crypto';
import { WEIGHT_LIMITS } from '../../src/core/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SCHEDULE,
  createTestDb,
  failureOf,
  planPayload,
  profilePayload,
  type TestDb,
} from './harness';

/**
 * Profile, target plans (history that never changes) and weigh-ins
 * (docs/TEST_PLAN.md DB-04, DB-05, INT-08, NUT-10; docs/DATA_MODEL.md E.2).
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

/** A date in the user's zone, relative to the server's today. */
async function day(offset: number, tz = 'Asia/Jerusalem'): Promise<string> {
  const [row] = await db.admin.query<{ d: string }>(
    `select ((now() at time zone '${tz}')::date + ${offset})::text as d`,
  );
  return row?.d ?? '';
}

describe('profile', () => {
  it('saves a profile and updates it in place (one row per user, version counts changes)', async () => {
    const user = await db.newUser();
    const session = db.as(user);
    const first = await session.query<{ version: number; height_cm: string }>(
      'select * from public.save_profile($1::jsonb)',
      [JSON.stringify(profilePayload())],
    );
    expect(first[0]?.version).toBe(1);
    const second = await session.query<{ version: number; height_cm: string }>(
      'select * from public.save_profile($1::jsonb)',
      [JSON.stringify(profilePayload({ height_cm: 170 }))],
    );
    expect(second[0]).toMatchObject({ version: 2, height_cm: '170.0' });
    const rows = await db.admin.query('select 1 from public.profiles where user_id = $1', [user]);
    expect(rows).toHaveLength(1);
  });

  it('refuses an unknown time zone', async () => {
    const user = await db.newUser();
    const message = await failureOf(
      db
        .as(user)
        .query('select * from public.save_profile($1::jsonb)', [
          JSON.stringify(profilePayload({ timezone: 'Mars/Olympus' })),
        ]),
    );
    expect(message).toMatch(/invalid_timezone/);
  });

  it('refuses anyone under 18 (day of the 18th birthday counts as adult)', async () => {
    const user = await db.newUser();
    const turns18Today = (await day(0)).replace(/^\d{4}/, (year) => String(Number(year) - 18));
    const turns18Tomorrow = (await day(1)).replace(/^\d{4}/, (year) => String(Number(year) - 18));
    await expect(
      db
        .as(user)
        .query('select * from public.save_profile($1::jsonb)', [
          JSON.stringify(profilePayload({ birth_date: turns18Today })),
        ]),
    ).resolves.toBeDefined();
    const message = await failureOf(
      db
        .as(user)
        .query('select * from public.save_profile($1::jsonb)', [
          JSON.stringify(profilePayload({ birth_date: turns18Tomorrow })),
        ]),
    );
    expect(message).toMatch(/age_under_18/);
  });

  it('refuses a height outside 120-230 cm', async () => {
    const user = await db.newUser();
    for (const height of [119.9, 230.1]) {
      const message = await failureOf(
        db
          .as(user)
          .query('select * from public.save_profile($1::jsonb)', [
            JSON.stringify(profilePayload({ height_cm: height })),
          ]),
      );
      expect(message).toMatch(/violates check constraint/);
    }
  });
});

describe('DB-04 / DB-05: target plans keep history', () => {
  it('stores a plan and returns it', async () => {
    const user = await db.newUserWithProfile();
    const rows = await db
      .as(user)
      .query<{ kcal_target: number; schedule: unknown }>(
        'select * from public.save_plan($1::jsonb)',
        [JSON.stringify(planPayload(await day(0)))],
      );
    expect(rows[0]?.kcal_target).toBe(1390);
    expect(rows[0]?.schedule).toEqual(SCHEDULE);
  });

  it('saving again for the same start day replaces that plan only', async () => {
    const user = await db.newUserWithProfile();
    const session = db.as(user);
    const earlier = await day(0);
    await session.query('select * from public.save_plan($1::jsonb)', [
      JSON.stringify(planPayload(earlier)),
    ]);
    await session.query('select * from public.save_plan($1::jsonb)', [
      JSON.stringify(planPayload(earlier, { kcal_target: 1450 })),
    ]);
    const rows = await session.query<{ kcal_target: number }>(
      'select kcal_target from public.target_plans',
    );
    expect(rows).toEqual([{ kcal_target: 1450 }]);
  });

  it('a later plan is added next to the earlier one; the earlier one is not touched', async () => {
    const user = await db.newUserWithProfile();
    const session = db.as(user);
    await session.query('select * from public.save_plan($1::jsonb)', [
      JSON.stringify(planPayload(await day(0))),
    ]);
    await session.query('select * from public.save_plan($1::jsonb)', [
      JSON.stringify(planPayload(await day(2), { kcal_target: 1650 })),
    ]);
    const rows = await session.query<{ effective_from: string; kcal_target: number }>(
      'select effective_from::text, kcal_target from public.target_plans order by effective_from',
    );
    expect(rows).toEqual([
      { effective_from: await day(0), kcal_target: 1390 },
      { effective_from: await day(2), kcal_target: 1650 },
    ]);
  });

  it('refuses a plan that starts before today, even for a day that already has a plan', async () => {
    const user = await db.newUserWithProfile();
    const past = await day(-3);
    await db.admin.query(
      `insert into public.target_plans (id, user_id, effective_from, engine_version, goal_type, kcal_target, kcal_floor,
         protein_g, carbs_g, fat_g, macro_state, schedule, inputs, result)
       values (gen_random_uuid(), $1, $2, '1', 'lose', 1800, 1200, 100, 200, 60, 'ok', $3::jsonb, '{}'::jsonb, '{}'::jsonb)`,
      [user, past, JSON.stringify(SCHEDULE)],
    );
    for (const start of [past, await day(-10)]) {
      const message = await failureOf(
        db
          .as(user)
          .query('select * from public.save_plan($1::jsonb)', [
            JSON.stringify(planPayload(start, { kcal_target: 1300 })),
          ]),
      );
      expect(message).toMatch(/plan_in_past/);
    }
    const [row] = await db.admin.query<{ kcal_target: number }>(
      'select kcal_target from public.target_plans where user_id = $1',
      [user],
    );
    expect(row?.kcal_target).toBe(1800);
  });

  it('"today" is the user\'s today: with a zone far ahead of UTC the date can already be tomorrow in UTC', async () => {
    const user = await db.newUserWithProfile('Pacific/Kiritimati'); // UTC+14
    const kiritimatiToday = await day(0, 'Pacific/Kiritimati');
    await expect(
      db
        .as(user)
        .query('select * from public.save_plan($1::jsonb)', [
          JSON.stringify(planPayload(kiritimatiToday)),
        ]),
    ).resolves.toBeDefined();
    const yesterday = await day(-1, 'Pacific/Kiritimati');
    expect(
      await failureOf(
        db
          .as(user)
          .query('select * from public.save_plan($1::jsonb)', [
            JSON.stringify(planPayload(yesterday)),
          ]),
      ),
    ).toMatch(/plan_in_past/);
  });

  it('refuses a plan without a profile', async () => {
    const user = await db.newUser();
    expect(
      await failureOf(
        db
          .as(user)
          .query('select * from public.save_plan($1::jsonb)', [
            JSON.stringify(planPayload(await day(0))),
          ]),
      ),
    ).toMatch(/no_profile/);
  });

  it.each([
    ['calories below the safe floor', { kcal_target: 1100 }],
    ['a floor outside 1200-1500', { kcal_floor: 1100 }],
    ['macros that are only partly present', { protein_g: 100, carbs_g: null, fat_g: 40 }],
    ['state "conflict" while macros are present', { macro_state: 'conflict' }],
    ['a goal other than lose/maintain', { goal_type: 'gain' }],
    ['a schedule with two meals', { schedule: SCHEDULE.slice(0, 2) }],
    ['a schedule that is not a list', { schedule: { a: 1 } }],
    ['a schedule with a repeated meal', { schedule: [SCHEDULE[0], SCHEDULE[0], SCHEDULE[1]] }],
    [
      'overlapping meal windows',
      { schedule: [SCHEDULE[0], { ...SCHEDULE[1], start: '09:00' }, SCHEDULE[2], SCHEDULE[3]] },
    ],
    ['meals out of time order', { schedule: [SCHEDULE[1], SCHEDULE[0], SCHEDULE[2], SCHEDULE[3]] }],
    [
      'weights that do not add up to 1',
      { schedule: SCHEDULE.map((slot) => ({ ...slot, weight: 0.3 })) },
    ],
    [
      'a window that ends before it starts',
      { schedule: [{ ...SCHEDULE[0], end: '07:00' }, ...SCHEDULE.slice(1)] },
    ],
    [
      'a time that is not a time',
      { schedule: [{ ...SCHEDULE[0], start: '25:00' }, ...SCHEDULE.slice(1)] },
    ],
    [
      'a meal without a weight',
      { schedule: [{ id: 'breakfast', start: '07:30', end: '09:30' }, ...SCHEDULE.slice(1)] },
    ],
    [
      'an unknown meal name',
      { schedule: [{ ...SCHEDULE[0], id: 'brunch' }, ...SCHEDULE.slice(1)] },
    ],
    ['entries that are not objects', { schedule: [1, 2, 3] }],
    ['inputs that are not an object', { inputs: 5 }],
  ])('INT-08: refuses %s and stores nothing (all or nothing)', async (_label, overrides) => {
    const user = await db.newUserWithProfile();
    const message = await failureOf(
      db
        .as(user)
        .query('select * from public.save_plan($1::jsonb)', [
          JSON.stringify(planPayload(await day(0), overrides)),
        ]),
    );
    expect(message).toMatch(/violates check constraint/);
    expect(
      await db.admin.query('select 1 from public.target_plans where user_id = $1', [user]),
    ).toEqual([]);
  });

  it('accepts a conflict plan that has no macro targets', async () => {
    const user = await db.newUserWithProfile();
    await expect(
      db.as(user).query('select * from public.save_plan($1::jsonb)', [
        JSON.stringify(
          planPayload(await day(0), {
            macro_state: 'conflict',
            protein_g: null,
            carbs_g: null,
            fat_g: null,
          }),
        ),
      ]),
    ).resolves.toBeDefined();
  });
});

describe('weigh-ins', () => {
  async function weigh(
    user: string,
    kg: number,
    measuredAt: string,
  ): Promise<{ id: string; local_date: string; weight_kg: string; version: number }> {
    const rows = await db
      .as(user)
      .query<{ id: string; local_date: string; weight_kg: string; version: number }>(
        'select id, local_date::text, weight_kg::text, version from public.upsert_weight($1::jsonb)',
        [JSON.stringify({ id: randomUUID(), measured_at: measuredAt, weight_kg: kg })],
      );
    return rows[0] as { id: string; local_date: string; weight_kg: string; version: number };
  }

  it('derives the day from the instant and the profile zone', async () => {
    const user = await db.newUserWithProfile('Asia/Jerusalem');
    const lateEvening = await db.timestamp(
      `(((now() at time zone 'Asia/Jerusalem')::date - 1) + time '23:30') at time zone 'Asia/Jerusalem'`,
    );
    const entry = await weigh(user, 71.4, lateEvening);
    expect(entry.local_date).toBe(await day(-1));
    expect(entry.weight_kg).toBe('71.4');
  });

  it('a second weigh-in on the same day replaces the first', async () => {
    const user = await db.newUserWithProfile();
    const morning = await db.timestamp(
      `((now() at time zone 'Asia/Jerusalem')::date + time '06:00') at time zone 'Asia/Jerusalem' - interval '1 day'`,
    );
    const first = await weigh(user, 72, morning);
    const second = await weigh(user, 71.6, morning);
    const rows = await db
      .as(user)
      .query<{ weight_kg: string }>('select weight_kg::text from public.weight_entries');
    expect(rows).toEqual([{ weight_kg: '71.6' }]);
    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
  });

  it('refuses weights outside 30-350 kg and readings from the future', async () => {
    const user = await db.newUserWithProfile();
    const now = await db.timestamp('now()');
    for (const kg of [WEIGHT_LIMITS.minKg - 0.1, WEIGHT_LIMITS.maxKg + 0.1]) {
      expect(await failureOf(weigh(user, kg, now))).toMatch(/violates check constraint/);
    }
    expect(
      await failureOf(weigh(user, 70, await db.timestamp(`now() + interval '1 day'`))),
    ).toMatch(/measured_at_in_future/);
  });

  it('NUT-10: weighing in never changes the plan', async () => {
    const user = await db.newUserWithProfile();
    await db
      .as(user)
      .query('select * from public.save_plan($1::jsonb)', [
        JSON.stringify(planPayload(await day(0))),
      ]);
    const before = await db.admin.query('select * from public.target_plans where user_id = $1', [
      user,
    ]);
    await weigh(user, 68, await db.timestamp('now()'));
    const after = await db.admin.query('select * from public.target_plans where user_id = $1', [
      user,
    ]);
    expect(after).toEqual(before);
  });
});
