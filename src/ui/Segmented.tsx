import { useId } from 'react';

interface SegmentedProps<T extends string> {
  legend: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

/** A small either/or switch built from real radio buttons (arrow keys and screen readers work natively). */
export function Segmented<T extends string>({
  legend,
  value,
  onChange,
  options,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className="grid grid-flow-col gap-1 rounded-xl bg-canvas p-1">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 text-center text-base has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
            value === option.value ? 'bg-surface font-bold shadow-sm' : 'text-muted'
          }`}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
