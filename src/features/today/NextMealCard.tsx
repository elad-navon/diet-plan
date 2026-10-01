import { type Recommendation, type Suggestion } from '../../core/recommend';
import { type Tz } from '../../core/time';
import { formatClock } from '../../i18n/format';
import { formatDecimal, formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';

interface NextMealCardProps {
  recommendation: Recommendation;
  tz: Tz;
  /** The user picked a suggestion: opens the meal sheet filled in with it. */
  onPick: (suggestion: Suggestion, slot: Recommendation['next']) => void;
  onAddManual: () => void;
}

/** What to eat next, when, and how much - or a calm message when nothing should be recommended. */
export function NextMealCard({ recommendation, tz, onPick, onAddManual }: NextMealCardProps) {
  const { next, status, remainingKcal, notes } = recommendation;

  return (
    <section
      aria-labelledby="next-title"
      className="rounded-2xl border border-faint bg-surface p-4"
    >
      <h2 id="next-title" className="mb-1 text-lg font-bold">
        {next?.optional ? he.today.optionalSnack : he.today.nextMeal}
      </h2>

      {status === 'over_budget' && (
        <p className="text-base">{he.today.overMessage(formatInt(-remainingKcal))}</p>
      )}
      {status === 'day_complete' && !next && (
        <p className="text-base">{he.today.completeMessage}</p>
      )}

      {next && (
        <>
          <p className="text-base text-muted">
            {next.slot && (
              <span className="font-semibold text-ink">{he.slotMeal[next.slot]} · </span>
            )}
            {he.today.nextAround(formatClock(next.suggestedAt, tz))} ·{' '}
            {he.today.nextUpTo(formatInt(next.budgetKcal))}
          </p>
          {next.suggestions.length > 0 && (
            <ul className="mt-3 space-y-2">
              {next.suggestions.map((suggestion) => (
                <li
                  key={suggestion.candidateId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-faint px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium">{suggestion.name}</p>
                    <p className="text-sm text-muted">
                      <bdi>{formatInt(suggestion.kcal)}</bdi> {he.kcal} ·{' '}
                      {he.today.suggestionProtein(formatInt(suggestion.proteinG))}
                      {suggestion.portionFactor !== 1 &&
                        ` · ${he.today.portion(formatDecimal(suggestion.portionFactor))}`}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    aria-label={`${he.add}: ${suggestion.name}`}
                    onClick={() => onPick(suggestion, next)}
                  >
                    {he.add}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {notes.map((note) => (
        <p key={note} className="mt-3 text-sm text-muted">
          {he.notes[note]}
        </p>
      ))}

      {(next || status !== 'over_budget') && (
        <Button variant="ghost" className="mt-2 -ms-4" onClick={onAddManual}>
          {he.today.addMeal}
        </Button>
      )}
    </section>
  );
}
