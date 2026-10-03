import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SCHEDULE } from '../../core/schedule';
import { addDays, wallToInstant, type Clock } from '../../core/time';
import { type NewMeal, type Profile, type Repositories, type StoredPlan } from '../types';
import { createLocalRepositories } from './local-repositories';
import { MemoryStorage, browserStorage } from './storage';

const TZ = 'Asia/Jerusalem';
const TODAY = '2026-10-02';
const at = (time: string, date = TODAY): number => wallToInstant(date, time, TZ);
const DAY = 86_400_000;

const profile: Profile = {
  sex: 'female',
  birthDate: '1992-03-15',
  heightCm: 165,
  timezone: TZ,
  disclaimerAckAt: 0,
};

let storage: MemoryStorage;
let nowInstant: number;
let repos: Repositories;
const clock: Clock = { now: () => nowInstant };

function newMeal(overrides: Partial<NewMeal> = {}): NewMeal {
  return {
    id: 'meal-1',
    name: 'חביתה',
    eatenAt: at('08:30'),
    slot: 'breakfast',
    kcal: 320,
    macros: null,
    items: [],
    source: 'manual',
    ...overrides,
  };
}

beforeEach(async () => {
  storage = new MemoryStorage();
  nowInstant = at('12:00');
  repos = createLocalRepositories({ storage, clock });
  await repos.profile.save(profile);
});

describe('adding a meal', () => {
  it('derives the day on the store side, in the user zone (DB-01): 00:30 is still the day before', async () => {
    const meal = await repos.meals.add(newMeal({ eatenAt: at('00:30', TODAY) }));
    expect(meal.localDate).toBe('2026-10-01');
    expect(meal.tz).toBe(TZ);
    expect(meal.version).toBe(1);
    expect(meal.enteredAt).toBe(nowInstant);
    expect(meal.kcal).toBe(320);
  });

  it('puts 01:59 and 02:00 on different days (TIME-01, TIME-02)', async () => {
    nowInstant = at('09:00', '2026-10-03');
    const late = await repos.meals.add(newMeal({ id: 'a', eatenAt: at('01:59', '2026-10-03') }));
    const early = await repos.meals.add(newMeal({ id: 'b', eatenAt: at('02:00', '2026-10-03') }));
    expect([late.localDate, early.localDate]).toEqual([TODAY, '2026-10-03']);
  });

  it('is idempotent: the same request twice leaves one meal (INT-01)', async () => {
    const first = await repos.meals.add(newMeal());
    const second = await repos.meals.add(newMeal());
    expect(second).toEqual(first);
    expect(await repos.meals.listByDate(TODAY)).toHaveLength(1);
  });

  it('survives a double click: ten simultaneous identical requests create one meal (INT-02, INT-05)', async () => {
    await Promise.all(Array.from({ length: 10 }, () => repos.meals.add(newMeal())));
    expect(await repos.meals.listByDate(TODAY)).toHaveLength(1);
  });

  it('refuses the same id with different content (INT-03)', async () => {
    await repos.meals.add(newMeal());
    await expect(repos.meals.add(newMeal({ kcal: 999 }))).rejects.toMatchObject({
      code: 'id_conflict',
    });
  });

  it('applies the input rules: no future, no very old, bounded calories, a name (DB-03)', async () => {
    const reject = (overrides: Partial<NewMeal>) =>
      expect(
        repos.meals.add(newMeal({ id: crypto.randomUUID(), ...overrides })),
      ).rejects.toMatchObject({
        code: 'invalid',
      });
    await reject({ eatenAt: nowInstant + 6 * 60_000 });
    await reject({ eatenAt: nowInstant - 32 * DAY });
    await reject({ kcal: 3001 });
    await reject({ name: '   ' });
    await reject({ macros: { proteinG: 500.1, carbsG: 0, fatG: 0 } });
    // Boundaries that must still work:
    await repos.meals.add(newMeal({ id: 'edge-1', eatenAt: nowInstant + 5 * 60_000 }));
    await repos.meals.add(newMeal({ id: 'edge-2', eatenAt: nowInstant - 31 * DAY }));
    await repos.meals.add(newMeal({ id: 'edge-3', kcal: 3000 }));
  });

  it('caps a day at 60 meals (DB-06)', async () => {
    for (let i = 0; i < 60; i += 1) {
      await repos.meals.add(newMeal({ id: `m${i}`, kcal: 10 }));
    }
    await expect(repos.meals.add(newMeal({ id: 'm60' }))).rejects.toMatchObject({
      code: 'limit_reached',
    });
  });

  it('needs a profile first', async () => {
    const empty = createLocalRepositories({ storage: new MemoryStorage(), clock });
    await expect(empty.meals.add(newMeal())).rejects.toMatchObject({ code: 'no_profile' });
  });
});

