import { useState } from 'react';
import { newId } from '../../app/ids';
import {
  useAddFavorite,
  useAddMeal,
  useFavorites,
  useFoodDb,
  useMarkFavoriteUsed,
  useUpdateMeal,
} from '../../app/data-hooks';
import { parseDecimalInput, validateMealInput, type InputError } from '../../core/contracts';
import {
  mealNameFromEntries,
  shortFoodName,
  sumEntries,
  type FoodEntry,
  type FoodRecord,
} from '../../core/food';
import { type Macros } from '../../core/nutrition';
import { inferSlot, slotWindows, type MealSchedule, type MealSlot } from '../../core/schedule';
import {
  isValidLocalDate,
  localDateOf,
  localTimeOf,
  wallToInstant,
  type Instant,
  type LocalDate,
  type Tz,
} from '../../core/time';
import { DataError, type MealSource, type StoredMeal } from '../../data';
import { dataErrorMessage } from '../../i18n/data-errors';
import { formatDecimal, formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { SelectField, TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { FoodSearch } from './FoodSearch';
import { QuantityEditor } from './QuantityEditor';

/** Values to start the form with (a suggestion, a favorite, a repeated meal). */
export interface MealPrefill {
  name: string;
  kcal: number;
  macros: Macros | null;
  slot?: MealSlot;
  source?: MealSource;
  items?: FoodEntry[];
  foodDbVersion?: string;
  favoriteId?: string;
}

interface AddMealSheetProps {
  open: boolean;
  onClose: () => void;
  /** The local day the meal belongs to (today unless back-filling). */
  date: LocalDate;
  tz: Tz;
  now: Instant;
  schedule: MealSchedule;
  editing?: StoredMeal | null;
  prefill?: MealPrefill | null;
  onSaved: (meal: StoredMeal, kind: 'added' | 'updated') => void;
}

export function AddMealSheet(props: AddMealSheetProps) {
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={props.editing ? he.addMeal.editTitle : he.addMeal.title}
    >
      <MealForm {...props} />
    </Sheet>
  );
}

type Mode = 'search' | 'manual' | 'favorites';
type FieldErrors = Partial<Record<InputError['field'] | 'form', string>>;

const SLOT_OPTIONS = (Object.keys(he.slots) as MealSlot[]).map((slot) => ({
  value: slot,
  label: he.slots[slot],
}));

const quantityLabel = (item: FoodEntry): string =>
  item.unit !== undefined && item.count !== undefined
    ? `${formatDecimal(item.count)} × ${item.unit} (${formatDecimal(item.grams)} ${he.gramsShort})`
    : `${formatDecimal(item.grams)} ${he.gramsShort}`;

function MealForm({
  date,
  tz,
  now,
  schedule,
  editing,
  prefill,
  onClose,
  onSaved,
}: AddMealSheetProps) {
  const database = useFoodDb(false);
  const favorites = useFavorites().data ?? [];
  const addMeal = useAddMeal();
  const updateMeal = useUpdateMeal();
  const addFavorite = useAddFavorite();
  const markUsed = useMarkFavoriteUsed();

  // One id per open sheet: pressing "save" twice, or retrying after a hiccup, can only ever create one meal.
  const [mealId] = useState(() => editing?.id ?? newId());
  const seed = editing ?? prefill ?? null;
  const seedItems = editing?.items ?? prefill?.items ?? [];

  const [mode, setMode] = useState<Mode>(
    seedItems.length > 0 ? 'search' : seed ? 'manual' : 'search',
  );
  const [items, setItems] = useState<FoodEntry[]>(seedItems);
  const [pickedFood, setPickedFood] = useState<FoodRecord | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const [name, setName] = useState(seed?.name ?? '');
  const [kcalText, setKcalText] = useState(seed ? String(seed.kcal) : '');
  const seedMacros: Macros | null =
    editing && editing.proteinG !== null && editing.carbsG !== null && editing.fatG !== null
      ? { proteinG: editing.proteinG, carbsG: editing.carbsG, fatG: editing.fatG }
      : (prefill?.macros ?? null);
  const [macrosOn, setMacrosOn] = useState(seedMacros !== null);
  const [proteinText, setProteinText] = useState(seedMacros ? String(seedMacros.proteinG) : '');
  const [carbsText, setCarbsText] = useState(seedMacros ? String(seedMacros.carbsG) : '');
  const [fatText, setFatText] = useState(seedMacros ? String(seedMacros.fatG) : '');
  // A meal built from foods keeps the name it was given (an edited meal, or a suggestion such as "טוסט גבינה").
  const [mealName, setMealName] = useState(seedItems.length > 0 && seed ? seed.name : '');

  const [dateText, setDateText] = useState<string>(editing?.localDate ?? date);
  const [timeText, setTimeText] = useState<string>(
    editing
      ? localTimeOf(editing.eatenAt, tz)
      : date === localDateOf(now, tz)
        ? localTimeOf(now, tz)
        : '12:00',
  );
  const [slotChoice, setSlotChoice] = useState<MealSlot | null>(
    editing?.slot ?? prefill?.slot ?? null,
  );
  const [sourceHint, setSourceHint] = useState<MealSource>(
    editing?.source ?? prefill?.source ?? 'manual',
  );
  const [favoriteId, setFavoriteId] = useState<string | null>(prefill?.favoriteId ?? null);

  const [submitted, setSubmitted] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [warnMismatch, setWarnMismatch] = useState(false);
  const [saving, setSaving] = useState(false);

  const kind: 'food' | 'manual' = items.length > 0 ? 'food' : 'manual';
  const totals = sumEntries(items);

  const eatenAt = ((): Instant | null => {
    if (!isValidLocalDate(dateText) || !/^\d{2}:\d{2}$/.test(timeText)) return null;
    try {
      return wallToInstant(dateText, timeText, tz);
    } catch {
      return null;
    }
  })();
  const autoSlot: MealSlot =
    eatenAt === null || !isValidLocalDate(dateText)
      ? 'other'
      : inferSlot(eatenAt, slotWindows(schedule, dateText, tz));
  const slot = slotChoice ?? autoSlot;

  function startQuantity(food: FoodRecord, index: number | null): void {
    setPickedFood(food);
    setEditIndex(index);
  }

  function applyFavorite(id: string): void {
    const favorite = favorites.find((f) => f.id === id);
    if (!favorite) return;
    setItems(favorite.items);
    setName(favorite.name);
    setKcalText(String(favorite.kcal));
    setMealName(favorite.items.length > 0 ? favorite.name : '');
    setMacrosOn(favorite.macros !== null);
    setProteinText(favorite.macros ? String(favorite.macros.proteinG) : '');
    setCarbsText(favorite.macros ? String(favorite.macros.carbsG) : '');
    setFatText(favorite.macros ? String(favorite.macros.fatG) : '');
    setSourceHint('favorite');
    setFavoriteId(id);
    setMode(favorite.items.length > 0 ? 'search' : 'manual');
  }

  /** The values the meal would be saved with, or the problems with them. */
  function collect():
    | { ok: true; name: string; kcal: number; macros: Macros | null; warnings: string[] }
    | { ok: false; errors: FieldErrors } {
    const nameValue = kind === 'food' ? mealName.trim() || mealNameFromEntries(items) : name;
    const kcalValue = kind === 'food' ? totals.kcal : (parseDecimalInput(kcalText) ?? Number.NaN);
    const parsedMacros = ((): {
      proteinG: number | null;
      carbsG: number | null;
      fatG: number | null;
    } | null => {
      if (kind === 'food') {
        return { proteinG: totals.proteinG, carbsG: totals.carbsG, fatG: totals.fatG };
      }
      if (!macrosOn) return null;
      const read = (text: string): number | null =>
        text.trim() === '' ? null : (parseDecimalInput(text) ?? Number.NaN);
      return { proteinG: read(proteinText), carbsG: read(carbsText), fatG: read(fatText) };
    })();

    const checked = validateMealInput(
      { name: nameValue, kcal: kcalValue, macros: parsedMacros, eatenAt: eatenAt ?? now },
      now,
    );
    const found: FieldErrors = {};
    if (!checked.ok) {
      for (const error of checked.errors) found[error.field] = he.errors[error.code];
    }
    if (eatenAt === null) found.eatenAt = he.addMeal.timeInvalid;
    if (!checked.ok || eatenAt === null) return { ok: false, errors: found };
    return {
      ok: true,
      name: checked.value.name,
      kcal: checked.value.kcal,
      macros: checked.value.macros,
      warnings: checked.warnings,
    };
  }

  async function submit(): Promise<void> {
    setSubmitted(true);
    if (saving) return;
    const result = collect();
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setWarnMismatch(result.warnings.includes('macro_kcal_mismatch'));
    if (result.warnings.includes('kcal_large') && !confirmLarge) {
      setNeedsConfirm(true);
      return;
    }
    if (eatenAt === null) return;

    setSaving(true);
    try {
      let saved: StoredMeal;
      if (editing) {
        saved = await updateMeal.mutateAsync({
          id: editing.id,
          baseVersion: editing.version,
          patch: {
            name: result.name,
            kcal: result.kcal,
            macros: result.macros,
            items,
            eatenAt,
            slot,
          },
        });
      } else {
        saved = await addMeal.mutateAsync({
          id: mealId,
          name: result.name,
          eatenAt,
          slot,
          kcal: result.kcal,
          macros: result.macros,
          items,
          source:
            sourceHint === 'favorite' || sourceHint === 'copy'
              ? sourceHint
              : kind === 'food'
                ? 'food_db'
                : 'manual',
          ...(database.data ? { foodDbVersion: database.data.db.version } : {}),
        });
        if (favoriteId) void markUsed.mutateAsync(favoriteId);
      }
      onSaved(saved, editing ? 'updated' : 'added');
      onClose();
    } catch (error) {
      const code = error instanceof DataError ? error.code : null;
      setErrors({ form: dataErrorMessage(code) });
      if (code === 'version_conflict') onClose();
    } finally {
      setSaving(false);
    }
  }

  async function saveAsFavorite(): Promise<void> {
    const result = collect();
    if (!result.ok) {
      setSubmitted(true);
      setErrors(result.errors);
      return;
    }
    await addFavorite.mutateAsync({
      id: newId(),
      name: result.name,
      kcal: result.kcal,
      macros: result.macros,
      items,
      ...(database.data ? { foodDbVersion: database.data.db.version } : {}),
    });
    setErrors({ form: he.addMeal.favoriteSaved });
  }

  // --- while choosing a quantity, nothing else competes for attention
  if (pickedFood) {
    const initial = editIndex !== null ? items[editIndex] : undefined;
    return (
      <QuantityEditor
        food={pickedFood}
        initial={initial}
        onCancel={() => setPickedFood(null)}
        onConfirm={(entry) => {
          setItems((current) =>
            editIndex === null
              ? [...current, entry]
              : current.map((item, i) => (i === editIndex ? entry : item)),
          );
          setPickedFood(null);
          setEditIndex(null);
          setMode('search');
        }}
      />
    );
  }

  const shown = (field: InputError['field'] | 'form'): string | undefined =>
    submitted ? errors[field] : undefined;

  return (
    <div className="space-y-4">
      <fieldset className="grid grid-flow-col gap-1 rounded-xl bg-canvas p-1">
        <legend className="sr-only">{he.addMeal.modeLegend}</legend>
        {(
          [
            ['search', he.addMeal.tabSearch],
            ['manual', he.addMeal.tabManual],
            ...(favorites.length > 0 ? [['favorites', he.addMeal.tabFavorites] as const] : []),
          ] as const
        ).map(([value, label]) => {
          const disabled = value === 'manual' && kind === 'food';
          return (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-base has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                mode === value ? 'bg-surface font-bold shadow-sm' : 'text-muted'
              } ${disabled ? 'opacity-50' : ''}`}
            >
              <input
                type="radio"
                name="meal-mode"
                className="sr-only"
                checked={mode === value}
                disabled={disabled}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          );
        })}
      </fieldset>

      {mode === 'search' && (
        <FoodSearch
          onPick={(food) => startQuantity(food, null)}
          onManual={(typed) => {
            if (kind === 'manual') setName(typed);
            setMode('manual');
          }}
        />
      )}

      {mode === 'manual' && (
        <div className="space-y-3">
          {kind === 'food' ? (
            <p className="text-muted">{he.addMeal.manualDisabled}</p>
          ) : (
            <>
              <TextField
                label={he.addMeal.name}
                value={name}
                onChange={setName}
                autoComplete="off"
                error={shown('name')}
                maxLength={120}
              />
              <TextField
                label={he.addMeal.kcalField}
                value={kcalText}
                onChange={setKcalText}
                inputMode="decimal"
                error={shown('kcal')}
              />
              <label className="flex min-h-11 items-center gap-3 text-base">
                <input
                  type="checkbox"
                  checked={macrosOn}
                  onChange={(event) => setMacrosOn(event.target.checked)}
                  className="size-6 accent-[var(--accent)]"
                />
                {he.addMeal.macrosToggle}
              </label>
              {macrosOn && (
                <div className="grid grid-cols-3 gap-2">
                  <TextField
                    label={he.addMeal.proteinField}
                    value={proteinText}
                    onChange={setProteinText}
                    inputMode="decimal"
                  />
                  <TextField
                    label={he.addMeal.carbsField}
                    value={carbsText}
                    onChange={setCarbsText}
                    inputMode="decimal"
                  />
                  <TextField
                    label={he.addMeal.fatField}
                    value={fatText}
                    onChange={setFatText}
                    inputMode="decimal"
                  />
                </div>
              )}
              {shown('macros') && <p className="text-sm font-medium">⚠ {shown('macros')}</p>}
            </>
          )}
        </div>
      )}

      {mode === 'favorites' && (
        <ul className="space-y-2">
          {favorites.map((favorite) => (
            <li
              key={favorite.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-faint p-3"
            >
              <span className="min-w-0">
                <span className="block break-words font-medium">{favorite.name}</span>
                <span className="block text-sm text-muted">
                  <bdi>{formatInt(favorite.kcal)}</bdi> {he.kcal}
                </span>
              </span>
              <Button onClick={() => applyFavorite(favorite.id)}>{he.addMeal.useFavorite}</Button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <section aria-labelledby="items-title" className="space-y-2">
          <h3 id="items-title" className="text-lg font-bold">
            {he.addMeal.items}
          </h3>
          <ul className="divide-y divide-faint rounded-xl border border-faint">
            {items.map((item, index) => {
              const food = database.data?.db.foods.find((f) => f.id === item.foodId);
              return (
                <li
                  key={`${item.foodId}-${index}`}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-base">{shortFoodName(item.name)}</span>
                    <span className="block text-sm text-muted">
                      {quantityLabel(item)} · <bdi>{formatInt(item.kcal)}</bdi> {he.kcal}
                    </span>
                  </span>
                  <span className="flex shrink-0">
                    {food && (
                      <Button
                        icon
                        variant="ghost"
                        aria-label={he.addMeal.editItem(shortFoodName(item.name))}
                        onClick={() => startQuantity(food, index)}
                      >
                        <Icon name="pencil" />
                      </Button>
                    )}
                    <Button
                      icon
                      variant="ghost"
                      aria-label={he.addMeal.removeItem(shortFoodName(item.name))}
                      onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    >
                      <Icon name="close" />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
          <TextField
            label={he.addMeal.name}
            value={mealName}
            onChange={setMealName}
            placeholder={mealNameFromEntries(items)}
            error={shown('name')}
            maxLength={120}
          />
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={he.addMeal.time}
          value={timeText}
          onChange={setTimeText}
          type="time"
          error={shown('eatenAt')}
        />
        <SelectField
          label={he.addMeal.slot}
          value={slot}
          onChange={(value) => setSlotChoice(value as MealSlot)}
          options={SLOT_OPTIONS}
        />
      </div>
      <details className="text-base">
        <summary className="min-h-11 cursor-pointer py-2 text-accent">
          {he.addMeal.moreOptions}
        </summary>
        <TextField
          label={he.addMeal.date}
          value={dateText}
          onChange={setDateText}
          type="date"
          max={localDateOf(now, tz)}
        />
      </details>

      {needsConfirm && (
        <label className="flex items-start gap-3 rounded-xl border border-warning p-3 text-base">
          <input
            type="checkbox"
            checked={confirmLarge}
            onChange={(event) => setConfirmLarge(event.target.checked)}
            className="mt-0.5 size-6 shrink-0 accent-[var(--accent)]"
          />
          {he.addMeal.confirmLarge}
        </label>
      )}
      {warnMismatch && <p className="text-sm text-muted">⚠ {he.addMeal.macroMismatch}</p>}
      {shown('form') && (
        <p role="alert" className="text-base font-medium">
          {shown('form')}
        </p>
      )}
      {errors.form && !submitted && <p role="status">{errors.form}</p>}

      {/* Nothing to save yet while just browsing search results: keep the list unobstructed. */}
      {(kind === 'food' || mode === 'manual' || editing) && (
        <div className="sticky bottom-0 -mx-5 space-y-2 border-t border-faint bg-surface px-5 pb-1 pt-3">
          {kind === 'food' && (
            <p className="text-base">
              {he.addMeal.total}:{' '}
              <strong>
                <bdi>{formatInt(totals.kcal)}</bdi> {he.kcal}
              </strong>{' '}
              · {he.today.protein} <bdi>{formatDecimal(totals.proteinG)}</bdi>
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1 justify-center"
              disabled={saving}
              onClick={() => void submit()}
            >
              {saving ? he.addMeal.saving : he.addMeal.saveMeal}
            </Button>
            {editing && (
              <Button onClick={() => void saveAsFavorite()}>
                <Icon name="star" /> {he.addMeal.saveFavorite}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
