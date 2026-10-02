import { describe, expect, it } from 'vitest';
import { computeEntry, fillMissingSugar, sumEntries, type FoodEntry } from './compute';
import { ADDED_SUGAR_BANDS, estimateAddedSugar, sugarBand } from './sugar';
import { type FoodRecord } from './types';

const added = (group: string, name: string, sugars: number | null) =>
  estimateAddedSugar({ group, name, sugarsPer100: sugars });

describe('added sugar: what counts and what does not (docs/DIABETES.md)', () => {
  it('whole fresh fruit does not count, however sweet it is', () => {
    expect(added('63', 'תפוח עץ, עם קליפה', 10.4)).toBe(0);
    expect(added('63', 'בננה, טריה', 12.2)).toBe(0);
    expect(added('63', 'אפרסק, טרי', 8.4)).toBe(0); // "אפרסק" contains "רסק" (puree) but is not one
    expect(added('61', 'תפוז, טרי', 9.4)).toBe(0);
  });

  it('dried whole fruit is still the fruit, so it does not count', () => {
    expect(added('62', 'תמרים מיובשים, ללא גלעין', 63.4)).toBe(0);
  });

  it('fruit that was cooked, canned in syrup or sugared counts above its own sugar', () => {
    expect(added('63', 'משמש, מבושל או משומר, בסירופ כבד', 19.9)).toBe(11.9);
    expect(added('63', 'תפוח עץ, רסק תפוחים מבושל, עם סוכר', 14.7)).toBe(6.7);
    expect(added('63', 'תפוח עץ, רסק תפוחים מבושל, ללא תוספת סוכר', 9.4)).toBe(0);
  });

  it('juice counts in full (its sugar is released from the fruit)', () => {
    expect(added('64', 'מיץ תפוחים', 9.6)).toBe(9.6);
  });

  it('the lactose of milk and plain yoghurt does not count; sweetening above it does', () => {
    expect(added('11', 'חלב 3% שומן', 4.6)).toBe(0);
    expect(added('11', 'יוגורט 3% שומן', 4.7)).toBe(0);
    expect(added('11', 'יוגורט 3% שומן, בטעם פאי תפוחים', 16.7)).toBe(12);
    expect(added('11', 'חלב מרוכז, ממותק', 54.4)).toBe(49.7);
    expect(added('14', 'גבינה צהובה 28% שומן', 0.5)).toBe(0);
  });

  it('bread, pasta and rice carry a little sugar of their own', () => {
    expect(added('51', 'לחם לבן, קלוי', 2.5)).toBe(0);
    expect(added('56', 'פסטה מבושלת', 0.8)).toBe(0);
    expect(added('51', 'לחם עם צימוקים וסוכר', 9)).toBe(6);
  });

  it('sweets, cakes, cereals, spreads and sugar itself count in full', () => {
    expect(added('91', 'סוכר, לבן, רגיל', 99.8)).toBe(99.8);
    expect(added('91', 'דבש', 82.1)).toBe(82.1);
    expect(added('53', 'עוגת שמרים במילוי אגוזים', 28)).toBe(28);
    expect(added('57', 'דגני בוקר, צ׳יריוס', 4.4)).toBe(4.4);
    expect(added('83', 'קטשופ עגבניות', 21.7)).toBe(21.7);
    expect(added('92', 'קפה, מוכן טורקי/שחור ממותק', 9.5)).toBe(9.5);
  });

  it('foods whose sugar is their own (vegetables, legumes, meat, nuts) do not count', () => {
    expect(added('74', 'עגבניה, טריה', 2.6)).toBe(0);
    expect(added('75', 'חומוס, גרגירים, מבושלים', 5.3)).toBe(0);
    expect(added('24', 'בשר עוף', 0.1)).toBe(0);
    expect(added('42', 'שקדים קלויים', 4.4)).toBe(0);
    expect(added('42', 'אגוזים מסוכרים', 40)).toBe(40);
  });

  it('is unknown when the total sugars are unknown, and never exceeds the total', () => {
    expect(added('91', 'משהו', null)).toBeNull();
    for (const group of ['11', '51', '53', '61', '62', '64', '74', '91', '92', '99']) {
      const value = added(group, 'ממותק בסירופ', 20);
      expect(value).not.toBeNull();
      expect(value ?? 0).toBeLessThanOrEqual(20);
      expect(value ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts a group it does not know in full, so nothing is hidden by a missing rule', () => {
    expect(added('99', 'מוצר חדש', 12)).toBe(12);
  });
});

describe('the daily bands (the own guidance of the person)', () => {
  it('0-10 g is very low, 10-25 g fits, above 25 g is worth a look', () => {
    expect(ADDED_SUGAR_BANDS).toEqual({ veryLowMaxG: 10, okMaxG: 25 });
    expect(sugarBand(0)).toBe('very_low');
    expect(sugarBand(10)).toBe('very_low');
    expect(sugarBand(10.1)).toBe('ok');
    expect(sugarBand(25)).toBe('ok');
    expect(sugarBand(25.1)).toBe('review');
    expect(sugarBand(80)).toBe('review');
  });

  it('uses other edges when given', () => {
    expect(sugarBand(15, { veryLowMaxG: 5, okMaxG: 12 })).toBe('review');
  });
});

describe('meals saved before sugar was tracked', () => {
  const juice: FoodRecord = {
    id: '3371',
    name: 'מיץ תפוחים',
    kcal100: 48,
    protein100: 0.1,
    carbs100: 12,
    fat100: 0,
    sugar100: 12,
    addedSugar100: 12,
    fiber100: 0.1,
    units: [{ name: 'כוס', grams: 240 }],
  };
  const foods = new Map([[juice.id, juice]]);
  const oldItem: FoodEntry = {
    foodId: '3371',
    name: 'מיץ תפוחים',
    grams: 240,
    kcal: 115,
    proteinG: 0.2,
    carbsG: 28.8,
    fatG: 0,
  };
  const oldMeal = (addedSugarG: number | null, items = [oldItem]) => ({ addedSugarG, items });

  it('gets its sugar from the foods it holds, by food and amount', () => {
    const filled = fillMissingSugar(oldMeal(null), foods);
    expect(filled.addedSugarG).toBe(28.8);
    expect(filled.items[0]).toMatchObject({ sugarG: 28.8, addedSugarG: 28.8, fiberG: 0.2 });
  });

  it('keeps a total the person typed, but still fills the items', () => {
    const filled = fillMissingSugar(oldMeal(5), foods);
    expect(filled.addedSugarG).toBe(5);
    expect(filled.items[0]?.addedSugarG).toBe(28.8);
  });

  it('leaves a food the database no longer knows, and a manual meal, as they are', () => {
    const unknown = oldMeal(null, [{ ...oldItem, foodId: 'gone' }]);
    expect(fillMissingSugar(unknown, foods)).toBe(unknown);
    const manual = oldMeal(null, []);
    expect(fillMissingSugar(manual, foods)).toBe(manual);
  });

  it('counts only the foods it can find, like a new meal does', () => {
    const mixed = oldMeal(null, [oldItem, { ...oldItem, foodId: 'gone', name: 'לא ידוע' }]);
    expect(fillMissingSugar(mixed, foods).addedSugarG).toBe(28.8);
  });

  it('returns the same object when everything is already there', () => {
    const filled = fillMissingSugar(oldMeal(null), foods);
    expect(fillMissingSugar(filled, foods)).toBe(filled);
  });
});

describe('sugar in an amount of food', () => {
  const yogurt: FoodRecord = {
    id: '1',
    name: 'יוגורט בטעם פירות',
    kcal100: 90,
    protein100: 3.5,
    carbs100: 15,
    fat100: 2,
    sugar100: 16.7,
    addedSugar100: 12,
    fiber100: 0.4,
    units: [{ name: 'גביע', grams: 150 }],
  };
  const bread: FoodRecord = {
    id: '2',
    name: 'לחם מלא',
    kcal100: 250,
    protein100: 9,
    carbs100: 45,
    fat100: 3,
    units: [],
  };

  it('scales sugar, added sugar and fiber with the amount, rounded to a tenth', () => {
    const result = computeEntry(yogurt, { kind: 'unit', unit: 'גביע', count: 1 });
    expect(result.ok && result.entry).toMatchObject({ sugarG: 25.1, addedSugarG: 18, fiberG: 0.6 });
  });

  it('leaves the fields out when the database has no value', () => {
    const result = computeEntry(bread, { kind: 'grams', grams: 60 });
    expect(result.ok && 'addedSugarG' in result.entry).toBe(false);
  });

  it('sums a meal, and says how many items had no value', () => {
    const a = computeEntry(yogurt, { kind: 'unit', unit: 'גביע', count: 1 });
    const b = computeEntry(bread, { kind: 'grams', grams: 60 });
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(sumEntries([a.entry, b.entry])).toMatchObject({
      addedSugarG: 18,
      sugarG: 25.1,
      itemsWithoutSugar: 1,
    });
    expect(sumEntries([b.entry])).toMatchObject({ addedSugarG: null, itemsWithoutSugar: 1 });
  });
});
