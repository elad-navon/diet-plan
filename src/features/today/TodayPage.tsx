import { useMemo, useState } from 'react';
import {
  useDeleteMeal,
  useFoodDb,
  useMealsOfDay,
  usePlans,
  useRestoreMeal,
} from '../../app/data-hooks';
import { useNow } from '../../app/services';
import { buildDayChart, buildDayView, resolvePlanForDate } from '../../core/dayview';
import { fillMissingSugar, portionParts, sumEntries, type PortionPart } from '../../core/food';
import { type Recommendation, type Suggestion } from '../../core/recommend';
import { DEFAULT_SCHEDULE } from '../../core/schedule';
import { localDateOf, localTimeOf } from '../../core/time';
import { DataError, type StoredMeal } from '../../data';
import { dataErrorMessage } from '../../i18n/data-errors';
import { formatDayTitle } from '../../i18n/format';
import { he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { AddMealSheet, type MealPrefill } from '../meals/AddMealSheet';
import { LoadGate } from '../shell/LoadGate';
import { useRequiredProfile } from '../shell/ProfileGate';
import { CalorieRing } from './CalorieRing';
import { DayChart } from './DayChart';
import { MacroBars } from './MacroBars';
import { MealList } from './MealList';
import { NextMealCard } from './NextMealCard';
import { StatusChip } from './StatusChip';
import { SugarCard } from './SugarCard';

interface SheetState {
  open: boolean;
  editing: StoredMeal | null;
  prefill: MealPrefill | null;
}

/** "בוקר טוב" … by the local hour of the person's own time zone. */
function greeting(now: number, tz: string): string {
  const hour = Number(localTimeOf(now, tz).slice(0, 2));
  if (hour < 5 || hour >= 22) return he.today.greeting.night;
  if (hour < 12) return he.today.greeting.morning;
  if (hour < 17) return he.today.greeting.noon;
  return he.today.greeting.evening;
}

const CLOSED: SheetState = { open: false, editing: null, prefill: null };
const round1 = (value: number): number => Math.round(value * 10) / 10;

export function TodayPage() {
  const tz = useRequiredProfile().timezone;
  const date = localDateOf(useNow(), tz);
  // The day is only shown once its meals and targets have really loaded (see LoadGate).
  return (
    <LoadGate queries={[usePlans(), useMealsOfDay(date)]}>
      <TodayContent />
    </LoadGate>
  );
}

function TodayContent() {
  const profile = useRequiredProfile();
  const tz = profile.timezone;
  const now = useNow();
  const date = localDateOf(now, tz);

  const plans = usePlans().data ?? [];
  const storedMeals = useMealsOfDay(date).data;
  const foodDb = useFoodDb().data;
  const ideas = useMemo(() => foodDb?.ideas ?? [], [foodDb]);
  const foodsById = useMemo(
    () => new Map((foodDb?.db.foods ?? []).map((food) => [food.id, food])),
    [foodDb],
  );
  // Meals saved before sugar was tracked count too: their sugar is looked up from the foods they hold.
  const meals = useMemo(
    () => (storedMeals ?? []).map((meal) => fillMissingSugar(meal, foodsById)),
    [storedMeals, foodsById],
  );
  const recipes = useMemo(
    () => new Map(ideas.map((idea) => [idea.id, idea.recipe ?? null])),
    [ideas],
  );
  /** The ingredients of a suggestion at its portion size, in measurable amounts. */
  const partsOf = (suggestion: Suggestion): PortionPart[] | null => {
    const recipe = recipes.get(suggestion.candidateId);
    return recipe ? portionParts(recipe, suggestion.portionFactor, foodsById) : null;
  };
  const deleteMeal = useDeleteMeal();
  const restoreMeal = useRestoreMeal();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetState>(CLOSED);

  const plan = resolvePlanForDate(plans, date);
  const view = buildDayView({ date, now, tz, plans, meals, candidates: ideas });
  const activeMeals = meals.filter((meal) => !meal.deletedAt);
  const recommendation = view.recommendation;
  const chart = plan
    ? buildDayChart({
        date,
        tz,
        now,
        plan,
        meals: activeMeals,
        next: recommendation?.next ?? null,
      })
    : null;

  function openNew(prefill: MealPrefill | null = null): void {
    setSheet({ open: true, editing: null, prefill });
  }

  function pickSuggestion(suggestion: Suggestion, next: Recommendation['next']): void {
    const parts = partsOf(suggestion);
    if (parts && foodDb) {
      // Open the meal with the exact ingredients, so it is saved the way it was suggested.
      const entries = parts.map((part) => part.entry);
      const totals = sumEntries(entries);
      openNew({
        name: suggestion.name,
        kcal: totals.kcal,
        macros: { proteinG: totals.proteinG, carbsG: totals.carbsG, fatG: totals.fatG },
        items: entries,
        foodDbVersion: foodDb.db.version,
        ...(next?.slot ? { slot: next.slot } : {}),
        source: 'food_db',
      });
      return;
    }
    openNew({
      name: suggestion.name,
      kcal: Math.round(suggestion.kcal),
      macros: {
        proteinG: round1(suggestion.proteinG),
        carbsG: round1(suggestion.carbsG),
        fatG: round1(suggestion.fatG),
      },
      ...(next?.slot ? { slot: next.slot } : {}),
      source: 'manual',
    });
  }

  function eatAgain(meal: StoredMeal): void {
    openNew({
      name: meal.name,
      kcal: meal.kcal,
      macros:
        meal.proteinG !== null && meal.carbsG !== null && meal.fatG !== null
          ? { proteinG: meal.proteinG, carbsG: meal.carbsG, fatG: meal.fatG }
          : null,
      items: meal.items,
      addedSugarG: meal.addedSugarG,
      slot: meal.slot,
      source: 'copy',
    });
  }

  async function remove(meal: StoredMeal): Promise<void> {
    try {
      const deleted = await deleteMeal.mutateAsync({ id: meal.id, baseVersion: meal.version });
      toast.show({
        message: he.today.deleted,
        actionLabel: he.undo,
        onAction: () => restoreMeal.mutate({ id: deleted.id, baseVersion: deleted.version }),
      });
    } catch (error) {
      toast.show({ message: dataErrorMessage(error instanceof DataError ? error.code : null) });
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-base text-muted">{greeting(now, tz)}</p>
        <h1 className="text-3xl font-bold tracking-tight">{formatDayTitle(date, tz)}</h1>
      </header>

      <section aria-label={he.today.ringRemaining} className="hero space-y-4 px-5 py-6">
        <CalorieRing consumed={view.summary.kcal} target={view.target?.kcalTarget ?? null} />
        {recommendation && (
          <div className="flex justify-center">
            <StatusChip status={recommendation.status} />
          </div>
        )}
      </section>

      {chart && (
        <DayChart
          model={chart}
          tz={tz}
          corridorNow={recommendation ? recommendation.corridor : null}
        />
      )}

      <MacroBars
        target={view.target?.macros ?? null}
        macroState={view.target?.macroState ?? null}
        summary={view.summary}
      />

      <SugarCard summary={view.summary} />

      {recommendation && (
        <NextMealCard
          recommendation={recommendation}
          tz={tz}
          partsOf={partsOf}
          onPick={pickSuggestion}
          onAddManual={() => openNew()}
        />
      )}

      <section aria-labelledby="meals-title" className="space-y-2">
        <h2 id="meals-title" className="text-xl font-bold">
          {he.today.mealsTitle}
        </h2>
        <MealList
          meals={activeMeals}
          tz={tz}
          onEdit={(meal) => setSheet({ open: true, editing: meal, prefill: null })}
          onDelete={(meal) => void remove(meal)}
          onAgain={eatAgain}
        />
        {activeMeals.length === 0 && (
          <Button variant="primary" onClick={() => openNew()}>
            {he.today.addFirst}
          </Button>
        )}
      </section>

      <button
        type="button"
        aria-label={he.today.addMeal}
        onClick={() => openNew()}
        className="fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] end-4 z-30 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-on-accent shadow-[0_12px_28px_-8px_color-mix(in_srgb,var(--accent)_80%,transparent)] transition active:scale-95"
      >
        <Icon name="plus" size={28} />
      </button>

      <AddMealSheet
        open={sheet.open}
        onClose={() => setSheet(CLOSED)}
        date={date}
        tz={tz}
        now={now}
        schedule={plan?.schedule ?? DEFAULT_SCHEDULE}
        editing={sheet.editing}
        prefill={sheet.prefill}
        onSaved={(_, kind) =>
          toast.show({ message: kind === 'added' ? he.today.saved : he.today.updated })
        }
      />
    </div>
  );
}
