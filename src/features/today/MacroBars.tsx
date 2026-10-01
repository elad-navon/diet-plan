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
    <section
      aria-labelledby="macros-title"
      className="rounded-2xl border border-faint bg-surface p-4"
    >
      <h2 id="macros-title" className="mb-3 text-lg font-bold">
        {he.today.macros}
      </h2>
      <ul className="space-y-3">
        {ROWS.map(({ key, label }) => {
          const eaten = summary.macros[key];
          const goal = target?.[key] ?? null;
          const percent = goal ? Math.min(100, Math.round((eaten / goal) * 100)) : 0;
          return (
            <li key={key}>
              <div className="mb-1 flex items-baseline justify-between text-base">
                <span>{label}</span>
                <span className="text-muted">
                  <bdi>{formatInt(eaten)}</bdi>
                  {goal !== null && (
                    <>
                      {' / '}
                      <bdi>{formatInt(goal)}</bdi>
                    </>
                  )}{' '}
                  {he.gramsShort}
                </span>
              </div>
              {goal !== null && (
                <div
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={goal}
                  aria-valuenow={Math.min(eaten, goal)}
                  aria-valuetext={`${formatInt(eaten)} / ${formatInt(goal)} ${he.gramsShort}`}
                  className="h-2 overflow-hidden rounded-full bg-faint"
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
