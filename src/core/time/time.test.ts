import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  ageOn,
  dayEnd,
  dayLengthMinutes,
  dayOfWeek,
  dayStart,
  diffDays,
  elapsedMinutes,
  fixedClock,
  formatInstant,
  fromEpochDay,
  isValidLocalDate,
  isValidTimeZone,
  localDateOf,
  localTimeOf,
  parseInstant,
  offsetClock,
  offsetMinutesAt,
  startOfWeek,
  toEpochDay,
  wallToInstant,
} from './index';

const JERUSALEM = 'Asia/Jerusalem';
const iso = (value: string): number => Date.parse(value);

describe('calendar-date arithmetic', () => {
  it('handles leap years, month ends and year ends (TIME-08)', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(diffDays('2028-03-01', '2028-02-28')).toBe(2);
    expect(diffDays('2026-03-01', '2026-02-28')).toBe(1);
  });

  it('rejects impossible dates', () => {
    for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-1-1', 'abc', '2026-04-31']) {
      expect(isValidLocalDate(bad), bad).toBe(false);
    }
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(() => addDays('2026-02-29', 1)).toThrow(RangeError);
  });

  it('knows the day of week and starts weeks on Sunday (docs D-13)', () => {
    expect(dayOfWeek('2026-10-01')).toBe(4); // Thursday
    expect(dayOfWeek('2026-09-27')).toBe(0); // Sunday
    expect(startOfWeek('2026-10-01')).toBe('2026-09-27');
    expect(startOfWeek('2026-09-27')).toBe('2026-09-27');
    expect(startOfWeek('2027-01-02')).toBe('2026-12-27'); // week crossing the year boundary
  });

  it('computes age; a Feb 29 birthday turns a year older on Mar 1 in non-leap years (NUT-09)', () => {
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25);
    expect(ageOn('2000-02-29', '2026-03-01')).toBe(26);
    expect(ageOn('2000-02-29', '2028-02-28')).toBe(27);
    expect(ageOn('2000-02-29', '2028-02-29')).toBe(28);
    expect(ageOn('1990-06-15', '2026-06-14')).toBe(35);
    expect(ageOn('1990-06-15', '2026-06-15')).toBe(36);
  });

  it('round-trips epoch days over a wide range', () => {
    fc.assert(
      fc.property(fc.integer({ min: -200_000, max: 200_000 }), (epochDay) => {
        const date = fromEpochDay(epochDay);
        expect(isValidLocalDate(date)).toBe(true);
        expect(toEpochDay(date)).toBe(epochDay);
        expect(diffDays(addDays(date, 7), date)).toBe(7);
        expect(dayOfWeek(addDays(date, 7))).toBe(dayOfWeek(date));
      }),
    );
  });
});

describe('clocks', () => {
  it('fixes and shifts time', () => {
    const clock = fixedClock(1_000);
    expect(clock.now()).toBe(1_000);
    expect(offsetClock(clock, -250).now()).toBe(750);
  });
});

describe('time zones', () => {
  it('validates IANA ids', () => {
    expect(isValidTimeZone(JERUSALEM)).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });

  it('reports UTC offsets, including a half-hour DST shift', () => {
    expect(offsetMinutesAt(iso('2026-01-15T12:00:00Z'), JERUSALEM)).toBe(120);
    expect(offsetMinutesAt(iso('2026-07-15T12:00:00Z'), JERUSALEM)).toBe(180);
    expect(offsetMinutesAt(iso('2026-07-15T12:00:00Z'), 'Australia/Lord_Howe')).toBe(630);
    expect(offsetMinutesAt(iso('2026-12-15T12:00:00Z'), 'Australia/Lord_Howe')).toBe(660);
  });
});

