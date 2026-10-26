/**
 * A real shootout (match-22, release 1.0 step 5.4; review M1 follow-up): five kicks a side,
 * then sudden death, played kick by kick in the session. The order of takers is each side's
 * players on the pitch at the end, best takers first and the keeper last; the career player on
 * the pitch takes one of the first five (choosing where to put it, as a penalty), or in goal
 * faces every kick (a save moment each). The other kicks go in by the taker's and the keeper's
 * attributes (`${seed}:shootout:kick:${index}`). Off the pitch, the shootout is simulated kick
 * by kick without moments. The tallies are the session's (`sessionPenalties`).
 */
import { createRng } from '../rng';
import type { Player, ReplayFrame } from '../../model/domain';
import { keeperAttributesOf } from '../keeping';
import type { MatchSession, ShootoutKick } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { SITUATION_BY_ID } from './situations';
import { clamp, round6 } from './decisions';
import { event, line } from './events';
import { openMoment } from './moments';
import { finish } from './report';
import { offPitch, onPitch, sideTeam } from './shared';

const K = C.occasions.shootout;

/** A level knockout at the end (match-22): the shootout is due, whoever is on the pitch. */
export function shootoutDue22(session: MatchSession): boolean {
  const s = session.state,
    lead = session.setup.fixture?.shootoutLead;
  return (
    lead !== undefined && !s.penaltyShootout && s.match.score[0] - s.match.score[1] + lead === 0
  );
}

const takerSkill = (p: Player) =>
  (p.attributes.finishing + p.attributes.composure + p.attributes.setPieces) / 3;
const keeperSkill = (p: Player) => {
  const k = keeperAttributesOf(p);
  return (k.reflexes + k.diving + k.oneOnOnes) / 3;
};

/** Each side's takers: players on the pitch, best first, the keeper last (match-22). */
function takers(session: MatchSession, side: 0 | 1): string[] {
  const setup = session.setup;
  const team = side === 0 ? session.state.match.home : session.state.match.away;
  const players = onPitch(team);
  const keeperId = keeperOf(session, side);
  const order = players
    .filter((id) => id !== keeperId)
    .sort(
      (a, b) => takerSkill(setup.players[b]!) - takerSkill(setup.players[a]!) || (a < b ? -1 : 1),
    );
  // The career player, on the pitch and outfield, takes one of the first five.
  const own = setup.selectedPlayerId;
  const index = order.indexOf(own);
  if (index >= K.rounds && !offPitch(session.state)) {
    order.splice(index, 1);
    order.splice(K.rounds - 1, 0, own);
  }
  return [...order, keeperId];
}
/** The side's keeper on the pitch: the first-slot player, else its first keeper on. */
function keeperOf(session: MatchSession, side: 0 | 1): string {
  const team = side === 0 ? session.state.match.home : session.state.match.away;
  const players = onPitch(team);
  if (players.includes(team.starterIds[0]!)) return team.starterIds[0]!;
  return players.find((id) => session.setup.players[id]!.primaryPosition === 'GK') ?? players[0]!;
}

/** The shootout begins: the toss decides who kicks first (`${seed}:shootout:toss`). */
export function startShootout(session: MatchSession): void {
  const s = session.state;
  const first = createRng(`${session.setup.seed}:shootout:toss`).next() < 0.5 ? 0 : 1;
  s.penaltyShootout = { first, order: [takers(session, 0), takers(session, 1)], kicks: [] };
  event(
    session,
    'halftime',
    session.setup.players[session.setup.selectedPlayerId]!.clubId!,
    null,
    line(session, 'match.commentary.shootout-start'),
  );
}

