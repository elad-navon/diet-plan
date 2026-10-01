import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { newId } from '../../app/ids';
import { useQueryClient } from '@tanstack/react-query';
import { usePlans, useProfile } from '../../app/data-hooks';
import { deviceTimeZone, useNow, useServices } from '../../app/services';
import {
  computePlan,
  minHealthyWeightKg,
  type ActivityLevel,
  type Sex,
} from '../../core/nutrition';
import { parseDecimalInput } from '../../core/contracts';
import { DEFAULT_SCHEDULE } from '../../core/schedule';
import { addDays, localDateOf } from '../../core/time';
import { type Profile, type StoredPlan } from '../../data';
import { he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { RadioCards } from '../../ui/RadioCards';
import {
  EMPTY_DRAFT,
  defaultTargetDate,
  draftFromInputs,
  toPlanInputs,
  validateStep,
  type Draft,
  type DraftErrors,
  type DraftField,
  type Step,
} from './draft';
import { PlanResult } from './PlanResult';

const LAST_STEP: Step = 4;
const STEP_TITLES: Record<Step, string> = {
  1: he.onboarding.stepBody,
  2: he.onboarding.stepMeasures,
  3: he.onboarding.stepGoal,
  4: he.onboarding.stepResult,
};

/** Hebrew text for a step error code. */
function errorText(field: DraftField, code: string): string {
  if (code === 'required') return he.onboarding.required;
  if (field === 'birthDate' && code === 'invalid') return he.validation.invalid_date;
  if (field === 'target' && code === 'invalid') return he.validation.invalid_number;
  return he.validation[code as keyof typeof he.validation] ?? he.genericError;
}

/**
 * First-run flow and later goal edits: four short steps ending in the calculated daily target.
 * Nothing is saved until the person confirms the result on the last step.
 */
export function OnboardingPage({ mode }: { mode: 'new' | 'edit' }) {
  const profile = useProfile();
  const plans = usePlans();
  if (profile.isPending || plans.isPending) {
    return (
      <p role="status" className="p-6 text-muted">
        {he.loading}
      </p>
    );
  }
  return <Wizard mode={mode} existing={profile.data ?? null} plans={plans.data ?? []} />;
}

function Wizard({
  mode,
  existing,
  plans,
}: {
  mode: 'new' | 'edit';
  existing: Profile | null;
  plans: StoredPlan[];
}) {
  const navigate = useNavigate();
  const now = useNow();
  const tz = existing?.timezone ?? deviceTimeZone();
  const today = localDateOf(now, tz);
  const { repos } = useServices();
  const queryClient = useQueryClient();

  const latest = plans.filter((p) => p.effectiveFrom <= today).at(-1) ?? null;
  const [draft, setDraft] = useState<Draft>(() =>
    mode === 'edit' && latest ? draftFromInputs(latest.inputs) : EMPTY_DRAFT,
  );
  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [acknowledged, setAcknowledged] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the step heading so screen readers announce where they are.
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value, confirmAdjustedDate: false }));

  const inputs = toPlanInputs(draft, today);
  const outcome = inputs ? computePlan(inputs) : null;
  const heightKnown = parseDecimalInput(draft.heightText);

  function next(): void {
    const { errors: found } = validateStep(step, draft, today);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep((step + 1) as Step);
  }

  async function finish(): Promise<void> {
    if (!inputs || !outcome || (outcome.kind !== 'plan' && outcome.kind !== 'needs_confirmation'))
      return;
    if (outcome.kind === 'needs_confirmation' || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      const saved: Profile = {
        sex: inputs.sex,
        birthDate: inputs.birthDate,
        heightCm: inputs.heightCm,
        timezone: tz,
        disclaimerAckAt: existing?.disclaimerAckAt ?? now,
      };
      const { plan } = outcome;
      const stored: StoredPlan = {
        id: newId(),
        effectiveFrom: today,
        kcalTarget: plan.kcalTarget,
        kcalFloor: plan.kcalFloor,
        macros: plan.macros,
        macroState: plan.macroState,
        schedule: latest?.schedule ?? DEFAULT_SCHEDULE,
        inputs,
        plan,
        createdAt: now,
      };
      // Plan first, then profile, then the first weigh-in; the screens refresh once at the end, so nobody
      // lands on "today" while the target is still missing.
      await repos.plans.save(stored, today);
      await repos.profile.save(saved);
      await repos.weights.upsert({ id: newId(), kg: inputs.weightKg, measuredAt: now });
      await queryClient.invalidateQueries();
      void navigate('/today', { replace: true });
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  }

  const err = (field: DraftField): string | undefined =>
    errors[field] ? errorText(field, errors[field] ?? '') : undefined;
  const minTarget = heightKnown ? minHealthyWeightKg(heightKnown) : null;
  const canStart = outcome?.kind === 'plan' && (acknowledged || mode === 'edit') && !saving;

  return (
    <div className="space-y-5 pb-4">
      <header className="space-y-2">
        <p className="text-base text-muted">{he.onboarding.step(step, LAST_STEP)}</p>
        <div
          role="progressbar"
          aria-label={he.onboarding.title}
          aria-valuemin={1}
          aria-valuemax={LAST_STEP}
          aria-valuenow={step}
          aria-valuetext={he.onboarding.step(step, LAST_STEP)}
          className="h-2 overflow-hidden rounded-full bg-faint"
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${(step / LAST_STEP) * 100}%` }}
          />
        </div>
        <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold outline-none">
          {mode === 'edit' && step === 1 ? he.settings.editGoal : STEP_TITLES[step]}
        </h1>
        {mode === 'edit' && <p className="text-base text-muted">{he.onboarding.updateNote}</p>}
      </header>

      {step === 1 && (
        <div className="space-y-4">
          <RadioCards<Sex>
            legend={he.onboarding.sex}
            hint={he.onboarding.sexHelp}
            value={draft.sex}
            onChange={(value) => set('sex', value)}
            error={err('sex')}
            options={[
              { value: 'female', label: he.sex.female },
              { value: 'male', label: he.sex.male },
              { value: 'unspecified', label: he.sex.unspecified },
            ]}
          />
          <TextField
            label={he.onboarding.birthDate}
            type="date"
            value={draft.birthDate}
            onChange={(value) => set('birthDate', value)}
            error={err('birthDate')}
            max={addDays(today, -1)}
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <TextField
            label={he.onboarding.height}
            value={draft.heightText}
            onChange={(value) => set('heightText', value)}
            inputMode="decimal"
            error={err('height')}
          />
          <TextField
            label={he.onboarding.weight}
            value={draft.weightText}
            onChange={(value) => set('weightText', value)}
            inputMode="decimal"
            error={err('weight')}
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <RadioCards<ActivityLevel>
            legend={he.onboarding.activity}
            value={draft.activity}
            onChange={(value) => set('activity', value)}
            error={err('activity')}
            options={(Object.keys(he.activity) as ActivityLevel[]).map((level) => ({
              value: level,
              label: he.activity[level].name,
              hint: he.activity[level].hint,
            }))}
          />
          <RadioCards<'lose' | 'maintain'>
            legend={he.onboarding.goalType}
            value={draft.goal}
            onChange={(value) => set('goal', value)}
            options={[
              { value: 'lose', label: he.onboarding.goalLose },
              { value: 'maintain', label: he.onboarding.goalMaintain },
            ]}
          />
          {draft.goal === 'lose' && (
            <>
              <TextField
                label={he.onboarding.targetWeight}
                value={draft.targetText}
                onChange={(value) => set('targetText', value)}
                inputMode="decimal"
                error={err('target')}
                {...(minTarget !== null
                  ? { hint: he.onboarding.minTarget(String(minTarget)) }
                  : {})}
              />
              <RadioCards<Draft['pace']>
                legend={he.onboarding.pace}
                value={draft.pace}
                onChange={(value) => {
                  set('pace', value);
                  if (value === 'date' && !draft.targetDate)
                    set('targetDate', defaultTargetDate(today));
                }}
                options={[
                  { value: '0.25', label: he.onboarding.paceSlow },
                  { value: '0.5', label: he.onboarding.paceMedium },
                  { value: '0.75', label: he.onboarding.paceFast },
                  { value: 'date', label: he.onboarding.byDate },
                ]}
              />
              {draft.pace === 'date' && (
                <TextField
                  label={he.onboarding.targetDate}
                  type="date"
                  value={draft.targetDate}
                  onChange={(value) => set('targetDate', value)}
                  min={addDays(today, 1)}
                  error={err('targetDate')}
                />
              )}
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          {outcome ? (
            <PlanResult
              outcome={outcome}
              today={today}
              tz={tz}
              onSwitchToMaintain={() => {
                set('goal', 'maintain');
              }}
              onConfirmDate={() =>
                setDraft((current) => ({ ...current, confirmAdjustedDate: true }))
              }
            />
          ) : (
            <p role="alert">{he.genericError}</p>
          )}
          {mode === 'new' && outcome?.kind === 'plan' && (
            <label className="flex items-start gap-3 rounded-xl border border-faint bg-surface p-3 text-base">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 size-6 shrink-0 accent-[var(--accent)]"
              />
              {he.onboarding.acknowledge}
            </label>
          )}
          {saveError && (
            <p role="alert" className="text-base font-medium">
              {he.genericError}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {step > 1 && <Button onClick={() => setStep((step - 1) as Step)}>{he.back}</Button>}
        {step < LAST_STEP ? (
          <Button variant="primary" className="flex-1 justify-center" onClick={next}>
            {he.next}
          </Button>
        ) : (
          <Button
            variant="primary"
            className="flex-1 justify-center"
            disabled={!canStart}
            onClick={() => void finish()}
          >
            {saving
              ? he.addMeal.saving
              : mode === 'edit'
                ? he.onboarding.update
                : he.onboarding.start}
          </Button>
        )}
      </div>
    </div>
  );
}
