import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { m as motion } from 'framer-motion';
import type { CareerMatchOutcome } from '../../engine/career/matches';
import { format, plural } from '../../i18n/locale';
import { reportCopy as r } from '../../i18n/matchReport';
import { platform } from '../../platform';
import { audio } from '../../audio';

/** Level-ups this device has shown, kept so a reopened app never shows one again. */
const SEEN_LIMIT = 30;
function seenLevelUps(): string[] {
  const stored = platform.readPreferences('match') as { levelUps?: unknown } | null;
  return Array.isArray(stored?.levelUps)
    ? stored.levelUps.filter((key): key is string => typeof key === 'string')
    : [];
}
/** Whether this level-up has been shown on this device (after a refresh or a reopen too). */
export const levelUpSeen = (key: string) => seenLevelUps().includes(key);
/** Remember a level-up as shown on this device. */
export function rememberLevelUp(key: string): void {
  const stored = platform.readPreferences('match');
  const base = stored && typeof stored === 'object' ? stored : {};
  const levelUps = [...seenLevelUps().filter((entry) => entry !== key), key].slice(-SEEN_LIMIT);
  platform.writePreferences({ ...base, levelUps }, 'match');
}
/** The key a level-up is remembered by: the match and the level it started from. */
export const levelUpKey = (outcome: CareerMatchOutcome) =>
  `${outcome.record.season}:${outcome.record.fixtureId}:${outcome.previousLevel}`;

/**
 * The level-up as a real moment (release 1.0, step 5.1): a card over the report with the new
 * level, the points still to spend and the way to spend them. Shown once per level-up on this
 * device, remembered across reopening the app (release 1.0, X1b: it came back after a reopen,
 * still offering points already spent). It is not modal, so the report's sticky bar under it
 * stays live; Escape and the close button close it, and focus returns where it was. Reduced
 * motion keeps the card and drops the movement.
 */
export function LevelUpMoment({
  outcome,
  progress,
  points,
  skillPoints,
  reduced,
}: {
  outcome: CareerMatchOutcome;
  /** Progress into the new level, when the career is at it. */
  progress: { into: number; needed: number } | null;
  /** Attribute and skill points the career has left to spend now. */
  points: number;
  skillPoints: number;
  reduced: boolean;
}) {
  const key = levelUpKey(outcome);
  const [open, setOpen] = useState(() => outcome.levelsGained > 0 && !levelUpSeen(key));
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    rememberLevelUp(key);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.show();
    setShown(true);
    audio.play('levelUp');
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, key]);
  useEffect(() => {
    if (shown) first.current?.focus();
  }, [shown]);
  if (!open) return null;
  const level = outcome.previousLevel + outcome.levelsGained;
  const close = () => setOpen(false);
  return (
    <dialog
      ref={ref}
      data-testid="level-up"
      className="match-level-up-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          // Focus moves through the card's actions in order, wrapping at either end.
          const actions = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
          );
          if (actions.length === 0) return;
          event.preventDefault();
          const index = actions.indexOf(document.activeElement as HTMLElement);
          const step = event.shiftKey ? -1 : 1;
          const next = index < 0 ? (step > 0 ? 0 : actions.length - 1) : index + step;
          actions[(next + actions.length) % actions.length]!.focus();
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
            {/* Only what is still there to spend: never points already spent. */}
            {points > 0 && <p className="font-bold">{plural(points, r.levelUp.attribute)}</p>}
            {skillPoints > 0 && <p className="font-bold">{plural(skillPoints, r.levelUp.skill)}</p>}
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
            {points > 0 && (
              <Link
                ref={(node) => {
                  if (node) first.current = node;
                }}
                className="match-level-up-link is-solid"
                to="/career/profile"
              >
                {r.levelUp.spend}
              </Link>
            )}
            {skillPoints > 0 && (
              <Link
                ref={(node) => {
                  if (node && !points) first.current = node;
                }}
                className="match-level-up-link"
                to="/career/skills"
              >
                {r.levelUp.skills}
              </Link>
            )}
            <button
              type="button"
              ref={(node) => {
                if (node && !points && !skillPoints) first.current = node;
              }}
              className="match-level-up-link"
              onClick={close}
            >
              {r.levelUp.close}
            </button>
          </div>
        </motion.div>
      )}
    </dialog>
  );
}
