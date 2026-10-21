import { isManualEntry, type FoodEntry } from '../../core/food';
import { formatDecimal, he } from '../../i18n/he';

/**
 * How much of a food is in a meal: "2 × יחידה (99 ג')", "150 ג'", "250 מ\"ל" for a drink labelled per 100 ml, or
 * "הוזן ידנית" for a food typed by hand.
 */
export function quantityLabel(item: FoodEntry): string {
  if (isManualEntry(item)) return he.addMeal.byHand;
  const amount = `${formatDecimal(item.grams)} ${item.ml ? he.mlShort : he.gramsShort}`;
  return item.unit !== undefined && item.count !== undefined
    ? `${formatDecimal(item.count)} × ${item.unit} (${amount})`
    : amount;
}
