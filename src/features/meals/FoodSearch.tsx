import { useMemo, useState } from 'react';
import { buildFoodIndex, searchFoods, type FoodRecord, type UserProduct } from '../../core/food';
import { useFoodDb, useFoodUsage, useRemoveFavorite } from '../../app/data-hooks';
import { formatDecimal, formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { TextField } from '../../ui/Field';
import { type FavoriteRecord } from '../../data';
import { matchFavorites } from './favorites';

interface FoodSearchProps {
  onPick: (food: FoodRecord) => void;
  /** The person's remembered meals: those that match what is typed come first. */
  favorites: readonly FavoriteRecord[];
  onPickFavorite: (id: string) => void;
  /** Nothing fits: fall back to manual entry, keeping what was typed as the meal name. */
  onManual: (name: string) => void;
  /** The person's own products (saved from a label): those that match come first. */
  products: readonly UserProduct[];
  /** Save a new product from its label, starting with what was typed as its name. */
  onAddProduct: (name: string) => void;
}

const MAX_RESULTS = 15;
const MAX_PRODUCTS = 8;
/** The person's products are searched on their own, with no "popular foods" boost. */
const NO_POPULAR: ReadonlySet<string> = new Set();

/** Search the national nutrition database in Hebrew; foods the user eats often come first. */
export function FoodSearch({
  onPick,
  favorites,
  onPickFavorite,
  onManual,
  products,
  onAddProduct,
}: FoodSearchProps) {
  const [text, setText] = useState('');
  const removeFavorite = useRemoveFavorite();
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const database = useFoodDb();
  const usage = useFoodUsage().data;
  const loaded = database.data;

  const productIndex = useMemo(() => buildFoodIndex(products, NO_POPULAR), [products]);
  const myProducts = useMemo(
    () =>
      searchFoods(productIndex, text, {
        limit: MAX_PRODUCTS,
        ...(usage ? { usage } : {}),
      }) as UserProduct[],
    [productIndex, text, usage],
  );

  const results = useMemo(
    () =>
      loaded
        ? searchFoods(loaded.index, text, { limit: MAX_RESULTS, ...(usage ? { usage } : {}) })
        : [],
    [loaded, text, usage],
  );

  const trimmed = text.trim();
  const showResults = trimmed.length >= 2;
  const list = showResults ? results : [];
  // The person's own products come first: all of them (the most eaten first) before anything is typed, the
  // matching ones once it is.
  const shownProducts = useMemo(
    () =>
      showResults
        ? myProducts
        : [...products]
            .sort(
              (a, b) =>
                (usage?.get(b.id) ?? 0) - (usage?.get(a.id) ?? 0) ||
                a.name.localeCompare(b.name, 'he'),
            )
            .slice(0, MAX_PRODUCTS),
    [showResults, myProducts, products, usage],
  );
  const mine = useMemo(() => matchFavorites(favorites, text), [favorites, text]);

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

      <Button variant="ghost" className="-ms-4" onClick={() => onAddProduct(trimmed)}>
        <Icon name="plus" /> {trimmed ? he.products.fromSearch(trimmed) : he.products.addNew}
      </Button>

      {shownProducts.length > 0 && (
        <>
          <h3 className="text-base font-semibold text-muted">{he.products.title}</h3>
          <ul className="divide-y divide-faint overflow-hidden rounded-2xl bg-surface-2">
            {shownProducts.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => onPick(product)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-start transition hover:bg-faint/60"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-base font-medium">{product.name}</span>
                    <span className="block text-sm text-muted">
                      {he.products.per100(formatInt(product.kcal100), product.basis === 'ml')}
                      {product.grain && ` · ${he.flour.tag[product.grain]}`}
                    </span>
                  </span>
                  <Icon name="plus" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

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

      {loaded && !showResults && products.length === 0 && (
        <p className="text-muted">{he.addMeal.hintType}</p>
      )}

      {mine.length > 0 && (
        <>
          <h3 className="text-base font-semibold text-muted">{he.addMeal.myFoods}</h3>
          <ul className="divide-y divide-faint overflow-hidden rounded-2xl bg-surface-2">
            {mine.map((favorite) => (
              <li key={favorite.id} className="flex items-center">
                {confirmRemoveId === favorite.id ? (
                  <span className="flex min-h-14 flex-1 flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <span className="min-w-0 break-words text-base">
                      {favorite.name} · {he.addMeal.removeFavoriteAsk}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        onClick={() => {
                          setConfirmRemoveId(null);
                          removeFavorite.mutate(favorite.id);
                        }}
                      >
                        {he.addMeal.removeFavoriteYes}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmRemoveId(null)}>
                        {he.cancel}
                      </Button>
                    </span>
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onPickFavorite(favorite.id)}
                      className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-2 text-start transition hover:bg-faint/60"
                    >
                      <span className="min-w-0">
                        <span className="block break-words text-base font-medium">
                          {favorite.name}
                        </span>
                        <span className="block text-sm text-muted">
                          <bdi>{formatInt(favorite.kcal)}</bdi> {he.kcal}
                          {favorite.addedSugarG !== null &&
                            favorite.addedSugarG > 0 &&
                            ` · ${he.sugar.mealTotal(formatDecimal(favorite.addedSugarG))}`}
                        </span>
                      </span>
                      <Icon name="star" />
                    </button>
                    <Button
                      icon
                      variant="ghost"
                      className="me-1 shrink-0"
                      aria-label={he.addMeal.removeFavorite(favorite.name)}
                      onClick={() => setConfirmRemoveId(favorite.id)}
                    >
                      <Icon name="trash" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {list.length > 0 && (
        <ul className="divide-y divide-faint overflow-hidden rounded-2xl bg-surface-2">
          {list.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => onPick(food)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-start transition hover:bg-faint/60"
              >
                <span className="min-w-0">
                  <span className="block break-words text-base font-medium">{food.name}</span>
                  <span className="block text-sm text-muted">
                    {he.addMeal.per100(formatInt(food.kcal100))}
                    {' · '}
                    {food.addedSugar100 === undefined
                      ? he.sugar.unknown100
                      : food.addedSugar100 === 0
                        ? he.sugar.none100
                        : he.sugar.per100(formatDecimal(food.addedSugar100))}
                    {food.grain && ` · ${he.flour.tag[food.grain]}`}
                  </span>
                </span>
                <Icon name="plus" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {loaded && showResults && results.length === 0 && shownProducts.length === 0 && (
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
