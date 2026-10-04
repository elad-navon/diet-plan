import { describe, expect, it } from 'vitest';
import { grainKind, manualGrain, mealGrainCarbs, summarizeGrain, wholeGrainSwap } from './grain';
import { type FoodRecord } from './types';

const kind = (group: string, name: string, fiber: number | null = null) =>
  grainKind({ group, name, fiberPer100: fiber });

describe('white flour against whole grain (docs/DIABETES.md)', () => {
  it('bread, pita, challah and rolls are white flour unless they say whole', () => {
    expect(kind('51', 'לחם לבן, קלוי', 3.4)).toBe('refined');
    expect(kind('51', 'פיתה, דוידוביץ', 1.9)).toBe('refined');
    expect(kind('51', 'חלה, ברמן, ודש', 3.3)).toBe('refined');
    expect(kind('51', 'לחמניה ביתית, מקמח לבן ושמן סויה', 3)).toBe('refined');
    expect(kind('51', 'לחם מחיטה מלאה, אנגל, לחם חי', 8.4)).toBe('whole');
    expect(kind('51', 'פיתה כפרית מקמח מלא, תנעמי', 6.3)).toBe('whole');
    expect(kind('51', 'לחם שיפון 100%- לחם הארץ', 8.4)).toBe('whole');
    expect(kind('52', 'לחם אחיד, כהה, פרוס', 4)).toBe('whole');
  });

  it('"whole" is a word of its own, and white wording beats fibre', () => {
    expect(kind('51', 'לחם כוסמין מקמח כוסמין מלא/לבן, ביתי', 7)).toBe('whole');
    expect(kind('51', 'לחם קל, לבן', 10.6)).toBe('refined'); // fibre added to white flour
  });

  it('a high fibre content makes bread, crackers and cereal whole-grain-like', () => {
    expect(kind('54', 'קרקר חיטית 5 דגנים, כרמל', 9)).toBe('whole');
    expect(kind('54', 'קרקר עגול/עם מלח, הגביע', 6.3)).toBe('refined');
    expect(kind('57', 'דגני בוקר, FIBER ONE, נסטלה', 47.5)).toBe('whole');
    expect(kind('57', 'דגני בוקר, קורנפלקס, תלמה', 3.6)).toBe('refined');
  });

  it('pasta and white rice are refined; whole pasta, bulgur, quinoa and brown rice are whole', () => {
    expect(kind('56', 'אטריות/פסטה,חיטה, כל הסוגים, לא מבושלות', 3.2)).toBe('refined');
    expect(kind('56', 'אורז לבן מבושל', 0.4)).toBe('refined');
    expect(kind('56', 'אורז, מבושל', 0.5)).toBe('refined');
    expect(kind('56', 'אטריות/פסטה, חיטה מלאה, לא מבושלות', 8.3)).toBe('whole');
    expect(kind('56', 'בורגול, מבושל עם מלח', 4.5)).toBe('whole');
    expect(kind('56', 'קינואה מבושלת עם שמן קנולה', 3)).toBe('whole');
    expect(kind('56', 'אורז חום מבושל', 1.8)).toBe('whole');
  });

  it('a dish whose name only looks like rice with a red sauce is not whole grain', () => {
    expect(kind('56', 'אורז עם רסק עגבניות ובצל מטוגן בשמן סויה, אורז אדום', 0.7)).toBe('refined');
  });

  it('cakes and pastry are refined, and only an explicit "whole" changes that', () => {
    expect(kind('53', 'עוגת גזר עם קמח לבן', 1.6)).toBe('refined');
    expect(kind('53', 'עוגה בחושה, לבנה מקמח כוסמין', 4.4)).toBe('refined'); // spelt in a cake proves nothing
    expect(kind('53', 'עוגת גזר עם קמח מלא', 3.2)).toBe('whole');
    expect(kind('58', 'פיצה בסיסית', 2.4)).toBe('refined');
  });

  it('flours are marked, baking powder and snacks are not', () => {
    expect(kind('50', 'קמח חיטה לבן', 2.7)).toBe('refined');
    expect(kind('50', 'קמח חיטה מלאה', 10.7)).toBe('whole');
    expect(kind('50', 'אבקת אפיה', 0.2)).toBeNull();
    expect(kind('54', 'חטיף בוטנים, במבה, אסם', 5.5)).toBeNull();
    expect(kind('57', 'סיבים תזונתיים, תוסף מזון, בנפייבר', 85)).toBeNull();
  });

  it('foods outside the grain groups get no mark, even with grain words in the name', () => {
    expect(kind('90', 'סנדוויץ׳ בפיתה', 2)).toBeNull();
    expect(kind('75', 'חומוס, גרגירים, מבושלים', 6)).toBeNull();
    expect(kind('24', 'שניצל עוף', 0)).toBeNull();
  });
});

