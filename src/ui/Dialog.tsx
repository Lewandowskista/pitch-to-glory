import { useEffect, useRef } from 'react';
import { t } from '../i18n';
export function Dialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  busy = false,
  danger = false,
}: {
  title: string;
  body: string;
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
      aria-describedby="dialog-body"
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
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-body">{body}</p>
        <div className="dialog-actions">
          <button className="button secondary" onClick={onClose} disabled={busy}>
            {cancelLabel ?? (confirmLabel ? t.app.cancel : t.app.close)}
          </button>
          {onConfirm && (
            <button
              className={`button ${danger ? 'danger' : ''}`}
              onClick={onConfirm}
              disabled={busy}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
