import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEDULE } from '../schedule';
import { wallToInstant } from '../time';
import {
  buildDayView,
  resolvePlanForDate,
  summarizeDay,
  summarizeRange,
  type MealRecord,
  type TargetPlanSnapshot,
} from './index';

const TZ = 'Asia/Jerusalem';

function plan(effectiveFrom: string, kcalTarget: number): TargetPlanSnapshot {
  return {
    effectiveFrom,
    kcalTarget,
    kcalFloor: 1200,
    macros: { proteinG: 135, carbsG: 200, fatG: 60 },
    macroState: 'ok',
    schedule: DEFAULT_SCHEDULE,
  };
}

function meal(
  date: string,
  time: string,
  kcal: number,
  extra: Partial<MealRecord> = {},
): MealRecord {
  return {
    id: `${date}-${time}`,
    name: 'meal',
    localDate: date,
    eatenAt: wallToInstant(date, time, TZ),
    slot: 'lunch',
    kcal,
    proteinG: null,
    carbsG: null,
    fatG: null,
    ...extra,
  };
}

describe('daily target snapshot (DB-04, E2E-07)', () => {
  const plans = [plan('2026-10-01', 1800), plan('2026-10-03', 1650)];

  it('keeps history: a change made on day 3 never rewrites days 1 and 2', () => {
    expect(resolvePlanForDate(plans, '2026-10-01')?.kcalTarget).toBe(1800);
    expect(resolvePlanForDate(plans, '2026-10-02')?.kcalTarget).toBe(1800);
    expect(resolvePlanForDate(plans, '2026-10-03')?.kcalTarget).toBe(1650);
    expect(resolvePlanForDate(plans, '2026-10-20')?.kcalTarget).toBe(1650);
  });

  it('has no target before the first plan, whatever order the plans arrive in', () => {
    expect(resolvePlanForDate(plans, '2026-09-30')).toBeNull();
    expect(resolvePlanForDate([...plans].reverse(), '2026-10-02')?.kcalTarget).toBe(1800);
    expect(resolvePlanForDate([], '2026-10-02')).toBeNull();
  });
});

describe('added sugar in the day summary', () => {
  it('adds up the meals that have a value and reports how many do', () => {
    const summary = summarizeDay([
      meal('2026-10-02', '08:00', 300, { addedSugarG: 4.5 }),
      meal('2026-10-02', '13:00', 600, { addedSugarG: 0 }),
      meal('2026-10-02', '16:00', 150),
      meal('2026-10-02', '20:00', 400, { addedSugarG: null }),
    ]);
    expect(summary.addedSugarG).toBe(4.5);
    expect(summary.sugarCoverage).toEqual({ mealsWithSugar: 2, meals: 4 });
  });

  it('ignores deleted meals and rounds away floating-point noise', () => {
    const summary = summarizeDay([
      meal('2026-10-02', '08:00', 300, { addedSugarG: 0.1 }),
      meal('2026-10-02', '09:00', 300, { addedSugarG: 0.2 }),
      meal('2026-10-02', '10:00', 300, { addedSugarG: 50, deletedAt: 1 }),
    ]);
    expect(summary.addedSugarG).toBe(0.3);
    expect(summary.sugarCoverage.meals).toBe(2);
  });

  it('is zero for a day without meals', () => {
    expect(summarizeDay([]).addedSugarG).toBe(0);
  });
});

describe('summarizeDay', () => {
  it('totals calories, per-slot calories and macros, ignoring deleted meals', () => {
    const summary = summarizeDay([
      meal('2026-10-02', '08:00', 400, { slot: 'breakfast', proteinG: 20, carbsG: 40, fatG: 15 }),
      meal('2026-10-02', '13:00', 600, { slot: 'lunch', proteinG: 40, carbsG: 60, fatG: 20 }),
      meal('2026-10-02', '15:00', 300, { deletedAt: 1 }),
    ]);
    expect(summary.mealCount).toBe(2);
    expect(summary.kcal).toBe(1000);
    expect(summary.kcalBySlot.breakfast).toBe(400);
    expect(summary.kcalBySlot.lunch).toBe(600);
    expect(summary.macros).toEqual({ proteinG: 60, carbsG: 100, fatG: 35 });
    expect(summary.macroCoverage).toEqual({ mealsWithMacros: 2, meals: 2 });
  });

  it('reports partial macro coverage instead of pretending the totals are complete', () => {
    const summary = summarizeDay([
      meal('2026-10-02', '08:00', 400, { proteinG: 20, carbsG: 40, fatG: 15 }),
      meal('2026-10-02', '13:00', 600), // calories only
    ]);
    expect(summary.kcal).toBe(1000);
    expect(summary.macros).toEqual({ proteinG: 20, carbsG: 40, fatG: 15 });
    expect(summary.macroCoverage).toEqual({ mealsWithMacros: 1, meals: 2 });
  });
});