describe('editing, deleting and undoing', () => {
  it('detects an edit from another session (INT-06)', async () => {
    const meal = await repos.meals.add(newMeal());
    const edited = await repos.meals.update(meal.id, meal.version, { kcal: 400 });
    expect(edited.version).toBe(2);
    expect(edited.kcal).toBe(400);
    await expect(repos.meals.update(meal.id, meal.version, { kcal: 500 })).rejects.toMatchObject({
      code: 'version_conflict',
    });
  });

  it('moves a meal to another day when its time changes, using the user zone', async () => {
    const meal = await repos.meals.add(newMeal({ eatenAt: at('00:30') }));
    const moved = await repos.meals.update(meal.id, 1, { eatenAt: at('23:50', '2026-10-01') });
    expect(moved.localDate).toBe('2026-10-01');
    expect(await repos.meals.listByDate(TODAY)).toHaveLength(0);
    expect(await repos.meals.listByDate('2026-10-01')).toHaveLength(1);
  });

  it('keeps an old meal editable without re-checking its original time', async () => {
    const meal = await repos.meals.add(newMeal({ eatenAt: nowInstant - 20 * DAY }));
    nowInstant += 20 * DAY; // the meal is now 40 days old: older than a new entry may be
    const edited = await repos.meals.update(meal.id, 1, { kcal: 350 });
    expect(edited.kcal).toBe(350);
    await expect(
      repos.meals.update(meal.id, 2, { eatenAt: nowInstant - 35 * DAY }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('deletes softly, restores, and deleting twice is harmless (INT-09)', async () => {
    const meal = await repos.meals.add(newMeal());
    const deleted = await repos.meals.softDelete(meal.id, meal.version);
    expect(deleted.deletedAt).toBe(nowInstant);
    expect(await repos.meals.softDelete(meal.id, 1)).toEqual(deleted); // idempotent

    const listed = await repos.meals.listByDate(TODAY);
    expect(listed).toHaveLength(1); // still there, flagged, so it can be undone
    expect(listed[0]?.deletedAt).not.toBeNull();

    const restored = await repos.meals.restore(meal.id, deleted.version);
    expect(restored.deletedAt).toBeNull();
    expect(restored.kcal).toBe(320);
  });

  it('refuses an undo that would overwrite a newer change', async () => {
    const meal = await repos.meals.add(newMeal());
    const deleted = await repos.meals.softDelete(meal.id, 1);
    await repos.meals.update(meal.id, 1, { kcal: 111 }).catch(() => undefined);
    await expect(repos.meals.restore(meal.id, deleted.version - 1)).rejects.toMatchObject({
      code: 'version_conflict',
    });
  });

  it('reports a missing meal', async () => {
    await expect(repos.meals.softDelete('nope', 1)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('food usage for search ranking', () => {
  const item = (foodId: string) => ({
    foodId,
    name: foodId,
    grams: 100,
    kcal: 100,
    proteinG: 1,
    carbsG: 1,
    fatG: 1,
  });

  it('counts foods in active, recent meals only', async () => {
    await repos.meals.add(newMeal({ id: 'a', items: [item('1561'), item('1995')] }));
    await repos.meals.add(newMeal({ id: 'b', items: [item('1561')], eatenAt: at('09:00') }));
    const gone = await repos.meals.add(
      newMeal({ id: 'c', items: [item('2721')], eatenAt: at('10:00') }),
    );
    await repos.meals.softDelete(gone.id, gone.version);
    const old = await repos.meals.add(
      newMeal({ id: 'd', items: [item('3225')], eatenAt: nowInstant - 30 * DAY }),
    );
    nowInstant += 100 * DAY; // 130 days later the old meal is outside the 120-day window
    expect(old.id).toBe('d');

    const usage = await repos.meals.foodUsage();
    expect(usage.get('1561')).toBe(2);
    expect(usage.get('1995')).toBe(1);
    expect(usage.has('2721')).toBe(false);
    expect(usage.has('3225')).toBe(false);
  });
});

describe('target plans (DB-05)', () => {
  const plan = (effectiveFrom: string, kcalTarget: number): StoredPlan => ({
    id: `plan-${effectiveFrom}`,
    effectiveFrom,
    kcalTarget,
    kcalFloor: 1200,
    macros: null,
    macroState: 'ok',
    schedule: DEFAULT_SCHEDULE,
    inputs: {} as StoredPlan['inputs'],
    plan: {} as StoredPlan['plan'],
    createdAt: 0,
  });

  it('keeps history: only today or later can be written', async () => {
    await repos.plans.save(plan(TODAY, 1800), TODAY);
    await expect(repos.plans.save(plan('2026-10-01', 1700), TODAY)).rejects.toMatchObject({
      code: 'plan_in_past',
    });
    expect((await repos.plans.list()).map((p) => p.kcalTarget)).toEqual([1800]);
  });

  it('replaces the plan that starts the same day and keeps them in date order', async () => {
    await repos.plans.save(plan(addDays(TODAY, 3), 1500), TODAY);
    await repos.plans.save(plan(TODAY, 1800), TODAY);
    await repos.plans.save(plan(TODAY, 1750), TODAY);
    const plans = await repos.plans.list();
    expect(plans.map((p) => [p.effectiveFrom, p.kcalTarget])).toEqual([
      [TODAY, 1750],
      [addDays(TODAY, 3), 1500],
    ]);
  });
});

describe('weigh-ins', () => {
  it('keeps one reading per day; a later one replaces the earlier', async () => {
    const first = await repos.weights.upsert({ id: 'w1', kg: 71.24, measuredAt: at('07:00') });
    expect(first.kg).toBe(71.2);
    const second = await repos.weights.upsert({ id: 'w2', kg: 70.8, measuredAt: at('11:00') });
    expect(second.id).toBe('w1'); // same record, updated
    expect(second.kg).toBe(70.8);
    expect(second.version).toBe(2);
    expect(await repos.weights.list()).toHaveLength(1);
  });

  it('rejects nonsense and future readings', async () => {
    await expect(
      repos.weights.upsert({ id: 'x', kg: 29, measuredAt: at('07:00') }),
    ).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(
      repos.weights.upsert({ id: 'x', kg: 70, measuredAt: nowInstant + 3_600_000 }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('removes a reading, and removing it twice is harmless', async () => {
    const reading = await repos.weights.upsert({ id: 'w1', kg: 70, measuredAt: at('07:00') });
    await repos.weights.remove(reading.id);
    await repos.weights.remove(reading.id);
    expect(await repos.weights.list()).toEqual([]);
  });
});

describe('favorites', () => {
  it('adds idempotently, counts use, removes, and enforces the cap (FAV-01)', async () => {
    const fav = { id: 'f1', name: 'שייק חלבון', kcal: 250, macros: null, items: [] };
    const first = await repos.favorites.add(fav);
    expect(await repos.favorites.add(fav)).toEqual(first);
    await repos.favorites.markUsed('f1');
    expect((await repos.favorites.list())[0]).toMatchObject({
      useCount: 1,
      lastUsedAt: nowInstant,
    });
    await repos.favorites.remove('f1');
    expect(await repos.favorites.list()).toEqual([]);

    for (let i = 0; i < 200; i += 1) {
      await repos.favorites.add({ ...fav, id: `f${i}`, name: `מועדף ${i}` });
    }
    await expect(repos.favorites.add({ ...fav, id: 'one-too-many' })).rejects.toMatchObject({
      code: 'limit_reached',
    });
  });
});

describe('export and reset', () => {
  it('exports everything with a schema version, then deletes everything', async () => {
    await repos.meals.add(newMeal());
    await repos.weights.upsert({ id: 'w1', kg: 70, measuredAt: at('07:00') });
    const exported = await repos.exportAll();
    expect(exported.schemaVersion).toBe(1);
    expect(exported.timezone).toBe(TZ);
    expect(exported.profile).toEqual(profile);
    expect(exported.meals).toHaveLength(1);
    expect(exported.weights).toHaveLength(1);

    await repos.reset();
    expect(await repos.profile.get()).toBeNull();
    expect((await repos.exportAll()).meals).toEqual([]);
  });
});

describe('storage problems', () => {
  it('sets aside unreadable data instead of crashing or silently erasing it', async () => {
    storage.setItem('diet-plan.v1', '{not json');
    expect(await repos.profile.get()).toBeNull();
    expect(storage.getItem('diet-plan.v1.corrupt')).toBe('{not json');
    await repos.profile.save(profile); // the app keeps working
    expect(await repos.profile.get()).toEqual(profile);
  });

  it('falls back to memory when browser storage is unavailable', () => {
    const { storage: fallback, persistent } = browserStorage(); // no window in this test environment
    expect(persistent).toBe(false);
    fallback.setItem('k', 'v');
    expect(fallback.getItem('k')).toBe('v');
  });
});

describe('added sugar of a meal', () => {
  it('is kept, can be edited and cleared, and is "not known" (null) when absent', async () => {
    const withSugar = await repos.meals.add(newMeal({ id: 'a', addedSugarG: 12.34 }));
    const without = await repos.meals.add(newMeal({ id: 'b' }));
    expect(withSugar.addedSugarG).toBe(12.3);
    expect(without.addedSugarG).toBeNull();
    const edited = await repos.meals.update('a', 1, { addedSugarG: 4 });
    expect(edited.addedSugarG).toBe(4);
    expect((await repos.meals.update('a', 2, { kcal: 300 })).addedSugarG).toBe(4);
    expect((await repos.meals.update('a', 3, { addedSugarG: null })).addedSugarG).toBeNull();
  });

  it('is refused when it is impossible', async () => {
    await expect(repos.meals.add(newMeal({ addedSugarG: -1 }))).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(repos.meals.add(newMeal({ addedSugarG: 501 }))).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('a retry with a different sugar value under the same id is a conflict', async () => {
    await repos.meals.add(newMeal({ id: 'a', addedSugarG: 5 }));
    await expect(repos.meals.add(newMeal({ id: 'a', addedSugarG: 9 }))).rejects.toMatchObject({
      code: 'id_conflict',
    });
  });

  it('meals saved before this field existed read back as "not known"', async () => {
    const old = {
      version: 1,
      profile,
      plans: [],
      weights: [],
      favorites: [],
      meals: [
        {
          id: 'old',
          name: 'ישן',
          localDate: TODAY,
          eatenAt: at('08:00'),
          tz: TZ,
          slot: 'breakfast',
          kcal: 100,
          proteinG: null,
          carbsG: null,
          fatG: null,
          items: [],
          source: 'manual',
          version: 1,
          enteredAt: at('08:00'),
          deletedAt: null,
        },
      ],
    };
    storage.setItem('diet-plan.v1', JSON.stringify(old));
    const [meal] = await repos.meals.listByDate(TODAY);
    expect(meal?.addedSugarG).toBeNull();
  });
});

describe('added sugar of a favorite (a meal typed by hand, remembered)', () => {
  const typed = { id: 'f1', name: 'עוגיות', kcal: 250, macros: null, items: [] };

  it('is kept when given, and is "not known" (null) when absent', async () => {
    const withSugar = await repos.favorites.add({ ...typed, addedSugarG: 12.34 });
    const without = await repos.favorites.add({ ...typed, id: 'f2', name: 'עוגה' });
    expect(withSugar.addedSugarG).toBe(12.3);
    expect(without.addedSugarG).toBeNull();
    expect((await repos.favorites.list()).map((f) => f.addedSugarG)).toEqual([12.3, null]);
  });

  it('is refused when it is impossible', async () => {
    await expect(repos.favorites.add({ ...typed, addedSugarG: -1 })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(repos.favorites.add({ ...typed, addedSugarG: 501 })).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('favorites saved before this field existed read back as "not known"', async () => {
    storage.setItem(
      'diet-plan.v1',
      JSON.stringify({
        version: 1,
        profile,
        plans: [],
        weights: [],
        meals: [],
        favorites: [{ ...typed, useCount: 0, lastUsedAt: null, version: 1 }],
      }),
    );
    expect((await repos.favorites.list())[0]?.addedSugarG).toBeNull();
  });
});
