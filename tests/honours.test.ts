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
  hallOfFameScore,
  momentLink,
  parseMomentLink,
  playTournament,
  retirementState,
  windowWeeks,
  type Clip,
} from '../src/engine/career/honours';
import { awardPoints } from '../src/engine/career/honours/retirement';
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
    expect(legacy.hallOfFame.score).toBe(
      hallOfFameScore(legacy.stats, {
        caps: legacy.stats.caps,
        trophies: legacy.trophyIds.length,
        // Awards count by kind, as retirement weighs them.
        awards: awardPoints(world, legacy.awardIds, id),
        goldenBalls: world.awards.filter(
          (a) => a.kind === 'golden-ball' && legacy.awardIds.includes(a.id),
        ).length,
      }),
    );
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
    expect(migrated.schemaVersion).toBe(19);
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
  /** Every person once: a legacy by its saved score, everyone else by club numbers. */
  function expectedRank(world: World, score: number, excludeId: string) {
    const scores = new Map<string, number>();
    for (const legacy of world.legacies) scores.set(legacy.playerId, legacy.hallOfFame.score);
    for (const player of Object.values(world.players))
      if (!scores.has(player.id)) scores.set(player.id, hallOfFameScore(player.stats));
    for (const [id, record] of Object.entries(world.archive?.players ?? {}))
      if (!scores.has(id)) scores.set(id, hallOfFameScore(record.stats));
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
    expect(hallOfFameScore(world.players[legacy.playerId]!.stats)).toBeLessThan(1000);
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
