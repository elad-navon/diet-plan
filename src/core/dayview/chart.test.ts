import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEDULE } from '../schedule';
import { dayStart, dayTimeToInstant, wallToInstant } from '../time';
import { buildDayChart, type DayChartInput, type DayChartModel } from './chart';
import { type MealRecord } from './dayview';

const TZ = 'Asia/Jerusalem';
const DATE = '2026-10-02';
const plan = { kcalTarget: 1800, schedule: DEFAULT_SCHEDULE };

function meal(
  time: string,
  kcal: number,
  id = `${DATE}-${time}`,
  date = DATE,
  tz = TZ,
): MealRecord {
  return {
    id,
    name: `meal ${time}`,
    localDate: date,
    eatenAt: dayTimeToInstant(date, time, tz),
    slot: 'lunch',
    kcal,
    proteinG: null,
    carbsG: null,
    fatG: null,
  };
}

function chart(
  nowTime: string,
  meals: MealRecord[] = [],
  extra: Partial<DayChartInput> = {},
): DayChartModel {
  return buildDayChart({
    date: DATE,
    tz: TZ,
    now: wallToInstant(DATE, nowTime, TZ),
    plan,
    meals,
    next: null,
    ...extra,
  });
}

describe('empty day (CHART-01)', () => {
  const model = chart('10:00');

  it('shows 08:00 to 02:00 with the corridor and no meals', () => {
    // The day runs 02:00 to 02:00, so 08:00 is minute 360 and the end of the day is minute 1440.
    expect(model.domain).toEqual({ startMinute: 360, endMinute: 1440 });
    expect(model.meals).toEqual([]);
    expect(model.totalKcal).toBe(0);
    expect(model.overByKcal).toBe(0);
    expect(model.eaten[0]).toEqual({ minute: 360, kcal: 0 });
    expect(model.eaten.at(-1)).toEqual({ minute: 480, kcal: 0 }); // runs up to "now" (10:00)
    expect(model.now).toEqual({ minute: 480, kcal: 0 });
  });

  it('draws the corridor as a staircase of expected calories', () => {
    expect(model.corridor).toEqual([
      { minute: 360, lowerKcal: 0, upperKcal: 450 }, // 08:00: breakfast may already have started
      { minute: 450, lowerKcal: 450, upperKcal: 450 }, // 09:30: breakfast window over
      { minute: 570, lowerKcal: 450, upperKcal: 990 }, // 11:30: lunch may start
      { minute: 750, lowerKcal: 990, upperKcal: 990 },
      { minute: 780, lowerKcal: 990, upperKcal: 1260 },
      { minute: 930, lowerKcal: 1260, upperKcal: 1260 },
      { minute: 960, lowerKcal: 1260, upperKcal: 1800 },
      { minute: 1140, lowerKcal: 1800, upperKcal: 1800 },
    ]);
    expect(model.bands.map((b) => [b.slot, b.startMinute, b.endMinute])).toEqual([
      ['breakfast', 330, 450],
      ['lunch', 630, 750],
      ['snack', 840, 930],
      ['dinner', 1020, 1140],
    ]);
  });

  it('draws the recommended path: rising through each meal window, flat in between', () => {
    expect(model.plan).toEqual([
      { minute: 360, kcal: 0 }, // 08:00: breakfast is already under way
      { minute: 450, kcal: 450 },
      { minute: 630, kcal: 450 },
      { minute: 750, kcal: 990 },
      { minute: 840, kcal: 990 },
      { minute: 930, kcal: 1260 },
      { minute: 1020, kcal: 1260 },
      { minute: 1140, kcal: 1800 }, // the whole target, by the end of the last window
      { minute: 1440, kcal: 1800 },
    ]);
  });

  it('labels the axis every three hours', () => {
    expect(model.ticks.map((t) => t.label)).toEqual([
      '08:00',
      '11:00',
      '14:00',
      '17:00',
      '20:00',
      '23:00',
      '02:00',
    ]);
  });
});

