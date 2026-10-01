import { useState } from 'react';
import {
  FOOD_LIMITS,
  computeEntry,
  shortFoodName,
  type FoodEntry,
  type FoodRecord,
  type Quantity,
} from '../../core/food';
import { parseDecimalInput } from '../../core/contracts';
import { formatDecimal, formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { SelectField, TextField } from '../../ui/Field';

const GRAMS = '__grams__';

interface QuantityEditorProps {
  food: FoodRecord;
  /** The item being edited, if any. */
  initial?: FoodEntry | undefined;
  onConfirm: (entry: FoodEntry) => void;
  onCancel: () => void;
}

/** Initial choice: the entry's own measure, else the food's default unit, else 100 g. */
function initialState(
  food: FoodRecord,
  initial: FoodEntry | undefined,
): { unit: string; amount: string } {
  if (initial?.unit && initial.count !== undefined)
    return { unit: initial.unit, amount: String(initial.count) };
  if (initial) return { unit: GRAMS, amount: String(initial.grams) };
  if (food.defaultUnit) return { unit: food.defaultUnit, amount: '1' };
  return { unit: GRAMS, amount: '100' };
}

/** Pick how much of a food: a number of its units (e.g. 2 x "יחידה בינונית") or grams, with a live preview. */
export function QuantityEditor({ food, initial, onConfirm, onCancel }: QuantityEditorProps) {
  const start = initialState(food, initial);
  const [unit, setUnit] = useState(start.unit);
  const [amount, setAmount] = useState(start.amount);

  const parsed = parseDecimalInput(amount);
  const quantity: Quantity | null =
    parsed === null
      ? null
      : unit === GRAMS
        ? { kind: 'grams', grams: parsed }
        : { kind: 'unit', unit, count: parsed };
  const result = quantity ? computeEntry(food, quantity) : null;
  const isUnit = unit !== GRAMS;

  const error =
    result && !result.ok
      ? result.error === 'count_not_in_steps'
        ? he.addMeal.stepHint
        : he.addMeal.quantityRange
      : parsed === null
        ? he.addMeal.quantityRange
        : undefined;

  const step = (delta: number): void => {
    const next = Math.min(
      FOOD_LIMITS.countMax,
      Math.max(FOOD_LIMITS.countMin, (parsed ?? 1) + delta),
    );
    setAmount(String(next));
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">{shortFoodName(food.name)}</h3>
      <p className="text-sm text-muted">{food.name}</p>

      <SelectField
        label={he.addMeal.unit}
        value={unit}
        onChange={(value) => {
          setUnit(value);
          setAmount(value === GRAMS ? '100' : '1');
        }}
        options={[
          { value: GRAMS, label: he.addMeal.grams },
          ...food.units.map((u) => ({
            value: u.name,
            label: `${u.name} (${formatDecimal(u.grams)} ${he.gramsShort})`,
          })),
        ]}
      />

      <div className="flex items-end gap-2">
        {isUnit && (
          <Button
            icon
            aria-label={he.addMeal.decrease}
            onClick={() => step(-FOOD_LIMITS.countStep)}
          >
            <Icon name="minus" />
          </Button>
        )}
        <div className="flex-1">
          <TextField
            label={isUnit ? he.addMeal.count : he.addMeal.quantity}
            value={amount}
            onChange={setAmount}
            inputMode="decimal"
            error={error}
          />
        </div>
        {isUnit && (
          <Button icon aria-label={he.addMeal.increase} onClick={() => step(FOOD_LIMITS.countStep)}>
            <Icon name="plus" />
          </Button>
        )}
      </div>

      <p aria-live="polite" className="rounded-xl bg-canvas p-3 text-base">
        {result?.ok ? (
          <>
            <strong>
              <bdi>{formatInt(result.entry.kcal)}</bdi> {he.kcal}
            </strong>
            {' · '}
            {he.today.protein} <bdi>{formatDecimal(result.entry.proteinG)}</bdi> · {he.today.carbs}{' '}
            <bdi>{formatDecimal(result.entry.carbsG)}</bdi> · {he.today.fat}{' '}
            <bdi>{formatDecimal(result.entry.fatG)}</bdi>
            {isUnit && (
              <span className="block text-sm text-muted">
                = <bdi>{formatDecimal(result.entry.grams)}</bdi> {he.gramsShort}
              </span>
            )}
          </>
        ) : (
          '—'
        )}
      </p>

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!result?.ok}
          onClick={() => result?.ok && onConfirm(result.entry)}
        >
          {initial ? he.addMeal.updateItem : he.addMeal.addToMeal}
        </Button>
        <Button onClick={onCancel}>{he.cancel}</Button>
      </div>
    </div>
  );
}
