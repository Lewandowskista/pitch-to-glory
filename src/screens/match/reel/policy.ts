import {
  rules22,
  touchlinePolicy,
  type MatchCommand,
  type MatchSession,
} from '../../../engine/match/core';
import { expectedImpact } from '../../../engine/match/value';
import { CONFIG } from '../../../engine/config';
import { createRng } from '../../../engine/rng';

/**
 * The headless policy for Watch highlights and Simulate (release 1.0, X1b): the same decisions
 * as the season simulation's `autoPlayCommand` (engine/career/matches.ts), kept here so the
 * match screen does not load the career's commit code to use it. A test asserts the two agree
 * command for command; Simulate's attribute-driven policy (6.3) replaces both.
 */
export function reelPolicy(session: MatchSession): MatchCommand {
  const s = session.state;
  if (s.match.status === 'preview') return { type: 'kickoff' };
  const touchline = rules22(session.setup) ? touchlinePolicy(session) : null;
  if (touchline) return touchline;
  if (s.match.status === 'halftime') return { type: 'halftime', response: 'motivate' };
  if (s.substitutionDecisionPending) return { type: 'substitution', response: 'accept' };
  if (s.captainDecisionPending) {
    const own =
      session.setup.players[session.setup.selectedPlayerId]!.clubId === session.setup.home.id
        ? 0
        : 1;
    const behind = s.match.score[own]! < s.match.score[1 - own]!;
    return { type: 'captain', instruction: behind ? 'push' : 'calm' };
  }
  if (s.currentMoment) {
    const ranked = [...s.currentMoment.choices]
      .map((choice) => ({ choice, net: expectedImpact(choice).net }))
      .sort((a, b) => b.net - a.net || (a.choice.id < b.choice.id ? -1 : 1));
    const best = ranked[0]!.net;
    const margin = rules22(session.setup)
      ? CONFIG.match.moments22.autoPlayMargin
      : CONFIG.match.autoPlayMargin;
    const near = ranked.filter((entry) => entry.net >= best - margin);
    const pick = createRng(`${session.setup.seed}:auto:${s.currentMoment.id}`).int(
      0,
      near.length - 1,
    );
    return { type: 'choose', choiceId: near[pick]!.choice.id };
  }
  return { type: 'advance' };
}
