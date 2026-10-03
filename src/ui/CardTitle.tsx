import { type ReactNode } from 'react';

/** The drawings of the sprite made for card titles (see ui/art/sprite.svg). */
export type TitleIcon = 'trend' | 'utensils' | 'pie' | 'cube' | 'wheat' | 'week' | 'clock';

/** Each tone is two palette colors: the icon's line and its second accent. */
const TONES = {
  cyan: '[--t1:var(--tone-cyan)] [--t2:var(--tone-blue)]',
  mint: '[--t1:var(--tone-mint)] [--t2:var(--tone-cyan)]',
  blue: '[--t1:var(--tone-blue)] [--t2:var(--tone-violet)]',
  green: '[--t1:var(--tone-green)] [--t2:var(--tone-mint)]',
} as const;

export type Tone = keyof typeof TONES;

/** A glowing tile with a two-tone icon. */
export function IconTile({ icon, tone }: { icon: TitleIcon; tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,color-mix(in_srgb,var(--t1)_30%,transparent),color-mix(in_srgb,var(--t2)_10%,transparent))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--t1)_42%,transparent),0_0_20px_-4px_var(--t1)] ${TONES[tone]}`}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        focusable="false"
        style={{ filter: 'drop-shadow(0 0 4px var(--t1))' }}
      >
        <use href={`#t-${icon}`} />
      </svg>
    </span>
  );
}

interface CardTitleProps {
  /** The id the card points at with aria-labelledby. */
  id?: string;
  icon: TitleIcon;
  tone: Tone;
  className?: string;
  children: ReactNode;
}

/** A card heading, with its icon tile before the words. */
export function CardTitle({ id, icon, tone, className = '', children }: CardTitleProps) {
  return (
    <h2
      id={id}
      className={`flex items-center gap-2.5 [text-shadow:0_1px_8px_var(--text-halo)] ${className}`}
    >
      <IconTile icon={icon} tone={tone} />
      {children}
    </h2>
  );
}
