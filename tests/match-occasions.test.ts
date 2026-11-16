import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import { CONFIG } from '../src/engine/config';
import {
  applyMatchCommand,
  benchHazard,
  canComeOff,
  createMatchSession,
  createMatchSetup,
  onBench,
  requestableRoles,
  roleRefusal,
  rolePosition,
  rolesForPosition,
  shootoutWinner,
  validateMatchSession,
  type MatchCommand,
  type MatchSession,
  type MatchSetup,
  type ShootoutKick,
} from '../src/engine/match';
import { hasMatchLabel } from '../src/i18n/match';
import '../src/i18n/occasions';
import { hasCommentaryLabel } from '../src/i18n/commentary';
import { commentaryVariants } from '../src/engine/match/commentary';
import type { Position } from '../src/model/domain';
import { onEngine, playOnEngines } from './support/engines';

/**
 * The occasions (release 1.0 step 5.4, engine match-22): stoppage time, coming off the bench,
 * a real shootout, in-match injuries and touchline decisions with trade-offs. Match-21
 * sessions never see them (the outcome snapshot pins that).
 */
const world = generateWorld('match-occasions', { format: 'legacy' });
const clubs = Object.values(world.clubs);
const O = CONFIG.match.occasions;
const tacticsFor = (setup: MatchSetup) => ({
  role: rolesForPosition(rolePosition(setup))[0]!,
  risk: 'balanced' as const,
  mentality: 'balanced' as const,
});
function setupFor(
  position: Position,
  seed: string,
  options: Parameters<typeof createMatchSetup>[5] = {},
  pair = 0,
): MatchSetup {
  const home = clubs[(pair * 2) % clubs.length]!,
    away = clubs[(pair * 2 + 1) % clubs.length]!;
  const id =
    home.playerIds.find((pid) => world.players[pid]!.primaryPosition === position) ??
    home.playerIds[0]!;
  return createMatchSetup(world, home.id, away.id, id, seed, options);
}
function play(
  setup: MatchSetup,
  command: (session: MatchSession) => MatchCommand = autoPlayCommand,
  keep?: (session: MatchSession) => void,
): MatchSession {
  let session = createMatchSession(setup, tacticsFor(setup));
  while (session.state.match.status !== 'finished') {
    session = applyMatchCommand(session, command(session));
    keep?.(session);
  }
  return session;
}
const knockout = (id: string, extraTime = false) => ({
  fixture: {
    id,
    competitionId: 'cup',
    importance: 1.5,
    shootoutLead: 0,
    ...(extraTime ? { extraTimeLead: 0 } : {}),
  },
});
/** Plays a session until `until` holds (or full time). */
function playUntil(
  session: MatchSession,
  until: (session: MatchSession) => boolean,
  command: (session: MatchSession) => MatchCommand = autoPlayCommand,
): MatchSession {
  while (session.state.match.status !== 'finished' && !until(session))
    session = applyMatchCommand(session, command(session));
  return session;
}

