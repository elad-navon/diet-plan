import { describe, expect, it } from 'vitest';
import { checkLabelValues, parseLabel } from './label';

const lines = (...rows: string[]): string => rows.join('\n');

describe('parseLabel', () => {
  it('reads a table copied from a web page (name and number on one line, or a tab between them)', () => {
    const reading = parseLabel(
      lines(
        'סימון תזונתי ל-100 גרם',
        'אנרגיה (קלוריות)\t150',
        'חלבונים (גרם) 10',
        'סך הפחמימות (גרם)\t20',
        'מתוכן סוכרים (גרם)\t5',
        'סך השומנים (גרם)\t3',
      ),
    );
    expect(reading.values).toEqual({ kcal: 150, protein: 10, carbs: 20, sugar: 5, fat: 3 });
    expect(reading.basis).toBe('g');
    expect(reading.issues).toEqual([]);
  });

  it('pairs names and numbers by order when Lens lists them apart', () => {
    const reading = parseLabel(
      lines(
        'סימון תזונתי ב-100 גרם',
        'אנרגיה',
        'חלבונים',
        'פחמימות',
        'שומנים',
        '90',
        '3',
        '12',
        '2.5',
      ),
    );
    expect(reading.values).toEqual({ kcal: 90, protein: 3, carbs: 12, fat: 2.5 });
  });

  it('reads 100 ml labels', () => {
    const reading = parseLabel(
      lines(
        'ערכים תזונתיים ב-100 מ"ל',
        'אנרגיה 42',
        'חלבונים 0',
        'פחמימות 10.6',
        'סוכרים 10.6',
        'שומנים 0',
      ),
    );
    expect(reading.basis).toBe('ml');
    expect(reading.values.carbs).toBe(10.6);
  });

  it('takes the heading line "ב-100 גרם" that Lens put on its own line as part of the heading', () => {
    const reading = parseLabel(
      lines(
        'סימון תזונתי',
        'ב-100 גרם',
        'אנרגיה',
        '50',
        'חלבונים',
        '1',
        'פחמימות',
        '10',
        'שומנים',
        '0',
      ),
    );
    expect(reading.basis).toBe('g');
    expect(reading.values).toEqual({ kcal: 50, protein: 1, carbs: 10, fat: 0 });
  });

  it('accepts a decimal comma', () => {
    expect(
      parseLabel(
        lines('סימון תזונתי ב-100 גרם', 'אנרגיה 99', 'חלבונים 2,5', 'פחמימות 1', 'שומנים 9'),
      ).values.protein,
    ).toBe(2.5);
  });

  it('marks a value written as "פחות מ" as worth a look', () => {
    const reading = parseLabel(
      lines(
        'סימון תזונתי ב-100 גרם',
        'אנרגיה 20',
        'חלבונים 4',
        'פחמימות 1',
        'שומנים',
        'פחות מ-0.5',
      ),
    );
    expect(reading.values.fat).toBe(0.5);
    expect(reading.doubtful).toEqual(['fat']);
  });

  it('ignores %-of-daily-value numbers', () => {
    const reading = parseLabel(
      lines(
        "סימון תזונתי עבור 100 ג'",
        'אנרגיה',
        '200 קק"ל',
        'שומנים',
        '15%',
        "10 ג'",
        'פחמימות',
        '7%',
        "20 ג'",
        'חלבונים',
        "5 ג'",
      ),
    );
    expect(reading.values).toEqual({ kcal: 200, fat: 10, carbs: 20, protein: 5 });
  });

  it('does not guess when there are fewer numbers than rows', () => {
    const reading = parseLabel(
      lines('סימון תזונתי ב-100 גרם', 'אנרגיה', 'חלבונים', 'פחמימות', 'שומנים', '90', '3', '12'),
    );
    expect(reading.values).toEqual({});
    expect(reading.issues).toEqual(['count_mismatch']);
    expect(reading.doubtful).toEqual(['kcal', 'protein', 'carbs', 'fat']);
  });

  it('says when there is no heading, and still reads the rows', () => {
    const reading = parseLabel(
      lines('משקל נטו 500 גרם', 'אנרגיה 100', 'חלבונים 1', 'פחמימות 2', 'שומנים 3'),
    );
    expect(reading.issues).toEqual(['no_header']);
    expect(reading.basis).toBeNull();
    expect(reading.values).toEqual({ kcal: 100, protein: 1, carbs: 2, fat: 3 });
  });

  it('says when the text has no table at all', () => {
    expect(parseLabel('רכיבים: מים, קמח, מלח').issues).toContain('no_rows');
  });

  it('reads added sugar as its own value, apart from the sugars', () => {
    const reading = parseLabel(
      lines(
        'סימון תזונתי ב-100 גרם',
        'אנרגיה 400',
        'פחמימות 60',
        'סוכרים 30',
        'מתוכם סוכרים מוספים 25',
        'חלבונים 5',
        'שומנים 15',
      ),
    );
    expect(reading.values.sugar).toBe(30);
    expect(reading.values.addedSugar).toBe(25);
  });

  it('skips codes such as E330 and B12 inside a row', () => {
    const reading = parseLabel(
      lines(
        'סימון תזונתי ב-100 גרם',
        'אנרגיה 100',
        'חלבונים 5',
        'פחמימות 10',
        'שומנים 4',
        'ויטמין B12 (מק"ג) 0.9',
      ),
    );
    expect(reading.values).toEqual({ kcal: 100, protein: 5, carbs: 10, fat: 4 });
  });

  it('finds a serving size', () => {
    expect(parseLabel('משקל נקי: 144 גרם (= 6 X 24 גרם)').servingGrams).toBe(24);
    expect(parseLabel('גודל מנה: 30 גרם').servingGrams).toBe(30);
    expect(parseLabel('אנרגיה 100').servingGrams).toBeNull();
  });
});

