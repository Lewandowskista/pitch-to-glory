import { beforeAll, describe, expect, it } from 'vitest';
import type { Club, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { careerCap } from '../src/engine/ageing';
import { generateWorld } from '../src/engine/world/generate';
import {
  CareerMatchPendingError,
  commitPlayedFixture,
  simulateWeek,
  startNextSeason,
} from '../src/engine/world/simulate';
import { seasonalSquadReview } from '../src/engine/world/lifecycle';
import { ARCHETYPES, SKILLS, SKILL_BY_ID, SYSTEMIC_SKILLS } from '../src/engine/career/catalogue';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import {
  addXp,
  attributeCost,
  levelForXp,
  raiseAttribute,
  skillState,
  unlockSkill,
  xpForLevel,
  xpToNext,
} from '../src/engine/career/progression';
import { careerWeek, chooseRecovery, injure } from '../src/engine/career/training';
import { pendingCareerFixture, fixtureImportance } from '../src/engine/career/fixtures';
import {
  autoPlayCommand,
  careerMatchSetup,
  commitCareerMatch,
  defaultTactics,
} from '../src/engine/career/matches';
import { advanceCareerWeek } from '../src/engine/career/season';
import { applyMatchCommand, createMatchSession } from '../src/engine/match';
import { TRAIT_BOOSTS } from '../src/engine/match/decisions';
import { SITUATIONS } from '../src/engine/match/situations';
import { createSave, parseSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';

const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const draft = (overrides: Partial<CareerDraft> = {}): CareerDraft => ({
  name: 'Robin Vale',
  avatar: {
    face: 1,
    skin: 2,
    hair: 3,
    hairColor: 4,
    facialHair: 0,
    eyebrows: 1,
    eyes: 2,
    accessory: 3,
  },
  nationalityId: 'country:0',
  position: 'ST',
  foot: 'left',
  age: 17,
  archetype: 'finisher',
  ...overrides,
});
let base: World;
let career: World;
let offers: Club[];
beforeAll(() => {
  base = generateWorld('career-tests', { format: 'legacy' });
  offers = trialOffers(base, 'country:0', 'career-tests');
  career = createCareer(base, draft(), offers[0]!.id, 'career-tests');
});
const player = (world: World) => world.players[world.career!.playerId]!;
function playPending(world: World) {
  const fixture = pendingCareerFixture(world)!;
  let session = createMatchSession(careerMatchSetup(world, fixture), defaultTactics(world));
  while (session.state.match.status !== 'finished')
    session = applyMatchCommand(session, autoPlayCommand(session));
  return { fixture, session };
}

describe('career creation', () => {
  it('offers three distinct trial clubs from the bottom tier, never reserve teams', () => {
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((club) => club.id)).size).toBe(3);
    const bottom = Math.max(
      ...base.countries['country:0']!.leagueIds.map((id) => base.leagues[id]!.tier),
    );
    for (const club of offers) {
      expect(base.leagues[club.leagueId]!.tier).toBe(bottom);
      expect(club.identity?.reserveParentId ?? null).toBeNull();
    }
    expect(trialOffers(base, 'country:0', 'career-tests').map((c) => c.id)).toEqual(
      offers.map((c) => c.id),
    );
  });
  it('creates a valid career player at the trial club with the starting skill', () => {
    const p = player(career);
    expect(p.name).toBe('Robin Vale');
    expect(p.clubId).toBe(offers[0]!.id);
    expect(career.clubs[offers[0]!.id]!.playerIds).toContain(p.id);
    expect(career.career!.skills).toEqual(['clinical-finisher']);
    expect(p.traits).toEqual(['clinical-finisher']);
    expect(career.date.season - p.birthSeason).toBe(17);
    expect(p.potential).toBeGreaterThanOrEqual(CONFIG.career.start.potential[0]);
    for (const key of ['finishing', 'pace', 'vision'] as const)
      expect(p.attributes[key]).toBeLessThanOrEqual(careerCap(p, key, 17) + 2);
    expect(() => validateWorld(clone(career))).not.toThrow();
    expect(base.career).toBeUndefined();
  });
  it('rejects mismatched archetypes, ages and a second career', () => {
    expect(() => createCareer(base, draft({ position: 'GK' }), offers[0]!.id, 'x')).toThrow();
    expect(() => createCareer(base, draft({ age: 15 }), offers[0]!.id, 'x')).toThrow();
    expect(() => createCareer(base, draft({ name: '  ' }), offers[0]!.id, 'x')).toThrow();
    expect(() => createCareer(career, draft(), offers[0]!.id, 'x')).toThrow();
    const keeper = createCareer(
      base,
      draft({ position: 'GK', archetype: 'shot-stopper' }),
      offers[1]!.id,
      'keeper',
    );
    expect(keeper.career!.skills).toEqual(['cat-reflexes']);
    expect(() => validateWorld(clone(keeper))).not.toThrow();
  });
});

