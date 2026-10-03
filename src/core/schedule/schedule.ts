import {
  parseLocalTime,
  dayTimeToInstant,
  type Instant,
  type LocalDate,
  type LocalTime,
  type Tz,
} from '../time';

/** Slots a schedule can contain. Meals may also be tagged `other` (never consumes a slot's budget). */
export type SlotId = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type MealSlot = SlotId | 'other';

export interface ScheduleSlot {
  id: SlotId;
  /** Wall-clock window in the user's time zone. */
  start: LocalTime;
  end: LocalTime;
  /** Share of the daily calorie target planned for this slot; all weights sum to 1. */
  weight: number;
}

export type MealSchedule = readonly ScheduleSlot[];

/** Defaults from docs/NUTRITION_RULES.md F.6. */
export const DEFAULT_SCHEDULE: MealSchedule = [
  { id: 'breakfast', start: '07:30', end: '09:30', weight: 0.25 },
  { id: 'lunch', start: '12:30', end: '14:30', weight: 0.3 },
  { id: 'snack', start: '16:00', end: '17:30', weight: 0.15 },
  { id: 'dinner', start: '19:00', end: '21:00', weight: 0.3 },
];

export type ScheduleErrorCode =
  | 'slot_count'
  | 'duplicate_slot'
  | 'invalid_time'
  | 'window_not_increasing'
  | 'windows_overlap'
  | 'not_in_time_order'
  | 'weight_not_positive'
  | 'weights_do_not_sum_to_one';

export interface ScheduleError {
  code: ScheduleErrorCode;
  slot?: SlotId;
}

const WEIGHT_TOLERANCE = 0.001;

const toMinutes = (time: LocalTime): number => {
  const { hour, minute } = parseLocalTime(time);
  return hour * 60 + minute;
};

/** A schedule has 3-4 slots (each id at most once), non-overlapping windows in time order, weights summing to 1. */
export function validateSchedule(schedule: MealSchedule): ScheduleError[] {
  const errors: ScheduleError[] = [];
  if (schedule.length < 3 || schedule.length > 4) {
    errors.push({ code: 'slot_count' });
  }
  const seen = new Set<SlotId>();
  let previousStart = -1;
  let previousEnd = -1;
  let weightSum = 0;
  for (const slot of schedule) {
    if (seen.has(slot.id)) {
      errors.push({ code: 'duplicate_slot', slot: slot.id });
    }
    seen.add(slot.id);

    let start: number;
    let end: number;
    try {
      start = toMinutes(slot.start);
      end = toMinutes(slot.end);
    } catch {
      errors.push({ code: 'invalid_time', slot: slot.id });
      continue;
    }
    if (end <= start) {
      errors.push({ code: 'window_not_increasing', slot: slot.id });
    }
    if (start < previousStart) {
      errors.push({ code: 'not_in_time_order', slot: slot.id });
    } else if (start < previousEnd) {
      errors.push({ code: 'windows_overlap', slot: slot.id });
    }
    previousStart = start;
    previousEnd = Math.max(previousEnd, end);

    if (!(slot.weight > 0)) {
      errors.push({ code: 'weight_not_positive', slot: slot.id });
    }
    weightSum += slot.weight;
  }
  if (Math.abs(weightSum - 1) > WEIGHT_TOLERANCE) {
    errors.push({ code: 'weights_do_not_sum_to_one' });
  }
  return errors;
}

/** A schedule slot resolved to real instants for one day (correct on 23/25-hour DST days). */
export interface SlotWindow {
  id: SlotId;
  startInstant: Instant;
  endInstant: Instant;
  weight: number;
}

export function slotWindows(schedule: MealSchedule, date: LocalDate, tz: Tz): SlotWindow[] {
  return schedule.map((slot) => ({
    id: slot.id,
    startInstant: dayTimeToInstant(date, slot.start, tz),
    endInstant: dayTimeToInstant(date, slot.end, tz),
    weight: slot.weight,
  }));
}

const MINUTE_MS = 60_000;
/** A meal this close to a window (or less) still belongs to that slot. */
export const SLOT_INFERENCE_MAX_DISTANCE_MIN = 90;

/**
 * Which slot a meal eaten at `eatenAt` belongs to by default: the window containing it, otherwise the
 * nearest window within 90 minutes (a late lunch is still lunch), otherwise `other`. The user can
 * always override it. Ties go to the earlier slot.
 */
export function inferSlot(eatenAt: Instant, windows: readonly SlotWindow[]): MealSlot {
  let best: { id: SlotId; distanceMin: number } | undefined;
  for (const window of windows) {
    const distanceMin =
      eatenAt < window.startInstant
        ? (window.startInstant - eatenAt) / MINUTE_MS
        : eatenAt > window.endInstant
          ? (eatenAt - window.endInstant) / MINUTE_MS
          : 0;
    if (!best || distanceMin < best.distanceMin) {
      best = { id: window.id, distanceMin };
    }
  }
  return best && best.distanceMin <= SLOT_INFERENCE_MAX_DISTANCE_MIN ? best.id : 'other';
}

/** How far ahead of its window a slot's meal may already be eaten without counting as "ahead of schedule". */
export const EARLY_GRACE_MIN = 60;

export interface Corridor {
  /** Calories that should already have been eaten: slots whose window has ended. */
  lowerKcal: number;
  /** Calories that may reasonably have been eaten: slots whose window (minus the early grace) has started. */
  upperKcal: number;
}

/**
 * The "corridor" of expected consumption at `now` (docs/NUTRITION_RULES.md F.6): a band, not a single
 * line, so a meal eaten a bit early or late is never mislabelled as ahead/behind.
 */
export function corridorAt(
  windows: readonly SlotWindow[],
  kcalTarget: number,
  now: Instant,
): Corridor {
  let lowerKcal = 0;
  let upperKcal = 0;
  for (const window of windows) {
    const planned = window.weight * kcalTarget;
    if (window.endInstant <= now) lowerKcal += planned;
    if (window.startInstant - EARLY_GRACE_MIN * MINUTE_MS <= now) upperKcal += planned;
  }
  return { lowerKcal, upperKcal };
}
