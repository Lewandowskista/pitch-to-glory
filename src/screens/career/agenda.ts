/**
 * The career agenda (Phase 3.2): what needs the player now, what the season holds, what
 * Continue will do and what happened while it ran. Pure derivations from the saved world, so
 * the hub, the calendar and their tests agree, and nothing predicts an unrevealed outcome.
 */
import type {
  BackgroundResult,
  ChronicleEntry,
  Fixture,
  GameDate,
  Injury,
  TrainingReport,
  TransferOffer,
  World,
} from '../../model/domain';
import { pendingCareerFixture } from '../../engine/career/fixtures';
import { windowWeeks } from '../../engine/career/honours/international';
import { compareDates, windowState } from '../../engine/career/market/rules';
import { getSeasonWeeks } from '../../engine/world/calendar';

/** The live match session, as the store holds it: none, in play, or finished and unrecorded. */
export type SessionState = 'live' | 'finished' | null;

export type PriorityKind =
  | 'recovery'
  | 'resume'
  | 'report'
  | 'play'
  | 'offer'
  | 'press'
  | 'sponsor'
  | 'attributes'
  | 'skills';
/** Recovery first, then the match, then anything with a deadline, then unspent points. */
export type PriorityGroup = 'recovery' | 'match' | 'deadline' | 'progress';
const GROUP_ORDER: PriorityGroup[] = ['recovery', 'match', 'deadline', 'progress'];

export interface Priority {
  /** Stable for React keys and tests: the kind plus the record it points at. */
  id: string;
  kind: PriorityKind;
  group: PriorityGroup;
  /** The last week to act; null when the action never lapses. */
  deadline: GameDate | null;
  /** Where the action happens. Career links keep the `save` parameter (see `withSave`). */
  to: string;
  /** Values for the action's copy. */
  params: Record<string, string | number>;
}

const inSeason = (world: World, date: GameDate) => date.season === world.date.season;
const byDeadline = (a: Priority, b: Priority) =>
  GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
  (a.deadline && b.deadline
    ? compareDates(a.deadline, b.deadline)
    : a.deadline
      ? -1
      : b.deadline
        ? 1
        : 0) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Actions that lapse: transfer talks awaiting the player, unanswered press, sponsor offers. */
export function deadlineItems(world: World): Priority[] {
  const items: Priority[] = [];
  for (const offer of world.offers) {
    if (offer.status !== 'terms') continue;
    items.push({
      id: `offer:${offer.id}`,
      kind: 'offer',
      group: 'deadline',
      deadline: offer.expires,
      to: `/career/transfers?offer=${encodeURIComponent(offer.id)}`,
      params: { club: world.clubs[offer.clubId]?.name ?? offer.clubId, offer: offer.kind },
    });
  }
  for (const item of world.media) {
    if (!item.choices.length || item.answer !== null) continue;
    items.push({
      id: `press:${item.id}`,
      kind: 'press',
      group: 'deadline',
      deadline: item.expires,
      to: '/career/media',
      params: { outlet: item.authorName },
    });
  }
  for (const deal of world.sponsorships) {
    if (deal.status !== 'offered') continue;
    items.push({
      id: `sponsor:${deal.id}`,
      kind: 'sponsor',
      group: 'deadline',
      deadline: deal.expires,
      to: '/career/lifestyle',
      params: { category: deal.category },
    });
  }
  return items.sort(byDeadline);
}

/**
 * Everything waiting for the player, most urgent first. The match itself is included so the
 * hub can tell whether something must happen before it.
 */
export function hubPriorities(world: World, session: SessionState): Priority[] {
  const career = world.career;
  if (!career) return [];
  const items: Priority[] = [];
  const injury = career.injury;
  if (injury && injury.recovery === null)
    items.push({
      id: `recovery:${injury.id}`,
      kind: 'recovery',
      group: 'recovery',
      deadline: null,
      to: '/career#condition-heading',
      params: { weeks: injury.weeksRemaining, injury: injury.kind },
    });
  if (session)
    items.push({
      id: `match:${session}`,
      kind: session === 'finished' ? 'report' : 'resume',
      group: 'match',
      deadline: null,
      to: '/match',
      params: {},
    });
  else {
    const pending = pendingCareerFixture(world);
    if (pending)
      items.push({
        id: `play:${pending.id}`,
        kind: 'play',
        group: 'match',
        deadline: { ...pending.date },
        to: '/match',
        params: { week: pending.date.week },
      });
  }
  items.push(...deadlineItems(world));
  if (career.attributePoints > 0)
    items.push({
      id: 'attributes',
      kind: 'attributes',
      group: 'progress',
      deadline: null,
      to: '/career/profile',
      params: { count: career.attributePoints },
    });
  if (career.skillPoints > 0)
    items.push({
      id: 'skills',
      kind: 'skills',
      group: 'progress',
      deadline: null,
      to: '/career/skills',
      params: { count: career.skillPoints },
    });
  return items.sort(byDeadline);
}