describe('progression', () => {
  it('derives levels from XP and grants points on every level-up', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(xpToNext(1));
    for (const xp of [0, 299, 300, 5000, 123456]) {
      const level = levelForXp(xp);
      expect(xpForLevel(level)).toBeLessThanOrEqual(xp);
      expect(xpForLevel(level + 1)).toBeGreaterThan(xp);
    }
    const record = structuredClone(career.career!);
    const gained = addXp(record, xpForLevel(4));
    expect(gained).toBe(3);
    expect(record.attributePoints).toBe(3 * CONFIG.career.attributePointsPerLevel);
    expect(record.skillPoints).toBe(3 * CONFIG.career.skillPointsPerLevel);
  });
  it('charges more for attributes at and beyond the age-adjusted soft cap', () => {
    const world = clone(career);
    world.career!.attributePoints = 50;
    const p = player(world);
    const cap = careerCap(p, 'finishing', 17);
    p.attributes.finishing = cap - 1;
    expect(attributeCost(world, 'finishing')).toBe(1);
    p.attributes.finishing = cap;
    expect(attributeCost(world, 'finishing')).toBe(2);
    p.attributes.finishing = cap + 5;
    expect(attributeCost(world, 'finishing')).toBe(3);
    p.attributes.finishing = 99;
    expect(attributeCost(world, 'finishing')).toBeNull();
    expect(attributeCost(world, 'handling')).toBeNull();
    // Physical attributes cost one extra point from age 29.
    p.birthSeason = world.date.season - 30;
    p.attributes.pace = 10;
    expect(attributeCost(world, 'pace')).toBe(2);
    p.birthSeason = world.date.season - 17;
    p.attributes.finishing = cap - 3;
    const raised = raiseAttribute(world, 'finishing');
    expect(raised.players[p.id]!.attributes.finishing).toBe(cap - 2);
    expect(raised.career!.attributePoints).toBe(49);
    expect(world.players[p.id]!.attributes.finishing).toBe(cap - 3);
    expect(raised.players).not.toBe(world.players);
    expect(raised.clubs).toBe(world.clubs);
    world.career!.attributePoints = 0;
    expect(() => raiseAttribute(world, 'finishing')).toThrow();
  });
  it('unlocks skills only with prerequisites, level and points, applying bonuses and traits', () => {
    const world = clone(career);
    expect(skillState(world, 'long-ranger')).toBe('locked');
    expect(skillState(world, 'safe-hands')).toBe('unavailable');
    world.career!.xp = xpForLevel(8);
    world.career!.levelXp = xpForLevel(8);
    world.career!.level = 8;
    world.career!.skillPoints = 5;
    expect(skillState(world, 'long-ranger')).toBe('available');
    const before = player(world).attributes.longShots;
    const unlocked = unlockSkill(world, 'long-ranger');
    expect(unlocked.career!.skills).toContain('long-ranger');
    expect(player(unlocked).traits).toContain('long-ranger');
    expect(player(unlocked).attributes.longShots).toBe(Math.min(99, before + 3));
    expect(unlocked.career!.skillPoints).toBe(2);
    expect(() => unlockSkill(unlocked, 'long-ranger')).toThrow();
    expect(() => unlockSkill(unlocked, 'acrobat')).toThrow();
  });
  it('defines a skill tree of about forty skills where every skill has a real effect', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(40);
    const choiceTraits = new Set(
      SITUATIONS.flatMap((s) => s.choices.flatMap((c) => [c.traitId, c.requiredTraitId])),
    );
    for (const skill of SKILLS) {
      for (const prerequisite of skill.prerequisites) {
        expect(SKILL_BY_ID[prerequisite]).toBeDefined();
        expect(SKILL_BY_ID[prerequisite]!.tier).toBeLessThan(skill.tier);
      }
      const effective =
        Boolean(TRAIT_BOOSTS[skill.id]) ||
        choiceTraits.has(skill.id) ||
        skill.id in SYSTEMIC_SKILLS;
      expect(effective, skill.id).toBe(true);
      expect(Object.keys(skill.attributeBonuses).length, skill.id).toBeGreaterThan(0);
    }
    for (const archetype of ARCHETYPES) expect(SKILL_BY_ID[archetype.startingSkill]!.tier).toBe(1);
    for (const traits of Object.keys(TRAIT_BOOSTS)) expect(SKILL_BY_ID[traits]).toBeDefined();
  });
});

