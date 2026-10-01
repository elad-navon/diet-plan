import { describe, expect, it } from 'vitest';
import { wallToInstant } from '../time';
import {
  MEAL_LIMITS,
  macroKcalMismatch,
  parseDecimalInput,
  validateFavoriteInput,
  validateMealInput,
  validateWeightInput,
  type InputError,
  type MealInput,
  type Validation,
} from './index';

const NOW = wallToInstant('2026-10-02', '12:00', 'Asia/Jerusalem');
const MINUTE = 60_000;
const DAY = 86_400_000;

const valid: MealInput = { name: 'חביתה', kcal: 320, eatenAt: NOW - 10 * MINUTE };

const errorsOf = <T>(result: Validation<T>): InputError[] => (result.ok ? [] : result.errors);
const codesOf = <T>(result: Validation<T>): string[] => errorsOf(result).map((e) => e.code);

describe('parsing what the user typed', () => {
  it('accepts plain numbers with a dot or comma decimal separator', () => {
    expect(parseDecimalInput('12')).toBe(12);
    expect(parseDecimalInput(' 12.5 ')).toBe(12.5);
    expect(parseDecimalInput('12,5')).toBe(12.5);
    expect(parseDecimalInput('.5')).toBe(0.5);
    expect(parseDecimalInput('0')).toBe(0);
  });

  it('rejects everything else', () => {
    for (const bad of [
      '',
      ' ',
      '-5',
      '+5',
      '1e3',
      '1,2,3',
      '1.2.3',
      '12 5',
      'abc',
      '5kg',
      'NaN',
      'Infinity',
      '٣',
    ]) {
      expect(parseDecimalInput(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('manual meal entry (E2E-04)', () => {
  it('accepts a normal meal and trims the name', () => {
    const result = validateMealInput({ ...valid, name: '  חביתה  ' }, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        name: 'חביתה',
        kcal: 320,
        macros: null,
        eatenAt: valid.eatenAt,
      });
      expect(result.warnings).toEqual([]);
    }
  });

  it('requires a name of 1-80 characters without control characters or angle brackets', () => {
    expect(codesOf(validateMealInput({ ...valid, name: '   ' }, NOW))).toContain('name_required');
    expect(validateMealInput({ ...valid, name: 'א'.repeat(80) }, NOW).ok).toBe(true);
    expect(codesOf(validateMealInput({ ...valid, name: 'א'.repeat(81) }, NOW))).toContain(
      'name_too_long',
    );
    for (const bad of ['a\u0000b', 'a\nb', '<b>x</b>', 'x > y']) {
      expect(codesOf(validateMealInput({ ...valid, name: bad }, NOW)), bad).toContain(
        'name_invalid_chars',
      );
    }
  });

  it('bounds calories to 0-3000, rounds them, and asks for confirmation above 1500', () => {
    expect(validateMealInput({ ...valid, kcal: 0 }, NOW).ok).toBe(true);
    expect(validateMealInput({ ...valid, kcal: 3000 }, NOW).ok).toBe(true);
    for (const bad of [-1, 3001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(errorsOf(validateMealInput({ ...valid, kcal: bad }, NOW))[0]?.field, String(bad)).toBe(
        'kcal',
      );
    }
    const rounded = validateMealInput({ ...valid, kcal: 320.6 }, NOW);
    expect(rounded.ok && rounded.value.kcal).toBe(321);

    const big = validateMealInput({ ...valid, kcal: 1501 }, NOW);
    expect(big.ok && big.warnings).toEqual(['kcal_large']);
    const edge = validateMealInput({ ...valid, kcal: 1500 }, NOW);
    expect(edge.ok && edge.warnings).toEqual([]);
  });

  it('takes macros as all three or none', () => {
    const none = validateMealInput({ ...valid, macros: null }, NOW);
    expect(none.ok && none.value.macros).toBeNull();
    const empty = validateMealInput({ ...valid, macros: {} }, NOW);
    expect(empty.ok && empty.value.macros).toBeNull();

    const partial = validateMealInput({ ...valid, macros: { proteinG: 20 } }, NOW);
    expect(codesOf(partial)).toEqual(['macros_incomplete']);

    const all = validateMealInput(
      { ...valid, kcal: 320, macros: { proteinG: 20.04, carbsG: 15, fatG: 20 } },
      NOW,
    );
    expect(all.ok && all.value.macros).toEqual({ proteinG: 20, carbsG: 15, fatG: 20 });
  });

  it('bounds each macro to 0-500 g', () => {
    const at = (g: number) =>
      validateMealInput({ ...valid, kcal: 2000, macros: { proteinG: g, carbsG: 0, fatG: 0 } }, NOW);
    expect(at(500).ok).toBe(true);
    expect(codesOf(at(500.1))).toEqual(['macro_out_of_range']);
    expect(codesOf(at(-1))).toEqual(['macro_out_of_range']);
    expect(codesOf(at(Number.NaN))).toEqual(['macro_invalid']);
  });

  it('warns - but does not block - when calories and macros disagree', () => {
    expect(macroKcalMismatch(320, { proteinG: 20, carbsG: 15, fatG: 20 })).toBe(false); // 80+60+180 = 320
    expect(macroKcalMismatch(400, { proteinG: 5, carbsG: 5, fatG: 5 })).toBe(true);
    const result = validateMealInput(
      { ...valid, kcal: 400, macros: { proteinG: 5, carbsG: 5, fatG: 5 } },
      NOW,
    );
    expect(result.ok && result.warnings).toEqual(['macro_kcal_mismatch']);
  });

  it('allows a time up to 5 minutes ahead and up to 31 days back (TIME-07, TIME-09)', () => {
    const at = (eatenAt: number) => validateMealInput({ ...valid, eatenAt }, NOW);
    expect(at(NOW + 5 * MINUTE).ok).toBe(true);
    expect(codesOf(at(NOW + 5 * MINUTE + 1))).toEqual(['time_in_future']);
    expect(at(NOW - 31 * DAY).ok).toBe(true);
    expect(codesOf(at(NOW - 31 * DAY - 1))).toEqual(['time_too_old']);
    expect(MEAL_LIMITS.backfillDays).toBe(31);
  });

  it('reports every problem at once', () => {
    const result = validateMealInput(
      { name: '', kcal: -5, macros: { proteinG: 1 }, eatenAt: NOW + DAY },
      NOW,
    );
    expect(codesOf(result).sort()).toEqual(
      ['kcal_out_of_range', 'macros_incomplete', 'name_required', 'time_in_future'].sort(),
    );
  });
});

describe('favorites', () => {
  it('use the same rules without a time', () => {
    expect(validateFavoriteInput({ name: 'שייק', kcal: 250 }).ok).toBe(true);
    expect(codesOf(validateFavoriteInput({ name: '', kcal: 250 }))).toEqual(['name_required']);
    expect(codesOf(validateFavoriteInput({ name: 'x', kcal: 9999 }))).toEqual([
      'kcal_out_of_range',
    ]);
  });
});

describe('weigh-ins (E2E-08)', () => {
  it('accepts 30-350 kg and rounds to one decimal', () => {
    const ok = validateWeightInput({ kg: 71.26 });
    expect(ok.ok && ok.value.kg).toBe(71.3);
    expect(validateWeightInput({ kg: 30 }).ok).toBe(true);
    expect(validateWeightInput({ kg: 350 }).ok).toBe(true);
    expect(codesOf(validateWeightInput({ kg: 29.9 }))).toEqual(['weight_out_of_range']);
    expect(codesOf(validateWeightInput({ kg: 351 }))).toEqual(['weight_out_of_range']);
    expect(codesOf(validateWeightInput({ kg: Number.NaN }))).toEqual(['weight_invalid']);
  });

  it('asks for confirmation when the weight jumps by more than 3 kg (typo guard)', () => {
    const jump = validateWeightInput({ kg: 780 / 10 }, 71);
    expect(jump.ok && jump.warnings).toEqual(['weight_jump']);
    const fine = validateWeightInput({ kg: 73.5 }, 71);
    expect(fine.ok && fine.warnings).toEqual([]);
    const first = validateWeightInput({ kg: 71 }, null);
    expect(first.ok && first.warnings).toEqual([]);
  });
});