describe('stoppage time (match-22)', () => {
  const sessions = Array.from({ length: 40 }, (_, index) =>
    play(setupFor((['ST', 'CM', 'CB', 'GK'] as const)[index % 4]!, `stoppage-${index}`)),
  );
  it('shows a board at 45 and 90 within the bands, and plays the added minutes', () => {
    for (const session of sessions) {
      const boards = session.state.stoppage!;
      const first = boards.find((board) => board.at === 45)!;
      const second = boards.find((board) => board.at === 90)!;
      expect(first.minutes).toBeGreaterThanOrEqual(1);
      expect(first.minutes).toBeLessThanOrEqual(4);
      expect(second.minutes).toBeGreaterThanOrEqual(3);
      expect(second.minutes).toBeLessThanOrEqual(O.stoppage.long.upTo);
      // The half-time whistle comes after the first half's added minutes.
      const events = session.state.match.events;
      const whistle = events.findIndex(
        (e) => e.kind === 'halftime' && e.commentaryKey.includes('.halftime-'),
      );
      const board = events.findIndex((e) =>
        e.commentaryKey.startsWith('match.commentary.stoppage.'),
      );
      expect(board).toBeGreaterThanOrEqual(0);
      expect(board).toBeLessThan(whistle);
      expect(events[board]!.commentaryParams?.added).toBe(String(first.minutes));
      // One rating sample a minute played, added minutes included.
      expect(session.state.ratingByMinute.length).toBe(90 + first.minutes + second.minutes);
      // Minutes played count regulation time only.
      if (!session.state.substituted && !session.state.sentOff)
        expect(session.state.selectedPlayerMinutes).toBe(90);
    }
  });
  it('stamps what happens in added time with its added minute', () => {
    const stamped = sessions.flatMap((session) =>
      session.state.match.events.filter((event) => event.addedTime),
    );
    expect(stamped.length).toBeGreaterThan(0);
    for (const event of stamped) {
      expect([45, 90]).toContain(event.minute);
      expect(event.addedTime).toBeGreaterThanOrEqual(1);
    }
  });
  it('replays exactly, and leaves match-21 without any of it', () => {
    const [current, previous] = playOnEngines(setupFor('ST', 'stoppage-engines'), {
      role: 'balanced',
      risk: 'balanced',
      mentality: 'balanced',
    });
    expect(current!.state.stoppage?.length).toBeGreaterThanOrEqual(2);
    expect(previous!.state.stoppage).toBeUndefined();
    expect(previous!.state.match.events.some((event) => event.addedTime)).toBe(false);
    expect(previous!.state.ratingByMinute.length).toBe(90);
  });
  it('has copy for every engine key it writes', () => {
    for (const family of [
      'stoppage',
      'bench-on',
      'injury',
      'injury-serious',
      'injury-off',
      'injury-precaution',
      'injury-aggravated',
      'shootout-start',
      'shootout-kick.scored',
      'shootout-kick.saved',
      'shootout-kick.missed',
    ])
      for (let variant = 0; variant < commentaryVariants(family); variant++)
        expect(hasCommentaryLabel(`match.commentary.${family}.${variant}`)).toBe(true);
    for (const key of ['shootout-kick', 'shootout-kick-keeper'])
      for (let variant = 0; variant < CONFIG.match.drama.situationVariants; variant++)
        expect(hasMatchLabel(`match.situation.${key}.${variant}`)).toBe(true);
  });
});