describe('day boundaries (TIME-01, TIME-02)', () => {
  it('puts 23:59:59.999 in day D and 00:00:00.000 in D+1', () => {
    expect(localDateOf(iso('2026-06-15T20:59:59.999Z'), JERUSALEM)).toBe('2026-06-15');
    expect(localDateOf(iso('2026-06-15T21:00:00.000Z'), JERUSALEM)).toBe('2026-06-16');
  });

  it('treats 00:01 as the new day', () => {
    const meal = wallToInstant('2026-06-16', '00:01', JERUSALEM);
    expect(localDateOf(meal, JERUSALEM)).toBe('2026-06-16');
    expect(localTimeOf(meal, JERUSALEM)).toBe('00:01');
  });

  it('rolls over month and year ends in local time', () => {
    expect(localDateOf(iso('2026-12-31T22:30:00Z'), JERUSALEM)).toBe('2027-01-01'); // 00:30 local
    expect(localDateOf(iso('2026-12-31T21:30:00Z'), JERUSALEM)).toBe('2026-12-31'); // 23:30 local
    expect(localDateOf(iso('2028-02-29T21:59:00Z'), JERUSALEM)).toBe('2028-02-29');
    expect(localDateOf(iso('2028-02-29T22:00:00Z'), JERUSALEM)).toBe('2028-03-01');
  });

  it('derives the same date from a different zone for the same instant', () => {
    const instant = iso('2026-06-15T21:30:00Z');
    expect(localDateOf(instant, JERUSALEM)).toBe('2026-06-16'); // 00:30
    expect(localDateOf(instant, 'America/New_York')).toBe('2026-06-15'); // 17:30
  });
});

describe('DST: Israel (TIME-03, TIME-04)', () => {
  it('spring forward 2026-03-27 is a 23-hour day and 02:30 (skipped) resolves to 03:30', () => {
    expect(dayStart('2026-03-27', JERUSALEM)).toBe(iso('2026-03-26T22:00:00Z'));
    expect(dayEnd('2026-03-27', JERUSALEM)).toBe(iso('2026-03-27T21:00:00Z'));
    expect(dayLengthMinutes('2026-03-27', JERUSALEM)).toBe(1380);

    const skipped = wallToInstant('2026-03-27', '02:30', JERUSALEM);
    expect(skipped).toBe(iso('2026-03-27T00:30:00Z'));
    expect(localTimeOf(skipped, JERUSALEM)).toBe('03:30');
    expect(localDateOf(skipped, JERUSALEM)).toBe('2026-03-27');
  });

  it('fall back 2026-10-25 is a 25-hour day and 01:30 (twice) resolves to the first occurrence', () => {
    expect(dayStart('2026-10-25', JERUSALEM)).toBe(iso('2026-10-24T21:00:00Z'));
    expect(dayEnd('2026-10-25', JERUSALEM)).toBe(iso('2026-10-25T22:00:00Z'));
    expect(dayLengthMinutes('2026-10-25', JERUSALEM)).toBe(1500);

    const first = wallToInstant('2026-10-25', '01:30', JERUSALEM);
    expect(first).toBe(iso('2026-10-24T22:30:00Z'));

    // The second 01:30 is a different instant on the same local date.
    const second = iso('2026-10-24T23:30:00Z');
    expect(second).not.toBe(first);
    expect(localDateOf(second, JERUSALEM)).toBe('2026-10-25');
    expect(localTimeOf(second, JERUSALEM)).toBe('01:30');
  });

  it('measures elapsed minutes, not wall-clock minutes, on a 25-hour day', () => {
    // Wall time 02:00 comes 180 real minutes after 00:00 on 2026-10-25 (01:00 happens twice).
    const twoOClock = iso('2026-10-25T00:00:00Z');
    expect(localTimeOf(twoOClock, JERUSALEM)).toBe('02:00');
    expect(elapsedMinutes(twoOClock, '2026-10-25', JERUSALEM)).toBe(180);
  });

  it('keeps 00:00 of the following day correct after the change', () => {
    expect(localDateOf(dayStart('2026-10-26', JERUSALEM), JERUSALEM)).toBe('2026-10-26');
    expect(dayLengthMinutes('2026-10-26', JERUSALEM)).toBe(1440);
  });
});

