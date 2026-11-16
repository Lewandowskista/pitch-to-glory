import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import type { KeyMoment } from '../../../model/domain';
import type { MatchSession } from '../../../engine/match/core';
import { reelCardText as r } from '../../../i18n/reelCard';
import { matchText as m, matchFormat } from '../../../i18n/match';
import { careerText as c } from '../../../i18n/career';
import { Factors } from '../Shared';
import { choiceWorth } from '../choices';
import { decisionCard, type CardModel } from './card';
import { currentChain } from './chain';
import { ARROW_COLOURS } from './geometry';

/** Long-press on an option opens "Why?" on it. */
const LONG_PRESS_MS = 500;

/*
 * The decision card (docs/EXPERIENCE-REDESIGN-1.0.md §1.4): the stakes header with its pips,
 * then each option as one button — its number (the key, the arrow, the badge), a verb, the
 * chance of its named outcome, the band and the declared consequence — within 20 words.
 * "Why?" (or a long-press on an option) opens the factors and the value. The card ignores
 * taps for 300 ms after it replaces another (the reel's guard); keys 1–3 choose.
 */
export function DecisionCard({
  card,
  moment,
  traits,
  choicesRef,
  onChoose,
}: {
  card: CardModel;
  moment: KeyMoment;
  traits: readonly string[];
  choicesRef: RefObject<HTMLDivElement>;
  onChoose: (choiceId: string) => void;
}) {
  const id = useId();
  const [why, setWhy] = useState<string | null>(null);
  const whyButton = useRef<HTMLButtonElement>(null);
  const pressTimer = useRef(0);
  const pressed = useRef(false);
  const worth = useMemo(() => choiceWorth(moment.choices), [moment.choices]);
  useEffect(() => setWhy(null), [moment.id]);
  // Escape closes "Why?" first, and returns focus to its button.
  useEffect(() => {
    if (!why) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setWhy(null);
      whyButton.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [why]);
  const shown = why ? card.options.filter((option) => why === 'all' || option.id === why) : [];
  return (
    <section className="reel-card" data-tour="decision" aria-labelledby={`${id}-header`}>
      <div className="reel-card-head">
        <h2 id={`${id}-header`} className="reel-card-header">
          {card.header}
        </h2>
        {card.pips && (
          <span className="reel-pips" role="img" aria-label={matchFormat(r.card.pips, card.pips)}>
            {Array.from({ length: card.pips.steps }, (_, step) => (
              <span key={step} data-on={step < card.pips!.step ? '' : undefined} />
            ))}
          </span>
        )}
      </div>
      <div
        className="reel-options"
        ref={choicesRef}
        role="group"
        aria-label={matchFormat(r.card.choose, { count: card.options.length })}
      >
        {card.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="reel-option"
            data-choice={option.id}
            data-band={option.band}
            data-sound="none"
            aria-keyshortcuts={String(option.number)}
            aria-label={`${option.number}. ${option.label}. ${option.percent}, ${r.card.band[option.band]}${option.risk ? `. ${option.risk.text}` : ''}`}
            onPointerDown={() => {
              pressed.current = false;
              window.clearTimeout(pressTimer.current);
              pressTimer.current = window.setTimeout(() => {
                pressed.current = true;
                setWhy(option.id);
              }, LONG_PRESS_MS);
            }}
            onPointerUp={() => window.clearTimeout(pressTimer.current)}
            onPointerLeave={() => window.clearTimeout(pressTimer.current)}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => {
              if (pressed.current) {
                pressed.current = false;
                return;
              }
              onChoose(option.id);
            }}
          >
            <kbd
              className="reel-option-key"
              style={{ background: ARROW_COLOURS[(option.number - 1) % ARROW_COLOURS.length] }}
              aria-hidden="true"
            >
              {option.number}
            </kbd>
            <span className="reel-option-verb" aria-hidden="true">
              {option.verb}
            </span>
            <span className="reel-option-odds" aria-hidden="true">
              <strong>{option.percent}</strong>
              <span className="reel-band" data-band={option.band}>
                {r.card.band[option.band]}
              </span>
            </span>
            {option.risk && (
              <span className="reel-option-risk" aria-hidden="true">
                {option.risk.text}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="reel-card-foot">
        <button
          ref={whyButton}
          type="button"
          className="reel-why"
          aria-expanded={Boolean(why)}
          aria-controls={`${id}-why`}
          onClick={() => setWhy(why ? null : 'all')}
        >
          {r.card.why}
        </button>
      </div>
      {why && (
        <div id={`${id}-why`} className="reel-why-panel" role="region" aria-label={r.card.whyTitle}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="reel-why-title">{r.card.whyTitle}</h3>
            <button
              type="button"
              className="reel-why-close"
              onClick={() => {
                setWhy(null);
                whyButton.current?.focus({ preventScroll: true });
              }}
            >
              {r.card.whyClose}
            </button>
          </div>
          {shown.map((option) => {
            const value = worth.get(option.id);
            const trait =
              option.choice.traitId && traits.includes(option.choice.traitId)
                ? (c.skillNames[option.choice.traitId] ??
                  m.traits[option.choice.traitId] ??
                  option.choice.traitId)
                : null;
            return (
              <div key={option.id} className="reel-why-option">
                <p className="reel-why-label">
                  <kbd aria-hidden="true">{option.number}</kbd> {option.label}
                  {trait && (
                    <span className="reel-why-skill">
                      {matchFormat(r.card.skill, { skill: trait })}
                    </span>
                  )}
                </p>
                <Factors factors={option.choice.factors} total={option.choice.probability} />
                {value && (
                  <p className="reel-why-value">
                    <span className="match-value-pill" data-value={value.value}>
                      {m.ui.value[value.value]}
                    </span>{' '}
                    {matchFormat(m.ui.valueLine, {
                      net: value.net.toFixed(3),
                      for: value.for.toFixed(3),
                      against: value.against.toFixed(3),
                      best: value.best.toFixed(3),
                    })}
                  </p>
                )}
              </div>
            );
          })}
          <p className="reel-why-note">
            {matchFormat(r.card.whyFoot, { count: card.options.length })}
          </p>
        </div>
      )}
      <div data-tour-slot="decision" />
    </section>
  );
}

/** "88′ · 1–1 · …": the card's header for screen readers, with its choices. */
export function cardAnnouncement(card: CardModel): string {
  return matchFormat(r.card.announce, {
    header: card.header,
    count: card.options.length,
    choices: card.options
      .map((option) =>
        matchFormat(r.card.announceChoice, {
          number: option.number,
          verb: option.verb,
          percent: option.percent,
        }),
      )
      .join('; '),
  });
}

/**
 * The card for the current step (loaded with the card, apart from the reel's first load): its
 * model from the chain and the shown score, announced once per step.
 */
export default function DecisionStep({
  session,
  score,
  choicesRef,
  onChoose,
  announce,
}: {
  session: MatchSession;
  score: readonly [number, number];
  choicesRef: RefObject<HTMLDivElement>;
  onChoose: (choiceId: string) => void;
  announce: (text: string) => void;
}) {
  const moment = session.state.currentMoment;
  const card = useMemo(
    () => (moment ? decisionCard(currentChain(session), moment, score) : null),
    // The card follows its step, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [moment?.id],
  );
  useEffect(() => {
    if (!card) return;
    announce(cardAnnouncement(card));
    // A new card: focus on its first choice, the card and its clip in view.
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      (focused.matches('input:not([type="checkbox"]),select,textarea') || focused.isContentEditable)
    )
      return;
    const first = choicesRef.current?.querySelector<HTMLButtonElement>('button[data-choice]');
    first?.focus({ preventScroll: true });
    first?.closest('.reel-card')?.scrollIntoView({ block: 'nearest' });
  }, [card, announce, choicesRef]);
  if (!card || !moment) return null;
  const setup = session.setup;
  return (
    <DecisionCard
      card={card}
      moment={moment}
      traits={setup.players[setup.selectedPlayerId]!.traits}
      choicesRef={choicesRef}
      onChoose={onChoose}
    />
  );
}
