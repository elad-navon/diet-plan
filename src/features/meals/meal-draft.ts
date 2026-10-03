import { z } from 'zod';
import { type Instant, type LocalDate } from '../../core/time';

/**
 * The meal being added, kept while the sheet is closed - by a tap outside it, Esc, "back" or a reload - so
 * starting a meal is never lost. It lives in memory (the page's life) and in sessionStorage (this tab's life);
 * a browser that refuses storage still keeps it in memory. One draft only, for a new meal (an edit has its
 * meal to go back to), and it is dropped when saved and when it gets old.
 */

const KEY = 'meal-draft-v1';

/** A draft older than this (since the form was last open) is not worth bringing back. */
export const DRAFT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const number = z.number().finite();

const foodEntry = z.object({
  foodId: z.string(),
  name: z.string(),
  grams: number,
  unit: z.string().optional(),
  count: number.optional(),
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  sugarG: number.optional(),
  addedSugarG: number.optional(),
  fiberG: number.optional(),
  noMacros: z.literal(true).optional(),
});

const draftSchema = z.object({
  v: z.literal(1),
  /** When the form was last open (a moment), and which day it was adding to. */
  savedAt: number,
  date: z.string(),
  mode: z.enum(['search', 'manual', 'favorites']),
  items: z.array(foodEntry),
  name: z.string(),
  kcalText: z.string(),
  macrosOn: z.boolean(),
  proteinText: z.string(),
  carbsText: z.string(),
  fatText: z.string(),
  sugarText: z.string(),
  mealName: z.string(),
  /** Only when the person changed them: an untouched time must be "now" again when the form comes back. */
  dateText: z.string().optional(),
  timeText: z.string().optional(),
  slotChoice: z.enum(['breakfast', 'lunch', 'snack', 'dinner', 'other']).nullable(),
  sourceHint: z.enum(['food_db', 'manual', 'favorite', 'copy']),
  favoriteId: z.string().nullable(),
  /** Foods typed by hand into the meal that are to be remembered for next time. */
  rememberIds: z.array(z.string()).optional(),
});

export type MealDraft = z.infer<typeof draftSchema>;

let inMemory: string | null = null;

/** Whether there is anything worth keeping: foods, or something typed. */
export function isMeaningful(draft: MealDraft): boolean {
  return (
    draft.items.length > 0 ||
    draft.name.trim() !== '' ||
    draft.kcalText.trim() !== '' ||
    draft.mealName.trim() !== '' ||
    draft.sugarText.trim() !== '' ||
    (draft.macrosOn &&
      [draft.proteinText, draft.carbsText, draft.fatText].some((text) => text.trim() !== ''))
  );
}

export function saveMealDraft(draft: MealDraft): void {
  const text = JSON.stringify(draft);
  inMemory = text;
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    // Storage is blocked or full: the draft still survives in memory.
  }
}

export function clearMealDraft(): void {
  inMemory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clean
  }
}

/** The draft for adding to `date`, if there is a fresh one. Anything unreadable or stale is treated as none. */
export function loadMealDraft({ date, now }: { date: LocalDate; now: Instant }): MealDraft | null {
  let text = inMemory;
  if (text === null) {
    try {
      text = sessionStorage.getItem(KEY);
    } catch {
      text = null;
    }
  }
  if (text === null) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    const draft = parsed.data;
    if (draft.date !== date) return null;
    if (now - draft.savedAt > DRAFT_MAX_AGE_MS) return null;
    return isMeaningful(draft) ? draft : null;
  } catch {
    return null;
  }
}
