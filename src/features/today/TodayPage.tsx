import { useMemo, useState } from 'react';
import {
  useDeleteMeal,
  useFoodDb,
  useMealsOfDay,
  useMealsRange,
  usePlans,
  useRestoreMeal,
} from '../../app/data-hooks';
import { useDesktop } from '../../app/use-media-query';
import { useNow } from '../../app/services';
import {
  buildDayChart,
  buildDayView,
  resolvePlanForDate,
  summarizeRange,
} from '../../core/dayview';
import {
  fillMissingMacros,
  fillMissingSugar,
  portionParts,
  summarizeGrain,
  sumEntries,
  type PortionPart,
} from '../../core/food';
import { type Recommendation, type Suggestion } from '../../core/recommend';
import { DEFAULT_SCHEDULE } from '../../core/schedule';
import { addDays, localDateOf, localTimeOf, type LocalDate } from '../../core/time';
import { DataError, type StoredMeal } from '../../data';
import { dataErrorMessage } from '../../i18n/data-errors';
import { formatDayTitle } from '../../i18n/format';
import { he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { CardBackdrop } from '../../ui/art/CardBackdrop';
import { CardTitle } from '../../ui/CardTitle';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { AddMealSheet, type MealPrefill } from '../meals/AddMealSheet';
import { LoadGate } from '../shell/LoadGate';
import { useRequiredProfile } from '../shell/ProfileGate';
import { CalorieRing } from './CalorieRing';
import { DayChart, MAX_NUMBERED_MEALS } from './DayChart';
import { FlourCard } from './FlourCard';
import { MacroBars } from './MacroBars';
import { MealList } from './MealList';
import { NextMealCard } from './NextMealCard';
import { StatusChip } from './StatusChip';
import { SugarCard } from './SugarCard';
import { WeekCard } from './WeekCard';

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
  const today = localDateOf(now, tz);

  const plans = usePlans().data ?? [];
  const todayMeals = useMealsOfDay(today).data;
  // On a computer the week sits on the day screen, so its meals are loaded there (a phone does not need them).
  const desktop = useDesktop();
  const weekFrom = addDays(today, -6);
  const weekMeals = useMealsRange(weekFrom, today, desktop).data;
  // Clicking a day in the week shows that day on the whole screen (a computer only). Null means today.
  const [picked, setPicked] = useState<LocalDate | null>(null);
  const date: LocalDate =
    desktop && picked !== null && picked >= weekFrom && picked < today ? picked : today;
  const isToday = date === today;
  const storedMeals = isToday ? todayMeals : weekMeals?.filter((meal) => meal.localDate === date);
  const foodDb = useFoodDb().data;
  const ideas = useMemo(() => foodDb?.ideas ?? [], [foodDb]);
  const foodsById = useMemo(
    () => new Map((foodDb?.db.foods ?? []).map((food) => [food.id, food])),
    [foodDb],
  );
  // Meals saved before sugar was tracked count too: their sugar is looked up from the foods they hold. So do
  // meals saved without macros because of a food typed by hand: they get the macros of the other foods.
  const meals = useMemo(
    () => (storedMeals ?? []).map((meal) => fillMissingMacros(fillMissingSugar(meal, foodsById))),
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
  const grain = summarizeGrain(activeMeals, foodsById);
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
    // "I ate this again" is about today, also when the meal was picked from an earlier day.
    setPicked(null);
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

  const weekRange = desktop
    ? summarizeRange({ from: weekFrom, to: today, plans, meals: weekMeals ?? [] })
    : null;
  // Meals have the same numbers in the list as on the chart (a long day has plain dots there instead).
  const mealNumbers =
    chart && chart.meals.length <= MAX_NUMBERED_MEALS
      ? new Map(chart.meals.map((meal, index) => [meal.id, index + 1]))
      : undefined;

  // On a computer the top row is the calories, the chart and the next meal. Without a next meal (an earlier
  // day) the first two take the whole row instead of leaving a gap.
  const wideTop = desktop && !recommendation && chart !== null;
  const hero = (
    <section
      aria-label={he.today.ringRemaining}
      className={`hero space-y-4 px-5 py-6 lg:relative lg:isolate lg:flex lg:min-h-0 lg:flex-col lg:items-center lg:justify-center lg:space-y-0 lg:gap-3 lg:overflow-hidden lg:panel-dark lg:px-4 lg:py-4 ${wideTop ? '' : 'lg:col-start-1 lg:row-start-1'}`}
    >
      <CardBackdrop name="calories" />
      <CalorieRing consumed={view.summary.kcal} target={view.target?.kcalTarget ?? null} />
      {recommendation && (
        <div className="flex justify-center">
          <StatusChip status={recommendation.status} />
        </div>
      )}
    </section>
  );
  const chartCell = chart && (
    <div
      className={`lg:min-h-0 lg:*:h-full ${wideTop ? '' : 'lg:col-span-2 lg:col-start-2 lg:row-start-1'}`}
    >
      <DayChart
        model={chart}
        tz={tz}
        corridorNow={recommendation ? recommendation.corridor : null}
      />
    </div>
  );

  return (
    <div className="space-y-4 lg:flex lg:h-full lg:flex-col lg:space-y-0 lg:gap-3.5">
      <header className="lg:flex lg:flex-none lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-base text-muted">
            {!isToday && <Icon name="eye" size={16} />}
            {isToday ? greeting(now, tz) : he.today.viewingPast}
          </p>
          <h1 className="text-3xl font-bold tracking-tight lg:text-2xl">
            {formatDayTitle(date, tz)}
          </h1>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          {!isToday && (
            <Button onClick={() => setPicked(null)}>
              <Icon name="calendar" size={18} /> {he.today.backToToday}
            </Button>
          )}
          <Button variant="primary" onClick={() => openNew()}>
            <Icon name="plus" size={18} /> {he.today.addMeal}
          </Button>
        </div>
      </header>

      {/* A phone: one column, top to bottom. A computer: everything on one screen, in a grid. */}
      <div className="space-y-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[0.95fr_0.95fr_1.4fr_1.2fr] lg:grid-rows-[minmax(14rem,1fr)_minmax(23rem,1.1fr)] lg:gap-3.5 lg:space-y-0">
        {wideTop ? (
          // Nothing to suggest (an earlier day): the calories and the chart share the whole top row.
          <div className="space-y-4 lg:col-span-4 lg:row-start-1 lg:grid lg:min-h-0 lg:grid-cols-[1.25fr_3.25fr] lg:grid-rows-[minmax(0,1fr)] lg:gap-3.5 lg:space-y-0">
            {hero}
            {chartCell}
          </div>
        ) : (
          <>
            {hero}
            {chartCell}
          </>
        )}

        <div className="lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:*:h-full">
          <MacroBars
            target={view.target?.macros ?? null}
            macroState={view.target?.macroState ?? null}
            summary={view.summary}
          />
        </div>

        <div className="space-y-4 lg:col-start-2 lg:row-start-2 lg:grid lg:min-h-0 lg:grid-rows-[auto_1fr] lg:gap-3.5 lg:space-y-0">
          <SugarCard summary={view.summary} />
          <FlourCard grain={grain} />
        </div>

        {/* What to eat next: a drop-down on a phone, and on a computer a column of its own above the week. */}
        {recommendation &&
          (desktop ? (
            <div className="lg:col-start-4 lg:row-start-1 lg:min-h-0 lg:*:h-full">
              <NextMealCard
                alwaysOpen
                recommendation={recommendation}
                tz={tz}
                partsOf={partsOf}
                onPick={pickSuggestion}
                onAddManual={() => openNew()}
              />
            </div>
          ) : (
            <NextMealCard
              recommendation={recommendation}
              tz={tz}
              partsOf={partsOf}
              onPick={pickSuggestion}
              onAddManual={() => openNew()}
            />
          ))}

        <section
          aria-labelledby="meals-title"
          className="space-y-2 lg:card lg:col-start-3 lg:row-start-2 lg:flex lg:min-h-0 lg:flex-col lg:space-y-0 lg:p-4"
        >
          <CardTitle
            id="meals-title"
            icon="utensils"
            tone="cyan"
            className="text-xl font-bold lg:mb-2 lg:flex-none lg:text-lg"
          >
            {he.today.mealsTitle}
          </CardTitle>
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <MealList
              meals={activeMeals}
              tz={tz}
              onEdit={(meal) => setSheet({ open: true, editing: meal, prefill: null })}
              onDelete={(meal) => void remove(meal)}
              onAgain={eatAgain}
              {...(mealNumbers ? { numbers: mealNumbers } : {})}
            />
          </div>
          {activeMeals.length === 0 && (
            <Button variant="primary" onClick={() => openNew()}>
              {he.today.addFirst}
            </Button>
          )}
        </section>

        {weekRange && (
          <div className="lg:col-start-4 lg:row-start-2 lg:min-h-0 lg:*:h-full">
            <WeekCard
              range={weekRange}
              tz={tz}
              today={today}
              selected={date}
              onSelect={(day) => setPicked(day === today ? null : day)}
            />
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label={he.today.addMeal}
        onClick={() => openNew()}
        className="fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] end-4 z-30 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-on-accent shadow-[0_12px_28px_-8px_color-mix(in_srgb,var(--accent)_80%,transparent)] transition active:scale-95 lg:hidden"
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
