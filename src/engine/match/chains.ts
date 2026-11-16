/**
 * Decision chains (engine match-22, release 1.0 X1a; docs/EXPERIENCE-REDESIGN-1.0.md section
 * 1.1 and the interface in 1.7; docs/MATCH-BALANCING.md "Decision chains").
 *
 * A match's key moments are four to six chains, each two or three linked decisions in one phase
 * of play: a read, an action and a finish. When a chain comes due its finish is drawn as a key
 * moment's situation always was (the position's weights, the score's tilt, the opposition's
 * style); the lead-in steps before it come from the chain catalogue (chainTable.ts). Every step
 * is a key moment of its own, with its odds, factors and pitch; a lead-in that comes off stages
 * a read of the next step (a named factor), one that fails ends the chain with its declared
 * consequence, which the engine plays out. The finish resolves as a key moment always has.
 *
 * Expected goals: a chain carries the budget a key moment had (the player's share of the team's
 * expected goals over the chains of the match). An attacking finish is worth the budget ÷ the
 * reference reach for each lead-in before it, so the chain realises its budget at the reference
 * player; a lead-in option's value is what the next step is worth when it comes off (looked
 * ahead under each read it may face, playing it well) and its consequence when it does not, so
 * the value hint, the profile's dominance tally and auto-play all read the chain.
 *
 * The director is honest: the hero beat, the close game's climax and the drought change which
 * situations come up, never the odds.
 */
import type {
  ChoiceOutcome,
  DecisionChoice,
  DecisionOutcome,
  KeyMoment,
  MomentRead,
  OutcomeBand,
  Position,
} from '../../model/domain';
import { createRng, type Rng } from '../rng';
import type {
  ChainCast,
  ChainKind,
  ChainOutcome,
  ChainState,
  ChainSummary,
  KeyedLine,
  MatchSession,
} from './types';
import { MATCH_CONFIG as C } from './tuning';
import type { ChoiceTemplate, Situation } from './situations';
import { UNLOCKS_22, situationOf, templateOf } from './situations22';
import { READS } from './readTable';
import {
  CHAIN_WEIGHTS,
  EDGES,
  FINISH_FAMILY,
  LEAD_IN_DEPTH,
  LEAD_IN_OPTIONS,
  OPTION_EDGES,
  SET_PIECE_READS,
  allowsThree,
  chainPath,
  choiceClass,
  finishKind,
} from './chainTable';
import {
  buildChoices,
  expectedImpact,
  round6,
  situationWeights,
  type ContextRead,
  type DecisionContext,
} from './decisions';
import { contextReads, drawReads, markedBy } from './reads';
import { openMoment, withBookings } from './moments';
import { chance, event, finisher, line } from './events';
import { addRating, creditDecision, errorCredit } from './report';
import { referenceOdds, resolveChoice, rollBooking } from './resolve';
import { momentCount } from './bench';
import {
  addedStamp,
  clockKey,
  onPitch,
  opposingStyle,
  playedSlot,
  selectedSide,
  sideTeam,
} from './shared';

const K = C.chains;
const POSITIVE: ReadonlySet<ChainOutcome> = new Set(['goal', 'assist', 'chance', 'stop', 'won']);

// ── Planning ──────────────────────────────────────────────────────────────────

/**
 * Chains in a match for the position played: the position's range (`chains.counts`), its ends
 * with `chains.extreme` each, and one more in a big match. One draw, always.
 */
export function chainCount(position: Position, rng: Rng, importance: number): number {
  const [low, high] = K.counts[position] ?? [5, 5];
  const roll = rng.next();
  const count =
    low === high
      ? low
      : high - low === 1
        ? roll < 0.5
          ? low
          : high
        : roll < K.extreme
          ? low
          : roll >= 1 - K.extreme
            ? high
            : Math.round((low + high) / 2);
  return count + (importance >= K.bigMatch ? 1 : 0);
}
/**
 * The hero beat's chain: the planned minute (the late one aside) nearest the middle of the
 * hero's window, moved into it when it falls outside (keeping the minutes in order). Returns the
 * minutes and the hero's minute.
 */
