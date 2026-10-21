import {
  productFoodId,
  productUuid,
  toUserProduct,
  type AddedSugarBasis,
  type FoodEntry,
  type ProductFields,
  type UserProduct,
} from '../../core/food';
import {
  type MacroState,
  type Macros,
  type Plan,
  type PlanInputs,
  type Sex,
} from '../../core/nutrition';
import { type MealSchedule, type MealSlot } from '../../core/schedule';
import { formatInstant, parseInstant, type Instant } from '../../core/time';
import {
  DataError,
  type FavoriteRecord,
  type MealSource,
  type Profile,
  type StoredMeal,
  type StoredPlan,
  type WeightRecord,
} from '../types';
import { type Row } from './gateway';

/**
 * Rows as the server returns them (snake_case JSON) <-> the app's own types. Every value is checked on
 * the way in, so an app that is out of step with the database fails with a clear error instead of
 * showing wrong numbers.
 */

const bad = (column: string): DataError =>
  new DataError('server', `unexpected value for "${column}" in the server's answer`);

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw bad(column);
  return value;
}
function textOrNull(row: Row, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw bad(column);
  return value;
}
function number(row: Row, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw bad(column);
  return value;
}
function numberOrNull(row: Row, column: string): number | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  return number(row, column);
}
function oneOf<T extends string>(row: Row, column: string, allowed: readonly T[]): T {
  const value = text(row, column);
  if (!(allowed as readonly string[]).includes(value)) throw bad(column);
  return value as T;
}
function instant(row: Row, column: string): Instant {
  try {
    return parseInstant(text(row, column));
  } catch {
    throw bad(column);
  }
}
function instantOrNull(row: Row, column: string): Instant | null {
  return row[column] === null || row[column] === undefined ? null : instant(row, column);
}
function list(row: Row, column: string): unknown[] {
  const value = row[column];
  if (!Array.isArray(value)) throw bad(column);
  return value;
}
function object(row: Row, column: string): Record<string, unknown> {
  const value = row[column];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw bad(column);
  return value as Record<string, unknown>;
}

const SLOTS = [
  'breakfast',
  'lunch',
  'snack',
  'dinner',
  'other',
] as const satisfies readonly MealSlot[];
const SOURCES = ['food_db', 'manual', 'favorite', 'copy'] as const satisfies readonly MealSource[];
const SEXES = ['female', 'male', 'unspecified'] as const satisfies readonly Sex[];
const MACRO_STATES = [
  'ok',
  'relaxed',
  'low_carb',
  'conflict',
] as const satisfies readonly MacroState[];

/** All three macros or none: the database guarantees it, so a partial set is a corrupt answer. */
function macrosOf(row: Row): Macros | null {
  const p = numberOrNull(row, 'protein_g');
  const c = numberOrNull(row, 'carbs_g');
  const f = numberOrNull(row, 'fat_g');
  if (p === null && c === null && f === null) return null;
  if (p === null || c === null || f === null) throw bad('protein_g');
  return { proteinG: p, carbsG: c, fatG: f };
}

export const macroColumns = (macros: Macros | null) => ({
  protein_g: macros?.proteinG ?? null,
  carbs_g: macros?.carbsG ?? null,
  fat_g: macros?.fatG ?? null,
});

export function profileFromRow(row: Row): Profile {
  return {
    sex: oneOf(row, 'sex', SEXES),
    birthDate: text(row, 'birth_date'),
    heightCm: number(row, 'height_cm'),
    timezone: text(row, 'timezone'),
    disclaimerAckAt: instant(row, 'disclaimer_ack_at'),
  };
}

export const profileToPayload = (profile: Profile) => ({
  sex: profile.sex,
  birth_date: profile.birthDate,
  height_cm: profile.heightCm,
  timezone: profile.timezone,
  disclaimer_ack_at: formatInstant(profile.disclaimerAckAt),
});

export function planFromRow(row: Row): StoredPlan {
  return {
    id: text(row, 'id'),
    effectiveFrom: text(row, 'effective_from'),
    kcalTarget: number(row, 'kcal_target'),
    kcalFloor: number(row, 'kcal_floor'),
    macros: macrosOf(row),
    macroState: oneOf(row, 'macro_state', MACRO_STATES),
    schedule: list(row, 'schedule') as unknown as MealSchedule,
    inputs: object(row, 'inputs') as unknown as PlanInputs,
    plan: object(row, 'result') as unknown as Plan,
    createdAt: instant(row, 'created_at'),
  };
}

export const planToPayload = (plan: StoredPlan) => ({
  id: plan.id,
  effective_from: plan.effectiveFrom,
  engine_version: plan.plan.engineVersion,
  goal_type: plan.plan.goalType,
  kcal_target: plan.kcalTarget,
  kcal_floor: plan.kcalFloor,
  ...macroColumns(plan.macros),
  macro_state: plan.macroState,
  schedule: plan.schedule,
  inputs: plan.inputs,
  result: plan.plan,
});