describe('training, injuries and ageing', () => {
  it('turns weekly sessions into attribute progress, familiarity and fatigue', () => {
    const world = clone(career);
    world.career!.training = {
      sessions: [
        { focus: 'finishing', intensity: 'high' },
        { focus: 'position:AM', intensity: 'normal' },
        { focus: 'recovery', intensity: 'low' },
      ],
      extra: null,
    };
    const p = player(world);
    p.attributes.finishing = 5;
    const familiarity = p.secondaryPositions.find((s) => s.position === 'AM')?.familiarity ?? 0;
    for (let week = 0; week < 8; week++) careerWeek(world);
    expect(p.attributes.finishing).toBeGreaterThan(5);
    expect(p.secondaryPositions.find((s) => s.position === 'AM')!.familiarity).toBeGreaterThan(
      familiarity,
    );
    expect(world.career!.lastTraining!.familiarity?.position).toBe('AM');
    expect(() => validateWorld(clone(world))).not.toThrow();
  });
  it('keeps the injured player out, offers a rushed or full recovery, and heals', () => {
    const world = clone(career);
    const injury = injure(world, 'training', createRng('knock'), 'hamstring-strain');
    expect(player(world).injuryId).toBe(injury.id);
    expect(pendingCareerFixture(world)).toBeNull();
    expect(() => validateWorld(clone(world))).not.toThrow();
    const weeks = injury.weeksRemaining;
    const rushed = chooseRecovery(world, 'rush');
    expect(rushed.career!.injury!.weeksRemaining).toBe(
      Math.max(1, Math.ceil(weeks * CONFIG.career.injuries.rush.durationFactor)),
    );
    expect(() => chooseRecovery(rushed, 'rehab')).toThrow();
    const healing = clone(rushed);
    for (let week = 0; week < 20 && healing.career!.injury; week++) careerWeek(healing);
    expect(healing.career!.injury).toBeNull();
    expect(player(healing).injuryId).toBeNull();
    expect(healing.career!.reinjury?.risk).toBe(
      CONFIG.career.injuries.rush.reinjuryPerSeverity * rushed.career!.injury!.severity,
    );
  });
  it('lets ageing pull attributes above the age-adjusted cap back down after the peak', () => {
    const world = clone(career);
    const p = player(world);
    p.birthSeason = world.date.season - 34;
    p.attributes.pace = 95;
    // Each simulated week draws its own rolls.
    for (let week = 1; week <= 30; week++) {
      world.date.week = week;
      careerWeek(world);
    }
    expect(p.attributes.pace).toBeLessThan(95);
    expect(p.attributes.pace).toBeGreaterThanOrEqual(careerCap(p, 'pace', 34));
  });
});

