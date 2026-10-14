import { useState } from 'react';
import { useFavorites, useRemoveFavorite, useReorderFavorites } from '../../app/data-hooks';
import { MEAL_LIMITS } from '../../core/contracts';
import { DataError, type FavoriteRecord } from '../../data';
import { dataErrorMessage } from '../../i18n/data-errors';
import { formatDecimal, formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { movedSavedMeal, savedMeals } from './favorites';
import { combinedMealsPrefill, type MealPrefill } from './prefill';

interface SavedMealsSheetProps {
  open: boolean;
  onClose: () => void;
  /** The person chose one saved meal, or several to eat together: they open in the new-meal window, to be added. */
  onPick: (prefill: MealPrefill) => void;
}

/** The meals saved with "save this meal": only them, nothing to search and no tabs. */
export function SavedMealsSheet({ open, onClose, onPick }: SavedMealsSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={he.saved.title}>
      <SavedMealsList onPick={onPick} />
    </Sheet>
  );
}

function SavedMealsList({ onPick }: { onPick: (prefill: MealPrefill) => void }) {
  const favorites = useFavorites().data;
  const remove = useRemoveFavorite();
  const reorder = useReorderFavorites();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The meals ticked to be added together, in the order they were ticked. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** "Manual sort": each meal has arrows to move it up and down instead of its buttons. */
  const [sorting, setSorting] = useState(false);
  const meals = savedMeals(favorites ?? []);

  const selected = selectedIds
    .map((id) => meals.find((meal) => meal.id === id))
    .filter((meal): meal is FavoriteRecord => meal !== undefined);
  const selectedKcal = selected.reduce((sum, meal) => sum + meal.kcal, 0);
  const selectedItems = selected.reduce((sum, meal) => sum + meal.items.length, 0);
  const tooMany = selectedItems > MEAL_LIMITS.itemsMax;

  async function removeMeal(id: string): Promise<void> {
    setConfirmId(null);
    try {
      await remove.mutateAsync(id);
      setSelectedIds((current) => current.filter((other) => other !== id));
      setProblem(null);
    } catch (error) {
      setProblem(dataErrorMessage(error instanceof DataError ? error.code : null));
    }
  }

  async function move(id: string, step: -1 | 1): Promise<void> {
    try {
      await reorder.mutateAsync(movedSavedMeal(meals, id, step));
      setProblem(null);
    } catch (error) {
      setProblem(dataErrorMessage(error instanceof DataError ? error.code : null));
    }
  }

  function toggle(id: string, on: boolean): void {
    setSelectedIds((current) =>
      on
        ? [...current.filter((other) => other !== id), id]
        : current.filter((other) => other !== id),
    );
  }

  function addTogether(): void {
    const prefill = combinedMealsPrefill(selected);
    if (prefill) onPick(prefill);
  }

  if (meals.length === 0) return <p className="text-base">{he.saved.empty}</p>;
  return (
    <div className="space-y-3">
      {meals.length > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">{sorting ? he.saved.sortHint : he.saved.selectHint}</p>
          <Button
            variant="ghost"
            aria-pressed={sorting}
            onClick={() => {
              setSorting((current) => !current);
              setConfirmId(null);
            }}
            className="shrink-0"
          >
            {sorting ? he.saved.sortDone : he.saved.sort}
          </Button>
        </div>
      )}
      <ul className="space-y-2">
        {meals.map((meal, index) => (
          <li
            key={meal.id}
            className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3"
          >
            <span className="flex min-w-0 items-center gap-3">
              {!sorting && meals.length > 1 && (
                <input
                  type="checkbox"
                  aria-label={he.saved.select(meal.name)}
                  checked={selectedIds.includes(meal.id)}
                  onChange={(event) => toggle(meal.id, event.target.checked)}
                  className="size-6 shrink-0 accent-[var(--accent)]"
                />
              )}
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
            </span>
            {sorting ? (
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  icon
                  variant="ghost"
                  aria-label={he.saved.moveUp(meal.name)}
                  disabled={index === 0}
                  onClick={() => void move(meal.id, -1)}
                >
                  <Icon name="arrow-up" />
                </Button>
                <Button
                  icon
                  variant="ghost"
                  aria-label={he.saved.moveDown(meal.name)}
                  disabled={index === meals.length - 1}
                  onClick={() => void move(meal.id, 1)}
                >
                  <Icon name="arrow-down" />
                </Button>
              </span>
            ) : confirmId === meal.id ? (
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                <span className="text-sm">{he.saved.removeAsk}</span>
                <Button onClick={() => void removeMeal(meal.id)}>{he.saved.removeYes}</Button>
                <Button variant="ghost" onClick={() => setConfirmId(null)}>
                  {he.cancel}
                </Button>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  aria-label={he.saved.useAria(meal.name)}
                  onClick={() => {
                    const prefill = combinedMealsPrefill([meal]);
                    if (prefill) onPick(prefill);
                  }}
                >
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
      {!sorting && selected.length > 1 && (
        <div className="sticky bottom-0 -mx-5 space-y-2 border-t border-faint bg-surface px-5 pb-1 pt-3">
          <p className="text-base" role="status">
            {he.saved.selected(selected.length, formatInt(selectedKcal))}
          </p>
          {tooMany && <p className="text-sm">{he.saved.tooManyItems(MEAL_LIMITS.itemsMax)}</p>}
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={tooMany}
            onClick={addTogether}
          >
            {he.saved.addTogether}
          </Button>
        </div>
      )}
    </div>
  );
}
