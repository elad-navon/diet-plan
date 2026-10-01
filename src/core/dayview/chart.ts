import { type NextMeal } from '../recommend';
import { corridorAt, slotWindows, type SlotId } from '../schedule';
import {
  dayLengthMinutes,
  dayStart,
  formatLocalTime,
  localDateOf,
  wallToInstant,
  type Instant,
  type LocalDate,
  type Tz,
} from '../time';
import { type MealRecord, type TargetPlanSnapshot } from './dayview';

/**
 * Geometry of the "today" chart, with no drawing in it: where each meal, the expected-consumption
 * corridor, the "now" marker and the suggested next meal sit. The X axis is *elapsed minutes* since the
 * start of the local day (1380/1440/1500 on DST days), the Y axis is cumulative calories.
 * See docs/ARCHITECTURE.md D.2 and docs/NUTRITION_RULES.md F.6.
 */

export interface ChartPoint {
  minute: number;
  kcal: number;
}

export interface CorridorStep {
  /** The band holds from this minute until the next step. */
  minute: number;
  lowerKcal: number;
  upperKcal: number;
}

export interface ChartBand {
  slot: SlotId;
  startMinute: number;
  endMinute: number;
  plannedKcal: number;
}

export interface ChartMeal {
  id: string;
  name: string;
  minute: number;
  kcal: number;
  cumulativeKcal: number;
}

export interface DayChartModel {
  date: LocalDate;
  dayLengthMinutes: number;
  /** The visible part of the day (06:00-23:00, widened to include any meal). */
  domain: { startMinute: number; endMinute: number };
  targetKcal: number;
  yMax: number;
  /** The eaten total is above the visible range (the line is cut at the top with an arrow). */
  clippedAtMax: boolean;
  totalKcal: number;
  overByKcal: number;
  bands: ChartBand[];
  corridor: CorridorStep[];
  /** A staircase: each meal is a vertical jump at its time. */
  eaten: ChartPoint[];
  meals: ChartMeal[];
  now: ChartPoint | null;
  next: { minute: number; slot: SlotId | null; fromKcal: number; toKcal: number } | null;
  ticks: { minute: number; label: string }[];
}

export interface DayChartInput {
  date: LocalDate;
  tz: Tz;
  now: Instant;
  plan: Pick<TargetPlanSnapshot, 'kcalTarget' | 'schedule'>;
  /** Active meals of `date`. */
  meals: readonly MealRecord[];
  next: NextMeal | null;
}

const MINUTE_MS = 60_000;
const DEFAULT_VISIBLE_FROM = '06:00';
const DEFAULT_VISIBLE_TO = '23:00';
const MIN_VISIBLE_MINUTES = 360;
const Y_STEP = 200;
const Y_HEADROOM = 1.15;
const Y_TOTAL_HEADROOM = 1.05;
const Y_CAP_FACTOR = 2;
const TICK_EVERY_HOURS = 3;

