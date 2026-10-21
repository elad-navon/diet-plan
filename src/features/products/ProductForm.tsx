import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import {
  useAddProduct,
  useProductPhoto,
  useSetProductPhoto,
  useUpdateProduct,
} from '../../app/data-hooks';
import { newId } from '../../app/ids';
import { useServices } from '../../app/services';
import { parseDecimalInput, validateProductInput, type InputError } from '../../core/contracts';
import {
  checkLabelValues,
  parseLabel,
  productAddedSugar,
  productFoodId,
  suggestedGrain,
  type LabelField,
  type LabelIssue,
  type UserProduct,
} from '../../core/food';
import { DataError, type NewProduct } from '../../data';
import { dataErrorMessage } from '../../i18n/data-errors';
import { formatDecimal, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { SelectField, TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { labelPhotoDataUrl } from './label-image';

interface ProductFormProps {
  /** The product being edited; absent for a new one. */
  editing?: UserProduct | null;
  /** A new product: the name typed in the search. */
  initialName?: string;
  /** The person's products, to warn about a second one with the same name. */
  products: readonly UserProduct[];
  /** The save button says what happens next ("שמור והוסף לארוחה" from a meal). */
  saveLabel?: string;
  onSaved: (product: UserProduct, extra: { photoFailed: boolean }) => void;
  onCancel: () => void;
}

type NumberField = LabelField;
const NUMBER_FIELDS: readonly NumberField[] = [
  'kcal',
  'protein',
  'carbs',
  'fat',
  'sugar',
  'fiber',
  'addedSugar',
];
type Texts = Record<NumberField, string>;
type Grain = 'none' | 'refined' | 'whole';
interface UnitRow {
  key: string;
  name: string;
  grams: string;
}

const show = (value: number | undefined | null): string =>
  value === undefined || value === null ? '' : String(value);

/** A number field: null when empty, NaN when it is not a number. */
const readNumber = (text: string): number | null =>
  text.trim() === '' ? null : (parseDecimalInput(text) ?? Number.NaN);

/** The fiber typed, when it is a number. */
const readFiber = (text: string): number | null => {
  const value = readNumber(text);
  return value !== null && Number.isFinite(value) ? value : null;
};

function textsOf(product: UserProduct | null | undefined): Texts {
  return {
    kcal: show(product?.kcal100),
    protein: show(product?.protein100),
    carbs: show(product?.carbs100),
    fat: show(product?.fat100),
    sugar: show(product?.sugar100),
    fiber: show(product?.fiber100),
    // An estimate is the app's, not the person's: the field shows only a value from the label or typed.
    addedSugar: product?.addedSugarBasis === 'estimate' ? '' : show(product?.addedSugar100),
  };
}

const sameName = (a: string, b: string): boolean =>
  a.trim().replace(/\s+/g, ' ') === b.trim().replace(/\s+/g, ' ');

/**
 * A product from its nutrition label: a photo of the label (kept with it), the label's text pasted from Google
 * Lens or a shop's page (the values fill in by themselves), a look at the values against the photo, and save.
 */
export function ProductForm({
  editing,
  initialName = '',
  products,
  saveLabel,
  onSaved,
  onCancel,
}: ProductFormProps) {
  const { account } = useServices();
  const addProduct = useAddProduct();
  const updateProduct = useUpdateProduct();
  const setPhotoMutation = useSetProductPhoto();
  const storedPhoto = useProductPhoto(editing?.id ?? null);

  const [productId] = useState(() => editing?.id ?? productFoodId(newId()));
  const [name, setName] = useState(editing?.name ?? initialName);
  const [texts, setTexts] = useState<Texts>(() => textsOf(editing));
  const [basis, setBasis] = useState<'g' | 'ml'>(editing?.basis ?? 'g');
  const [grain, setGrain] = useState<Grain>(
    editing ? (editing.grain ?? 'none') : (suggestedGrain(initialName, null) ?? 'none'),
  );
  const [grainTouched, setGrainTouched] = useState(Boolean(editing));
  const [units, setUnits] = useState<UnitRow[]>(() =>
    (editing?.units ?? []).map((unit) => ({
      key: newId(),
      name: unit.name,
      grams: String(unit.grams),
    })),
  );
  /** Where the added sugar in its field came from: printed on the label, or typed. */
  const [addedFrom, setAddedFrom] = useState<'label' | 'user'>(
    editing?.addedSugarBasis === 'label' ? 'label' : 'user',
  );

  // undefined = keep the stored photo; null = removed; a data URL = new.
  const [newPhoto, setNewPhoto] = useState<string | null | undefined>(undefined);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [bigPhoto, setBigPhoto] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [labelText, setLabelText] = useState('');
  const [doubtful, setDoubtful] = useState<LabelField[]>([]);
  const [issues, setIssues] = useState<LabelIssue[]>([]);
  const [filledCount, setFilledCount] = useState<number | null>(null);
  const [polyols, setPolyols] = useState<number | null>(null);

  const [checked, setChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<InputError['field'] | 'form', string>>>({});
  const [saving, setSaving] = useState(false);

  const photo = newPhoto === undefined ? (storedPhoto.data ?? null) : newPhoto;
  const ml = basis === 'ml';

  function changeName(value: string): void {
    setName(value);
    if (!grainTouched) setGrain(suggestedGrain(value, readFiber(texts.fiber)) ?? 'none');
  }

  function setField(field: NumberField, value: string): void {
    setTexts((current) => ({ ...current, [field]: value }));
    setDoubtful((current) => current.filter((f) => f !== field));
    if (field === 'fiber' && !grainTouched) {
      setGrain(suggestedGrain(name, readFiber(value)) ?? 'none');
    }
    if (field === 'addedSugar') setAddedFrom('user');
  }

  /** The label's text: every value found replaces what is in its field. */
  function readText(text: string): void {
    setLabelText(text);
    if (text.trim() === '') {
      setIssues([]);
      setDoubtful([]);
      setFilledCount(null);
      return;
    }
    const reading = parseLabel(text);
    const found = Object.keys(reading.values).length;
    setTexts((current) => {
      const next = { ...current };
      for (const field of NUMBER_FIELDS) {
        const value = reading.values[field];
        if (value !== undefined) next[field] = String(value);
      }
      return next;
    });
    if (reading.values.addedSugar !== undefined) setAddedFrom('label');
    if (!grainTouched) setGrain(suggestedGrain(name, reading.values.fiber ?? null) ?? 'none');
    if (reading.basis) setBasis(reading.basis);
    if (reading.servingGrams !== null && units.length === 0) {
      setUnits([
        { key: newId(), name: he.products.servingUnit, grams: String(reading.servingGrams) },
      ]);
    }
    setDoubtful(reading.doubtful);
    setIssues(reading.issues);
    setPolyols(reading.polyols);
    setFilledCount(found);
  }

  async function pasteFromClipboard(): Promise<void> {
    try {
      readText(await navigator.clipboard.readText());
    } catch {
      // No permission: pasting into the box by hand still works.
    }
  }

  async function takePhoto(file: Blob | null | undefined): Promise<void> {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(false);
    try {
      setNewPhoto(await labelPhotoDataUrl(file));
    } catch {
      setPhotoError(true);
    } finally {
      setPhotoBusy(false);
    }
  }

  /** Ctrl+V anywhere in the form: a picture becomes the photo, text outside a field becomes the label's text. */
  function onPaste(event: ClipboardEvent<HTMLDivElement>): void {
    const image = [...event.clipboardData.items].find((item) => item.type.startsWith('image/'));
    if (image) {
      event.preventDefault();
      void takePhoto(image.getAsFile());
      return;
    }
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    const text = event.clipboardData.getData('text');
    if (text.trim()) {
      event.preventDefault();
      readText(text);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    const file = [...event.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    void takePhoto(file);
  }

  const numbers = Object.fromEntries(
    NUMBER_FIELDS.map((field) => [field, readNumber(texts[field])]),
  ) as Record<NumberField, number | null>;
  const complete = [numbers.kcal, numbers.protein, numbers.carbs, numbers.fat].every(
    (value) => value !== null && Number.isFinite(value),
  );
  const flags = complete
    ? checkLabelValues(
        {
          kcal: numbers.kcal ?? 0,
          protein: numbers.protein ?? 0,
          carbs: numbers.carbs ?? 0,
          fat: numbers.fat ?? 0,
          sugar: numbers.sugar,
          addedSugar: numbers.addedSugar,
          polyols,
        },
        basis,
      )
    : [];
  const duplicate =
    name.trim() !== '' &&
    products.some((product) => product.id !== productId && sameName(product.name, name));

  async function save(): Promise<void> {
    setSubmitted(true);
    if (saving) return;
    const sugar100 = numbers.sugar;
    const added = productAddedSugar({
      sugar100: sugar100 !== null && Number.isFinite(sugar100) ? sugar100 : null,
      given: numbers.addedSugar,
      givenBasis: addedFrom,
    });
    const input: NewProduct = {
      id: productId,
      name,
      kcal100: numbers.kcal ?? Number.NaN,
      protein100: numbers.protein ?? Number.NaN,
      carbs100: numbers.carbs ?? Number.NaN,
      fat100: numbers.fat ?? Number.NaN,
      sugar100,
      fiber100: numbers.fiber,
      addedSugar100: added.addedSugar100,
      addedSugarBasis: added.addedSugarBasis,
      grain: grain === 'none' ? null : grain,
      basis,
      units: units
        .filter((unit) => unit.name.trim() !== '' || unit.grams.trim() !== '')
        .map((unit) => ({ name: unit.name, grams: readNumber(unit.grams) ?? Number.NaN })),
    };
    const validation = validateProductInput(input);
    const found: typeof errors = {};
    if (!validation.ok) {
      for (const error of validation.errors) found[error.field] ??= he.errors[error.code];
    }
    if (!checked) found.form = he.products.confirmNeeded;
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const { id, ...patch } = input;
      const product = editing
        ? await updateProduct.mutateAsync({ id, baseVersion: editing.version, patch })
        : await addProduct.mutateAsync(input);
      let photoFailed = false;
      if (newPhoto !== undefined) {
        try {
          await setPhotoMutation.mutateAsync({ id: product.id, dataUrl: newPhoto });
        } catch {
          photoFailed = true; // the product itself is saved
        }
      }
      onSaved(product, { photoFailed });
    } catch (error) {
      const code = error instanceof DataError ? error.code : null;
      setErrors({
        form:
          code === 'server' || code === 'invalid' ? he.products.notReady : dataErrorMessage(code),
      });
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (field: InputError['field']): string | undefined =>
    submitted ? errors[field] : undefined;
  const numberField = (field: NumberField, label: string, error?: string) => (
    <div className="space-y-0.5">
      <TextField
        label={label}
        value={texts[field]}
        onChange={(value) => setField(field, value)}
        inputMode="decimal"
        error={error}
        className={doubtful.includes(field) ? 'ring-2 ring-warning' : ''}
      />
      {doubtful.includes(field) && <p className="text-sm font-medium">⚠ {he.products.check}</p>}
    </div>
  );

  return (
    // Dropping or pasting a picture is a shortcut; the photo button is the main path.
    <div
      className="space-y-5"
      onPaste={onPaste}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <TextField
        label={he.products.name}
        value={name}
        onChange={changeName}
        placeholder={he.products.namePlaceholder}
        autoComplete="off"
        maxLength={80}
        error={fieldError('name')}
      />
      {duplicate && <p className="text-sm text-muted">⚠ {he.products.sameName}</p>}

      <section aria-labelledby="photo-title" className="space-y-2">
        <h3 id="photo-title" className="text-lg font-bold">
          {he.products.photoTitle}
        </h3>
        {editing && newPhoto === undefined && storedPhoto.isPending && (
          <p role="status" className="text-sm text-muted">
            {he.products.photoLoading}
          </p>
        )}
        {photo && (
          <div className="space-y-1">
            <img
              src={photo}
              alt={he.products.photoAlt}
              className={`w-full rounded-2xl bg-surface-2 object-contain ${bigPhoto ? 'max-h-[80dvh]' : 'max-h-64'}`}
            />
            <div className="flex flex-wrap gap-1">
              <Button variant="ghost" onClick={() => setBigPhoto((current) => !current)}>
                {bigPhoto ? he.products.photoSmaller : he.products.photoBigger}
              </Button>
              <Button variant="ghost" onClick={() => setNewPhoto(null)}>
                {he.products.photoRemove}
              </Button>
            </div>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            void takePhoto(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button onClick={() => fileInput.current?.click()} disabled={photoBusy}>
          <Icon name="plus" /> {photo ? he.products.photoReplace : he.products.photoPick}
        </Button>
        <p className="text-sm text-muted">{he.products.photoDrop}</p>
        {!account && <p className="text-sm text-muted">{he.products.photoLocal}</p>}
        {photoError && (
          <p role="alert" className="text-sm font-medium">
            ⚠ {he.products.photoError}
          </p>
        )}
      </section>

      <section aria-labelledby="text-title" className="space-y-2">
        <h3 id="text-title" className="text-lg font-bold">
          {he.products.textTitle}
        </h3>
        <details className="rounded-2xl bg-surface-2 px-4 py-1 text-sm">
          <summary className="min-h-11 cursor-pointer py-2 text-base text-accent">
            {he.products.howTo}
          </summary>
          <p className="pb-2">{he.products.howToPhone}</p>
          <p className="pb-2">{he.products.howToComputer}</p>
          <a
            href="https://images.google.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center text-accent underline"
          >
            {he.products.howToLink}
          </a>
        </details>
        <label htmlFor="label-text" className="block text-base font-medium">
          {he.products.textLabel}
        </label>
        <textarea
          id="label-text"
          value={labelText}
          onChange={(event) => readText(event.target.value)}
          rows={4}
          dir="rtl"
          aria-describedby="label-text-hint"
          className="w-full rounded-2xl border border-axis bg-surface-2 px-4 py-3 text-base text-ink"
        />
        <p id="label-text-hint" className="text-sm text-muted">
          {he.products.textHint}
        </p>
        {typeof navigator !== 'undefined' && 'clipboard' in navigator && (
          <Button onClick={() => void pasteFromClipboard()}>{he.products.pasteButton}</Button>
        )}
        <div aria-live="polite" className="space-y-1">
          {filledCount !== null && filledCount > 0 && (
            <p className="text-base">{he.products.filled(filledCount)}</p>
          )}
          {issues.map((issue) => (
            <p key={issue} className="text-sm font-medium">
              ⚠ {he.products.issues[issue]}
            </p>
          ))}
        </div>
      </section>

      <section aria-labelledby="values-title" className="space-y-3">
        <h3 id="values-title" className="text-lg font-bold">
          {he.products.valuesTitle(ml)}
        </h3>
        <SelectField
          label={he.products.basis}
          value={basis}
          onChange={(value) => setBasis(value === 'ml' ? 'ml' : 'g')}
          options={[
            { value: 'g', label: he.products.basisG },
            { value: 'ml', label: he.products.basisMl },
          ]}
        />
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {numberField('kcal', he.products.kcal, fieldError('kcal'))}
          {numberField('protein', he.products.protein)}
          {numberField('carbs', he.products.carbs)}
          {numberField('fat', he.products.fat)}
          {numberField('sugar', he.products.sugar, fieldError('sugar'))}
          {numberField('fiber', he.products.fiber, fieldError('fiber'))}
        </div>
        {fieldError('macros') && <p className="text-sm font-medium">⚠ {fieldError('macros')}</p>}
        <TextField
          label={he.products.addedSugar}
          hint={he.products.addedSugarHint}
          value={texts.addedSugar}
          onChange={(value) => setField('addedSugar', value)}
          inputMode="decimal"
          placeholder={
            numbers.sugar !== null && Number.isFinite(numbers.sugar)
              ? `${formatDecimal(numbers.sugar)} (${he.products.addedSugarEstimate})`
              : undefined
          }
        />
        {polyols !== null && polyols > 0 && (
          <p className="text-sm text-muted">{he.products.polyols(formatDecimal(polyols))}</p>
        )}
        {flags.map((flag) => (
          <p key={flag} className="rounded-xl border border-warning p-2 text-sm">
            ⚠ {he.products.flags[flag]}
          </p>
        ))}
        <SelectField
          label={he.products.grain}
          value={grain}
          onChange={(value) => {
            setGrain(value as Grain);
            setGrainTouched(true);
          }}
          options={[
            { value: 'none', label: he.products.grainNone },
            { value: 'refined', label: he.products.grainRefined },
            { value: 'whole', label: he.products.grainWhole },
          ]}
        />
      </section>

      <section aria-labelledby="units-title" className="space-y-2">
        <h3 id="units-title" className="text-lg font-bold">
          {he.products.unitsTitle}
        </h3>
        <p className="text-sm text-muted">{he.products.unitsHint}</p>
        {units.map((unit) => (
          <div key={unit.key} className="flex items-start gap-2">
            <div className="flex-1">
              <TextField
                label={he.products.unitName}
                value={unit.name}
                maxLength={30}
                onChange={(value) =>
                  setUnits((current) =>
                    current.map((u) => (u.key === unit.key ? { ...u, name: value } : u)),
                  )
                }
              />
            </div>
            <div className="w-32">
              <TextField
                label={he.products.unitGrams(ml)}
                value={unit.grams}
                inputMode="decimal"
                onChange={(value) =>
                  setUnits((current) =>
                    current.map((u) => (u.key === unit.key ? { ...u, grams: value } : u)),
                  )
                }
              />
            </div>
            <Button
              icon
              variant="ghost"
              className="mt-8"
              aria-label={he.products.removeUnit(unit.name)}
              onClick={() => setUnits((current) => current.filter((u) => u.key !== unit.key))}
            >
              <Icon name="close" />
            </Button>
          </div>
        ))}
        {fieldError('units') && <p className="text-sm font-medium">⚠ {fieldError('units')}</p>}
        {units.length < 10 && (
          <Button
            variant="ghost"
            className="-ms-4"
            onClick={() =>
              setUnits((current) => [...current, { key: newId(), name: '', grams: '' }])
            }
          >
            <Icon name="plus" /> {he.products.addUnit}
          </Button>
        )}
      </section>

      <div className="sticky bottom-0 -mx-5 space-y-2 border-t border-faint bg-surface px-5 pb-1 pt-3">
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="size-6 accent-[var(--accent)]"
          />
          {he.products.confirm}
        </label>
        {submitted && errors.form && (
          <p role="alert" className="text-base font-medium">
            {errors.form}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1 justify-center"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? he.products.saving : (saveLabel ?? he.products.save)}
          </Button>
          <Button onClick={onCancel}>{he.cancel}</Button>
        </div>
      </div>
    </div>
  );
}
