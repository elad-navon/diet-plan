import { type StoredMeal } from '../../data';
import { type Tz } from '../../core/time';
import { formatClock } from '../../i18n/format';
import { formatDecimal, formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { MealArt } from '../../ui/art/MealArt';
import { mealIcon } from './meal-icon';

interface MealListProps {
  meals: readonly StoredMeal[];
  tz: Tz;
  onEdit: (meal: StoredMeal) => void;
  onDelete: (meal: StoredMeal) => void;
  onAgain: (meal: StoredMeal) => void;
  /** The number each meal has on the day chart (computer layout: the same number is shown here). */
  numbers?: ReadonlyMap<string, number>;
}

/** Smaller buttons on a computer, where a pointer is precise (the phone keeps the 44 px touch size). */
const ACTION = 'lg:min-h-9 lg:min-w-9';

/**
 * The day's meals, newest last, each with the three things you do to a meal: edit, delete, eat again.
 * On a computer the same list is a compact column of rows, numbered like the meals on the chart.
 */
export function MealList({ meals, tz, onEdit, onDelete, onAgain, numbers }: MealListProps) {
  if (meals.length === 0) {
    return <p className="card p-5 text-muted lg:shadow-none lg:p-0">{he.today.noMealsYet}</p>;
  }
  return (
    <ul className="space-y-2 lg:space-y-0">
      {meals.map((meal) => {
        const number = numbers?.get(meal.id);
        return (
          <li
            key={meal.id}
            className="card p-4 lg:flex lg:items-center lg:gap-1 lg:rounded-xl lg:border-b lg:border-faint lg:bg-transparent lg:p-1.5 lg:shadow-none lg:transition lg:last:border-b-0 lg:hover:bg-[var(--row-hover)]"
          >
            <div className="flex items-start justify-between gap-3 lg:min-w-0 lg:flex-1 lg:items-center lg:gap-2">
              <div className="flex min-w-0 gap-3 lg:items-center lg:gap-2">
                {number !== undefined && (
                  <span
                    aria-hidden="true"
                    className="hidden size-6 shrink-0 place-items-center rounded-full bg-series-1 text-xs font-bold text-surface lg:grid"
                  >
                    {number}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-2xl lg:hidden"
                >
                  {mealIcon(meal)}
                </span>
                <span
                  aria-hidden="true"
                  className="hidden size-11 shrink-0 place-items-center rounded-2xl bg-[var(--tile-bg)] ring-1 ring-inset ring-faint lg:grid"
                >
                  <MealArt emoji={mealIcon(meal)} size={34} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-muted">
                    <bdi>{formatClock(meal.eatenAt, tz)}</bdi>
                    <span className="lg:hidden"> · {he.slots[meal.slot]}</span>
                  </p>
                  <p className="break-words text-lg font-semibold lg:text-base lg:leading-tight">
                    {meal.name}
                  </p>
                  {meal.addedSugarG !== null && meal.addedSugarG > 0 && (
                    <p className="text-sm text-muted lg:text-xs">
                      {he.sugar.mealTotal(formatDecimal(meal.addedSugarG))}
                    </p>
                  )}
                  {meal.proteinG !== null && (
                    <p className="text-sm text-muted lg:text-xs">
                      {he.today.protein} <bdi>{formatInt(meal.proteinG)}</bdi> · {he.today.carbs}{' '}
                      <bdi>{formatInt(meal.carbsG ?? 0)}</bdi> · {he.today.fat}{' '}
                      <bdi>{formatInt(meal.fatG ?? 0)}</bdi>
                    </p>
                  )}
                </div>
              </div>
              <p className="shrink-0 text-2xl font-bold tabular-nums lg:text-lg">
                <bdi>{formatInt(meal.kcal)}</bdi>{' '}
                <span className="text-sm font-normal text-muted lg:hidden">{he.kcal}</span>
              </p>
            </div>
            <div className="mt-1 flex gap-1 lg:mt-0 lg:flex-none lg:gap-0">
              <Button
                icon
                variant="ghost"
                className={ACTION}
                aria-label={he.today.editMeal(meal.name)}
                onClick={() => onEdit(meal)}
              >
                <Icon name="pencil" />
              </Button>
              <Button
                icon
                variant="ghost"
                className={ACTION}
                aria-label={he.today.againMeal(meal.name)}
                onClick={() => onAgain(meal)}
              >
                <Icon name="repeat" />
              </Button>
              <Button
                icon
                variant="ghost"
                className={ACTION}
                aria-label={he.today.deleteMeal(meal.name)}
                onClick={() => onDelete(meal)}
              >
                <Icon name="trash" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
