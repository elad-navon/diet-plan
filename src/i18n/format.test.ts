import { describe, expect, it } from 'vitest';
import { describeAmount, ingredientLine } from './format';

describe('amounts in words', () => {
  it('names one of a measure by itself, with the weight beside it', () => {
    expect(describeAmount({ grams: 42, unit: 'פרוסה עבה', count: 1 })).toBe("פרוסה עבה (42 ג')");
  });

  it('uses the plural of the measure and of its description for two or more', () => {
    expect(describeAmount({ grams: 64, unit: 'פרוסה בינונית', count: 2 })).toBe(
      "2 פרוסות בינוניות (64 ג')",
    );
    expect(describeAmount({ grams: 48, unit: 'פרוסה דקה', count: 2 })).toBe(
      "2 פרוסות דקות (48 ג')",
    );
    expect(describeAmount({ grams: 120, unit: 'כף', count: 3 })).toBe("3 כפות (120 ג')");
    expect(describeAmount({ grams: 80, unit: 'אריזה אישית', count: 2 })).toBe(
      "2 אריזות אישיות (80 ג')",
    );
    expect(describeAmount({ grams: 340, unit: 'כוס קוביות', count: 2 })).toBe(
      "2 כוסות קוביות (340 ג')",
    );
  });

  it('says halves and quarters the way people do', () => {
    expect(describeAmount({ grams: 50, unit: 'יחידה', count: 0.5 })).toBe("חצי יחידה (50 ג')");
    expect(describeAmount({ grams: 25, unit: 'יחידה', count: 0.25 })).toBe("רבע יחידה (25 ג')");
    expect(describeAmount({ grams: 118.5, unit: 'כוס', count: 0.75 })).toBe(
      "שלושת רבעי כוס (118.5 ג')",
    );
    expect(describeAmount({ grams: 237, unit: 'כוס', count: 1.5 })).toBe("כוס וחצי (237 ג')");
  });

  it('keeps quarters exact in other counts', () => {
    expect(describeAmount({ grams: 187.5, unit: 'מנה גדולה', count: 1.25 })).toBe(
      "1.25 מנות גדולות (187.5 ג')",
    );
    expect(describeAmount({ grams: 250, unit: 'כוס', count: 2.5 })).toBe("2.5 כוסות (250 ג')");
  });

  it('gives a weight-only entry as grams', () => {
    expect(describeAmount({ grams: 110 })).toBe("110 ג'");
  });

  it('leaves a measure it does not know in the singular instead of guessing', () => {
    expect(describeAmount({ grams: 20, unit: 'ריבוע/ קוביה', count: 2 })).toBe(
      "2 ריבוע/ קוביה (20 ג')",
    );
  });

  it('writes an ingredient line with the chosen label, else the short database name', () => {
    expect(
      ingredientLine({
        label: 'לחם מחיטה מלאה',
        entry: { name: 'לחם מחיטה מלאה, אנגל, לחם חי', grams: 64, unit: 'פרוסה בינונית', count: 2 },
      }),
    ).toBe("לחם מחיטה מלאה: 2 פרוסות בינוניות (64 ג')");
    expect(
      ingredientLine({
        label: null,
        entry: { name: 'תפוח עץ, עם קליפה (ללא ליבה)', grams: 186, unit: 'יחידה גדולה', count: 1 },
      }),
    ).toBe("תפוח עץ: יחידה גדולה (186 ג')");
  });
});