/** Goals and kicks taken per side, home first. */
export function shootoutTally(kicks: readonly ShootoutKick[]) {
  const goals: [number, number] = [0, 0],
    taken: [number, number] = [0, 0];
  for (const kick of kicks) {
    taken[kick.side]++;
    if (kick.scored) goals[kick.side]++;
  }
  return { goals, taken };
}
/** The side that has won the shootout, or null while it goes on. */
export function shootoutWinner(kicks: readonly ShootoutKick[]): 0 | 1 | null {
  const { goals, taken } = shootoutTally(kicks);
  if (taken[0] <= K.rounds && taken[1] <= K.rounds) {
    for (const side of [0, 1] as const) {
      const other = (1 - side) as 0 | 1;
      if (goals[side] + (K.rounds - taken[side]) < goals[other]) return other;
    }
    if (taken[0] < K.rounds || taken[1] < K.rounds) return null;
  }
  if (taken[0] !== taken[1] || goals[0] === goals[1]) return null;
  return goals[0] > goals[1] ? 0 : 1;
}

/** The next kick: who takes it and who faces it. */
function nextKick(session: MatchSession) {
  const shootout = session.state.penaltyShootout!;
  const index = shootout.kicks.length;
  const side = (index % 2 === 0 ? shootout.first : 1 - shootout.first) as 0 | 1;
  const order = shootout.order[side];
  const takerId = order[Math.floor(index / 2) % order.length]!;
  return { index, side, takerId, keeperId: keeperOf(session, (1 - side) as 0 | 1) };
}

/**
 * One kick, on `advance`: the career player's own kick or save opens a moment; any other is
 * resolved by the taker's and keeper's attributes. The shootout ends when it is decided.
 */
export function playKick(session: MatchSession): void {
  const s = session.state,
    setup = session.setup;
  const { index, side, takerId, keeperId } = nextKick(session);
  const own = setup.selectedPlayerId;
  if (!offPitch(s) && (takerId === own || keeperId === own)) {
    openMoment(session, {
      kind: 'shootout',
      situation: SITUATION_BY_ID[keeperId === own ? 'penalty-save' : 'penalty']!,
    });
    // The moment names who is really at the spot and in goal, and the kick's number.
    const moment = s.currentMoment!;
    moment.situationParams = {
      ...moment.situationParams,
      attacker: setup.players[takerId]!.name,
      keeper: setup.players[keeperId]!.name,
      kick: String(Math.floor(index / 2) + 1),
    };
    delete moment.pressureKey;
    return;
  }
  const shootout = s.penaltyShootout!;
  const taker = setup.players[takerId]!,
    keeper = setup.players[keeperId]!;
  // A kick that would lose the shootout if missed is taken under more pressure.
  const decisive = shootoutWinner([...shootout.kicks, kickOf(side, takerId, keeperId, false)]);
  const probability = round6(
    clamp(
      K.base +
        (takerSkill(taker) - 60) * K.taker -
        (keeperSkill(keeper) - 60) * K.keeper -
        (decisive === 1 - side ? K.pressure : 0),
      K.minimum,
      K.maximum,
    ),
  );
  const roll = createRng(`${setup.seed}:shootout:kick:${index}`).next();
  record(session, { ...kickOf(side, takerId, keeperId, roll < probability), probability, roll });
}

const kickOf = (side: 0 | 1, takerId: string, keeperId: string, scored: boolean) => ({
  side,
  takerId,
  keeperId,
  scored,
  probability: 0,
  roll: 0,
});