describe('coming off the bench (match-22)', () => {
  const roles = ['key', 'rotation', 'backup', 'youth'] as const;
  const sessions = Array.from({ length: 48 }, (_, index) =>
    play(
      setupFor((['ST', 'CM', 'RW', 'CB'] as const)[index % 4]!, `bench-${index}`, {
        bench: roles[index % 4],
      }),
    ),
  );
  it('starts the player on the bench, off the pitch', () => {
    const session = createMatchSession(
      setupFor('ST', 'bench-start', { bench: 'rotation' }),
      tacticsFor(setupFor('ST', 'bench-start', { bench: 'rotation' })),
    );
    const own = session.state.match.home;
    expect(own.starterIds).not.toContain(session.setup.selectedPlayerId);
    expect(own.benchIds[0]).toBe(session.setup.selectedPlayerId);
    expect(own.benchIds.length).toBeLessThanOrEqual(CONFIG.match.benchSize);
    expect(onBench(session.state)).toBe(true);
    expect(session.state.momentMinutes).toEqual([]);
    // Match-21 never benches: the flag only exists under rules22.
    const previous = createMatchSession(
      onEngine(session.setup, 'match-21'),
      tacticsFor(session.setup),
    );
    expect(previous.state.match.home.starterIds).toContain(session.setup.selectedPlayerId);
    expect(previous.state.bench).toBeUndefined();
  });
  it('brings them on between 55 and 80 minutes, with two to four moments after', () => {
    const on = sessions.filter((session) => session.state.bench?.on !== undefined);
    expect(on.length).toBeGreaterThan(sessions.length / 2);
    for (const session of on) {
      const minute = session.state.bench!.on!;
      // By the manager's choice in the window, or earlier for an injured teammate.
      const injury = session.state.injuries?.some((entry) => entry.minute === minute);
      if (!injury) {
        expect(minute).toBeGreaterThanOrEqual(O.bench.from);
        expect(minute).toBeLessThanOrEqual(O.bench.to);
      }
      const sub = session.state.match.events.find(
        (event) =>
          event.kind === 'substitution' && event.receiverId === session.setup.selectedPlayerId,
      )!;
      expect(sub.minute).toBe(minute);
      for (const moment of session.state.match.keyMoments)
        expect(moment.minute).toBeGreaterThan(minute);
      expect(session.state.selectedPlayerMinutes).toBeLessThanOrEqual(90 - minute);
      expect(session.state.report!.bench!.cameOn).toBe(minute);
    }
  });
  it('records an unused substitute with no XP or fame', () => {
    const unused = sessions.filter((session) => session.state.bench?.on === undefined);
    expect(unused.length).toBeGreaterThan(0);
    for (const session of unused) {
      expect(session.state.match.keyMoments).toEqual([]);
      expect(session.state.selectedPlayerMinutes).toBe(0);
      expect(session.state.report!.bench).toEqual({ cameOn: null });
      expect(session.state.report!.xp).toBe(0);
      expect(session.state.report!.fameDelta).toBe(0);
      expect(session.state.headlineKey).toMatch(/^match\.headline\.unused-sub\./);
    }
  });
  it('brings a key player on more readily than a youth player', () => {
    const rate = (role: (typeof roles)[number]) => {
      const list = sessions.filter((session) => session.setup.bench?.role === role);
      return list.filter((session) => session.state.bench?.on !== undefined).length / list.length;
    };
    expect(rate('key')).toBeGreaterThan(rate('youth'));
  });
  it('lets the player ask to come on at half-time, at a cost in trust', () => {
    const setup = setupFor('ST', 'bench-ask', { bench: 'backup' });
    let session = playUntil(
      createMatchSession(setup, tacticsFor(setup)),
      (s) => s.state.match.status === 'halftime',
    );
    expect(() => applyMatchCommand(session, { type: 'halftime', response: 'role' })).toThrow();
    const before = benchHazard(session);
    session = applyMatchCommand(session, { type: 'halftime', response: 'complain' });
    expect(session.state.bench?.asked).toBe(true);
    expect(session.state.managerTrustDelta).toBe(O.bench.askTrust);
    expect(before).toBe(0);
  });
  it('keeps a bench keeper on the bench unless the keeper is hurt', () => {
    for (let index = 0; index < 8; index++) {
      const session = play(setupFor('GK', `bench-keeper-${index}`, { bench: 'rotation' }));
      if (session.state.bench?.on !== undefined)
        expect(
          session.state.injuries?.some(
            (injury) => session.setup.players[injury.playerId]!.primaryPosition === 'GK',
          ),
        ).toBe(true);
    }
  });
  it('replays a bench session exactly', () => {
    const session = sessions.find((s) => s.state.bench?.on !== undefined)!;
    expect(JSON.stringify(validateMatchSession(JSON.parse(JSON.stringify(session))))).toBe(
      JSON.stringify(session),
    );
  });
});

