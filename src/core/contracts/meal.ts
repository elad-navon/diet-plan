import { z } from 'zod';
import { type Macros } from '../nutrition';
import { type Instant } from '../time';

/**
 * Input rules for meals, favorites and weigh-ins (docs/PRODUCT_SPEC.md C.2). The same numbers are
 * enforced by database CHECK constraints (docs/DATA_MODEL.md E.3); a stage-3 test keeps the two in sync.
 */
export const MEAL_LIMITS = {
  nameMax: 80,
  kcalMax: 3000,
  /** Above this the UI asks "larger than usual - confirm?". */
  kcalConfirmAbove: 1500,
  macroMaxG: 500,
  backfillDays: 31,
  futureToleranceMinutes: 5,
  itemsMax: 30,
  mealsPerDayMax: 60,
  favoritesMax: 200,
  /** kcal vs 4P+4C+9F may differ by max(this, 20%) before a warning (fiber and alcohol explain small gaps). */
  macroMismatchFloorKcal: 40,
  macroMismatchFraction: 0.2,
} as const;

export const WEIGHT_LIMITS = { minKg: 30, maxKg: 350, jumpConfirmKg: 3 } as const;

export type InputField = 'name' | 'kcal' | 'macros' | 'eatenAt' | 'weight';

export type InputErrorCode =
  | 'name_required'
  | 'name_too_long'
  | 'name_invalid_chars'
  | 'kcal_invalid'
  | 'kcal_out_of_range'
  | 'macros_incomplete'
  | 'macro_invalid'
  | 'macro_out_of_range'
  | 'time_in_future'
  | 'time_too_old'
  | 'weight_invalid'
  | 'weight_out_of_range';

export type InputWarning = 'kcal_large' | 'macro_kcal_mismatch' | 'weight_jump';

export interface InputError {
  field: InputField;
  code: InputErrorCode;
}

/**
 * Parses what a user typed into a number field. Accepts `12`, `12.5`, `12,5`, `.5`; rejects signs,
 * exponents (`1e3`), spaces inside, several separators and anything else. Returns null if invalid.
 */
export function parseDecimalInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: 'name_required' })
  .max(MEAL_LIMITS.nameMax, { error: 'name_too_long' })
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  .refine((value) => !/[\u0000-\u001f\u007f<>]/.test(value), { error: 'name_invalid_chars' });

const kcalSchema = z
  .number({ error: 'kcal_invalid' })
  .refine(Number.isFinite, { error: 'kcal_invalid' })
  .min(0, { error: 'kcal_out_of_range' })
  .max(MEAL_LIMITS.kcalMax, { error: 'kcal_out_of_range' });

const macroSchema = z
  .number({ error: 'macro_invalid' })
  .refine(Number.isFinite, { error: 'macro_invalid' })
  .min(0, { error: 'macro_out_of_range' })
  .max(MEAL_LIMITS.macroMaxG, { error: 'macro_out_of_range' });

/** The first error code zod produced for a value, or null if it parsed. */
function firstIssue(schema: z.ZodType, value: unknown): InputErrorCode | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message as InputErrorCode);
}

export interface NameKcalMacros {
  name: string;
  kcal: number;
  /** All three or none; a partial set is an error (it would skew the day's macro totals). */
  macros?: {
    proteinG?: number | null;
    carbsG?: number | null;
    fatG?: number | null;
  } | null;
}

export interface MealInput extends NameKcalMacros {
  eatenAt: Instant;
}

export interface ValidNameKcalMacros {
  name: string;
  kcal: number;
  macros: Macros | null;
}

export type Validation<T> =
  { ok: true; value: T; warnings: InputWarning[] } | { ok: false; errors: InputError[] };

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** True when calories and macros disagree by more than fiber/alcohol could explain. */
export function macroKcalMismatch(kcal: number, macros: Macros): boolean {
  const fromMacros = 4 * macros.proteinG + 4 * macros.carbsG + 9 * macros.fatG;
  const allowed = Math.max(
    MEAL_LIMITS.macroMismatchFloorKcal,
    MEAL_LIMITS.macroMismatchFraction * kcal,
  );
  return Math.abs(kcal - fromMacros) > allowed;
}

