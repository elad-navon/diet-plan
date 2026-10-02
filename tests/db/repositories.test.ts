import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FoodEntry } from '../../src/core/food';
import { computePlan, type PlanInputs } from '../../src/core/nutrition';
import { DEFAULT_SCHEDULE } from '../../src/core/schedule';
import {
  addDays,
  localDateOf,
  offsetClock,
  systemClock,
  wallToInstant,
  type Clock,
} from '../../src/core/time';
import {
  DataError,
  createSupabaseRepositories,
  type DataErrorCode,
  type NewMeal,
  type Profile,
  type Repositories,
  type StoredPlan,
} from '../../src/data';
import { createTestDb, failureOf, type Session, type TestDb } from './harness';
import { createPgliteGateway } from './pglite-gateway';

/**
 * The server repositories (src/data/supabase) running against the real database schema: what the app will
 * do in production, minus only the HTTP hop (which is checked against the real project).
 */

const TZ = 'Asia/Jerusalem';
const MINUTE = 60_000;
const HOUR = 3_600_000;

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

const profile: Profile = {
  sex: 'female',
  birthDate: '1992-03-15',
  heightCm: 165,
  timezone: TZ,
  disclaimerAckAt: 1_790_000_000_000,
};

function reposFor(session: Session, clock: Clock = systemClock): Repositories {
  return createSupabaseRepositories({ gateway: createPgliteGateway(session), clock });
}

async function newUserRepos(
  clock: Clock = systemClock,
): Promise<{ id: string; repos: Repositories }> {
  const id = await db.newUser();
  const repos = reposFor(db.as(id), clock);
  await repos.profile.save(profile);
  return { id, repos };
}

function storedPlan(today: string, overrides: Partial<StoredPlan> = {}): StoredPlan {
  const inputs: PlanInputs = {
    sex: 'female',
    birthDate: '1992-03-15',
    onDate: today,
    heightCm: 165,
    weightKg: 71,
    activity: 'light',
    goal: { type: 'lose', targetWeightKg: 62, request: { mode: 'rate', weeklyRateKg: 0.5 } },
  };
  const outcome = computePlan(inputs);
  if (outcome.kind !== 'plan') throw new Error('test setup: expected a plan');
  const { plan } = outcome;
  return {
    id: randomUUID(),
    effectiveFrom: today,
    kcalTarget: plan.kcalTarget,
    kcalFloor: plan.kcalFloor,
    macros: plan.macros,
    macroState: plan.macroState,
    schedule: DEFAULT_SCHEDULE,
    inputs,
    plan,
    createdAt: systemClock.now(),
    ...overrides,
  };
}

const todayDate = () => localDateOf(systemClock.now(), TZ);

function newMeal(overrides: Partial<NewMeal> = {}): NewMeal {
  return {
    id: randomUUID(),
    name: 'חביתה',
    eatenAt: systemClock.now() - 2 * HOUR,
    slot: 'breakfast',
    kcal: 320,
    macros: { proteinG: 20, carbsG: 2, fatG: 25 },
    items: [],
    source: 'manual',
    ...overrides,
  };
}

async function codeOf(work: Promise<unknown>): Promise<DataErrorCode | 'ok'> {
  try {
    await work;
    return 'ok';
  } catch (error) {
    return error instanceof DataError ? error.code : (`not a DataError: ${String(error)}` as never);
  }
}

