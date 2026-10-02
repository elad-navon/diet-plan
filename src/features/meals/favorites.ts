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