export function mealFromRow(row: Row): StoredMeal {
  const foodDbVersion = textOrNull(row, 'food_db_version');
  return {
    id: text(row, 'id'),
    name: text(row, 'name'),
    localDate: text(row, 'local_date'),
    eatenAt: instant(row, 'eaten_at'),
    tz: text(row, 'tz'),
    slot: oneOf(row, 'slot', SLOTS),
    kcal: number(row, 'kcal'),
    proteinG: numberOrNull(row, 'protein_g'),
    carbsG: numberOrNull(row, 'carbs_g'),
    fatG: numberOrNull(row, 'fat_g'),
    items: list(row, 'items') as FoodEntry[],
    addedSugarG: numberOrNull(row, 'added_sugar_g'),
    refinedCarbsG: numberOrNull(row, 'refined_carbs_g'),
    wholeCarbsG: numberOrNull(row, 'whole_carbs_g'),
    source: oneOf(row, 'source', SOURCES),
    ...(foodDbVersion !== null ? { foodDbVersion } : {}),
    version: number(row, 'version'),
    enteredAt: instant(row, 'entered_at'),
    deletedAt: instantOrNull(row, 'deleted_at'),
  };
}

export function weightFromRow(row: Row): WeightRecord {
  return {
    id: text(row, 'id'),
    localDate: text(row, 'local_date'),
    kg: number(row, 'weight_kg'),
    measuredAt: instant(row, 'measured_at'),
    version: number(row, 'version'),
  };
}

export function favoriteFromRow(row: Row): FavoriteRecord {
  const foodDbVersion = textOrNull(row, 'food_db_version');
  return {
    id: text(row, 'id'),
    name: text(row, 'name'),
    kcal: number(row, 'kcal'),
    macros: macrosOf(row),
    items: list(row, 'items') as FoodEntry[],
    addedSugarG: numberOrNull(row, 'added_sugar_g'),
    refinedCarbsG: numberOrNull(row, 'refined_carbs_g'),
    wholeCarbsG: numberOrNull(row, 'whole_carbs_g'),
    ...(foodDbVersion !== null ? { foodDbVersion } : {}),
    sortOrder: numberOrNull(row, 'sort_order'),
    useCount: number(row, 'use_count'),
    lastUsedAt: instantOrNull(row, 'last_used_at'),
    version: number(row, 'version'),
  };
}

const SUGAR_BASES = ['label', 'user', 'estimate'] as const satisfies readonly AddedSugarBasis[];
const GRAINS = ['refined', 'whole'] as const;
const BASES = ['g', 'ml'] as const;

function oneOfOrNull<T extends string>(row: Row, column: string, allowed: readonly T[]): T | null {
  return row[column] === null || row[column] === undefined ? null : oneOf(row, column, allowed);
}

function unitsOf(row: Row): { name: string; grams: number }[] {
  return list(row, 'units').map((unit) => {
    if (typeof unit !== 'object' || unit === null) throw bad('units');
    const { name, grams } = unit as Record<string, unknown>;
    if (typeof name !== 'string' || typeof grams !== 'number' || !Number.isFinite(grams)) {
      throw bad('units');
    }
    return { name, grams };
  });
}

export function productFromRow(row: Row): UserProduct {
  return toUserProduct({
    id: productFoodId(text(row, 'id')),
    name: text(row, 'name'),
    kcal100: number(row, 'kcal_100'),
    protein100: number(row, 'protein_100'),
    carbs100: number(row, 'carbs_100'),
    fat100: number(row, 'fat_100'),
    sugar100: numberOrNull(row, 'sugar_100'),
    fiber100: numberOrNull(row, 'fiber_100'),
    addedSugar100: numberOrNull(row, 'added_sugar_100'),
    addedSugarBasis: oneOfOrNull(row, 'added_sugar_basis', SUGAR_BASES),
    grain: oneOfOrNull(row, 'grain', GRAINS),
    basis: oneOf(row, 'basis', BASES),
    units: unitsOf(row),
    version: number(row, 'version'),
  });
}

/** The columns of a product (without its id and version). */
export const productColumns = (product: ProductFields) => ({
  name: product.name,
  kcal_100: product.kcal100,
  protein_100: product.protein100,
  carbs_100: product.carbs100,
  fat_100: product.fat100,
  sugar_100: product.sugar100,
  fiber_100: product.fiber100,
  added_sugar_100: product.addedSugar100,
  added_sugar_basis: product.addedSugarBasis,
  grain: product.grain,
  basis: product.basis,
  units: product.units,
});

export { productUuid };
