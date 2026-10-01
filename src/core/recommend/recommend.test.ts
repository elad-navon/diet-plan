import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEDULE, inferSlot, slotWindows, type MealSlot } from '../schedule';
import { dayStart, wallToInstant } from '../time';
import {
  RECOMMEND_CONFIG,
  recommendNext,
  type MealCandidate,
  type MealForRecommendation,
  type RecommendInput,
} from './index';

const TZ = 'Asia/Jerusalem';
const DATE = '2026-10-02';
const K = 1800;

const at = (time: string): number => wallToInstant(DATE, time, TZ);
const windows = slotWindows(DEFAULT_SCHEDULE, DATE, TZ);

function meal(
  time: string,
  kcal: number,
  extra: Partial<MealForRecommendation> = {},
): MealForRecommendation {
  const eatenAt = at(time);
  return {
    eatenAt,
    slot: inferSlot(eatenAt, windows),
    kcal,
    proteinG: null,
    carbsG: null,
    fatG: null,
    ...extra,
  };
}

function candidate(
  id: string,
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  slots: MealCandidate['slots'] = [],
  tags: readonly string[] = [],
): MealCandidate {
  return {
    id,
    name: id,
    slots,
    kcal,
    proteinG,
    carbsG,
    fatG,
    tags,
    minPortionFactor: 0.5,
    maxPortionFactor: 1.5,
  };
}

const LIBRARY: MealCandidate[] = [
  candidate('eggs-toast', 350, 20, 25, 18, ['breakfast']),
  candidate('cottage-bread', 300, 22, 30, 8, ['breakfast', 'snack'], ['dairy']),
  candidate('chicken-rice', 600, 45, 65, 14, ['lunch', 'dinner']),
  candidate('hummus-pita', 450, 18, 60, 14, ['lunch', 'snack']),
  candidate('yogurt-fruit', 180, 12, 25, 3, ['snack']),
  candidate('salad-tuna', 320, 30, 12, 16, ['lunch', 'dinner']),
  candidate('nuts', 190, 6, 6, 17, ['snack']),
  candidate('shakshuka', 420, 22, 30, 22, ['breakfast', 'dinner']),
];

const base: Omit<RecommendInput, 'now' | 'meals'> = {
  tz: TZ,
  date: DATE,
  schedule: DEFAULT_SCHEDULE,
  kcalTarget: K,
  kcalFloor: 1200,
  macros: null,
  candidates: LIBRARY,
};

function run(
  time: string,
  meals: MealForRecommendation[],
  overrides: Partial<RecommendInput> = {},
) {
  return recommendNext({ ...base, now: at(time), meals, ...overrides });
}

const budgetOf = (result: ReturnType<typeof run>, slot: string): number | undefined =>
  result.budgets.find((b) => b.slot === slot)?.budgetKcal;

describe('R1: nothing eaten, mid-morning (REC-01)', () => {
  const result = run('10:00', []);

  it('is behind, and spreads the whole day over the remaining slots', () => {
    expect(result.status).toBe('behind');
    expect(result.corridor).toEqual({ lowerKcal: 450, upperKcal: 450 });
    expect(result.toleranceKcal).toBeCloseTo(108, 10);
    expect(budgetOf(result, 'lunch')).toBeCloseTo(720, 6);
    expect(budgetOf(result, 'snack')).toBeCloseTo(360, 6);
    expect(budgetOf(result, 'dinner')).toBeCloseTo(720, 6);
    expect(result.budgets.map((b) => b.slot)).toEqual(['lunch', 'snack', 'dinner']);
    expect(result.unallocatedKcal).toBeCloseTo(0, 6);
  });

  it('points at lunch, at the start of its window, with ideas that fit the budget', () => {
    expect(result.next?.slot).toBe('lunch');
    expect(result.next?.suggestedAt).toBe(at('12:30'));
    expect(result.next?.suggestions).toHaveLength(3);
    for (const suggestion of result.next?.suggestions ?? []) {
      expect(suggestion.kcal).toBeLessThanOrEqual(720 + 1e-6);
    }
  });
});

describe('on track (REC-02)', () => {
  it('a normal breakfast eaten on time is on track', () => {
    const result = run('08:30', [meal('08:15', 450)]);
    expect(result.status).toBe('on_track');
    expect(result.budgets.map((b) => b.slot)).toEqual(['lunch', 'snack', 'dinner']);
  });
});

