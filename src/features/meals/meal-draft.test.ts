import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAFT_MAX_AGE_MS,
  clearMealDraft,
  isMeaningful,
  loadMealDraft,
  saveMealDraft,
  type MealDraft,
} from './meal-draft';

const NOW = 1_000_000_000_000;
const DATE = '2026-10-02';

const draft = (overrides: Partial<MealDraft> = {}): MealDraft => ({
  v: 1,
  savedAt: NOW,
  date: DATE,
  mode: 'manual',
  items: [],
  name: 'פסטה',
  kcalText: '450',
  macrosOn: false,
  proteinText: '',
  carbsText: '',
  fatText: '',
  sugarText: '',
  mealName: '',
  slotChoice: null,
  sourceHint: 'manual',
  favoriteId: null,
  ...overrides,
});

function fakeStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', fakeStorage());
  clearMealDraft();
});
afterEach(() => vi.unstubAllGlobals());

describe('the meal being added is kept when the sheet is closed', () => {
  it('brings back what was typed, for the same day', () => {
    saveMealDraft(draft());
    expect(loadMealDraft({ date: DATE, now: NOW + 60_000 })).toEqual(draft());
  });

  it('opens a draft left on the removed third tab on the search', () => {
    // An older version of the form could be closed on a "favorites" tab; that tab no longer exists.
    const stored = { ...draft(), mode: 'favorites' };
    sessionStorage.setItem('meal-draft-v1', JSON.stringify(stored));
    expect(loadMealDraft({ date: DATE, now: NOW + 60_000 })?.mode).toBe('search');
  });

  it('keeps foods too', () => {
    const withFood = draft({
      mode: 'search',
      name: '',
      kcalText: '',
      items: [
        { foodId: '1995', name: 'לחם', grams: 68, kcal: 170, proteinG: 7, carbsG: 30, fatG: 2 },
      ],
    });
    saveMealDraft(withFood);
    expect(loadMealDraft({ date: DATE, now: NOW })?.items).toHaveLength(1);
  });

  it('survives a reload of the page (it is also in the tab storage)', () => {
    saveMealDraft(draft());
    // A new page starts with nothing in memory: simulate by clearing only the memory copy.
    const stored = sessionStorage.getItem('meal-draft-v1');
    clearMealDraft();
    sessionStorage.setItem('meal-draft-v1', stored ?? '');
    expect(loadMealDraft({ date: DATE, now: NOW })).toEqual(draft());
  });

  it('is gone once cleared (after the meal is saved)', () => {
    saveMealDraft(draft());
    clearMealDraft();
    expect(loadMealDraft({ date: DATE, now: NOW })).toBeNull();
  });

  it('is not offered for another day, or when it is old', () => {
    saveMealDraft(draft());
    expect(loadMealDraft({ date: '2026-10-03', now: NOW })).toBeNull();
    expect(loadMealDraft({ date: DATE, now: NOW + DRAFT_MAX_AGE_MS + 1 })).toBeNull();
    expect(loadMealDraft({ date: DATE, now: NOW + DRAFT_MAX_AGE_MS })).not.toBeNull();
  });

  it('ignores a draft with nothing in it, and one that cannot be read', () => {
    saveMealDraft(draft({ name: '', kcalText: '' }));
    expect(loadMealDraft({ date: DATE, now: NOW })).toBeNull();
    clearMealDraft();
    sessionStorage.setItem('meal-draft-v1', '{not json');
    expect(loadMealDraft({ date: DATE, now: NOW })).toBeNull();
    sessionStorage.setItem('meal-draft-v1', JSON.stringify({ v: 1, items: 'x' }));
    expect(loadMealDraft({ date: DATE, now: NOW })).toBeNull();
  });

  it('still works in memory when the browser refuses storage', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    saveMealDraft(draft());
    expect(loadMealDraft({ date: DATE, now: NOW })).toEqual(draft());
    clearMealDraft();
    expect(loadMealDraft({ date: DATE, now: NOW })).toBeNull();
  });
});

describe('what counts as a meal worth keeping', () => {
  it('needs foods or something typed', () => {
    expect(isMeaningful(draft({ name: '', kcalText: '' }))).toBe(false);
    expect(isMeaningful(draft({ name: 'x', kcalText: '' }))).toBe(true);
    expect(isMeaningful(draft({ name: '', kcalText: '', sugarText: '5' }))).toBe(true);
    expect(isMeaningful(draft({ name: '', kcalText: '', macrosOn: true, proteinText: '20' }))).toBe(
      true,
    );
    expect(
      isMeaningful(draft({ name: '', kcalText: '', macrosOn: false, proteinText: '20' })),
    ).toBe(false);
  });
});