export function placeHero(minutes: readonly number[]): { minutes: number[]; hero?: number } {
  const out = [...minutes];
  if (out.length < 2) return { minutes: out };
  const middle = (K.hero.from + K.hero.to) / 2;
  let index = 0;
  for (let i = 1; i < out.length - 1; i++)
    if (Math.abs(out[i]! - middle) < Math.abs(out[index]! - middle)) index = i;
  const low = Math.max(K.hero.from, (out[index - 1] ?? 0) + 1);
  const high = Math.min(K.hero.to, out[index + 1]! - 1);
  if (low <= high) out[index] = Math.min(high, Math.max(low, out[index]!));
  return { minutes: out, hero: out[index] };
}

// ── Values ────────────────────────────────────────────────────────────────────

/** An option's band by its chance (`chains.bands`). */
export const outcomeBand = (probability: number): OutcomeBand =>
  probability >= K.bands.likely ? 'likely' : probability >= K.bands.even ? 'even' : 'long';

/** What a finish's chance is the chance of: a goal, a pass, beating your man, a stop, a save. */
function finishOutcome(template: ChoiceTemplate): ChoiceOutcome {
  if (template.direct === 'for') return 'goal';
  if (template.direct === 'against') return 'save';
  if (template.opponent === 'attacker' && template.event !== 'pass')
    return template.event === 'save' ? 'save' : 'stop';
  if (template.event === 'pass') return 'pass';
  if (template.event === 'dribble') return 'beat';
  return 'stop';
}
/** A finish's declared consequence of failing, from what failure leads to. */
function finishFailure(template: ChoiceTemplate, choice: DecisionChoice) {
  if (template.foulOnSuccess) return 'card' as const;
  if (template.direct === 'for') return 'missed' as const;
  if (template.direct === 'against') return 'goal' as const;
  if (template.opponent === 'attacker') return 'shot' as const;
  return choice.stakes.failureConcede >= 0.03 ? ('counter' as const) : ('lost' as const);
}

/**
 * The finish's budget: an attacking finish is worth the chain's budget ÷ the reference reach of
 * each lead-in before it (`chains.reach`); a defending or keeping finish faces the chain's
 * danger. A lead-in's own budget is never read (its stakes are the chain's).
 */
function finishBudget(
  chain: Pick<ChainState, 'path' | 'budget'>,
  /** The edges along the way (`Edge.value`), multiplied out. */
  value = 1,
): { for: number; against: number } {
  const reach = K.reach[FINISH_FAMILY[chain.path[chain.path.length - 1]!] ?? 'attack'] ?? 1;
  let divisor = 1;
  for (let step = 0; step < chain.path.length - 1; step++) divisor = round6(divisor * reach);
  // An edge makes the chance bigger (in possession) or the danger smaller (defending).
  const finish = chain.path[chain.path.length - 1]!;
  const attack = situationOf(finish)?.phase !== 'defence';
  return {
    for: round6((chain.budget.for / divisor) * (attack ? value : 1)),
    against: round6(Math.min(0.95, chain.budget.against * (attack ? 1 : value))),
  };
}
/** What a failed lead-in leads to, in expected goals for and against. */
function consequence(
  chain: ChainState,
  ifFailed: string,
  value: number,
): { for: number; against: number } {
  const Q = K.consequences;
  const family = FINISH_FAMILY[chain.path[chain.path.length - 1]!];
  const finish = finishBudget(chain, value);
  switch (ifFailed) {
    case 'counter':
      return { for: 0, against: family === 'build' ? Q.lostDeep : Q.counter };
    case 'foul-won':
      return { for: Q.foulWon, against: 0 };
    case 'foul':
      return {
        for: 0,
        against: round6(Math.max(Q.counter, Math.min(0.95, finish.against * Q.foul))),
      };
    case 'beaten':
      return { for: 0, against: round6(Math.min(0.95, finish.against * Q.beaten)) };
    default:
      return { for: 0, against: 0 };
  }
}
/** The edge a lead-in option leaves for the next step, when it comes off or (a set piece) not. */
const edgeOf = (optionId: string, success: boolean): string | undefined =>
  OPTION_EDGES[optionId]?.[success ? 'success' : 'failure'];
/**
 * An edge as a step's read: its named factor (`match.read.edge.<state>`) and the odds of each
 * option it bears on, by what the option does (`EDGES`).
 */
