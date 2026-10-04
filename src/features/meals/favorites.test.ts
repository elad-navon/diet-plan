import { describe, expect, it } from 'vitest';
import { type FavoriteRecord } from '../../data';
import { manualEntry } from '../../core/food';
import {
  favoriteKey,
  isSavedMeal,
  matchFavorites,
  sameManualFavorites,
  sameSavedMeals,
  savedMealItems,
  savedMeals,
} from './favorites';
import { savedMealPrefill } from './prefill';

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
