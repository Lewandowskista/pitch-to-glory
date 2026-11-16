import { describe, expect, it } from 'vitest';
import type { KeyMoment, Player, Position } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import {
  buildChoices,
  expectedImpact,
  situationWeights,
  skillEffects,
  type DecisionContext,
} from '../src/engine/match/decisions';
import {
  ALL_SITUATIONS,
  SITUATIONS_22,
  UNLOCKS_22,
  situationOf,
} from '../src/engine/match/situations22';
import { READS } from '../src/engine/match/readTable';
import { contextReads, markedBy } from '../src/engine/match/reads';
import { bookingRisk } from '../src/engine/match/discipline';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import { autoPlayCommand } from '../src/engine/career/matches';
import { generateWorld } from '../src/engine/world/generate';
import { hasMatchLabel } from '../src/i18n/match';
import { onEngine, playOnEngines } from './support/engines';

/**
 * Choices that decide matches (release 1.0 step 5.2, engine match-22): reads of the play as
 * named odds factors, new situations per position, skill choices replacing the weakest base
 * choice, Clutch's condition, counters, the professional foul and the marked man. Match-21 is
 * pinned by the outcome snapshot.
 */
const M = CONFIG.match.moments22;
const KEYS = [
  'finishing',
  'passing',
  'dribbling',
  'firstTouch',
  'crossing',
  'heading',
  'tackling',
  'longShots',
  'setPieces',
  'pace',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'jumping',
  'vision',
  'composure',
  'positioning',
  'decisions',
  'workRate',
  'leadership',
  'aggression',
];
const KEEPING = [
  'handling',
  'reflexes',
  'diving',
  'oneOnOnes',
  'kicking',
  'commandOfArea',
  'aerialReach',
];
function player(traits: string[] = []): DecisionContext['player'] {
  return {
    id: 'p',
    attributes: Object.fromEntries(KEYS.map((key) => [key, 60])) as Player['attributes'],
    keeperAttributes: Object.fromEntries(
      KEEPING.map((key) => [key, 60]),
    ) as Player['keeperAttributes'],
    traits,
    morale: CONFIG.career.social.matchMorale.neutral,
    hidden: {
      injuryProneness: 50,
      bigMatchTemperament: 50,
      consistency: 100,
      professionalism: 50,
      ambition: 50,
      revealed: [],
    },
  };
}
function context(situationId: string, overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    player: player(),
    situation: situationOf(situationId)!,
    budget: { for: 0.08, against: 0.06 },
    matchLevel: 60,
    importance: 1,
    fatigue: 0,
    tactics: { role: 'balanced', risk: 'balanced', mentality: 'balanced' },
    weather: 'clear',
    pitchCondition: 90,
    strengthGap: 0,
    opponents: { keeper: 60, defender: 60, attacker: 60 },
    momentum: 50,
    talkOdds: 1,
    teammateFinishing: 60,
    consistencyShift: 0,
    chemistry: 60,
    rules22: true,
    ...overrides,
  };
}
const sum = (choice: { factors: { contribution: number }[] }) =>
  Math.round(choice.factors.reduce((total, f) => total + f.contribution, 0) * 1e6) / 1e6;

