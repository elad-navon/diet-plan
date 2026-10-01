import { useMemo, useState } from 'react';
import { searchFoods, type FoodRecord } from '../../core/food';
import { useFoodDb, useFoodUsage } from '../../app/data-hooks';
import { formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { TextField } from '../../ui/Field';

interface FoodSearchProps {
  onPick: (food: FoodRecord) => void;
  /** Nothing fits: fall back to manual entry, keeping what was typed as the meal name. */
  onManual: (name: string) => void;
}

const MAX_RESULTS = 15;
const MAX_FREQUENT = 8;

/** Search the national nutrition database in Hebrew; foods the user eats often come first. */
export function FoodSearch({ onPick, onManual }: FoodSearchProps) {
  const [text, setText] = useState('');
  const database = useFoodDb();
  const usage = useFoodUsage().data;
  const loaded = database.data;

  const frequent = useMemo(() => {
    if (!loaded || !usage || usage.size === 0) return [];
    const byId = new Map(loaded.db.foods.map((food) => [food.id, food]));
    return [...usage.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_FREQUENT)
      .flatMap(([id]) => byId.get(id) ?? []);
  }, [loaded, usage]);

  const results = useMemo(
    () =>
      loaded
        ? searchFoods(loaded.index, text, { limit: MAX_RESULTS, ...(usage ? { usage } : {}) })
        : [],
    [loaded, text, usage],
  );

  const trimmed = text.trim();
  const showResults = trimmed.length >= 2;
  const list = showResults ? results : frequent;

  return (
    <div className="space-y-3">
      <TextField
        label={he.addMeal.searchLabel}
        value={text}
        onChange={setText}
        type="search"
        autoComplete="off"
        placeholder={he.addMeal.searchPlaceholder}
      />

      {database.isPending && (
        <p role="status" className="text-muted">
          {he.addMeal.foodLoading}
        </p>
      )}
      {database.isError && (
        <p role="alert" className="text-base">
          {he.addMeal.foodError}
        </p>
      )}

      {loaded && !showResults && frequent.length === 0 && (
        <p className="text-muted">{he.addMeal.hintType}</p>
      )}
      {loaded && !showResults && frequent.length > 0 && (
        <h3 className="text-base font-semibold text-muted">{he.addMeal.frequent}</h3>
      )}

      {list.length > 0 && (
        <ul className="divide-y divide-faint overflow-hidden rounded-xl border border-faint">
          {list.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => onPick(food)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-start"
              >
                <span className="min-w-0">
                  <span className="block break-words text-base font-medium">{food.name}</span>
                  <span className="block text-sm text-muted">
                    {he.addMeal.per100(formatInt(food.kcal100))}
                  </span>
                </span>
                <Icon name="plus" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {loaded && showResults && results.length === 0 && (
        <p role="status" className="text-base">
          {he.addMeal.noResults}
        </p>
      )}
      {(database.isError || (loaded && showResults && results.length === 0)) && (
        <Button onClick={() => onManual(trimmed)}>
          {trimmed ? he.addMeal.manualWithName(trimmed) : he.addMeal.manualInstead}
        </Button>
      )}
      {loaded && showResults && results.length > 0 && (
        <Button variant="ghost" className="-ms-4" onClick={() => onManual(trimmed)}>
          {he.addMeal.manualWithName(trimmed)}
        </Button>
      )}
    </div>
  );
}
