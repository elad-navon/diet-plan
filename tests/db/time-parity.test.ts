import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, dayStart, localDateOf, type Instant, type LocalDate } from '../../src/core/time';
import { createTestDb, type TestDb } from './harness';

/**
 * TIME-05: the app (TypeScript) and the server (Postgres) must agree on which day an instant belongs to,
 * above all around daylight-saving changes. The server's answer is the one that is stored, so a disagreement
 * would show a meal on one day and count it on another.
 *
 * The corpus is every day boundary (and the moments next to it) for three years, in five zones chosen for
 * their awkward rules: Israel (our users), New York, London, Lord Howe (30-minute DST) and Beirut (DST that
 * skips midnight itself).
 */

const ZONES = [
  'Asia/Jerusalem',
  'America/New_York',
  'Europe/London',
  'Australia/Lord_Howe',
  'Asia/Beirut',
];
const FIRST_DAY: LocalDate = '2026-01-01';
const DAYS = 3 * 366;
const NEIGHBOURS_MS = [-3_600_000, -1, 0, 1, 3_600_000];

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('TIME-05: TypeScript and Postgres agree on the local date', () => {
  it('for the moments around every day boundary, 2026-2028, in five zones', async () => {
    const corpus: { ms: Instant; tz: string }[] = [];
    for (const tz of ZONES) {
      for (let i = 0; i < DAYS; i += 1) {
        const boundary = dayStart(addDays(FIRST_DAY, i), tz);
        for (const delta of NEIGHBOURS_MS) corpus.push({ ms: boundary + delta, tz });
      }
    }

    const rows = await db.admin.query<{ ms: string; tz: string; d: string }>(
      `select ms::text, tz, (((to_timestamp(ms / 1000.0) at time zone tz) - interval '2 hours')::date)::text as d
       from jsonb_to_recordset($1::jsonb) as t(ms bigint, tz text)`,
      [JSON.stringify(corpus)],
    );

    expect(rows).toHaveLength(corpus.length);
    const mismatches = rows
      .filter((row) => localDateOf(Number(row.ms), row.tz) !== row.d)
      .slice(0, 10)
      .map(
        (row) =>
          `${row.tz} @${row.ms}: server ${row.d}, app ${localDateOf(Number(row.ms), row.tz)}`,
      );
    expect(mismatches).toEqual([]);
  }, 120_000);

  it('the instant just before a day starts belongs to the previous day on both sides', () => {
    for (const tz of ZONES) {
      for (let i = 1; i < DAYS; i += 1) {
        const date = addDays(FIRST_DAY, i);
        expect(localDateOf(dayStart(date, tz), tz)).toBe(date);
        expect(localDateOf(dayStart(date, tz) - 1, tz)).toBe(addDays(date, -1));
      }
    }
  });
});
