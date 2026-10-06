import { type DaySummary } from '../../core/dayview';
import { type MacroState, type Macros } from '../../core/nutrition';
import { formatInt, he } from '../../i18n/he';
import { CardBackdrop } from '../../ui/art/CardBackdrop';
import { CardTitle } from '../../ui/CardTitle';

interface MacroBarsProps {
  /** Null when there is no safe macro target (state `conflict`) or no plan yet. */
  target: Macros | null;
  macroState: MacroState | null;
  summary: DaySummary;
}

/** Each macro has its own color. */
const ROWS: { key: keyof Macros; label: string; fill: string }[] = [
  { key: 'proteinG', label: he.today.protein, fill: '[background:var(--macro-protein)]' },
  { key: 'carbsG', label: he.today.carbs, fill: '[background:var(--macro-carbs)]' },
  { key: 'fatG', label: he.today.fat, fill: '[background:var(--macro-fat)]' },
];

/** Protein / carbohydrate / fat against their targets. One series, one color; numbers carry the detail. */
export function MacroBars({ target, macroState, summary }: MacroBarsProps) {
  const { mealsWithMacros, meals } = summary.macroCoverage;
  const partial = meals > 0 && mealsWithMacros < meals;

  return (
    <section
      aria-labelledby="macros-title"
      className="card relative isolate overflow-hidden panel-dark p-5"
    >
      <CardBackdrop name="macros" />
      <CardTitle
        id="macros-title"
        icon="pie"
        tone="blue"
        className="mb-3 text-xl font-bold lg:mb-2 lg:text-lg"
      >
        {he.today.macros}
      </CardTitle>
      <ul className="grid grid-cols-3 gap-2.5 lg:grid-cols-1 lg:gap-2">
        {ROWS.map(({ key, label, fill }) => {
          const eaten = summary.macros[key];
          const goal = target?.[key] ?? null;
          const percent = goal ? Math.min(100, Math.round((eaten / goal) * 100)) : 0;
          return (
            <li
              key={key}
              className="rounded-2xl bg-surface-2 p-3 lg:grid lg:grid-cols-[1fr_auto] lg:items-baseline lg:gap-x-2 lg:gap-y-1.5 lg:py-2.5"
            >
              <p className="text-sm text-muted">{label}</p>
              <div className="lg:flex lg:items-baseline lg:gap-1.5">
                <p className="mt-0.5 text-3xl font-bold leading-tight tabular-nums lg:mt-0 lg:text-2xl">
                  <bdi>{formatInt(eaten)}</bdi>
                </p>
                <p className="text-sm text-muted">
                  {goal === null
                    ? he.gramsShort
                    : eaten > goal
                      ? he.today.macroAbove(formatInt(eaten - goal))
                      : he.today.macroGoal(formatInt(goal))}
                </p>
              </div>
              {goal !== null && (
                <div
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={goal}
                  aria-valuenow={Math.min(eaten, goal)}
                  aria-valuetext={`${formatInt(eaten)} / ${formatInt(goal)} ${he.gramsShort}`}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-faint lg:col-span-2 lg:mt-0 lg:h-2"
                >
                  <div
                    className={`h-full rounded-full shadow-[0_0_10px_var(--macro-glow)] lg:grow-x ${fill}`}
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
