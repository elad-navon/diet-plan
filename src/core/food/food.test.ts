import { describe, expect, it } from 'vitest';
import {
  buildFoodIndex,
  buildFoodRecords,
  computeEntry,
  mealNameFromEntries,
  normalizeHebrew,
  qualityFailures,
  searchFoods,
  shortFoodName,
  sumEntries,
  tokenize,
  tokensEquivalent,
  type FoodRecord,
  type RawFoodRow,
  type RawFoodTables,
} from './index';

function food(
  id: string,
  name: string,
  kcal100 = 100,
  extra: Partial<FoodRecord> = {},
): FoodRecord {
  return { id, name, kcal100, protein100: 10, carbs100: 10, fat100: 5, units: [], ...extra };
}

describe('Hebrew normalization (FOOD-02)', () => {
  it('ignores quote marks in all their variants', () => {
    for (const variant of ["קוטג'", 'קוטג', 'קוטג׳', 'קוטג’']) {
      expect(normalizeHebrew(variant), variant).toBe('קוטג');
    }
    expect(normalizeHebrew('בר"צ')).toBe(normalizeHebrew('ברצ'));
  });

  it('ignores niqqud, case and repeated spaces, and unifies final letters', () => {
    expect(normalizeHebrew('שָׁלוֹם')).toBe('שלומ');
    expect(normalizeHebrew('  Yogurt   ')).toBe('yogurt');
    expect(normalizeHebrew('חומוס   טחינה')).toBe('חומוס טחינה');
    expect(normalizeHebrew('לחם אחיד')).toBe(normalizeHebrew('לחם  אחיד'));
    expect(normalizeHebrew('אֶרֶץ').endsWith('צ')).toBe(true);
  });

  it('treats punctuation as a separator and keeps numbers', () => {
    expect(tokenize('ביצה, קשה (שלמה)').map((t) => t.raw)).toEqual(['ביצה', 'קשה', 'שלמה']);
    expect(tokenize("קוטג' 5%").map((t) => t.raw)).toEqual(['קוטג', '5']);
  });

  it('collapses full/defective spelling', () => {
    expect(normalizeHebrew('עגבנייה')).toBe(normalizeHebrew('עגבניה'));
    expect(normalizeHebrew('קייטרינג')).toBe(normalizeHebrew('קיטרינג'));
  });

  it('matches singular and plural, but never milk with halva', () => {
    const eq = (a: string, b: string): boolean =>
      tokensEquivalent(tokenize(a)[0]!, tokenize(b)[0]!);
    expect(eq('ביצה', 'ביצים')).toBe(true);
    expect(eq('פיתה', 'פיתות')).toBe(true);
    expect(eq('תפוח', 'תפוחים')).toBe(true);
    expect(eq('עגבניות', 'עגבניה')).toBe(true);
    expect(eq('חלב', 'חלבה')).toBe(false);
    expect(eq('חלב', 'חלבים')).toBe(true);
    expect(eq('לחם', 'לחמים')).toBe(true);
    expect(eq('עוף', 'עוד')).toBe(false);
  });
});