describe('profile and plans', () => {
  it('a new user has no profile; saving one and reading it back gives the same values', async () => {
    const id = await db.newUser();
    const repos = reposFor(db.as(id));
    expect(await repos.profile.get()).toBeNull();
    await repos.profile.save(profile);
    expect(await repos.profile.get()).toEqual(profile);
  });

  it('keeps the engine plan, inputs and schedule exactly as saved', async () => {
    const { repos } = await newUserRepos();
    const saved = storedPlan(todayDate());
    await repos.plans.save(saved, todayDate());
    const [loaded] = await repos.plans.list();
    expect(loaded).toBeDefined();
    expect(loaded).toEqual({ ...saved, createdAt: loaded?.createdAt });
    expect(loaded?.createdAt).toBeGreaterThan(0);
  });

  it('a plan for a past day is refused (on the phone, and by the server when the phone is wrong)', async () => {
    const { repos } = await newUserRepos();
    const yesterday = addDays(todayDate(), -1);
    expect(await codeOf(repos.plans.save(storedPlan(yesterday), todayDate()))).toBe('plan_in_past');
    // A phone whose date is wrong still cannot rewrite history: the server decides.
    expect(await codeOf(repos.plans.save(storedPlan(yesterday), addDays(yesterday, -5)))).toBe(
      'plan_in_past',
    );
  });

  it('saving a plan before the profile exists is reported as no_profile', async () => {
    const repos = reposFor(db.as(await db.newUser()));
    expect(await codeOf(repos.plans.save(storedPlan(todayDate()), todayDate()))).toBe('no_profile');
  });
});

