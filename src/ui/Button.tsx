import { type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent font-semibold',
  secondary: 'border border-axis bg-surface text-ink',
  ghost: 'text-accent',
  danger: 'border border-critical bg-surface text-ink',
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
  const size = icon ? 'min-h-11 min-w-11 justify-center' : 'min-h-11 px-4';
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-2 rounded-xl text-base transition-opacity disabled:opacity-50 ${size} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
