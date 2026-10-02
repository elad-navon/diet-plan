import { type GrainDay } from '../../core/food';
import { formatDecimal, he } from '../../i18n/he';

interface FlourCardProps {
  grain: GrainDay;
}

interface AmountProps {
  label: string;
  grams: number;
  /** The colour of this part in the bar; the label says which part it is, so colour is never the only cue. */
  swatch: string;
}

/** One of the two figures: what it is, and its grams in a large size. */
function Amount({ label, grams, swatch }: AmountProps) {
  return (
    <div>
      <p className="flex items-start gap-1.5 text-sm text-muted">
        <span aria-hidden="true" className={`mt-1 size-3 shrink-0 rounded-full ${swatch}`} />
        {label}
      </p>
      <p className="mt-1 text-4xl font-bold leading-none tabular-nums">
        <bdi>{formatDecimal(grams)}</bdi>
        <span className="ms-1 text-base font-normal text-muted">{he.flour.unit}</span>
      </p>
    </div>
  );
}

const REFINED_SWATCH = 'bg-warning/50';
const WHOLE_SWATCH = 'bg-good/40';

/** White flour and whole grain today, side by side by the carbohydrate of each; with what to try instead of the white. */
export function FlourCard({ grain }: FlourCardProps) {
  const { refinedCarbsG, wholeCarbsG, swaps } = grain;
  const total = refinedCarbsG + wholeCarbsG;
  const refinedPercent = total > 0 ? (refinedCarbsG / total) * 100 : 0;
  const label = he.flour.summary(formatDecimal(refinedCarbsG), formatDecimal(wholeCarbsG));

  return (
    <section aria-labelledby="flour-title" className="card p-5">
      <h2 id="flour-title" className="text-xl font-bold">
        {he.flour.title}
      </h2>

      {total === 0 ? (
        <p className="mt-2 text-muted">{he.flour.empty}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Amount label={he.flour.refinedLabel} grams={refinedCarbsG} swatch={REFINED_SWATCH} />
            <Amount label={he.flour.wholeLabel} grams={wholeCarbsG} swatch={WHOLE_SWATCH} />
          </div>

          <div role="img" aria-label={label} className="mt-4">
            <div className="flex h-3 overflow-hidden rounded-full">
              <div className={REFINED_SWATCH} style={{ width: `${refinedPercent}%` }} />
              <div className={WHOLE_SWATCH} style={{ width: `${100 - refinedPercent}%` }} />
            </div>
          </div>
        </>
      )}

      {swaps.length > 0 && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-base">
          <p className="font-semibold">{he.flour.swapTitle}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5">
            {swaps.map((kind) => (
              <li key={kind}>{he.flour.swap[kind]}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-sm text-muted">{he.flour.note}</p>

      <details className="mt-1 text-sm text-muted">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-accent">
          {he.flour.howTitle}
        </summary>
        <ul className="list-disc space-y-1 ps-5">
          {he.flour.how.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