describe('meals', () => {
  it('adds a meal and returns it as the app expects, with the server-derived day', async () => {
    const { repos } = await newUserRepos();
    const items: FoodEntry[] = [
      { foodId: 'f-1', name: 'ביצה', grams: 100, kcal: 150, proteinG: 12.5, carbsG: 1, fatG: 10 },
    ];
    const input = newMeal({ items, source: 'food_db', foodDbVersion: 'abc123' });
    const meal = await repos.meals.add(input);
    expect(meal).toMatchObject({
      id: input.id,
      name: 'חביתה',
      eatenAt: input.eatenAt,
      tz: TZ,
      localDate: localDateOf(input.eatenAt, TZ),
      slot: 'breakfast',
      kcal: 320,
      proteinG: 20,
      carbsG: 2,
      fatG: 25,
      items,
      source: 'food_db',
      foodDbVersion: 'abc123',
      version: 1,
      deletedAt: null,
    });
    expect(meal.enteredAt).toBeGreaterThan(input.eatenAt);
  });

  it('keeps a meal without macros as null (not zero)', async () => {
    const { repos } = await newUserRepos();
    const meal = await repos.meals.add(newMeal({ macros: null }));
    expect([meal.proteinG, meal.carbsG, meal.fatG]).toEqual([null, null, null]);
  });

  it('is idempotent, and refuses the same id with different content', async () => {
    const { repos } = await newUserRepos();
    const input = newMeal();
    const first = await repos.meals.add(input);
    expect(await repos.meals.add(input)).toEqual(first);
    expect(await codeOf(repos.meals.add({ ...input, kcal: 999 }))).toBe('id_conflict');
    expect(await repos.meals.listByDate(first.localDate)).toHaveLength(1);
  });

  it("checks the input before sending (name, calories, macros) with the app's own rules", async () => {
    const { repos } = await newUserRepos();
    for (const bad of [
      { name: '  ' },
      { kcal: 3001 },
      { macros: { proteinG: 5, carbsG: null, fatG: null } },
    ]) {
      expect(await codeOf(repos.meals.add(newMeal(bad as Partial<NewMeal>)))).toBe('invalid');
    }
  });

  it('keeps the added sugar of a meal, and says unknown (null) when there is none', async () => {
    const { repos } = await newUserRepos();
    const withSugar = await repos.meals.add(newMeal({ addedSugarG: 12.3 }));
    const without = await repos.meals.add(newMeal());
    expect(withSugar.addedSugarG).toBe(12.3);
    expect(without.addedSugarG).toBeNull();
    const edited = await repos.meals.update(withSugar.id, 1, { addedSugarG: 4.5 });
    expect(edited.addedSugarG).toBe(4.5);
    const kept = await repos.meals.update(withSugar.id, 2, { kcal: 300 });
    expect(kept.addedSugarG).toBe(4.5);
    const cleared = await repos.meals.update(withSugar.id, 3, { addedSugarG: null });
    expect(cleared.addedSugarG).toBeNull();
  });

  it('refuses an impossible added sugar before sending it', async () => {
    const { repos } = await newUserRepos();
    expect(await codeOf(repos.meals.add(newMeal({ addedSugarG: -1 })))).toBe('invalid');
    expect(await codeOf(repos.meals.add(newMeal({ addedSugarG: 501 })))).toBe('invalid');
  });

  it('lists a day, including deleted meals, and a range', async () => {
    const { repos } = await newUserRepos();
    // Two times on the same past day, whatever the time of day is now.
    const yesterday = addDays(todayDate(), -1);
    const a = await repos.meals.add(newMeal({ eatenAt: wallToInstant(yesterday, '08:00', TZ) }));
    const b = await repos.meals.add(newMeal({ eatenAt: wallToInstant(yesterday, '09:00', TZ) }));
    await repos.meals.softDelete(b.id, b.version);
    const day = await repos.meals.listByDate(a.localDate);
    expect(day.map((m) => m.id)).toEqual([a.id, b.id]);
    expect(day[1]?.deletedAt).not.toBeNull();
    const range = await repos.meals.listRange(addDays(a.localDate, -3), addDays(a.localDate, 3));
    expect(range).toHaveLength(2);
    expect(await repos.meals.listRange(addDays(a.localDate, 1), addDays(a.localDate, 5))).toEqual(
      [],
    );
  });

  it('edits with the right version, clears macros on request, and refuses a stale version', async () => {
    const { repos } = await newUserRepos();
    const meal = await repos.meals.add(newMeal());
    const edited = await repos.meals.update(meal.id, 1, { name: 'חביתה גדולה', kcal: 400 });
    expect(edited).toMatchObject({ name: 'חביתה גדולה', kcal: 400, version: 2, proteinG: 20 });
    const cleared = await repos.meals.update(meal.id, 2, { macros: null });
    expect([cleared.proteinG, cleared.carbsG, cleared.fatG]).toEqual([null, null, null]);
    expect(await codeOf(repos.meals.update(meal.id, 1, { kcal: 1 }))).toBe('version_conflict');
    expect(await codeOf(repos.meals.update(randomUUID(), 1, { kcal: 1 }))).toBe('not_found');
  });

  it('moves a meal to another time and day', async () => {
    const { repos } = await newUserRepos();
    const meal = await repos.meals.add(newMeal());
    const yesterday = systemClock.now() - 26 * HOUR;
    const moved = await repos.meals.update(meal.id, 1, { eatenAt: yesterday });
    expect(moved.localDate).toBe(localDateOf(yesterday, TZ));
    expect(moved.eatenAt).toBe(yesterday);
  });

  it('soft-deletes and restores, and a repeated delete changes nothing', async () => {
    const { repos } = await newUserRepos();
    const meal = await repos.meals.add(newMeal());
    const deleted = await repos.meals.softDelete(meal.id, 1);
    expect(deleted.deletedAt).not.toBeNull();
    expect((await repos.meals.softDelete(meal.id, 1)).version).toBe(deleted.version);
    const restored = await repos.meals.restore(meal.id, deleted.version);
    expect(restored.deletedAt).toBeNull();
    expect(await codeOf(repos.meals.restore(meal.id, 1))).toBe('ok'); // already back: no-op
  });

  it('refuses the 61st meal of a day', async () => {
    const { repos } = await newUserRepos();
    const at = systemClock.now() - 3 * HOUR;
    for (let i = 0; i < 60; i += 1) await repos.meals.add(newMeal({ eatenAt: at }));
    expect(await codeOf(repos.meals.add(newMeal({ eatenAt: at })))).toBe('limit_reached');
  }, 60_000);

  it('the server, not the phone, decides what counts as the future', async () => {
    // A phone whose clock runs an hour fast thinks "30 minutes from now" is already past...
    const fast = offsetClock(systemClock, HOUR);
    const { repos } = await newUserRepos(fast);
    expect(
      await codeOf(repos.meals.add(newMeal({ eatenAt: systemClock.now() + 30 * MINUTE }))),
    ).toBe('in_future');
  });

  it('and what counts as too long ago', async () => {
    // A phone whose clock is 5 days slow sees a 33-day-old time as 28 days old, which the app allows.
    const slow = offsetClock(systemClock, -5 * 86_400_000);
    const { repos } = await newUserRepos(slow);
    expect(
      await codeOf(repos.meals.add(newMeal({ eatenAt: systemClock.now() - 33 * 86_400_000 }))),
    ).toBe('too_old');
  });

  it('counts how often each food was used (for search ranking)', async () => {
    const { repos } = await newUserRepos();
    const entry = (foodId: string): FoodEntry => ({
      foodId,
      name: foodId,
      grams: 100,
      kcal: 100,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
    });
    await repos.meals.add(newMeal({ items: [entry('a'), entry('b')], source: 'food_db' }));
    await repos.meals.add(newMeal({ items: [entry('a')], source: 'food_db' }));
    const deleted = await repos.meals.add(newMeal({ items: [entry('b')], source: 'food_db' }));
    await repos.meals.softDelete(deleted.id, deleted.version);
    expect(await repos.meals.foodUsage()).toEqual(
      new Map([
        ['a', 2],
        ['b', 1],
      ]),
    );
  });
});

