import { computeTrend, type WeightEntry } from '../nutrition';
import { NUTRITION_CONFIG } from '../nutrition/config';
import { formatLocalDate, fromEpochDay, parseLocalDate, toEpochDay, type LocalDate } from '../time';

/**
 * Geometry of the weight chart: weigh-ins, their smoothed trend, and the plan's *projection* with an
 * uncertainty cone. The projection is an estimate, never a promise (docs/NUTRITION_RULES.md F.5).
 * X is days since 1970-01-01, Y is kilograms.
 */

/** The parts of a stored plan the chart needs. */
export interface PlanLine {
  /** First day the plan is in force. */
  effectiveFrom: LocalDate;
  startDate: LocalDate;
  startWeightKg: number;
  weeklyRateKg: number;
  targetWeightKg: number | null;
  projectedDate: LocalDate | null;
}

export interface DayKg {
  day: number;
  kg: number;
}

/**
 * `full` shows everything up to the projected goal date; `recent` zooms to the last weeks and the next
 * month, so a few days of weigh-ins are not squashed by a projection that ends months away.
 */
export type WeightChartView = 'recent' | 'full';

export interface WeightChartModel {
  view: WeightChartView;
  today: LocalDate;
  todayDay: number;
  domain: { startDay: number; endDay: number };
  yMin: number;
  yMax: number;
  weights: { date: LocalDate; day: number; kg: number }[];
  /** Exponentially smoothed weight. */
  trend: DayKg[];
  /** The plan in force today: its planned line and the faster/slower edges of the cone. */
  plan: {
    line: DayKg[];
    fast: DayKg[];
    slow: DayKg[];
    targetKg: number;
    projectedDay: number | null;
    /** The target weight lies inside the vertical range, so its line can be drawn. */
    targetVisible: boolean;
  } | null;
  /** Lines of earlier plans, cut where the next plan began. */
  earlier: DayKg[][];
}

const { fastRateFactor, slowRateFactor } = NUTRITION_CONFIG.projection;
const SAMPLES = 12;
const MIN_SPAN_DAYS = 14;
const DEFAULT_LOOKAHEAD_DAYS = 28;
export const RECENT_BACK_DAYS = 42;
export const RECENT_FORWARD_DAYS = 28;

const dayOf = (date: LocalDate): number => toEpochDay(date);

/** A label position on the horizontal axis: a month, never a specific day (a projection is not that exact). */
export interface MonthTick {
  /** Where the label sits (days since 1970-01-01). */
  day: number;
  /** A day inside the month the label names. */
  date: LocalDate;
  /** Also print the year (first label, every January, and whenever the year changes). */
  showYear: boolean;
  /** The label stands at the left edge and names the month the axis starts in, rather than marking a 1st. */
  edge: boolean;
}

const MAX_MONTH_LABELS = 4;
/** A month start closer than this share of the width to the left edge makes the edge label unnecessary. */
const EDGE_LABEL_GAP = 0.22;

/**
 * Month labels for a horizontal axis from `startDay` to `endDay`: one at each 1st of a month, thinned so at most
 * four fit, plus a label for the starting month at the left edge when no month starts near it.
 */