/** The career player's kick or save, chosen at a moment (`${seed}:shootout:kick:${i}:${choice}`). */
export function resolveShootoutKick(session: MatchSession, choiceId: string): void {
  const s = session.state,
    setup = session.setup,
    moment = s.currentMoment!;
  const choice = moment.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('Invalid decision choice');
  const { index, side, takerId, keeperId } = nextKick(session);
  const roll = createRng(`${setup.seed}:shootout:kick:${index}:${choice.id}`).next();
  const success = roll < choice.probability;
  const keeping = keeperId === setup.selectedPlayerId;
  const p = setup.players[setup.selectedPlayerId]!;
  // The outcome is the player's own decision, with its odds and factors, for the report.
  event(
    session,
    keeping ? 'save' : 'shot',
    p.clubId!,
    p.id,
    line(
      session,
      `match.commentary.${keeping ? 'shootout-keeper' : 'shootout'}.${success ? 'success' : 'failure'}`,
    ),
    {
      input: { momentId: moment.id, choiceId: choice.id },
      success,
      roll,
      probability: choice.probability,
      factors: choice.factors,
    },
  );
  s.currentMoment = null;
  s.match.status = 'live';
  record(
    session,
    {
      side,
      takerId,
      keeperId,
      scored: keeping ? !success : success,
      probability: choice.probability,
      roll,
      choiceId: choice.id,
    },
    true,
  );
}

/** A kick is taken: recorded, shown and told; a decided shootout ends the match. */
function record(session: MatchSession, kick: ShootoutKick, told = false): void {
  const s = session.state;
  const shootout = s.penaltyShootout!;
  s.penaltyShootout = { ...shootout, kicks: [...shootout.kicks, kick] };
  if (!told) {
    const shown = event(
      session,
      kick.scored ? 'shot' : 'save',
      sideTeam(session, kick.side),
      kick.takerId,
      line(
        session,
        `match.commentary.shootout-kick.${kick.scored ? 'scored' : kick.roll > 0.9 ? 'missed' : 'saved'}`,
        kick.side,
      ),
    );
    shown.commentaryParams = {
      ...shown.commentaryParams,
      keeper: session.setup.players[kick.keeperId]!.name,
    };
  }
  s.motion = {
    kind: 'outcome',
    frames: kickFrames(session, kick),
    narrationStart: s.narration.length,
  };
  const winner = shootoutWinner(s.penaltyShootout.kicks);
  if (winner === null) return;
  const { goals } = shootoutTally(s.penaltyShootout.kicks);
  s.penalties = [goals[0], goals[1]];
  finish(session);
}

/**
 * The kick on the pitch: the taker at the spot and the keeper on the line at the right-hand
 * goal, everyone else waiting by the centre circle; the ball goes in, is saved, or goes wide.
 */
function kickFrames(session: MatchSession, kick: ShootoutKick): ReplayFrame[] {
  const s = session.state;
  const last = s.frames[s.frames.length - 1]!;
  const kicks = s.penaltyShootout!.kicks.length;
  const start = (s.match.minute + 1) * 60000 + kicks * 20000;
  const others = last.players.filter((p) => p.id !== kick.takerId && p.id !== kick.keeperId);
  const place = (id: string) => {
    if (id === kick.takerId) return { x: 86, y: 50 };
    if (id === kick.keeperId) return { x: 99, y: 50 };
    const index = others.findIndex((p) => p.id === id);
    return { x: 50 + (index % 2 ? 3 : -3), y: 20 + (index * 60) / Math.max(1, others.length - 1) };
  };
  const players = last.players.map((p) => ({
    id: p.id,
    point: place(p.id),
    animation: p.animation === 'off' ? 'off' : 'run',
  }));
  // Where the ball ends: inside a post, at the keeper, or wide (drawn from the roll).
  const high = kick.roll < 0.5;
  const end = kick.scored
    ? { x: 100, y: high ? 46 : 54 }
    : kick.roll > 0.9
      ? { x: 100, y: high ? 40 : 61 }
      : { x: 98.5, y: high ? 48 : 52 };
  const keeperEnd = { x: 99, y: kick.scored ? (high ? 56 : 44) : end.y };
  return [
    { timeMs: start, ball: { x: 88.5, y: 50 }, players, carrierId: null, ballMotion: 'dead' },
    {
      timeMs: start + 1400,
      ball: end,
      players: players.map((p) => (p.id === kick.keeperId ? { ...p, point: keeperEnd } : p)),
      carrierId: kick.scored ? null : kick.keeperId,
      ballMotion: 'shot',
    },
  ];
}
