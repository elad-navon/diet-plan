import { useState } from 'react';
import { newId } from '../../app/ids';
import { useSaveWeight } from '../../app/data-hooks';
import { parseDecimalInput, validateWeightInput } from '../../core/contracts';
import { type Instant } from '../../core/time';
import { he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';

interface WeighInSheetProps {
  open: boolean;
  onClose: () => void;
  now: Instant;
  /** The latest recorded weight, to catch typos such as 780 instead of 78.0. */
  previousKg: number | null;
  onSaved: () => void;
}

export function WeighInSheet({ open, onClose, now, previousKg, onSaved }: WeighInSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={he.progress.addWeight}>
      <WeighInForm now={now} previousKg={previousKg} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

function WeighInForm({ now, previousKg, onClose, onSaved }: Omit<WeighInSheetProps, 'open'>) {
  const save = useSaveWeight();
  const [id] = useState(() => newId());
  const [text, setText] = useState(previousKg !== null ? String(previousKg) : '');
  const [error, setError] = useState<string | undefined>();
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function submit(): Promise<void> {
    const kg = parseDecimalInput(text);
    const checked = validateWeightInput({ kg: kg ?? Number.NaN }, previousKg);
    if (!checked.ok) {
      const code = checked.errors[0]?.code;
      setError(code ? he.errors[code] : he.genericError);
      return;
    }
    setError(undefined);
    if (checked.warnings.includes('weight_jump') && !confirmed) {
      setNeedsConfirm(true);
      return;
    }
    try {
      await save.mutateAsync({ id, kg: checked.value.kg, measuredAt: now });
      onSaved();
      onClose();
    } catch {
      setError(he.genericError);
    }
  }

  return (
    <div className="space-y-4">
      <TextField
        label={he.progress.weightField}
        value={text}
        onChange={(value) => {
          setText(value);
          setNeedsConfirm(false);
          setConfirmed(false);
        }}
        inputMode="decimal"
        error={error}
      />
      {needsConfirm && (
        <label className="flex items-start gap-3 rounded-xl border border-warning p-3 text-base">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-6 shrink-0 accent-[var(--accent)]"
          />
          {he.progress.weightJump}
        </label>
      )}
      <Button
        variant="primary"
        className="w-full justify-center"
        disabled={save.isPending}
        onClick={() => void submit()}
      >
        {he.progress.saveWeight}
      </Button>
    </div>
  );
}
