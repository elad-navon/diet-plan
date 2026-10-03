/** Which drawing of the sprite goes with each of the meal emoji (see features/today/meal-icon.ts). */
const SYMBOL: Readonly<Record<string, string>> = {
  '🥪': 'm-sandwich',
  '🍳': 'm-egg',
  '🍞': 'm-bread',
  '🥣': 'm-cereal',
  '🧀': 'm-cheese',
  '🥛': 'm-milk',
  '🍗': 'm-chicken',
  '🥩': 'm-steak',
  '🐟': 'm-fish',
  '🍝': 'm-pasta',
  '🍚': 'm-rice',
  '🥔': 'm-potato',
  '🧆': 'm-falafel',
  '🫘': 'm-beans',
  '🥗': 'm-salad',
  '🥕': 'm-carrot',
  '🍅': 'm-tomato',
  '🥒': 'm-cucumber',
  '🫑': 'm-pepper',
  '🥦': 'm-broccoli',
  '🌽': 'm-corn',
  '🍆': 'm-eggplant',
  '🍲': 'm-soup',
  '🍕': 'm-pizza',
  '🥑': 'm-avocado',
  '🍌': 'm-banana',
  '🍎': 'm-apple',
  '🍊': 'm-orange',
  '🍇': 'm-grapes',
  '🍓': 'm-berries',
  '🍒': 'm-cherry',
  '🍉': 'm-watermelon',
  '🍈': 'm-melon',
  '🍑': 'm-peach',
  '🥭': 'm-mango',
  '🥝': 'm-kiwi',
  '🍍': 'm-pineapple',
  '🍐': 'm-pear',
  '🍋': 'm-lemon',
  '🍧': 'm-icepop',
  '🍦': 'm-icecream',
  '🥜': 'm-nuts',
  '🍫': 'm-choc',
  '🍰': 'm-cake',
  '🍪': 'm-cookie',
  '☕': 'm-coffee',
  '🧃': 'm-juice',
  '🍽️': 'm-plate',
};

/** A meal's picture, drawn from the sprite. A food without its own drawing keeps the emoji. */
export function MealArt({ emoji, size = 36 }: { emoji: string; size?: number }) {
  const symbol = SYMBOL[emoji];
  if (!symbol) {
    return (
      <span aria-hidden="true" style={{ fontSize: size * 0.75 }} className="leading-none">
        {emoji}
      </span>
    );
  }
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64">
      <use href={`#${symbol}`} />
    </svg>
  );
}
