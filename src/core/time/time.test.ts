import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  ageOn,
  dayEnd,
  dayLengthMinutes,
  dayOfWeek,
  dayStart,
  dayTimeToInstant,
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
  // A day of eating runs from 02:00 to 02:00: the hours after midnight are the end of the day before.
  it('puts 01:59:59.999 in day D and 02:00:00.000 in D+1', () => {
    expect(localDateOf(iso('2026-06-15T22:59:59.999Z'), JERUSALEM)).toBe('2026-06-15'); // 01:59:59 on the 16th
    expect(localDateOf(iso('2026-06-15T23:00:00.000Z'), JERUSALEM)).toBe('2026-06-16'); // 02:00 on the 16th
  });

  it('keeps midnight in the day before: 00:01 is still the night of the previous day', () => {
    const meal = wallToInstant('2026-06-16', '00:01', JERUSALEM);
    expect(localDateOf(meal, JERUSALEM)).toBe('2026-06-15');
    expect(localTimeOf(meal, JERUSALEM)).toBe('00:01');
    expect(dayTimeToInstant('2026-06-15', '00:01', JERUSALEM)).toBe(meal);
  });

  it('puts a wall-clock time on the right calendar date of its day', () => {
    expect(dayTimeToInstant('2026-06-15', '13:00', JERUSALEM)).toBe(iso('2026-06-15T10:00:00Z'));
    expect(dayTimeToInstant('2026-06-15', '01:59', JERUSALEM)).toBe(iso('2026-06-15T22:59:00Z')); // the 16th
    expect(dayTimeToInstant('2026-06-15', '02:00', JERUSALEM)).toBe(iso('2026-06-14T23:00:00Z')); // the 15th
  });

  it('rolls over month and year ends in local time', () => {
    expect(localDateOf(iso('2026-12-31T22:30:00Z'), JERUSALEM)).toBe('2026-12-31'); // 00:30 on 1 January
    expect(localDateOf(iso('2026-12-31T21:30:00Z'), JERUSALEM)).toBe('2026-12-31'); // 23:30 local
    expect(localDateOf(iso('2026-12-31T23:59:00Z'), JERUSALEM)).toBe('2026-12-31'); // 01:59 on 1 January
    expect(localDateOf(iso('2027-01-01T00:00:00Z'), JERUSALEM)).toBe('2027-01-01'); // 02:00
    expect(localDateOf(iso('2028-02-29T22:00:00Z'), JERUSALEM)).toBe('2028-02-29'); // 00:00 on 1 March
    expect(localDateOf(iso('2028-03-01T00:00:00Z'), JERUSALEM)).toBe('2028-03-01'); // 02:00
  });

  it('derives a different day from a different zone for the same instant', () => {
    const instant = iso('2026-06-15T23:30:00Z');
    expect(localDateOf(instant, JERUSALEM)).toBe('2026-06-16'); // 02:30
    expect(localDateOf(instant, 'America/New_York')).toBe('2026-06-15'); // 19:30
  });
});

describe('DST: Israel (TIME-03, TIME-04)', () => {
  it('spring forward 2026-03-27 is a 23-hour day and 02:30 (skipped) resolves to 03:30', () => {
    // The clocks jump at 02:00, exactly where the day starts: the day begins at 03:00, after the gap.
    expect(dayStart('2026-03-27', JERUSALEM)).toBe(iso('2026-03-27T00:00:00Z'));
    expect(dayEnd('2026-03-27', JERUSALEM)).toBe(iso('2026-03-27T23:00:00Z'));
    expect(dayLengthMinutes('2026-03-27', JERUSALEM)).toBe(1380);

    const skipped = wallToInstant('2026-03-27', '02:30', JERUSALEM);
    expect(skipped).toBe(iso('2026-03-27T00:30:00Z'));
    expect(localTimeOf(skipped, JERUSALEM)).toBe('03:30');
    expect(localDateOf(skipped, JERUSALEM)).toBe('2026-03-27');
  });

  it('fall back 2026-10-25: the 25-hour day is the 24th, and 01:30 (twice) belongs to it', () => {
    expect(dayStart('2026-10-24', JERUSALEM)).toBe(iso('2026-10-23T23:00:00Z'));
    expect(dayEnd('2026-10-24', JERUSALEM)).toBe(iso('2026-10-25T00:00:00Z'));
    expect(dayLengthMinutes('2026-10-24', JERUSALEM)).toBe(1500);
    expect(dayLengthMinutes('2026-10-25', JERUSALEM)).toBe(1440);

    const first = wallToInstant('2026-10-25', '01:30', JERUSALEM);
    expect(first).toBe(iso('2026-10-24T22:30:00Z'));

    // The second 01:30 is a different instant, and both are the end of the same day: the 24th.
    const second = iso('2026-10-24T23:30:00Z');
    expect(second).not.toBe(first);
    expect(localDateOf(first, JERUSALEM)).toBe('2026-10-24');
    expect(localDateOf(second, JERUSALEM)).toBe('2026-10-24');
    expect(localTimeOf(second, JERUSALEM)).toBe('01:30');
    expect(dayTimeToInstant('2026-10-24', '01:30', JERUSALEM)).toBe(first);
  });

  it('measures elapsed minutes, not wall-clock minutes, on a 25-hour day', () => {
    // The second 01:30 comes 24.5 real hours after 02:00 of the 24th, though the clock only read 23.5 hours.
    const second = iso('2026-10-24T23:30:00Z');
    expect(elapsedMinutes(second, '2026-10-24', JERUSALEM)).toBe(1470);
  });

  it('keeps the start of the following day correct after the change', () => {
    expect(localDateOf(dayStart('2026-10-26', JERUSALEM), JERUSALEM)).toBe('2026-10-26');
    expect(dayLengthMinutes('2026-10-26', JERUSALEM)).toBe(1440);
  });
});

describe('DST: unusual zones (TIME-05)', () => {
  it('handles a 30-minute DST shift (Lord Howe)', () => {
    expect(dayLengthMinutes('2026-10-04', 'Australia/Lord_Howe')).toBe(1410);
    expect(dayLengthMinutes('2026-04-04', 'Australia/Lord_Howe')).toBe(1470);
  });

  it('is not troubled by a zone whose DST skips midnight (Beirut): the skipped hour is in the day before', () => {
    const start = dayStart('2026-03-29', 'Asia/Beirut');
    expect(localDateOf(start, 'Asia/Beirut')).toBe('2026-03-29');
    expect(localDateOf(start - 1, 'Asia/Beirut')).toBe('2026-03-28');
    expect(localTimeOf(start, 'Asia/Beirut')).toBe('02:00');
    expect(dayLengthMinutes('2026-03-28', 'Asia/Beirut')).toBe(1380);
    expect(dayLengthMinutes('2026-03-29', 'Asia/Beirut')).toBe(1440);
  });

  it('handles New York DST on its own dates', () => {
    expect(dayLengthMinutes('2026-03-08', 'America/New_York')).toBe(1380);
    expect(dayLengthMinutes('2026-10-31', 'America/New_York')).toBe(1500);
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
        const back = dayTimeToInstant(localDateOf(instant, tz), localTimeOf(instant, tz), tz);
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
