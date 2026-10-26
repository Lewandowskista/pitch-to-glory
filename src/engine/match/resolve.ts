/**
 * Resolving a key-moment choice: the roll against its stated odds, the events it leads to
 * (shots, goals, chances made or conceded, a booking), the statistics and the rating credit.
 */
import type { DecisionChoice, DecisionOutcome, Position } from '../../model/domain';
import { createRng } from '../rng';
import type { MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { SITUATION_BY_ID, type ChoiceTemplate } from './situations';
import type { Card } from './discipline';
import { round6 } from './decisions';
import { addXg, chance, event, finisher, goal, line, recordShot } from './events';
import { addRating, assistCredit, creditDecision, errorCredit, stopCredit } from './report';
import { ownMiss } from './shots';
import { showCard } from './cards';
import { menDown, playedSlot, selectedSide } from './shared';

const F = C.cards;
/** Positions whose beaten defender leads into a shot of their own (match-13). */
const CHAINING: Position[] = ['ST', 'LW', 'RW', 'AM', 'CM'];

export function resolveChoice(next: MatchSession, choiceId: string): void {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const moment = s.currentMoment!;
  const { goals: scored, assists: assisted } = s.stats;
  const choice = moment.choices.find((c) => c.id === choiceId);
  const template: ChoiceTemplate | undefined = SITUATION_BY_ID[moment.situationId]?.choices.find(
    (c) => c.id === choiceId,
  );
  if (!choice || !template) throw new Error('Invalid decision choice');
  // Each choice has its own stream, so alternatives at the same moment never share a roll.
  const rng = createRng(`${setup.seed}:decision:${m.minute}:${moment.id}:${choice.id}`);
  const roll = rng.next(),
    success = roll < choice.probability;
  const p = setup.players[setup.selectedPlayerId]!,
    side = selectedSide(setup),
    stakes = choice.stakes;
  const outcome: DecisionOutcome = {
    input: { momentId: moment.id, choiceId: choice.id },
    success,
    roll,
    probability: choice.probability,
    factors: choice.factors,
  };
  const key = `match.commentary.${template.commentary}.${success ? 'success' : 'failure'}`;
  const opponentShooter = () => finisher(next, 1 - side, rng);
  if (template.direct === 'against') {
    // The shot is already on its way: record it, then the goalkeeper's attempt.
    const shooter = opponentShooter();
    recordShot(next, 1 - side, shooter, 'match.commentary.attempt', 1 - choice.probability);
    event(next, template.event, p.clubId!, p.id, line(next, key), outcome);
    if (!success) {
      goal(next, 1 - side, shooter);
      s.stats.errors++;
      addRating(next, 'errors', errorCredit(next));
    }
  } else if (template.event === 'shot') {
    if (side === 0) s.stats.homeShots++;
    else s.stats.awayShots++;
    s.stats.shots++;
    const shot = event(next, 'shot', p.clubId!, p.id, line(next, key), outcome, template.target);
    addXg(next, side, shot, choice.probability);
    if (success) goal(next, side, p.id, template.target);
    else ownMiss(next, shot);
  } else event(next, template.event, p.clubId!, p.id, line(next, key), outcome);
  // A failed defending choice can be a foul worth a card (match-16): its own stream, so the
  // decision's rolls never move. A side already down `maxDismissals` men gets no more reds.
  if (!success && choice.booking) {
    const draw = createRng(`${setup.seed}:booking:${moment.id}:${choice.id}`);
    const foulRoll = round6(draw.next()),
      redRoll = draw.next();
    const kind: Card['card'] | undefined =
      foulRoll >= choice.booking.foul
        ? undefined
        : redRoll < choice.booking.straight
          ? 'red'
          : choice.booking.booked
            ? 'second-yellow'
            : 'yellow';
    const shown =
      kind && (kind === 'yellow' || menDown(m)[side]! < F.maxDismissals) ? kind : undefined;
    outcome.booking = {
      roll: foulRoll,
      foul: choice.booking.foul,
      ...(shown ? { card: shown } : {}),
    };
    if (shown) showCard(next, side, p.id, shown);
  }
  if (template.stat === 'passes') {
    s.stats.passesAttempted++;
    if (success) s.stats.passesCompleted++;
  } else if (template.stat === 'tackles') {
    s.stats.tacklesAttempted++;
    if (success) s.stats.tackles++;
  }
  if (template.stat === 'saves' && success) s.stats.saves++;
  // A stop earns credit in proportion to the danger it removed and its difficulty, so its
  // expected value (stop × danger) is the same for every defensive choice.
  const stopping = template.family === 'goalkeeping' || template.family === 'defending';
  const danger = stopping
    ? (template.fixed ??
      template.againstShare *
        moment.budget.against *
        (template.opponent === 'attacker' ? C.decision.defensiveEdge : 1))
    : 0;
  // Divided by the reference player's odds (match-13), an average player earns what they
  // did, and a better one more: their stops are worth their quality.
  if (success && stopping)
    addRating(next, 'saves', stopCredit(next, danger, referenceOdds(choice)));
  // A beaten defender (match-13): an attacker's successful dribble leads into the shot itself,
  // carrying the chance it made, instead of a hidden roll.
  const chainable =
    template.event === 'dribble' &&
    template.scorer === 'self' &&
    !moment.follows &&
    CHAINING.includes(playedSlot(next).position) &&
    stakes.successGoal > 0;
  const chains = success && chainable;
  if (chains) s.chain = { goal: stakes.successGoal };
  // Follow-up chances: created for the selected team, or conceded to the opposition.
  const goalProbability = chains
    ? 0
    : success
      ? template.direct === 'for'
        ? 0
        : stakes.successGoal
      : stakes.failureGoal;
  if (goalProbability > 0) {
    const self = success && template.scorer === 'self';
    // A completed pass reaches the teammate named before the choice (match-15), who takes the
    // chance it makes; other chances fall to a finisher drawn here.
    const named =
      success && template.event === 'pass' && choice.target?.kind === 'teammate'
        ? choice.target.playerId
        : undefined;
    const scorer = self ? p.id : (named ?? finisher(next, side, rng, p.id));
    const shotsBefore = side === 0 ? s.stats.homeShots : s.stats.awayShots;
    const scored = chance(
      next,
      side,
      scorer,
      goalProbability,
      rng,
      self ? 'match.commentary.attempt' : 'match.commentary.chance',
    );
    // A key pass: the player's completed pass led to a teammate's shot.
    if (
      success &&
      !self &&
      template.event === 'pass' &&
      (side === 0 ? s.stats.homeShots : s.stats.awayShots) > shotsBefore
    )
      s.stats.keyPasses++;
    if (scored && success && template.assist && !self) {
      // Tag the goal so a committed fixture credits the assist to the right player.
      const scoredGoal = m.events.findLast((e) => e.kind === 'goal');
      if (scoredGoal) scoredGoal.assistId = p.id;
      s.stats.assists++;
      addRating(next, 'assists', assistCredit(next));
    }
  }
  const concedeProbability = success
    ? stakes.successConcede
    : template.direct === 'against'
      ? 0
      : stakes.failureConcede;
  if (concedeProbability > 0) {
    const conceded = chance(
      next,
      1 - side,
      opponentShooter(),
      concedeProbability,
      rng,
      'match.commentary.counter',
    );
    if (conceded) {
      s.stats.errors++;
      addRating(next, 'errors', errorCredit(next));
    }
  }
  // Decision credit: harder successes earn more, safe failures cost more. Measured against the
  // reference player's odds (match-13) it averages what the player's quality adds:
  // weight × (odds − reference). Match-22 also subtracts the moment's par: what the reference
  // player would earn from it in goals, assists, stops and goals conceded (report.ts).
  const baseline = referenceOdds(choice);
  creditDecision(next, template.family, success, baseline, {
    scored,
    assisted,
    goals:
      template.direct === 'for'
        ? baseline
        : template.scorer === 'self' && !chainable
          ? baseline * stakes.successGoal
          : 0,
    assists:
      template.scorer === 'teammate' && template.assist && template.direct !== 'for'
        ? baseline * stakes.successGoal
        : 0,
    danger,
    conceded:
      baseline * stakes.successConcede +
      (1 - baseline) * (template.direct === 'against' ? 1 : stakes.failureConcede),
  });
}
/** A choice's odds for the reference player, before attributes, form and conditions. */
function referenceOdds(choice: DecisionChoice): number {
  return (
    choice.factors.find((factor) => factor.labelKey === 'match.factor.base')?.contribution ??
    choice.probability
  );
}