export function edgeRead(
  situation: Situation,
  state: string,
): { read: MomentRead; factor: ContextRead } {
  const multipliers = EDGES[state]?.odds ?? {};
  const odds: Record<string, number> = {};
  for (const template of [...situation.choices, ...(UNLOCKS_22[situation.id] ?? [])]) {
    const multiplier = multipliers[choiceClass(template)];
    if (multiplier !== undefined && multiplier !== 1) odds[template.id] = multiplier;
  }
  return {
    read: { id: 'edge', state },
    factor: { key: `match.read.edge.${state}`, source: 'attribute', odds },
  };
}
/** At most three options a step: the weakest base choice gives way (a skill's never does). */
function capChoices(choices: DecisionChoice[]): DecisionChoice[] {
  const out = [...choices];
  while (out.length > 3) {
    const base = out.filter((choice) => !choice.requiredTraitId);
    const pool = base.length ? base : out;
    const weakest = pool.reduce((low, choice) =>
      expectedImpact(choice).net < expectedImpact(low).net ? choice : low,
    );
    out.splice(out.indexOf(weakest), 1);
  }
  return out;
}
/**
 * A step's choices finished for the chain: a lead-in option's stakes are the next step's value
 * when it comes off and its consequence when not; a finish keeps its stakes and at most three
 * options. Every option names its outcome, its band and its declared consequence.
 */
function decorateStep(
  next: MatchSession,
  chain: ChainState,
  index: number,
  choices: DecisionChoice[],
  context: DecisionContext,
  /** The edges so far, multiplied out. */
  value: number,
): DecisionChoice[] {
  const after = (edge: string | undefined) =>
    round6(value * (edge ? (EDGES[edge]?.value ?? 1) : 1));
  const situationId = chain.path[index]!;
  const finish = index === chain.path.length - 1;
  const setPiece = SET_PIECE_READS.has(situationId);
  const shaped = finish
    ? capChoices(choices)
    : choices.map((choice) => {
        const won = edgeOf(choice.id, true),
          lost = edgeOf(choice.id, false);
        const success = continuation(next, chain, index + 1, won, after(won), context);
        const failure = setPiece
          ? continuation(next, chain, index + 1, lost, after(lost), context)
          : consequence(chain, LEAD_IN_OPTIONS[choice.id]?.ifFailed ?? 'lost', value);
        return {
          ...choice,
          stakes: {
            successGoal: success.for,
            successConcede: success.against,
            failureGoal: failure.for,
            failureConcede: failure.against,
          },
        };
      });
  return shaped.map((choice) => {
    const option = LEAD_IN_OPTIONS[choice.id];
    const template = templateOf(situationId, choice.id);
    return {
      ...choice,
      outcome: option?.outcome ?? (template ? finishOutcome(template) : 'stop'),
      band: outcomeBand(choice.probability),
      ifFailed: option?.ifFailed ?? (template ? finishFailure(template, choice) : 'lost'),
    };
  });
}
/**
 * What the step at `index` is worth, played well, with the edge the step before left: the best
 * option's expected goals for and against, averaged over the reads still to be drawn (by their
 * weights; a matchup read is known).
 */