describe('a real shootout (match-22)', () => {
  const kick = (side: 0 | 1, scored: boolean): ShootoutKick => ({
    side,
    takerId: 'a',
    keeperId: 'b',
    scored,
    probability: 0.75,
    roll: 0.5,
  });
  it('is decided as soon as one side cannot catch up, then by sudden death', () => {
    // Home scores three, away misses three: 3–0 with two left each is decided.
    const early = [true, false, true, false, true, false].map((scored, i) =>
      kick((i % 2) as 0 | 1, scored),
    );
    expect(shootoutWinner(early)).toBe(0);
    expect(shootoutWinner(early.slice(0, 5))).toBeNull();
    // Level after five each: sudden death until a round splits them.
    const level = Array.from({ length: 10 }, (_, i) => kick((i % 2) as 0 | 1, true));
    expect(shootoutWinner(level)).toBeNull();
    expect(shootoutWinner([...level, kick(0, true), kick(1, false)])).toBe(0);
    expect(shootoutWinner([...level, kick(0, false)])).toBeNull();
  });
  const shootouts = (position: Position, count: number, extraTime = false) =>
    Array.from({ length: count }, (_, index) =>
      play(setupFor(position, `shootout-${position}-${index}`, knockout(`ko-${index}`, extraTime))),
    ).filter((session) => session.state.penaltyShootout);
  it('lets an outfield player take a kick, choosing the placement', () => {
    const list = shootouts('ST', 40);
    expect(list.length).toBeGreaterThan(0);
    for (const session of list) {
      const s = session.state;
      const own = s.penaltyShootout!.kicks.filter((k) => k.choiceId);
      expect(own.length).toBeLessThanOrEqual(1);
      for (const k of own) expect(k.takerId).toBe(session.setup.selectedPlayerId);
      const moments = session.state.match.keyMoments.filter((m) => m.follows === 'shootout');
      expect(moments.length).toBe(own.length);
      for (const moment of moments) {
        expect(moment.situationId).toBe('penalty');
        expect(moment.situationKey).toMatch(/^match\.situation\.shootout-kick\.\d$/);
      }
      expect(s.penalties).toBeDefined();
      expect(s.penalties![0]).not.toBe(s.penalties![1]);
      expect(shootoutWinner(s.penaltyShootout!.kicks)).toBe(
        s.penalties![0] > s.penalties![1] ? 0 : 1,
      );
      // The scoreboard keeps the match score: kicks are never goals.
      expect(s.match.score[0] - s.match.score[1]).toBe(0);
    }
  });
  it('lets the keeper face every kick', () => {
    const list = shootouts('GK', 40);
    expect(list.length).toBeGreaterThan(0);
    for (const session of list) {
      const own = session.state.penaltyShootout!.kicks.filter(
        (k) => k.keeperId === session.setup.selectedPlayerId,
      );
      expect(own.length).toBeGreaterThan(0);
      for (const k of own) expect(k.choiceId).toBeDefined();
      expect(
        session.state.match.keyMoments.filter((m) => m.situationId === 'penalty-save').length,
      ).toBeGreaterThanOrEqual(own.length);
    }
  });
  it('is simulated kick by kick when the player is off the pitch', () => {
    const list = Array.from({ length: 30 }, (_, index) =>
      play(
        setupFor('ST', `shootout-off-${index}`, knockout(`off-${index}`)),
        (session) =>
          session.state.substitutionDecisionPending
            ? { type: 'substitution', response: 'accept' }
            : autoPlayCommand(session),
        undefined,
      ),
    ).filter((session) => session.state.penaltyShootout && session.state.substituted);
    for (const session of list) {
      expect(session.state.penaltyShootout!.kicks.every((k) => !k.choiceId)).toBe(true);
      expect(session.state.penalties).toBeDefined();
    }
  });
  it('replays a shootout session exactly', () => {
    const session = shootouts('GK', 20)[0]!;
    expect(JSON.stringify(validateMatchSession(JSON.parse(JSON.stringify(session))))).toBe(
      JSON.stringify(session),
    );
  });
});

