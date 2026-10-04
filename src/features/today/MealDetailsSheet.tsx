import {
  isManualEntry,
  manualGrain,
  summarizeGrain,
  type FoodEntry,
  type FoodRecord,
} from '../../core/food';
import { type Tz } from '../../core/time';
import { type StoredMeal } from '../../data';
import { formatClock, formatDayMonth } from '../../i18n/format';
import { formatDecimal, formatInt, he } from '../../i18n/he';
import { Sheet } from '../../ui/Sheet';
import { quantityLabel } from '../meals/quantity-label';

interface MealDetailsSheetProps {
  /** The meal to show; null = closed. */
  meal: StoredMeal | null;
  tz: Tz;
  foods: ReadonlyMap<string, FoodRecord>;
  onClose: () => void;
}

/** A meal with everything it holds, to read: nothing here can be changed (editing is its own button). */
export function MealDetailsSheet({ meal, tz, foods, onClose }: MealDetailsSheetProps) {
  return (
    <Sheet open={meal !== null} onClose={onClose} title={meal?.name ?? ''}>
      {meal && <MealDetails meal={meal} tz={tz} foods={foods} />}
    </Sheet>
  );
}

const grams = (value: number): string => `${formatDecimal(value)} ${he.gramsShort}`;

function MealDetails({
  meal,
  tz,
  foods,
}: {
  meal: StoredMeal;
  tz: Tz;
  foods: ReadonlyMap<string, FoodRecord>;
}) {
  const hasMacros = meal.proteinG !== null && meal.carbsG !== null && meal.fatG !== null;
  const grain = summarizeGrain([meal], foods);
  return (
    <div className="space-y-4">
      <p className="text-base text-muted">
        {formatDayMonth(meal.localDate, tz)} · <bdi>{formatClock(meal.eatenAt, tz)}</bdi> ·{' '}
        {he.slots[meal.slot]}
      </p>
      <p className="text-4xl font-bold tabular-nums">
        <bdi>{formatInt(meal.kcal)}</bdi>{' '}
        <span className="text-base font-normal text-muted">{he.kcal}</span>
      </p>

      {hasMacros ? (
        <dl className="grid grid-cols-3 gap-2">
          {[
            [he.today.protein, meal.proteinG],
            [he.today.carbs, meal.carbsG],
            [he.today.fat, meal.fatG],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-surface-2 p-3 text-center">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-xl font-bold tabular-nums">
                <bdi>{formatDecimal(value as number)}</bdi>{' '}
                <span className="text-sm font-normal text-muted">{he.gramsShort}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-base text-muted">{he.today.mealDetails.noMacros}</p>
      )}

      <ul className="space-y-1 text-base">
        <li>
          {meal.addedSugarG === null
            ? he.today.mealDetails.sugarUnknown
            : he.sugar.mealTotal(formatDecimal(meal.addedSugarG))}
        </li>
        {grain.refinedCarbsG > 0 && (
          <li>
            {he.flour.refinedLabel}: <bdi>{formatDecimal(grain.refinedCarbsG)}</bdi> {he.flour.unit}
          </li>
        )}
        {grain.wholeCarbsG > 0 && (
          <li>
            {he.flour.wholeLabel}: <bdi>{formatDecimal(grain.wholeCarbsG)}</bdi> {he.flour.unit}
          </li>
        )}
      </ul>

      {meal.items.length === 0 ? (
        <p className="text-sm text-muted">{he.today.mealDetails.typedByHand}</p>
      ) : (
        <section aria-labelledby="meal-items-title" className="space-y-2">
          <h3 id="meal-items-title" className="text-lg font-bold">
            {he.today.mealDetails.itemsTitle}
          </h3>
          <ul className="space-y-2">
            {meal.items.map((item, index) => (
              <ItemDetails key={`${item.foodId}-${index}`} item={item} foods={foods} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ItemDetails({ item, foods }: { item: FoodEntry; foods: ReadonlyMap<string, FoodRecord> }) {
  const typed = isManualEntry(item);
  const kind = typed ? manualGrain(item.name)?.kind : foods.get(item.foodId)?.grain;
  const split = typed && (item.refinedCarbsG !== undefined || item.wholeCarbsG !== undefined);
  return (
    <li className="space-y-0.5 rounded-2xl bg-surface-2 p-3">
      <p className="break-words font-medium">{item.name}</p>
      <p className="text-sm text-muted">
        {quantityLabel(item)} · <bdi>{formatInt(item.kcal)}</bdi> {he.kcal}
      </p>
      <p className="text-sm text-muted">
        {item.noMacros ? (
          he.today.mealDetails.itemNoMacros
        ) : (
          <>
            {he.today.protein} <bdi>{grams(item.proteinG)}</bdi> · {he.today.carbs}{' '}
            <bdi>{grams(item.carbsG)}</bdi> · {he.today.fat} <bdi>{grams(item.fatG)}</bdi>
          </>
        )}
      </p>
      {item.addedSugarG !== undefined && item.addedSugarG > 0 && (
        <p className="text-sm text-muted">{he.sugar.item(formatDecimal(item.addedSugarG))}</p>
      )}
      {split ? (
        <>
          {item.refinedCarbsG !== undefined && (
            <p className="text-sm text-muted">
              {he.flour.refinedLabel}: <bdi>{grams(item.refinedCarbsG)}</bdi>
            </p>
          )}
          {item.wholeCarbsG !== undefined && (
            <p className="text-sm text-muted">
              {he.flour.wholeLabel}: <bdi>{grams(item.wholeCarbsG)}</bdi>
            </p>
          )}
        </>
      ) : (
        kind && <p className="text-sm text-muted">{he.flour.tag[kind]}</p>
      )}
    </li>
  );
}