function continuation(
  next: MatchSession,
  chain: ChainState,
  index: number,
  edge: string | undefined,
  value: number,
  base: DecisionContext,
): { for: number; against: number } {
  const situation = situationOf(chain.path[index]!)!;
  const budget = finishBudget(chain, value);
  const sample = drawReads(next, situation, chain.opponents);
  const edged = edge ? edgeRead(situation, edge) : undefined;
  let combos: { reads: MomentRead[]; weight: number }[] = [{ reads: [], weight: 1 }];
  for (const read of READS[situation.id] ?? []) {
    const known = read.kind ? sample.find((entry) => entry.id === read.id) : undefined;
    if (known) {
      combos = combos.map((combo) => ({ reads: [...combo.reads, known], weight: combo.weight }));
      continue;
    }
    const total = read.states.reduce((sum, state) => sum + state.weight, 0);
    combos = combos.flatMap((combo) =>
      read.states.map((state) => ({
        reads: [...combo.reads, { id: read.id, state: state.id }],
        weight: (combo.weight * state.weight) / total,
      })),
    );
  }
  const marked = markedBy(next);
  let goalsFor = 0,
    goalsAgainst = 0;
  for (const combo of combos) {
    const factors = [
      ...(edged ? [edged.factor] : []),
      ...contextReads(situation, combo.reads, marked),
    ];
    const context: DecisionContext = { ...base, situation, budget };
    if (factors.length) context.reads = factors;
    else delete context.reads;
    const choices = withBookings(
      next,
      decorateStep(next, chain, index, buildChoices(context), context, value),
      combo.reads,
    );
    let best = choices[0]!;
    let bestNet = expectedImpact(best).net;
    for (const choice of choices.slice(1)) {
      const net = expectedImpact(choice).net;
      if (net > bestNet) {
        best = choice;
        bestNet = net;
      }
    }
    const impact = expectedImpact(best);
    goalsFor += combo.weight * impact.for;
    goalsAgainst += combo.weight * impact.against;
  }
  return { for: round6(goalsFor), against: round6(goalsAgainst) };
}

// ── Opening ───────────────────────────────────────────────────────────────────

/** A situation's budget weight in a chain: the chain catalogue's where it has one. */
const chainWeight = (situation: Situation, end: 'attack' | 'defence') =>
  CHAIN_WEIGHTS[situation.id]?.[end] ??
  (end === 'attack' ? situation.attackWeight : situation.defenceWeight);
/**
 * A chain's budget: as a key moment's (`momentBudget`), the player's share of each side's
 * expected goals over the match's chains, by the situation's weight against the position's
 * mix, with the chain catalogue's weights for the set pieces and last-ditch situations whose
 * value is fixed or capped (`CHAIN_WEIGHTS`), a defending finish's danger × `chains.danger`
 * (getting there first is worth something), and at most `chains.maximumBudget` each way.
 */
function chainBudget(
  situation: Situation,
  weights: readonly { situation: Situation; weight: number }[],
  shares: { attack: number; defence: number },
  expected: { own: number; opposition: number },
  count: number,
): { for: number; against: number } {
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  const mean = (end: 'attack' | 'defence') =>
    weights.reduce((sum, w) => sum + w.weight * chainWeight(w.situation, end), 0) / total;
  const attack = mean('attack'),
    defence = mean('defence');
  const cap = K.maximumBudget;
  return {
    for: attack
      ? round6(
          Math.min(
            cap,
            (expected.own * shares.attack * chainWeight(situation, 'attack')) / (count * attack),
          ),
        )
      : 0,
    against: defence
      ? round6(
          Math.min(
            cap,
            ((expected.opposition * shares.defence * chainWeight(situation, 'defence')) /
              (count * defence)) *
              (situation.phase === 'defence' ? K.danger : 1),
          ),
        )
      : 0,
  };
}

/** Whether the selected player's chains are judged as an attacker's (for the hero beat). */
const attacking = (next: MatchSession) => next.state.shares.attack >= next.state.shares.defence;
/** A chain's worth for the hero beat: expected goals for an attacker, danger for the rest. */
const worth = (next: MatchSession, budget: { for: number; against: number }) =>
  attacking(next) ? budget.for : budget.against;

/**
 * A chain comes due: its finish is drawn (the hero beat and the drought from the situations
 * worth `hero.prize`, the climax from those that take three steps), its length, path, budget
 * and cast; the chain-start line is logged and the first step opens.
 */
