import caloriesImage from '../../assets/backgrounds/calories.jpg';
import chartImage from '../../assets/backgrounds/chart.jpg';
import flourImage from '../../assets/backgrounds/flour.jpg';
import macrosImage from '../../assets/backgrounds/macros.jpg';
import mealsImage from '../../assets/backgrounds/meals.jpg';
import nextImage from '../../assets/backgrounds/next.jpg';
import sugarImage from '../../assets/backgrounds/sugar.jpg';
import weekImage from '../../assets/backgrounds/week.jpg';

export type Backdrop =
  'calories' | 'chart' | 'macros' | 'flour' | 'next' | 'week' | 'meals' | 'sugar';

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
 * - macros, flour: the food (oil, tomatoes, avocado, chicken / flour, wheat, bread, oats) lies along the bottom of the
 *   picture, which fills the card from its bottom edge;
 * - next, week, meals: a plate of chicken, potatoes and rice / a meal planner and a wooden spoon / a fork, a knife
 *   and a napkin, in the top left corner only, a little over half the card wide, fading into a dark ground with a
 *   blue glow;
 * - sugar: a wooden spoon of sugar and two sugar cubes in the top corner, and blue waves along the bottom; the picture
 *   fills the card from its top left corner, under a dark veil for the text.
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
  if (name === 'next' || name === 'week' || name === 'meals') {
    // A small picture in the top corner (the plate, the planner, the cutlery), about two thirds of the card wide. The
    // meals and next-meal cards can be wide, so their pictures stop at 15rem and do not run down behind the text. It
    // fades into the dark ground under it. The ground has a soft blue glow low on the left, like the waves of the
    // picture.
    return (
      <>
        <div
          aria-hidden="true"
          className={`${LAYER} inset-0 [background:radial-gradient(ellipse_90%_60%_at_20%_108%,rgb(10_80_150/0.55),rgb(3_22_40)_72%)]`}
        />
        <div
          aria-hidden="true"
          className={`${LAYER} left-0 top-0 aspect-[900/898] bg-cover ${name === 'next' ? 'w-[min(66%,15rem)]' : name === 'week' ? 'w-[64%]' : 'w-[min(64%,15rem)]'} [mask-image:linear-gradient(to_right,#000_45%,transparent),linear-gradient(to_bottom,#000_45%,transparent)] [mask-composite:intersect] [-webkit-mask-composite:source-in]`}
          style={{
            backgroundImage: `url(${name === 'next' ? nextImage : name === 'week' ? weekImage : mealsImage})`,
          }}
        />
        <Veil strength="bg-[rgb(3_12_22/0.2)]" />
      </>
    );
  }
  if (name === 'sugar') {
    return (
      <>
        <div aria-hidden="true" className={`${LAYER} inset-0 bg-[rgb(3_22_40)]`} />
        <div
          aria-hidden="true"
          className={`${LAYER} inset-0 bg-cover bg-left-top`}
          style={{ backgroundImage: `url(${sugarImage})` }}
        />
        <Veil strength="bg-[rgb(3_12_22/0.3)]" />
      </>
    );
  }
  // macros, flour: the food lies along the bottom of the picture and the top is dark, so the picture fills the card
  // from its bottom edge, under a thin dark veil.
  return (
    <>
      <div aria-hidden="true" className={`${LAYER} inset-0 bg-[rgb(3_22_40)]`} />
      <div
        aria-hidden="true"
        className={`${LAYER} inset-0 bg-cover bg-bottom`}
        style={{ backgroundImage: `url(${name === 'macros' ? macrosImage : flourImage})` }}
      />
      <Veil strength="bg-[rgb(3_12_22/0.2)]" />
    </>
  );
}