describe('buildDayView (UI consistency after edit / delete)', () => {
  const plans = [plan('2026-10-01', 1800)];
  const now = wallToInstant('2026-10-02', '15:30', TZ);
  const meals = [
    meal('2026-10-02', '08:30', 450, { slot: 'breakfast' }),
    meal('2026-10-02', '13:00', 700),
  ];
  const view = (override: Partial<Parameters<typeof buildDayView>[0]> = {}) =>
    buildDayView({ date: '2026-10-02', now, tz: TZ, plans, meals, ...override });

  it("shows today's ring, summary and a recommendation", () => {
    const result = view();
    expect(result.isToday).toBe(true);
    expect(result.target?.kcalTarget).toBe(1800);
    expect(result.summary.kcal).toBe(1150);
    expect(result.ringFraction).toBeCloseTo(1150 / 1800, 10);
    expect(result.recommendation?.consumedKcal).toBe(1150);
  });

  it('ring and recommendation follow an edit and a deletion at once', () => {
    const edited = view({ meals: [meals[0]!, { ...meals[1]!, kcal: 900 }] });
    expect(edited.summary.kcal).toBe(1350);
    expect(edited.recommendation?.remainingKcal).toBe(450);

    const deleted = view({ meals: [meals[0]!, { ...meals[1]!, deletedAt: 123 }] });
    expect(deleted.summary.kcal).toBe(450);
    expect(deleted.recommendation?.remainingKcal).toBe(1350);
  });

  it('uses only meals of the requested local date, as recorded by the server', () => {
    const result = view({
      meals: [...meals, meal('2026-10-01', '20:00', 999), meal('2026-10-03', '08:00', 999)],
    });
    expect(result.summary.kcal).toBe(1150);
  });

  it('gives past days a summary but no advice, and days before any plan no target', () => {
    const past = buildDayView({
      date: '2026-10-01',
      now,
      tz: TZ,
      plans,
      meals: [meal('2026-10-01', '13:00', 500)],
    });
    expect(past.isToday).toBe(false);
    expect(past.recommendation).toBeNull();
    expect(past.summary.kcal).toBe(500);

    const early = buildDayView({
      date: '2026-09-15',
      now,
      tz: TZ,
      plans,
      meals: [meal('2026-09-15', '13:00', 500)],
    });
    expect(early.target).toBeNull();
    expect(early.ringFraction).toBeNull();
    expect(early.summary.kcal).toBe(500);
  });

  it('measures each day against the plan that was in force then', () => {
    const changed = [plan('2026-10-01', 1800), plan('2026-10-02', 1650)];
    const yesterday = buildDayView({
      date: '2026-10-01',
      now,
      tz: TZ,
      plans: changed,
      meals: [meal('2026-10-01', '13:00', 900)],
    });
    expect(yesterday.target?.kcalTarget).toBe(1800);
    expect(yesterday.ringFraction).toBeCloseTo(0.5, 10);
  });
});

describe('summarizeRange (E2E-09)', () => {
  const plans = [plan('2026-10-01', 1800), plan('2026-10-04', 1650)];
  const meals = [
    meal('2026-10-01', '13:00', 1700),
    meal('2026-10-02', '13:00', 1900),
    // 2026-10-03 not logged
    meal('2026-10-04', '13:00', 1600),
  ];
  const range = summarizeRange({ from: '2026-10-01', to: '2026-10-05', plans, meals });

  it('keeps unlogged days out of the average instead of counting them as 0 kcal', () => {
    expect(range.days.map((d) => d.logged)).toEqual([true, true, false, true, false]);
    expect(range.daysLogged).toBe(3);
    expect(range.averageKcalLogged).toBeCloseTo((1700 + 1900 + 1600) / 3, 10);
  });

  it('records the target that applied on each day, including after a plan change', () => {
    expect(range.days.map((d) => d.kcalTarget)).toEqual([1800, 1800, 1800, 1650, 1650]);
  });

  it('has no average when nothing was logged', () => {
    const empty = summarizeRange({ from: '2026-10-01', to: '2026-10-03', plans, meals: [] });
    expect(empty.averageKcalLogged).toBeNull();
    expect(empty.daysLogged).toBe(0);
  });
});