export function openChain(next: MatchSession): void {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  const keeper = player.primaryPosition === 'GK';
  const clock = clockKey(s);
  const side = selectedSide(setup);
  const margin = m.score[side]! - m.score[1 - side]!;
  const marked = markedBy(next);
  const weights = situationWeights(playedSlot(next).position, m.tactics.role, {
    drama: true,
    state: { minute: m.minute, margin },
    opponentStyle: opposingStyle(setup),
    rules22: true,
    twoFooted: player.foot === 'both' || player.traits.includes('two-footed'),
    ...(marked ? { marked } : {}),
  });
  const last = s.momentMinutes[s.momentMinutes.length - 1];
  const climax = s.director?.climax === true && m.minute === last && s.momentMinutes.length > 0;
  const director = s.director ?? {};
  const heroDue =
    director.hero !== undefined && director.hero === m.minute && !s.added && !director.heroDone;
  const droughtDue =
    setup.drought === true && ((s.chains?.length ?? 0) === 0 || heroDue) && !director.heroDone;
  const budgetOf = (situation: Situation) =>
    chainBudget(
      situation,
      weights,
      s.shares,
      { own: s.expectedGoals[side]!, opposition: s.expectedGoals[1 - side]! },
      momentCount(next),
    );
  let pool = weights.filter((w) => FINISH_FAMILY[w.situation.id] !== undefined);
  if (climax) {
    const three = pool.filter((w) => allowsThree(w.situation.id, keeper));
    if (three.length) pool = three;
  }
  const special = heroDue || droughtDue;
  if (special) {
    // Open play at the player's end of it (a set piece is never the hero's): those worth the
    // hero's prize where there are any, else all of them, the budget raised to it below.
    const phase = attacking(next) ? 'attack' : 'defence';
    const open = pool.filter(
      (w) => w.situation.phase === phase && FINISH_FAMILY[w.situation.id] !== 'set-piece',
    );
    if (open.length) pool = open;
    const rich = pool.filter((w) => worth(next, budgetOf(w.situation)) >= K.hero.prize);
    if (rich.length) pool = rich;
  }
  const rng = createRng(`${setup.seed}:situation:${clock}`);
  let finish = pool[pool.length - 1]!.situation;
  let target = rng.next() * pool.reduce((sum, w) => sum + w.weight, 0);
  for (const w of pool) {
    target -= w.weight;
    if (target < 0) {
      finish = w.situation;
      break;
    }
  }
  const stream = createRng(`${setup.seed}:chain:${clock}`);
  const three = allowsThree(finish.id, keeper);
  const roll = stream.next();
  const steps: 2 | 3 = three && (climax || roll < K.threeSteps) ? 3 : 2;
  const path = chainPath(finish.id, steps, keeper);
  // The budget at the reference player; the hero's is at least the hero's prize.
  const raw = budgetOf(finish);
  const budget = special
    ? attacking(next)
      ? { for: round6(Math.max(raw.for, K.hero.prize)), against: raw.against }
      : { for: raw.for, against: round6(Math.max(raw.against, K.hero.prize)) }
    : raw;
  // The opponents every step faces, drawn once (the cast).
  const opposition = side === 0 ? m.away : m.home;
  const theirs = onPitch(opposition);
  const pick = (positions: Position[]) => {
    const pool = theirs.filter((id) => positions.includes(setup.players[id]!.primaryPosition));
    return stream.pick(pool.length ? pool : theirs);
  };
  const opponents = {
    keeper: pick(['GK']),
    defender: pick(['CB', 'LB', 'RB', 'DM']),
    attacker: pick(['ST', 'LW', 'RW', 'AM']),
  };
  const kind: ChainKind = finishKind(finish.id, keeper);
  // The prize on the stakes header: the chain's expected goals at the start (the reference
  // player's), or the danger it faces.
  const prize = finish.phase === 'defence' ? budget.against : budget.for;
  const index = s.chains?.length ?? 0;
  const id = `${clock}-${index}`;
  const chain: ChainState = {
    id,
    kind,
    minute: m.minute,
    ...addedStamp(s),
    side: finish.phase === 'defence' ? ((1 - side) as 0 | 1) : side,
    steps,
    step: 0,
    stakes: stakesLine(next, kind, climax, special && heroDue, prize),
    prize,
    ...(climax ? { climax: true as const } : {}),
    ...(heroDue ? { hero: true as const } : {}),
    results: [],
    path,
    budget,
    opponents,
  };
  const start = event(
    next,
    'chain-start',
    player.clubId!,
    player.id,
    line(next, 'match.commentary.chain-start', side),
  );
  start.chainId = id;
  s.decisionChain = chain;
  openChainStep(next);
}
/** The stakes header: the kind of chain, a climax's or hero's words, the minute and the score. */
function stakesLine(
  next: MatchSession,
  kind: ChainKind,
  climax: boolean,
  hero: boolean,
  prize: number,
): KeyedLine {
  const s = next.state,
    m = s.match;
  const side = selectedSide(next.setup);
  const own = m.score[side]!,
    against = m.score[1 - side]!;
  const state = own === against ? 'level' : own > against ? 'ahead' : 'behind';
  return {
    key: climax
      ? `match.chain.stakes.climax.${state}`
      : hero
        ? `match.chain.stakes.hero.${kind}`
        : `match.chain.stakes.${kind}`,
    params: {
      minute: m.minute,
      ...(s.added ? { added: s.added } : {}),
      for: own,
      against,
      prize: Math.round(prize * 100),
    },
  };
}
/** Open the chain's current step as a key moment. */
function openChainStep(next: MatchSession): void {
  const s = next.state,
    setup = next.setup;
  const chain = s.decisionChain!;
  const situation = situationOf(chain.path[chain.step]!)!;
  const finish = situationOf(chain.path[chain.path.length - 1]!)!;
  const lead = chain.step < chain.path.length - 1;
  const edge = chain.staged?.find((read) => read.id === 'edge')?.state;
  openMoment(next, undefined, {
    situation,
    scene: finish,
    depth: lead ? (LEAD_IN_DEPTH[situation.id] ?? 0) : 0,
    budget: finishBudget(chain, chain.value ?? 1),
    ...(edge ? { edge: edgeRead(situation, edge) } : {}),
    opponents: chain.opponents,
    stream: `${setup.seed}:chain:${chain.id}:${chain.step}`,
    suffix: `chain:${chain.id}:${chain.step}`,
    replace: chain.step > 0,
    ...(lead ? { variants: K.leadInVariants } : {}),
    decorate: (choices, context) =>
      decorateStep(next, chain, chain.step, choices, context, chain.value ?? 1),
    fields: { chainId: chain.id, step: chain.step, steps: chain.steps },
  });
  const moment = s.currentMoment!;
  moment.chainCast = castOf(next, chain, moment);
}
/**
 * Who a step involves: you, the direct opponent, up to two teammates and two opponents, the
 * keeper, and up to four others nearest the ball, drawn faint.
 */
