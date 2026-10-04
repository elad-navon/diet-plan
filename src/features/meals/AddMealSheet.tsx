import { useEffect, useRef, useState } from 'react';
import { newId } from '../../app/ids';
import {
  useAddFavorite,
  useAddMeal,
  useFavorites,
  useFoodDb,
  useMarkFavoriteUsed,
  useRemoveFavorite,
  useUpdateMeal,
} from '../../app/data-hooks';
import {
  parseDecimalInput,
  validateAddedSugarInput,
  validateFavoriteInput,
  validateGrainCarbsInput,
  validateMealInput,
  type InputError,
} from '../../core/contracts';
import {
  manualEntry,
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
  dayTimeToInstant,
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
import {
  favoriteKey,
  isSavedMeal,
  sameManualFavorites,
  sameSavedMeals,
  savedMealItems,
} from './favorites';
import { FoodSearch } from './FoodSearch';
import {
  clearMealDraft,
  isMeaningful,
  loadMealDraft,
  saveMealDraft,
  type MealDraft,
} from './meal-draft';
import { savedMealPrefill, type MealPrefill } from './prefill';
import { QuantityEditor } from './QuantityEditor';
import { quantityLabel } from './quantity-label';

export type { MealPrefill } from './prefill';

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
  /** `savedMeal` is set when "save this meal" was ticked: whether it could be added to the saved meals. */
  onSaved: (
    meal: StoredMeal,
    kind: 'added' | 'updated',
    extra?: { savedMeal: 'saved' | 'failed' },
  ) => void;
}

export function AddMealSheet(props: AddMealSheetProps) {
  // Bumping the key starts the form over, from nothing (after the person drops the draft it came back with).
  const [generation, setGeneration] = useState(0);
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={props.editing ? he.addMeal.editTitle : he.addMeal.title}
      // A stray click beside the sheet must not hide a meal being typed: it closes with the X or Esc.
      dismissOnBackdrop={false}
    >
      <MealForm
        key={generation}
        {...props}
        onRestart={() => {
          clearMealDraft();
          setGeneration((current) => current + 1);
        }}
      />
    </Sheet>
  );
}

type Mode = 'search' | 'manual';
type FieldErrors = Partial<Record<InputError['field'] | 'form', string>>;

const SLOT_OPTIONS = (Object.keys(he.slots) as MealSlot[]).map((slot) => ({
  value: slot,
  label: he.slots[slot],
}));

/** A number field typed by hand: null when empty, NaN when it is not a number. */
const readNumber = (text: string): number | null =>
  text.trim() === '' ? null : (parseDecimalInput(text) ?? Number.NaN);

