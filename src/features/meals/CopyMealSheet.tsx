import { useMemo } from 'react';
import { useFoodDb, useMealsRange } from '../../app/data-hooks';
import { fillMissingMacros, fillMissingSugar } from '../../core/food';
import { addDays, type LocalDate, type Tz } from '../../core/time';
import { DataError, type StoredMeal } from '../../data';
import { dataErrorMessage } from '../../i18n/data-errors';
import { formatClock, formatDayTitle } from '../../i18n/format';
import { formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';

/** How far back the list goes: the two weeks before today. */
const DAYS_BACK = 14;

interface CopyMealSheetProps {
  open: boolean;
  onClose: () => void;
  today: LocalDate;
  tz: Tz;
  /** The person chose a meal: it opens in the new-meal window of today, to be changed or saved as it is. */
  onPick: (meal: StoredMeal) => void;
}

/** The meals of the last two weeks, a day at a time (the latest day first), to eat again today. */
export function CopyMealSheet({ open, onClose, today, tz, onPick }: CopyMealSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={he.copy.title}>
      <EarlierMeals today={today} tz={tz} onPick={onPick} />
    </Sheet>
  );
}

function EarlierMeals({
  today,
  tz,
  onPick,
}: {
  today: LocalDate;
  tz: Tz;
  onPick: (meal: StoredMeal) => void;
}) {
  const query = useMealsRange(addDays(today, -DAYS_BACK), addDays(today, -1));
  const foodDb = useFoodDb().data;
  const days = useMemo(() => {
    const foodsById = new Map((foodDb?.db.foods ?? []).map((food) => [food.id, food]));
    const byDay = new Map<LocalDate, StoredMeal[]>();
    for (const stored of query.data ?? []) {
      if (stored.deletedAt) continue;
      // Like the day screen: a meal saved before sugar was tracked gets it from its foods.
      const meal = fillMissingMacros(fillMissingSugar(stored, foodsById));
      byDay.set(meal.localDate, [...(byDay.get(meal.localDate) ?? []), meal]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, meals]) => ({ date, meals: meals.sort((a, b) => a.eatenAt - b.eatenAt) }));
  }, [query.data, foodDb]);

  if (query.isError) {
    const code = query.error instanceof DataError ? query.error.code : null;
    return (
      <p role="alert" className="text-base font-medium">
        {dataErrorMessage(code)}
      </p>
    );
  }
  if (query.data === undefined) return <p className="text-base text-muted">{he.loading}</p>;
  if (days.length === 0) return <p className="text-base">{he.copy.empty}</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{he.copy.hint}</p>
      {days.map(({ date, meals }) => {
        const day = formatDayTitle(date, tz);
        return (
          <section key={date} aria-label={day} className="space-y-2">
            <h3 className="text-base font-bold">{day}</h3>
            <ul className="space-y-2">
              {meals.map((meal) => (
                <li
                  key={meal.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3"
                >
                  <span className="min-w-0">
                    <span className="block break-words font-medium">{meal.name}</span>
                    <span className="block text-sm text-muted">
                      <bdi>{formatClock(meal.eatenAt, tz)}</bdi> · {he.slots[meal.slot]} ·{' '}
                      <bdi>{formatInt(meal.kcal)}</bdi> {he.kcal}
                    </span>
                  </span>
                  <Button
                    className="shrink-0"
                    aria-label={he.copy.useAria(meal.name, day)}
                    onClick={() => onPick(meal)}
                  >
                    {he.copy.use}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
