import { isManualEntry, type FoodEntry } from '../../core/food';
import { type Macros } from '../../core/nutrition';
import { type MealSlot } from '../../core/schedule';
import { type FavoriteRecord, type MealSource } from '../../data';
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
