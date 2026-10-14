import { manualEntry, type FoodEntry } from '../../core/food';
import { type Macros } from '../../core/nutrition';
import { type FavoriteRecord } from '../../data';

const MAX_MATCHES = 5;

/** A name as it is compared: no extra spaces, no difference of case ("יוגורט  Pro" = "יוגורט pro"). */
export function favoriteKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The favorites that match what is being typed in the search box: every word typed is somewhere in the name.
 * A name that starts with the text comes first, then the ones used most.
 */
export function matchFavorites(
  favorites: readonly FavoriteRecord[],
  query: string,
): FavoriteRecord[] {
  const text = favoriteKey(query);
  if (text.length < 2) return [];
  const words = text.split(' ');
  return favorites
    .filter((favorite) => {
      const key = favoriteKey(favorite.name);
      return words.every((word) => key.includes(word));
    })
    .sort((a, b) => {
      const starts =
        Number(favoriteKey(b.name).startsWith(text)) - Number(favoriteKey(a.name).startsWith(text));
      return starts !== 0 ? starts : b.useCount - a.useCount;
    })
    .slice(0, MAX_MATCHES);
}

/** The earlier favorites typed by hand under the same name: a new entry replaces them (the latest values win). */
export function sameManualFavorites(
  favorites: readonly FavoriteRecord[],
  name: string,
): FavoriteRecord[] {
  const key = favoriteKey(name);
  return favorites.filter(
    (favorite) => favorite.items.length === 0 && favoriteKey(favorite.name) === key,
  );
}

/**
 * A saved meal is a favorite that holds foods. (A meal typed by hand is kept as one entry typed by hand, with the
 * meal's own name and numbers; the favorites without foods are single foods remembered by name.)
 */
export const isSavedMeal = (favorite: FavoriteRecord): boolean => favorite.items.length > 0;

/**
 * The saved meals in the person's own order (moved up and down by hand). The ones never placed by hand - all of
 * them until the list is first sorted, and a meal saved after that - come first: the one used most recently,
 * then the one used most, then by name.
 */
export function savedMeals(favorites: readonly FavoriteRecord[]): FavoriteRecord[] {
  return favorites
    .filter(isSavedMeal)
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) ||
        b.useCount - a.useCount ||
        a.name.localeCompare(b.name, 'he'),
    );
}

/** The ids of the saved meals after one of them moves one place up (-1) or down (+1); the same list at an end. */
export function movedSavedMeal(
  meals: readonly FavoriteRecord[],
  id: string,
  step: -1 | 1,
): string[] {
  const ids = meals.map((meal) => meal.id);
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
  return ids;
}

/** The saved meals under the same name: saving a meal again replaces them (the latest values win). */
export function sameSavedMeals(
  favorites: readonly FavoriteRecord[],
  name: string,
): FavoriteRecord[] {
  const key = favoriteKey(name);
  return favorites.filter(
    (favorite) => isSavedMeal(favorite) && favoriteKey(favorite.name) === key,
  );
}

/** What a meal is saved with: its foods, or - when it was typed by hand - one entry typed by hand. */
export function savedMealItems(
  meal: {
    name: string;
    kcal: number;
    macros: Macros | null;
    addedSugarG: number | null;
    refinedCarbsG?: number | null;
    wholeCarbsG?: number | null;
    items: readonly FoodEntry[];
  },
  entryId: string,
): FoodEntry[] {
  if (meal.items.length > 0) return [...meal.items];
  return [
    manualEntry({
      id: entryId,
      name: meal.name,
      kcal: meal.kcal,
      macros: meal.macros,
      addedSugarG: meal.addedSugarG,
      refinedCarbsG: meal.refinedCarbsG ?? null,
      wholeCarbsG: meal.wholeCarbsG ?? null,
    }),
  ];
}
