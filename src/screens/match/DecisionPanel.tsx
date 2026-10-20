import { useMemo, type CSSProperties, type RefObject } from 'react';
import type { BookingRisk, DecisionChoice, KeyMoment, ProbabilityFactor } from '../../model/domain';
import { cx } from '../../ui/kit';
import type { MatchSession } from '../../engine/match';
import { t } from '../../i18n';
import {
  matchText as m,
  matchLabel,
  matchFormat,
  pressureText,
  situationText,
} from '../../i18n/match';
import { careerText as c } from '../../i18n/career';
import { Factors, signedPercent, strongest } from './Shared';
import { TacticalCam } from './TacticalCam';
import { shirtNumbers } from './pitchArt';
import { COMPACT_ASPECT, focusFrames, momentCamera, replayIds, type CastMember } from './cam';

const u = m.ui;
const percent = (value: number) => (value * 100).toFixed(value < 0.1 ? 1 : 0);
const attributeName = (name: string) =>
  t.world.attributes[name as keyof typeof t.world.attributes] ?? name;

export type ChoiceQuality = 'strong' | 'safe' | 'good' | 'risky';
/** How a choice reads at a glance; the pill writes it, the colour only repeats it. */
export function choiceQuality(choice: DecisionChoice, traits: readonly string[]): ChoiceQuality {
  if (choice.traitId && traits.includes(choice.traitId)) return 'strong';
  if (choice.probability >= 0.65) return 'safe';
  if (choice.probability >= 0.45) return 'good';
  return 'risky';
}
/** The one factor that moved this choice most, as "Opposition quality −5.0%". */
function reasonOf(factors: ProbabilityFactor[]): string {
  const up = strongest(factors, 1);
  const down = strongest(factors, -1);
  const top =
    up && down
      ? Math.abs(up.contribution) >= Math.abs(down.contribution)
        ? up
        : down
      : (up ?? down);
  return top ? `${matchLabel(top.labelKey)} ${signedPercent(top.contribution)}` : '';
}

/** What each outcome leads to, so the player sees the risk as well as the chance. */
function ChoiceHint({
  choice,
  id,
  traits,
}: {
  choice: DecisionChoice;
  id: string;
  traits: string[];
}) {
  const { stakes } = choice;
  return (
    <p className="match-choice-hint" id={id}>
      <span>
        {matchFormat(m.uses, {
          attributes: choice.attributes.slice(0, 2).map(attributeName).join(', '),
        })}
      </span>
      {stakes.successGoal > 0 && (
        <span>
          {stakes.successGoal === 1
            ? m.stakeScore
            : matchFormat(m.stakeGoal, { percent: percent(stakes.successGoal) })}
        </span>
      )}
      <span>
        {stakes.failureConcede === 1
          ? m.stakeConcedeDirect
          : stakes.failureConcede > 0
            ? matchFormat(m.stakeConcede, { percent: percent(stakes.failureConcede) })
            : m.stakeSafe}
      </span>
      {choice.booking && (
        // A defending choice's booking risk (match-16): a red once already booked.
        <span className="match-booking-risk">
          <span
            className={cx('match-card-chip', choice.booking.booked && 'is-red')}
            aria-hidden="true"
          />
          {/* Any card if not yet booked; once booked, every card is a red. */}
          {matchFormat(choice.booking.booked ? u.redRisk : u.bookingRisk, {
            chance: percent(choice.booking.yellow + choice.booking.red),
          })}
        </span>
      )}
      {choice.traitId && traits.includes(choice.traitId) && (
        <span className="match-tag">
          {matchFormat(m.traitActive, {
            trait: c.skillNames[choice.traitId] ?? m.traits[choice.traitId] ?? choice.traitId,
          })}
        </span>
      )}
    </p>
  );
}

/**
 * A defending choice's booking risk in the breakdown (match-16): the foul chance of a failed
 * attempt with the factors that build it, then what it means overall.
 */
function BookingBreakdown({ booking }: { booking: BookingRisk }) {
  return (
    <div className="match-booking">
      <h4 className="match-factors-title">{u.bookingTitle}</h4>
      <Factors factors={booking.factors} total={booking.foul} totalLabel={u.foulChance} />
      <p className="match-card-note">
        {matchFormat(booking.booked ? u.bookingLineBooked : u.bookingLine, {
          foul: percent(booking.foul),
          straight: percent(booking.straight),
          yellow: percent(booking.yellow),
          red: percent(booking.red),
        })}
      </p>
    </div>
  );
}

/**
 * The decision as it happened, in the moment's camera: the outcome passage's focus keyframes,
 * with everyone who touched the ball in them added to the moment's cast.
 */
export function DecisionReplay({
  session,
  moment,
  compact,
  reducedMotion,
}: {
  session: MatchSession;
  moment: KeyMoment;
  compact: boolean;
  reducedMotion: boolean;
}) {
  const { setup, state } = session;
  const cam = useMemo(
    () => momentCamera(setup, moment, compact ? COMPACT_ASPECT : undefined),
    [setup, moment, compact],
  );
  const frames = useMemo(
    () => (state.motion.kind === 'outcome' ? focusFrames(state.motion) : null),
    [state.motion],
  );
  const cast = useMemo(() => {
    const ids = new Set(cam.cast.map((member) => member.id));
    const own = new Set(
      (setup.home.playerIds.includes(setup.selectedPlayerId) ? setup.home : setup.away).playerIds,
    );
    const extra: CastMember[] = (frames ? replayIds(frames) : [])
      .filter((id) => !ids.has(id))
      .map((id) => ({
        id,
        own: own.has(id),
        role:
          setup.players[id]?.primaryPosition === 'GK'
            ? 'keeper'
            : own.has(id)
              ? 'teammate'
              : 'opponent',
      }));
    return [...cam.cast, ...extra];
  }, [cam.cast, frames, setup]);
  const numbers = useMemo(() => shirtNumbers(setup.players), [setup.players]);
  if (!frames) return null;
  return (
    <div className="match-panel match-pitch-panel match-replay">
      <div className="match-situation">
        <TacticalCam
          setup={setup}
          frame={moment.frame}
          replay={frames}
          cast={cast}
          window={cam.window}
          attacksRight={cam.attacksRight}
          view="replay"
          numbers={numbers}
          reducedMotion={reducedMotion}
          compact={compact}
        />
      </div>
    </div>
  );
}

