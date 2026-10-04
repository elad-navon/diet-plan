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

/** The saved meals, the one used most recently first, then the one used most, then by name. */
export function savedMeals(favorites: readonly FavoriteRecord[]): FavoriteRecord[] {
  return favorites
    .filter(isSavedMeal)
    .sort(
      (a, b) =>
        (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) ||
        b.useCount - a.useCount ||
        a.name.localeCompare(b.name, 'he'),
    );
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
    }),
  ];
}
