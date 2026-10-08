import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { trainingDraftText as text } from '../i18n/trainingDraft';
import { errorText, t } from '../i18n';
import { resumeTrainingAdvance, resolveTrainingAbandonment } from '../store/trainingTransitions';

/** One shell-owned gate covers every operation that can consume pending training intent. */
export function TrainingDraftGuard() {
  const advance = useAppStore((s) => s.trainingAdvance);
  const abandon = useAppStore((s) => s.trainingAbandon);
  const saving = useAppStore((s) => s.trainingSaving);
  const error = useAppStore((s) => s.saveError);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const opened = useRef(false);
  const confirmed = useRef(false);
  const exiting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const kind = abandon ? 'abandon' : advance ? 'advance' : null;
  const value = params.get('training');

  const cancelRequest = () => {
    useAppStore.setState({ trainingAdvance: null });
    resolveTrainingAbandonment(false);
  };
  useEffect(() => {
    // Explicit navigation owns the URL until the gate has left it. Do not replace
    // that destination with the route captured before cancelling the request.
    if (exiting.current) {
      if (!value) exiting.current = false;
      return;
    }
    if (kind && !value) {
      if (opened.current) {
        opened.current = false;
        useAppStore.setState({ trainingAdvance: null });
        resolveTrainingAbandonment(confirmed.current);
        confirmed.current = false;
      } else {
        opened.current = true;
        const next = new URLSearchParams(params);
        next.set('training', kind);
        setParams(next);
      }
    } else if (!kind && value) {
      // A refresh cannot restore an in-memory draft or a queued operation.
      opened.current = false;
      const next = new URLSearchParams(params);
      next.delete('training');
      setParams(next, { replace: true });
    }
  }, [kind, value, params, setParams]);
  useEffect(() => {
    if (!kind || value !== kind) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [kind, value]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!useAppStore.getState().trainingDraft) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      useAppStore.setState({ trainingAdvance: null });
      resolveTrainingAbandonment(false);
    };
  }, []);
  const close = () => {
    exiting.current = true;
    cancelRequest();
    if (opened.current) {
      opened.current = false;
      navigate(-1);
    } else {
      const next = new URLSearchParams(params);
      next.delete('training');
      setParams(next, { replace: true });
    }
  };
  const keepEditing = () => {
    exiting.current = true;
    cancelRequest();
    opened.current = false;
    const slot = useAppStore.getState().activeSave?.slot;
    navigate(`/career/training${slot ? `?save=${slot}` : ''}`, { replace: true });
  };
  const confirmAbandon = () => {
    if (confirmed.current) return;
    confirmed.current = true;
    // Pop this gate before the original save dialog's operation resumes.
    if (opened.current) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete('training');
      setParams(next, { replace: true });
    }
  };
  if (!kind || value !== kind) return null;
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="training-guard-title"
      aria-describedby="training-guard-body"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) close();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (!saving) close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) close();
      }}
    >
      <div className="dialog-inner">
        <h2 id="training-guard-title">
          {kind === 'advance' ? text.advanceTitle : text.abandonTitle}
        </h2>
        <p id="training-guard-body">{kind === 'advance' ? text.advanceBody : text.abandonBody}</p>
        {error && (
          <p role="alert" className="inline-error">
            {errorText(error)}
          </p>
        )}
        <div className="dialog-actions flex-wrap">
          <button className="button secondary" disabled={saving} onClick={keepEditing}>
            {text.keepEditing}
          </button>
          {kind === 'advance' ? (
            <>
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => void resumeTrainingAdvance(false)}
              >
                {text.savedContinue}
              </button>
              <button
                className="button"
                disabled={saving}
                onClick={() => void resumeTrainingAdvance(true)}
              >
                {saving ? t.app.saving : text.saveContinue}
              </button>
            </>
          ) : (
            <button className="button danger" onClick={confirmAbandon}>
              {text.discardContinue}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
