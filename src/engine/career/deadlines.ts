import type { TransferOffer, World } from '../../model/domain';

/**
 * Deadline day: a transfer offer awaiting the player's answer is not simulated away. Continue
 * stops at the start of the week its deadline falls in, so the answer can still be given
 * (AGENTS.md §8: multi-step negotiation; the engagement review's deadline day).
 */
const live = (world: World): TransferOffer[] =>
  world.offers.filter(
    (offer) => offer.status === 'terms' && offer.expires.season === world.date.season,
  );

/** True when an offer awaiting an answer lapses at the end of this week. */
export function offerDeadlineThisWeek(world: World): boolean {
  if (!world.career || world.phase !== 'active') return false;
  return live(world).some((offer) => offer.expires.week === world.date.week);
}

/** The first week after this one in which an awaited offer lapses, and the bidding club. */
export function nextOfferDeadline(world: World): { week: number; clubId: string } | null {
  if (!world.career) return null;
  const next = live(world)
    .filter((offer) => offer.expires.week > world.date.week)
    .sort((a, b) => a.expires.week - b.expires.week || (a.id < b.id ? -1 : 1))[0];
  return next ? { week: next.expires.week, clubId: next.clubId } : null;
}