/** Keep the active save in a career link, so it restores after a refresh. */
export function withSave(to: string, save: string | null): string {
  if (!save || !to.startsWith('/career')) return to;
  const [path, hash = ''] = to.split('#');
  const joiner = path!.includes('?') ? '&' : '?';
  return `${path}${joiner}save=${encodeURIComponent(save)}${hash ? `#${hash}` : ''}`;
}

export type AdvanceKind =
  /** A match is ready or in progress: Continue is not offered. */
  | 'match'
  /** The injury needs a recovery choice before the world can move on. */
  | 'recovery'
  /** Continue stops at the club's next fixture, when the player is picked. */
  | 'fixture'
  /** No fixture left for the club: Continue plays out the season. */
  | 'season'
  | 'complete';
export interface AdvancePreview {
  kind: AdvanceKind;
  /** The first week Continue simulates (the current week). */
  from: number;
  /** The fixture Continue is heading for; selection is decided on the day. */
  fixture: Fixture | null;
  /** The last week simulated before stopping at the fixture, or the season's last week. */
  through: number;
  /** While injured: the first week the player is expected to be fit. */
  fitWeek: number | null;
  /** Deadlines that pass in the simulated weeks unless acted on first. */
  lapsing: Priority[];
}

/**
 * What Continue will do from here. It never predicts selection or results: the target is the
 * club's next fixture once the player can play, and the copy says the stop depends on being
 * picked.
 */
export function advancePreview(world: World, session: SessionState): AdvancePreview {
  const career = world.career!;
  const from = world.date.week;
  const seasonWeeks = getSeasonWeeks(world);
  const base = { from, fixture: null, through: from, fitWeek: null, lapsing: [] };
  if (world.phase === 'complete') return { ...base, kind: 'complete' };
  if (session || pendingCareerFixture(world)) return { ...base, kind: 'match' };
  const injury = career.injury;
  if (injury && injury.recovery === null) return { ...base, kind: 'recovery' };
  const fitWeek = injury ? from + injury.weeksRemaining : null;
  // A fixture this week without a pending match is one the player was not picked for: it is
  // simulated, so Continue heads for the following one.
  const earliest = Math.max(from + 1, fitWeek ?? 0);
  const clubId = world.players[career.playerId]?.clubId;
  const fixture =
    Object.values(world.fixtures)
      .filter(
        (entry) =>
          clubId !== undefined &&
          (entry.homeId === clubId || entry.awayId === clubId) &&
          inSeason(world, entry.date) &&
          entry.date.week >= earliest &&
          !world.results[entry.id],
      )
      .sort(
        (a, b) => a.date.week - b.date.week || a.date.day - b.date.day || (a.id < b.id ? -1 : 1),
      )[0] ?? null;
  const through = fixture ? fixture.date.week - 1 : seasonWeeks;
  const lapsing = deadlineItems(world).filter(
    (item) => item.deadline && inSeason(world, item.deadline) && item.deadline.week <= through,
  );
  return {
    kind: fixture ? 'fixture' : 'season',
    from,
    fixture,
    through,
    fitWeek,
    lapsing,
  };
}

export type AgendaEntry =
  | { kind: 'fixture'; fixture: Fixture; result: BackgroundResult | null }
  | { kind: 'international' }
  | { kind: 'window-opens' }
  | { kind: 'window-closes' }
  | { kind: 'deadline'; item: Priority }
  | { kind: 'recovery'; injury: Injury }
  | { kind: 'fit'; injury: Injury }
  | { kind: 'training' }
  | { kind: 'season-end' };
export interface AgendaWeek {
  week: number;
  /** The week the world is in now (one past the last week once the season is complete). */
  current: boolean;
  past: boolean;
  entries: AgendaEntry[];
}

/**
 * The season week by week: the club's fixtures and results, the player's injury and expected
 * return, deadlines, transfer and international windows, and this week's training. Training
 * repeats every week, so it is shown only where it happens next.
 */
