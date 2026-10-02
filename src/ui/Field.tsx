import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

interface FieldFrameProps {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label + control + hint + error, wired together for screen readers (aria-describedby / aria-invalid). */
function FieldFrame({ label, hint, error, children }: FieldFrameProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-base font-medium text-ink">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <p id={errorId} aria-live="polite" className="min-h-0 text-sm font-medium text-ink">
        {error ? `⚠ ${error}` : ''}
      </p>
    </div>
  );
}

const CONTROL =
  'min-h-12 w-full rounded-2xl border bg-surface-2 px-4 text-base text-ink placeholder:text-muted';

interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'id'
> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | undefined;
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  className = '',
  ...rest
}: TextFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={`${CONTROL} ${invalid ? 'border-critical' : 'border-axis'} ${className}`}
          {...rest}
        />
      )}
    </FieldFrame>
  );
}

interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value' | 'id'
> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
  error?: string | undefined;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={`${CONTROL} ${invalid ? 'border-critical' : 'border-axis'}`}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldFrame>
  );
}
