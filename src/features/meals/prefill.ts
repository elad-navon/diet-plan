import { MEAL_LIMITS } from '../../core/contracts';
import { isManualEntry, sumEntries, type FoodEntry } from '../../core/food';
import { type Macros } from '../../core/nutrition';
import { type MealSlot } from '../../core/schedule';
import { type FavoriteRecord, type MealSource, type StoredMeal } from '../../data';
import { favoriteKey } from './favorites';

/** Values to start the form with (a suggestion, a saved meal). */
export interface MealPrefill {
  name: string;
  kcal: number;
  macros: Macros | null;
  slot?: MealSlot;
  source?: MealSource;
  items?: FoodEntry[];
  /** Added sugar in grams; for a meal built from foods it is recomputed from the foods. */
  addedSugarG?: number | null;
  /** A meal typed by hand: the split of its carbohydrate into white flour and whole grains (grams). */
  refinedCarbsG?: number | null;
  wholeCarbsG?: number | null;
  foodDbVersion?: string;
  favoriteId?: string;
  /** Several saved meals added together as one meal: each of them counts as used once it is saved. */
  favoriteIds?: string[];
}

/**
 * The form for adding a saved meal. A meal of foods comes back with its foods. A meal typed by hand was saved as
 * one entry typed by hand (with the meal's own name), and comes back as the by-hand fields again.
 */
export function savedMealPrefill(favorite: FavoriteRecord): MealPrefill {
  const [only] = favorite.items;
  const typedByHand =
    favorite.items.length === 1 &&
    only !== undefined &&
    isManualEntry(only) &&
    favoriteKey(only.name) === favoriteKey(favorite.name);
  return {
    name: favorite.name,
    kcal: favorite.kcal,
    macros: favorite.macros,
    addedSugarG: favorite.addedSugarG,
    refinedCarbsG: favorite.refinedCarbsG ?? null,
    wholeCarbsG: favorite.wholeCarbsG ?? null,
    source: 'favorite',
    favoriteId: favorite.id,
    ...(typedByHand ? {} : { items: favorite.items }),
    ...(favorite.foodDbVersion !== undefined ? { foodDbVersion: favorite.foodDbVersion } : {}),
  };
}

/**
 * The form for adding several saved meals together as one meal ("כוס קפה" and "2 פרוסות" as one breakfast):
 * all their foods, under their names joined with "+". One saved meal comes back the way it was saved.
 */
export function combinedMealsPrefill(favorites: readonly FavoriteRecord[]): MealPrefill | null {
  const [first] = favorites;
  if (first === undefined) return null;
  if (favorites.length === 1) return savedMealPrefill(first);
  const items = favorites.flatMap((favorite) => favorite.items);
  const totals = sumEntries(items);
  const joined = favorites.map((favorite) => favorite.name.trim()).join(' + ');
  const name =
    joined.length > MEAL_LIMITS.nameMax ? `${joined.slice(0, MEAL_LIMITS.nameMax - 1)}…` : joined;
  const versions = new Set(favorites.map((favorite) => favorite.foodDbVersion));
  const [version] = versions;
  return {
    name,
    kcal: totals.kcal,
    macros: { proteinG: totals.proteinG, carbsG: totals.carbsG, fatG: totals.fatG },
    addedSugarG: totals.addedSugarG,
    items,
    source: 'favorite',
    favoriteIds: favorites.map((favorite) => favorite.id),
    ...(versions.size === 1 && version !== undefined ? { foodDbVersion: version } : {}),
  };
}

/**
 * The form for adding again a meal from another day: the same foods (or the same numbers typed by hand), as a new
 * meal of today. The time and the meal of the day follow the clock, as for any new meal; all of it can be changed.
 */
export function copiedMealPrefill(meal: StoredMeal): MealPrefill {
  const macros: Macros | null =
    meal.proteinG !== null && meal.carbsG !== null && meal.fatG !== null
      ? { proteinG: meal.proteinG, carbsG: meal.carbsG, fatG: meal.fatG }
      : null;
  return {
    name: meal.name,
    kcal: meal.kcal,
    macros,
    addedSugarG: meal.addedSugarG,
    refinedCarbsG: meal.refinedCarbsG ?? null,
    wholeCarbsG: meal.wholeCarbsG ?? null,
    source: 'copy',
    ...(meal.items.length > 0 ? { items: meal.items } : {}),
    ...(meal.foodDbVersion !== undefined ? { foodDbVersion: meal.foodDbVersion } : {}),
  };
}
