/**
 * Coming off the bench (match-22, release 1.0 step 5.4; review M7). A career player the
 * manager leaves out of the eleven starts on the bench. Between the 55th and 80th minute (and in
 * extra time) the manager may bring them on, more readily for the role they were promised, when
 * the score calls for what they do, and when they are in form and fresh; a keeper comes on only
 * for an injured keeper. Once on, they get two to four key moments in the time left.
 * Changes are counted per side (`changesLeft`): the managers keep one back for the career
 * player while they can still use it, and extra time adds one more (modern rules).
 */
import { createRng } from '../rng';
import type { Position } from '../../model/domain';
import { selectedSlotIndex } from '../selection/lineup';
import type { Formation } from '../selection/formations';
import type { MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { round6 } from './decisions';
import { event, line } from './events';
import { substitutionOff } from './discipline';
import { fullTime, onBench, onPitch, selectedSide, sideTeam } from './shared';

const B = C.occasions.bench;
const ATTACK: readonly Position[] = ['ST', 'LW', 'RW', 'AM'];
const DEFENCE: readonly Position[] = ['GK', 'CB', 'LB', 'RB', 'DM'];

/**
 * Substitutions a side may still make (match-22): the limit, one more once extra time began,
 * less those made; on the career player's side the managers keep one back while the career
 * player can still use it (on the bench, or on the pitch since kick-off), unless `career`.
 */
export function changesLeft(session: MatchSession, side: 0 | 1, career = false): number {
  const s = session.state,
    m = s.match;
  const teamId = sideTeam(session, side);
  const made = m.events.filter((e) => e.kind === 'substitution' && e.teamId === teamId).length;
  const allowed = C.aiSubstitutions.limit + (s.regulation ? 1 : 0);
  const open =
    !career &&
    side === selectedSide(session.setup) &&
    (onBench(s) || (!s.bench && !s.substituted && !s.sentOff));
  return allowed - made - (open ? 1 : 0);
}

/** The manager's chance this minute of bringing the career player on. */
export function benchHazard(session: MatchSession): number {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  if (player.primaryPosition === 'GK' || !setup.bench) return 0;
  const extra = s.regulation !== undefined;
  const from = extra ? 91 : B.from,
    to = extra ? B.extraTo : B.to;
  if (s.added || m.minute < from || m.minute > to) return 0;
  const [start, peak, end] = B.ramp;
  const ramp = extra
    ? peak
    : m.minute <= B.peak
      ? start + ((peak - start) * (m.minute - B.from)) / (B.peak - B.from)
      : peak + ((end - peak) * (m.minute - B.peak)) / (B.to - B.peak);
  const own = selectedSide(setup);
  const margin = m.score[own]! - m.score[1 - own]!;
  const position = player.primaryPosition;
  const line = ATTACK.includes(position) ? 'attack' : DEFENCE.includes(position) ? 'defence' : '';
  const score = margin < 0 && line ? B.chasing[line] : margin > 0 && line ? B.leading[line] : 1;
  const form = Math.max(0.4, 1 + (player.form - 50) * B.form);
  const fatigue = Math.max(0.2, 1 - player.fatigue * B.fatigue);
  const asked = s.bench?.asked ? B.asked : 1;
  return round6(
    (B.base[setup.bench.role] ?? B.base.rotation!) * ramp * score * form * fatigue * asked,
  );
}

/** Each minute on the bench: the manager's draw (`${seed}:bench:${minute}`). */
export function benchCheck(session: MatchSession): void {
  const s = session.state;
  if (!onBench(s)) return;
  const hazard = benchHazard(session);
  if (hazard <= 0) return;
  if (createRng(`${session.setup.seed}:bench:${s.match.minute}`).next() < hazard) bringOn(session);
}

/**
 * The career player comes on: for `outgoing` (an injured player), or for whoever fills their
 * slot, else the outfielder most due a rest. Their moments are drawn for the time left.
 */
export function bringOn(session: MatchSession, outgoing?: string): boolean {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  const own = selectedSide(setup);
  if (!onBench(s) || changesLeft(session, own, true) <= 0) return false;
  const key = own === 0 ? 'home' : 'away';
  const team = m[key];
  const keeper = player.primaryPosition === 'GK';
  const fits = (id: string | undefined) =>
    id !== undefined &&
    onPitch(team).includes(id) &&
    (setup.players[id]!.primaryPosition === 'GK') === keeper;
  let off = outgoing;
  if (!fits(off)) {
    const slot = team.starterIds[selectedSlotIndex(player, team.formation as Formation)];
    off = fits(slot) ? slot : undefined;
  }
  if (!off && !keeper)
    off = substitutionOff(
      createRng(`${setup.seed}:bench:off`),
      onPitch(team).filter((id, index) => index > 0 && fits(id)),
      setup.players,
    );
  if (!off) return false;
  m[key] = {
    ...team,
    starterIds: team.starterIds.map((id) => (id === off ? player.id : id)),
    benchIds: team.benchIds.filter((id) => id !== player.id),
  };
  const sub = event(
    session,
    'substitution',
    team.teamId,
    off,
    line(session, 'match.commentary.bench-on'),
  );
  sub.receiverId = player.id;
  sub.commentaryParams = { ...sub.commentaryParams, receiver: player.name };
  s.bench = { ...s.bench, on: m.minute };
  s.momentMinutes = benchMoments(session);
  return true;
}

/**
 * Two to four key moments (`${seed}:bench:moments`) spread over the time left after coming on:
 * from two minutes after to the 89th (the 119th in extra time), fewer in a short cameo.
 */
function benchMoments(session: MatchSession): number[] {
  const s = session.state,
    on = s.match.minute;
  const end = on < 90 ? 89 : fullTime(session) - 1;
  const first = on + 2;
  const span = end - first + 1;
  if (span <= 0) return [];
  const rng = createRng(`${session.setup.seed}:bench:moments`);
  const drawn = rng.int(B.moments[0], B.moments[1]);
  const count = Math.max(1, Math.min(drawn, span < 6 ? 1 : span < 14 ? 2 : drawn));
  const minutes: number[] = [];
  for (let index = 0; index < count; index++) {
    const from = first + Math.floor((index * span) / count);
    const to = first + Math.floor(((index + 1) * span) / count) - 1;
    minutes.push(Math.max((minutes[index - 1] ?? 0) + 1, rng.int(from, Math.max(from, to))));
  }
  return minutes.filter((minute) => minute <= end);
}

/**
 * The moment count a moment's budget is divided by: the moments themselves, or for a player who
 * came on, as many as would fill a whole match at the same rate, so a cameo's moments carry
 * only the time it covered.
 */
export function momentCount(session: MatchSession): number {
  const s = session.state,
    count = s.momentMinutes.length;
  const on = s.bench?.on;
  if (on === undefined) return count;
  const end = on < 90 ? 90 : fullTime(session);
  return round6((count * 90) / Math.max(10, end - on));
}

/**
 * A keeper sent off (match-22, where keepers are booked): someone must go in goal. With a change
 * left and a keeper on the bench, the manager brings the reserve keeper on for an outfielder
 * (the career player, when they are that keeper on the bench); otherwise an outfielder takes
 * the gloves. The keeper's slot stays first, and the dismissed keeper is parked in the slot
 * the outfielder left, so every keyframe keeps the keeper in goal.
 */
export function keeperSentOff(session: MatchSession, side: 0 | 1, keeperId: string): void {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  const key = side === 0 ? 'home' : 'away';
  const team = m[key];
  if (team.starterIds[0] !== keeperId) return;
  const sentOff = team.sentOffIds ?? [];
  const outfield = team.starterIds.filter((id, slot) => slot > 0 && !sentOff.includes(id));
  if (!outfield.length) return;
  const own = side === selectedSide(setup);
  const career = setup.players[setup.selectedPlayerId]!;
  const careerKeeper = own && onBench(s) && career.primaryPosition === 'GK';
  const reserve = careerKeeper
    ? career.id
    : team.benchIds.find(
        (id) => id !== setup.selectedPlayerId && setup.players[id]!.primaryPosition === 'GK',
      );
  const change = reserve !== undefined && changesLeft(session, side, careerKeeper) > 0;
  // The outfielder who makes way (or takes the gloves): drawn like a manager's change, never the
  // career player.
  const pool = outfield.filter((id) => id !== setup.selectedPlayerId);
  const mover = substitutionOff(
    createRng(`${setup.seed}:keeper-off:${m.minute}:${side}`),
    pool.length ? pool : outfield,
    setup.players,
  );
  if (!mover) return;
  const slot = team.starterIds.indexOf(mover);
  const starterIds = [...team.starterIds];
  starterIds[0] = change ? reserve! : mover;
  starterIds[slot] = keeperId;
  m[key] = {
    ...team,
    starterIds,
    benchIds: change ? team.benchIds.filter((id) => id !== reserve) : team.benchIds,
  };
  if (!change) return;
  const sub = event(
    session,
    'substitution',
    team.teamId,
    mover,
    line(session, careerKeeper ? 'match.commentary.bench-on' : 'match.commentary.change'),
  );
  sub.receiverId = reserve!;
  sub.commentaryParams = { ...sub.commentaryParams, receiver: setup.players[reserve!]!.name };
  if (careerKeeper) {
    s.bench = { ...s.bench, on: m.minute };
    s.momentMinutes = benchMoments(session);
  }
}
