import { describe, expect, it } from 'vitest';
import { type StoredMeal } from '../../data';
import { copiedMealPrefill } from './prefill';

const stored = (overrides: Partial<StoredMeal> = {}): StoredMeal => ({
  id: 'm1',
  name: 'עוף ואורז',
  localDate: '2026-10-01',
  eatenAt: 0,
  tz: 'Asia/Jerusalem',
  slot: 'lunch',
  kcal: 620,
  proteinG: 45,
  carbsG: 65,
  fatG: 14,
  items: [],
  addedSugarG: 0,
  source: 'manual',
  version: 3,
  enteredAt: 0,
  deletedAt: null,
  ...overrides,
});

describe('copying a meal of another day', () => {
  it('a meal typed by hand comes back as its numbers, marked as a copy, with no slot of its own', () => {
    const prefill = copiedMealPrefill(stored({ refinedCarbsG: 40, wholeCarbsG: null }));
    expect(prefill).toEqual({
      name: 'עוף ואורז',
      kcal: 620,
      macros: { proteinG: 45, carbsG: 65, fatG: 14 },
      addedSugarG: 0,
      refinedCarbsG: 40,
      wholeCarbsG: null,
      source: 'copy',
    });
  });

  it('a meal of foods comes back with its foods; a meal without macros has none', () => {
    const egg = {
      foodId: '1',
      name: 'ביצה',
      grams: 50,
      kcal: 71,
      proteinG: 6,
      carbsG: 0,
      fatG: 5,
    };
    const prefill = copiedMealPrefill(
      stored({ items: [egg], proteinG: null, foodDbVersion: 'v2', addedSugarG: null }),
    );
    expect(prefill.items).toEqual([egg]);
    expect(prefill.macros).toBeNull();
    expect(prefill.addedSugarG).toBeNull();
    expect(prefill.foodDbVersion).toBe('v2');
    expect(prefill.slot).toBeUndefined();
  });
});