describe('in-match injuries (match-22)', () => {
  it('forces other players off and replaces them while changes remain', () => {
    let injured = 0;
    for (let index = 0; index < 40; index++) {
      const session = play(setupFor('CM', `injuries-${index}`));
      for (const injury of session.state.injuries ?? []) {
        injured++;
        expect(injury.playerId).not.toBe(session.setup.selectedPlayerId);
        expect(CONFIG.career.injuries.types.map((type) => type.kind)).toContain(injury.kind);
      }
    }
    expect(injured).toBeGreaterThan(0);
  });
  const prone = (seed: string) => setupFor('ST', seed, { injury: { factor: 20 } });
  it('asks the career player to play on or come off after a knock', () => {
    let asked = 0;
    for (let index = 0; index < 30 && asked < 3; index++) {
      const setup = prone(`knock-${index}`);
      const session = playUntil(createMatchSession(setup, tacticsFor(setup)), (s) =>
        Boolean(s.state.injuryDecisionPending),
      );
      if (!session.state.injuryDecisionPending) continue;
      asked++;
      expect(() => applyMatchCommand(session, { type: 'advance' })).toThrow();
      const off = applyMatchCommand(session, { type: 'injury', response: 'off' });
      expect(off.state.substituted).toBe(true);
      expect(off.state.knock?.decision).toBe('off');
      const on = applyMatchCommand(session, { type: 'injury', response: 'play-on' });
      expect(on.state.substituted).toBe(false);
      expect(on.state.stats.fatigue).toBeCloseTo(
        Math.min(100, session.state.stats.fatigue + O.injuries.playOn.fatigue),
        5,
      );
      expect(canComeOff(session)).toBe(true);
    }
    expect(asked).toBeGreaterThan(0);
  });
  it('ends the match of a seriously hurt player without a choice', () => {
    let serious = 0;
    for (let index = 0; index < 60; index++) {
      const session = play(prone(`serious-${index}`));
      if (!session.state.knock?.serious) continue;
      serious++;
      expect(session.state.substituted).toBe(true);
      expect(session.state.knock.decision).toBeUndefined();
    }
    expect(serious).toBeGreaterThan(0);
  });
  it('books keepers too', () => {
    let keepers = 0;
    for (let index = 0; index < 60; index++) {
      const session = play(setupFor('ST', `keeper-cards-${index}`));
      keepers += session.state.match.events.filter(
        (event) =>
          event.kind === 'card' && session.setup.players[event.playerId!]!.primaryPosition === 'GK',
      ).length;
    }
    expect(keepers).toBeGreaterThan(0);
  });
  it('gives each side one more change in extra time', () => {
    let extra = 0;
    for (let index = 0; index < 60; index++) {
      const session = play(setupFor('CB', `extra-subs-${index}`, knockout(`et-${index}`, true)));
      if (!session.state.regulation) continue;
      for (const teamId of [session.setup.home.id, session.setup.away.id]) {
        const subs = session.state.match.events.filter(
          (event) => event.kind === 'substitution' && event.teamId === teamId,
        );
        expect(subs.length).toBeLessThanOrEqual(CONFIG.match.aiSubstitutions.limit + 1);
        extra += subs.filter((event) => event.minute > 90).length;
      }
    }
    expect(extra).toBeGreaterThan(0);
  });
});