function MealForm({
  date,
  tz,
  now,
  schedule,
  editing,
  prefill,
  onClose,
  onSaved,
  onRestart,
}: AddMealSheetProps & { onRestart: () => void }) {
  const database = useFoodDb(false);
  const favorites = useFavorites().data ?? [];
  const addMeal = useAddMeal();
  const updateMeal = useUpdateMeal();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();
  const markUsed = useMarkFavoriteUsed();

  // One id per open sheet: pressing "save" twice, or retrying after a hiccup, can only ever create one meal.
  const [mealId] = useState(() => editing?.id ?? newId());
  // A new meal opened plainly (no suggestion, favorite or edit to start from) picks up the draft left by the
  // last time the sheet was closed before saving.
  const [draft] = useState<MealDraft | null>(() =>
    editing || prefill ? null : loadMealDraft({ date, now }),
  );
  const seed = editing ?? prefill ?? null;
  const seedItems = editing?.items ?? prefill?.items ?? draft?.items ?? [];

  const [mode, setMode] = useState<Mode>(
    draft?.mode ?? (seedItems.length > 0 ? 'search' : seed ? 'manual' : 'search'),
  );
  const [items, setItems] = useState<FoodEntry[]>(seedItems);
  const [pickedFood, setPickedFood] = useState<FoodRecord | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const [name, setName] = useState(draft?.name ?? seed?.name ?? '');
  const [kcalText, setKcalText] = useState(draft?.kcalText ?? (seed ? String(seed.kcal) : ''));
  const seedMacros: Macros | null =
    editing && editing.proteinG !== null && editing.carbsG !== null && editing.fatG !== null
      ? { proteinG: editing.proteinG, carbsG: editing.carbsG, fatG: editing.fatG }
      : (prefill?.macros ?? null);
  const [macrosOn, setMacrosOn] = useState(draft?.macrosOn ?? seedMacros !== null);
  const [proteinText, setProteinText] = useState(
    draft?.proteinText ?? (seedMacros ? String(seedMacros.proteinG) : ''),
  );
  const [carbsText, setCarbsText] = useState(
    draft?.carbsText ?? (seedMacros ? String(seedMacros.carbsG) : ''),
  );
  const [fatText, setFatText] = useState(
    draft?.fatText ?? (seedMacros ? String(seedMacros.fatG) : ''),
  );
  // The split of the carbohydrate typed by hand into white flour and whole grains (both optional).
  const seedRefined = editing?.refinedCarbsG ?? prefill?.refinedCarbsG ?? null;
  const seedWhole = editing?.wholeCarbsG ?? prefill?.wholeCarbsG ?? null;
  const [refinedText, setRefinedText] = useState(
    draft?.refinedText ?? (seedRefined === null ? '' : String(seedRefined)),
  );
  const [wholeText, setWholeText] = useState(
    draft?.wholeText ?? (seedWhole === null ? '' : String(seedWhole)),
  );
  // A meal built from foods keeps the name it was given (an edited meal, or a suggestion such as "טוסט גבינה").
  const seedSugar = editing?.addedSugarG ?? prefill?.addedSugarG ?? null;
  const [sugarText, setSugarText] = useState(
    draft?.sugarText ?? (seedSugar === null ? '' : String(seedSugar)),
  );
  const [mealName, setMealName] = useState(
    draft?.mealName ?? (seedItems.length > 0 && seed ? seed.name : ''),
  );

  const defaultDate: string = editing?.localDate ?? date;
  const defaultTime: string = editing
    ? localTimeOf(editing.eatenAt, tz)
    : date === localDateOf(now, tz)
      ? localTimeOf(now, tz)
      : '12:00';
  const [dateText, setDateText] = useState<string>(draft?.dateText ?? defaultDate);
  const [timeText, setTimeText] = useState<string>(draft?.timeText ?? defaultTime);
  const [slotChoice, setSlotChoice] = useState<MealSlot | null>(
    draft ? draft.slotChoice : (editing?.slot ?? prefill?.slot ?? null),
  );
  const [sourceHint, setSourceHint] = useState<MealSource>(
    draft?.sourceHint ?? editing?.source ?? prefill?.source ?? 'manual',
  );
  const [favoriteId, setFavoriteId] = useState<string | null>(
    draft ? draft.favoriteId : (prefill?.favoriteId ?? null),
  );
  const cameBack = draft !== null;
  /** A meal typed by hand is remembered for next time unless this is switched off. */
  const [remember, setRemember] = useState(true);
  /** "Save this meal": the whole meal is kept in the list of saved meals when it is saved. */
  const [saveMeal, setSaveMeal] = useState(false);
  /** Which foods typed by hand into a meal of foods were added with "remember" on. */
  const [rememberIds, setRememberIds] = useState<string[]>(draft?.rememberIds ?? []);
  /** Set once the meal is saved, so the draft is not written again behind the save. */
  const savedRef = useRef(false);

  const [submitted, setSubmitted] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  /** Problems with the food being typed by hand into a meal that has foods (apart from the meal's own). */
  const [itemErrors, setItemErrors] = useState<FieldErrors>({});
  const [warnMismatch, setWarnMismatch] = useState(false);
  const [saving, setSaving] = useState(false);

  const kind: 'food' | 'manual' = items.length > 0 ? 'food' : 'manual';
  const totals = sumEntries(items);
  /** Something typed into the by-hand fields of a meal with foods, not yet added to it. */
  const itemPending =
    kind === 'food' &&
    mode === 'manual' &&
    (name.trim() !== '' || kcalText.trim() !== '' || sugarText.trim() !== '');

  // Keep what is typed as a draft, so closing the sheet by accident (a tap outside it, "back") loses nothing.
  useEffect(() => {
    if (editing || savedRef.current) return;
    const current: MealDraft = {
      v: 1,
      savedAt: now,
      date,
      mode,
      items,
      name,
      kcalText,
      macrosOn,
      proteinText,
      carbsText,
      fatText,
      refinedText,
      wholeText,
      sugarText,
      mealName,
      ...(dateText !== defaultDate ? { dateText } : {}),
      ...(timeText !== defaultTime ? { timeText } : {}),
      slotChoice,
      sourceHint,
      favoriteId,
      ...(rememberIds.length > 0 ? { rememberIds } : {}),
    };
    if (isMeaningful(current)) saveMealDraft(current);
    else clearMealDraft();
  }, [
    editing,
    now,
    date,
    mode,
    items,
    name,
    kcalText,
    macrosOn,
    proteinText,
    carbsText,
    fatText,
    refinedText,
    wholeText,
    sugarText,
    mealName,
    dateText,
    timeText,
    defaultDate,
    defaultTime,
    slotChoice,
    sourceHint,
    favoriteId,
    rememberIds,
  ]);

  const eatenAt = ((): Instant | null => {
    if (!isValidLocalDate(dateText) || !/^\d{2}:\d{2}$/.test(timeText)) return null;
    try {
      return dayTimeToInstant(dateText, timeText, tz);
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
    // A remembered food typed by hand joins the foods already in the meal instead of replacing them.
    if (favorite.items.length === 0 && items.length > 0) {
      setItems((current) => [
        ...current,
        manualEntry({
          id: newId(),
          name: favorite.name,
          kcal: favorite.kcal,
          macros: favorite.macros,
          addedSugarG: favorite.addedSugarG,
          refinedCarbsG: favorite.refinedCarbsG ?? null,
          wholeCarbsG: favorite.wholeCarbsG ?? null,
        }),
      ]);
      return;
    }
    // A saved meal that was typed by hand comes back as the by-hand fields, not as one food.
    const foods = isSavedMeal(favorite) ? (savedMealPrefill(favorite).items ?? []) : [];
    setItems(foods);
    setName(favorite.name);
    setKcalText(String(favorite.kcal));
    setMealName(foods.length > 0 ? favorite.name : '');
    setMacrosOn(favorite.macros !== null);
    setSugarText(favorite.addedSugarG === null ? '' : String(favorite.addedSugarG));
    setProteinText(favorite.macros ? String(favorite.macros.proteinG) : '');
    setCarbsText(favorite.macros ? String(favorite.macros.carbsG) : '');
    setFatText(favorite.macros ? String(favorite.macros.fatG) : '');
    setRefinedText(favorite.refinedCarbsG == null ? '' : String(favorite.refinedCarbsG));
    setWholeText(favorite.wholeCarbsG == null ? '' : String(favorite.wholeCarbsG));
    setSourceHint('favorite');
    setFavoriteId(id);
    setMode(foods.length > 0 ? 'search' : 'manual');
  }

  /** The carbohydrate typed by hand; when left empty, the sum of the two parts typed under it (white flour, whole grain). */
  function handCarbs(): number | null {
    const typed = readNumber(carbsText);
    if (typed !== null) return typed;
    const refined = readNumber(refinedText);
    const whole = readNumber(wholeText);
    if (refined === null && whole === null) return null;
    const sum = (refined ?? 0) + (whole ?? 0);
    return Number.isNaN(sum) ? null : Math.round(sum * 10) / 10;
  }
  const autoCarbs = carbsText.trim() === '' && macrosOn ? handCarbs() : null;

  /** The values the meal would be saved with, or the problems with them. */
  function collect():
    | {
        ok: true;
        name: string;
        kcal: number;
        macros: Macros | null;
        addedSugarG: number | null;
        refinedCarbsG: number | null;
        wholeCarbsG: number | null;
        warnings: string[];
      }
    | { ok: false; errors: FieldErrors } {
    const nameValue = kind === 'food' ? mealName.trim() || mealNameFromEntries(items) : name;
    const kcalValue = kind === 'food' ? totals.kcal : (parseDecimalInput(kcalText) ?? Number.NaN);
    const parsedMacros = ((): {
      proteinG: number | null;
      carbsG: number | null;
      fatG: number | null;
    } | null => {
      if (kind === 'food') {
        // Foods typed without macros add nothing to them: the macros are those of the foods that have them,
        // and unknown only when none does.
        return totals.itemsWithoutMacros === items.length
          ? null
          : { proteinG: totals.proteinG, carbsG: totals.carbsG, fatG: totals.fatG };
      }
      if (!macrosOn) return null;
      return {
        proteinG: readNumber(proteinText),
        carbsG: handCarbs(),
        fatG: readNumber(fatText),
      };
    })();

    const checked = validateMealInput(
      { name: nameValue, kcal: kcalValue, macros: parsedMacros, eatenAt: eatenAt ?? now },
      now,
    );
    const found: FieldErrors = {};
    if (!checked.ok) {
      for (const error of checked.errors) found[error.field] = he.errors[error.code];
    }
    // Added sugar: summed from the foods, or typed for a manual meal (optional).
    const sugarAsked =
      kind === 'food'
        ? totals.addedSugarG
        : sugarText.trim() === ''
          ? null
          : (parseDecimalInput(sugarText) ?? Number.NaN);
    const sugarChecked = validateAddedSugarInput(sugarAsked);
    if (!sugarChecked.ok) {
      for (const error of sugarChecked.errors) found[error.field] = he.errors[error.code];
    }
    // The split of the carbohydrate: typed for a meal typed by hand (a meal of foods is split by its foods).
    const grainChecked = validateGrainCarbsInput({
      refinedCarbsG: kind === 'food' || !macrosOn ? null : readNumber(refinedText),
      wholeCarbsG: kind === 'food' || !macrosOn ? null : readNumber(wholeText),
      carbsG: checked.ok ? (checked.value.macros?.carbsG ?? null) : null,
    });
    if (!grainChecked.ok && checked.ok) {
      for (const error of grainChecked.errors) found[error.field] = he.errors[error.code];
    }
    if (eatenAt === null) found.eatenAt = he.addMeal.timeInvalid;
    if (!checked.ok || !sugarChecked.ok || !grainChecked.ok || eatenAt === null) {
      return { ok: false, errors: found };
    }
    return {
      ok: true,
      name: checked.value.name,
      kcal: checked.value.kcal,
      macros: checked.value.macros,
      addedSugarG: sugarChecked.value.addedSugarG,
      refinedCarbsG: grainChecked.value.refinedCarbsG,
      wholeCarbsG: grainChecked.value.wholeCarbsG,
      // Calories and macros cannot be compared when some of the calories come from foods without macros.
      warnings:
        kind === 'food' && totals.itemsWithoutMacros > 0
          ? checked.warnings.filter((warning) => warning !== 'macro_kcal_mismatch')
          : checked.warnings,
    };
  }

  /** Adds the food typed by hand to the meal, next to the foods from the database. */
  function addManualItem(): void {
    const macros = macrosOn
      ? { proteinG: readNumber(proteinText), carbsG: handCarbs(), fatG: readNumber(fatText) }
      : null;
    const checked = validateFavoriteInput({
      name,
      kcal: parseDecimalInput(kcalText) ?? Number.NaN,
      macros,
    });
    const sugarChecked = validateAddedSugarInput(readNumber(sugarText));
    const grainChecked = validateGrainCarbsInput({
      refinedCarbsG: macrosOn ? readNumber(refinedText) : null,
      wholeCarbsG: macrosOn ? readNumber(wholeText) : null,
      carbsG: checked.ok ? (checked.value.macros?.carbsG ?? null) : null,
    });
    const found: FieldErrors = {};
    if (!checked.ok) {
      for (const error of checked.errors) found[error.field] = he.errors[error.code];
    }
    if (!sugarChecked.ok) {
      for (const error of sugarChecked.errors) found[error.field] = he.errors[error.code];
    }
    if (!grainChecked.ok && checked.ok) {
      for (const error of grainChecked.errors) found[error.field] = he.errors[error.code];
    }
    if (!checked.ok || !sugarChecked.ok || !grainChecked.ok) {
      setItemErrors(found);
      return;
    }
    setItemErrors({});
    const entry = manualEntry({
      id: newId(),
      name: checked.value.name,
      kcal: checked.value.kcal,
      macros: checked.value.macros,
      addedSugarG: sugarChecked.value.addedSugarG,
      refinedCarbsG: grainChecked.value.refinedCarbsG,
      wholeCarbsG: grainChecked.value.wholeCarbsG,
    });
    setItems((current) => [...current, entry]);
    if (remember && !editing) setRememberIds((current) => [...current, entry.foodId]);
    setName('');
    setKcalText('');
    setMacrosOn(false);
    setProteinText('');
    setCarbsText('');
    setFatText('');
    setRefinedText('');
    setWholeText('');
    setSugarText('');
  }

  async function submit(): Promise<void> {
    if (itemPending) {
      setItemErrors({ form: he.addMeal.itemPending });
      return;
    }
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
            addedSugarG: result.addedSugarG,
            refinedCarbsG: result.refinedCarbsG,
            wholeCarbsG: result.wholeCarbsG,
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
          addedSugarG: result.addedSugarG,
          refinedCarbsG: result.refinedCarbsG,
          wholeCarbsG: result.wholeCarbsG,
          source:
            sourceHint === 'favorite' || sourceHint === 'copy'
              ? sourceHint
              : kind === 'food'
                ? 'food_db'
                : 'manual',
          ...(database.data ? { foodDbVersion: database.data.db.version } : {}),
        });
        if (kind === 'manual' && remember && !favoriteId && !prefill && !saveMeal)
          await rememberManualMeal(result);
        // Foods typed by hand into a meal of foods: each one marked "remember" is kept on its own.
        // The same name twice keeps the later one only (the earlier favorites are replaced once).
        const byName = new Map<string, FoodEntry>();
        for (const item of items) {
          if (rememberIds.includes(item.foodId)) byName.set(favoriteKey(item.name), item);
        }
        for (const item of byName.values()) {
          await rememberManualMeal({
            name: item.name,
            kcal: item.kcal,
            macros: item.noMacros
              ? null
              : { proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG },
            addedSugarG: item.addedSugarG ?? null,
            refinedCarbsG: item.refinedCarbsG ?? null,
            wholeCarbsG: item.wholeCarbsG ?? null,
          });
        }
      }
      // The saved meal that was opened counts as used (before it can be replaced by the one saved now).
      if (favoriteId) await markUsed.mutateAsync(favoriteId).catch(() => undefined);
      const kept = saveMeal ? ((await keepAsSavedMeal(result)) ? 'saved' : 'failed') : null;
      savedRef.current = true;
      clearMealDraft();
      onSaved(saved, editing ? 'updated' : 'added', kept ? { savedMeal: kept } : undefined);
      onClose();
    } catch (error) {
      const code = error instanceof DataError ? error.code : null;
      setErrors({ form: dataErrorMessage(code) });
      if (code === 'version_conflict') onClose();
    } finally {
      setSaving(false);
    }
  }

  /**
   * Remembers a meal typed by hand, so it can be found by name next time. Typing the same name again replaces
   * the earlier one (the latest numbers win). Never blocks the save: the meal itself is already stored.
   */
  async function rememberManualMeal(result: {
    name: string;
    kcal: number;
    macros: Macros | null;
    addedSugarG: number | null;
    refinedCarbsG: number | null;
    wholeCarbsG: number | null;
  }): Promise<void> {
    try {
      // The new one first: if that fails, the earlier one is still there.
      await addFavorite.mutateAsync({
        id: newId(),
        name: result.name,
        kcal: result.kcal,
        macros: result.macros,
        items: [],
        addedSugarG: result.addedSugarG,
        refinedCarbsG: result.refinedCarbsG,
        wholeCarbsG: result.wholeCarbsG,
      });
      for (const earlier of sameManualFavorites(favorites, result.name)) {
        await removeFavorite.mutateAsync(earlier.id);
      }
    } catch {
      // Remembering is a convenience; the meal was saved.
    }
  }

  /**
   * Keeps the whole meal in the list of saved meals. A meal saved again under the same name replaces the earlier
   * one (the latest values win). The meal itself is already stored, so a failure here is only reported.
   */
  async function keepAsSavedMeal(result: {
    name: string;
    kcal: number;
    macros: Macros | null;
    addedSugarG: number | null;
    refinedCarbsG: number | null;
    wholeCarbsG: number | null;
  }): Promise<boolean> {
    try {
      await addFavorite.mutateAsync({
        id: newId(),
        name: result.name,
        kcal: result.kcal,
        macros: result.macros,
        items: savedMealItems({ ...result, items }, newId()),
        addedSugarG: result.addedSugarG,
        refinedCarbsG: result.refinedCarbsG,
        wholeCarbsG: result.wholeCarbsG,
        ...(database.data ? { foodDbVersion: database.data.db.version } : {}),
      });
      // The new one first: if that fails, the earlier one is still there.
      for (const earlier of sameSavedMeals(favorites, result.name)) {
        await removeFavorite.mutateAsync(earlier.id);
      }
      return true;
    } catch {
      return false;
    }
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
  /** Errors of the by-hand fields: the meal's own, or those of the food being added to a meal of foods. */
  const manualError = (field: InputError['field'] | 'form'): string | undefined =>
    kind === 'food' ? itemErrors[field] : shown(field);

  return (
    <div className="space-y-4">
      {cameBack && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 rounded-2xl bg-surface-2 px-4 py-1">
          <p role="status" className="py-2 text-base">
            {he.addMeal.draftBack}
          </p>
          <Button variant="ghost" onClick={onRestart}>
            {he.addMeal.draftRestart}
          </Button>
        </div>
      )}
      <fieldset className="grid grid-flow-col gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-inset ring-faint">
        <legend className="sr-only">{he.addMeal.modeLegend}</legend>
        {(
          [
            ['search', he.addMeal.tabSearch],
            ['manual', he.addMeal.tabManual],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full px-2 text-center text-base transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              mode === value ? 'bg-surface font-bold shadow-md' : 'text-muted'
            }`}
          >
            <input
              type="radio"
              name="meal-mode"
              className="sr-only"
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {mode === 'search' && (
        <FoodSearch
          favorites={favorites}
          onPickFavorite={applyFavorite}
          onPick={(food) => startQuantity(food, null)}
          onManual={(typed) => {
            setName(typed);
            setMode('manual');
          }}
        />
      )}

      {mode === 'manual' && (
        <div className="space-y-3">
          <TextField
            label={kind === 'food' ? he.addMeal.itemName : he.addMeal.name}
            value={name}
            onChange={setName}
            autoComplete="off"
            error={manualError('name')}
            maxLength={120}
          />
          <TextField
            label={he.addMeal.kcalField}
            value={kcalText}
            onChange={setKcalText}
            inputMode="decimal"
            error={manualError('kcal')}
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
                placeholder={autoCarbs !== null ? formatDecimal(autoCarbs) : undefined}
              />
              <TextField
                label={he.addMeal.fatField}
                value={fatText}
                onChange={setFatText}
                inputMode="decimal"
              />
            </div>
          )}
          {macrosOn && (
            <div className="space-y-1">
              <div className="grid grid-cols-2 gap-2">
                <TextField
                  label={he.addMeal.refinedCarbsField}
                  value={refinedText}
                  onChange={setRefinedText}
                  inputMode="decimal"
                />
                <TextField
                  label={he.addMeal.wholeCarbsField}
                  value={wholeText}
                  onChange={setWholeText}
                  inputMode="decimal"
                />
              </div>
              <p className="text-sm text-muted">{he.addMeal.grainHint}</p>
              {manualError('grain') && (
                <p role="alert" className="text-sm font-medium">
                  ⚠ {manualError('grain')}
                </p>
              )}
            </div>
          )}
          {manualError('macros') && (
            <p className="text-sm font-medium">⚠ {manualError('macros')}</p>
          )}
          <TextField
            label={he.sugar.field}
            hint={he.sugar.fieldHint}
            value={sugarText}
            onChange={setSugarText}
            inputMode="decimal"
            error={manualError('sugar')}
          />
          {!editing && (
            <label className="flex min-h-11 items-center gap-3 text-base">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="size-6 accent-[var(--accent)]"
              />
              {he.addMeal.rememberManual}
            </label>
          )}
          {kind === 'food' && (
            <>
              <Button onClick={addManualItem}>
                <Icon name="plus" /> {he.addMeal.addToMeal}
              </Button>
              {itemErrors.form && itemPending && (
                <p role="alert" className="text-base font-medium">
                  {itemErrors.form}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {items.length > 0 && (
        <section aria-labelledby="items-title" className="space-y-2">
          <h3 id="items-title" className="text-lg font-bold">
            {he.addMeal.items}
          </h3>
          <ul className="divide-y divide-faint overflow-hidden rounded-2xl bg-surface-2">
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
                      {item.addedSugarG !== undefined &&
                        item.addedSugarG > 0 &&
                        ` · ${he.sugar.item(formatDecimal(item.addedSugarG))}`}
                      {food?.grain && ` · ${he.flour.tag[food.grain]}`}
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
        <label className="flex items-start gap-3 rounded-2xl border border-warning p-3 text-base">
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
              {totals.itemsWithoutMacros < items.length && (
                <>
                  {' '}
                  · {he.today.protein} <bdi>{formatDecimal(totals.proteinG)}</bdi>
                </>
              )}
              {totals.addedSugarG !== null && (
                <> · {he.sugar.mealTotal(formatDecimal(totals.addedSugarG))}</>
              )}
              {totals.itemsWithoutMacros > 0 && (
                <span className="block text-sm text-muted">
                  {he.addMeal.macrosMissing(totals.itemsWithoutMacros)}
                </span>
              )}
              {totals.itemsWithoutSugar > 0 && totals.addedSugarG !== null && (
                <span className="block text-sm text-muted">
                  {he.sugar.missing(totals.itemsWithoutSugar)}
                </span>
              )}
            </p>
          )}
          <label className="flex min-h-11 items-center gap-3 text-base">
            <input
              type="checkbox"
              checked={saveMeal}
              onChange={(event) => setSaveMeal(event.target.checked)}
              className="size-6 accent-[var(--accent)]"
            />
            {he.addMeal.saveMealToggle}
          </label>
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? he.addMeal.saving : he.addMeal.saveMeal}
          </Button>
        </div>
      )}
    </div>
  );
}
