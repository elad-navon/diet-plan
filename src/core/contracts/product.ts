import { type InputError, type Validation, validateFavoriteInput } from './meal';

/**
 * Input rules for the person's own products (values per 100 g or 100 ml, read from a label). The database repeats
 * them as CHECK constraints (supabase/migrations/20261021000000_products.sql).
 */
export const PRODUCT_LIMITS = {
  kcal100Max: 900,
  /** Grams of a nutrient in 100 g. */
  value100Max: 100,
  /** Protein + carbohydrate + fat in 100 g (a little slack for the label's rounding). */
  macroSum100Max: 105,
  unitsMax: 10,
  unitNameMax: 30,
  unitGramsMax: 5000,
  productsMax: 500,
} as const;

export interface ProductInput {
  name: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  /** Optional; null or absent = not on the label. */
  sugar100?: number | null;
  fiber100?: number | null;
  addedSugar100?: number | null;
  units: readonly { name: string; grams: number }[];
  basis: 'g' | 'ml';
}

export interface ValidProduct {
  name: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  sugar100: number | null;
  fiber100: number | null;
  addedSugar100: number | null;
  units: { name: string; grams: number }[];
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const inRange = (value: number, max: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= max;

export function validateProductInput(input: ProductInput): Validation<ValidProduct> {
  const errors: InputError[] = [];
  // The name follows the rules of a saved meal's name (1-80 characters, no markup).
  const named = validateFavoriteInput({ name: input.name, kcal: 0 });
  if (!named.ok) errors.push(...named.errors.filter((error) => error.field === 'name'));

  if (!Number.isFinite(input.kcal100)) errors.push({ field: 'kcal', code: 'kcal_invalid' });
  else if (!inRange(input.kcal100, PRODUCT_LIMITS.kcal100Max)) {
    errors.push({ field: 'kcal', code: 'kcal100_out_of_range' });
  }

  const macros = [input.protein100, input.carbs100, input.fat100];
  if (macros.some((value) => !Number.isFinite(value))) {
    errors.push({ field: 'macros', code: 'macro_invalid' });
  } else if (macros.some((value) => !inRange(value, PRODUCT_LIMITS.value100Max))) {
    errors.push({ field: 'macros', code: 'macro100_out_of_range' });
  } else if (
    input.basis === 'g' &&
    input.protein100 + input.carbs100 + input.fat100 > PRODUCT_LIMITS.macroSum100Max
  ) {
    errors.push({ field: 'macros', code: 'macros_above_100' });
  }

  for (const [field, value] of [
    ['sugar', input.sugar100],
    ['sugar', input.addedSugar100],
    ['fiber', input.fiber100],
  ] as const) {
    if (value === null || value === undefined) continue;
    if (!Number.isFinite(value)) errors.push({ field, code: 'macro_invalid' });
    else if (!inRange(value, PRODUCT_LIMITS.value100Max)) {
      errors.push({ field, code: 'macro100_out_of_range' });
    }
  }

  const unitNames = new Set<string>();
  let unitsOk = input.units.length <= PRODUCT_LIMITS.unitsMax;
  const units = input.units.map((unit) => ({ name: unit.name.trim(), grams: round1(unit.grams) }));
  for (const unit of units) {
    if (
      unit.name.length === 0 ||
      unit.name.length > PRODUCT_LIMITS.unitNameMax ||
      // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
      /[\u0000-\u001f\u007f<>]/.test(unit.name) ||
      !Number.isFinite(unit.grams) ||
      unit.grams <= 0 ||
      unit.grams > PRODUCT_LIMITS.unitGramsMax ||
      unitNames.has(unit.name)
    ) {
      unitsOk = false;
    }
    unitNames.add(unit.name);
  }
  if (!unitsOk) errors.push({ field: 'units', code: 'units_invalid' });

  if (errors.length > 0 || !named.ok) return { ok: false, errors };
  const optional = (value: number | null | undefined): number | null =>
    value === null || value === undefined ? null : round1(value);
  return {
    ok: true,
    value: {
      name: named.value.name,
      kcal100: round1(input.kcal100),
      protein100: round1(input.protein100),
      carbs100: round1(input.carbs100),
      fat100: round1(input.fat100),
      sugar100: optional(input.sugar100),
      fiber100: optional(input.fiber100),
      addedSugar100: optional(input.addedSugar100),
      units,
    },
    warnings: [],
  };
}