describe('touchline decisions (match-22)', () => {
  const halftime = (seed: string, options: Parameters<typeof createMatchSetup>[5] = {}) => {
    const setup = setupFor('RW', seed, options);
    return playUntil(
      createMatchSession(setup, tacticsFor(setup)),
      (s) => s.state.match.status === 'halftime',
    );
  };
  it('lets the player choose the role, refused less often with more trust', () => {
    const session = halftime('touchline-role');
    const roles = requestableRoles(session);
    expect(roles.length).toBe(rolesForPosition(rolePosition(session.setup)).length - 1);
    expect(roles).not.toContain(session.state.match.tactics.role);
    const role = roles[roles.length - 1]!;
    const trusted = halftime('touchline-role', { trust: 95 });
    const doubted = halftime('touchline-role', { trust: 5 });
    expect(roleRefusal(trusted, role)).toBeLessThan(roleRefusal(doubted, role));
    const next = applyMatchCommand(session, { type: 'halftime', response: 'role', role });
    const request = next.state.roleRequest!;
    expect(request.role).toBe(role);
    expect(request.granted).toBe(request.roll >= request.refusal);
    expect(next.state.match.tactics.role).toBe(
      request.granted ? role : session.state.match.tactics.role,
    );
    expect(() =>
      applyMatchCommand(session, {
        type: 'halftime',
        response: 'role',
        role: session.state.match.tactics.role,
      }),
    ).toThrow();
    expect(() =>
      applyMatchCommand(session, { type: 'halftime', response: 'motivate', role } as MatchCommand),
    ).toThrow();
  });
  it('gives each half-time answer a context where it is best', () => {
    const session = halftime('touchline-motivate');
    // Motivating lifts momentum more when behind than when ahead.
    const lift = (margin: number) => {
      const copy = structuredClone(session);
      copy.state.match.score = margin >= 0 ? [margin, 0] : [0, -margin];
      return applyMatchCommand(copy, { type: 'halftime', response: 'motivate' }).state.match
        .momentum;
    };
    expect(lift(-1)).toBeGreaterThan(lift(1));
    // A demand for the ball costs little after a good first half and more after a poor one.
    const demand = (rating: number) => {
      const copy = structuredClone(session);
      copy.state.stats.rating = rating;
      return applyMatchCommand(copy, { type: 'halftime', response: 'complain' }).state
        .managerTrustDelta;
    };
    expect(demand(7.5)).toBeGreaterThan(demand(5.5));
    // It also puts more of the second half through the player: extra key moments.
    const more = applyMatchCommand(session, { type: 'halftime', response: 'complain' });
    expect(more.state.momentMinutes.length).toBeGreaterThan(session.state.momentMinutes.length);
  });
  it('makes accepting a substitution earn trust and rallying lift momentum', () => {
    for (let index = 0; index < 30; index++) {
      // A tired player, so the manager takes them off.
      const setup = setupFor('ST', `touchline-sub-${index}`, { injury: { factor: 0 } });
      setup.players[setup.selectedPlayerId]!.fatigue = 95;
      const session = playUntil(
        createMatchSession(setup, tacticsFor(setup)),
        (s) => s.state.substitutionDecisionPending,
      );
      if (!session.state.substitutionDecisionPending) continue;
      const accept = applyMatchCommand(session, { type: 'substitution', response: 'accept' });
      const rally = applyMatchCommand(session, { type: 'substitution', response: 'encourage' });
      expect(accept.state.managerTrustDelta).toBe(
        session.state.managerTrustDelta + O.touchline.substitution.acceptTrust,
      );
      expect(rally.state.managerTrustDelta).toBe(session.state.managerTrustDelta);
      // Rallying lifts the side's odds for the rest of the match, and dents the opposition's.
      const own =
        session.setup.players[session.setup.selectedPlayerId]!.clubId === session.setup.home.id
          ? 0
          : 1;
      expect(rally.state.rally).toBe(true);
      expect(rally.state.expectedGoals[own]).toBeGreaterThan(accept.state.expectedGoals[own]!);
      expect(rally.state.expectedGoals[1 - own]).toBeLessThan(accept.state.expectedGoals[1 - own]!);
      return;
    }
    throw new Error('No substitution in 30 matches');
  });
  it('asks the captain after conceding and late on, a few times at most', () => {
    let after = 0;
    for (let index = 0; index < 30; index++) {
      const session = play(setupFor('CB', `captain-${index}`, { captain: true }));
      const calls = session.state.captainCalls ?? [];
      expect(calls.length).toBeLessThanOrEqual(O.touchline.captain.maximum);
      if (calls.some((minute) => minute > 46)) after++;
    }
    expect(after).toBeGreaterThan(0);
  });
});
