import { type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-accent to-accent-2 text-on-accent font-semibold shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_75%,transparent)] hover:brightness-110 active:scale-[0.98]',
  secondary:
    'bg-surface-2 text-ink font-medium ring-1 ring-inset ring-faint hover:bg-faint/70 active:scale-[0.98]',
  ghost: 'text-accent font-medium hover:bg-accent/10 active:scale-[0.98]',
  danger:
    'bg-surface-2 text-ink font-medium ring-1 ring-inset ring-critical hover:bg-faint/70 active:scale-[0.98]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Square icon-only button: needs an `aria-label`. */
  icon?: boolean;
  children: ReactNode;
}

/** Every button is at least 44x44 px (docs/TEST_PLAN.md A11Y-04). */
export function Button({
  variant = 'secondary',
  icon = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const size = icon ? 'min-h-11 min-w-11 justify-center' : 'min-h-12 px-5';
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-2 rounded-full text-base transition disabled:opacity-50 ${size} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
