import type { ChainFailure, DecisionChoice, KeyMoment } from '../../../model/domain';
import { reelCardText as r } from '../../../i18n/reelCard';
import { matchFormat, matchLabel, hasMatchLabel } from '../../../i18n/match';
import { chanceMeaning, type ChanceMeaning } from '../choices';
import { clockText } from './clock';
import type { ChainView } from './chain';

/*
 * The decision card (docs/EXPERIENCE-REDESIGN-1.0.md §1.4): a stakes header of at most 12
 * words with progress pips, then per option a verb of at most three words, one percentage
 * naming its outcome ("Goal 34%"), the band (Likely ≥ 65%, Even 40–64%, Long shot < 40%) and
 * the declared consequence of failure. The options hold at most 20 words in all: consequences
 * are dropped, mildest first, until they fit. The factors and the value sit behind "Why?".
 *
 * Words are counted as the player reads them: tokens with a letter ("Goal", "Long", "shot");
 * a percentage or a clock ("34%", "88′") is a figure, not a word.
 */
export const HEADER_WORDS = 12;
export const OPTION_WORDS = 20;
export const VERB_WORDS = 3;

export type Band = 'likely' | 'even' | 'long';
/** The band of a chance: Likely from 65%, Even from 40%, Long shot below. */
export const bandOf = (probability: number): Band =>
  probability >= 0.65 ? 'likely' : probability >= 0.4 ? 'even' : 'long';

/** Words in a line of copy, figures apart. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((token) => /\p{L}/u.test(token)).length;
}

export type RiskKind = keyof typeof r.card.risk | ChainFailure;
export interface CardOption {
  id: string;
  /** 1-based: the key, the arrow and the badge. */
  number: number;
  verb: string;
  /** The full choice label, for "Why?" and screen readers. */
  label: string;
  meaning: ChanceMeaning;
  /** 0–100, as displayed. */
  chance: number;
  /** "Goal 34%". */
  percent: string;
  band: Band;
  risk?: { kind: RiskKind; text: string; severity: number };
  choice: DecisionChoice;
}
export interface CardModel {
  header: string;
  /** Progress pips for a chain of more than one step. */
  pips: { step: number; steps: number } | null;
  options: CardOption[];
}

/** A choice's short verb (at most three words), or its full label. */
export function verbOf(choice: Pick<DecisionChoice, 'id' | 'labelKey'>): string {
  return r.verbs[choice.id] ?? matchLabel(choice.labelKey);
}

/** How much a chain step's declared failure matters, for dropping the mildest first. */
const FAILURE_SEVERITY: Partial<Record<ChainFailure, number>> = {
  goal: 3,
  card: 3,
  counter: 2,
  shot: 2,
  beaten: 2,
  foul: 2,
};
/** What happens if a choice fails (or, for a foul, if it comes off), with how much it matters. */
export function riskOf(choice: DecisionChoice): CardOption['risk'] {
  // A chain step declares its own consequence (X1a).
  const declared = choice.ifFailed && `match.chain.failure.${choice.ifFailed}`;
  if (declared && hasMatchLabel(declared))
    return {
      kind: choice.ifFailed!,
      text: matchLabel(declared),
      severity: FAILURE_SEVERITY[choice.ifFailed!] ?? 1,
    };
  const booking = choice.booking;
  if (booking?.onSuccess) {
    const chance = Math.round((booking.yellow + booking.red) * 100);
    if (chance >= 5)
      return { kind: 'card', text: matchFormat(r.card.risk.card, { chance }), severity: 2 };
  }
  const concede = choice.stakes.failureConcede;
  if (concede >= 0.99) return { kind: 'goal', text: r.card.risk.goal, severity: 3 };
  if (booking && !booking.onSuccess && booking.yellow + booking.red >= 0.1)
    return booking.booked
      ? { kind: 'red', text: r.card.risk.red, severity: 3 }
      : { kind: 'booking', text: r.card.risk.booking, severity: 2 };
  if (concede >= 0.25) return { kind: 'chance', text: r.card.risk.chance, severity: 2 };
  if (concede >= 0.08) return { kind: 'break', text: r.card.risk.break, severity: 1 };
  return undefined;
}

export const optionWords = (option: Pick<CardOption, 'verb' | 'percent' | 'band' | 'risk'>) =>
  wordCount(option.verb) +
  wordCount(option.percent) +
  wordCount(r.card.band[option.band]) +
  (option.risk ? wordCount(option.risk.text) : 0);