const world = generateWorld('match-choices-22', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
function setupAt(position: Position, seed: string): MatchSetup {
  const id = clubs[0]!.playerIds.find((p) => world.players[p]!.primaryPosition === position)!;
  return createMatchSetup(world, clubs[0]!.id, clubs[1]!.id, id, seed);
}
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
function play(session: MatchSession): MatchSession {
  while (session.state.match.status !== 'finished')
    session = applyMatchCommand(session, autoPlayCommand(session));
  return session;
}

describe('reads of the play (match-22)', () => {
  it('name every read and state, and every new choice and framing, in the copy', () => {
    for (const reads of Object.values(READS))
      for (const read of reads)
        for (const state of read.states)
          expect(hasMatchLabel(`match.read.${read.id}.${state.id}`), `${read.id}.${state.id}`).toBe(
            true,
          );
    expect(hasMatchLabel('match.read.marked.double')).toBe(true);
    expect(hasMatchLabel('match.factor.clutch')).toBe(true);
    for (const situation of ALL_SITUATIONS) {
      for (let variant = 0; variant < M.situationVariants; variant++)
        expect(hasMatchLabel(`match.situation.${situation.id}.${variant}`), situation.id).toBe(
          true,
        );
      for (const choice of situation.choices)
        expect(hasMatchLabel(`match.choice.${choice.id}`), choice.id).toBe(true);
    }
    for (const choices of Object.values(UNLOCKS_22))
      for (const choice of choices) expect(hasMatchLabel(`match.choice.${choice.id}`)).toBe(true);
  });

  it('reads only name choices of their situation, and every choice wins in some read', () => {
    for (const [situationId, reads] of Object.entries(READS)) {
      const ids = new Set(
        [...situationOf(situationId)!.choices, ...(UNLOCKS_22[situationId] ?? [])].map((c) => c.id),
      );
      for (const read of reads)
        for (const state of read.states)
          for (const choice of Object.keys(state.odds)) expect(ids.has(choice), choice).toBe(true);
      // At the reference player, each base choice is the best value under some read.
      const base = situationOf(situationId)!.choices.filter((c) => !c.requiredTraitId);
      const winners = new Set<string>();
      const combos = reads.reduce<{ id: string; state: string }[][]>(
        (all, read) =>
          all.flatMap((combo) => read.states.map((s) => [...combo, { id: read.id, state: s.id }])),
        [[]],
      );
      for (const combo of combos) {
        const choices = buildChoices(
          context(situationId, { reads: contextReads(situationOf(situationId)!, combo, 0) }),
        );
        const values = choices.map((c) => expectedImpact(c).net);
        winners.add(choices[values.indexOf(Math.max(...values))]!.id);
      }
      for (const choice of base)
        expect(winners.has(choice.id), `${situationId}/${choice.id}`).toBe(true);
    }
  });

  it('are named odds factors that keep the factors summing to the chance', () => {
    const situation = situationOf('box-chance')!;
    const reads = contextReads(
      situation,
      [
        { id: 'keeper', state: 'near' },
        { id: 'cover', state: 'tight' },
      ],
      0,
    );
    const choices = buildChoices(context('box-chance', { reads }));
    const near = choices.find((c) => c.id === 'near-post')!;
    const far = choices.find((c) => c.id === 'far-post')!;
    expect(
      near.factors.some((f) => f.labelKey === 'match.read.keeper.near' && f.contribution < 0),
    ).toBe(true);
    expect(
      far.factors.some((f) => f.labelKey === 'match.read.keeper.near' && f.contribution > 0),
    ).toBe(true);
    for (const choice of choices) expect(sum(choice)).toBeCloseTo(choice.probability, 5);
    // The same moment without reads (match-21's path) has no read factor.
    const plain = buildChoices(context('box-chance', { rules22: false }));
    expect(plain.flatMap((c) => c.factors).some((f) => f.labelKey.startsWith('match.read.'))).toBe(
      false,
    );
  });

  it('are drawn, stored and shown on match-22 only', () => {
    const [current, previous] = playOnEngines(setupAt('CB', 'reads-engines'), tactics);
    const moments = current!.state.match.keyMoments.filter((m) => !m.follows);
    expect(moments.some((m) => m.reads?.length)).toBe(true);
    for (const moment of moments)
      for (const read of moment.reads ?? [])
        expect(hasMatchLabel(`match.read.${read.id}.${read.state}`)).toBe(true);
    expect(previous!.state.match.keyMoments.some((m) => m.reads)).toBe(false);
  });

  it('move the pitch: a wall of four, and the keeper off his line', () => {
    let wall: KeyMoment | undefined;
    let keeper: { moment: KeyMoment; session: MatchSession } | undefined;
    for (let index = 0; index < 120 && !(wall && keeper); index++) {
      let session = createMatchSession(setupAt('AM', `reads-pitch:${index}`), tactics);
      while (session.state.match.status !== 'finished' && !(wall && keeper)) {
        const moment = session.state.currentMoment;
        if (moment?.situationId === 'free-kick' && moment.reads?.some((r) => r.state === 'big'))
          wall = moment;
        if (
          moment?.situationId === 'box-chance' &&
          moment.reads?.some((r) => r.id === 'keeper' && r.state === 'off-line')
        )
          keeper = { moment, session };
        session = applyMatchCommand(session, autoPlayCommand(session));
      }
    }
    expect(wall && keeper).toBeTruthy();
    // Four opponents stand in a line about ten yards from the ball.
    const ball = wall!.frame.ball;
    const inWall = wall!.frame.players.filter(
      (p) =>
        Math.abs(Math.abs(p.point.x - ball.x) - 8.7) < 0.6 && Math.abs(p.point.y - ball.y) < 14,
    );
    // Two more join the scene's two; a chain's free kick (X1a) is set from the step before, so
    // the last of them may still be on the way.
    expect(inWall.length).toBeGreaterThanOrEqual(3);
    // The opposition keeper is about ten yards off his line.
    const id = keeper!.moment.cast?.keeper;
    const point = keeper!.moment.frame.players.find((p) => p.id === id)?.point;
    expect(point && Math.min(point.x, 100 - point.x)).toBeGreaterThan(8);
  });
});

describe('situations per position (match-22)', () => {
  it('spread every position over more situations, none above about two fifths', () => {
    for (const position of ['GK', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'ST'] as Position[]) {
      const weights = situationWeights(position, 'balanced', { drama: true, rules22: true });
      const total = weights.reduce((s, w) => s + w.weight, 0);
      expect(weights.length, position).toBeGreaterThanOrEqual(6);
      for (const w of weights)
        expect(w.weight / total, `${position} ${w.situation.id}`).toBeLessThan(0.4);
      // Match-21's pool is unchanged.
      expect(
        situationWeights(position, 'balanced', { drama: true }).some((w) =>
          SITUATIONS_22.includes(w.situation),
        ),
      ).toBe(false);
    }
    const defenders = situationWeights('CB', 'balanced', { drama: true, rules22: true }).map(
      (w) => w.situation.id,
    );
    for (const id of ['last-man', 'cross-defence', 'two-on-one', 'set-piece-marking'])
      expect(defenders).toContain(id);
    const keepers = situationWeights('GK', 'balanced', { rules22: true }).map(
      (w) => w.situation.id,
    );
    expect(keepers).toEqual(expect.arrayContaining(['sweeping', 'back-pass']));
    const strikers = situationWeights('ST', 'balanced', { rules22: true }).map(
      (w) => w.situation.id,
    );
    expect(strikers).toEqual(expect.arrayContaining(['rebound', 'weak-foot']));
    // A two-footed player has no weaker foot to be caught on.
    const twoFooted = situationWeights('ST', 'balanced', { rules22: true, twoFooted: true });
    expect(twoFooted.some((w) => w.situation.id === 'weak-foot')).toBe(false);
  });

  it('the weaker-foot shot carries the weaker-foot factor unless two-footed', () => {
    const foot = { strong: 'right' as const, flank: 'centre' as const, twoFooted: false };
    const weak = buildChoices(context('weak-foot', { foot })).find(
      (c) => c.id === 'weak-foot-shot',
    )!;
    expect(weak.factors.some((f) => f.labelKey === 'match.factor.foot.weak')).toBe(true);
    expect(weak.foot).toEqual({ side: 'left', weak: true });
    const able = buildChoices(context('weak-foot', { foot: { ...foot, twoFooted: true } })).find(
      (c) => c.id === 'weak-foot-shot',
    )!;
    expect(able.factors.some((f) => f.labelKey === 'match.factor.foot.weak')).toBe(false);
  });
});

describe('skills as mechanics (match-22)', () => {
  it('a skill choice replaces the weakest base choice instead of hiding Track the runner (C14)', () => {
    const traits = ['last-ditch', 'ball-winner'];
    const choices = buildChoices(context('defend-attack', { player: player(traits) }));
    expect(choices).toHaveLength(4);
    expect(choices.map((c) => c.id)).toEqual(
      expect.arrayContaining(['slide-block', 'press-carry']),
    );
    // The two base choices dropped are the weakest of the five base and skill choices built.
    const all = buildChoices(
      context('defend-attack', { player: player(traits), rules22: true }),
    ).map((c) => c.id);
    expect(all).toHaveLength(4);
    // Under a read that favours tracking the runner, it stays.
    const runner = buildChoices(
      context('defend-attack', {
        player: player(['last-ditch']),
        reads: contextReads(situationOf('defend-attack')!, [{ id: 'carrier', state: 'runner' }], 0),
      }),
    );
    expect(runner.map((c) => c.id)).toContain('track-runner');
    expect(runner.map((c) => c.id)).toContain('slide-block');
    // Match-21 still hides the appended choice.
    const old = buildChoices(
      context('defend-attack', { player: player(['last-ditch']), rules22: false }),
    );
    expect(old.map((c) => c.id)).not.toContain('track-runner');
  });

  it('Ball Winner and Maestro start counters; a keeper with Distributor throws one', () => {
    const plain = buildChoices(context('defend-attack', { budget: { for: 0, against: 0.06 } }));
    expect(plain.every((c) => c.stakes.successGoal === 0)).toBe(true);
    const winner = buildChoices(
      context('defend-attack', {
        budget: { for: 0, against: 0.06 },
        player: player(['ball-winner']),
      }),
    ).find((c) => c.id === 'press-carry')!;
    expect(winner.stakes.successGoal).toBeGreaterThan(0);
    const maestro = buildChoices(context('build-out', { player: player(['maestro']) })).find(
      (c) => c.id === 'first-time-ball',
    )!;
    expect(expectedImpact(maestro).for).toBeGreaterThan(0.05);
    const keeper = (rules22: boolean) =>
      buildChoices(context('distribution', { player: player(['distributor']), rules22 })).find(
        (c) => c.id === 'quick-release',
      )!;
    expect(expectedImpact(keeper(true)).for).toBeGreaterThan(expectedImpact(keeper(false)).for);
  });

  it('Clutch works only in a clutch moment, on every choice', () => {
    const traits = ['clutch'];
    const calm = buildChoices(context('box-chance', { player: player(traits) }));
    expect(calm.flatMap((c) => c.factors).some((f) => f.labelKey === 'match.factor.clutch')).toBe(
      false,
    );
    // Its old boost to four shots is gone on match-22.
    const near = calm.find((c) => c.id === 'near-post')!;
    const neutral = buildChoices(context('box-chance')).find((c) => c.id === 'near-post')!;
    expect(near.probability).toBe(neutral.probability);
    const late = buildChoices(context('box-chance', { player: player(traits), clutch: true }));
    for (const choice of late)
      expect(
        choice.factors.find((f) => f.labelKey === 'match.factor.clutch')!.contribution,
      ).toBeGreaterThan(0);
    expect(skillEffects(['clutch'], 'clutch')).toEqual([]);
  });

  it('Clutch is switched on late in a close game for a player who has it', () => {
    let found = false;
    for (let index = 0; index < 40 && !found; index++) {
      const setup = onEngine(setupAt('ST', `clutch:${index}`), 'match-22');
      setup.players[setup.selectedPlayerId]!.traits = ['clutch'];
      const session = play(createMatchSession(setup, tactics));
      for (const moment of session.state.match.keyMoments) {
        const clutch = moment.choices.some((c) =>
          c.factors.some((f) => f.labelKey === 'match.factor.clutch'),
        );
        const goals = session.state.match.events.filter(
          (e) => e.kind === 'goal' && e.minute < moment.minute,
        );
        const own = goals.filter((e) => e.teamId === setup.home.id).length;
        const close = Math.abs(2 * own - goals.length) <= M.clutch.closeMargin;
        if (moment.minute < M.clutch.fromMinute) expect(clutch).toBe(false);
        if (clutch) found = true;
        if (moment.minute >= M.clutch.fromMinute && close && !moment.follows)
          expect(clutch).toBe(true);
      }
    }
    expect(found).toBe(true);
  });
});

describe('the professional foul (match-22)', () => {
  it('risks its card when it succeeds, a red when no one covers, and counts the cost', () => {
    const p = player();
    const covered = bookingRisk('professional-foul', p, 0.9, false, {
      onSuccess: true,
      straight: M.professionalFoul.covered,
    })!;
    const alone = bookingRisk('professional-foul', p, 0.9, false, {
      onSuccess: true,
      straight: M.professionalFoul.alone,
    })!;
    expect(covered.onSuccess).toBe(true);
    expect(covered.foul).toBe(1);
    expect(covered.yellow + covered.red).toBeCloseTo(0.9, 5);
    expect(alone.red).toBeGreaterThan(covered.red);
    // A tackle still risks its card when it fails.
    const tackle = bookingRisk('tackle', p, 0.9, false)!;
    expect(tackle.onSuccess).toBeUndefined();
    expect(tackle.yellow + tackle.red).toBeLessThan(0.1 * 0.2);
  });

  it('books the player when it succeeds in a played match', () => {
    let fouls = 0,
      booked = 0;
    for (let index = 0; index < 80 && fouls < 3; index++) {
      let session = createMatchSession(setupAt('CB', `foul:${index}`), tactics);
      while (session.state.match.status !== 'finished') {
        const moment = session.state.currentMoment;
        const foul = moment?.choices.find((c) => c.id === 'professional-foul');
        if (foul) {
          expect(foul.booking?.onSuccess).toBe(true);
          session = applyMatchCommand(session, { type: 'choose', choiceId: foul.id });
          const outcome = session.state.match.events.findLast(
            (e) => e.outcome?.input.choiceId === foul.id,
          )?.outcome;
          fouls++;
          if (outcome?.success) {
            expect(outcome.booking).toBeDefined();
            if (outcome.booking?.card) booked++;
          } else expect(outcome?.booking).toBeUndefined();
        } else session = applyMatchCommand(session, autoPlayCommand(session));
      }
    }
    expect(fouls).toBeGreaterThan(0);
    expect(booked).toBeGreaterThan(0);
  });
});

describe('the marked man (match-22, C17)', () => {
  function starSession(boost: number): MatchSession {
    const setup = onEngine(setupAt('ST', 'marked'), 'match-22');
    const star = setup.players[setup.selectedPlayerId]!;
    for (const key of KEYS)
      (star.attributes as unknown as Record<string, number>)[key] = Math.min(
        99,
        (star.attributes as unknown as Record<string, number>)[key]! + boost,
      );
    return createMatchSession(setup, tactics);
  }
  it('double-marks a player who outclasses the match, and not one who does not', () => {
    expect(markedBy(starSession(0))).toBe(0);
    const marked = markedBy(starSession(30));
    expect(marked).toBeGreaterThan(0);
    expect(marked).toBeLessThanOrEqual(M.marked.maximum);
    const reads = contextReads(situationOf('box-chance')!, [], marked);
    expect(reads[0]!.key).toBe('match.read.marked.double');
    expect(reads[0]!.odds['near-post']).toBeLessThan(1);
    expect(reads[0]!.odds['square-pass']).toBeGreaterThan(1);
  });
  it('fewer clean chances in the box, and named on the moment', () => {
    const plain = situationWeights('ST', 'balanced', { rules22: true });
    const marked = situationWeights('ST', 'balanced', { rules22: true, marked: 0.3 });
    const share = (w: typeof plain) =>
      w.find((e) => e.situation.id === 'box-chance')!.weight / w.reduce((s, e) => s + e.weight, 0);
    expect(share(marked)).toBeLessThan(share(plain));
    const session = play(starSession(30));
    const moments = session.state.match.keyMoments.filter((m) => !m.follows);
    expect(moments.some((m) => m.reads?.some((r) => r.id === 'marked'))).toBe(true);
  });
  it('relaxes when the opposition has to chase the game late on', () => {
    const session = starSession(30);
    const tight = markedBy(session);
    session.state.match.minute = M.marked.relaxFromMinute;
    const side =
      session.setup.players[session.setup.selectedPlayerId]!.clubId === session.setup.home.id
        ? 0
        : 1;
    session.state.match.score[side] = 1;
    expect(markedBy(session)).toBeCloseTo(tight * M.marked.relax, 5);
  });
});