describe('career fixtures', () => {
  it('stops the week at a pending fixture and commits a played match exactly once', () => {
    const world = clone(career);
    const pending = pendingCareerFixture(world);
    expect(pending).not.toBeNull();
    expect(() => simulateWeek(world)).toThrow(CareerMatchPendingError);
    expect(advanceCareerWeek(world).pendingFixtureId).toBe(pending!.id);
    const { fixture, session } = playPending(world);
    expect(session.setup.fixture).toEqual({
      id: fixture.id,
      competitionId: fixture.competitionId,
      importance: fixtureImportance(world, fixture),
    });
    const before = clone(world);
    const outcome = commitCareerMatch(world, session);
    // The committed world is saved mid-week, before the rest of the week is simulated.
    expect(() => validateWorld(clone(world))).not.toThrow();
    const result = world.results[fixture.id]!;
    expect(result.score).toEqual(session.state.match.score);
    // Standings, appearances and goals are conserved.
    const league = world.leagues[fixture.competitionId]!;
    for (const clubId of [fixture.homeId, fixture.awayId])
      expect(league.standings.find((r) => r.clubId === clubId)!.played).toBe(1);
    const scored =
      Object.values(world.players).reduce((n, p) => n + p.stats.goals, 0) -
      Object.values(before.players).reduce((n, p) => n + p.stats.goals, 0);
    expect(scored).toBe(result.score[0] + result.score[1]);
    expect(player(world).stats.appearances).toBe(1);
    expect(player(world).stats.goals).toBe(session.state.stats.goals);
    expect(world.career!.matches).toHaveLength(1);
    expect(world.career!.xp).toBe(outcome.record.xp);
    expect(outcome.record.xp).toBeGreaterThan(0);
    expect(() => commitCareerMatch(world, session)).toThrow();
    // The background week leaves the committed result untouched.
    const committed = JSON.stringify(result);
    const next = simulateWeek(world);
    expect(JSON.stringify(next.results[fixture.id])).toBe(committed);
    expect(() => validateWorld(clone(next))).not.toThrow();
  });
  it('saves a national career world straight after a committed match', () => {
    const national = generateWorld('career-midweek');
    const trial = trialOffers(national, 'country:2', 'midweek')[0]!;
    const world = createCareer(
      national,
      draft({ nationalityId: 'country:2' }),
      trial.id,
      'midweek',
    );
    const { session } = playPending(world);
    commitCareerMatch(world, session);
    expect(() => validateWorld(clone(world))).not.toThrow();
    // Another club's result in the same week is still rejected.
    const forged = clone(world);
    const other = Object.values(forged.fixtures).find(
      (f) =>
        f.date.week === forged.date.week &&
        f.homeId !== trial.id &&
        f.awayId !== trial.id &&
        forged.leagues[f.competitionId],
    )!;
    forged.results[other.id] = {
      fixtureId: other.id,
      score: [0, 0],
      winnerId: null,
      penalties: null,
      goals: [],
    };
    expect(() => validateWorld(forged)).toThrow();
  }, 60000);
  it('replaces a mentor who has left the club', () => {
    const world = clone(career);
    const p = player(world);
    const teammate = world.clubs[p.clubId!]!.playerIds.find((id) => id !== p.id)!;
    world.career!.training.extra = { focus: 'finishing', mentorId: teammate };
    world.players[teammate]!.clubId = null;
    world.clubs[p.clubId!]!.playerIds = world.clubs[p.clubId!]!.playerIds.filter(
      (id) => id !== teammate,
    );
    delete world.contracts[world.players[teammate]!.contractId!];
    world.players[teammate]!.contractId = null;
    careerWeek(world);
    expect(world.career!.training.extra!.mentorId).not.toBe(teammate);
    expect(world.players[world.career!.training.extra!.mentorId]!.clubId).toBe(p.clubId);
  });
  it('rejects a session from another fixture or world', () => {
    const world = clone(career);
    const { session } = playPending(world);
    const other = clone(world);
    other.results[session.setup.fixture!.id] = {
      fixtureId: session.setup.fixture!.id,
      score: [0, 0],
      winnerId: null,
      penalties: null,
      goals: [],
    };
    expect(() => commitCareerMatch(other, session)).toThrow();
    const forged = structuredClone(session);
    forged.setup.fixture = undefined;
    expect(() => commitCareerMatch(clone(world), forged)).toThrow();
  });
  it('settles a level knockout fixture with the background extra-time and penalty rules', () => {
    const world = clone(base);
    const cup = Object.values(world.competitions)[0]!;
    const fixture = world.fixtures[cup.stages[0]!.fixtureIds[0]!]!;
    const xi = (clubId: string) =>
      Object.fromEntries(world.clubs[clubId]!.playerIds.slice(0, 11).map((id) => [id, 90]));
    commitPlayedFixture(world, fixture.id, {
      score: [1, 1],
      goals: [
        {
          playerId: world.clubs[fixture.homeId]!.playerIds[10]!,
          teamId: fixture.homeId,
          minute: 20,
        },
        {
          playerId: world.clubs[fixture.awayId]!.playerIds[10]!,
          teamId: fixture.awayId,
          minute: 70,
        },
      ],
      minutes: { home: xi(fixture.homeId), away: xi(fixture.awayId) },
      onPitch: { home: Object.keys(xi(fixture.homeId)), away: Object.keys(xi(fixture.awayId)) },
      selected: { playerId: world.clubs[fixture.homeId]!.playerIds[10]!, rating: 7 },
    });
    const result = world.results[fixture.id]!;
    expect(result.penalties).not.toBeNull();
    expect([fixture.homeId, fixture.awayId]).toContain(result.winnerId);
    expect(result.goals).toHaveLength(2);
    expect(() =>
      commitPlayedFixture(world, fixture.id, {
        score: [0, 0],
        goals: [],
        minutes: { home: {}, away: {} },
        onPitch: { home: [], away: [] },
        selected: { playerId: world.clubs[fixture.homeId]!.playerIds[10]!, rating: 7 },
      }),
    ).toThrow();
  });
  it('auto-plays a whole season, playing every fixture the player is picked for', () => {
    let world = clone(career);
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const clubId = player(world).clubId!;
    const fixtures = Object.values(world.fixtures).filter(
      (f) => f.homeId === clubId || f.awayId === clubId,
    );
    expect(fixtures.every((f) => world.results[f.id])).toBe(true);
    const played = new Set(world.career!.matches.map((m) => m.fixtureId));
    expect(played.size).toBe(world.career!.matches.length);
    // A rotation promise at the trial club: picked for most matches, left out of some.
    const selection = world.career!.market.selection;
    expect(selection.selected).toBe(played.size);
    expect(played.size + selection.dropped).toBeLessThanOrEqual(fixtures.length);
    expect(played.size).toBeGreaterThan(fixtures.length * 0.4);
    expect(world.career!.matches.every((m) => m.auto)).toBe(true);
    expect(world.career!.level).toBeGreaterThan(1);
    expect(() => validateWorld(clone(world))).not.toThrow();
    const next = startNextSeason(world);
    expect(next.players[next.career!.playerId]!.clubId).not.toBeNull();
    expect(() => validateWorld(clone(next))).not.toThrow();
  }, 120000);
});

