import { describe, expect, it } from 'vitest';
import { type FavoriteRecord } from '../../data';
import { favoriteKey, matchFavorites, sameManualFavorites } from './favorites';

const favorite = (
  id: string,
  name: string,
  overrides: Partial<FavoriteRecord> = {},
): FavoriteRecord => ({
  id,
  name,
  kcal: 100,
  macros: null,
  items: [],
  addedSugarG: null,
  useCount: 0,
  lastUsedAt: null,
  version: 1,
  ...overrides,
});

describe('remembered meals typed by hand', () => {
  it('compares names without caring about spaces or case', () => {
    expect(favoriteKey('  יוגורט   Pro ')).toBe('יוגורט pro');
  });

  const list = [
    favorite('1', 'יוגורט דנונה פרו'),
    favorite('2', 'עוגיות שוקולד', { useCount: 1 }),
    favorite('3', 'שוקולד מריר 70%', { useCount: 5 }),
    favorite('4', 'לחם עם שוקולד'),
  ];

  it('finds the favorites that hold every word typed', () => {
    expect(matchFavorites(list, 'שוקולד').map((f) => f.id)).toEqual(['3', '2', '4']);
    expect(matchFavorites(list, 'עוגיות שוקולד').map((f) => f.id)).toEqual(['2']);
    expect(matchFavorites(list, 'פרו דנונה').map((f) => f.id)).toEqual(['1']);
  });

  it('puts a name that starts with the text first, then the most used', () => {
    expect(matchFavorites(list, 'שוקולד')[0]?.id).toBe('3');
  });

  it('needs at least two letters, and gives nothing when nothing matches', () => {
    expect(matchFavorites(list, 'ש')).toEqual([]);
    expect(matchFavorites(list, 'פיצה')).toEqual([]);
  });

  it('shows at most five', () => {
    const many = Array.from({ length: 9 }, (_, i) => favorite(String(i), `חטיף ${i}`));
    expect(matchFavorites(many, 'חטיף')).toHaveLength(5);
  });

  it('finds the earlier manual favorites of the same name, but not one built from foods', () => {
    const found = sameManualFavorites(
      [
        favorite('a', 'עוגיות'),
        favorite('b', ' עוגיות '),
        favorite('c', 'עוגיות', {
          items: [{ foodId: '1', name: 'x', grams: 10, kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 }],
        }),
        favorite('d', 'עוגה'),
      ],
      'עוגיות',
    );
    expect(found.map((f) => f.id)).toEqual(['a', 'b']);
  });
});