function castOf(next: MatchSession, chain: ChainState, moment: KeyMoment): ChainCast {
  const setup = next.setup;
  const you = setup.selectedPlayerId;
  const side = selectedSide(setup);
  const ownTeam = new Set(side === 0 ? setup.home.playerIds : setup.away.playerIds);
  const cast = moment.cast;
  const attack = chain.side === side;
  const opponent = cast?.presser ?? (attack ? chain.opponents.defender : chain.opponents.attacker);
  const named = [cast?.runner, cast?.crosser, ...(cast?.free ?? []), ...(cast?.cover ?? [])];
  const unique = (ids: (string | undefined)[]) => [
    ...new Set(ids.filter((id): id is string => !!id && id !== you && id !== opponent)),
  ];
  const keeper = cast?.keeper ?? (attack ? chain.opponents.keeper : undefined);
  const teammates = unique(named.filter((id) => id && ownTeam.has(id)))
    .filter((id) => id !== keeper)
    .slice(0, 2);
  const defenders = unique(named.filter((id) => id && !ownTeam.has(id)))
    .filter((id) => id !== keeper)
    .slice(0, 2);
  const taken = new Set([you, opponent, keeper, ...teammates, ...defenders]);
  const ball = moment.frame.ball;
  const ghosts = moment.frame.players
    .filter((p) => !taken.has(p.id))
    .map((p) => ({ id: p.id, gap: (p.point.x - ball.x) ** 2 + (p.point.y - ball.y) ** 2 }))
    .sort((a, b) => a.gap - b.gap || (a.id < b.id ? -1 : 1))
    .slice(0, 4)
    .map((p) => p.id);
  return {
    you,
    ...(opponent ? { opponent } : {}),
    teammates,
    defenders,
    ...(keeper && keeper !== you ? { keeper } : {}),
    ghosts,
  };
}

// ── Answering ─────────────────────────────────────────────────────────────────

