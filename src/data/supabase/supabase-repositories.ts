import {
  MEAL_LIMITS,
  validateAddedSugarInput,
  validateFavoriteInput,
  validateMealInput,
  validateWeightInput,
  type InputError,
} from '../../core/contracts';
import { formatInstant, type Clock } from '../../core/time';
import {
  DataError,
  type ExportDocument,
  type MealPatch,
  type NewMeal,
  type Repositories,
} from '../types';
import { toDataError } from './errors';
import { type Row, type ServerGateway, ServerError } from './gateway';
import {
  favoriteFromRow,
  macroColumns,
  mealFromRow,
  planFromRow,
  planToPayload,
  profileFromRow,
  profileToPayload,
  weightFromRow,
} from './mapping';

/**
 * The server implementation of the repositories (docs/DATA_MODEL.md E). Behaves like the on-device one,
 * so no screen changes between the two: the same validation runs first (a clear message without a round
 * trip), and the database repeats every rule, because the server is what is actually trusted.
 */

const USAGE_WINDOW_DAYS = 120;
const FIRST_DAY = '1970-01-01';
const LAST_DAY = '9999-12-31';

const invalid = (errors: readonly InputError[]): DataError =>
  new DataError('invalid', errors.map((e) => `${e.field}:${e.code}`).join(','));

/** Runs a server call; whatever goes wrong comes out as a DataError. */
async function guard<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toDataError(error);
  }
}

function asRow(value: unknown): Row {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DataError('server', 'the server did not return a record');
  }
  return value as Row;
}

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new DataError('server', 'the server did not return a list');
  return value.map(asRow);
}

