/**
 * In-match injuries (match-22, release 1.0 step 5.4; review M12). Players are hurt during the
 * match rather than only after it: the others are forced off and replaced while their side has
 * changes left, and the world's injury table takes them from the session at commit. The career
 * player takes a knock at the rate the career's injury system gives them: a serious one ends
 * their match, any other asks them to play on (tiring, with a risk of making it an injury) or
 * come off unhurt. The injury types are the career system's (`CONFIG.career.injuries.types`).
 */
import { createRng } from '../rng';
import { CONFIG } from '../config';
import type { MatchSession } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { clamp, round6 } from './decisions';
import { event, line } from './events';
import { replacement } from './lineup';
import { bringOn, changesLeft } from './bench';
import { currentRates, updatePossession } from './rates';
import { addedStamp, clockKey, offPitch, onBench, onPitch, selectedSide } from './shared';

const I = C.occasions.injuries;
const TYPES = CONFIG.career.injuries.types;

/** An injury type drawn by the career system's weights from a roll in [0, 1). */
export function injuryKind(roll: number): string {
  let pick = roll * TYPES.reduce((sum, type) => sum + type.weight, 0);
  for (const type of TYPES) {
    pick -= type.weight;
    if (pick < 0) return type.kind;
  }
  return TYPES[TYPES.length - 1]!.kind;
}

/**
 * The others' injuries this minute (`${seed}:injury:${clock}`, three draws a side): each player
 * on the pitch carries a hazard from their injury proneness and fatigue; one may be forced off.
 */
export function playerInjuries(session: MatchSession): void {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  const rng = createRng(`${setup.seed}:injury:${clockKey(s)}`);
  const hurt = new Set((s.injuries ?? []).map((injury) => injury.playerId));
  for (const side of [0, 1] as const) {
    const happens = rng.next(),
      who = rng.next(),
      kind = rng.next();
    const team = side === 0 ? m.home : m.away;
    const pool = onPitch(team).filter((id) => id !== setup.selectedPlayerId && !hurt.has(id));
    const hazards = pool.map((id) => {
      const p = setup.players[id]!;
      return (
        (I.aiPerNinety / 90) *
        (0.5 + p.hidden.injuryProneness / 100) *
        (1 + p.fatigue / I.fatigueWeight)
      );
    });
    const total = hazards.reduce((sum, value) => sum + value, 0);
    if (happens >= total) continue;
    let target = who * total,
      index = 0;
    for (; index < pool.length - 1; index++) {
      target -= hazards[index]!;
      if (target < 0) break;
    }
    const id = pool[index]!;
    s.injuries = [
      ...(s.injuries ?? []),
      { playerId: id, minute: m.minute, ...addedStamp(s), kind: injuryKind(kind) },
    ];
    forcedOff(session, side, id);
  }
}

/**
 * An injured player leaves: the career player from the bench when they are the change the
 * manager would make (always for an injured keeper, when the career player is the keeper on the
 * bench), else the best bench replacement; with no changes left, the player plays on.
 */
function forcedOff(session: MatchSession, side: 0 | 1, id: string): void {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  const key = side === 0 ? 'home' : 'away';
  const own = side === selectedSide(setup);
  const bench = m[key].benchIds;
  const best = replacement(session, bench, setup.players[id]!);
  if (own && onBench(s) && best === setup.selectedPlayerId) {
    if (bringOn(session, id)) return;
  }
  if (changesLeft(session, side) <= 0) return;
  const on = replacement(
    session,
    bench.filter((candidate) => candidate !== setup.selectedPlayerId),
    setup.players[id]!,
  );
  if (!on) return;
  const team = m[key];
  m[key] = {
    ...team,
    starterIds: team.starterIds.map((current) => (current === id ? on : current)),
    benchIds: team.benchIds.filter((current) => current !== on),
  };
  const sub = event(
    session,
    'substitution',
    team.teamId,
    id,
    line(session, 'match.commentary.injury-off', side),
  );
  sub.receiverId = on;
  sub.commentaryParams = { ...sub.commentaryParams, receiver: setup.players[on]!.name };
}