/** The one-line reason for a step's result: the factor that weighed most, and the chance. */
function causeOf(choice: DecisionChoice, success: boolean): KeyedLine {
  let top: DecisionChoice['factors'][number] | undefined;
  for (const factor of choice.factors) {
    if (factor.labelKey === 'match.factor.base' || factor.labelKey === 'match.factor.limit')
      continue;
    const weighs = success ? factor.contribution > 0 : factor.contribution < 0;
    if (!weighs) continue;
    if (!top || Math.abs(factor.contribution) > Math.abs(top.contribution)) top = factor;
  }
  return {
    key: `match.chain.cause.${success ? 'success' : 'failure'}${top ? '' : '-odds'}`,
    params: {
      ...(top ? { factor: top.labelKey } : {}),
      chance: Math.round(choice.probability * 100),
    },
  };
}

/**
 * Answer the chain's current step. A lead-in that comes off (or a set piece's read) stages the
 * next step's read and opens it in the same minute: 'continued'. A failed lead-in plays its
 * consequence and the finish resolves as a key moment; either ends the chain: 'ended', and the
 * caller plays the rest of the minute.
 */
export function answerChainStep(next: MatchSession, choiceId: string): 'continued' | 'ended' {
  const s = next.state,
    m = s.match;
  const chain: ChainState = { ...s.decisionChain!, results: [...s.decisionChain!.results] };
  s.decisionChain = chain;
  const moment = s.currentMoment!;
  const choice = moment.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('Invalid decision choice');
  const finish = chain.step === chain.path.length - 1;
  const first = m.events.length;
  let outcome: ChainOutcome;
  let success: boolean;
  if (!finish) {
    const answer = resolveLeadIn(next, moment, choice);
    success = answer.success;
    chain.results.push({
      step: chain.step,
      choiceId,
      probability: choice.probability,
      success,
      cause: causeOf(choice, success),
    });
    if ((success || answer.setPiece) && !s.sentOff) {
      const edge = edgeOf(choiceId, success);
      chain.staged = edge ? [{ id: 'edge', state: edge }] : [];
      if (edge) chain.value = round6((chain.value ?? 1) * (EDGES[edge]?.value ?? 1));
      chain.step++;
      openChainStep(next);
      return 'continued';
    }
    outcome = answer.outcome;
  } else {
    resolveChoice(next, choiceId);
    const decision = m.events
      .slice(first)
      .find((entry) => entry.outcome?.input.momentId === moment.id);
    success = decision?.outcome?.success ?? false;
    chain.results.push({
      step: chain.step,
      choiceId,
      probability: choice.probability,
      success,
      cause: causeOf(choice, success),
    });
    outcome = finishResult(next, moment, choice, success, first);
  }
  endChain(next, outcome);
  return 'ended';
}

/** A lead-in step: its roll, its line, its credit and, failed, its consequence played out. */
function resolveLeadIn(
  next: MatchSession,
  moment: KeyMoment,
  choice: DecisionChoice,
): { success: boolean; setPiece: boolean; outcome: ChainOutcome } {
  const s = next.state,
    m = s.match,
    setup = next.setup;
  const option = LEAD_IN_OPTIONS[choice.id];
  if (!option) throw new Error('Invalid decision choice');
  const template = option.template;
  const { goals: scored, assists: assisted } = s.stats;
  const rng = createRng(`${setup.seed}:decision:${m.minute}:${moment.id}:${choice.id}`);
  const roll = rng.next(),
    success = roll < choice.probability;
  const p = setup.players[setup.selectedPlayerId]!,
    side = selectedSide(setup);
  const decided: DecisionOutcome = {
    input: { momentId: moment.id, choiceId: choice.id },
    success,
    roll,
    probability: choice.probability,
    factors: choice.factors,
  };
  event(
    next,
    template.event,
    p.clubId!,
    p.id,
    line(next, `match.commentary.${template.commentary}.${success ? 'success' : 'failure'}`, side),
    decided,
  );
  if (template.stat === 'passes') {
    s.stats.passesAttempted++;
    if (success) s.stats.passesCompleted++;
  }
  const setPiece = SET_PIECE_READS.has(moment.situationId);
  let card: string | undefined;
  let conceded = false;
  if (!success && !setPiece) {
    if (option.ifFailed === 'foul') card = rollBooking(next, moment, choice, decided, success);
    if (choice.stakes.failureConcede > 0) {
      conceded = chance(
        next,
        1 - side,
        finisher(next, 1 - side, rng),
        choice.stakes.failureConcede,
        rng,
        'match.commentary.counter',
      );
      if (conceded) {
        s.stats.errors++;
        addRating(next, 'errors', errorCredit(next));
      }
    }
    if (choice.stakes.failureGoal > 0)
      chance(
        next,
        side,
        finisher(next, side, rng, p.id),
        choice.stakes.failureGoal,
        rng,
        'match.commentary.chance',
      );
  }
  // The decision's credit against the reference player's odds, and its par: the goals a
  // reference player's failure would concede. What the next step is worth is that step's.
  const reference = referenceOdds(choice, true);
  // A foul won is half a success (`chains.foulWonCredit`): the move stopped, a set piece came.
  const credit =
    success || setPiece ? success : option.ifFailed === 'foul-won' ? K.foulWonCredit : false;
  creditDecision(next, template.family, credit, reference, {
    scored,
    assisted,
    goals: 0,
    assists: 0,
    danger: 0,
    conceded: setPiece ? 0 : round6((1 - reference) * choice.stakes.failureConcede),
  });
  const outcome: ChainOutcome = card
    ? 'card'
    : conceded
      ? 'conceded'
      : option.ifFailed === 'foul'
        ? 'foul'
        : option.ifFailed === 'foul-won'
          ? 'won'
          : 'lost';
  return { success, setPiece, outcome };
}

