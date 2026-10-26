/**
 * The managers' own substitutions (match-15). The selected player's is checked with each
 * minute they play (commands.ts).
 */
import { createRng } from '../rng';
import type { MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { substitutionOff, substitutionPlan } from './discipline';
import { event, line } from './events';
import { replacement } from './lineup';
import { selectedSide } from './shared';

/**
 * The managers' substitutions (match-15): each side's plan from `${seed}:ai-subs` (60–80′, at
 * most the limit, one fewer on the career player's side so their own change always fits); who
 * comes off is drawn at the minute among outfielders who started (never the career player),
 * the tired, unfit and out of form most likely, and the best bench replacement comes on.
 */
export function managerSubstitutions(session: MatchSession): void {
  const m = session.state.match,
    setup = session.setup,
    S = C.aiSubstitutions;
  if (m.minute < S.from || m.minute > S.to) return;
  const own = selectedSide(setup);
  const plan = substitutionPlan(
    setup.seed,
    own === 0 ? [S.limit - 1, S.limit] : [S.limit, S.limit - 1],
  );
  for (const side of [0, 1] as const) {
    const due = plan[side]!.filter((minute) => minute === m.minute).length;
    for (let change = 0; change < due; change++) {
      const key = side === 0 ? 'home' : 'away';
      const team = m[key];
      const made = m.events.filter((e) => e.kind === 'substitution' && e.teamId === team.teamId);
      if (made.length >= S.limit) break;
      const cameOn = new Set(made.map((e) => e.receiverId));
      // A player sent off (match-16) cannot be replaced.
      const sentOff = team.sentOffIds ?? [];
      const candidates = team.starterIds.filter(
        (id, slot) =>
          slot > 0 &&
          id !== setup.selectedPlayerId &&
          !cameOn.has(id) &&
          !sentOff.includes(id) &&
          setup.players[id]!.primaryPosition !== 'GK',
      );
      const rng = createRng(`${setup.seed}:ai-subs:${m.minute}:${side}:${change}`);
      const off = substitutionOff(rng, candidates, setup.players);
      const on = off ? replacement(session, team.benchIds, setup.players[off]!) : undefined;
      if (!off || !on) continue;
      m[key] = {
        ...team,
        starterIds: team.starterIds.map((id) => (id === off ? on : id)),
        benchIds: team.benchIds.filter((id) => id !== on),
      };
      const sub = event(
        session,
        'substitution',
        team.teamId,
        off,
        line(session, 'match.commentary.change', side),
      );
      sub.receiverId = on;
      sub.commentaryParams = { ...sub.commentaryParams, receiver: setup.players[on]!.name };
    }
  }
}
