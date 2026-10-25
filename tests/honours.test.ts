import { beforeAll, describe, expect, it } from 'vitest';
import type { Moment, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import {
  CONTINENTAL_IDS,
  continentalQualifiers,
  groupTable,
} from '../src/engine/world/continental';
import {
  createCareer,
  trialOffers,
  validateDraft,
  type CareerDraft,
} from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  applyHonoursAction,
  chronicle,
  decodeClip,
  encodeClip,
  formerTeammates,
  hallOfFameRank,
  advanceTournament,
  finishTournament,
  momentLink,
  openTournament,
  parseMomentLink,
  pendingTournamentFixture,
  playTournament,
  recordTournamentMatch,
  tournamentStakes,
  retirementState,
  tournamentStep,
  windowWeeks,
  type Clip,
} from '../src/engine/career/honours';
import { hashSeed } from '../src/engine/rng';
import { honoursSeasonEnd } from '../src/engine/career/honours/week';
import {
  careerTotals,
  careerHallOfFameScore,
  hallOfFameStanding,
  hallOfFameTable,
  legacyNeighbour,
  liveHallOfFame,
  liveHallOfFameRank,
  memoisedHallOfFameTable,
} from '../src/engine/career/honours/retirement';
import { achievementScore } from '../src/engine/career/honours/achievements';
import { posterSvg } from '../src/screens/career/chroniclePoster';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';
import { validateNationalWorld } from '../src/persistence/nationalWorldSchema';
import * as awards from '../src/engine/career/honours/awards';
import { decidedTitles } from '../src/engine/world/titles';