describe('checkLabelValues', () => {
  it('flags calories far from the macros', () => {
    expect(checkLabelValues({ kcal: 25, protein: 12.4, carbs: 30.5, fat: 4 })).toEqual([
      'kcal_vs_macros',
    ]);
  });

  it('passes values that fit', () => {
    expect(checkLabelValues({ kcal: 225, protein: 12.4, carbs: 30.5, fat: 4, sugar: 1.1 })).toEqual(
      [],
    );
  });

  it('counts sugar alcohols at their lower calories (sugar-free jam)', () => {
    expect(checkLabelValues({ kcal: 105, protein: 0, carbs: 33.9, fat: 0, polyols: 20.1 })).toEqual(
      [],
    );
    // Without them the same jam looks wrong.
    expect(checkLabelValues({ kcal: 105, protein: 0, carbs: 33.9, fat: 0 })).toEqual([
      'kcal_vs_macros',
    ]);
  });

  it('a swap of protein and carbohydrate is NOT caught (same calories): the person still checks', () => {
    expect(checkLabelValues({ kcal: 225, protein: 30.5, carbs: 12.4, fat: 4 })).toEqual([]);
  });

  it('flags more sugar than carbohydrate, more added sugar than sugar, macros above 100 g', () => {
    expect(checkLabelValues({ kcal: 100, protein: 0, carbs: 10, fat: 0, sugar: 30 })).toContain(
      'sugar_above_carbs',
    );
    expect(
      checkLabelValues({ kcal: 40, protein: 0, carbs: 10, fat: 0, sugar: 5, addedSugar: 8 }),
    ).toContain('added_above_sugar');
    expect(checkLabelValues({ kcal: 600, protein: 40, carbs: 40, fat: 40 })).toContain(
      'macros_above_100',
    );
    expect(checkLabelValues({ kcal: 600, protein: 40, carbs: 40, fat: 40 }, 'ml')).not.toContain(
      'macros_above_100',
    );
  });
});

describe('suggestedGrain', () => {
  it('reads the name, and high fiber makes bread whole grain', async () => {
    const { suggestedGrain } = await import('./product');
    expect(suggestedGrain("לחם אנג'ל", null)).toBe('refined');
    expect(suggestedGrain("לחם אנג'ל", 8.8)).toBe('whole');
    expect(suggestedGrain('לחם מלא', 2)).toBe('whole');
    expect(suggestedGrain('שוקולד מריר', 9)).toBeNull();
  });
});