describe('DST: unusual zones (TIME-05)', () => {
  it('handles a 30-minute DST shift (Lord Howe)', () => {
    expect(dayLengthMinutes('2026-10-04', 'Australia/Lord_Howe')).toBe(1410);
    expect(dayLengthMinutes('2026-04-05', 'Australia/Lord_Howe')).toBe(1470);
  });

  it('handles a zone whose DST starts at midnight, skipping 00:00 (Beirut)', () => {
    const start = dayStart('2026-03-29', 'Asia/Beirut');
    expect(localDateOf(start, 'Asia/Beirut')).toBe('2026-03-29');
    expect(localDateOf(start - 1, 'Asia/Beirut')).toBe('2026-03-28');
    expect(localTimeOf(start, 'Asia/Beirut')).toBe('01:00');
    expect(dayLengthMinutes('2026-03-29', 'Asia/Beirut')).toBe(1380);
  });

  it('handles New York DST on its own dates', () => {
    expect(dayLengthMinutes('2026-03-08', 'America/New_York')).toBe(1380);
    expect(dayLengthMinutes('2026-11-01', 'America/New_York')).toBe(1500);
  });
});

describe('time input validation', () => {
  it('rejects malformed wall times', () => {
    for (const bad of ['24:00', '12:60', '7:30', 'noon', '']) {
      expect(() => wallToInstant('2026-06-15', bad, JERUSALEM), bad).toThrow(RangeError);
    }
  });
});

describe('properties across zones (TIME-05)', () => {
  const zones = [
    JERUSALEM,
    'America/New_York',
    'Europe/London',
    'Australia/Lord_Howe',
    'Asia/Beirut',
    'Asia/Kolkata',
    'UTC',
  ];
  const zoneArb = fc.constantFrom(...zones);
  const dateArb = fc
    .integer({ min: toEpochDay('2024-01-01'), max: toEpochDay('2030-12-31') })
    .map(fromEpochDay);
  const instantArb = fc.integer({
    min: iso('2024-01-01T00:00:00Z'),
    max: iso('2030-12-31T23:59:59Z'),
  });

  it('dayStart is the first instant of the date and the previous instant is the day before', () => {
    fc.assert(
      fc.property(dateArb, zoneArb, (date, tz) => {
        const start = dayStart(date, tz);
        expect(localDateOf(start, tz)).toBe(date);
        expect(localDateOf(start - 1, tz)).toBe(addDays(date, -1));
      }),
      { numRuns: 400 },
    );
  });

  it('every day is between 23 and 25 hours long', () => {
    fc.assert(
      fc.property(dateArb, zoneArb, (date, tz) => {
        const length = dayLengthMinutes(date, tz);
        expect(length).toBeGreaterThanOrEqual(1380);
        expect(length).toBeLessThanOrEqual(1500);
      }),
      { numRuns: 400 },
    );
  });

  it('wall time round-trips, except that a repeated hour maps to its first occurrence', () => {
    fc.assert(
      fc.property(instantArb, zoneArb, (instant, tz) => {
        const flooredToMinute = Math.floor(instant / 60_000) * 60_000;
        const back = wallToInstant(localDateOf(instant, tz), localTimeOf(instant, tz), tz);
        const earlierBy = flooredToMinute - back;
        // Equal, or the instant was in the second pass of a repeated hour (60 min, or 30 for Lord Howe).
        expect([0, 30 * 60_000, 60 * 60_000]).toContain(earlierBy);
        expect(localDateOf(back, tz)).toBe(localDateOf(flooredToMinute, tz));
      }),
      { numRuns: 400 },
    );
  });
});

describe('server timestamps', () => {
  it('formats an instant as ISO UTC and reads it back exactly', () => {
    const instant = iso('2026-10-25T01:30:00.123Z');
    expect(formatInstant(instant)).toBe('2026-10-25T01:30:00.123Z');
    expect(parseInstant(formatInstant(instant))).toBe(instant);
  });

  it('reads the formats PostgREST returns (offset, short fractions)', () => {
    expect(parseInstant('2026-10-01T19:42:23.15+00:00')).toBe(iso('2026-10-01T19:42:23.150Z'));
    expect(parseInstant('2026-10-01T22:42:23+03:00')).toBe(iso('2026-10-01T19:42:23Z'));
  });

  it('rejects text that is not a timestamp', () => {
    expect(() => parseInstant('yesterday')).toThrow(RangeError);
  });
});
