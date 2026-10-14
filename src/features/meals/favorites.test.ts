import { describe, expect, it } from 'vitest';
import { type FavoriteRecord } from '../../data';
import { manualEntry } from '../../core/food';
import {
  favoriteKey,
  isSavedMeal,
  matchFavorites,
  movedSavedMeal,
  sameManualFavorites,
  sameSavedMeals,
  savedMealItems,
  savedMeals,
} from './favorites';
import { combinedMealsPrefill, savedMealPrefill } from './prefill';

const favorite = (
  id: string,
  name: string,
  overrides: Partial<FavoriteRecord> = {},
): FavoriteRecord => ({
  id,
  name,
  kcal: 100,
  macros: null,
  items: [],
  addedSugarG: null,
  useCount: 0,
  lastUsedAt: null,
  version: 1,
  ...overrides,
});

describe('remembered meals typed by hand', () => {
  it('compares names without caring about spaces or case', () => {
    expect(favoriteKey('  יוגורט   Pro ')).toBe('יוגורט pro');
  });

  const list = [
    favorite('1', 'יוגורט דנונה פרו'),
    favorite('2', 'עוגיות שוקולד', { useCount: 1 }),
    favorite('3', 'שוקולד מריר 70%', { useCount: 5 }),
    favorite('4', 'לחם עם שוקולד'),
  ];

  it('finds the favorites that hold every word typed', () => {
    expect(matchFavorites(list, 'שוקולד').map((f) => f.id)).toEqual(['3', '2', '4']);
    expect(matchFavorites(list, 'עוגיות שוקולד').map((f) => f.id)).toEqual(['2']);
    expect(matchFavorites(list, 'פרו דנונה').map((f) => f.id)).toEqual(['1']);
  });

  it('puts a name that starts with the text first, then the most used', () => {
    expect(matchFavorites(list, 'שוקולד')[0]?.id).toBe('3');
  });

  it('needs at least two letters, and gives nothing when nothing matches', () => {
    expect(matchFavorites(list, 'ש')).toEqual([]);
    expect(matchFavorites(list, 'פיצה')).toEqual([]);
  });

  it('shows at most five', () => {
    const many = Array.from({ length: 9 }, (_, i) => favorite(String(i), `חטיף ${i}`));
    expect(matchFavorites(many, 'חטיף')).toHaveLength(5);
  });

  it('finds the earlier manual favorites of the same name, but not one built from foods', () => {
    const found = sameManualFavorites(
      [
        favorite('a', 'עוגיות'),
        favorite('b', ' עוגיות '),
        favorite('c', 'עוגיות', {
          items: [{ foodId: '1', name: 'x', grams: 10, kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 }],
        }),
        favorite('d', 'עוגה'),
      ],
      'עוגיות',
    );
    expect(found.map((f) => f.id)).toEqual(['a', 'b']);
  });
});