describe('R2: a very large breakfast (REC-03)', () => {
  it('is ahead, and the rest of the day shrinks to what is left', () => {
    const result = run('09:00', [meal('08:45', 900)]);
    expect(result.status).toBe('ahead');
    expect(budgetOf(result, 'lunch')).toBeCloseTo(360, 6);
    expect(budgetOf(result, 'snack')).toBeCloseTo(180, 6);
    expect(budgetOf(result, 'dinner')).toBeCloseTo(360, 6);
  });
});

describe('R3: over the daily target (REC-04)', () => {
  const result = run('16:00', [
    meal('08:00', 650),
    meal('13:00', 900),
    meal('15:30', 400, { slot: 'snack' }),
  ]);

  it('offers no calories at all and never suggests making up for it', () => {
    expect(result.status).toBe('over_budget');
    expect(result.remainingKcal).toBe(-150);
    expect(result.budgets).toEqual([]);
    expect(result.next).toBeNull();
    expect(result.notes).not.toContain('excess_large'); // 1950 is far below 1.5x
  });
});

describe('R4: end of day (REC-05)', () => {
  it('after the last window an optional light snack is capped, never a meal', () => {
    const result = run('21:30', [meal('08:30', 450), meal('13:00', 540), meal('19:30', 510)]);
    expect(result.status).toBe('day_complete');
    expect(result.next?.slot).toBeNull();
    expect(result.next?.optional).toBe(true);
    expect(result.next?.budgetKcal).toBeCloseTo(300, 6); // min(300 left, 20% of 1800)
    for (const suggestion of result.next?.suggestions ?? []) {
      expect(suggestion.kcal).toBeLessThanOrEqual(300 + 1e-6);
    }
  });

  it('with less than the minimum left there is no suggestion at all', () => {
    const result = run('21:30', [meal('08:30', 450), meal('13:00', 540), meal('19:30', 710)]);
    expect(result.remainingKcal).toBe(100);
    expect(result.next).toBeNull();
  });

  it('adds a neutral note (not praise) when the day ended below the safe minimum', () => {
    const result = run('22:00', [meal('08:30', 300)]);
    expect(result.status).toBe('day_complete');
    expect(result.notes).toContain('below_safe_floor');
    expect(result.next?.budgetKcal).toBeCloseTo(360, 6); // capped at 20% of the target
  });
});

describe('R5: two meals skipped (REC-07)', () => {
  const result = run('18:30', []);

  it('caps dinner and does not push the user to catch up', () => {
    expect(result.status).toBe('behind');
    expect(result.budgets.map((b) => b.slot)).toEqual(['dinner']);
    expect(budgetOf(result, 'dinner')).toBeCloseTo(810, 6); // min(1.5 x 540, 45% of 1800)
    expect(result.unallocatedKcal).toBeCloseTo(990, 6);
    expect(result.notes).toContain('skipped_meals');
  });
});

describe('R6: unusual meal times (REC-09)', () => {
  it('an early breakfast is not "ahead of schedule"', () => {
    const result = run('06:30', [meal('06:30', 400)]);
    expect(result.status).toBe('on_track');
    expect(result.next).not.toBeNull();
  });

  it('a 3 a.m. snack counts towards the day but does not use up a slot', () => {
    const early = meal('03:00', 100);
    expect(early.slot).toBe('other');
    const result = run('07:00', [early]);
    expect(result.consumedKcal).toBe(100);
    expect(result.budgets[0]?.slot).toBe('breakfast');
  });
});

describe('R7: the result depends only on its input (REC-10)', () => {
  const a = meal('08:30', 450);
  const b = meal('13:00', 540);
  const c = meal('15:00', 200);

  it('adding, deleting and re-adding a meal leaves no trace', () => {
    const before = run('15:30', [a, b]);
    const withC = run('15:30', [a, b, c]);
    expect(withC).not.toEqual(before);
    expect(run('15:30', [a, b])).toEqual(before); // "deleted" again
    expect(run('15:30', [a, b, c])).toEqual(withC);
  });

  it('is independent of the order meals are listed in', () => {
    expect(run('15:30', [c, a, b])).toEqual(run('15:30', [a, b, c]));
  });
});