const niceCeil = (value: number): number => Math.ceil(value / Y_STEP) * Y_STEP;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export function buildDayChart(input: DayChartInput): DayChartModel {
  const { date, tz, now, plan } = input;
  const dayBegin = dayStart(date, tz);
  const lengthMinutes = dayLengthMinutes(date, tz);
  const elapsed = (instant: Instant): number =>
    clamp((instant - dayBegin) / MINUTE_MS, 0, lengthMinutes);
  const elapsedAtWall = (time: string): number => elapsed(wallToInstant(date, time, tz));

  const meals = [...input.meals]
    .filter((meal) => !meal.deletedAt)
    .sort((a, b) => a.eatenAt - b.eatenAt || a.id.localeCompare(b.id));

  // --- visible window of the day
  const firstMeal = meals[0];
  const lastMeal = meals[meals.length - 1];
  let startMinute = elapsedAtWall(DEFAULT_VISIBLE_FROM);
  let endMinute = elapsedAtWall(DEFAULT_VISIBLE_TO);
  if (firstMeal)
    startMinute = Math.min(startMinute, Math.floor(elapsed(firstMeal.eatenAt) / 60) * 60);
  if (lastMeal)
    endMinute = Math.max(endMinute, Math.ceil((elapsed(lastMeal.eatenAt) + 1) / 60) * 60);
  startMinute = clamp(startMinute, 0, lengthMinutes);
  endMinute = clamp(Math.max(endMinute, startMinute + MIN_VISIBLE_MINUTES), 0, lengthMinutes);
  startMinute = Math.min(startMinute, Math.max(0, endMinute - MIN_VISIBLE_MINUTES));

  // --- meal windows and the expected-consumption corridor
  const windows = slotWindows(plan.schedule, date, tz);
  const bands: ChartBand[] = windows.map((window) => ({
    slot: window.id,
    startMinute: elapsed(window.startInstant),
    endMinute: elapsed(window.endInstant),
    plannedKcal: window.weight * plan.kcalTarget,
  }));
  const stepMinutes = new Set<number>([startMinute]);
  for (const window of windows) {
    for (const minute of [elapsed(window.startInstant) - 60, elapsed(window.endInstant)]) {
      if (minute > startMinute && minute < endMinute) stepMinutes.add(minute);
    }
  }
  const corridor: CorridorStep[] = [...stepMinutes]
    .sort((a, b) => a - b)
    .map((minute) => ({
      minute,
      ...(({ lowerKcal, upperKcal }) => ({ lowerKcal, upperKcal }))(
        corridorAt(windows, plan.kcalTarget, dayBegin + minute * MINUTE_MS),
      ),
    }));

  // --- what was eaten: a staircase
  const isToday = localDateOf(now, tz) === date;
  const nowMinute = clamp(elapsed(now), startMinute, endMinute);
  const chartMeals: ChartMeal[] = [];
  const eaten: ChartPoint[] = [{ minute: startMinute, kcal: 0 }];
  let running = 0;
  for (const meal of meals) {
    const minute = clamp(elapsed(meal.eatenAt), startMinute, endMinute);
    eaten.push({ minute, kcal: running });
    running += meal.kcal;
    eaten.push({ minute, kcal: running });
    chartMeals.push({
      id: meal.id,
      name: meal.name,
      minute,
      kcal: meal.kcal,
      cumulativeKcal: running,
    });
  }
  const lastMealMinute = chartMeals[chartMeals.length - 1]?.minute ?? startMinute;
  eaten.push({
    minute: isToday ? Math.max(nowMinute, lastMealMinute) : endMinute,
    kcal: running,
  });

  // --- vertical range; extreme excess is cut at twice the target instead of squashing the chart
  const target = plan.kcalTarget;
  const wanted = Math.max(target * Y_HEADROOM, running * Y_TOTAL_HEADROOM);
  const cap = niceCeil(target * Y_CAP_FACTOR);
  const yMax = Math.min(niceCeil(wanted), cap);

  const next = input.next
    ? {
        minute: clamp(elapsed(input.next.suggestedAt), startMinute, endMinute),
        slot: input.next.slot,
        fromKcal: running,
        toKcal: running + input.next.budgetKcal,
      }
    : null;

  const ticks: { minute: number; label: string }[] = [];
  for (let hour = 0; hour < 24; hour += TICK_EVERY_HOURS) {
    const label = formatLocalTime(hour, 0);
    const minute = elapsedAtWall(label);
    if (minute >= startMinute && minute <= endMinute) ticks.push({ minute, label });
  }

  return {
    date,
    dayLengthMinutes: lengthMinutes,
    domain: { startMinute, endMinute },
    targetKcal: target,
    yMax,
    clippedAtMax: running > yMax,
    totalKcal: running,
    overByKcal: Math.max(0, running - target),
    bands,
    corridor,
    eaten,
    meals: chartMeals,
    now: isToday ? { minute: nowMinute, kcal: running } : null,
    next,
    ticks,
  };
}
