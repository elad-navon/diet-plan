import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildFoodIndex, buildMealIdeas, type FoodDb, type FoodIndex } from '../core/food';
import { type MealCandidate } from '../core/recommend';
import { type LocalDate } from '../core/time';
import {
  type MealPatch,
  type NewFavorite,
  type NewMeal,
  type Profile,
  type StoredPlan,
} from '../data';
import { useServices } from './services';

/** Query keys in one place, so invalidation never misses a screen. */
export const keys = {
  profile: ['profile'] as const,
  plans: ['plans'] as const,
  meals: ['meals'] as const,
  mealsOfDay: (date: LocalDate) => ['meals', 'day', date] as const,
  mealsRange: (from: LocalDate, to: LocalDate) => ['meals', 'range', from, to] as const,
  weights: ['weights'] as const,
  favorites: ['favorites'] as const,
  usage: ['usage'] as const,
  foodDb: ['food-db'] as const,
};

export function useProfile() {
  const { repos } = useServices();
  return useQuery({ queryKey: keys.profile, queryFn: () => repos.profile.get() });
}

export function usePlans() {
  const { repos } = useServices();
  return useQuery({ queryKey: keys.plans, queryFn: () => repos.plans.list() });
}

export function useMealsOfDay(date: LocalDate) {
  const { repos } = useServices();
  return useQuery({ queryKey: keys.mealsOfDay(date), queryFn: () => repos.meals.listByDate(date) });
}

export function useMealsRange(from: LocalDate, to: LocalDate) {
  const { repos } = useServices();
  return useQuery({
    queryKey: keys.mealsRange(from, to),
    queryFn: () => repos.meals.listRange(from, to),
  });
}

export function useWeights() {
  const { repos } = useServices();
  return useQuery({ queryKey: keys.weights, queryFn: () => repos.weights.list() });
}

export function useFavorites() {
  const { repos } = useServices();
  return useQuery({ queryKey: keys.favorites, queryFn: () => repos.favorites.list() });
}

export function useFoodUsage() {
  const { repos } = useServices();
  return useQuery({ queryKey: keys.usage, queryFn: () => repos.meals.foodUsage() });
}

export interface LoadedFoodDb {
  db: FoodDb;
  index: FoodIndex;
  ideas: MealCandidate[];
}

/**
 * The national food database, fetched on first use as a separate file (so it never slows the first
 * screen) and indexed once. Also builds the meal ideas from it.
 */
async function loadFoodDb(): Promise<LoadedFoodDb> {
  const url = new URL('../assets/food-db/food-db.json', import.meta.url).href;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`food database: HTTP ${response.status}`);
  const db = (await response.json()) as FoodDb;
  return { db, index: buildFoodIndex(db.foods), ideas: buildMealIdeas(db.foods) };
}

export function useFoodDb(enabled = true) {
  return useQuery({
    queryKey: keys.foodDb,
    queryFn: loadFoodDb,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return (...queryKeys: (readonly unknown[])[]) =>
    Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useSaveProfile() {
  const { repos } = useServices();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (profile: Profile) => repos.profile.save(profile),
    onSuccess: () => invalidate(keys.profile),
  });
}

export function useSavePlan() {
  const { repos } = useServices();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ plan, today }: { plan: StoredPlan; today: LocalDate }) =>
      repos.plans.save(plan, today),
    onSuccess: () => invalidate(keys.plans),
  });
}

export function useAddMeal() {
  const { repos } = useServices();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (meal: NewMeal) => repos.meals.add(meal),
    onSuccess: () => invalidate(keys.meals, keys.usage),
  });
}

export function useUpdateMeal() {
  const { repos } = useServices();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; baseVersion: number; patch: MealPatch }) =>
      repos.meals.update(input.id, input.baseVersion, input.patch),
    onSuccess: () => invalidate(keys.meals, keys.usage),
  });
}

export function useDeleteMeal() {
  const { repos } = useServices();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; baseVersion: number }) =>
      repos.meals.softDelete(input.id, input.baseVersion),
    onSuccess: () => invalidate(keys.meals, keys.usage),
  });
}

export function useRestoreMeal() {
  const { repos } = useServices();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; baseVersion: number }) =>
      repos.meals.restore(input.id, input.baseVersion),
    onSuccess: () => invalidate(keys.meals, keys.usage),
  });
}

export function useSaveWeight() {
  const { repos } = useServices();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (entry: { id: string; kg: number; measuredAt: number }) =>
      repos.weights.upsert(entry),
    onSuccess: () => invalidate(keys.weights),
  });
}

export function useAddFavorite() {
  const { repos } = useServices();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (favorite: NewFavorite) => repos.favorites.add(favorite),
    onSuccess: () => invalidate(keys.favorites),
  });
}

export function useMarkFavoriteUsed() {
  const { repos } = useServices();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => repos.favorites.markUsed(id),
    onSuccess: () => invalidate(keys.favorites),
  });
}

export function useResetAll() {
  const { repos } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repos.reset(),
    onSuccess: () => queryClient.clear(),
  });
}
