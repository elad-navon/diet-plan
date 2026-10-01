import { buildWeightChart } from '../../core/progress';
import { type Plan, type PlanOutcome } from '../../core/nutrition';
import { type LocalDate, type Tz } from '../../core/time';
import { formatMonthYear } from '../../i18n/format';
import { formatDecimal, formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { WeightChart } from '../progress/WeightChart';

interface PlanResultProps {
  outcome: PlanOutcome;
  today: LocalDate;
  tz: Tz;
  onSwitchToMaintain: () => void;
  onConfirmDate: () => void;
}

function Macros({ plan }: { plan: Plan }) {
  if (!plan.macros) {
    return <p className="text-sm text-muted">{he.onboarding.macroConflict}</p>;
  }
  const rows = [
    [he.today.protein, plan.macros.proteinG],
    [he.today.carbs, plan.macros.carbsG],
    [he.today.fat, plan.macros.fatG],
  ] as const;
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {rows.map(([label, grams]) => (
        <div key={label} className="rounded-xl bg-canvas p-2">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="text-lg font-bold">
            <bdi>{formatInt(grams)}</bdi> {he.gramsShort}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The outcome of the calculation: a plan to confirm, or a clear reason why not. */
export function PlanResult({
  outcome,
  today,
  tz,
  onSwitchToMaintain,
  onConfirmDate,
}: PlanResultProps) {
  if (outcome.kind === 'invalid') {
    return (
      <ul className="space-y-2" aria-live="polite">
        {outcome.errors.map((error) => (
          <li key={error.code} className="rounded-xl border border-critical p-3 text-base">
            ⚠ {he.validation[error.code]}
            {error.code === 'target_below_bmi_18_5' && error.min !== undefined && (
              <span className="block text-sm text-muted">
                {he.onboarding.minTarget(formatDecimal(error.min))}
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (outcome.kind === 'not_feasible') {
    return (
      <div className="space-y-3" role="status">
        <p className="rounded-xl border border-warning p-3 text-base">
          {he.onboarding.notFeasible}
        </p>
        <Button variant="primary" onClick={onSwitchToMaintain}>
          {he.onboarding.switchToMaintain}
        </Button>
      </div>
    );
  }

  const { plan } = outcome;
  const projected = plan.projectedDate ? formatMonthYear(plan.projectedDate, tz) : null;
  const chart =
    plan.goalType === 'lose' && plan.targetWeightKg !== null && plan.weeklyRateKg > 0
      ? buildWeightChart({
          today,
          weights: [],
          plans: [
            {
              effectiveFrom: today,
              startDate: today,
              startWeightKg: plan.startWeightKg,
              weeklyRateKg: plan.weeklyRateKg,
              targetWeightKg: plan.targetWeightKg,
              projectedDate: plan.projectedDate,
            },
          ],
        })
      : null;

  return (
    <div className="space-y-4">
      {outcome.kind === 'needs_confirmation' && plan.projectedDate && (
        <div className="space-y-2 rounded-xl border border-warning p-3" role="status">
          <p className="text-base">
            {he.onboarding.dateAdjusted(formatMonthYear(plan.projectedDate, tz))}
          </p>
          <Button variant="primary" onClick={onConfirmDate}>
            {he.onboarding.confirmDate}
          </Button>
        </div>
      )}

      <section
        aria-labelledby="target-title"
        className="rounded-2xl border border-faint bg-surface p-4 text-center"
      >
        <h3 id="target-title" className="text-base text-muted">
          {he.onboarding.dailyTarget}
        </h3>
        <p className="text-6xl font-bold leading-tight">
          <bdi>{formatInt(plan.kcalTarget)}</bdi>
        </p>
        <p className="mb-3 text-base text-muted">{he.onboarding.perDay}</p>
        <Macros plan={plan} />
        {plan.macroState === 'relaxed' && (
          <p className="mt-2 text-sm text-muted">{he.onboarding.macroRelaxed}</p>
        )}
        {plan.macroState === 'low_carb' && (
          <p className="mt-2 text-sm text-muted">{he.onboarding.macroLowCarb}</p>
        )}
      </section>

      {plan.warnings.includes('rate_adjusted') && plan.planState === 'adjusted_rate' && (
        <p className="rounded-xl border border-warning p-3 text-base">
          {he.onboarding.rateAdjusted}
        </p>
      )}
      {plan.warnings.includes('large_total_loss') && (
        <p className="rounded-xl border border-warning p-3 text-base">{he.onboarding.largeLoss}</p>
      )}

      {chart && (
        <section aria-labelledby="projection-title" className="space-y-2">
          <h3 id="projection-title" className="text-lg font-bold">
            {he.onboarding.projection}
          </h3>
          <WeightChart
            model={chart}
            tz={tz}
            showWeighIns={false}
            summary={`${projected ? `${he.onboarding.projectionReach(projected)}. ` : ''}${he.onboarding.projectionNote}`}
          />
        </section>
      )}
    </div>
  );
}
