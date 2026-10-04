import { useState } from 'react';
import { useFavorites, useRemoveFavorite } from '../../app/data-hooks';
import { DataError, type FavoriteRecord } from '../../data';
import { dataErrorMessage } from '../../i18n/data-errors';
import { formatDecimal, formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { savedMeals } from './favorites';

interface SavedMealsSheetProps {
  open: boolean;
  onClose: () => void;
  /** The person chose a saved meal: it opens in the new-meal window, to be added. */
  onPick: (meal: FavoriteRecord) => void;
}

/** The meals saved with "save this meal": only them, nothing to search and no tabs. */
export function SavedMealsSheet({ open, onClose, onPick }: SavedMealsSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={he.saved.title}>
      <SavedMealsList onPick={onPick} />
    </Sheet>
  );
}

function SavedMealsList({ onPick }: { onPick: (meal: FavoriteRecord) => void }) {
  const favorites = useFavorites().data;
  const remove = useRemoveFavorite();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const meals = savedMeals(favorites ?? []);

  async function removeMeal(id: string): Promise<void> {
    setConfirmId(null);
    try {
      await remove.mutateAsync(id);
      setProblem(null);
    } catch (error) {
      setProblem(dataErrorMessage(error instanceof DataError ? error.code : null));
    }
  }

  if (meals.length === 0) return <p className="text-base">{he.saved.empty}</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {meals.map((meal) => (
          <li
            key={meal.id}
            className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3"
          >
            <span className="min-w-0">
              <span className="block break-words font-medium">{meal.name}</span>
              <span className="block text-sm text-muted">
                <bdi>{formatInt(meal.kcal)}</bdi> {he.kcal}
                {meal.macros !== null && (
                  <>
                    {' '}
                    · {he.today.protein} <bdi>{formatInt(meal.macros.proteinG)}</bdi>
                  </>
                )}
                {meal.addedSugarG !== null &&
                  meal.addedSugarG > 0 &&
                  ` · ${he.sugar.mealTotal(formatDecimal(meal.addedSugarG))}`}
              </span>
            </span>
            {confirmId === meal.id ? (
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                <span className="text-sm">{he.saved.removeAsk}</span>
                <Button onClick={() => void removeMeal(meal.id)}>{he.saved.removeYes}</Button>
                <Button variant="ghost" onClick={() => setConfirmId(null)}>
                  {he.cancel}
                </Button>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1">
                <Button aria-label={he.saved.useAria(meal.name)} onClick={() => onPick(meal)}>
                  {he.saved.use}
                </Button>
                <Button
                  icon
                  variant="ghost"
                  aria-label={he.saved.remove(meal.name)}
                  onClick={() => setConfirmId(meal.id)}
                >
                  <Icon name="trash" />
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="text-base font-medium">
          {problem}
        </p>
      )}
    </div>
  );
}