describe('weigh-ins', () => {
  it('records a weight, replaces the same day, lists and removes', async () => {
    const { repos } = await newUserRepos();
    const at = systemClock.now() - HOUR;
    const first = await repos.weights.upsert({ id: randomUUID(), kg: 71.4, measuredAt: at });
    expect(first).toMatchObject({ kg: 71.4, localDate: localDateOf(at, TZ), version: 1 });
    const second = await repos.weights.upsert({ id: randomUUID(), kg: 71.0, measuredAt: at });
    expect(second).toMatchObject({ id: first.id, kg: 71, version: 2 });
    expect(await repos.weights.list()).toHaveLength(1);
    await repos.weights.remove(first.id);
    expect(await repos.weights.list()).toEqual([]);
  });

  it('refuses impossible weights and readings from the future', async () => {
    const { repos } = await newUserRepos(offsetClock(systemClock, 2 * 86_400_000));
    expect(await codeOf(repos.weights.upsert({ id: randomUUID(), kg: 5, measuredAt: 1 }))).toBe(
      'invalid',
    );
    expect(
      await codeOf(
        repos.weights.upsert({
          id: randomUUID(),
          kg: 70,
          measuredAt: systemClock.now() + 86_400_000,
        }),
      ),
    ).toBe('in_future');
  });
});

describe('favorites', () => {
  const favorite = () => ({
    id: randomUUID(),
    name: 'שייק חלבון',
    kcal: 180,
    macros: { proteinG: 25, carbsG: 8, fatG: 4 },
    items: [] as FoodEntry[],
  });

  it('adds (idempotently), counts uses, lists and removes', async () => {
    const { repos } = await newUserRepos();
    const input = favorite();
    const added = await repos.favorites.add(input);
    expect(added).toMatchObject({
      name: 'שייק חלבון',
      kcal: 180,
      macros: input.macros,
      useCount: 0,
      lastUsedAt: null,
    });
    expect(await repos.favorites.add(input)).toEqual(added); // a retry gives the same favorite
    await repos.favorites.markUsed(input.id);
    const [listed] = await repos.favorites.list();
    expect(listed?.useCount).toBe(1);
    expect(listed?.lastUsedAt).not.toBeNull();
    await repos.favorites.remove(input.id);
    expect(await repos.favorites.list()).toEqual([]);
  });

  it("someone else's id cannot be taken over", async () => {
    const { repos: owner } = await newUserRepos();
    const { repos: other } = await newUserRepos();
    const input = favorite();
    await owner.favorites.add(input);
    expect(await codeOf(other.favorites.add(input))).toBe('id_conflict');
  });

  it('allows 200 and refuses more', async () => {
    const { id, repos } = await newUserRepos();
    await db.admin.query(
      `insert into public.favorites (id, user_id, name, kcal)
       select gen_random_uuid(), $1, 'x' || n, 1 from generate_series(1, 200) n`,
      [id],
    );
    expect(await codeOf(repos.favorites.add(favorite()))).toBe('limit_reached');
  });
});