function validateCore(input: NameKcalMacros): Validation<ValidNameKcalMacros> {
  const errors: InputError[] = [];
  const warnings: InputWarning[] = [];

  const nameError = firstIssue(nameSchema, input.name);
  if (nameError) errors.push({ field: 'name', code: nameError });
  const kcalError = firstIssue(kcalSchema, input.kcal);
  if (kcalError) errors.push({ field: 'kcal', code: kcalError });

  const given = input.macros
    ? [input.macros.proteinG, input.macros.carbsG, input.macros.fatG].map((v) => v ?? null)
    : [null, null, null];
  const provided = given.filter((v) => v !== null);
  let macros: Macros | null = null;
  if (provided.length > 0 && provided.length < 3) {
    errors.push({ field: 'macros', code: 'macros_incomplete' });
  } else if (provided.length === 3) {
    const macroError = given.map((v) => firstIssue(macroSchema, v)).find((code) => code !== null);
    if (macroError) {
      errors.push({ field: 'macros', code: macroError });
    } else {
      macros = {
        proteinG: round1(given[0] as number),
        carbsG: round1(given[1] as number),
        fatG: round1(given[2] as number),
      };
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const kcal = Math.round(input.kcal);
  if (kcal > MEAL_LIMITS.kcalConfirmAbove) warnings.push('kcal_large');
  if (macros && macroKcalMismatch(kcal, macros)) warnings.push('macro_kcal_mismatch');
  return { ok: true, value: { name: nameSchema.parse(input.name), kcal, macros }, warnings };
}

/** Validates a favorite (a meal without a time). */
export function validateFavoriteInput(input: NameKcalMacros): Validation<ValidNameKcalMacros> {
  return validateCore(input);
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Validates a meal entry. `now` is the corrected clock; time must be within [now - 31 days, now + 5 min]. */
export function validateMealInput(
  input: MealInput,
  now: Instant,
): Validation<ValidNameKcalMacros & { eatenAt: Instant }> {
  const core = validateCore(input);
  const errors: InputError[] = core.ok ? [] : [...core.errors];

  if (input.eatenAt > now + MEAL_LIMITS.futureToleranceMinutes * MINUTE_MS) {
    errors.push({ field: 'eatenAt', code: 'time_in_future' });
  } else if (input.eatenAt < now - MEAL_LIMITS.backfillDays * DAY_MS) {
    errors.push({ field: 'eatenAt', code: 'time_too_old' });
  }

  if (errors.length > 0 || !core.ok) return { ok: false, errors };
  return {
    ok: true,
    value: { ...core.value, eatenAt: input.eatenAt },
    warnings: core.warnings,
  };
}

/** Validates a weigh-in; a jump of more than 3 kg from the previous reading asks for confirmation. */
export function validateWeightInput(
  input: { kg: number },
  previousKg?: number | null,
): Validation<{ kg: number }> {
  if (!Number.isFinite(input.kg)) {
    return { ok: false, errors: [{ field: 'weight', code: 'weight_invalid' }] };
  }
  if (input.kg < WEIGHT_LIMITS.minKg || input.kg > WEIGHT_LIMITS.maxKg) {
    return { ok: false, errors: [{ field: 'weight', code: 'weight_out_of_range' }] };
  }
  const kg = round1(input.kg);
  const warnings: InputWarning[] = [];
  if (
    previousKg !== null &&
    previousKg !== undefined &&
    Math.abs(kg - previousKg) > WEIGHT_LIMITS.jumpConfirmKg
  ) {
    warnings.push('weight_jump');
  }
  return { ok: true, value: { kg }, warnings };
}
