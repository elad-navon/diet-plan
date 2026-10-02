import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMealsRange, usePlans, useWeights } from '../../app/data-hooks';
import { useNow } from '../../app/services';
import { summarizeRange } from '../../core/dayview';
import { shouldSuggestRecalc } from '../../core/nutrition';
import { buildWeightChart, type PlanLine, type WeightChartView } from '../../core/progress';
import { addDays, localDateOf } from '../../core/time';
import { type StoredPlan } from '../../data';
import { formatMonthYear, formatShortDate } from '../../i18n/format';
import { formatDecimal, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { useToast } from '../../ui/Toast';
import { LoadGate } from '../shell/LoadGate';
import { useRequiredProfile } from '../shell/ProfileGate';
import { WeeklyChart } from './WeeklyChart';
import { WeighInSheet } from './WeighInSheet';
import { WeightChart } from './WeightChart';

const toPlanLine = (stored: StoredPlan): PlanLine => ({
  effectiveFrom: stored.effectiveFrom,
  startDate: stored.plan.startDate,
  startWeightKg: stored.plan.startWeightKg,
  weeklyRateKg: stored.plan.weeklyRateKg,
  targetWeightKg: stored.plan.targetWeightKg,
  projectedDate: stored.plan.projectedDate,
});

export function ProgressPage() {
  const tz = useRequiredProfile().timezone;
  const today = localDateOf(useNow(), tz);
  return (
    <LoadGate queries={[usePlans(), useWeights(), useMealsRange(addDays(today, -6), today)]}>
      <ProgressContent />
    </LoadGate>
  );
}

function ProgressContent() {
  const profile = useRequiredProfile();
  const tz = profile.timezone;
  const now = useNow();
  const today = localDateOf(now, tz);
  const navigate = useNavigate();
  const toast = useToast();
  const [weighInOpen, setWeighInOpen] = useState(false);
  const [view, setView] = useState<WeightChartView>('recent');

  const plans = usePlans().data ?? [];
  const weights = useWeights().data ?? [];
  const from = addDays(today, -6);
  const meals = useMealsRange(from, today).data ?? [];

  const model = buildWeightChart({
    today,
    weights: weights.map((w) => ({ date: w.localDate, kg: w.kg })),
    plans: plans.map(toPlanLine),
    view,
  });
  const range = summarizeRange({ from, to: today, plans, meals });

  const lastWeight = weights.at(-1) ?? null;
  const trendNow = model.trend.at(-1)?.kg ?? null;
  const current = plans.filter((p) => p.effectiveFrom <= today).at(-1) ?? null;
  const suggestRecalc =
    current !== null &&
    trendNow !== null &&
    shouldSuggestRecalc(current.plan.startWeightKg, trendNow);

  const projected = current?.plan.projectedDate
    ? ` ${he.onboarding.projectionReach(formatMonthYear(current.plan.projectedDate, tz))}.`
    : '';
  const weightSummary =
    (trendNow !== null
      ? `${he.progress.trendNow(formatDecimal(trendNow))}.`
      : he.progress.noWeights) +
    projected +
    (current?.plan.projectedDate ? ` ${he.onboarding.projectionNote}` : '');

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{he.progress.title}</h1>
        <Button variant="primary" onClick={() => setWeighInOpen(true)}>
          <Icon name="plus" size={18} /> {he.progress.addWeight}
        </Button>
      </header>

      {suggestRecalc && (
        <section
          aria-labelledby="recalc-title"
          className="rounded-2xl border border-warning bg-surface p-4"
        >
          <h2 id="recalc-title" className="text-xl font-bold">
            {he.progress.recalcTitle}
          </h2>
          <p className="text-base">{he.progress.recalcBody}</p>
          <Button className="mt-2" onClick={() => void navigate('/settings/goal')}>
            {he.progress.recalcAction}
          </Button>
        </section>
      )}

      {model.plan && (
        <Segmented<WeightChartView>
          legend={he.progress.viewLegend}
          value={view}
          onChange={setView}
          options={[
            { value: 'recent', label: he.progress.viewRecent },
            { value: 'full', label: he.progress.viewFull },
          ]}
        />
      )}
      <WeightChart model={model} tz={tz} summary={weightSummary} />

      {weights.length > 0 && (
        <details className="card p-5">
          <summary className="min-h-11 cursor-pointer text-base font-semibold">
            {he.progress.weighIns}
          </summary>
          <table className="mt-2 w-full text-start text-base">
            <caption className="sr-only">{he.progress.weighIns}</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1 text-start font-medium">
                  {he.progress.colDate}
                </th>
                <th scope="col" className="py-1 text-start font-medium">
                  {he.progress.colWeight}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...weights].reverse().map((w) => (
                <tr key={w.id} className="border-t border-faint">
                  <td className="py-1.5">{formatShortDate(w.localDate, tz)}</td>
                  <td className="py-1.5">
                    <bdi>{formatDecimal(w.kg)}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <WeeklyChart range={range} tz={tz} />

      <WeighInSheet
        open={weighInOpen}
        onClose={() => setWeighInOpen(false)}
        now={now}
        previousKg={lastWeight?.kg ?? null}
        onSaved={() => toast.show({ message: he.progress.weightSaved })}
      />
    </div>
  );
}
