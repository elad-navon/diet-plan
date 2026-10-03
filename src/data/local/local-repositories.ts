import {
  MEAL_LIMITS,
  validateFavoriteInput,
  validateAddedSugarInput,
  validateMealInput,
  validateWeightInput,
  type InputError,
} from '../../core/contracts';
import { localDateOf, type Clock, type Instant, type LocalDate } from '../../core/time';
import {
  DataError,
  type ExportDocument,
  type FavoriteRecord,
  type MealPatch,
  type NewFavorite,
  type NewMeal,
  type Profile,
  type Repositories,
  type StoredMeal,
  type StoredPlan,
  type WeightRecord,
} from '../types';
import { type KeyValueStorage } from './storage';

/**
 * The on-device implementation of the repositories. It enforces the same rules the database will
 * (docs/DATA_MODEL.md E.3): server-style local dates, no future or very old meals, one reading per
 * weigh-in day, a cap of meals per day, idempotent creates and version checks. Swapping it for the
 * Supabase implementation later must not change a single screen.
 */

const STORAGE_KEY = 'diet-plan.v1';
const CORRUPT_BACKUP_KEY = 'diet-plan.v1.corrupt';
const USAGE_WINDOW_DAYS = 120;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

interface Doc {
  version: 1;
  profile: Profile | null;
  plans: StoredPlan[];
  meals: StoredMeal[];
  weights: WeightRecord[];
  favorites: FavoriteRecord[];
}

const emptyDoc = (): Doc => ({
  version: 1,
  profile: null,
  plans: [],
  meals: [],
  weights: [],
  favorites: [],
});

function isDoc(value: unknown): value is Doc {
  if (typeof value !== 'object' || value === null) return false;
  const doc = value as Record<string, unknown>;
  return (
    doc['version'] === 1 &&
    Array.isArray(doc['plans']) &&
    Array.isArray(doc['meals']) &&
    Array.isArray(doc['weights']) &&
    Array.isArray(doc['favorites'])
  );
}

class Store {
  constructor(private readonly storage: KeyValueStorage) {}

  load(): Doc {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return emptyDoc();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isDoc(parsed)) {
        // Meals saved before added sugar existed have no value for it: "not known".
        parsed.meals = parsed.meals.map((meal) => {
          const withSugar = meal.addedSugarG === undefined ? { ...meal, addedSugarG: null } : meal;
          // A day runs from 02:00 to 02:00: a meal between midnight and 02:00 is the previous day's.
          const day = localDateOf(withSugar.eatenAt, withSugar.tz);
          return day === withSugar.localDate ? withSugar : { ...withSugar, localDate: day };
        });
        parsed.favorites = parsed.favorites.map((favorite) =>
          favorite.addedSugarG === undefined ? { ...favorite, addedSugarG: null } : favorite,
        );
        return parsed;
      }
    } catch {
      // fall through to recovery
    }
    // Unreadable data is set aside, not silently overwritten, so it can still be recovered by hand.
    this.storage.setItem(CORRUPT_BACKUP_KEY, raw);
    return emptyDoc();
  }

  save(doc: Doc): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(doc));
  }

  clear(): void {
    this.storage.removeItem(STORAGE_KEY);
  }
}