describe('who can see what, and failures', () => {
  it('each user only ever gets their own data back', async () => {
    const a = await newUserRepos();
    const b = await newUserRepos();
    const meal = await a.repos.meals.add(newMeal());
    await a.repos.weights.upsert({
      id: randomUUID(),
      kg: 70,
      measuredAt: systemClock.now() - HOUR,
    });
    expect(await b.repos.meals.listByDate(meal.localDate)).toEqual([]);
    expect(await b.repos.weights.list()).toEqual([]);
    expect(await codeOf(b.repos.meals.update(meal.id, 1, { kcal: 1 }))).toBe('not_found');
  });

  it('a session without a user is reported as unauthenticated', async () => {
    const repos = reposFor(db.noUser);
    expect(await codeOf(repos.meals.add(newMeal()))).toBe('unauthenticated');
  });

  it('an anonymous visitor is reported as unauthenticated too', async () => {
    const repos = reposFor(db.anon);
    expect(await codeOf(repos.plans.list())).toBe('unauthenticated');
    expect(await codeOf(repos.meals.add(newMeal()))).toBe('unauthenticated');
  });
});

describe('export and reset', () => {
  it('exports everything the user has, and reset empties it', async () => {
    const { repos } = await newUserRepos();
    await repos.plans.save(storedPlan(todayDate()), todayDate());
    await repos.meals.add(newMeal());
    await repos.weights.upsert({ id: randomUUID(), kg: 71, measuredAt: systemClock.now() - HOUR });
    await repos.favorites.add({ id: randomUUID(), name: 'x', kcal: 1, macros: null, items: [] });

    const exported = await repos.exportAll();
    expect(exported).toMatchObject({ schemaVersion: 1, timezone: TZ });
    expect(exported.profile).toEqual(profile);
    expect(
      [exported.plans, exported.meals, exported.weights, exported.favorites].map((l) => l.length),
    ).toEqual([1, 1, 1, 1]);

    await repos.reset();
    const after = await repos.exportAll();
    expect(after.profile).toBeNull();
    expect([after.plans, after.meals, after.weights, after.favorites].map((l) => l.length)).toEqual(
      [0, 0, 0, 0],
    );
  });
});

describe('the database leaves nothing unexplained', () => {
  it('every error the functions can raise maps to a DataError code the screens know', async () => {
    // Guards against adding a RAISE EXCEPTION to a migration without teaching toDataError about it.
    const [row] = await db.admin.query<{ source: string }>(
      `select string_agg(prosrc, E'\\n') as source from pg_proc
       where pronamespace = 'public'::regnamespace`,
    );
    const raised = new Set(
      [...(row?.source ?? '').matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]),
    );
    const known = new Set([
      'unauthenticated',
      'invalid_timezone',
      'eaten_at_in_future',
      'eaten_at_too_old',
      'measured_at_in_future',
      'immutable_column',
      'limit_reached',
      'age_under_18',
      'no_profile',
      'plan_in_past',
      'id_conflict',
      'not_found',
      'version_conflict',
    ]);
    expect([...raised].filter((code) => !known.has(code ?? ''))).toEqual([]);
    expect(await failureOf(Promise.resolve())).toBe('');
  });
});
