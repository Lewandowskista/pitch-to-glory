import { useEffect, useRef } from 'react';
import { t } from '../i18n';
export function Dialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  busy = false,
  danger = false,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
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
            {confirmLabel ? t.saves.cancel : t.app.close}
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
