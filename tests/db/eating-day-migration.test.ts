import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

/**
 * The migration that moves the start of the day from midnight to 02:00 must also move the data already saved:
 * a meal at 00:30 was saved on that calendar date and now belongs to the day before. This sets up rows the way
 * the old rule saved them (with the triggers switched off, since the triggers now apply the new rule), runs the
 * migration again, and looks at what it did.
 */

const MIGRATION = new URL(
  '../../supabase/migrations/20261004000000_eating_day.sql',
  import.meta.url,
);

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

/** Saves rows exactly as given, without the triggers that would derive the date. */
async function saveAsIs(sql: string): Promise<void> {
  await db.pg.exec(
    `set session_replication_role = replica; ${sql}; set session_replication_role = origin;`,
  );
}

describe('the eating-day migration, on data saved under the old rule', () => {
  it('moves a meal between midnight and 02:00 to the day before, and leaves the others', async () => {
    const user = await db.newUserWithProfile('Asia/Jerusalem');
    await saveAsIs(
      `insert into public.meals (id, user_id, eaten_at, tz, local_date, slot, name, kcal, source)
       values ('${randomUUID()}', '${user}', '2026-10-02T21:30:00Z', 'Asia/Jerusalem', '2026-10-03', 'other', 'late', 200, 'manual'),
              ('${randomUUID()}', '${user}', '2026-10-03T10:00:00Z', 'Asia/Jerusalem', '2026-10-03', 'lunch', 'noon', 300, 'manual')`,
    );
    const before = await db.admin.query<{ name: string; local_date: string }>(
      `select name, local_date::text from public.meals where user_id = $1 order by name`,
      [user],
    );
    expect(before.map((row) => row.local_date)).toEqual(['2026-10-03', '2026-10-03']); // as the old rule left them

    await db.pg.exec(readFileSync(MIGRATION, 'utf8'));

    const rows = await db.admin.query<{ name: string; local_date: string }>(
      `select name, local_date::text from public.meals where user_id = $1 order by name`,
      [user],
    );
    expect(rows).toEqual([
      { name: 'late', local_date: '2026-10-02' }, // 00:30 on the 3rd is the end of the 2nd
      { name: 'noon', local_date: '2026-10-03' },
    ]);
  });

  it('moves a weigh-in too, unless that day already has one', async () => {
    const user = await db.newUserWithProfile('Asia/Jerusalem');
    const weigh = (at: string, date: string, kg: number): string =>
      `insert into public.weight_entries (id, user_id, measured_at, tz, local_date, weight_kg)
       values ('${randomUUID()}', '${user}', '${at}', 'Asia/Jerusalem', '${date}', ${kg})`;
    // 01:00 on the 6th (old date: the 6th), and an evening weigh-in on the 5th: the 01:00 one would now fall on
    // the 5th as well, where there is already one, so it stays on the 6th. And 01:00 on the 8th, with nothing on
    // the 7th: it moves to the 7th.
    await saveAsIs(
      [
        weigh('2026-09-05T22:00:00Z', '2026-09-06', 70.4),
        weigh('2026-09-05T17:00:00Z', '2026-09-05', 70.9),
        weigh('2026-09-07T22:00:00Z', '2026-09-08', 70.2),
      ].join('; '),
    );

    await db.pg.exec(readFileSync(MIGRATION, 'utf8'));

    const rows = await db.admin.query<{ weight_kg: string; local_date: string }>(
      `select weight_kg::text, local_date::text from public.weight_entries where user_id = $1 order by weight_kg`,
      [user],
    );
    expect(rows).toEqual([
      { weight_kg: '70.2', local_date: '2026-09-07' },
      { weight_kg: '70.4', local_date: '2026-09-06' },
      { weight_kg: '70.9', local_date: '2026-09-05' },
    ]);
  });
});
