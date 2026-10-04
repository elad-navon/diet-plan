import { isManualEntry, type FoodEntry } from '../../core/food';
import { formatDecimal, he } from '../../i18n/he';

/** How much of a food is in a meal: "2 × יחידה (99 ג')", "150 ג'", or "הוזן ידנית" for a food typed by hand. */
export const quantityLabel = (item: FoodEntry): string =>
  isManualEntry(item)
    ? he.addMeal.byHand
    : item.unit !== undefined && item.count !== undefined
      ? `${formatDecimal(item.count)} × ${item.unit} (${formatDecimal(item.grams)} ${he.gramsShort})`
      : `${formatDecimal(item.grams)} ${he.gramsShort}`;