describe('search ranking', () => {
  const catalog = [
    food('1', 'ביצה חלבון מיובש'),
    food('2', 'ביצה קשה שלמה, ללא קליפה, עם מלח'),
    food('3', 'ביצה, תרנגול הודו'),
    food('4', 'אורז, לבן, לא מבושל'),
    food('5', 'אורז לבן, מבושל, ללא תוספת שומן'),
    food('6', 'אורז עם בצל במרגרינה'),
    food('7', 'חלב 3% שומן'),
    food('8', 'חלבה פשוטה'),
    food('9', "גבינת קוטג' 5%"),
    food('10', 'עגבניה, טריה'),
    food('11', 'עגבניות מרוסקות'),
    food('12', 'לחם אחיד, כהה, פרוס'),
  ];
  const index = buildFoodIndex(catalog, new Set<string>());
  const names = (query: string, limit = 5): string[] =>
    searchFoods(index, query, { limit }).map((f) => f.id);

  it('finds foods containing every word, as whole words or word beginnings', () => {
    expect(names('ביצה קשה')).toEqual(['2']);
    expect(names('ביצ')).toEqual(expect.arrayContaining(['1', '2', '3']));
    expect(names('בצל')).toEqual(['6']);
  });

  it('ignores number, quotes and spelling variants', () => {
    expect(names('ביצים')).toEqual(expect.arrayContaining(['1', '2', '3']));
    expect(names('קוטג')).toEqual(['9']);
    expect(names("קוטג'")).toEqual(['9']);
    expect(names('עגבנייה')).toEqual(expect.arrayContaining(['10', '11']));
  });

  it('ranks milk above halva (a word beginning), which is never treated as the same word', () => {
    const result = names('חלב');
    expect(result[0]).toBe('7');
    expect(result.indexOf('7')).toBeLessThan(result.indexOf('8'));
  });

  it('puts dried and uncooked foods behind everyday ones', () => {
    expect(names('ביצה')[0]).not.toBe('1');
    expect(names('אורז', 1)).not.toEqual(['4']);
  });

  it('prefers shorter, more generic names on ties', () => {
    const tied = buildFoodIndex([food('a', 'מלפפון ירוק קטן'), food('b', 'מלפפון')], new Set());
    expect(searchFoods(tied, 'מלפפון').map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('ranks the curated everyday foods first', () => {
    const boosted = buildFoodIndex(catalog, new Set(['6']));
    expect(searchFoods(boosted, 'אורז', { limit: 1 })[0]?.id).toBe('6');
  });

  it('ranks foods the user eats often first, capped so a habit cannot bury a better match', () => {
    const usage = new Map([['3', 10]]);
    expect(searchFoods(index, 'ביצה', { usage, limit: 1 })[0]?.id).toBe('3');
  });

  it('falls back to partial matches when nothing contains every word', () => {
    // No food has both an egg and an onion: foods with either word are offered, the better match first.
    const eggAndOnion = names('ביצה בצל');
    expect(eggAndOnion).toEqual(expect.arrayContaining(['2', '6']));
    expect(['1', '2', '3']).toContain(eggAndOnion[0]);

    expect(names('אורז קוטג')).toEqual(expect.arrayContaining(['5', '9']));
    // A single unknown word is just "no result", not a fallback.
    expect(names('זבדהוכ')).toEqual([]);
  });

  it('ignores queries that are too short and respects the limit', () => {
    expect(names('א')).toEqual([]);
    expect(names('')).toEqual([]);
    expect(names('   ')).toEqual([]);
    expect(searchFoods(index, 'ביצה', { limit: 2 })).toHaveLength(2);
  });

  it('is deterministic whatever order the catalog arrives in', () => {
    const shuffled = buildFoodIndex([...catalog].reverse(), new Set());
    expect(searchFoods(shuffled, 'ביצה').map((f) => f.id)).toEqual(
      searchFoods(index, 'ביצה').map((f) => f.id),
    );
  });
});

describe('quantity to calories (FOOD-01)', () => {
  const egg = food('1561', 'ביצה שלמה בלי קליפה', 143, {
    protein100: 12.6,
    carbs100: 0.7,
    fat100: 9.5,
    units: [
      { name: 'יחידה בינונית', grams: 49.5 },
      { name: 'יחידה גדולה', grams: 58 },
    ],
    defaultUnit: 'יחידה בינונית',
  });

  const entry = (result: ReturnType<typeof computeEntry>) => {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a successful entry');
    return result.entry;
  };

  it('scales by grams and rounds each item once', () => {
    const e = entry(computeEntry(egg, { kind: 'grams', grams: 100 }));
    expect(e).toMatchObject({ grams: 100, kcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 });
    expect(entry(computeEntry(egg, { kind: 'grams', grams: 150 })).kcal).toBe(215); // 214.5 rounds up
  });

  it('rounds .x5 up despite floating-point noise (0.7 x 1.5 is stored as 1.0499999999999998)', () => {
    expect(entry(computeEntry(egg, { kind: 'grams', grams: 150 })).carbsG).toBe(1.1);
  });

  it('converts units to grams', () => {
    const e = entry(computeEntry(egg, { kind: 'unit', unit: 'יחידה בינונית', count: 2 }));
    expect(e).toMatchObject({ grams: 99, unit: 'יחידה בינונית', count: 2, kcal: 142 });
    const half = entry(computeEntry(egg, { kind: 'unit', unit: 'יחידה גדולה', count: 0.5 }));
    expect(half.grams).toBe(29);
  });

  it('enforces the quantity limits (1-5000 g, 0.25-50 units in quarter steps)', () => {
    const grams = (g: number) => computeEntry(egg, { kind: 'grams', grams: g });
    expect(grams(1).ok).toBe(true);
    expect(grams(5000).ok).toBe(true);
    expect(grams(0.9)).toEqual({ ok: false, error: 'grams_out_of_range' });
    expect(grams(5001)).toEqual({ ok: false, error: 'grams_out_of_range' });
    expect(grams(Number.NaN)).toEqual({ ok: false, error: 'grams_out_of_range' });

    const count = (c: number) => computeEntry(egg, { kind: 'unit', unit: 'יחידה גדולה', count: c });
    expect(count(0.25).ok).toBe(true);
    expect(count(50).ok).toBe(true);
    expect(count(0.1)).toEqual({ ok: false, error: 'count_out_of_range' });
    expect(count(51)).toEqual({ ok: false, error: 'count_out_of_range' });
    expect(count(1.3)).toEqual({ ok: false, error: 'count_not_in_steps' });
    expect(computeEntry(egg, { kind: 'unit', unit: 'כף', count: 1 })).toEqual({
      ok: false,
      error: 'unknown_unit',
    });
    // 100 units x 58 g would be fine for the count limit, but 50 x 58 g = 2900 g is still within grams.
    expect(count(50).ok).toBe(true);
  });

  it('sums rounded items instead of rounding a total', () => {
    const a = entry(computeEntry(egg, { kind: 'grams', grams: 150 }));
    const b = entry(computeEntry(egg, { kind: 'grams', grams: 150 }));
    expect(sumEntries([a, b])).toEqual({ kcal: 430, proteinG: 37.8, carbsG: 2.2, fatG: 28.6 });
    expect(sumEntries([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('names a meal after its foods, within 80 characters', () => {
    const a = entry(computeEntry(egg, { kind: 'grams', grams: 50 }));
    const bread = entry(
      computeEntry(food('9', 'לחם אחיד, כהה, פרוס', 237), { kind: 'grams', grams: 40 }),
    );
    expect(shortFoodName('ביצה קשה שלמה, ללא קליפה')).toBe('ביצה קשה שלמה');
    expect(shortFoodName(',x')).toBe(',x'); // a head that is too short falls back to the full name
    expect(mealNameFromEntries([a, bread, a])).toBe('ביצה שלמה בלי קליפה + לחם אחיד');

    const longNames = Array.from({ length: 12 }, (_, i) =>
      entry(
        computeEntry(food(`${i}`, `מאכל ארוך מאוד מספר ${i}`, 100), { kind: 'grams', grams: 10 }),
      ),
    );
    const long = mealNameFromEntries(longNames);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('building the database from the Ministry tables (FOOD-04)', () => {
  const row = (over: Partial<RawFoodRow>): RawFoodRow => ({
    Code: 1,
    shmmitzrach: 'ביצה',
    food_energy: 143,
    protein: 12.6,
    total_fat: 9.5,
    carbohydrates: 0.7,
    alcohol: 0,
    ...over,
  });

  const tables = (foods: RawFoodRow[]): RawFoodTables => ({
    foods,
    units: [
      { smlmida: '100', shmmida: 'יחידה' },
      { smlmida: '103', shmmida: 'יחידה  בינונית' },
      { smlmida: '300', shmmida: 'כף' },
      { smlmida: '9', shmmida: 'גרמים' },
      { smlmida: '10', shmmida: 'קילוגרם' },
    ],
    weights: [
      { mmitzrach: '1', mida: '103', mishkal: '49.5' },
      { mmitzrach: '1', mida: '100', mishkal: '50.00000076293945' },
      { mmitzrach: '1', mida: '9', mishkal: '1' },
      { mmitzrach: '1', mida: '10', mishkal: '1000' },
      { mmitzrach: 1, mida: 100, mishkal: 55 }, // duplicate unit name: first one wins
      { mmitzrach: '1', mida: '300', mishkal: '0' }, // zero grams: dropped
      { mmitzrach: '1', mida: '999', mishkal: '10' }, // unknown unit code: dropped
      { mmitzrach: '2', mida: '300', mishkal: '15' },
    ],
  });

  it('keeps good foods, maps units, drops grams/kg, rounds, sorts and picks a default', () => {
    const { foods, report } = buildFoodRecords(
      tables([row({ Code: 2, shmmitzrach: 'טחינה', food_energy: 665 }), row({})]),
    );
    expect(report.kept).toBe(2);
    expect(foods.map((f) => f.id)).toEqual(['1', '2']); // sorted by code
    expect(foods[0]?.units).toEqual([
      { name: 'יחידה בינונית', grams: 49.5 }, // double space collapsed
      { name: 'יחידה', grams: 50 }, // float noise removed
    ]);
    expect(foods[0]?.defaultUnit).toBe('יחידה');
    expect(foods[1]?.units).toEqual([{ name: 'כף', grams: 15 }]);
    expect(foods[1]?.defaultUnit).toBe('כף');
    expect(report.foodsWithUnits).toBe(2);
  });

  it('skips unusable rows and counts each reason', () => {
    const { foods, report } = buildFoodRecords(
      tables([
        row({}),
        row({}), // duplicate code
        row({ Code: null }),
        row({ Code: 3, shmmitzrach: '   ' }),
        row({ Code: 4, food_energy: null }),
        row({ Code: 5, food_energy: 950 }),
        row({ Code: 6, protein: -1 }),
        row({ Code: 7, protein: 60, total_fat: 40, carbohydrates: 30 }), // 130 g in 100 g
      ]),
    );
    expect(foods.map((f) => f.id)).toEqual(['1']);
    expect(report.skipped).toEqual({
      bad_code: 1,
      duplicate_code: 1,
      no_name: 1,
      no_energy: 1,
      energy_out_of_range: 1,
      negative_macro: 1,
      macros_exceed_100g: 1,
    });
    expect(report.skippedExamples).toHaveLength(7);
  });

  it('treats missing macros as 0 and counts them', () => {
    const { foods, report } = buildFoodRecords(tables([row({ protein: null })]));
    expect(foods[0]?.protein100).toBe(0);
    expect(report.macroMissing).toBe(1);
  });

  it('accepts numbers delivered as strings', () => {
    const { foods } = buildFoodRecords(
      tables([row({ Code: '1', food_energy: '143', protein: '12.6' })]),
    );
    expect(foods[0]).toMatchObject({ id: '1', kcal100: 143, protein100: 12.6 });
  });

  it('reports - but keeps - foods whose calories do not match their macros', () => {
    const { foods, report } = buildFoodRecords(
      tables([row({}), row({ Code: 9, shmmitzrach: 'מוזר', food_energy: 700 })]),
    );
    expect(foods).toHaveLength(2);
    expect(report.atwaterOutliers.map((o) => o.id)).toEqual(['9']);
  });

  it('accounts for alcohol when checking calories', () => {
    const { report } = buildFoodRecords(
      tables([
        row({ Code: 3, food_energy: 70, protein: 0, total_fat: 0, carbohydrates: 0, alcohol: 10 }),
      ]),
    );
    expect(report.atwaterOutliers).toEqual([]);
  });

  it('is deterministic: the same data always gives the same records', () => {
    const data = tables([row({}), row({ Code: 2, shmmitzrach: 'טחינה', food_energy: 665 })]);
    expect(buildFoodRecords(data).foods).toEqual(buildFoodRecords(data).foods);
    const reversed = { ...data, foods: [...data.foods].reverse() };
    expect(buildFoodRecords(reversed).foods).toEqual(buildFoodRecords(data).foods);
  });

  it('fails the quality gate when too much data is unusable', () => {
    const ok = buildFoodRecords(tables([row({})]));
    expect(qualityFailures(ok.report)).toEqual([]);

    const broken = buildFoodRecords(
      tables([
        row({}),
        ...Array.from({ length: 5 }, (_, i) => row({ Code: 100 + i, food_energy: null })),
      ]),
    );
    expect(qualityFailures(broken.report).join(' ')).toContain('skipped');

    const empty = buildFoodRecords(tables([]));
    expect(qualityFailures(empty.report)).toContain('no foods were kept');
  });
});