/** Runs an operation and always reports its outcome as a promise: a throw becomes a rejection. */
function run<T>(operation: () => T): Promise<T> {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

const invalid = (errors: readonly InputError[]): DataError =>
  new DataError('invalid', errors.map((e) => `${e.field}:${e.code}`).join(','));

const sameContent = (a: StoredMeal, b: StoredMeal): boolean =>
  a.name === b.name &&
  a.kcal === b.kcal &&
  a.eatenAt === b.eatenAt &&
  a.slot === b.slot &&
  a.source === b.source &&
  JSON.stringify([a.proteinG, a.carbsG, a.fatG]) ===
    JSON.stringify([b.proteinG, b.carbsG, b.fatG]) &&
  a.addedSugarG === b.addedSugarG &&
  JSON.stringify(a.items) === JSON.stringify(b.items);

export function createLocalRepositories(options: {
  storage: KeyValueStorage;
  clock: Clock;
}): Repositories {
  const store = new Store(options.storage);
  const { clock } = options;

  const requireProfile = (doc: Doc): Profile => {
    if (!doc.profile) throw new DataError('no_profile');
    return doc.profile;
  };
  const activeCount = (doc: Doc, date: LocalDate, exceptId?: string): number =>
    doc.meals.filter((m) => m.localDate === date && !m.deletedAt && m.id !== exceptId).length;
  const findMeal = (doc: Doc, id: string): StoredMeal => {
    const meal = doc.meals.find((m) => m.id === id);
    if (!meal) throw new DataError('not_found');
    return meal;
  };
  const replaceMeal = (doc: Doc, meal: StoredMeal): void => {
    doc.meals = doc.meals.map((m) => (m.id === meal.id ? meal : m));
    store.save(doc);
  };

  return {
    profile: {
      get: () => run(() => store.load().profile),
      save: (profile) =>
        run(() => {
          const doc = store.load();
          doc.profile = profile;
          store.save(doc);
        }),
    },

    plans: {
      list: () =>
        run(() =>
          [...store.load().plans].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
        ),
      save: (plan, today) =>
        run(() => {
          // Past days are history: a plan can only start today or later.
          if (plan.effectiveFrom < today) throw new DataError('plan_in_past');
          const doc = store.load();
          doc.plans = doc.plans.filter((p) => p.effectiveFrom !== plan.effectiveFrom);
          doc.plans.push(plan);
          store.save(doc);
        }),
    },

    meals: {
      listByDate: (date) =>
        run(() =>
          store
            .load()
            .meals.filter((m) => m.localDate === date)
            .sort((a, b) => a.eatenAt - b.eatenAt),
        ),

      listRange: (from, to) =>
        run(() =>
          store
            .load()
            .meals.filter((m) => m.localDate >= from && m.localDate <= to)
            .sort((a, b) => a.eatenAt - b.eatenAt),
        ),

      add: (input: NewMeal) =>
        run(() => {
          const doc = store.load();
          const now = clock.now();
          const profile = requireProfile(doc);
          const checked = validateMealInput(
            { name: input.name, kcal: input.kcal, macros: input.macros, eatenAt: input.eatenAt },
            now,
          );
          if (!checked.ok) throw invalid(checked.errors);
          if (input.items.length > MEAL_LIMITS.itemsMax) {
            throw new DataError('invalid', 'items:too_many');
          }
          const sugar = validateAddedSugarInput(input.addedSugarG);
          if (!sugar.ok) throw invalid(sugar.errors);

          const meal: StoredMeal = {
            id: input.id,
            name: checked.value.name,
            localDate: localDateOf(input.eatenAt, profile.timezone),
            eatenAt: input.eatenAt,
            tz: profile.timezone,
            slot: input.slot,
            kcal: checked.value.kcal,
            proteinG: checked.value.macros?.proteinG ?? null,
            carbsG: checked.value.macros?.carbsG ?? null,
            fatG: checked.value.macros?.fatG ?? null,
            items: input.items,
            addedSugarG: sugar.value.addedSugarG,
            source: input.source,
            ...(input.foodDbVersion !== undefined ? { foodDbVersion: input.foodDbVersion } : {}),
            version: 1,
            enteredAt: now,
            deletedAt: null,
          };

          const existing = doc.meals.find((m) => m.id === input.id);
          if (existing) {
            // A retry of the same request returns the same meal; different content under that id is a bug.
            if (sameContent(existing, meal)) return existing;
            throw new DataError('id_conflict');
          }
          if (activeCount(doc, meal.localDate) >= MEAL_LIMITS.mealsPerDayMax) {
            throw new DataError('limit_reached');
          }
          doc.meals.push(meal);
          store.save(doc);
          return meal;
        }),

      update: (id, baseVersion, patch: MealPatch) =>
        run(() => {
          const doc = store.load();
          const now = clock.now();
          const profile = requireProfile(doc);
          const existing = findMeal(doc, id);
          if (existing.version !== baseVersion) throw new DataError('version_conflict');

          const eatenAt = patch.eatenAt ?? existing.eatenAt;
          const macros =
            patch.macros !== undefined
              ? patch.macros
              : existing.proteinG === null || existing.carbsG === null || existing.fatG === null
                ? null
                : { proteinG: existing.proteinG, carbsG: existing.carbsG, fatG: existing.fatG };
          const timeChanged = patch.eatenAt !== undefined && patch.eatenAt !== existing.eatenAt;
          const checked = validateMealInput(
            {
              name: patch.name ?? existing.name,
              kcal: patch.kcal ?? existing.kcal,
              macros,
              // An unchanged time is not re-checked: old meals stay editable.
              eatenAt: timeChanged ? eatenAt : now,
            },
            now,
          );
          if (!checked.ok) throw invalid(checked.errors);
          const sugar = validateAddedSugarInput(
            patch.addedSugarG !== undefined ? patch.addedSugarG : existing.addedSugarG,
          );
          if (!sugar.ok) throw invalid(sugar.errors);
          const items = patch.items ?? existing.items;
          if (items.length > MEAL_LIMITS.itemsMax) throw new DataError('invalid', 'items:too_many');

          const localDate = timeChanged
            ? localDateOf(eatenAt, profile.timezone)
            : existing.localDate;
          if (
            localDate !== existing.localDate &&
            activeCount(doc, localDate, id) >= MEAL_LIMITS.mealsPerDayMax
          ) {
            throw new DataError('limit_reached');
          }
          const updated: StoredMeal = {
            ...existing,
            name: checked.value.name,
            kcal: checked.value.kcal,
            proteinG: checked.value.macros?.proteinG ?? null,
            carbsG: checked.value.macros?.carbsG ?? null,
            fatG: checked.value.macros?.fatG ?? null,
            slot: patch.slot ?? existing.slot,
            eatenAt,
            localDate,
            tz: timeChanged ? profile.timezone : existing.tz,
            items,
            addedSugarG: sugar.value.addedSugarG,
            version: existing.version + 1,
          };
          replaceMeal(doc, updated);
          return updated;
        }),

      softDelete: (id, baseVersion) =>
        run(() => {
          const doc = store.load();
          const existing = findMeal(doc, id);
          if (existing.deletedAt) return existing; // deleting twice is harmless
          if (existing.version !== baseVersion) throw new DataError('version_conflict');
          const deleted: StoredMeal = {
            ...existing,
            deletedAt: clock.now(),
            version: existing.version + 1,
          };
          replaceMeal(doc, deleted);
          return deleted;
        }),

      restore: (id, baseVersion) =>
        run(() => {
          const doc = store.load();
          const existing = findMeal(doc, id);
          if (!existing.deletedAt) return existing;
          if (existing.version !== baseVersion) throw new DataError('version_conflict');
          if (activeCount(doc, existing.localDate) >= MEAL_LIMITS.mealsPerDayMax) {
            throw new DataError('limit_reached');
          }
          const restored: StoredMeal = {
            ...existing,
            deletedAt: null,
            version: existing.version + 1,
          };
          replaceMeal(doc, restored);
          return restored;
        }),

      foodUsage: () =>
        run(() => {
          const since: Instant = clock.now() - USAGE_WINDOW_DAYS * DAY_MS;
          const usage = new Map<string, number>();
          for (const meal of store.load().meals) {
            if (meal.deletedAt || meal.eatenAt < since) continue;
            for (const item of meal.items) {
              usage.set(item.foodId, (usage.get(item.foodId) ?? 0) + 1);
            }
          }
          return usage;
        }),
    },

    weights: {
      list: () =>
        run(() => [...store.load().weights].sort((a, b) => a.localDate.localeCompare(b.localDate))),
      upsert: (entry) =>
        run(() => {
          const doc = store.load();
          const now = clock.now();
          const profile = requireProfile(doc);
          const checked = validateWeightInput({ kg: entry.kg });
          if (!checked.ok) throw invalid(checked.errors);
          if (entry.measuredAt > now + 5 * MINUTE_MS) {
            throw new DataError('invalid', 'weight:future');
          }

          const localDate = localDateOf(entry.measuredAt, profile.timezone);
          const existing = doc.weights.find((w) => w.localDate === localDate);
          const record: WeightRecord = existing
            ? {
                ...existing,
                kg: checked.value.kg,
                measuredAt: entry.measuredAt,
                version: existing.version + 1,
              }
            : {
                id: entry.id,
                localDate,
                kg: checked.value.kg,
                measuredAt: entry.measuredAt,
                version: 1,
              };
          doc.weights = existing
            ? doc.weights.map((w) => (w.localDate === localDate ? record : w))
            : [...doc.weights, record];
          store.save(doc);
          return record;
        }),
      remove: (id) =>
        run(() => {
          const doc = store.load();
          doc.weights = doc.weights.filter((w) => w.id !== id);
          store.save(doc);
        }),
    },

    favorites: {
      list: () => run(() => [...store.load().favorites]),
      add: (input: NewFavorite) =>
        run(() => {
          const doc = store.load();
          const existing = doc.favorites.find((f) => f.id === input.id);
          if (existing) return existing; // idempotent
          const checked = validateFavoriteInput({
            name: input.name,
            kcal: input.kcal,
            macros: input.macros,
          });
          if (!checked.ok) throw invalid(checked.errors);
          const sugar = validateAddedSugarInput(input.addedSugarG);
          if (!sugar.ok) throw invalid(sugar.errors);
          if (doc.favorites.length >= MEAL_LIMITS.favoritesMax) {
            throw new DataError('limit_reached');
          }
          const favorite: FavoriteRecord = {
            id: input.id,
            name: checked.value.name,
            kcal: checked.value.kcal,
            macros: checked.value.macros,
            items: input.items,
            addedSugarG: sugar.value.addedSugarG,
            ...(input.foodDbVersion !== undefined ? { foodDbVersion: input.foodDbVersion } : {}),
            useCount: 0,
            lastUsedAt: null,
            version: 1,
          };
          doc.favorites.push(favorite);
          store.save(doc);
          return favorite;
        }),
      remove: (id) =>
        run(() => {
          const doc = store.load();
          doc.favorites = doc.favorites.filter((f) => f.id !== id);
          store.save(doc);
        }),
      markUsed: (id) =>
        run(() => {
          const doc = store.load();
          doc.favorites = doc.favorites.map((f) =>
            f.id === id
              ? { ...f, useCount: f.useCount + 1, lastUsedAt: clock.now(), version: f.version + 1 }
              : f,
          );
          store.save(doc);
        }),
    },

    exportAll: () =>
      run((): ExportDocument => {
        const doc = store.load();
        return {
          schemaVersion: 1,
          exportedAt: clock.now(),
          timezone: doc.profile?.timezone ?? null,
          profile: doc.profile,
          plans: doc.plans,
          meals: doc.meals,
          weights: doc.weights,
          favorites: doc.favorites,
        };
      }),

    reset: () => run(() => store.clear()),
  };
}