/** How a chain that reached its finish ended, from what the finish led to. */
function finishResult(
  next: MatchSession,
  moment: KeyMoment,
  choice: DecisionChoice,
  success: boolean,
  first: number,
): ChainOutcome {
  const setup = next.setup,
    m = next.state.match;
  const side = selectedSide(setup);
  const you = setup.selectedPlayerId;
  const template = templateOf(moment.situationId, choice.id);
  const events = m.events.slice(first);
  const own = sideTeam(next, side),
    theirs = sideTeam(next, 1 - side);
  const goals = events.filter((entry) => entry.kind === 'goal');
  if (template?.foulOnSuccess && success) return 'foul';
  if (events.some((entry) => entry.kind === 'card' && entry.playerId === you)) return 'card';
  if (goals.some((entry) => entry.teamId === theirs)) return 'conceded';
  if (goals.some((entry) => entry.teamId === own && entry.playerId === you)) return 'goal';
  if (goals.some((entry) => entry.teamId === own && entry.assistId === you)) return 'assist';
  if (goals.some((entry) => entry.teamId === own)) return 'chance';
  if (!template) return success ? 'won' : 'lost';
  if (template.direct === 'for') return 'chance';
  if (template.direct === 'against' || template.opponent === 'attacker')
    return success ? 'stop' : 'lost';
  if (!success) return 'lost';
  return events.some((entry) => entry.kind === 'shot' && entry.teamId === own) ? 'chance' : 'won';
}

/** The chain is over: its summary, its end line, and the director's note of its worth. */
function endChain(next: MatchSession, outcome: ChainOutcome): void {
  const s = next.state,
    setup = next.setup;
  const chain = s.decisionChain!;
  const summary: ChainSummary = {
    id: chain.id,
    kind: chain.kind,
    minute: chain.minute,
    ...(chain.addedTime ? { addedTime: chain.addedTime } : {}),
    outcome,
    positive: POSITIVE.has(outcome),
    steps: chain.steps,
    ...(chain.prize !== undefined ? { prize: chain.prize } : {}),
    ...(chain.climax ? { climax: true as const } : {}),
    ...(chain.hero ? { hero: true as const } : {}),
    results: chain.results,
  };
  s.chains = [...(s.chains ?? []), summary];
  delete s.decisionChain;
  if ((chain.prize ?? 0) >= K.hero.prize && !s.director?.heroDone)
    s.director = { ...s.director, heroDone: true };
  const player = setup.players[setup.selectedPlayerId]!;
  const end = event(
    next,
    'chain-end',
    player.clubId!,
    player.id,
    line(next, `match.commentary.chain-${outcome}`, selectedSide(setup)),
  );
  end.chainId = chain.id;
  end.chainOutcome = outcome;
}
