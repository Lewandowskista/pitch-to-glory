import type { RefObject } from 'react';
import type { DecisionChoice, KeyMoment } from '../../model/domain';
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
import { Factors } from './Shared';
import { SvgPitch } from './SvgPitch';

const percent = (value: number) => (value * 100).toFixed(value < 0.1 ? 1 : 0);
const attributeName = (name: string) =>
  t.world.attributes[name as keyof typeof t.world.attributes] ?? name;

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

/** Width of the preview's crop of the 116 × 80 pitch drawing, and its aspect ratio. */
const CROP_WIDTH = 64;
const CROP_ASPECT = 2.4;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
/** The part of the pitch around the ball when the moment opened. */
function situationViewBox(moment: KeyMoment): string {
  const height = CROP_WIDTH / CROP_ASPECT;
  const x = clamp(8 + moment.frame.ball.x - CROP_WIDTH / 2, 0, 116 - CROP_WIDTH);
  const y = clamp(8 + moment.frame.ball.y * 0.64 - height / 2, 0, 80 - height);
  return `${x.toFixed(2)} ${y.toFixed(2)} ${CROP_WIDTH} ${height.toFixed(2)}`;
}

/**
 * A key moment: the situation, its choices with their chance, what success and failure lead
 * to, and the full factor breakdown on request. On phones it opens with a compact drawing of
 * the situation, so the football context and the first action are on screen together.
 */
export function DecisionPanel({
  session,
  choicesRef,
  preview,
  onChoose,
}: {
  session: MatchSession;
  choicesRef: RefObject<HTMLDivElement>;
  /** Draw the situation preview (phones, unless the pitch is hidden by simulation-only). */
  preview: boolean;
  onChoose: (choiceId: string) => void;
}) {
  const state = session.state;
  const moment = state.currentMoment!;
  const traits = session.setup.players[session.setup.selectedPlayerId]!.traits;
  const situation = situationText(moment);
  const pressure = pressureText(moment);
  return (
    <section
      className="match-panel match-decision"
      data-tour="decision"
      aria-labelledby="decision-heading"
    >
      <span className="match-eyebrow">
        {m.decision} · {matchFormat(m.minute, { minute: state.match.minute })} ·{' '}
        <span className="sr-only">{m.score}: </span>
        {state.match.score[0]}–{state.match.score[1]}
      </span>
      {preview && (
        <div className="match-situation">
          <SvgPitch
            frame={moment.frame}
            home={session.setup.home}
            away={session.setup.away}
            selectedPlayerId={session.setup.selectedPlayerId}
            viewBox={situationViewBox(moment)}
            label={matchFormat(m.situationPreview, { situation })}
          />
        </div>
      )}
      {pressure && <p className="match-pressure">{pressure}</p>}
      <h2 id="decision-heading">{situation}</h2>
      <div className="match-choices" ref={choicesRef}>
        {moment.choices.map((choice, index) => (
          <div className="match-choice" key={choice.id}>
            <button
              data-choice={choice.id}
              data-sound="none"
              aria-describedby={`choice-hint-${choice.id}`}
              onClick={() => onChoose(choice.id)}
            >
              <span className="match-choice-number">{index + 1}</span>
              <strong>{matchLabel(choice.labelKey)}</strong>
              <span>
                {matchFormat(m.chance, { percent: Math.round(choice.probability * 100) })}
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
              <Factors factors={choice.factors} />
            </details>
          </div>
        ))}
      </div>
      {/* On phones the tour's key-moment step appears here, after the choices it explains. */}
      <div data-tour-slot="decision" />
    </section>
  );
}