describe('large excess and missing data', () => {
  it('flags an implausibly large day for a data-entry check (REC-11)', () => {
    const result = run('18:00', [meal('08:00', 1800), meal('13:00', 2000), meal('15:00', 1700)]);
    expect(result.status).toBe('over_budget');
    expect(result.notes).toContain('excess_large');
    expect(result.next).toBeNull();
  });

  it('works with meals that have no macro data (REC-08)', () => {
    const result = run('12:00', [meal('08:00', 450)], {
      macros: { proteinG: 130, carbsG: 180, fatG: 55 },
    });
    expect(result.next?.suggestions.length).toBeGreaterThan(0);
  });

  it('prefers protein-dense ideas when protein is lagging behind calories', () => {
    const lagging = run('12:00', [meal('08:00', 450, { proteinG: 5, carbsG: 70, fatG: 12 })], {
      macros: { proteinG: 135, carbsG: 200, fatG: 60 },
    });
    const top = lagging.next?.suggestions[0];
    expect(top).toBeDefined();
    expect((top!.proteinG * 4) / top!.kcal).toBeGreaterThanOrEqual(
      RECOMMEND_CONFIG.proteinDensityMin,
    );
  });

  it('says so when no idea fits', () => {
    const result = run('10:00', [], { candidates: [] });
    expect(result.next?.suggestions).toEqual([]);
    expect(result.notes).toContain('no_suggestions_fit');
  });
});

describe('personalization seams (REC-12)', () => {
  it('lets a filter remove ideas and a scorer boost favorites without changing the engine', () => {
    const noDairy = run('13:30', [meal('08:30', 450)], {
      filters: [(c) => !c.tags.includes('dairy')],
    });
    const all = [...(noDairy.next?.suggestions ?? [])].map((s) => s.candidateId);
    expect(all).not.toContain('cottage-bread');

    const favorites = run('10:00', [], {
      candidates: [...LIBRARY, candidate('mom-soup', 400, 20, 40, 10, ['lunch'], ['favorite'])],
      scorers: [(c) => (c.tags.includes('favorite') ? 5 : 0)],
    });
    expect(favorites.next?.suggestions[0]?.candidateId).toBe('mom-soup');
  });
});

describe('property: never recommends the impossible (REC-06)', () => {
  const slotArb = fc.constantFrom<MealSlot>('breakfast', 'lunch', 'snack', 'dinner', 'other');
  const dayBegin = dayStart(DATE, TZ);

  it('keeps every budget and suggestion within what is left', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1439 }),
        fc.integer({ min: 1200, max: 4000 }),
        fc.array(
          fc.record({
            minute: fc.integer({ min: 0, max: 1439 }),
            kcal: fc.integer({ min: 0, max: 1500 }),
            slot: slotArb,
          }),
          { maxLength: 8 },
        ),
        (nowMinute, kcalTarget, rawMeals) => {
          const meals: MealForRecommendation[] = rawMeals.map((m) => ({
            eatenAt: dayBegin + m.minute * 60_000,
            slot: m.slot,
            kcal: m.kcal,
            proteinG: null,
            carbsG: null,
            fatG: null,
          }));
          const result = recommendNext({
            ...base,
            kcalTarget,
            now: dayBegin + nowMinute * 60_000,
            meals,
          });

          const remaining = Math.max(0, result.remainingKcal);
          const budgetSum = result.budgets.reduce((s, b) => s + b.budgetKcal, 0);
          expect(budgetSum).toBeLessThanOrEqual(remaining + 1e-6);
          expect(result.unallocatedKcal).toBeGreaterThanOrEqual(0);
          for (const budget of result.budgets) {
            expect(budget.budgetKcal).toBeGreaterThanOrEqual(0);
            expect(budget.budgetKcal).toBeLessThanOrEqual(
              Math.min(
                RECOMMEND_CONFIG.capFactor * budget.plannedKcal,
                RECOMMEND_CONFIG.capFractionOfTarget * kcalTarget,
              ) + 1e-6,
            );
            expect(budget.windowEnd).toBeGreaterThan(dayBegin + nowMinute * 60_000);
          }
          expect(result.status === 'over_budget').toBe(result.consumedKcal > kcalTarget);
          if (result.status === 'over_budget') {
            expect(result.budgets).toEqual([]);
            expect(result.next).toBeNull();
          }
          if (result.remainingKcal < RECOMMEND_CONFIG.minRecommendKcal) {
            expect(result.next).toBeNull();
          }
          if (result.next) {
            expect(result.next.budgetKcal).toBeLessThanOrEqual(remaining + 1e-6);
            for (const s of result.next.suggestions) {
              expect(s.kcal).toBeLessThanOrEqual(result.next.budgetKcal + 1e-6);
              expect(s.portionFactor).toBeGreaterThanOrEqual(0.5);
              expect(s.portionFactor).toBeLessThanOrEqual(1.5);
              expect(Math.round(s.portionFactor * 4)).toBeCloseTo(s.portionFactor * 4, 9);
            }
          }
        },
      ),
      { numRuns: 1500 },
    );
  });
});
