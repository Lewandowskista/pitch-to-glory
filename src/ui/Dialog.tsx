import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../i18n';
import { Icon } from './Icon';
import { Button } from './kit/Button';

/**
 * A modal confirmation (Feedback artboard): the title asks the question, the body names the
 * consequence, the way out sits left of the action. Danger dialogs lead with a warning disc and
 * a red action. Escape, Back (URL-driven callers) and a backdrop click close it, except while
 * busy; Escape stops here, so the shell's "go back" shortcut never fires a second time.
 */
export function Dialog({
  title,
  body,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  busy = false,
  danger = false,
}: {
  title: string;
  body?: string;
  /** Extra content under the body (a list, a form field). */
  children?: ReactNode;
  confirmLabel?: string;
  /** The way out without acting; defaults to "Cancel" (or "Close" when there is no action). */
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      aria-describedby={body ? 'dialog-body' : undefined}
      aria-busy={busy || undefined}
      // Escape closes here and stops, so the shell's Escape shortcut never adds a second "back".
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="dialog-inner">
        {danger && (
          <span className="dialog-icon" aria-hidden="true">
            <Icon name="warning" />
          </span>
        )}
        <h2 id="dialog-title">{title}</h2>
        {body && <p id="dialog-body">{body}</p>}
        {children}
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel ?? (confirmLabel ? t.app.cancel : t.app.close)}
          </Button>
          {onConfirm && (
            <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
