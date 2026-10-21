import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkLabelValues, parseLabel, type LabelField } from '../src/core/food/label';

/**
 * Real labels: the text Google Lens "copy text" gave for the user's own photos (tests/fixtures/labels), against the
 * values read by eye from the same photos. Every number must come out right, in the right row.
 */
const read = (name: string): string =>
  readFileSync(new URL(`./fixtures/labels/${name}.txt`, import.meta.url), 'utf8');

const CASES: { file: string; basis: 'g'; expected: Partial<Record<LabelField, number>> }[] = [
  {
    // A shop's web page, the table as a picture.
    file: 'angel-bread',
    basis: 'g',
    expected: { kcal: 225, fat: 4, carbs: 30.5, sugar: 1.1, fiber: 8.8, protein: 12.4 },
  },
  {
    // A phone photo of the bag, with a barcode and "28 גרם חלבון" printed after the table.
    file: 'pro-bread',
    basis: 'g',
    expected: { kcal: 220, fat: 3.4, carbs: 12.9, sugar: 1.4, fiber: 12.3, protein: 28.2 },
  },
  {
    // A round can; numbers come before their names, and an iron row the app does not use.
    file: 'yachin-chickpeas',
    basis: 'g',
    expected: { kcal: 137, fat: 1.9, carbs: 20, sugar: 1.1, fiber: 6, protein: 7 },
  },
  {
    // An imported product: units in the cell ("'33ג"), a %-of-daily-value column, sugar alcohols.
    file: 'tru-chocolate',
    basis: 'g',
    expected: { kcal: 465, fat: 33, carbs: 50, sugar: 0, protein: 6.2 },
  },
];

describe('real label texts (Google Lens)', () => {
  for (const { file, basis, expected } of CASES) {
    it(`${file}: every value right`, () => {
      const reading = parseLabel(read(file));
      expect(reading.values).toEqual(expected);
      expect(reading.basis).toBe(basis);
      expect(reading.issues).toEqual([]);
      expect(reading.doubtful).toEqual([]);
    });
  }

  it('the chocolate sugar alcohols are read, and explain its calories', () => {
    const reading = parseLabel(read('tru-chocolate'));
    expect(reading.polyols).toBe(47);
    const { kcal, protein, carbs, fat } = reading.values;
    expect(
      checkLabelValues({
        kcal: kcal ?? 0,
        protein: protein ?? 0,
        carbs: carbs ?? 0,
        fat: fat ?? 0,
        polyols: reading.polyols,
      }),
    ).toEqual([]);
  });

  it('none of the real labels is flagged', () => {
    for (const { file } of CASES) {
      const { values, polyols } = parseLabel(read(file));
      const flags = checkLabelValues({
        kcal: values.kcal ?? 0,
        protein: values.protein ?? 0,
        carbs: values.carbs ?? 0,
        fat: values.fat ?? 0,
        sugar: values.sugar ?? null,
        polyols,
      });
      expect(flags, file).toEqual([]);
    }
  });
});