describe('saved meals', () => {
  const food = manualEntry({ id: 'a', name: 'טוסט', kcal: 200, macros: null, addedSugarG: null });
  const meals = [
    favorite('1', 'מזון בודד'), // no foods: a food remembered by name, not a meal
    favorite('2', 'טוסט וקפה', { items: [food], useCount: 1, lastUsedAt: 1000 }),
    favorite('3', 'סלט טונה', { items: [food], useCount: 5, lastUsedAt: 2000 }),
    favorite('4', 'אומלט', { items: [food], useCount: 9, lastUsedAt: null }),
  ];

  it('are the favorites that hold foods', () => {
    expect(meals.map(isSavedMeal)).toEqual([false, true, true, true]);
  });

  it('come with the most recently used first, then the most used', () => {
    expect(savedMeals(meals).map((meal) => meal.id)).toEqual(['3', '2', '4']);
  });

  it('are found again by name, ignoring spaces and case, but never the single foods', () => {
    expect(sameSavedMeals(meals, '  סלט   טונה ').map((meal) => meal.id)).toEqual(['3']);
    expect(sameSavedMeals(meals, 'מזון בודד')).toEqual([]);
  });

  it('keep the foods of a meal of foods, and turn a meal typed by hand into one entry typed by hand', () => {
    const base = { name: 'ארוחת צהריים', kcal: 600, macros: null, addedSugarG: 4 };
    expect(savedMealItems({ ...base, items: [food] }, 'x')).toEqual([food]);
    const [entry, ...rest] = savedMealItems({ ...base, items: [] }, 'x');
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ name: 'ארוחת צהריים', kcal: 600, addedSugarG: 4 });
  });

  it('keep the split of a meal typed by hand into white flour and whole grains', () => {
    const base = {
      name: 'ארוחת צהריים',
      kcal: 600,
      macros: { proteinG: 30, carbsG: 70, fatG: 20 },
      addedSugarG: null,
      refinedCarbsG: 20,
      wholeCarbsG: 35,
    };
    const [entry] = savedMealItems({ ...base, items: [] }, 'x');
    expect(entry).toMatchObject({ refinedCarbsG: 20, wholeCarbsG: 35 });
    const typed = favorite('6', base.name, {
      kcal: 600,
      macros: base.macros,
      refinedCarbsG: 20,
      wholeCarbsG: 35,
      items: savedMealItems({ ...base, items: [] }, 'x'),
    });
    expect(savedMealPrefill(typed)).toMatchObject({ refinedCarbsG: 20, wholeCarbsG: 35 });
  });

  it('come back as they were saved: foods as foods, a meal typed by hand as the by-hand fields', () => {
    const base = { name: 'ארוחת צהריים', kcal: 600, macros: null, addedSugarG: 4 };
    const typed = favorite('5', base.name, {
      kcal: 600,
      addedSugarG: 4,
      items: savedMealItems({ ...base, items: [] }, 'x'),
    });
    expect(savedMealPrefill(typed)).toEqual({
      name: 'ארוחת צהריים',
      kcal: 600,
      macros: null,
      addedSugarG: 4,
      refinedCarbsG: null,
      wholeCarbsG: null,
      source: 'favorite',
      favoriteId: '5',
    });
    const withFoods = savedMealPrefill(meals[1] as ReturnType<typeof favorite>);
    expect(withFoods.items).toEqual([food]);
    expect(withFoods.favoriteId).toBe('2');
  });
});

describe('saved meals sorted by hand', () => {
  const egg = manualEntry({ id: 'e', name: 'ביצה', kcal: 70, macros: null, addedSugarG: null });
  const meal = (id: string, overrides: Partial<FavoriteRecord> = {}) =>
    favorite(id, `ארוחה ${id}`, { items: [egg], ...overrides });

  it('follow the order given by hand; meals never placed come first, the latest used on top', () => {
    const list = [
      meal('a', { sortOrder: 2 }),
      meal('b', { sortOrder: 1 }),
      meal('c', { sortOrder: null, lastUsedAt: 5 }),
      meal('d'),
    ];
    expect(savedMeals(list).map((m) => m.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('move one place up or down, and stay put at either end', () => {
    const list = [meal('a'), meal('b'), meal('c')];
    expect(movedSavedMeal(list, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(movedSavedMeal(list, 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(movedSavedMeal(list, 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(movedSavedMeal(list, 'c', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('several saved meals added together', () => {
  const coffee = manualEntry({
    id: 'c',
    name: 'כוס קפה',
    kcal: 60,
    macros: { proteinG: 3, carbsG: 5, fatG: 3 },
    addedSugarG: 5,
  });
  const bread = {
    foodId: '123',
    name: 'לחם מלא',
    grams: 60,
    unit: 'פרוסה',
    count: 2,
    kcal: 150,
    proteinG: 6,
    carbsG: 27,
    fatG: 1.5,
    addedSugarG: 0,
  };

  it('become one meal with all their foods, under both names', () => {
    const prefill = combinedMealsPrefill([
      favorite('1', 'כוס קפה', { items: [coffee] }),
      favorite('2', '2 פרוסות', { items: [bread], foodDbVersion: 'v1' }),
    ]);
    expect(prefill).toMatchObject({
      name: 'כוס קפה + 2 פרוסות',
      kcal: 210,
      macros: { proteinG: 9, carbsG: 32, fatG: 4.5 },
      addedSugarG: 5,
      items: [coffee, bread],
      source: 'favorite',
      favoriteIds: ['1', '2'],
    });
    expect(prefill?.favoriteId).toBeUndefined();
  });

  it('one meal alone comes back the way it was saved; none gives nothing', () => {
    const one = favorite('1', 'כוס קפה', { items: [coffee] });
    expect(combinedMealsPrefill([one])).toEqual(savedMealPrefill(one));
    expect(combinedMealsPrefill([])).toBeNull();
  });

  it('keep the joined name within the limit', () => {
    const long = 'א'.repeat(50);
    const prefill = combinedMealsPrefill([
      favorite('1', long, { items: [coffee] }),
      favorite('2', long, { items: [bread] }),
    ]);
    expect(prefill?.name.length).toBe(80);
  });
});
