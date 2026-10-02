import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { he } from '../i18n/he';
import { Button } from './Button';
import { Icon } from './Icon';

/** How long taps are swallowed right after a sheet closes. */
const CLICK_SHIELD_MS = 350;

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** A tap outside the sheet closes it (default). Turn off for a form, where a stray click would hide the work. */
  dismissOnBackdrop?: boolean;
}

/**
 * A modal bottom sheet on the native <dialog>: the browser traps focus, closes on Esc, marks the rest
 * of the page inert and returns focus to the control that opened it (docs/TEST_PLAN.md A11Y-02).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [shielded, setShielded] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Raise the shield in the very render that closes the sheet (not in an effect after it): a second tap
  // meant for the closed sheet's button must not land on whatever is underneath, e.g. the bottom navigation.
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setShielded(true);
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!shielded) return;
    const timer = setTimeout(() => setShielded(false), CLICK_SHIELD_MS);
    return () => clearTimeout(timer);
  }, [shielded]);

  return (
    <>
      {shielded && <div aria-hidden="true" className="fixed inset-0 z-[100]" />}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- a backdrop tap is a mouse/touch shortcut; Esc and the close button are the keyboard paths */}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={onClose}
        onClick={(event) => {
          if (dismissOnBackdrop && event.target === ref.current) onClose();
        }}
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-xl overflow-hidden rounded-t-[2rem] bg-surface p-0 text-ink shadow-2xl open:flex open:flex-col sm:m-auto sm:rounded-[2rem]"
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-faint" />
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-2">
          <h2 id={titleId} className="text-2xl font-bold">
            {title}
          </h2>
          <Button icon variant="ghost" onClick={onClose} aria-label={he.close}>
            <Icon name="close" />
          </Button>
        </div>
        {/* scroll-pb: a field focused or scrolled to clears the sticky save bar some forms end with. */}
        <div className="min-h-0 flex-1 scroll-pb-24 overflow-y-auto overscroll-contain px-5 py-4">
          {open && children}
        </div>
        {footer && (
          <div className="border-t border-faint bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </dialog>
    </>
  );
}
