import { type DaySummary } from '../../core/dayview';
import { type MacroState, type Macros } from '../../core/nutrition';
import { formatInt, he } from '../../i18n/he';

interface MacroBarsProps {
  /** Null when there is no safe macro target (state `conflict`) or no plan yet. */
  target: Macros | null;
  macroState: MacroState | null;
  summary: DaySummary;
}

const ROWS: { key: keyof Macros; label: string }[] = [
  { key: 'proteinG', label: he.today.protein },
  { key: 'carbsG', label: he.today.carbs },
  { key: 'fatG', label: he.today.fat },
];

/** Protein / carbohydrate / fat against their targets. One series, one color; numbers carry the detail. */
export function MacroBars({ target, macroState, summary }: MacroBarsProps) {
  const { mealsWithMacros, meals } = summary.macroCoverage;
  const partial = meals > 0 && mealsWithMacros < meals;

  return (
    <section aria-labelledby="macros-title" className="card p-5">
      <h2 id="macros-title" className="mb-3 text-xl font-bold">
        {he.today.macros}
      </h2>
      <ul className="grid grid-cols-3 gap-2.5">
        {ROWS.map(({ key, label }) => {
          const eaten = summary.macros[key];
          const goal = target?.[key] ?? null;
          const percent = goal ? Math.min(100, Math.round((eaten / goal) * 100)) : 0;
          return (
            <li key={key} className="rounded-2xl bg-surface-2 p-3">
              <p className="text-sm text-muted">{label}</p>
              <p className="mt-0.5 text-3xl font-bold leading-tight tabular-nums">
                <bdi>{formatInt(eaten)}</bdi>
              </p>
              <p className="text-sm text-muted">
                {goal !== null ? he.today.macroGoal(formatInt(goal)) : he.gramsShort}
              </p>
              {goal !== null && (
                <div
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={goal}
                  aria-valuenow={Math.min(eaten, goal)}
                  aria-valuetext={`${formatInt(eaten)} / ${formatInt(goal)} ${he.gramsShort}`}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-faint"
                >
                  <div
                    className="h-full rounded-full bg-series-1"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {macroState === 'conflict' && (
        <p className="mt-3 text-sm text-muted">{he.today.noMacroTarget}</p>
      )}
      {macroState === 'relaxed' && (
        <p className="mt-3 text-sm text-muted">{he.onboarding.macroRelaxed}</p>
      )}
      {macroState === 'low_carb' && (
        <p className="mt-3 text-sm text-muted">{he.onboarding.macroLowCarb}</p>
      )}
      {partial && (
        <p className="mt-3 text-sm text-muted">{he.today.macroCoverage(mealsWithMacros, meals)}</p>
      )}
    </section>
  );
}
