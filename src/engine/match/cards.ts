/**
 * Full discipline in the session (match-16): the cards shown each minute, and a player sent
 * off. The draws themselves (who is booked, booking risks) are in discipline.ts.
 */
import type { MatchEvent } from '../../model/domain';
import type { MatchSession, MatchState } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { cardsOfMinute, type Card } from './discipline';
import { event, line } from './events';
import { addRating } from './report';
import { currentRates, updatePossession } from './rates';
import { offPitch, sideTeam } from './shared';

const F = C.cards;

/** Players on a yellow and still on the pitch (match-16). */
export function bookedPlayers(match: MatchState['match']): Set<string> {
  const off = new Set([...(match.home.sentOffIds ?? []), ...(match.away.sentOffIds ?? [])]);
  return new Set(
    match.events.flatMap((e) =>
      e.kind === 'card' && e.card === 'yellow' && e.playerId && !off.has(e.playerId)
        ? [e.playerId]
        : [],
    ),
  );
}
/**
 * Full discipline (match-16): the minute's cards, drawn at its start on
 * `${seed}:cards:${minute}` (see `cardsOfMinute`), before anything else happens in it.
 */
export function showCards(session: MatchSession): void {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  // While on, the selected player's defending moments carry part of their risk.
  const scaled = offPitch(s)
    ? undefined
    : {
        id: setup.selectedPlayerId,
        factor: Math.max(0, 1 - s.shares.defence * F.selectedDefence),
      };
  for (const card of cardsOfMinute(
    setup.seed,
    m.minute,
    [m.home, m.away],
    setup.players,
    bookedPlayers(m),
    scaled,
  ))
    showCard(session, card.side, card.playerId, card.card);
}
const CARD_COMMENTARY: Record<Card['card'], string> = {
  yellow: 'match.commentary.card',
  'second-yellow': 'match.commentary.second-yellow',
  red: 'match.commentary.red',
};
/**
 * A card shown (match-16): a `card` event with commentary; a second yellow or a red sends the
 * player off. The selected player's cards cost rating (`cards.rating`).
 */
export function showCard(
  session: MatchSession,
  side: 0 | 1,
  playerId: string,
  kind: Card['card'],
): MatchEvent {
  const shown = event(
    session,
    'card',
    sideTeam(session, side),
    playerId,
    line(session, CARD_COMMENTARY[kind], side),
  );
  shown.card = kind;
  if (playerId === session.setup.selectedPlayerId)
    addRating(session, 'discipline', kind === 'yellow' ? F.rating.yellow : F.rating.red);
  if (kind !== 'yellow') dismiss(session, side, playerId, kind);
  return shown;
}
/**
 * A player leaves the pitch (match-16): his side plays on a man short, with expected goals,
 * possession and team odds recalculated. The selected player's match ends here.
 */
function dismiss(
  session: MatchSession,
  side: 0 | 1,
  playerId: string,
  kind: 'second-yellow' | 'red',
): void {
  const s = session.state,
    m = s.match;
  const key = side === 0 ? 'home' : 'away';
  m[key] = { ...m[key], sentOffIds: [...(m[key].sentOffIds ?? []), playerId] };
  if (playerId === session.setup.selectedPlayerId) {
    const reason = kind === 'red' ? 'straight-red' : 'second-yellow';
    s.sentOff = { minute: m.minute, reason };
    s.managerTrustDelta += F.trust[reason];
    s.captainDecisionPending = false;
  }
  s.expectedGoals = currentRates(session, m.tactics);
  updatePossession(session);
}