/** The options of a moment, within the word budget. */
export function cardOptions(moment: Pick<KeyMoment, 'situationId' | 'choices'>): CardOption[] {
  const options: CardOption[] = moment.choices.map((choice, index) => {
    const meaning = chanceMeaning(moment.situationId, choice.id);
    const chance = Math.round(choice.probability * 100);
    const risk = riskOf(choice);
    // A chain step names what its chance is of (X1a): "Goal 34%", "Beat him 58%".
    const named = choice.outcome && `match.outcome.${choice.outcome}`;
    return {
      id: choice.id,
      number: index + 1,
      verb: verbOf(choice),
      label: matchLabel(choice.labelKey),
      meaning,
      chance,
      percent:
        named && hasMatchLabel(named)
          ? matchFormat(matchLabel(named), { chance })
          : matchFormat(r.card.percent, { outcome: r.card.outcome[meaning], chance }),
      band: choice.band ?? bandOf(choice.probability),
      ...(risk ? { risk } : {}),
      choice,
    };
  });
  // Drop the mildest consequences first until the options fit their budget.
  const total = () => options.reduce((sum, option) => sum + optionWords(option), 0);
  const withRisk = options
    .filter((option) => option.risk)
    .sort((a, b) => a.risk!.severity - b.risk!.severity || b.number - a.number);
  for (const option of withRisk) {
    if (total() <= OPTION_WORDS) break;
    delete option.risk;
  }
  return options;
}

/** The climax suffix from the moment's late-game pressure line. */
function climaxOf(pressureKey: string | undefined): string | null {
  if (!pressureKey) return null;
  const state = pressureKey.split('.').at(-1);
  return state === 'level' || state === 'behind' || state === 'ahead' ? r.climax[state] : null;
}

/**
 * The stakes line, from the chain's finish (the shot, the block) and the climax: the situation
 * says more than the engine's generic line for a chain's kind ("A chance is on").
 */
export function stakesLine(
  chain: Pick<ChainView, 'situationId'> | null,
  moment: Pick<KeyMoment, 'situationId' | 'pressureKey' | 'follows' | 'situationParams'>,
): string {
  if (moment.follows === 'shootout' && moment.situationParams?.kick)
    return matchFormat(r.shootoutKick, { kick: moment.situationParams.kick });
  const base =
    moment.follows === 'chain'
      ? r.stakes.chain!
      : (r.stakes[chain?.situationId ?? moment.situationId] ?? r.stakes.fallback!);
  const climax = climaxOf(moment.pressureKey);
  return climax ? `${base} — ${climax}` : base;
}

/**
 * "88′ · 1–1 · Ball over the top — winner on the line", within 12 words. A hero beat or the
 * climax takes the engine's own line ("Your big chance"), with the added-time clock.
 */
export function stakesHeader(
  chain: Pick<ChainView, 'stakes' | 'situationId'> | null,
  moment: KeyMoment,
  score: readonly [number, number],
): string {
  const clock = clockText(moment.minute, moment.addedTime);
  const stakes = chain?.stakes;
  if (stakes && /\.(hero|climax)\./.test(stakes.key) && hasMatchLabel(stakes.key)) {
    // The line writes its own prime: "90+2" in added time.
    const minute = clock.replace(/′$/, '');
    const line = matchFormat(matchLabel(stakes.key), { ...stakes.params, minute });
    if (wordCount(line) <= HEADER_WORDS) return line;
  }
  const compose = (stakes: string) =>
    matchFormat(r.card.header, { clock, score: `${score[0]}–${score[1]}`, stakes });
  const header = compose(stakesLine(chain, moment));
  if (wordCount(header) <= HEADER_WORDS) return header;
  // An engine line too long for the header gives way to the situation's own.
  return compose(stakesLine(null, moment));
}

/** The whole card for the current step. */
export function decisionCard(
  chain: ChainView | null,
  moment: KeyMoment,
  score: readonly [number, number],
): CardModel {
  const steps = chain?.steps ?? 1;
  return {
    header: stakesHeader(chain, moment, score),
    pips: steps > 1 ? { step: (chain?.step ?? 0) + 1, steps } : null,
    options: cardOptions(moment),
  };
}

/** Words on the card the player must read: the options (the header has its own budget). */
export const cardWords = (card: CardModel) =>
  card.options.reduce((sum, option) => sum + optionWords(option), 0);
