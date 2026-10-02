import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  SOURCE_LIMITS,
  buildFoodIndex,
  searchFoods,
  type FoodDb,
  type FoodIndex,
} from '../src/core/food';
import { POPULAR_FOOD_IDS } from '../src/core/food/popular';

/**
 * Checks on the generated food database itself (docs/TEST_PLAN.md I.7):
 * FOOD-03 golden queries, FOOD-04 data quality, FOOD-07 size and speed.
 */

const DB_PATH = new URL('../src/assets/food-db/food-db.json', import.meta.url);
const raw = readFileSync(DB_PATH);
const db = JSON.parse(raw.toString('utf8')) as FoodDb;
let index: FoodIndex;

beforeAll(() => {
  index = buildFoodIndex(db.foods);
});

describe('FOOD-04: data quality of the generated database', () => {
  it('is complete and describes where it came from', () => {
    expect(db.foods.length).toBeGreaterThan(4000);
    expect(db.meta.count).toBe(db.foods.length);
    expect(db.meta.sourceUrl).toBe('https://data.gov.il/dataset/nutrition-database');
    expect(db.meta.license).toBeTruthy();
    expect(db.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('has valid, in-bounds values for every food', () => {
    const ids = new Set<string>();
    for (const food of db.foods) {
      expect(ids.has(food.id), `duplicate id ${food.id}`).toBe(false);
      ids.add(food.id);
      expect(food.name.trim(), `name of ${food.id}`).not.toBe('');
      expect(food.name).toBe(food.name.replace(/\s+/g, ' ').trim());
      for (const value of [food.kcal100, food.protein100, food.carbs100, food.fat100]) {
        expect(Number.isFinite(value), `${food.id} has a non-number`).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(food.kcal100, `${food.id} ${food.name}`).toBeLessThanOrEqual(SOURCE_LIMITS.maxKcal100);
      expect(food.protein100 + food.carbs100 + food.fat100).toBeLessThanOrEqual(
        SOURCE_LIMITS.maxMacroSumG,
      );

      const unitNames = new Set<string>();
      for (const unit of food.units) {
        expect(unit.grams, `${food.id} ${unit.name}`).toBeGreaterThan(0);
        expect(unit.grams).toBeLessThanOrEqual(SOURCE_LIMITS.maxUnitGrams);
        // No float noise such as 25.20000076293945 from the source.
        expect(Math.abs(unit.grams * 100 - Math.round(unit.grams * 100))).toBeLessThan(1e-6);
        expect(unitNames.has(unit.name), `${food.id} repeats unit ${unit.name}`).toBe(false);
        unitNames.add(unit.name);
      }
      if (food.defaultUnit !== undefined) {
        expect(unitNames.has(food.defaultUnit), `${food.id} default unit`).toBe(true);
      }
    }
  });

  it('is sorted by id, so the output is deterministic', () => {
    const numericIds = db.foods.map((food) => Number(food.id));
    expect(numericIds).toEqual([...numericIds].sort((a, b) => a - b));
  });

  it('has every food on the popularity list', () => {
    const missing = [...POPULAR_FOOD_IDS].filter((id) => !db.foods.some((food) => food.id === id));
    expect(missing).toEqual([]);
  });

  it('keeps typical foods at believable values (spot checks)', () => {
    const byId = new Map(db.foods.map((food) => [food.id, food]));
    const egg = byId.get('1561');
    expect(egg?.kcal100).toBe(143);
    expect(egg?.units.find((u) => u.name === 'יחידה בינונית')?.grams).toBe(49.5);
    expect(byId.get('2721')?.kcal100).toBe(130); // cooked white rice, not the 365 kcal raw grain
  });
});

describe('FOOD-03: golden queries', () => {
  /**
   * What a person means by a short everyday query. The expected food must appear among the first
   * three results. Reviewed by the app owner (docs/IMPLEMENTATION_PLAN.md stage 4).
   */
  const golden: [query: string, expectedIds: string[]][] = [
    ['ביצה', ['1561', '1564', '1573', '1570']],
    ['ביצים', ['1561', '1564', '1573', '1570']],
    ['חביתה', ['1573', '1570']],
    ['שקשוקה', ['1591', '1594']],
    ['לחם', ['1940', '1919', '2062', '1995']],
    ['פיתה', ['1955', '9667', '9666']],
    ['חלה', ['1965']],
    ["קוטג'", ['494', '500', '9902', '493']],
    ['קוטג', ['494', '500', '9902', '493']],
    ['גבינה לבנה', ['8595', '532']],
    ['גבינה צהובה', ['8609', '8608']],
    ['חלב', ['15', '8616', '9864']],
    ['יוגורט', ['62']],
    ['אורז', ['2721']],
    ['פסטה', ['8552', '2659']],
    ['תפוחי אדמה', ['3464', '3459', '3492']],
    ['חזה עוף', ['811', '803', '9755']],
    ['שניצל', ['9755']],
    ['טונה', ['1360', '1358']],
    ['חומוס', ['1657', '1653', '1640']],
    ['טחינה', ['1898', '1887']],
    ['עגבנייה', ['3663']],
    ['עגבניה', ['3663']],
    ['מלפפון', ['3793']],
    ['תפוח', ['3201']],
    ['בננה', ['3225']],
    ['תפוז', ['3120']],
    ['אבוקדו', ['3223']],
    ['קפה', ['4806', '4802', '4814']],
    ['במבה', ['2581']],
    ['פלאפל', ['10052', '9596']],
    ['פיצה', ['2913']],
    ['שמן זית', ['4443']],
    ['שוקולד', ['4644']],
    ['שיבולת שועל', ['2710']],
    ['אגוזי מלך', ['1854']],
    ['בורקס', ['2988']],
    ['סושי', ['3079']],
  ];

  it.each(golden)('"%s" finds an expected food in the top 3', (query, expectedIds) => {
    const top = searchFoods(index, query, { limit: 3 }).map((food) => food.id);
    expect(
      top.some((id) => expectedIds.includes(id)),
      `top 3 for "${query}": ${searchFoods(index, query, { limit: 3 })
        .map((f) => f.name)
        .join(' | ')}`,
    ).toBe(true);
  });

  it('does not offer halva for milk, nor dried or uncooked food first', () => {
    const milk = searchFoods(index, 'חלב', { limit: 10 }).map((f) => f.name);
    expect(milk.filter((name) => name.includes('חלבה'))).toEqual([]);
    const rice = searchFoods(index, 'אורז', { limit: 1 })[0];
    expect(rice?.name).not.toContain('לא מבושל');
  });
});

describe('FOOD-07: size and speed', () => {
  it('stays under 400 KB gzipped, so it can load on demand over mobile data', () => {
    expect(gzipSync(raw).length).toBeLessThan(400 * 1024);
  });

  it('searches in well under 50 ms', () => {
    const queries = ['ביצה', 'לחם', 'קוטג', 'חזה עוף', 'שמן זית', 'סלט', 'מלפפון', 'אורז'];
    searchFoods(index, 'ביצה'); // warm-up
    const times: number[] = [];
    for (let round = 0; round < 10; round += 1) {
      for (const query of queries) {
        const start = performance.now();
        searchFoods(index, query);
        times.push(performance.now() - start);
      }
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)] ?? Infinity).toBeLessThan(50);
  });
});

describe('sugar and fiber in the generated database', () => {
  const named = (prefix: string) => db.foods.find((food) => food.name.startsWith(prefix));

  it('has sugar for most foods, and the numbers are consistent', () => {
    const withSugar = db.foods.filter((food) => food.sugar100 !== undefined);
    expect(withSugar.length / db.foods.length).toBeGreaterThan(0.85);
    for (const food of db.foods) {
      if (food.sugar100 !== undefined) {
        expect(food.sugar100, food.name).toBeGreaterThanOrEqual(0);
        expect(food.sugar100, food.name).toBeLessThanOrEqual(100);
      }
      if (food.addedSugar100 !== undefined) {
        expect(food.sugar100, `${food.name}: added sugar without total`).toBeDefined();
        expect(food.addedSugar100, food.name).toBeGreaterThanOrEqual(0);
        expect(food.addedSugar100, food.name).toBeLessThanOrEqual(food.sugar100 ?? 0);
      }
      if (food.fiber100 !== undefined) expect(food.fiber100, food.name).toBeLessThanOrEqual(100);
    }
  });

  it('does not count fresh whole fruit, milk or plain bread as added sugar', () => {
    for (const prefix of [
      'תפוח עץ, עם קליפה (ללא',
      'בננה, טריה',
      'אבטיח, טרי',
      'אפרסק, טרי',
      'לחם לבן, קלוי',
    ]) {
      expect(named(prefix)?.addedSugar100, prefix).toBe(0);
    }
    expect(named('חלב 3% שומן, תנובה')?.addedSugar100).toBe(0);
  });

  it('counts sugar, honey, chocolate and juice', () => {
    expect(named('סוכר, לבן, רגיל')?.addedSugar100).toBeGreaterThan(90);
    expect(named('דבש')?.addedSugar100).toBeGreaterThan(70);
    expect(named('שוקולד עם ביסקויט')?.addedSugar100).toBeGreaterThan(30);
    expect(named('מיץ תפוחים, משקה סיידר')?.addedSugar100).toBeGreaterThan(8);
  });

  it('no fresh fruit is flagged as having added sugar', () => {
    const fresh = db.foods.filter((food) =>
      /^(תפוח עץ|בננה|אגס|אפרסק|ענבים|תפוז|קיווי|מנגו|אבטיח|מלון|שזיף|נקטרינה|משמש), (טרי|טריה)/.test(
        food.name,
      ),
    );
    expect(fresh.length).toBeGreaterThan(8);
    expect(fresh.filter((food) => (food.addedSugar100 ?? 0) > 0).map((food) => food.name)).toEqual(
      [],
    );
  });
});
