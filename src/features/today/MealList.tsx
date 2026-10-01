import { type StoredMeal } from '../../data';
import { type Tz } from '../../core/time';
import { formatClock } from '../../i18n/format';
import { formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

interface MealListProps {
  meals: readonly StoredMeal[];
  tz: Tz;
  onEdit: (meal: StoredMeal) => void;
  onDelete: (meal: StoredMeal) => void;
  onAgain: (meal: StoredMeal) => void;
}

/** The day's meals, newest last, each with the three things you do to a meal: edit, delete, eat again. */
export function MealList({ meals, tz, onEdit, onDelete, onAgain }: MealListProps) {
  if (meals.length === 0) {
    return (
      <p className="rounded-2xl border border-faint bg-surface p-4 text-muted">
        {he.today.noMealsYet}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {meals.map((meal) => (
        <li key={meal.id} className="rounded-2xl border border-faint bg-surface p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted">
                <bdi>{formatClock(meal.eatenAt, tz)}</bdi> · {he.slots[meal.slot]}
              </p>
              <p className="break-words text-lg font-semibold">{meal.name}</p>
              {meal.proteinG !== null && (
                <p className="text-sm text-muted">
                  {he.today.protein} <bdi>{formatInt(meal.proteinG)}</bdi> · {he.today.carbs}{' '}
                  <bdi>{formatInt(meal.carbsG ?? 0)}</bdi> · {he.today.fat}{' '}
                  <bdi>{formatInt(meal.fatG ?? 0)}</bdi>
                </p>
              )}
            </div>
            <p className="shrink-0 text-xl font-bold">
              <bdi>{formatInt(meal.kcal)}</bdi>{' '}
              <span className="text-sm font-normal text-muted">{he.kcal}</span>
            </p>
          </div>
          <div className="mt-1 flex gap-1">
            <Button
              icon
              variant="ghost"
              aria-label={he.today.editMeal(meal.name)}
              onClick={() => onEdit(meal)}
            >
              <Icon name="pencil" />
            </Button>
            <Button
              icon
              variant="ghost"
              aria-label={he.today.againMeal(meal.name)}
              onClick={() => onAgain(meal)}
            >
              <Icon name="repeat" />
            </Button>
            <Button
              icon
              variant="ghost"
              aria-label={he.today.deleteMeal(meal.name)}
              onClick={() => onDelete(meal)}
            >
              <Icon name="trash" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
