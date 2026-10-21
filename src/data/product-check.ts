import { validateProductInput } from '../core/contracts';
import { type ProductFields } from '../core/food';
import { DataError, type ProductPatch } from './types';

/**
 * Checks a product the way both stores need it (the same rules as the database), and returns the values to keep.
 * Throws DataError('invalid') with the fields that failed.
 */
export function checkedProduct(id: string, input: ProductPatch, version: number): ProductFields {
  const checked = validateProductInput(input);
  if (!checked.ok) {
    throw new DataError('invalid', checked.errors.map((e) => `${e.field}:${e.code}`).join(','));
  }
  const value = checked.value;
  return {
    id,
    name: value.name,
    kcal100: value.kcal100,
    protein100: value.protein100,
    carbs100: value.carbs100,
    fat100: value.fat100,
    sugar100: value.sugar100,
    fiber100: value.fiber100,
    addedSugar100: value.addedSugar100,
    // A value without a source is not kept: the database requires one.
    addedSugarBasis: value.addedSugar100 === null ? null : (input.addedSugarBasis ?? 'user'),
    grain: input.grain,
    basis: input.basis,
    units: value.units,
    version,
  };
}
