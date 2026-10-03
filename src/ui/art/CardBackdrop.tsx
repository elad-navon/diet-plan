import caloriesImage from '../../assets/backgrounds/calories.jpg';
import chartImage from '../../assets/backgrounds/chart.jpg';
import flourImage from '../../assets/backgrounds/flour.jpg';
import macrosImage from '../../assets/backgrounds/macros.jpg';

export type Backdrop = 'calories' | 'chart' | 'macros' | 'flour';

/** A picture behind a card, under its content; screen readers skip it. */
const LAYER = 'pointer-events-none absolute -z-10 bg-no-repeat';

/** A dark veil over a picture, so numbers and lines stay easy to read. */
function Veil({ strength }: { strength: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 ${strength}`} />
  );
}

/**
 * The background pictures of the cards (basil, tomatoes, avocado, wheat on a dark ground), each made for one card.
 * The card must be `relative`, clip its corners and start its own stacking context (the cards that use this have
 * `relative isolate overflow-hidden`).
 *
 * - calories: the picture (food along its two sides, dark in the middle) fills the card without being stretched, so
 *   the food frames the ring and the dark middle sits behind it;
 * - chart: the picture fills the card;
 * - macros: the picture fills the card from its left side, where its food is (the corner stays in the lower left);
 * - flour: the picture takes only the lower part of the card and fades upward, so the text above stays clear.
 */
export function CardBackdrop({ name }: { name: Backdrop }) {
  if (name === 'calories') {
    return (
      <>
        <div
          aria-hidden="true"
          className={`${LAYER} inset-0 bg-cover bg-center`}
          style={{ backgroundImage: `url(${caloriesImage})` }}
        />
        <Veil strength="bg-[radial-gradient(ellipse_46%_38%_at_50%_53%,rgb(4_16_28/0.8),rgb(4_16_28/0.4)_62%,transparent)]" />
      </>
    );
  }
  if (name === 'chart') {
    return (
      <>
        <div
          aria-hidden="true"
          className={`${LAYER} inset-0 bg-cover bg-center`}
          style={{ backgroundImage: `url(${chartImage})` }}
        />
        <Veil strength="[background:rgb(3_12_22/0.74)] lg:[background:radial-gradient(ellipse_88%_80%_at_50%_56%,rgb(3_12_22/0.82),rgb(3_12_22/0.55)_72%,rgb(3_12_22/0.2))]" />
      </>
    );
  }
  if (name === 'macros') {
    return (
      <div
        aria-hidden="true"
        className={`${LAYER} inset-0 bg-cover bg-left`}
        style={{ backgroundImage: `url(${macrosImage})` }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${LAYER} inset-x-0 bottom-0 h-24 bg-cover bg-bottom lg:h-[40%] [mask-image:linear-gradient(to_top,#000_55%,transparent)]`}
      style={{ backgroundImage: `url(${flourImage})` }}
    />
  );
}
