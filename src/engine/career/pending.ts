import type { GameDate, World } from '../../model/domain';

/**
 * The decisions waiting for the career player (review phase 5, step 5.1): transfer talks,
 * unanswered press, the manager's challenge, a story and sponsor offers. Continue stops for
 * them, and the hub lists them. Pure.
 */
export type PendingKind = 'offer' | 'press' | 'promise' | 'story' | 'sponsor';
export interface PendingDecision {
  /** Stable: the kind and the record it points at. */
  id: string;
  kind: PendingKind;
  /** The record's own id. */
  refId: string;
  /** The last day to answer; null when it never lapses. */
  deadline: GameDate | null;
}

export function pendingDecisions(world: World): PendingDecision[] {
  const items: PendingDecision[] = [];
  const add = (kind: PendingKind, refId: string, deadline: GameDate | null) =>
    items.push({ id: `${kind}:${refId}`, kind, refId, deadline });
  for (const offer of world.offers)
    if (offer.status === 'terms') add('offer', offer.id, offer.expires);
  for (const item of world.media)
    if (item.choices.length && item.answer === null) add('press', item.id, item.expires);
  const promise = world.career?.social.promises?.find(
    (entry) => entry.season === world.date.season && entry.status === 'offered',
  );
  if (promise)
    add('promise', promise.id, { season: promise.season, week: promise.respondBy, day: 7 });
  const story = world.career?.stories?.find((entry) => entry.status === 'offered');
  if (story) add('story', story.id, story.respondBy);
  for (const deal of world.sponsorships)
    if (deal.status === 'offered') add('sponsor', deal.id, deal.expires);
  return items;
}

/** A decision whose last week is this one: Continue stops at the start of it. */
export function decisionDueThisWeek(world: World): boolean {
  if (!world.career || world.phase !== 'active') return false;
  return pendingDecisions(world).some(
    (item) =>
      item.deadline &&
      item.deadline.season === world.date.season &&
      item.deadline.week === world.date.week,
  );
}

/**
 * Whether Continue stops before simulating another week: a decision falls due this week, or
 * one arrived that was not waiting when Continue was pressed (`before`, its ids).
 */
export function continueStops(world: World, before: ReadonlySet<string>): boolean {
  if (!world.career || world.phase !== 'active') return false;
  return decisionDueThisWeek(world) || pendingDecisions(world).some((item) => !before.has(item.id));
}

/** The next week after this one in which a waiting decision lapses. */
export function nextDecisionDeadline(world: World): PendingDecision | null {
  if (!world.career) return null;
  return (
    pendingDecisions(world)
      .filter(
        (item) =>
          item.deadline &&
          item.deadline.season === world.date.season &&
          item.deadline.week > world.date.week,
      )
      .sort((a, b) => a.deadline!.week - b.deadline!.week || (a.id < b.id ? -1 : 1))[0] ?? null
  );
}