describe('what to try instead of a refined food', () => {
  it('names the whole-grain kind of the same food', () => {
    expect(wholeGrainSwap('לחם לבן, קלוי', '51')).toBe('bread');
    expect(wholeGrainSwap('פיתה, קלויה', '51')).toBe('bread');
    expect(wholeGrainSwap('אטריות/פסטה,חיטה', '56')).toBe('pasta');
    expect(wholeGrainSwap('אורז לבן מבושל', '56')).toBe('rice');
    expect(wholeGrainSwap('דגני בוקר, קורנפלקס', '57')).toBe('cereal');
    expect(wholeGrainSwap('קרקר עגול', '54')).toBe('cracker');
  });

  it('has no suggestion when none is obvious', () => {
    expect(wholeGrainSwap('עוגת גזר עם קמח לבן', '53')).toBeNull();
    expect(wholeGrainSwap('פיצה בסיסית', '58')).toBeNull();
  });
});

describe('white flour and whole grain in a meal and a day', () => {
  const food = (
    id: string,
    grain?: 'refined' | 'whole',
    swap?: FoodRecord['swap'],
  ): FoodRecord => ({
    id,
    name: id,
    kcal100: 250,
    protein100: 8,
    carbs100: 50,
    fat100: 2,
    units: [],
    ...(grain ? { grain } : {}),
    ...(swap ? { swap } : {}),
  });
  const foods = new Map([
    ['white', food('white', 'refined', 'bread')],
    ['pasta', food('pasta', 'refined', 'pasta')],
    ['whole', food('whole', 'whole')],
    ['egg', food('egg')],
  ]);
  const item = (foodId: string, carbsG: number) => ({ foodId, carbsG });

  it('adds up the carbohydrate of each kind, and ignores unmarked and unknown foods', () => {
    expect(
      mealGrainCarbs(
        [item('white', 20.4), item('whole', 15), item('egg', 1), item('gone', 9)],
        foods,
      ),
    ).toEqual({ refinedCarbsG: 20.4, wholeCarbsG: 15 });
  });

  it('sums a day and lists the swaps, the biggest source of white flour first', () => {
    const day = summarizeGrain(
      [{ items: [item('white', 20)] }, { items: [item('pasta', 40), item('whole', 10)] }],
      foods,
    );
    expect(day).toEqual({ refinedCarbsG: 60, wholeCarbsG: 10, swaps: ['pasta', 'bread'] });
  });

  it('is empty for meals without foods from the database', () => {
    expect(summarizeGrain([{ items: [] }], foods)).toEqual({
      refinedCarbsG: 0,
      wholeCarbsG: 0,
      swaps: [],
    });
  });

  it('counts a meal typed by hand by its name, with the carbohydrate typed for it', () => {
    const day = summarizeGrain(
      [
        { name: 'לחם מחיטה מלאה עם גבינה', carbsG: 30, items: [] },
        { name: 'פסטה ברוטב עגבניות', carbsG: 60, items: [] },
        { name: 'סלט ירקות', carbsG: 8, items: [] },
        { name: 'לחם מלא', carbsG: null, items: [] },
      ],
      foods,
    );
    expect(day).toEqual({ refinedCarbsG: 60, wholeCarbsG: 30, swaps: ['pasta'] });
  });

  it('counts a food typed by hand inside a meal of database foods', () => {
    const day = summarizeGrain(
      [
        {
          name: 'ארוחת בוקר',
          carbsG: 40,
          items: [
            item('egg', 1),
            { foodId: 'manual:a', name: 'פיתה מקמח מלא', carbsG: 25 },
            { foodId: 'manual:b', name: 'אורז', carbsG: 0 },
          ],
        },
      ],
      foods,
    );
    expect(day).toEqual({ refinedCarbsG: 0, wholeCarbsG: 25, swaps: [] });
  });
});