describe('career lifecycle and saves', () => {
  it('never retires, releases or re-contracts the career player through the AI lifecycle', () => {
    const world = clone(career);
    const p = player(world);
    p.birthSeason = world.date.season - 45;
    world.contracts[p.contractId!]!.end.season = world.date.season - 1;
    world.date.week = CONFIG.world.intakeWeek;
    seasonalSquadReview(world, createRng('lifecycle'));
    expect(p.retired).toBe(false);
    expect(p.clubId).not.toBeNull();
  });
  it('moves the career player when their club drops below the simulated frontier', () => {
    // National worlds have feeder levels below the frontier and allow odd group sizes.
    const national = generateWorld('career-relegation');
    const trial = trialOffers(national, 'country:0', 'relegation')[0]!;
    let complete = createCareer(national, draft(), trial.id, 'relegation');
    while (complete.phase === 'active')
      complete = advanceCareerWeek(complete, { inPlace: true, autoPlay: true }).world;
    const clubId = player(complete).clubId!;
    const summary = complete.history.at(-1)!;
    summary.movements = summary.movements.filter((m) => m.clubId !== clubId);
    summary.movements.push({
      clubId,
      fromLeagueId: complete.clubs[clubId]!.leagueId,
      toLeagueId: 'feeder:0:north',
    });
    const next = startNextSeason(complete);
    const moved = next.players[next.career!.playerId]!;
    expect(moved.clubId).not.toBe(clubId);
    expect(next.leagues[next.clubs[moved.clubId!]!.leagueId]).toBeDefined();
    expect(next.clubs[moved.clubId!]!.playerIds).toContain(moved.id);
  }, 240000);
  it('round trips a career save and rejects forged progression', () => {
    const payload = {
      kind: 'world' as const,
      world: career,
      gallery: { seed: 'career', generation: 0 },
      settings: DEFAULT_SETTINGS,
    };
    const save = createSave(1, 'Career', payload);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const forge = (change: (world: World) => void) => {
      const world = clone(career);
      change(world);
      return () => createSave(1, 'Forged', { ...payload, world });
    };
    expect(forge((w) => (w.career!.level = 30))).toThrow();
    expect(forge((w) => (w.career!.levelXp = w.career!.xp + 1))).toThrow();
    expect(forge((w) => (w.career!.attributePoints = 999))).toThrow();
    expect(forge((w) => w.career!.skills.push('acrobat'))).toThrow();
    expect(forge((w) => (player(w).traits = ['wall']))).toThrow();
    expect(forge((w) => (player(w).injuryId = 'injury:fake'))).toThrow();
    expect(forge((w) => (w.career!.training.sessions[0]!.focus = 'handling'))).toThrow();
    expect(forge((w) => (Object.values(w.players)[0]!.injuryId = 'injury:ai'))).toThrow();
  });
});
