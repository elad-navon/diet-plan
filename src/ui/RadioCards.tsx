import { useId } from 'react';

interface RadioCardsProps<T extends string> {
  legend: string;
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: string; hint?: string }[];
  error?: string | undefined;
  hint?: string;
}

/**
 * A group of radio buttons drawn as large tappable cards. Real radio inputs, so the keyboard
 * (arrow keys) and screen readers work natively; the selected card also shows a check mark, not just a color.
 */
export function RadioCards<T extends string>({
  legend,
  value,
  onChange,
  options,
  error,
  hint,
}: RadioCardsProps<T>) {
  const name = useId();
  const errorId = `${name}-error`;
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      aria-invalid={Boolean(error)}
      className="space-y-2"
    >
      <legend className="mb-1 text-base font-medium">{legend}</legend>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 py-2 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
            value === option.value
              ? 'border-accent bg-accent/10 font-semibold'
              : 'border-transparent bg-surface [box-shadow:var(--card-shadow)]'
          }`}
        >
          <span>
            <span className="block text-base">{option.label}</span>
            {option.hint && (
              <span className="block text-sm font-normal text-muted">{option.hint}</span>
            )}
          </span>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
              value === option.value ? 'border-accent bg-accent text-on-accent' : 'border-axis'
            }`}
          >
            {value === option.value && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </span>
        </label>
      ))}
      <p id={errorId} aria-live="polite" className="text-sm font-medium">
        {error ? `⚠ ${error}` : ''}
      </p>
    </fieldset>
  );
}
