import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { m as motion } from 'framer-motion';
import type { CareerMatchOutcome } from '../../engine/career/matches';
import { CONFIG } from '../../engine/config';
import { format, plural } from '../../i18n/locale';
import { reportCopy as r } from '../../i18n/matchReport';
import { audio } from '../../audio';

/** Level-ups already celebrated in this tab: each is shown once, however often the report is. */
const celebrated = new Set<string>();

/**
 * The level-up as a real moment (release 1.0, step 5.1): a modal card over the report with the
 * new level, the points it brought and the way to spend them. Shown once per level-up; Escape,
 * the close button and a click outside close it, and focus returns where it was. Reduced
 * motion keeps the card and drops the movement.
 */
export function LevelUpMoment({
  outcome,
  progress,
  reduced,
}: {
  outcome: CareerMatchOutcome;
  /** Progress into the new level, when the career is at it. */
  progress: { into: number; needed: number } | null;
  reduced: boolean;
}) {
  const key = `${outcome.record.season}:${outcome.record.fixtureId}:${outcome.previousLevel}`;
  const [open, setOpen] = useState(() => outcome.levelsGained > 0 && !celebrated.has(key));
  // The card animates once the dialog is open: animations started on a closed dialog stall.
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const spend = useRef<HTMLAnchorElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    celebrated.add(key);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    setShown(true);
    audio.play('levelUp');
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, key]);
  // Focus starts on the way to spend the points, once they are drawn.
  useEffect(() => {
    if (shown) spend.current?.focus();
  }, [shown]);
  if (!open) return null;
  const level = outcome.previousLevel + outcome.levelsGained;
  const attribute = outcome.levelsGained * CONFIG.career.attributePointsPerLevel;
  const skill = outcome.levelsGained * CONFIG.career.skillPointsPerLevel;
  const close = () => setOpen(false);
  return (
    <dialog
      ref={ref}
      data-testid="level-up"
      className="match-level-up-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      // Escape closes here and stops, so the shell's Escape shortcut never adds a "back".
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          // Focus stays in the moment: Tab past the last action returns to the first.
          const actions = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
          );
          const first = actions[0];
          const last = actions.at(-1);
          const current = document.activeElement;
          if (event.shiftKey && (current === first || !actions.includes(current as HTMLElement))) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && current === last) {
            event.preventDefault();
            first?.focus();
          }
          return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      {shown && (
        <motion.div
          className="match-level-up-card"
          initial={reduced ? false : { opacity: 0, scale: 0.6, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        >
          <motion.svg
            viewBox="0 0 200 200"
            aria-hidden="true"
            className="match-level-up-burst"
            initial={reduced ? false : { rotate: -30, scale: 0.4, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
          >
            {Array.from({ length: 12 }, (_, ray) => (
              <path
                key={ray}
                d="M100 100L94 4H106Z"
                transform={`rotate(${ray * 30} 100 100)`}
                fill="currentColor"
              />
            ))}
          </motion.svg>
          <motion.span
            className="match-level-up-badge"
            aria-hidden="true"
            initial={reduced ? false : { scale: 0, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1], delay: 0.25 }}
          >
            {level}
          </motion.span>
          {!reduced && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgb(255_255_255/0.5)_50%,transparent_70%)]"
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 1.1, delay: 0.6, ease: 'easeInOut' }}
            />
          )}
          <h2 id={`${id}-title`} className="match-level-up-heading">
            {r.levelUp.title}
          </h2>
          <div id={`${id}-body`} className="relative grid gap-1 text-center">
            <p className="text-lg font-extrabold">{format(r.levelUp.body, { level })}</p>
            <p className="font-bold">{plural(attribute, r.levelUp.attribute)}</p>
            {skill > 0 && <p className="font-bold">{plural(skill, r.levelUp.skill)}</p>}
          </div>
          {progress && progress.needed > 0 && (
            <div className="relative grid gap-1.5">
              <span className="match-level-up-track" aria-hidden="true">
                <span
                  style={{ width: `${Math.min(100, (progress.into / progress.needed) * 100)}%` }}
                />
              </span>
              <span className="text-center text-xs font-bold">
                {format(r.levelUp.next, {
                  into: progress.into,
                  needed: progress.needed,
                  next: level + 1,
                })}
              </span>
            </div>
          )}
          <div className="relative flex flex-wrap justify-center gap-2">
            <Link ref={spend} className="match-level-up-link is-solid" to="/career/profile">
              {r.levelUp.spend}
            </Link>
            {skill > 0 && (
              <Link className="match-level-up-link" to="/career/skills">
                {r.levelUp.skills}
              </Link>
            )}
            <button type="button" className="match-level-up-link" onClick={close}>
              {r.levelUp.close}
            </button>
          </div>
        </motion.div>
      )}
    </dialog>
  );
}
