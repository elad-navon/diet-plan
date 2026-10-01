import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEDULE } from '../schedule';
import { dayStart, wallToInstant } from '../time';
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
    eatenAt: wallToInstant(date, time, tz),
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

  it('shows 06:00-23:00 with the corridor and no meals', () => {
    expect(model.domain).toEqual({ startMinute: 360, endMinute: 1380 });
    expect(model.meals).toEqual([]);
    expect(model.totalKcal).toBe(0);
    expect(model.overByKcal).toBe(0);
    expect(model.eaten[0]).toEqual({ minute: 360, kcal: 0 });
    expect(model.eaten.at(-1)).toEqual({ minute: 600, kcal: 0 }); // runs up to "now" (10:00)
    expect(model.now).toEqual({ minute: 600, kcal: 0 });
  });

  it('draws the corridor as a staircase of expected calories', () => {
    expect(model.corridor).toEqual([
      { minute: 360, lowerKcal: 0, upperKcal: 0 },
      { minute: 390, lowerKcal: 0, upperKcal: 450 }, // 06:30: breakfast may start
      { minute: 570, lowerKcal: 450, upperKcal: 450 }, // 09:30: breakfast window over
      { minute: 690, lowerKcal: 450, upperKcal: 990 }, // 11:30: lunch may start
      { minute: 870, lowerKcal: 990, upperKcal: 990 },
      { minute: 900, lowerKcal: 990, upperKcal: 1260 },
      { minute: 1050, lowerKcal: 1260, upperKcal: 1260 },
      { minute: 1080, lowerKcal: 1260, upperKcal: 1800 },
      { minute: 1260, lowerKcal: 1800, upperKcal: 1800 },
    ]);
    expect(model.bands.map((b) => [b.slot, b.startMinute, b.endMinute])).toEqual([
      ['breakfast', 450, 570],
      ['lunch', 750, 870],
      ['snack', 960, 1050],
      ['dinner', 1140, 1260],
    ]);
  });

  it('labels the axis every three hours', () => {
    expect(model.ticks.map((t) => t.label)).toEqual([
      '06:00',
      '09:00',
      '12:00',
      '15:00',
      '18:00',
      '21:00',
    ]);
  });
});

describe('meals (CHART-02, CHART-04)', () => {
  it('draws each meal as a jump at its time and keeps a running total', () => {
    const model = chart('15:30', [meal('13:00', 700), meal('08:30', 450)]); // given out of order
    expect(model.meals.map((m) => [m.minute, m.kcal, m.cumulativeKcal])).toEqual([
      [510, 450, 450],
      [780, 700, 1150],
    ]);
    expect(model.eaten).toEqual([
      { minute: 360, kcal: 0 },
      { minute: 510, kcal: 0 },
      { minute: 510, kcal: 450 },
      { minute: 780, kcal: 450 },
      { minute: 780, kcal: 1150 },
      { minute: 930, kcal: 1150 },
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

  it('widens the visible window for a midnight meal and a 23:59 meal', () => {
    const midnight = chart('08:00', [meal('00:00', 150)]);
    expect(midnight.domain.startMinute).toBe(0);
    expect(midnight.meals[0]?.minute).toBe(0);

    const late = chart('23:59', [meal('23:59', 150)]);
    expect(late.domain.endMinute).toBe(1440);
    expect(late.meals[0]?.minute).toBe(1439);
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
    expect(model.eaten.at(-1)).toEqual({ minute: 1380, kcal: 700 });
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
    expect(model.next).toEqual({ minute: 750, slot: 'lunch', fromKcal: 450, toKcal: 1170 });
  });
});

describe('DST days (CHART-05, TIME-04)', () => {
  it('follows elapsed minutes on a 25-hour day: wall 23:00 is minute 1440, not 1380', () => {
    const model = buildDayChart({
      date: '2026-10-25',
      tz: TZ,
      now: wallToInstant('2026-10-25', '12:00', TZ),
      plan,
      meals: [],
      next: null,
    });
    expect(model.dayLengthMinutes).toBe(1500);
    expect(model.domain.endMinute).toBe(1440);
    // 06:00 wall is 7 elapsed hours after midnight on this day (01:00 happens twice).
    expect(model.domain.startMinute).toBe(420);
  });

  it('places both 01:30 meals of a fall-back night at their own times', () => {
    const date = '2026-10-25';
    const first = wallToInstant(date, '01:30', TZ);
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
      ['first', 90],
      ['second', 150],
    ]);
  });

  it('is shorter on a spring-forward day', () => {
    const model = buildDayChart({
      date: '2026-03-27',
      tz: TZ,
      now: wallToInstant('2026-03-27', '12:00', TZ),
      plan,
      meals: [],
      next: null,
    });
    expect(model.dayLengthMinutes).toBe(1380);
    expect(model.domain.endMinute).toBe(1320); // wall 23:00 is minute 1320 after the lost hour
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