describe('a food or meal typed by hand (manualGrain)', () => {
  it('reads whole wheat and rye bread as whole grain, with Hebrew prefixes and plurals', () => {
    expect(manualGrain('לחם מחיטה מלאה')?.kind).toBe('whole');
    expect(manualGrain('כריך בלחם שיפון')?.kind).toBe('whole');
    expect(manualGrain('2 פרוסות של הלחם המלא')?.kind).toBe('whole');
    expect(manualGrain('פיתות מקמח מלא')?.kind).toBe('whole');
    expect(manualGrain('דייסת שיבולת שועל')?.kind).toBe('whole');
  });

  it('"whole" beats the white cheese on the bread', () => {
    expect(manualGrain('לחם מלא עם גבינה לבנה')?.kind).toBe('whole');
  });

  it('reads plain bread, pasta and rice as white flour, with the swap to suggest', () => {
    expect(manualGrain('לחם עם חמאה')).toEqual({ kind: 'refined', swap: 'bread' });
    expect(manualGrain('פסטה בולונז')).toEqual({ kind: 'refined', swap: 'pasta' });
    expect(manualGrain('אורז עם עוף')).toEqual({ kind: 'refined', swap: 'rice' });
    expect(manualGrain('קרקרים וגבינה')).toEqual({ kind: 'refined', swap: 'cracker' });
    expect(manualGrain('קורנפלקס עם חלב')).toEqual({ kind: 'refined', swap: 'cereal' });
    expect(manualGrain('אורז חום')?.kind).toBe('whole');
  });

  it('says nothing when the name has no grain word', () => {
    expect(manualGrain('סלט ירקות')).toBeNull();
    expect(manualGrain('חלב מלא')).toBeNull();
    expect(manualGrain('כריך טונה')).toBeNull();
    expect(manualGrain('שוקולד כהה')).toBeNull();
  });
});

describe('a split typed by hand', () => {
  const foods = new Map<string, FoodRecord>();

  it('counts the grams the person typed, whatever the name says', () => {
    const day = summarizeGrain(
      [
        // The name says whole bread, but the person typed what is really white flour and what is whole.
        {
          name: 'לחם מלא עם ריבה',
          carbsG: 50,
          refinedCarbsG: 20,
          wholeCarbsG: 25,
          items: [],
        },
        { name: 'ארוחת צהריים', carbsG: 60, refinedCarbsG: null, wholeCarbsG: 35, items: [] },
      ],
      foods,
    );
    expect(day).toEqual({ refinedCarbsG: 20, wholeCarbsG: 60, swaps: ['bread'] });
  });

  it('leaves the rest of the carbohydrate (fruit, sugar...) out of both', () => {
    const day = summarizeGrain(
      [{ name: 'פסטה ופרי', carbsG: 80, refinedCarbsG: 30, wholeCarbsG: null, items: [] }],
      foods,
    );
    expect(day).toEqual({ refinedCarbsG: 30, wholeCarbsG: 0, swaps: ['pasta'] });
  });

  it('a typed split of 0 and 0 means none of it is grain, even with "לחם" in the name', () => {
    const day = summarizeGrain(
      [{ name: 'לחם ופירות', carbsG: 50, refinedCarbsG: 0, wholeCarbsG: 0, items: [] }],
      foods,
    );
    expect(day).toEqual({ refinedCarbsG: 0, wholeCarbsG: 0, swaps: [] });
  });

  it('counts the split of a food typed by hand inside a meal of foods', () => {
    const day = summarizeGrain(
      [
        {
          items: [
            {
              foodId: 'manual:a',
              name: 'כריך ביתי',
              carbsG: 45,
              refinedCarbsG: 10,
              wholeCarbsG: 30,
            },
          ],
        },
      ],
      foods,
    );
    expect(day).toEqual({ refinedCarbsG: 10, wholeCarbsG: 30, swaps: ['bread'] });
  });
});
