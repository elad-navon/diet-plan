import { parseDecimalInput } from '../../core/contracts';
import { ageOn, addDays, isValidLocalDate, type LocalDate } from '../../core/time';
import {
  NUTRITION_CONFIG,
  type ActivityLevel,
  type GoalType,
  type PlanInputs,
  type Sex,
} from '../../core/nutrition';

/** What the person has typed so far in the onboarding / goal form (everything as the strings they entered). */
export interface Draft {
  sex: Sex | null;
  birthDate: string;
  heightText: string;
  weightText: string;
  activity: ActivityLevel | null;
  goal: GoalType;
  targetText: string;
  /** A weekly rate in kg ("0.5") or "date" to plan by a target date. */
  pace: '0.25' | '0.5' | '0.75' | 'date';
  targetDate: string;
  /** The user accepted the realistic date offered for an unrealistic one. */
  confirmAdjustedDate: boolean;
}

export const EMPTY_DRAFT: Draft = {
  sex: null,
  birthDate: '',
  heightText: '',
  weightText: '',
  activity: null,
  goal: 'lose',
  targetText: '',
  pace: '0.5',
  targetDate: '',
  confirmAdjustedDate: false,
};

export type DraftField =
  'sex' | 'birthDate' | 'height' | 'weight' | 'activity' | 'target' | 'targetDate';

export type DraftErrors = Partial<Record<DraftField, string>>;

/** Wizard steps, 1-based. */
export type Step = 1 | 2 | 3 | 4;

const { limits } = NUTRITION_CONFIG;

/** Problems with the fields of one step (empty = the step may continue). Messages are Hebrew copy keys. */
export function validateStep(step: Step, draft: Draft, today: LocalDate): { errors: DraftErrors } {
  const errors: DraftErrors = {};

  if (step === 1) {
    if (!draft.sex) errors.sex = 'required';
    if (!isValidLocalDate(draft.birthDate)) {
      errors.birthDate = 'invalid';
    } else {
      const age = ageOn(draft.birthDate, today);
      if (age < limits.age.min) errors.birthDate = 'age_under_18';
      else if (age > limits.age.max) errors.birthDate = 'age_over_100';
    }
  }

  if (step === 2) {
    const height = parseDecimalInput(draft.heightText);
    if (height === null || height < limits.heightCm.min || height > limits.heightCm.max) {
      errors.height = 'height_out_of_range';
    }
    const weight = parseDecimalInput(draft.weightText);
    if (weight === null || weight < limits.weightKg.min || weight > limits.weightKg.max) {
      errors.weight = 'weight_out_of_range';
    }
  }

  if (step === 3) {
    if (!draft.activity) errors.activity = 'required';
    if (draft.goal === 'lose') {
      const target = parseDecimalInput(draft.targetText);
      if (target === null) errors.target = 'invalid';
      if (draft.pace === 'date') {
        if (!isValidLocalDate(draft.targetDate) || draft.targetDate <= today) {
          errors.targetDate = 'target_date_not_in_future';
        }
      }
    }
  }
  return { errors };
}

/** Turns a completed draft into the engine's input, or null while something is still missing. */
export function toPlanInputs(draft: Draft, today: LocalDate): PlanInputs | null {
  const height = parseDecimalInput(draft.heightText);
  const weight = parseDecimalInput(draft.weightText);
  if (!draft.sex || !draft.activity || height === null || weight === null) return null;
  if (!isValidLocalDate(draft.birthDate)) return null;

  const base = {
    sex: draft.sex,
    birthDate: draft.birthDate,
    onDate: today,
    heightCm: height,
    weightKg: weight,
    activity: draft.activity,
    confirmAdjustedDate: draft.confirmAdjustedDate,
  };
  if (draft.goal === 'maintain') return { ...base, goal: { type: 'maintain' } };

  const target = parseDecimalInput(draft.targetText);
  if (target === null) return null;
  if (draft.pace === 'date') {
    if (!isValidLocalDate(draft.targetDate)) return null;
    return {
      ...base,
      goal: {
        type: 'lose',
        targetWeightKg: target,
        request: { mode: 'date', targetDate: draft.targetDate },
      },
    };
  }
  return {
    ...base,
    goal: {
      type: 'lose',
      targetWeightKg: target,
      request: { mode: 'rate', weeklyRateKg: Number(draft.pace) },
    },
  };
}

/** A starting draft from stored inputs (editing the goal later). */
export function draftFromInputs(inputs: PlanInputs): Draft {
  const lose = inputs.goal.type === 'lose';
  const request = inputs.goal.type === 'lose' ? inputs.goal.request : null;
  const pace: Draft['pace'] =
    request?.mode === 'date'
      ? 'date'
      : request?.mode === 'rate' && [0.25, 0.5, 0.75].includes(request.weeklyRateKg)
        ? (String(request.weeklyRateKg) as Draft['pace'])
        : '0.5';
  return {
    sex: inputs.sex,
    birthDate: inputs.birthDate,
    heightText: String(inputs.heightCm),
    weightText: String(inputs.weightKg),
    activity: inputs.activity,
    goal: lose ? 'lose' : 'maintain',
    targetText: inputs.goal.type === 'lose' ? String(inputs.goal.targetWeightKg) : '',
    pace,
    targetDate: request?.mode === 'date' ? request.targetDate : '',
    confirmAdjustedDate: false,
  };
}

/** A sensible default target date (three months out) for the "by date" option. */
export const defaultTargetDate = (today: LocalDate): LocalDate => addDays(today, 90);
