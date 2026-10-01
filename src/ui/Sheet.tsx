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
}

/**
 * A modal bottom sheet on the native <dialog>: the browser traps focus, closes on Esc, marks the rest
 * of the page inert and returns focus to the control that opened it (docs/TEST_PLAN.md A11Y-02).
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
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
          if (event.target === ref.current) onClose();
        }}
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-xl overflow-hidden rounded-t-3xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 open:flex open:flex-col sm:m-auto sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-faint px-5 py-3">
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          <Button icon variant="ghost" onClick={onClose} aria-label={he.close}>
            <Icon name="close" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {open && children}
        </div>
        {footer && (
          <div className="border-t border-faint px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </dialog>
    </>
  );
}