export function createSupabaseRepositories(options: {
  gateway: ServerGateway;
  clock: Clock;
}): Repositories {
  const { gateway, clock } = options;

  const rpcRow = async (fn: string, args: Record<string, unknown>): Promise<Row> =>
    asRow(await gateway.rpc(fn, args));

  const listMeals = async (from: string, to: string) =>
    (
      await gateway.select('meals', {
        gte: { local_date: from },
        lte: { local_date: to },
        order: ['eaten_at', 'id'],
      })
    ).map(mealFromRow);

  const repos: Repositories = {
    profile: {
      get: () =>
        guard(async () => {
          const [row] = await gateway.select('profiles', { order: ['user_id'] });
          return row ? profileFromRow(row) : null;
        }),
      save: (profile) =>
        guard(async () => {
          await gateway.rpc('save_profile', { p: profileToPayload(profile) });
        }),
    },

    plans: {
      list: () =>
        guard(async () =>
          (await gateway.select('target_plans', { order: ['effective_from', 'id'] })).map(
            planFromRow,
          ),
        ),
      save: (plan, today) =>
        guard(async () => {
          // Past days are history: a plan can only start today or later (the server checks again).
          if (plan.effectiveFrom < today) throw new DataError('plan_in_past');
          await gateway.rpc('save_plan', { p: planToPayload(plan) });
        }),
    },

    meals: {
      listByDate: (date) => guard(() => listMeals(date, date)),
      listRange: (from, to) => guard(() => listMeals(from, to)),

      add: (input: NewMeal) =>
        guard(async () => {
          const now = clock.now();
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
          return mealFromRow(
            await rpcRow('add_meal', {
              p: {
                id: input.id,
                eaten_at: formatInstant(input.eatenAt),
                slot: input.slot,
                name: checked.value.name,
                kcal: checked.value.kcal,
                ...macroColumns(checked.value.macros),
                items: input.items,
                added_sugar_g: sugar.value.addedSugarG,
                source: input.source,
                food_db_version: input.foodDbVersion ?? null,
              },
            }),
          );
        }),

      update: (id, baseVersion, patch: MealPatch) =>
        guard(async () => {
          const now = clock.now();
          // Only the fields being changed are checked and sent; the server applies them to its own copy.
          // (The time window is the server's call: an old meal must stay editable.)
          const checked = validateMealInput(
            {
              name: patch.name ?? 'x',
              kcal: patch.kcal ?? 0,
              macros: patch.macros,
              eatenAt: now,
            },
            now,
          );
          if (!checked.ok) throw invalid(checked.errors);
          if (patch.items && patch.items.length > MEAL_LIMITS.itemsMax) {
            throw new DataError('invalid', 'items:too_many');
          }
          const body: Record<string, unknown> = {};
          if (patch.name !== undefined) body['name'] = checked.value.name;
          if (patch.kcal !== undefined) body['kcal'] = checked.value.kcal;
          if (patch.macros !== undefined) Object.assign(body, macroColumns(checked.value.macros));
          if (patch.slot !== undefined) body['slot'] = patch.slot;
          if (patch.items !== undefined) body['items'] = patch.items;
          if (patch.addedSugarG !== undefined) {
            const sugar = validateAddedSugarInput(patch.addedSugarG);
            if (!sugar.ok) throw invalid(sugar.errors);
            body['added_sugar_g'] = sugar.value.addedSugarG;
          }
          if (patch.eatenAt !== undefined) body['eaten_at'] = formatInstant(patch.eatenAt);
          return mealFromRow(
            await rpcRow('update_meal', { p_id: id, p_base_version: baseVersion, p_patch: body }),
          );
        }),

      softDelete: (id, baseVersion) =>
        guard(async () =>
          mealFromRow(await rpcRow('delete_meal', { p_id: id, p_base_version: baseVersion })),
        ),

      restore: (id, baseVersion) =>
        guard(async () =>
          mealFromRow(await rpcRow('restore_meal', { p_id: id, p_base_version: baseVersion })),
        ),

      foodUsage: () =>
        guard(async () => {
          const rows = asRows(await gateway.rpc('food_usage', { p_days: USAGE_WINDOW_DAYS }));
          const usage = new Map<string, number>();
          for (const row of rows) {
            const foodId = row['food_id'];
            const uses = row['uses'];
            if (typeof foodId === 'string' && typeof uses === 'number') usage.set(foodId, uses);
          }
          return usage;
        }),
    },

    weights: {
      list: () =>
        guard(async () =>
          (await gateway.select('weight_entries', { order: ['local_date', 'id'] })).map(
            weightFromRow,
          ),
        ),
      upsert: (entry) =>
        guard(async () => {
          const checked = validateWeightInput({ kg: entry.kg });
          if (!checked.ok) throw invalid(checked.errors);
          return weightFromRow(
            await rpcRow('upsert_weight', {
              p: {
                id: entry.id,
                measured_at: formatInstant(entry.measuredAt),
                weight_kg: checked.value.kg,
              },
            }),
          );
        }),
      remove: (id) => guard(() => gateway.remove('weight_entries', id)),
    },

    favorites: {
      list: () =>
        guard(async () =>
          (await gateway.select('favorites', { order: ['created_at', 'id'] })).map(favoriteFromRow),
        ),
      add: (input) =>
        guard(async () => {
          const checked = validateFavoriteInput({
            name: input.name,
            kcal: input.kcal,
            macros: input.macros,
          });
          if (!checked.ok) throw invalid(checked.errors);
          const sugar = validateAddedSugarInput(input.addedSugarG);
          if (!sugar.ok) throw invalid(sugar.errors);
          const row: Row = {
            id: input.id,
            name: checked.value.name,
            kcal: checked.value.kcal,
            ...macroColumns(checked.value.macros),
            items: input.items,
            // Only when there is one, so a server that has not had the latest update still takes a favorite without sugar.
            ...(sugar.value.addedSugarG !== null ? { added_sugar_g: sugar.value.addedSugarG } : {}),
            food_db_version: input.foodDbVersion ?? null,
          };
          try {
            return favoriteFromRow(await gateway.insert('favorites', row));
          } catch (error) {
            // A retry of the same request: the favorite is already there, so hand it back.
            if (error instanceof ServerError && error.sqlState === '23505') {
              const [existing] = await gateway.select('favorites', {
                eq: { id: input.id },
                order: ['id'],
              });
              if (existing) return favoriteFromRow(existing);
              throw new DataError('id_conflict');
            }
            throw error;
          }
        }),
      remove: (id) => guard(() => gateway.remove('favorites', id)),
      markUsed: (id) =>
        guard(async () => {
          await gateway.rpc('mark_favorite_used', { p_id: id });
        }),
    },

    exportAll: () =>
      guard(async (): Promise<ExportDocument> => {
        const [profile, plans, meals, weights, favorites] = await Promise.all([
          repos.profile.get(),
          repos.plans.list(),
          repos.meals.listRange(FIRST_DAY, LAST_DAY),
          repos.weights.list(),
          repos.favorites.list(),
        ]);
        return {
          schemaVersion: 1,
          exportedAt: clock.now(),
          timezone: profile?.timezone ?? null,
          profile,
          plans,
          meals,
          weights,
          favorites,
        };
      }),

    reset: () =>
      guard(async () => {
        await gateway.rpc('reset_my_data');
      }),
  };
  return repos;
}
