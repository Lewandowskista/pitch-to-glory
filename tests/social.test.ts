import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { createRng } from '../src/engine/rng';
import { playerAbility } from '../src/engine/strength';
import { generateWorld } from '../src/engine/world/generate';
import { seasonalSquadReview } from '../src/engine/world/lifecycle';
import { refreshDressingRoom } from '../src/engine/world/dressing';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { lineOf } from '../src/engine/career/market';
import { moraleMultiplier } from '../src/engine/match/decisions';
import {
  applySocialAction,
  careerClub,
  careerRoom,
  chemistry,
  cultureFit,
  keyTeammates,
  lapsePress,
  MORALE_PARTS,
  moraleParts,
  openPress,
  recordHeadToHead,
  rivalOf,
  rivalryOf,
  rivalTransfer,
  syncCliques,
} from '../src/engine/career/social';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';
import { validateWorld } from '../src/persistence/worldSchema';

const S = CONFIG.career.social;
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
let career: World;
beforeAll(() => {
  const base = generateWorld('social-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'social-tests')[0]!;
  career = createCareer(base, draft, trial.id, 'social-tests');
});
const player = (world: World) => world.players[world.career!.playerId]!;
function weeks(world: World, count: number): World {
  let next = world;
  for (let week = 0; week < count && next.phase === 'active'; week++)
    next = advanceCareerWeek(next, { inPlace: true, autoPlay: true }).world;
  return next;
}

describe('rival', () => {
  it('picks a player of the same generation and line at another club', () => {
    const rival = rivalOf(career)!;
    const p = player(career);
    expect(rival.clubId).not.toBe(p.clubId);
    expect(lineOf(rival.primaryPosition)).toBe(lineOf(p.primaryPosition));
    expect(Math.abs(rival.birthSeason - p.birthSeason)).toBeLessThanOrEqual(S.rival.ageRange);
    expect(Math.abs(rival.potential - p.potential)).toBeLessThanOrEqual(
      Math.max(S.rival.potentialSpread, p.potential - Math.ceil(playerAbility(rival))),
    );
    expect(rivalryOf(career)!.intensity).toBe(S.rival.startIntensity);
  });
  it('is never retired, released or trimmed by the AI lifecycle', () => {
    const world = clone(career);
    const rival = rivalOf(world)!;
    rival.birthSeason = world.date.season - 45;
    world.contracts[rival.contractId!]!.end.season = world.date.season - 1;
    world.date.week = CONFIG.world.intakeWeek;
    seasonalSquadReview(world, createRng('rival-lifecycle'));
    expect(rival.retired).toBe(false);
    expect(rival.clubId).not.toBeNull();
    expect(world.contracts[rival.contractId!]!.end.season).toBeGreaterThan(world.date.season);
  });
  it('moves to a bigger club in a window once outgrown, with a consistent registration', () => {
    const world = clone(career);
    const rival = rivalOf(world)!;
    const from = rival.clubId!;
    for (const key of Object.keys(rival.attributes) as (keyof typeof rival.attributes)[])
      rival.attributes[key] = Math.min(99, rival.attributes[key] + 30);
    let moved = null;
    for (let attempt = 0; attempt < 30 && !moved; attempt++)
      moved = rivalTransfer(world, createRng(`rival-move:${attempt}`));
    expect(moved).not.toBeNull();
    expect(rival.clubId).toBe(moved!.club.id);
    expect(world.clubs[from]!.playerIds).not.toContain(rival.id);
    expect(world.contracts[rival.contractId!]!.clubId).toBe(rival.clubId);
    expect(rivalryOf(world)!.timeline.at(-1)!.kind).toBe('transfer');
    valid(world);
  });
  it('records meetings and closes each season with a comparison', () => {
    const world = clone(career);
    const own = player(world).clubId!;
    const rivalClub = rivalOf(world)!.clubId!;
    const fixture = {
      id: 'fixture:test-derby',
      competitionId: Object.keys(world.leagues)[0]!,
      homeId: own,
      awayId: rivalClub,
      date: { ...world.date },
      matchId: null,
    } as World['fixtures'][string];
    world.results[fixture.id] = {
      fixtureId: fixture.id,
      score: [2, 1],
      winnerId: own,
      penalties: null,
      goals: [],
    };
    expect(recordHeadToHead(world, fixture)).toBe('won');
    expect(rivalryOf(world)!.headToHead).toEqual({ played: 1, won: 1, drawn: 0, lost: 0 });
    let season = weeks(clone(career), 60);
    const intensity = rivalryOf(season)!.intensity;
    season = startNextSeason(season);
    const rivalry = rivalryOf(season)!;
    expect(rivalry.seasons).toHaveLength(1);
    expect(rivalry.seasons[0]!.season).toBe(season.date.season - 1);
    expect(rivalry.intensity).toBeGreaterThanOrEqual(intensity);
    valid(season);
  }, 120000);
});

describe('dressing room and relationships', () => {
  it('groups the squad into cliques with valid leaders that survive squad changes', () => {
    const world = clone(career);
    const room = careerRoom(world);
    expect(room.cliques.length).toBeGreaterThanOrEqual(2);
    for (const clique of room.cliques) {
      expect(clique.playerIds.length).toBeGreaterThanOrEqual(2);
      expect(clique.playerIds).toContain(clique.leaderId);
    }
    expect(room.cliques.some((clique) => clique.playerIds.includes(player(world).id))).toBe(true);
    // A departing leader is replaced; affinity is kept across a regroup.
    const clique = room.cliques.find((c) => c.leaderId !== player(world).id)!;
    clique.affinity = 77;
    const club = careerClub(world);
    club.playerIds = club.playerIds.filter((id) => id !== clique.leaderId);
    world.players[clique.leaderId!]!.clubId = null;
    refreshDressingRoom(world, club);
    const refreshed = careerRoom(world).cliques.find((c) => c.kind === clique.kind);
    if (refreshed) expect(refreshed.playerIds).toContain(refreshed.leaderId);
    syncCliques(world);
    expect(careerRoom(world).cliques.find((c) => c.kind === clique.kind)?.affinity ?? 77).toBe(77);
  });
  it('keeps relationships with key teammates whose chemistry grows at the club', () => {
    let world = clone(career);
    const teammates = keyTeammates(world);
    expect(teammates.length).toBeGreaterThan(0);
    expect(teammates.length).toBeLessThanOrEqual(S.teammates.count);
    const before = chemistry(world);
    world = weeks(world, 12);
    expect(chemistry(world)).not.toBe(before);
    expect(world.relationships.filter((r) => r.kind === 'teammate').length).toBeGreaterThan(0);
  }, 60000);
  it('explains culture fit with bounded parts that favour suitable clubs', () => {
    const world = clone(career);
    const p = player(world);
    const club = careerClub(world);
    const fit = cultureFit(world, p, club);
    expect(fit.value).toBeGreaterThanOrEqual(0);
    expect(fit.value).toBeLessThanOrEqual(100);
    club.culture.youth = 95;
    const youthful = cultureFit(world, p, club).value;
    club.culture.youth = 10;
    expect(youthful).toBeGreaterThan(cultureFit(world, p, club).value);
  });
});

describe('morale, form and the match', () => {
  it('moves morale toward a target built from bounded parts, and records each week', () => {
    let world = clone(career);
    world = weeks(world, 6);
    const social = world.career!.social;
    expect(social.history).toHaveLength(6);
    expect(social.morale!.target).toBeGreaterThanOrEqual(0);
    for (const part of MORALE_PARTS)
      expect(Math.abs(social.morale!.parts[part])).toBeLessThanOrEqual(12);
    const calm = moraleParts(world).situation;
    world.career!.market.transferRequest = { ...world.date };
    expect(moraleParts(world).situation).toBeLessThan(calm);
  }, 60000);
  it('lets morale shift key-moment odds within bounds', () => {
    const M = S.matchMorale;
    expect(moraleMultiplier(M.neutral)).toBe(1);
    expect(moraleMultiplier(100)).toBeLessThanOrEqual(M.maximum);
    expect(moraleMultiplier(0)).toBeGreaterThanOrEqual(M.minimum);
    expect(moraleMultiplier(90)).toBeGreaterThan(moraleMultiplier(40));
  });
});

describe('media', () => {
  it('covers each match with a headline and fan posts', () => {
    const world = weeks(clone(career), 8);
    const matches = world.career!.matches.length;
    expect(matches).toBeGreaterThan(0);
    expect(world.media.filter((item) => item.kind === 'headline')).toHaveLength(matches);
    expect(world.media.filter((item) => item.author === 'fan').length).toBe(
      matches * S.media.fanPosts,
    );
  }, 60000);
  it('applies an answer once, with its stated effects, and lapses unanswered questions', () => {
    const world = clone(career);
    const item = openPress(world, createRng('press'), 'rival', { rival: rivalOf(world)!.name });
    expect(world.inbox.at(-1)!.subjectKey).toBe('press-request');
    const choice = item.choices.find((entry) => entry.tone === 'provocative')!;
    const fame = world.career!.fame;
    const intensity = rivalryOf(world)!.intensity;
    const answered = applySocialAction(world, {
      type: 'answer',
      mediaId: item.id,
      choiceId: choice.id,
    });
    expect(answered.career!.fame).toBe(fame + choice.effects.fame);
    expect(rivalryOf(answered)!.intensity).toBe(intensity + choice.effects.rival);
    expect(answered.media.some((entry) => entry.author === 'rival')).toBe(true);
    // The input world is untouched, and an answer cannot be given twice.
    expect(world.media.find((entry) => entry.id === item.id)!.answer).toBeNull();
    expect(() =>
      applySocialAction(answered, { type: 'answer', mediaId: item.id, choiceId: choice.id }),
    ).toThrow();
    valid(answered);
    const lapsed = clone(world);
    lapsed.date.week = item.expires!.week;
    const before = lapsed.career!.fame;
    lapsePress(lapsed);
    expect(lapsed.media.find((entry) => entry.id === item.id)!.answer).toBe('silence');
    expect(lapsed.career!.fame).toBe(before + S.media.silenceFame);
  });
  it('is deterministic for a seed', () => {
    const a = weeks(clone(career), 10);
    const b = weeks(clone(career), 10);
    expect(JSON.stringify(a.media)).toBe(JSON.stringify(b.media));
    expect(JSON.stringify(a.career!.social)).toBe(JSON.stringify(b.career!.social));
  }, 60000);
});

describe('social saves', () => {
  it('round trips and rejects forged social records', () => {
    const world = weeks(clone(career), 6);
    const payload = {
      kind: 'world' as const,
      world,
      gallery: { seed: 's', generation: 0 },
      settings: DEFAULT_SETTINGS,
    };
    const save = createSave(1, 'Social', payload);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const forge = (change: (w: World) => void) => {
      const forged = clone(world);
      change(forged);
      return () => createSave(1, 'Forged', { ...payload, world: forged });
    };
    expect(forge((w) => careerRoom(w).cliques[0]!.playerIds.push('player:missing'))).toThrow();
    expect(forge((w) => (rivalryOf(w)!.headToHead.won = 3))).toThrow();
    expect(forge((w) => (w.media[0]!.sentiment = 5))).toThrow();
    expect(forge((w) => (w.rivalries[0]!.rivalPlayerId = w.career!.playerId))).toThrow();
    const plain = generateWorld('social-plain', { format: 'legacy' });
    plain.media.push(clone(world).media[0]!);
    expect(() => createSave(1, 'Plain', { ...payload, world: plain })).toThrow();
  }, 60000);
  it('migrates a schema-9 career by adding a rival, cliques and teammates', () => {
    const world = clone(career);
    delete (world.career as Partial<NonNullable<World['career']>>).social;
    world.rivalries = [];
    world.media = [];
    for (const room of Object.values(world.dressingRooms)) room.cliques = [];
    world.relationships = world.relationships.filter((r) => r.kind !== 'teammate');
    const migrated = migrateSave({
      format: 'pitch-to-glory',
      schemaVersion: 9,
      engineVersion: 'old',
      slot: 1,
      name: 'Old career',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      revision: 1,
      payload: {
        kind: 'world',
        world,
        gallery: { seed: 's', generation: 0 },
        settings: DEFAULT_SETTINGS,
      },
    });
    const next = (migrated.payload as { world: World }).world;
    expect(next.rivalries).toHaveLength(1);
    expect(careerRoom(next).cliques.length).toBeGreaterThan(0);
    expect(next.career!.social.history).toEqual([]);
    expect(next.relationships.some((r) => r.kind === 'teammate')).toBe(true);
  });
});