/**
 * A key moment (redesign phase 5b): the tactical camera on the third where the play is, the
 * situation, a reminder that nothing counts down, then two to four choices with their number
 * key, chance, a quality pill, the factor that moved them most, what success and failure lead
 * to, and every factor on request.
 */
export function DecisionPanel({
  session,
  choicesRef,
  camera,
  compact,
  reducedMotion,
  onChoose,
}: {
  session: MatchSession;
  choicesRef: RefObject<HTMLDivElement>;
  /** Draw the tactical camera (not in simulation-only mode). */
  camera: boolean;
  /** Phones: the wider crop and stacked choices. */
  compact: boolean;
  reducedMotion: boolean;
  onChoose: (choiceId: string) => void;
}) {
  const state = session.state;
  const moment = state.currentMoment!;
  const traits = session.setup.players[session.setup.selectedPlayerId]!.traits;
  const situation = situationText(moment);
  const pressure = pressureText(moment);
  const cam = useMemo(
    () => momentCamera(session.setup, moment, compact ? COMPACT_ASPECT : undefined),
    [session.setup, moment, compact],
  );
  const numbers = useMemo(() => shirtNumbers(session.setup.players), [session.setup.players]);
  return (
    <section
      className={`match-panel match-decision${camera ? ' match-pitch-panel' : ''}`}
      data-tour="decision"
      aria-labelledby="decision-heading"
    >
      {camera && (
        <div className="match-situation">
          <TacticalCam
            setup={session.setup}
            frame={moment.frame}
            cast={cam.cast}
            arrows={cam.arrows}
            window={cam.window}
            attacksRight={cam.attacksRight}
            view={cam.window.zone}
            numbers={numbers}
            reducedMotion={reducedMotion}
            compact={compact}
          />
        </div>
      )}
      <div className="match-decision-body">
        <div className="match-decision-head">
          <div className="min-w-0 flex-1">
            <span className="match-eyebrow match-moment-chip">
              {matchFormat(u.momentChip, { minute: moment.minute })} ·{' '}
              <span className="sr-only">{m.score}: </span>
              {state.match.score[0]}–{state.match.score[1]}
            </span>
            {pressure && <p className="match-pressure">{pressure}</p>}
            <h2 id="decision-heading">{situation}</h2>
          </div>
          <p className="match-paused-note">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 4H10V20H6ZM14 4H18V20H14Z" fill="currentColor" />
            </svg>
            <span>
              <strong>{u.paused}</strong> · {u.takeYourTime}
            </span>
          </p>
        </div>
        <div
          className="match-choices"
          ref={choicesRef}
          role="group"
          aria-label={u.choose}
          style={{ '--choices': moment.choices.length } as CSSProperties}
        >
          {moment.choices.map((choice, index) => {
            const quality = choiceQuality(choice, traits);
            const chance = Math.round(choice.probability * 100);
            return (
              <div className="match-choice" key={choice.id} data-quality={quality}>
                <button
                  data-choice={choice.id}
                  data-sound="none"
                  aria-describedby={`choice-hint-${choice.id}`}
                  onClick={() => onChoose(choice.id)}
                >
                  <span className="match-choice-top">
                    <kbd className="match-choice-number">{index + 1}</kbd>
                    <span className="match-choice-chance">
                      {chance}%<span className="sr-only"> {m.ui.successChance}</span>
                    </span>
                  </span>
                  <strong>{matchLabel(choice.labelKey)}</strong>
                  <span className="match-choice-reason">
                    <span className="match-quality">{u.quality[quality]}</span>
                    {reasonOf(choice.factors) && <span>{reasonOf(choice.factors)}</span>}
                  </span>
                  <span className="match-choice-bar" aria-hidden="true">
                    <span style={{ width: `${chance}%` }} />
                  </span>
                </button>
                <ChoiceHint choice={choice} id={`choice-hint-${choice.id}`} traits={traits} />
                <details
                  onKeyDown={(event) => {
                    // Escape closes an open breakdown first, before it means "back".
                    const details = event.currentTarget;
                    if (event.key !== 'Escape' || !details.open) return;
                    event.preventDefault();
                    event.stopPropagation();
                    details.open = false;
                    details.parentElement?.querySelector<HTMLButtonElement>('button')?.focus();
                  }}
                >
                  <summary>{m.transparency}</summary>
                  <Factors factors={choice.factors} total={choice.probability} />
                  {choice.booking && <BookingBreakdown booking={choice.booking} />}
                  <p className="match-esc-note">{u.escNote}</p>
                </details>
              </div>
            );
          })}
        </div>
      </div>
      {/* On phones the tour's key-moment step appears here, after the choices it explains. */}
      <div data-tour-slot="decision" />
    </section>
  );
}