export function monthTicks(startDay: number, endDay: number): MonthTick[] {
  const span = Math.max(1, endDay - startDay);
  const first = parseLocalDate(fromEpochDay(startDay));
  const starts: number[] = [];
  for (let year = first.year, month = first.month; ;) {
    const day = dayOf(formatLocalDate(year, month, 1));
    if (day > endDay) break;
    if (day >= startDay) starts.push(day);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const needsEdge = starts.length === 0 || (starts[0] ?? 0) - startDay > span * EDGE_LABEL_GAP;
  const room = needsEdge ? MAX_MONTH_LABELS - 1 : MAX_MONTH_LABELS;
  const step = Math.max(1, Math.ceil(starts.length / room));
  const kept = starts.filter((_, i) => i % step === 0);

  const ticks: MonthTick[] = [];
  if (needsEdge) {
    ticks.push({ day: startDay, date: fromEpochDay(startDay), showYear: false, edge: true });
  }
  for (const day of kept)
    ticks.push({ day, date: fromEpochDay(day), showYear: false, edge: false });

  let previousYear: number | null = null;
  return ticks.map((tick, index) => {
    const { year, month } = parseLocalDate(tick.date);
    const showYear = index === 0 || month === 1 || year !== previousYear;
    previousYear = year;
    return { ...tick, showYear };
  });
}

/** Planned weight on `day` for a straight descent at `rate` kg/week, never below the target. */
function weightAt(plan: PlanLine, rate: number, day: number): number {
  const floor = plan.targetWeightKg ?? 0;
  return Math.max(floor, plan.startWeightKg - (rate * (day - dayOf(plan.startDate))) / 7);
}

/** The day a descent at `rate` reaches the target. */
function reachDay(plan: PlanLine, rate: number): number {
  const floor = plan.targetWeightKg ?? 0;
  return dayOf(plan.startDate) + Math.ceil(((plan.startWeightKg - floor) / rate) * 7);
}

/** Evenly spaced points of a descent between two days. */
function sample(plan: PlanLine, rate: number, fromDay: number, toDay: number): DayKg[] {
  const span = Math.max(1, toDay - fromDay);
  const points: DayKg[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const day = fromDay + Math.round((span * i) / SAMPLES);
    if (i === 0 || day !== points[points.length - 1]?.day) {
      points.push({ day, kg: weightAt(plan, rate, day) });
    }
  }
  return points;
}

export function buildWeightChart(input: {
  today: LocalDate;
  weights: readonly WeightEntry[];
  plans: readonly PlanLine[];
  view?: WeightChartView;
}): WeightChartModel {
  const { today } = input;
  const view = input.view ?? 'full';
  const todayDay = dayOf(today);
  const sortedWeights = [...input.weights].sort((a, b) => a.date.localeCompare(b.date));
  const weights = sortedWeights.map((w) => ({ date: w.date, day: dayOf(w.date), kg: w.kg }));
  const trend = computeTrend(sortedWeights).map((p) => ({ day: dayOf(p.date), kg: p.trendKg }));

  const sortedPlans = [...input.plans]
    .filter((p) => p.effectiveFrom <= today)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const current = sortedPlans[sortedPlans.length - 1];
  const losing = current && current.weeklyRateKg > 0 && current.targetWeightKg !== null;

  // --- horizontal range
  const xs = [todayDay, ...weights.map((w) => w.day)];
  for (const p of sortedPlans) xs.push(dayOf(p.startDate));
  const projectedDay = losing && current.projectedDate ? dayOf(current.projectedDate) : null;
  if (losing) xs.push(projectedDay ?? todayDay + DEFAULT_LOOKAHEAD_DAYS);
  let startDay = Math.min(...xs);
  let endDay = Math.max(...xs);
  if (!current && weights.length === 0) {
    startDay = todayDay - MIN_SPAN_DAYS;
    endDay = todayDay + MIN_SPAN_DAYS;
  }
  if (view === 'recent') {
    startDay = Math.max(startDay, todayDay - RECENT_BACK_DAYS);
    endDay = Math.min(endDay, todayDay + RECENT_FORWARD_DAYS);
  }
  if (endDay - startDay < MIN_SPAN_DAYS) endDay = startDay + MIN_SPAN_DAYS;

  // --- plan lines
  const inView = (point: DayKg): boolean => point.day >= startDay && point.day <= endDay;
  const line = (plan: PlanLine, rate: number, lastDay: number): DayKg[] =>
    view === 'full'
      ? sample(plan, rate, dayOf(plan.startDate), Math.min(lastDay, reachDay(plan, rate)))
      : sample(plan, rate, Math.max(dayOf(plan.startDate), startDay), endDay);

  const earlier: DayKg[][] = [];
  for (const [i, plan] of sortedPlans.slice(0, -1).entries()) {
    if (plan.weeklyRateKg <= 0) continue;
    const cutDay = dayOf(sortedPlans[i + 1]?.effectiveFrom ?? plan.effectiveFrom);
    const points = sample(plan, plan.weeklyRateKg, dayOf(plan.startDate), cutDay).filter(
      (p) => p.day <= cutDay && p.day >= startDay,
    );
    if (points.length > 1) earlier.push(points);
  }

  let planModel: WeightChartModel['plan'] = null;
  if (current && losing && current.targetWeightKg !== null) {
    const lastDay = Math.max(reachDay(current, current.weeklyRateKg * slowRateFactor), todayDay);
    planModel = {
      line: line(current, current.weeklyRateKg, lastDay),
      fast: line(current, current.weeklyRateKg * fastRateFactor, lastDay),
      slow: line(current, current.weeklyRateKg * slowRateFactor, lastDay),
      targetKg: current.targetWeightKg,
      projectedDay,
      targetVisible: false,
    };
  }

  // --- vertical range: fits what is visible (the target joins only when it is near the data)
  const visibleKg = [
    ...weights.filter(inView).map((w) => w.kg),
    ...trend.filter(inView).map((t) => t.kg),
    ...(planModel
      ? [...planModel.line, ...planModel.fast, ...planModel.slow].filter(inView).map((p) => p.kg)
      : []),
    ...earlier
      .flat()
      .filter(inView)
      .map((p) => p.kg),
  ];
  if (view === 'full' && planModel) visibleKg.push(planModel.targetKg);
  const low = visibleKg.length > 0 ? Math.min(...visibleKg) : 60;
  const high = visibleKg.length > 0 ? Math.max(...visibleKg) : 80;
  const yMin = Math.floor(low - 1);
  const yMax = Math.ceil(high + 1);
  if (planModel) {
    planModel.targetVisible = planModel.targetKg >= yMin && planModel.targetKg <= yMax;
  }

  return {
    view,
    today,
    todayDay,
    domain: { startDay, endDay },
    yMin,
    yMax,
    weights: weights.filter(inView),
    trend: trend.filter(inView),
    plan: planModel,
    earlier,
  };
}