/** The career player's injury factor: the career's, or the player's own without a career. */
function careerFactor(session: MatchSession): number {
  const setup = session.setup;
  if (setup.injury) return setup.injury.factor;
  const p = setup.players[setup.selectedPlayerId]!;
  return (1 + p.fatigue / I.fatigueWeight) * (0.5 + p.hidden.injuryProneness / 100);
}

/**
 * Before the career player's next minute (`${seed}:knock:${clock}`, three draws): a knock, at
 * most one a match. A serious knock (or a rushed return breaking down) ends their match at once;
 * any other waits for their answer. Returns true when the answer is awaited. Playing on, the
 * knock may be aggravated each minute (`${seed}:aggravate:${clock}`).
 */
export function careerKnock(session: MatchSession): boolean {
  const s = session.state,
    setup = session.setup;
  if (offPitch(s) || s.match.status !== 'live') return false;
  if (s.knock) {
    if (s.knock.decision !== 'play-on' || s.knock.aggravated) return false;
    if (createRng(`${setup.seed}:aggravate:${clockKey(s)}`).next() >= I.playOn.aggravate)
      return false;
    s.knock = { ...s.knock, aggravated: { minute: s.match.minute, ...addedStamp(s) } };
    leave(session, 'match.commentary.injury-aggravated');
    return false;
  }
  const rng = createRng(`${setup.seed}:knock:${clockKey(s)}`);
  const incident = rng.next(),
    severity = rng.next(),
    kind = rng.next();
  const reinjury = setup.injury?.reinjury;
  const broke = reinjury ? reinjury.risk / 90 : 0;
  const knock = (I.knock * careerFactor(session)) / 90;
  if (incident >= broke + knock) return false;
  const serious = incident < broke || severity < I.serious;
  s.knock = {
    minute: s.match.minute,
    ...addedStamp(s),
    kind: incident < broke ? reinjury!.kind : injuryKind(kind),
    serious,
  };
  const player = setup.players[setup.selectedPlayerId]!;
  event(
    session,
    'tackle',
    player.clubId!,
    player.id,
    line(
      session,
      serious ? 'match.commentary.injury-serious' : 'match.commentary.injury',
      selectedSide(setup),
    ),
  );
  if (serious) {
    leave(session, 'match.commentary.injury-off');
    return false;
  }
  s.injuryDecisionPending = true;
  return true;
}

/** Whether the career player could come off for a knock: their side has a change left. */
export const canComeOff = (session: MatchSession) =>
  changesLeft(session, selectedSide(session.setup), true) > 0;

/** The answer to a knock: play on (tired, at a risk) or come off unhurt. */
export function answerKnock(session: MatchSession, response: 'play-on' | 'off'): void {
  const s = session.state;
  if (!s.injuryDecisionPending || !s.knock || s.knock.decision)
    throw new Error('No injury decision pending');
  if (response === 'off' && !canComeOff(session)) throw new Error('No change left');
  delete s.injuryDecisionPending;
  s.knock = { ...s.knock, decision: response };
  if (response === 'play-on')
    s.stats.fatigue = round6(clamp(s.stats.fatigue + I.playOn.fatigue, 0, 100));
  else leave(session, 'match.commentary.injury-precaution');
}

/**
 * The career player leaves hurt (or as a precaution): replaced from the bench while a change
 * remains. Their match ends here, as a substitution does.
 */
function leave(session: MatchSession, key: string): void {
  const s = session.state,
    m = s.match,
    setup = session.setup;
  const player = setup.players[setup.selectedPlayerId]!;
  const side = selectedSide(setup);
  const team = side === 0 ? 'home' : 'away';
  const current = m[team];
  s.substituted = true;
  s.captainDecisionPending = false;
  const incoming =
    changesLeft(session, side, true) > 0
      ? replacement(session, current.benchIds, player)
      : undefined;
  if (incoming) {
    m[team] = {
      ...current,
      starterIds: current.starterIds.map((id) => (id === player.id ? incoming : id)),
      benchIds: current.benchIds.filter((id) => id !== incoming),
    };
    const sub = event(session, 'substitution', current.teamId, player.id, line(session, key, side));
    sub.receiverId = incoming;
    sub.commentaryParams = { ...sub.commentaryParams, receiver: setup.players[incoming]!.name };
  }
  s.expectedGoals = currentRates(session, m.tactics);
  updatePossession(session);
}