const H = CONFIG.career.honours;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
const draft: CareerDraft = {
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
};
const saveOf = (world: World) =>
  createSave(1, 'Honours', {
    kind: 'world',
    world,
    gallery: { seed: 'h', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });
/** Set the career player's age for retirement checks. */
const aged = (input: World, age: number) => {
  const world = clone(input);
  world.players[world.career!.playerId]!.birthSeason = world.date.season - age;
  return world;
};

let career: World;
let season: World;
beforeAll(() => {
  const base = generateWorld('honours-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'honours-tests')[0]!;
  career = createCareer(base, draft, trial.id, 'honours-tests');
  season = clone(career);
  while (season.phase === 'active')
    season = advanceCareerWeek(season, { inPlace: true, autoPlay: true }).world;
}, 300000);

describe('continental cups', () => {
  let national: World;
  let played: World;
  beforeAll(() => {
    national = generateWorld('honours-continental');
    played = clone(national);
    while (played.phase === 'active') played = simulateWeek(played);
  }, 300000);

  it('draws 32 clubs into eight groups of four, keeping countries apart', () => {
    for (const id of CONTINENTAL_IDS) {
      const cup = national.competitions[id]!;
      expect(cup.format).toBe('groups-knockout');
      const groups = cup.stages[0]!.groups;
      expect(groups).toHaveLength(8);
      expect(groups.every((group) => group.length === 4)).toBe(true);
      expect(new Set(groups.flat()).size).toBe(32);
      for (const group of groups)
        expect(new Set(group.map((club) => national.clubs[club]!.countryId)).size).toBe(4);
      expect(cup.stages[0]!.fixtureIds).toHaveLength(96);
    }
    const all = CONTINENTAL_IDS.flatMap((id) =>
      national.competitions[id]!.stages[0]!.groups.flat(),
    );
    expect(new Set(all).size).toBe(64);
    expect(() => validateNationalWorld(clone(national))).not.toThrow();
  });

  it('plays groups, then a round of 16, quarter-finals, semi-finals and a final', () => {
    for (const id of CONTINENTAL_IDS) {
      const cup = played.competitions[id]!;
      expect(cup.stages.map((stage) => stage.name)).toEqual([
        'groups',
        'round-of-16',
        'quarter-finals',
        'semi-finals',
        'final',
      ]);
      const [groups, r16] = cup.stages;
      const qualified = groups!.groups.flatMap((_, index) =>
        groupTable(played, cup, index)
          .slice(0, 2)
          .map((row) => row.clubId),
      );
      expect(
        new Set(
          r16!.fixtureIds.flatMap((f) => [played.fixtures[f]!.homeId, played.fixtures[f]!.awayId]),
        ),
      ).toEqual(new Set(qualified));
      const final = played.fixtures[cup.stages.at(-1)!.fixtureIds[0]!]!;
      expect([final.homeId, final.awayId]).toContain(cup.winnerId);
    }
    expect(() => validateNationalWorld(clone(played))).not.toThrow();
  });

  it('qualifies next season from the final league tables', () => {
    const next = startNextSeason(played);
    const qualifiers = continentalQualifiers(next, true);
    for (const id of CONTINENTAL_IDS)
      expect(new Set(next.competitions[id]!.stages[0]!.groups.flat())).toEqual(
        new Set(qualifiers[id]),
      );
    const england = Object.values(next.countries).find(
      (country) => country.counterpart === 'England',
    )!;
    const top = england.leagueIds
      .map((id) => next.leagues[id]!)
      .find((league) => league.tier === 1)!;
    const champion = next.history.at(-1)!.tables[top.id]![0]!.clubId;
    expect(qualifiers['continental:champions']).toContain(champion);
    expect(next.competitions['continental:champions']!.season).toBe(next.date.season);
    expect(() => validateNationalWorld(clone(next))).not.toThrow();
  }, 120000);

  it('rejects a forged continental group', () => {
    const forged = clone(national);
    const groups = forged.competitions['continental:champions']!.stages[0]!.groups;
    [groups[0]![0], groups[1]![0]] = [groups[1]![0]!, groups[0]![0]!];
    expect(() => validateNationalWorld(forged)).toThrow();
  });
});

describe('moments', () => {
  const clip: Clip = {
    selected: 9,
    frames: [0, 1, 2].map((frame) => ({
      ball: { x: 50 + frame * 10, y: 40 },
      players: Array.from({ length: 22 }, (_, index) => ({
        x: (index * 4.3) % 100,
        y: (index * 7.9 + frame) % 100,
      })),
    })),
  };
  const moment: Moment = {
    id: 'moment:1',
    playerId: 'career:1',
    date: { season: 2030, week: 12, day: 6 },
    kind: 'winner',
    minute: 89,
    scorerName: 'Robin Vale',
    home: { name: 'Harbour Town', color: '#1144aa' },
    away: { name: 'Mill Lane', color: '#cc2200' },
    score: [2, 1],
    seed: 'seed:match:1',
    clip: encodeClip(clip),
  };

  it('round-trips a clip through its compact encoding', () => {
    const decoded = decodeClip(moment.clip);
    expect(decoded.selected).toBe(9);
    expect(decoded.frames).toHaveLength(3);
    decoded.frames.forEach((frame, index) => {
      expect(Math.abs(frame.ball.x - clip.frames[index]!.ball.x)).toBeLessThan(0.5);
      frame.players.forEach((point, player) =>
        expect(Math.abs(point.y - clip.frames[index]!.players[player]!.y)).toBeLessThan(0.5),
      );
    });
    expect(moment.clip.length).toBeLessThan(200);
  });

  it('shares a moment as a link that replays without the save', () => {
    const link = momentLink(moment);
    expect(link).toMatch(/^[A-Za-z0-9_-]+$/);
    const parsed = parseMomentLink(link);
    expect(parsed).toMatchObject({
      kind: 'winner',
      minute: 89,
      scorer: 'Robin Vale',
      seed: 'seed:match:1',
    });
    expect(parsed.decoded.frames).toHaveLength(3);
  });

  it('rejects damaged or forged links', () => {
    const link = momentLink(moment);
    expect(() => parseMomentLink(link.slice(0, -12))).toThrow();
    expect(() =>
      parseMomentLink(momentLink({ ...moment, home: { name: 'X', color: 'red' as never } })),
    ).toThrow();
    expect(() => parseMomentLink(momentLink({ ...moment, minute: 0 }))).toThrow();
    expect(() => decodeClip(encodeClip({ ...clip, selected: 30 }))).toThrow();
  });
});

describe('the honours season', () => {
  it('writes the Chronicle from the start of the career', () => {
    const own = season.chronicle.filter((entry) => entry.playerId === season.career!.playerId);
    expect(own[0]!.kind).toBe('start');
    expect(own[0]!.params.club).toBeTruthy();
    if (season.players[season.career!.playerId]!.stats.appearances > 0)
      expect(own.some((entry) => entry.kind === 'debut')).toBe(true);
    expect(new Set(season.chronicle.map((entry) => entry.id)).size).toBe(season.chronicle.length);
  });

  it('trims the Chronicle by dropping routine entries first', () => {
    const world = clone(career);
    for (let index = 0; index < H.chronicleLimit + 5; index++)
      chronicle(world, index % 2 ? 'apps-milestone' : 'trophy', {
        appearances: index,
        competition: 'Cup',
      });
    expect(world.chronicle).toHaveLength(H.chronicleLimit);
    expect(world.chronicle.some((entry) => entry.kind === 'start')).toBe(true);
    expect(world.chronicle.filter((entry) => entry.kind === 'trophy').length).toBeGreaterThan(
      H.chronicleLimit / 2,
    );
    for (let index = 0; index < H.chronicleLimit; index++)
      chronicle(world, 'trophy', { competition: 'Cup' });
    expect(world.chronicle).toHaveLength(H.chronicleLimit);
    expect(world.chronicle[0]!.kind).toBe('start');
  });

  it('names national squads in every international window', () => {
    expect(windowWeeks(season)).toHaveLength(H.international.windows.length);
    const senior = season.nationalTeams['national:country:0:senior']!;
    const { squad } = H.international;
    expect(senior.playerIds).toHaveLength(squad.GK + squad.DEF + squad.MID + squad.ATT);
    expect(new Set(senior.playerIds).size).toBe(senior.playerIds.length);
    for (const id of senior.playerIds) expect(season.players[id]!.nationalityId).toBe('country:0');
    const youth = season.nationalTeams['national:country:0:U19']!;
    for (const id of youth.playerIds)
      expect(season.date.season - season.players[id]!.birthSeason).toBeLessThanOrEqual(
        H.international.ages.U19,
      );
  });

  it('presents monthly and season awards with a Golden Ball shortlist', () => {
    const months = season.awards.filter((award) => award.kind === 'month');
    expect(months.length).toBeGreaterThan(3);
    const ball = season.awards.find(
      (award) => award.kind === 'golden-ball' && award.season === season.date.season,
    )!;
    expect(ball.shortlist).toHaveLength(H.awards.shortlist);
    expect(ball.winnerIds[0]).toBe(ball.shortlist[0]!.playerId);
    const scores = ball.shortlist.map((entry) => entry.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const boots = season.awards.filter((award) => award.kind === 'golden-boot');
    expect(boots.length).toBeGreaterThan(0);
    for (const kind of ['mvp', 'team-season', 'young-player'] as const)
      expect(season.awards.some((award) => award.kind === kind)).toBe(true);
    const team = season.awards.find((award) => award.kind === 'team-season')!;
    expect(team.winnerIds).toHaveLength(11);
    const young = season.awards.find((award) => award.kind === 'young-player')!;
    for (const id of young.winnerIds)
      expect(season.date.season - season.players[id]!.birthSeason).toBeLessThanOrEqual(
        H.awards.youngAge,
      );
    expect(season.records.some((record) => record.kind === 'season-goals')).toBe(true);
    valid(season);
  });

  it('is deterministic for a given world', () => {
    const run = () => {
      let world = clone(career);
      for (let week = 0; week < 10; week++)
        world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
      return JSON.stringify([
        world.chronicle,
        world.moments,
        world.awards,
        world.nationalTeams,
        world.callUps,
        world.international,
      ]);
    };
    expect(run()).toBe(run());
  }, 120000);
});

describe('international tournaments', () => {
  it('plays a 16-nation tournament in even years only', () => {
    const odd = clone(season);
    odd.date = { ...odd.date, season: 2031 };
    expect(playTournament(odd)).toBeNull();
    const even = clone(season);
    even.date = { ...even.date, season: 2032 };
    const tournament = playTournament(even)!;
    expect(tournament.kind).toBe('continental');
    expect(tournament.groups.flat()).toHaveLength(16);
    expect(tournament.matchIds).toHaveLength(4 * 6 + 4 + 2 + 1);
    expect(tournament.winnerId).not.toBe(tournament.runnerUpId);
    const final = even.international!.matches.find(
      (match) => match.id === tournament.matchIds.at(-1),
    )!;
    expect(final.kind).toBe('final');
    expect([final.homeId, final.awayId].sort()).toEqual(
      [tournament.winnerId, tournament.runnerUpId].sort(),
    );
    const world = clone(season);
    world.date = { ...world.date, season: 2034 };
    expect(playTournament(world)!.kind).toBe('world');
    const again = clone(season);
    again.date = { ...again.date, season: 2032 };
    expect(playTournament(again)).toEqual(tournament);
  });

  /**
   * The 2028 tournament, opened early on the complete 2026 season with the career player named
   * in their nation's first eleven. Saves hold a tournament for next season only, so validity
   * is checked as if it were next season's.
   */
  const named = () => {
    const world = clone(season);
    const live = openTournament(world, 2028)!;
    live.inSquad = true;
    live.starts = true;
    return { world, live };
  };
  const validLive = (world: World) => {
    const copy = clone(world);
    copy.international!.live!.year = copy.date.season + 1;
    valid(copy);
  };
  /** Finished between seasons, the tournament is the coming season's: it must save then. */
  const validDone = (world: World) => {
    const copy = clone(world);
    const last = copy.international!.tournaments.at(-1)!;
    last.year = copy.phase === 'complete' ? copy.date.season + 1 : copy.date.season;
    valid(copy);
  };

  it('opens before an even season and plays one round at a time', () => {
    expect(openTournament(clone(season), 2027)).toBeNull();
    const { world, live } = named();
    expect(live.round).toBe(1);
    expect(live.fixtures).toHaveLength(24);
    expect(openTournament(world, 2028)).toBeNull();
    validLive(world);
    const { pending } = advanceTournament(world);
    expect(pending).toBe(pendingTournamentFixture(world));
    expect(pending!.round).toBe(1);
    expect([pending!.homeId, pending!.awayId]).toContain(live.careerNationId);
    // Everyone else's matchday-one match is played; the player's waits for them.
    const first = live.fixtures.filter((fixture) => fixture.round === 1);
    expect(first.filter((fixture) => fixture.matchId)).toHaveLength(7);
    expect(pending!.matchId).toBeNull();
    // Advancing again without playing it changes nothing.
    expect(advanceTournament(world).pending).toBe(pending);
    expect(live.round).toBe(1);
    validLive(world);
  });

  it('ends the same whether the career player’s matches stop it or not', () => {
    const once = named();
    const all = finishTournament(once.world)!;
    const { world } = named();
    let stops = 0;
    for (let guard = 0; guard < 8 && world.international!.live; guard++) {
      if (advanceTournament(world).pending) stops++;
      // Simulate the waiting match too: the same seeded result as at once.
      advanceTournament(world, { simulateCareer: true });
    }
    expect(stops).toBeGreaterThanOrEqual(1);
    expect(world.international!.live).toBeNull();
    expect(world.international!.tournaments.at(-1)).toEqual(all);
    expect(world.career!.honours.caps).toEqual(once.world.career!.honours.caps);
    expect(all.matchIds).toHaveLength(31);
    validDone(world);
  });

  it('counts a played match once and refuses it twice', () => {
    const { world } = named();
    const before = world.career!.honours.caps.senior;
    const { pending } = advanceTournament(world);
    const match = {
      id: `intl:test:${pending!.id}`,
      date: { ...world.date },
      level: 'senior' as const,
      kind: tournamentStakes(pending!).kind,
      tournamentId: world.international!.live!.id,
      homeId: pending!.homeId,
      awayId: pending!.awayId,
      score: [2, 1] as [number, number],
      penalties: null,
      career: { rating: 7.4, goals: 1, assists: 0 },
    };
    recordTournamentMatch(world, pending!, match);
    expect(world.career!.honours.caps.senior).toBe(before + 1);
    expect(pending!.score).toEqual([2, 1]);
    expect(() => recordTournamentMatch(world, pending!, match)).toThrow();
    expect(world.career!.honours.caps.senior).toBe(before + 1);
    expect(advanceTournament(world).pending?.round).toBe(2);
    validLive(world);
  });

  it('opens at the end of an odd season and closes before the next one', () => {
    const odd = clone(season);
    odd.international!.live = null;
    honoursSeasonEnd(odd);
    // 2026 ends; no tournament before 2027.
    expect(odd.international!.live ?? null).toBeNull();
    const even = clone(season);
    even.date = { ...even.date, season: 2027 };
    honoursSeasonEnd(even);
    expect(even.international!.live?.year).toBe(2028);
    const { world } = named();
    advanceTournament(world);
    const next = startNextSeason(world);
    expect(next.international!.live).toBeNull();
    expect(next.international!.tournaments.at(-1)?.id).toBe('tournament:2028');
    validDone(next);
  }, 120000);

  it('hands a retiring player’s tournament place to nobody (0.9.1)', () => {
    const all = finishTournament(named().world)!;
    const { world: before, live } = named();
    const nationId = live.careerNationId!;
    expect(nationId).not.toBeNull();
    // A window the player set out to play is dropped with the place.
    before.international!.window = {
      id: 'window:test',
      season: before.date.season,
      week: 1,
      nationId,
      fixtures: [],
      simulate: false,
    };
    before.players[before.career!.playerId]!.birthSeason =
      before.date.season - H.retirement.optionalAge;
    const retired = applyHonoursAction(before, { type: 'retire' });
    expect(before.international!.live!.careerNationId).toBe(nationId);
    expect(retired.international!.live).toMatchObject({
      careerNationId: null,
      inSquad: false,
      starts: false,
    });
    expect(retired.international!.window).toBeNull();
    validLive(retired);
    const legacy = retired.legacies.at(-1)!;
    const guest = retired.international!.nations.find(
      (nation) =>
        nation.countryId &&
        nation.countryId !== draft.nationalityId &&
        live.groups.some((group) => group.includes(nation.id)),
    )!;
    // A save from 0.9.0 kept the place through the retirement: a new career clears it too.
    const stale = clone(retired);
    Object.assign(stale.international!.live!, { careerNationId: nationId, inSquad: true });
    const drafts: [World, CareerDraft][] = [
      [retired, { ...draft, name: 'Sam Vale', age: 16, parentLegacyId: legacy.id }],
      [retired, { ...draft, name: 'Alex Moreau', nationalityId: guest.countryId! }],
      [stale, { ...draft, name: 'Sam Vale', age: 16, parentLegacyId: legacy.id }],
    ];
    for (const [from, next] of drafts) {
      const trial = trialOffers(from, next.nationalityId, 'after-retirement')[0]!;
      const world = createCareer(from, next, trial.id, 'after-retirement');
      const own = world.career!.playerId;
      expect(world.international!.live!.careerNationId).toBeNull();
      expect(tournamentStep(world)).toBeNull();
      expect(pendingTournamentFixture(world)).toBeNull();
      // The tournament plays on as a simulated one, to the same result.
      const { pending, tournament } = advanceTournament(world);
      expect(pending).toBeNull();
      expect(tournament).toMatchObject({ winnerId: all.winnerId, career: null });
      expect(tournament!.matchIds).toHaveLength(31);
      expect(world.career!.honours.caps).toEqual({ U19: 0, U21: 0, senior: 0 });
      expect(
        world.chronicle.filter(
          (entry) =>
            entry.playerId === own &&
            ['cap', 'international-goal', 'tournament'].includes(entry.kind),
        ),
      ).toHaveLength(0);
      validDone(world);
    }
  }, 120000);
});

describe('retirement and legacy', () => {
  it('lets the player retire from 32 once a season is complete, and forces it at 40', () => {
    expect(retirementState(aged(career, 25))).toBe('young');
    expect(retirementState(aged(career, H.retirement.optionalAge))).toBe('season');
    expect(retirementState(aged(season, H.retirement.optionalAge))).toBe('available');
    expect(retirementState(aged(season, H.retirement.forcedAge))).toBe('forced');
    expect(() => applyHonoursAction(aged(career, 33), { type: 'retire' })).toThrow();
    expect(() => applyHonoursAction(aged(season, 25), { type: 'retire' })).toThrow();
  });

  it('turns the career into a legacy and keeps the world valid', () => {
    const before = aged(season, 34);
    const id = before.career!.playerId;
    const world = applyHonoursAction(before, { type: 'retire' });
    expect(before.career).toBeDefined();
    expect(world.career).toBeUndefined();
    const legacy = world.legacies.at(-1)!;
    expect(legacy.playerId).toBe(id);
    expect(legacy.age).toBe(34);
    expect(legacy.stats.appearances).toBe(before.players[id]!.stats.appearances);
    // The legacy keeps the career's record, scored as every other player's is.
    expect(legacy.hallOfFame.score).toBe(achievementScore(before, before.players[id]!));
    expect(legacy.hallOfFame.score).toBeGreaterThan(0);
    expect(legacy.hallOfFame).toMatchObject(hallOfFameRank(world, legacy.hallOfFame.score, id));
    expect(world.players[id]).toMatchObject({ retired: true, clubId: null, contractId: null });
    expect(world.chronicle.at(-1)!.kind).toBe('retirement');
    expect(world.inbox).toHaveLength(0);
    expect(world.callUps).toHaveLength(0);
    valid(world);
    const save = saveOf(world);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const next = startNextSeason(world);
    expect(next.players[id]).toBeDefined();
    valid(next);
  }, 120000);

  it('starts the child of a retired player with an inheritance', () => {
    const retired = applyHonoursAction(aged(season, 34), { type: 'retire' });
    const legacy = retired.legacies.at(-1)!;
    const trial = trialOffers(retired, 'country:0', 'honours-child')[0]!;
    const child = { ...draft, name: 'Sam Vale', parentLegacyId: legacy.id };
    expect(() => validateDraft(retired, { ...child, nationalityId: 'country:1' })).toThrow();
    const world = createCareer(retired, child, trial.id, 'honours-child');
    const parent = world.legacies.at(-1)!;
    expect(parent.childPlayerId).toBe(world.career!.playerId);
    expect(world.career!.honours.parentLegacyId).toBe(legacy.id);
    expect(world.career!.fame).toBe(
      Math.min(H.child.fameCap, Math.round(legacy.fame * H.child.fameShare)),
    );
    expect(world.chronicle.at(-1)).toMatchObject({
      kind: 'start',
      params: { parent: legacy.name },
    });
    expect(() => validateDraft(world, child)).toThrow();
    valid(world);
  }, 120000);

  it('starts a child named exactly as the parent under an id of their own (0.9.1)', () => {
    // The first career's id still comes from its name alone.
    const first = career.career!.playerId;
    expect(first).toBe(`career:${hashSeed(`honours-tests:${draft.name}`)}`);
    const retired = applyHonoursAction(aged(season, 34), { type: 'retire' });
    const child = { ...draft, parentLegacyId: retired.legacies.at(-1)!.id };
    const trial = trialOffers(retired, 'country:0', 'honours-tests')[0]!;
    const world = createCareer(retired, child, trial.id, 'honours-tests');
    const id = world.career!.playerId;
    expect(id).not.toBe(first);
    expect(world.players[first]).toMatchObject({ name: draft.name, retired: true });
    expect(world.players[id]!.name).toBe(draft.name);
    expect(world.legacies.at(-1)!.childPlayerId).toBe(id);
    expect(createCareer(retired, child, trial.id, 'honours-tests').career!.playerId).toBe(id);
    valid(world);
  }, 120000);

  it('shares cap totals from the career record, not from Chronicle landmarks', () => {
    const before = aged(season, 34);
    const id = before.career!.playerId;
    before.career!.honours.caps = { U19: 12, U21: 18, senior: 74 };
    // The Chronicle records only the first cap at each level.
    expect(
      before.chronicle.filter((e) => e.playerId === id && e.kind === 'cap').length,
    ).toBeLessThan(4);
    const own = (world: World) => world.chronicle.filter((entry) => entry.playerId === id);
    expect(careerTotals(before, id).caps).toBe(104);
    expect(posterSvg(before, before.players[id]!, own(before))).toContain('104 caps');
    const retired = applyHonoursAction(before, { type: 'retire' });
    expect(careerTotals(retired, id)).toEqual({
      appearances: before.players[id]!.stats.appearances,
      goals: before.players[id]!.stats.goals,
      caps: 104,
    });
    // A retired parent keeps their totals once their child's career begins.
    const trial = trialOffers(retired, 'country:0', 'honours-poster')[0]!;
    const legacyId = retired.legacies.at(-1)!.id;
    const child = createCareer(
      retired,
      { ...draft, name: 'Sam Vale', parentLegacyId: legacyId },
      trial.id,
      'honours-poster',
    );
    expect(careerTotals(child, id).caps).toBe(104);
    expect(posterSvg(child, child.players[id]!, own(child))).toContain('104 caps');
    expect(careerTotals(child, child.career!.playerId).caps).toBe(0);
  }, 120000);

  it('offers retired former teammates as managers', () => {
    const world = applyHonoursAction(aged(season, 34), { type: 'retire' });
    const legacy = world.legacies.at(-1)!;
    const [first, second] = legacy.teammateIds.map((id) => world.players[id]!).filter(Boolean);
    first!.retired = true;
    first!.birthSeason = world.date.season - 36;
    second!.birthSeason = world.date.season - 36;
    const ids = formerTeammates(world).map((person) => person.id);
    expect(ids).toContain(first!.id);
    expect(ids).not.toContain(second!.id);
    Object.values(world.managers)[0]!.formerPlayerId = first!.id;
    expect(formerTeammates(world).map((person) => person.id)).not.toContain(first!.id);
  });
});

describe('persistence', () => {
  it('validates honours records and rejects forged ones', () => {
    valid(season);
    const forge = (change: (world: World) => void) => {
      const world = clone(season);
      change(world);
      return () => validateWorld(world);
    };
    expect(forge((w) => (w.career!.honours.caps.senior = -1))).toThrow();
    expect(forge((w) => w.awards[0]!.winnerIds.push('player:missing'))).toThrow();
    expect(forge((w) => (w.chronicle[0]!.kind = 'nonsense' as never))).toThrow();
  });

  it('migrates a schema-11 career by adding its honours', () => {
    const world = clone(career);
    delete (world.career as Partial<NonNullable<World['career']>>).honours;
    delete world.international;
    delete world.awardState;
    const migrated = migrateSave({
      format: 'pitch-to-glory',
      schemaVersion: 11,
      engineVersion: 'old',
      slot: 1,
      name: 'Old career',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      revision: 1,
      payload: {
        kind: 'world',
        world,
        gallery: { seed: 'h', generation: 0 },
        settings: DEFAULT_SETTINGS,
      },
    });
    expect(migrated.schemaVersion).toBe(22);
    const next = (migrated.payload as { world: World }).world;
    expect(next.career!.honours.caps).toEqual({ U19: 0, U21: 0, senior: 0 });
    expect(next.international!.nations.length).toBeGreaterThan(6);
    expect(next.awardState!.season).toBe(next.date.season);
    valid(next);
  });
});

describe('club trophies', () => {
  const { recordCareerTrophies } = awards;
  /** A legacy career world with one cup won by `winnerId`, decided this week. */
  function cupWon(winnerId: string) {
    const world = clone(career);
    const cup = Object.values(world.competitions)[0]!;
    cup.winnerId = winnerId;
    return { world, cup };
  }
  const appear = (world: World, competitionId: string, clubId: string, playerId: string) => {
    const lines = (world.seasonStats!.competitions[competitionId] ??= {});
    (lines[clubId] ??= {})[playerId] = [1, 90, 0, 0, 0, 7];
  };
  function move(world: World, clubId: string) {
    const player = world.players[world.career!.playerId]!;
    const from = world.clubs[player.clubId!]!;
    from.playerIds = from.playerIds.filter((id) => id !== player.id);
    world.clubs[clubId]!.playerIds.push(player.id);
    player.clubId = clubId;
  }
  const other = (world: World) =>
    Object.values(world.clubs).find(
      (club) => club.id !== world.players[world.career!.playerId]!.clubId,
    )!.id;

  it('awards a trophy earned before moving on, once', () => {
    const own = career.players[career.career!.playerId]!.clubId!;
    const { world, cup } = cupWon(own);
    appear(world, cup.id, own, world.career!.playerId);
    // Left before the final: the trophy still belongs to the campaign they played in.
    move(world, other(world));
    recordCareerTrophies(world);
    recordCareerTrophies(world);
    const trophies = world.trophies.filter((trophy) => trophy.competitionId === cup.id);
    expect(trophies).toHaveLength(1);
    expect(trophies[0]).toMatchObject({
      clubId: own,
      playerIds: [world.career!.playerId],
      name: cup.name,
      season: world.date.season,
    });
    // The award run at season end never adds it again.
    awards.seasonAwards(world);
    expect(world.trophies.filter((trophy) => trophy.competitionId === cup.id)).toHaveLength(1);
  });

  it('gives nothing for a zero-appearance signing or a move after the final', () => {
    const own = career.players[career.career!.playerId]!.clubId!;
    // Signed by the winners but never played for them in the cup.
    const unused = cupWon(own);
    recordCareerTrophies(unused.world);
    expect(unused.world.trophies).toHaveLength(0);
    // Joined the winners after they won it.
    const winner = other(career);
    const late = cupWon(winner);
    appear(late.world, late.cup.id, own, late.world.career!.playerId);
    move(late.world, winner);
    recordCareerTrophies(late.world);
    expect(late.world.trophies).toHaveLength(0);
  });

  it('records each title of a played season for the campaign the player appeared in', () => {
    const titles = decidedTitles(season);
    const playerId = season.career!.playerId;
    const earned = titles.filter((title) =>
      title.campaign.some(
        (id) => (season.seasonStats!.competitions[id]?.[title.clubId]?.[playerId]?.[0] ?? 0) > 0,
      ),
    );
    const recorded = season.trophies.filter((trophy) => trophy.season === season.date.season);
    expect(recorded.map((trophy) => trophy.competitionId).sort()).toEqual(
      earned.map((title) => title.competitionId).sort(),
    );
  });
});

describe('Hall of Fame comparisons', () => {
  /** Every person once: a legacy by its saved score, everyone else by their record. */
  function expectedRank(world: World, score: number, excludeId: string) {
    const scores = new Map<string, number>();
    for (const legacy of world.legacies) scores.set(legacy.playerId, legacy.hallOfFame.score);
    for (const player of Object.values(world.players))
      if (!scores.has(player.id)) scores.set(player.id, achievementScore(world, player));
    for (const [id, record] of Object.entries(world.archive?.players ?? {}))
      if (!scores.has(id)) scores.set(id, Math.round(record.hallOfFame ?? 0));
    scores.delete(excludeId);
    return {
      rank: 1 + [...scores.values()].filter((value) => value > score).length,
      of: scores.size + 1,
    };
  }

  it('compares a retained former career by its saved legacy score', () => {
    const world = applyHonoursAction(aged(season, 34), { type: 'retire' });
    const legacy = world.legacies.at(-1)!;
    // The retired player stays in the world; their club numbers alone are far lower.
    expect(world.players[legacy.playerId]).toBeDefined();
    legacy.hallOfFame.score = 10000;
    expect(achievementScore(world, world.players[legacy.playerId]!)).toBeLessThan(1000);
    const newcomer = Object.keys(world.players).find((id) => id !== legacy.playerId)!;
    const ranked = hallOfFameRank(world, 1000, newcomer);
    expect(ranked).toEqual(expectedRank(world, 1000, newcomer));
    legacy.hallOfFame.score = 0;
    expect(hallOfFameRank(world, 1000, newcomer).rank).toBe(ranked.rank - 1);
  });

  it('ranks two retired generations by the same criteria, each person once', () => {
    const parentWorld = applyHonoursAction(aged(season, 34), { type: 'retire' });
    const parent = parentWorld.legacies.at(-1)!;
    const trial = trialOffers(parentWorld, 'country:0', 'honours-generations')[0]!;
    const childWorld = createCareer(
      parentWorld,
      { ...draft, name: 'Sam Vale', parentLegacyId: parent.id },
      trial.id,
      'honours-generations',
    );
    const world = applyHonoursAction(aged(childWorld, 34), { type: 'retire' });
    const child = world.legacies.at(-1)!;
    expect(world.legacies.map((legacy) => legacy.playerId)).toEqual([
      parent.playerId,
      child.playerId,
    ]);
    expect(child.hallOfFame).toMatchObject(
      expectedRank(world, child.hallOfFame.score, child.playerId),
    );
    // The parent, still in the world, counts once at their saved score.
    expect(parent.hallOfFame.score).toBeGreaterThan(child.hallOfFame.score);
    valid(world);
  }, 120000);
});

describe('live Hall of Fame rank (phase 7, C3)', () => {
  /** The ranking loop as retirement ran it before the table was extracted. */
  function reference(world: World, score: number, excludeId: string) {
    let better = 0;
    let of = 1;
    let next: { id: string; name: string; score: number } | null = null;
    const counted = new Set<string>([excludeId]);
    const compare = (id: string, value: number, name: string) => {
      if (counted.has(id)) return;
      counted.add(id);
      of++;
      if (value <= score) return;
      better++;
      if (!next || value < next.score || (value === next.score && id < next.id))
        next = { id, name, score: value };
    };
    for (const legacy of world.legacies)
      compare(legacy.playerId, legacy.hallOfFame.score, legacy.name);
    // Everyone else by the shared achievement record, as `hallOfFameTable` scores them.
    for (const player of Object.values(world.players))
      compare(player.id, achievementScore(world, player), player.name);
    for (const [id, record] of Object.entries(world.archive?.players ?? {}))
      compare(id, Math.round(record.hallOfFame ?? 0), record.name);
    return { rank: better + 1, of, next };
  }

  it('ranks exactly as the retirement loop did, for any score and owner', () => {
    const playerId = season.career!.playerId;
    const other = Object.keys(season.players).find((id) => id !== playerId)!;
    for (const score of [0, 1, 25, 120, careerHallOfFameScore(season), 800, 100000])
      for (const id of [playerId, other, 'player:absent'])
        expect(hallOfFameStanding(season, score, id)).toEqual(reference(season, score, id));
  });

  it('keeps the retirement legacy identical to the original ranking', () => {
    const before = aged(season, 34);
    const score = careerHallOfFameScore(before);
    const expected = reference(before, score, before.career!.playerId);
    const legacy = applyHonoursAction(before, { type: 'retire' }).legacies.at(-1)!;
    expect(legacy.hallOfFame).toEqual({ score, rank: expected.rank, of: expected.of });
  });

  it('memoises the table per world state and matches the fresh standing', () => {
    const world = clone(season);
    const table = memoisedHallOfFameTable(world);
    expect(memoisedHallOfFameTable(clone(world))).toBe(table);
    expect(liveHallOfFameRank(world)).toEqual(liveHallOfFame(world));
    // A new week (or new results) rebuilds it.
    const next = clone(world);
    next.date = { ...next.date, week: next.date.week + 1 };
    expect(memoisedHallOfFameTable(next)).not.toBe(table);
    expect(memoisedHallOfFameTable(next)).toEqual(hallOfFameTable(next));
    // The career's own score is always current, even within the same week (the record, not
    // the raw totals, is what counts).
    const scored = clone(world);
    const own = scored.players[scored.career!.playerId]!;
    own.hallOfFame = (own.hallOfFame ?? 0) + 600;
    expect(liveHallOfFameRank(scored)).toEqual(liveHallOfFame(scored));
    expect(liveHallOfFameRank(scored).rank).toBeLessThan(liveHallOfFameRank(world).rank);
  });

  it('names the player just below a legacy while the table still agrees with it', () => {
    const world = applyHonoursAction(aged(season, 34), { type: 'retire' });
    const legacy = world.legacies.at(-1)!;
    const table = hallOfFameTable(world).filter((entry) => entry.id !== legacy.playerId);
    const below = table.filter((entry) => entry.score < legacy.hallOfFame.score);
    const top = below.at(-1);
    const neighbour = legacyNeighbour(world, legacy);
    if (!top) expect(neighbour).toBeNull();
    else {
      const first = below.find((entry) => entry.score === top.score)!;
      expect(neighbour).toEqual({
        name: world.players[first.id]?.name ?? world.archive?.players[first.id]?.name,
        rank: 2 + table.filter((entry) => entry.score > first.score).length,
      });
      expect(neighbour!.rank).toBeGreaterThan(legacy.hallOfFame.rank);
    }
    // Once the world has moved on, the stored rank and today's table no longer agree.
    const moved = clone(world);
    moved.legacies.at(-1)!.hallOfFame.rank += 5;
    expect(legacyNeighbour(moved, moved.legacies.at(-1)!)).toBeNull();
  });
});
