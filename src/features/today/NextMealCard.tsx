import { sumEntries, type PortionPart } from '../../core/food';
import { type Recommendation, type Suggestion } from '../../core/recommend';
import { type Tz } from '../../core/time';
import { formatClock, ingredientLine } from '../../i18n/format';
import { formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';

interface NextMealCardProps {
  recommendation: Recommendation;
  tz: Tz;
  /** The ingredients of a suggestion at its portion (null when the idea has no detailed recipe). */
  partsOf: (suggestion: Suggestion) => PortionPart[] | null;
  /** The user picked a suggestion: opens the meal sheet filled in with it. */
  onPick: (suggestion: Suggestion, slot: Recommendation['next']) => void;
  onAddManual: () => void;
}

/** What to eat next, when, and how much - or a calm message when nothing should be recommended. */
export function NextMealCard({
  recommendation,
  tz,
  partsOf,
  onPick,
  onAddManual,
}: NextMealCardProps) {
  const { next, status, remainingKcal, notes } = recommendation;

  return (
    <section aria-labelledby="next-title" className="card p-5">
      <h2 id="next-title" className="mb-1 text-xl font-bold">
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
              {next.suggestions.map((suggestion) => {
                const parts = partsOf(suggestion);
                // With a recipe, show the numbers of the amounts listed (they are rounded to measures).
                const shown = parts
                  ? sumEntries(parts.map((part) => part.entry))
                  : { kcal: suggestion.kcal, proteinG: suggestion.proteinG };
                return (
                  <li key={suggestion.candidateId} className="rounded-2xl bg-surface-2 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-base font-semibold">{suggestion.name}</p>
                        <p className="text-sm text-muted">
                          <bdi>{formatInt(shown.kcal)}</bdi> {he.kcal} ·{' '}
                          {he.today.suggestionProtein(formatInt(shown.proteinG))}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        aria-label={`${he.add}: ${suggestion.name}`}
                        onClick={() => onPick(suggestion, next)}
                      >
                        {he.add}
                      </Button>
                    </div>
                    {parts && (
                      <ul
                        aria-label={he.today.ingredients(suggestion.name)}
                        className="mt-2 space-y-0.5 border-t border-faint pt-2 text-sm text-muted"
                      >
                        {parts.map((part) => (
                          <li key={part.entry.foodId}>{ingredientLine(part)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
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