export function seasonAgenda(world: World): AgendaWeek[] {
  const career = world.career!;
  const seasonWeeks = getSeasonWeeks(world);
  const current = world.date.week;
  const clubId = world.players[career.playerId]?.clubId;
  const weeks: AgendaWeek[] = Array.from({ length: seasonWeeks }, (_, index) => ({
    week: index + 1,
    current: index + 1 === current,
    past: index + 1 < current,
    entries: [],
  }));
  const at = (week: number) => weeks[week - 1];
  for (const fixture of Object.values(world.fixtures)
    .filter(
      (entry) =>
        clubId !== undefined &&
        (entry.homeId === clubId || entry.awayId === clubId) &&
        inSeason(world, entry.date),
    )
    .sort((a, b) => a.date.week - b.date.week || a.date.day - b.date.day || (a.id < b.id ? -1 : 1)))
    at(fixture.date.week)?.entries.push({
      kind: 'fixture',
      fixture,
      result: world.results[fixture.id] ?? null,
    });
  for (const week of windowWeeks(world)) at(week)?.entries.push({ kind: 'international' });
  // Transfer windows: their first and last weeks, from the market's own rules.
  for (let week = 1; week <= seasonWeeks; week++) {
    const state = windowState(world, week);
    if (state.open && !windowState(world, week - 1).open)
      at(week)?.entries.push({ kind: 'window-opens' });
    if (state.open && state.closes === week) at(week)?.entries.push({ kind: 'window-closes' });
  }
  const injury = career.injury;
  if (injury && world.phase === 'active') {
    at(current)?.entries.unshift({ kind: 'recovery', injury });
    at(current + injury.weeksRemaining)?.entries.unshift({ kind: 'fit', injury });
  }
  for (const item of deadlineItems(world))
    if (item.deadline && inSeason(world, item.deadline))
      at(Math.max(current, item.deadline.week))?.entries.push({ kind: 'deadline', item });
  if (world.phase === 'active' && !injury) at(current)?.entries.push({ kind: 'training' });
  at(seasonWeeks)?.entries.push({ kind: 'season-end' });
  return weeks;
}

export interface Digest {
  /** The simulated weeks, inclusive. */
  from: number;
  to: number;
  /** The club's fixtures the simulation resolved (not matches the player played live). */
  results: { fixture: Fixture; result: BackgroundResult }[];
  training: TrainingReport | null;
  injury: Injury | null;
  messages: number;
  unread: number;
  lapsedPress: number;
  expiredOffers: TransferOffer[];
  newOffers: TransferOffer[];
  chronicle: ChronicleEntry[];
}

/**
 * What actually happened in the weeks simulated since `since` (the date Continue was pressed),
 * from the world's dated records. Null when no week has passed or the season has changed.
 */
export function advanceDigest(world: World, since: GameDate): Digest | null {
  const career = world.career;
  if (!career || since.season !== world.date.season || world.date.week <= since.week) return null;
  const from = since.week;
  const to = world.date.week - 1;
  const within = (date: { season: number; week: number }) =>
    date.season === since.season && date.week >= from && date.week <= to;
  const clubId = world.players[career.playerId]?.clubId;
  const live = new Set(career.matches.filter((match) => !match.auto).map((m) => m.fixtureId));
  const results = Object.values(world.fixtures)
    .filter(
      (fixture) =>
        clubId !== undefined &&
        (fixture.homeId === clubId || fixture.awayId === clubId) &&
        within(fixture.date) &&
        world.results[fixture.id] &&
        !live.has(fixture.id),
    )
    .sort((a, b) => a.date.week - b.date.week || a.date.day - b.date.day)
    .map((fixture) => ({ fixture, result: world.results[fixture.id]! }));
  const messages = world.inbox.filter((message) => within(message.date));
  return {
    from,
    to,
    results,
    training: career.lastTraining && within(career.lastTraining) ? career.lastTraining : null,
    injury: career.injury && within(career.injury.started) ? career.injury : null,
    messages: messages.length,
    unread: messages.filter((message) => !message.read).length,
    lapsedPress: world.media.filter(
      (item) => item.answer === 'silence' && item.expires && within(item.expires),
    ).length,
    expiredOffers: world.offers.filter(
      (offer) => offer.status === 'expired' && within(offer.expires),
    ),
    newOffers: world.offers.filter((offer) => within(offer.created) && offer.status === 'terms'),
    chronicle: world.chronicle.filter(
      (entry) => entry.playerId === career.playerId && within(entry.date),
    ),
  };
}

/** The `since` URL value for a date, and back. */
export const sinceValue = (date: GameDate) => `${date.season}.${date.week}`;
export function parseSince(value: string | null): GameDate | null {
  const match = value?.match(/^(\d+)\.(\d+)$/);
  return match ? { season: Number(match[1]), week: Number(match[2]), day: 1 } : null;
}
