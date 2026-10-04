import { useEffect, useId, useRef, useState } from 'react';
import { he } from '../../i18n/he';
import { Icon } from '../../ui/Icon';

interface AddMealMenuProps {
  /** A meal from nothing. */
  onNew: () => void;
  /** A meal that was saved before: opens the list of saved meals. */
  onSaved: () => void;
  /** `button`: the wide button in the header of a computer. `fab`: the round button over a phone's screen. */
  variant: 'button' | 'fab';
}

/** The "add a meal" button: pressing it opens a small list of the two ways to add one. */
export function AddMealMenu({ onNew, onSaved, variant }: AddMealMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Closes on Escape (focus goes back to the button) and on a tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('[data-trigger]')?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  // The button takes focus back first: the window that opens next returns focus to it when it closes.
  function closeMenu(): void {
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>('[data-trigger]')?.focus();
  }
  function chooseNew(): void {
    closeMenu();
    onNew();
  }
  function chooseSaved(): void {
    closeMenu();
    onSaved();
  }

  const fab = variant === 'fab';
  return (
    <div
      ref={root}
      className={
        fab
          ? 'fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] end-4 z-30 lg:hidden'
          : 'relative'
      }
    >
      <button
        type="button"
        data-trigger=""
        aria-expanded={open}
        aria-controls={listId}
        aria-label={fab ? he.today.addMeal : undefined}
        onClick={() => setOpen((current) => !current)}
        className={
          fab
            ? 'flex size-14 items-center justify-center rounded-full [background:var(--toggle-on-bg)] text-[var(--toggle-on-ink)] shadow-[var(--toggle-on-glow)] transition active:scale-95'
            : 'inline-flex min-h-12 items-center gap-2 rounded-full [background:var(--toggle-on-bg)] px-5 text-base font-semibold text-[var(--toggle-on-ink)] shadow-[var(--toggle-on-glow)] transition hover:brightness-110 active:scale-[0.98]'
        }
      >
        <Icon name="plus" size={fab ? 28 : 18} />
        {!fab && he.today.addMeal}
        {!fab && (
          <span className={`transition ${open ? 'rotate-180' : ''}`}>
            <Icon name="chevron-down" size={16} />
          </span>
        )}
      </button>
      {open && (
        <ul
          id={listId}
          className={`absolute z-40 w-52 space-y-1 rounded-2xl bg-[var(--menu-bg)] p-1.5 ring-1 ring-[var(--menu-ring)] [box-shadow:var(--nav-shadow)] ${
            fab ? 'bottom-full end-0 mb-3' : 'end-0 top-full mt-2'
          }`}
        >
          <li>
            <button
              type="button"
              onClick={chooseNew}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-base font-medium hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)]"
            >
              <Icon name="plus" size={20} />
              {he.today.addNewMeal}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={chooseSaved}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-base font-medium hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)]"
            >
              <Icon name="star" size={20} />
              {he.today.addSavedMeal}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