describe('meals (CHART-02, CHART-04)', () => {
  it('draws each meal as a jump at its time and keeps a running total', () => {
    const model = chart('15:30', [meal('13:00', 700), meal('08:30', 450)]); // given out of order
    expect(model.meals.map((m) => [m.minute, m.kcal, m.cumulativeKcal])).toEqual([
      [390, 450, 450],
      [660, 700, 1150],
    ]);
    expect(model.eaten).toEqual([
      { minute: 360, kcal: 0 },
      { minute: 390, kcal: 0 },
      { minute: 390, kcal: 450 },
      { minute: 660, kcal: 450 },
      { minute: 660, kcal: 1150 },
      { minute: 810, kcal: 1150 },
    ]);
    expect(model.totalKcal).toBe(1150);
  });

  it('ignores deleted meals', () => {
    const model = chart('15:30', [meal('13:00', 700), { ...meal('08:30', 450), deletedAt: 1 }]);
    expect(model.meals).toHaveLength(1);
    expect(model.totalKcal).toBe(700);
  });

  it('handles many small meals in one hour without breaking the staircase', () => {
    const many = Array.from({ length: 15 }, (_, i) => meal('12:30', 20, `m${i}`));
    const model = chart('13:00', many);
    expect(model.totalKcal).toBe(300);
    expect(model.meals).toHaveLength(15);
    const minutes = model.eaten.map((p) => p.minute);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  it('widens the visible window for a meal at the start of the day and one in the small hours', () => {
    const early = chart('08:00', [meal('02:00', 150)]); // the first minute of the day
    expect(early.domain.startMinute).toBe(0);
    expect(early.meals[0]?.minute).toBe(0);

    const lateNight = chart('23:59', [meal('01:30', 150)]); // 01:30 of the next date: the end of this day
    expect(lateNight.domain.endMinute).toBe(1440);
    expect(lateNight.meals[0]?.minute).toBe(1410);
  });

  it('is a plain summary for a back-dated day: no "now", eaten line runs to the end', () => {
    const model = buildDayChart({
      date: '2026-10-01',
      tz: TZ,
      now: wallToInstant(DATE, '10:00', TZ),
      plan,
      meals: [meal('13:00', 700, 'a', '2026-10-01')],
      next: null,
    });
    expect(model.now).toBeNull();
    expect(model.eaten.at(-1)).toEqual({ minute: 1440, kcal: 700 });
  });
});

describe('over the target (CHART-03)', () => {
  it('extends the axis and reports the excess', () => {
    const model = chart('19:00', [meal('13:00', 2100)]);
    expect(model.yMax).toBe(2400);
    expect(model.overByKcal).toBe(300);
    expect(model.clippedAtMax).toBe(false);
  });

  it('cuts a very large excess at twice the target instead of squashing the chart', () => {
    const model = chart('19:00', [meal('13:00', 2900), meal('14:00', 1500)]);
    expect(model.totalKcal).toBe(4400);
    expect(model.yMax).toBe(3600);
    expect(model.clippedAtMax).toBe(true);
    expect(model.overByKcal).toBe(2600);
  });

  it('keeps room above the target line on a normal day', () => {
    expect(chart('10:00').yMax).toBe(2200); // 1800 x 1.15 rounded up to a clean step
  });
});

describe('the suggested next meal', () => {
  it('is drawn from what was eaten up to what is still available', () => {
    const next = {
      slot: 'lunch' as const,
      optional: false,
      budgetKcal: 720,
      suggestedAt: wallToInstant(DATE, '12:30', TZ),
      suggestions: [],
    };
    const model = chart('10:00', [meal('08:30', 450)], { next });
    expect(model.next).toEqual({ minute: 630, slot: 'lunch', fromKcal: 450, toKcal: 1170 });
  });
});

describe('DST days (CHART-05, TIME-04)', () => {
  it('follows elapsed minutes on the 25-hour day: it is the 24th, its end is minute 1500', () => {
    const model = buildDayChart({
      date: '2026-10-24',
      tz: TZ,
      now: wallToInstant('2026-10-24', '12:00', TZ),
      plan,
      meals: [],
      next: null,
    });
    expect(model.dayLengthMinutes).toBe(1500);
    expect(model.domain).toEqual({ startMinute: 360, endMinute: 1500 });
  });

  it('places both 01:30 meals of the fall-back night at their own times, at the end of the 24th', () => {
    const date = '2026-10-24';
    const first = dayTimeToInstant(date, '01:30', TZ);
    const second = first + 60 * MINUTE;
    const mk = (eatenAt: number, id: string): MealRecord => ({
      ...meal('01:30', 100, id, date),
      eatenAt,
    });
    const model = buildDayChart({
      date,
      tz: TZ,
      now: wallToInstant(date, '12:00', TZ),
      plan,
      meals: [mk(second, 'second'), mk(first, 'first')],
      next: null,
    });
    expect(model.meals.map((m) => [m.id, m.minute])).toEqual([
      ['first', 1410],
      ['second', 1470],
    ]);
  });

  it('is shorter on a spring-forward day: it starts after the skipped hour', () => {
    const model = buildDayChart({
      date: '2026-03-27',
      tz: TZ,
      now: wallToInstant('2026-03-27', '12:00', TZ),
      plan,
      meals: [],
      next: null,
    });
    expect(model.dayLengthMinutes).toBe(1380);
    expect(model.domain).toEqual({ startMinute: 300, endMinute: 1380 }); // 08:00 is 5 real hours after 03:00
  });
});

const MINUTE = 60_000;

describe('property: the geometry is always drawable (CHART-02)', () => {
  it('keeps points ordered, inside the domain, and the corridor valid', () => {
    const begin = dayStart(DATE, TZ);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1439 }),
        fc.array(
          fc.record({
            minute: fc.integer({ min: 0, max: 1439 }),
            kcal: fc.integer({ min: 0, max: 3000 }),
          }),
          { maxLength: 12 },
        ),
        (nowMinute, raw) => {
          const meals = raw.map((m, i) => ({
            ...meal('12:00', m.kcal, `m${i}`),
            eatenAt: begin + m.minute * MINUTE,
          }));
          const model = buildDayChart({
            date: DATE,
            tz: TZ,
            now: begin + nowMinute * MINUTE,
            plan,
            meals,
            next: null,
          });
          const { startMinute, endMinute } = model.domain;
          expect(endMinute - startMinute).toBeGreaterThanOrEqual(360);
          expect(startMinute).toBeGreaterThanOrEqual(0);
          expect(endMinute).toBeLessThanOrEqual(model.dayLengthMinutes);
          for (let i = 1; i < model.eaten.length; i += 1) {
            expect(model.eaten[i]!.minute).toBeGreaterThanOrEqual(model.eaten[i - 1]!.minute);
            expect(model.eaten[i]!.kcal).toBeGreaterThanOrEqual(model.eaten[i - 1]!.kcal);
          }
          for (const point of model.eaten) {
            expect(point.minute).toBeGreaterThanOrEqual(startMinute);
            expect(point.minute).toBeLessThanOrEqual(endMinute);
          }
          for (const step of model.corridor) {
            expect(step.lowerKcal).toBeLessThanOrEqual(step.upperKcal);
            expect(step.minute).toBeGreaterThanOrEqual(startMinute);
            expect(step.minute).toBeLessThanOrEqual(endMinute);
          }
          for (let i = 0; i < model.plan.length; i += 1) {
            const point = model.plan[i]!;
            expect(point.minute).toBeGreaterThanOrEqual(startMinute);
            expect(point.minute).toBeLessThanOrEqual(endMinute);
            if (i > 0) {
              expect(point.minute).toBeGreaterThanOrEqual(model.plan[i - 1]!.minute);
              expect(point.kcal).toBeGreaterThanOrEqual(model.plan[i - 1]!.kcal);
            }
          }
          expect(model.yMax).toBeGreaterThanOrEqual(plan.kcalTarget);
          expect(model.yMax).toBeLessThanOrEqual(3600);
          expect(model.totalKcal).toBe(meals.reduce((s, m) => s + m.kcal, 0));
          expect(model.clippedAtMax).toBe(model.totalKcal > model.yMax);
        },
      ),
      { numRuns: 500 },
    );
  });
});
