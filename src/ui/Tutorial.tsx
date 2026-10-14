import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m, useReducedMotion } from 'framer-motion';
import { useAppStore } from '../store';
import { format } from '../i18n';
import { tutorialText as tt } from '../i18n/tutorial';
import { Icon } from './Icon';
import { Button } from './kit/Button';

export interface TutorialStep {
  /** Matches a `data-tour` attribute on the element the step points at. */
  target: string;
  title: string;
  body: string;
  /** False while the step does not apply yet (for example, before the first key moment). */
  when?: boolean;
  /** The step asks the player to act; it advances once `done` turns true. */
  action?: boolean;
  done?: boolean;
}

/**
 * A short guided tour (AGENTS.md §11): a card beside a highlighted part of the screen, with
 * Back, Next and Skip. Steps that ask for an action wait for it. Finishing or skipping a
 * track records it in the settings, so it shows once per device until replayed from
 * Settings. Non-modal: the page stays usable, and Escape skips the tour.
 *
 * On phones a step that asks for an action sits in the page, in the target's
 * `data-tour-slot`, so it never covers what the player has to press. Elsewhere the card floats
 * beside its target and moves rather than cover the focused control.
 */
const PHONE = '(max-width: 700px)';
type Box = { top: number; left: number; bottom: number; right: number };
const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
export function Tutorial({
  track,
  steps,
  enabled,
}: {
  track: 'week' | 'match';
  steps: TutorialStep[];
  enabled: boolean;
}) {
  const seen = useAppStore((s) => s.settings.tutorial[track]);
  const update = useAppStore((s) => s.updateSettings);
  const reduced = useReducedMotion() || useAppStore.getState().settings.reducedMotion;
  const [index, setIndex] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | 'sheet' | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // The cut-out in the dimming: the target's box plus a margin, in viewport coordinates.
  const [hole, setHole] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const active = enabled && !seen;
  const step = steps[index];
  const applies = step && step.when !== false;
  const finish = () => {
    const current = useAppStore.getState().settings.tutorial;
    const done = { week: current.week, match: current.match, [track]: true };
    // A replay ends once both tracks have been seen again.
    update({ tutorial: done.week && done.match ? done : { ...current, [track]: true } });
  };

  // Skip steps that no longer apply, and move on once an action step is done.
  useEffect(() => {
    if (!active || !step) return;
    if (step.action && step.done) {
      if (index === steps.length - 1) finish();
      else setIndex(index + 1);
      return;
    }
    if (!applies) {
      const later = steps.findIndex((s, i) => i > index && s.when !== false);
      if (later > index) setIndex(later);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven by the step state
  }, [active, index, applies, step?.done]);

  // Highlight the target, bring it into view and place the card beside it.
  useLayoutEffect(() => {
    if (!active || !applies || !step) return;
    // The first match that is on screen: a target can exist twice, as the sidebar on desktop
    // and the bottom bar on phones.
    const target = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`),
    ).find((element) => element.getClientRects().length > 0);
    target?.setAttribute('data-tour-active', '');
    const inline =
      step.action && window.matchMedia(PHONE).matches
        ? document.querySelector<HTMLElement>(`[data-tour-slot="${step.target}"]`)
        : null;
    setSlot(inline);
    // Scroll only as far as needed (the screen may already have placed the target in view),
    // and at once, so the card is never moving under the pointer when it is clicked.
    if (!inline) target?.scrollIntoView({ block: 'nearest' });
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = card.current;
        // No dimming for a card that sits in the page: it would be dimmed with the page.
        if (inline || !target) setHole(null);
        else {
          const r = target.getBoundingClientRect();
          setHole({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
        }
        if (!box || inline) return;
        if (window.innerWidth < 640 || !target) return setPosition('sheet');
        const rect = target.getBoundingClientRect();
        const height = box.offsetHeight;
        const width = box.offsetWidth;
        const fits = (top: number, left: number) =>
          top >= 16 &&
          left >= 16 &&
          top + height <= window.innerHeight - 16 &&
          left + width <= window.innerWidth - 16;
        const along = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
        const level = Math.min(Math.max(16, rect.top), window.innerHeight - height - 16);
        const low = window.innerHeight - height - 16;
        // Below, above, then beside the target: low first (beside a tall key moment that is
        // over the match controls, paused meanwhile, rather than the pitch), then level with
        // it. Never over the control that has focus (the card's own buttons excepted, or it
        // would move from under a click).
        const active = document.activeElement;
        const focused =
          active && active !== document.body && !box.contains(active)
            ? active.getBoundingClientRect()
            : undefined;
        const candidates = [
          { top: rect.bottom + 12, left: along },
          { top: rect.top - height - 12, left: along },
          { top: low, left: rect.left - width - 12 },
          { top: low, left: rect.right + 12 },
          { top: level, left: rect.left - width - 12 },
          { top: level, left: rect.right + 12 },
        ];
        const clear = (spot: { top: number; left: number }) =>
          !focused ||
          !overlaps({ ...spot, bottom: spot.top + height, right: spot.left + width }, focused);
        const chosen = candidates.find((spot) => fits(spot.top, spot.left) && clear(spot)) ?? {
          top: Math.max(16, window.innerHeight - height - 16),
          left: along,
        };
        setPosition(chosen);
      });
    };
    place();
    // Focus moving within the card (pressing its own buttons) never moves it from under the
    // pointer; focus elsewhere may have to.
    const focusin = (event: FocusEvent) => {
      if (!card.current?.contains(event.target as Node)) place();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('focusin', focusin);
    return () => {
      cancelAnimationFrame(frame);
      target?.removeAttribute('data-tour-active');
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('focusin', focusin);
    };
  }, [active, applies, step?.target, index, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reading steps take focus so keyboard and screen-reader users start there; action steps
  // leave focus on the page, where the action is.
  const placed = position !== null || slot !== null;
  useEffect(() => {
    if (active && applies && placed && step && !step.action)
      heading.current?.focus({ preventScroll: true });
  }, [active, applies, index, placed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape skips the tour rather than navigating back.
  useEffect(() => {
    if (!active || !applies) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [active, applies]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active || !applies || !step) return null;
  const last = index === steps.length - 1;
  const style =
    slot || position === 'sheet' || position === null
      ? undefined
      : { top: `${position.top}px`, left: `${position.left}px` };
  const layout = slot
    ? 'mt-4 w-full'
    : `fixed z-40 w-[min(23rem,calc(100vw-2rem))] shadow-overlay ${
        position === 'sheet' || position === null
          ? 'inset-x-4 bottom-[calc(var(--tabbar)+1rem)] mx-auto sm:bottom-6'
          : ''
      } ${position === null ? 'invisible' : ''}`;
  return (
    <>
      {hole &&
        createPortal(
          // Dims the page around the target. It never takes a click: the tour is non-modal,
          // and action steps need the target (and the rest of the page) to stay usable.
          <div
            aria-hidden="true"
            className="tour-spotlight"
            style={{
              top: `${hole.top}px`,
              left: `${hole.left}px`,
              width: `${hole.width}px`,
              height: `${hole.height}px`,
            }}
          />,
          document.body,
        )}
      {createPortal(
        <m.div
          ref={card}
          role="dialog"
          aria-modal="false"
          aria-labelledby="tutorial-title"
          aria-describedby="tutorial-body"
          data-testid="tutorial"
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          key={index}
          style={style}
          className={`grid gap-3 rounded-panel border-2 border-accent bg-surface p-5 text-ink ${layout}`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
              {tt.label} · {format(tt.progress, { step: index + 1, total: steps.length })}
            </p>
            <span aria-hidden="true" className="flex shrink-0 gap-1">
              {steps.map((_, dot) => (
                <span
                  key={dot}
                  className={`h-1.5 rounded-full ${
                    dot === index
                      ? 'w-4 bg-accent'
                      : dot < index
                        ? 'w-1.5 bg-accent/45'
                        : 'w-1.5 bg-line'
                  }`}
                />
              ))}
            </span>
          </div>
          <h2
            id="tutorial-title"
            ref={heading}
            tabIndex={-1}
            className="font-display text-[1.75rem] leading-none font-normal outline-none"
          >
            {step.title}
          </h2>
          <p id="tutorial-body" className="text-sm" aria-live={step.action ? 'polite' : undefined}>
            {step.body}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {step.action ? (
              <p className="flex items-center gap-2 text-xs font-bold text-muted">
                <span
                  aria-hidden="true"
                  className="grid h-[1.375rem] w-[1.375rem] place-items-center rounded-full bg-art-gold text-gold-ink"
                >
                  <Icon name="arrow" className="h-3 w-3" />
                </span>
                {tt.waiting}
              </p>
            ) : (
              <Button onClick={() => (last ? finish() : setIndex(index + 1))}>
                {last ? tt.done : tt.next}
              </Button>
            )}
            {index > 0 && !step.action && (
              <Button variant="secondary" onClick={() => setIndex(index - 1)}>
                {tt.back}
              </Button>
            )}
            <Button variant="text" className="ml-auto px-2" onClick={finish}>
              {tt.skip}
            </Button>
          </div>
        </m.div>,
        slot ?? document.body,
      )}
    </>
  );
}
