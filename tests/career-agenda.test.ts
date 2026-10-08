import { beforeAll, describe, expect, it } from 'vitest';
import type { Fixture, Injury, MediaItem, TransferOffer, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { getSeasonWeeks } from '../src/engine/world/calendar';
import {
  advanceDigest,
  advancePreview,
  hubPriorities,
  parseSince,
  seasonAgenda,
  sinceValue,
  withSave,
} from '../src/screens/career/agenda';

const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
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
let start: World;
beforeAll(() => {
  const base = generateWorld('agenda-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'agenda-tests')[0]!;
  start = createCareer(base, draft, trial.id, 'agenda-tests');
  between = findBetweenMatches();
}, 60000);
const player = (world: World) => world.players[world.career!.playerId]!;
const clubId = (world: World) => player(world).clubId!;
/** Simulate weeks with the career's own matches auto-played, as a season simulation does. */
function weeks(world: World, count: number): World {
  let next = world;
  for (let week = 0; week < count && next.phase === 'active'; week++)
    next = advanceCareerWeek(next, { inPlace: true, autoPlay: true }).world;
  return next;
}
/** The world at a week with no match ready, so Continue is available (computed once). */
let between: World;
function findBetweenMatches(): World {
  let world = clone(start);
  // A week with nothing to play, and more of the season to come.
  const later = (w: World) =>
    Object.values(w.fixtures).some(
      (f) =>
        f.date.season === w.date.season &&
        f.date.week > w.date.week &&
        (f.homeId === clubId(w) || f.awayId === clubId(w)),
    );
  world = weeks(world, 1);
  // The club plays every week, so the quiet week is one the player is not yet registered for.
  world.career!.market.registeredFrom = {
    season: world.date.season,
    week: world.date.week + 1,
    day: 1,
  };
  expect(pendingCareerFixture(world)).toBeNull();
  expect(later(world)).toBe(true);
  return quiet(world);
}
const betweenMatches = (): World => clone(between);
/** Close the world's own open actions, so each test controls what is waiting. */
function quiet(world: World): World {
  world.media = world.media.filter((item) => !item.choices.length || item.answer !== null);
  world.offers = world.offers.filter((entry) => entry.status !== 'terms');
  world.sponsorships = world.sponsorships.filter((deal) => deal.status !== 'offered');
  world.career!.attributePoints = 0;
  world.career!.skillPoints = 0;
  return world;
}
function injure(world: World, weeksRemaining: number, recovery: Injury['recovery']): Injury {
  const injury: Injury = {
    id: 'injury:test',
    playerId: world.career!.playerId,
    kind: 'hamstring-strain',
    started: { ...world.date },
    weeksRemaining,
    severity: 2,
    reinjuryRisk: 0,
    recovery,
    careerThreatening: false,
    cause: 'match',
  };
  world.career!.injury = injury;
  player(world).injuryId = injury.id;
  return injury;
}
function offer(world: World, id: string, expiresWeek: number): TransferOffer {
  const buyer = Object.values(world.clubs).find((club) => club.id !== clubId(world))!;
  const entry: TransferOffer = {
    id,
    kind: 'transfer',
    clubId: buyer.id,
    parentClubId: clubId(world),
    playerId: world.career!.playerId,
    created: { ...world.date },
    expires: { season: world.date.season, week: expiresWeek, day: 7 },
    fee: 1000,
    bids: [1000],
    releaseClauseTriggered: false,
    loan: null,
    status: 'terms',
    negotiationId: null,
  };
  world.offers.push(entry);
  return entry;
}
function press(world: World, id: string, expiresWeek: number): MediaItem {
  const item: MediaItem = {
    id,
    date: { ...world.date },
    kind: 'press',
    author: 'journalist',
    authorName: 'The Courier',
    textKey: 'form',
    params: {},
    sentiment: 0,
    likes: 0,
    choices: [
      {
        id: 'humble',
        tone: 'humble',
        labelKey: 'humble',
        effects: {},
      } as MediaItem['choices'][number],
    ],
    answer: null,
    expires: { season: world.date.season, week: expiresWeek, day: 7 },
  };
  world.media.push(item);
  return item;
}

describe('hub priorities', () => {
  it('orders recovery, the match, deadlines by date, then unspent points', () => {
    const world = betweenMatches();
    const week = world.date.week;
    world.career!.attributePoints = 2;
    world.career!.skillPoints = 1;
    press(world, 'press:late', week + 2);
    offer(world, 'offer:soon', week);
    injure(world, 3, null);
    const kinds = hubPriorities(world, null).map((item) => item.kind);
    expect(kinds).toEqual(['recovery', 'offer', 'press', 'attributes', 'skills']);
    // A match in progress outranks every deadline, but not the recovery choice.
    expect(
      hubPriorities(world, 'live')
        .map((item) => item.kind)
        .slice(0, 2),
    ).toEqual(['recovery', 'resume']);
    expect(hubPriorities(world, 'finished')[1]!.kind).toBe('report');
  });

  it('puts a playable fixture before deadlines and drops answered or lapsed items', () => {
    const world = quiet(clone(start));
    const pending = pendingCareerFixture(world);
    expect(pending).not.toBeNull();
    const item = press(world, 'press:open', world.date.week + 1);
    const lapsed = offer(world, 'offer:gone', world.date.week);
    lapsed.status = 'expired';
    const items = hubPriorities(world, null);
    expect(items[0]).toMatchObject({ kind: 'play', to: '/match' });
    expect(items.map((entry) => entry.id)).toContain('press:press:open');
    expect(items.map((entry) => entry.id)).not.toContain('offer:offer:gone');
    item.answer = 'humble';
    expect(hubPriorities(world, null).map((entry) => entry.kind)).not.toContain('press');
  });

  it('keeps the save in career links only', () => {
    expect(withSave('/career/transfers?offer=a', '2')).toBe('/career/transfers?offer=a&save=2');
    expect(withSave('/career#condition-heading', '1')).toBe('/career?save=1#condition-heading');
    expect(withSave('/match', '1')).toBe('/match');
    expect(withSave('/career/media', null)).toBe('/career/media');
  });
});

describe('advance preview', () => {
  it('heads for the next fixture after this week and lists deadlines that would lapse', () => {
    const world = betweenMatches();
    const week = world.date.week;
    const preview = advancePreview(world, null);
    expect(preview.kind).toBe('fixture');
    expect(preview.fixture!.date.week).toBeGreaterThan(week);
    expect(preview.through).toBe(preview.fixture!.date.week - 1);
    offer(world, 'offer:lapses', week);
    offer(world, 'offer:survives', preview.fixture!.date.week);
    const lapsing = advancePreview(world, null).lapsing.map((item) => item.id);
    expect(lapsing).toEqual(['offer:offer:lapses']);
  });

  it('waits for a recovery choice, then looks past the expected return', () => {
    const world = betweenMatches();
    const week = world.date.week;
    const injury = injure(world, 4, null);
    expect(advancePreview(world, null).kind).toBe('recovery');
    injury.recovery = 'rehab';
    const preview = advancePreview(world, null);
    expect(preview.fitWeek).toBe(week + 4);
    if (preview.fixture) expect(preview.fixture.date.week).toBeGreaterThanOrEqual(week + 4);
  });

  it('offers no advance while a match is ready', () => {
    const world = clone(start);
    expect(pendingCareerFixture(world)).not.toBeNull();
    expect(advancePreview(world, null).kind).toBe('match');
    expect(advancePreview(betweenMatches(), 'live').kind).toBe('match');
  });
});

describe('season agenda', () => {
  it('lists a cup and a league fixture in the same week in day order', () => {
    const world = betweenMatches();
    const league = Object.values(world.fixtures)
      .filter(
        (fixture) =>
          (fixture.homeId === clubId(world) || fixture.awayId === clubId(world)) &&
          fixture.date.week > world.date.week &&
          !world.results[fixture.id],
      )
      .sort((a, b) => a.date.week - b.date.week)[0]!;
    const cup: Fixture = {
      ...league,
      id: 'fixture:midweek-cup',
      competitionId: Object.keys(world.competitions)[0]!,
      date: { ...league.date, day: league.date.day - 3 },
    };
    world.fixtures[cup.id] = cup;
    const week = seasonAgenda(world)[league.date.week - 1]!;
    const ids = week.entries
      .filter((entry) => entry.kind === 'fixture')
      .map((entry) => (entry.kind === 'fixture' ? entry.fixture.id : ''));
    expect(ids).toEqual([cup.id, league.id]);
    // Continue stops at the first of the two.
    const preview = advancePreview(world, null);
    if (preview.fixture?.date.week === league.date.week) expect(preview.fixture.id).toBe(cup.id);
  });

  it('marks the current week, shows the injury return and places deadlines', () => {
    const world = betweenMatches();
    const week = world.date.week;
    injure(world, 2, 'rehab');
    offer(world, 'offer:agenda', week + 1);
    const agenda = seasonAgenda(world);
    expect(agenda).toHaveLength(getSeasonWeeks(world));
    expect(agenda.filter((entry) => entry.current).map((entry) => entry.week)).toEqual([week]);
    expect(agenda[week - 2]?.past).toBe(true);
    expect(agenda[week - 1]!.entries[0]).toMatchObject({ kind: 'recovery' });
    expect(agenda[week + 1]!.entries.some((entry) => entry.kind === 'fit')).toBe(true);
    expect(
      agenda[week]!.entries.some(
        (entry) => entry.kind === 'deadline' && entry.item.id === 'offer:offer:agenda',
      ),
    ).toBe(true);
    // Training is shown where it happens next: not while injured.
    expect(agenda.some((entry) => entry.entries.some((item) => item.kind === 'training'))).toBe(
      false,
    );
    expect(agenda.at(-1)!.entries.at(-1)).toEqual({ kind: 'season-end' });
  });

  it('has nothing to play or advance once the season is complete', () => {
    const world = weeks(clone(start), 200);
    expect(world.phase).toBe('complete');
    expect(advancePreview(world, null).kind).toBe('complete');
    expect(hubPriorities(world, null).map((item) => item.kind)).not.toContain('play');
    const agenda = seasonAgenda(world);
    expect(agenda.some((entry) => entry.current)).toBe(false);
    expect(agenda.every((entry) => entry.past)).toBe(true);
    expect(
      agenda.flatMap((entry) => entry.entries).filter((entry) => entry.kind === 'fixture'),
    ).not.toHaveLength(0);
    expect(
      agenda
        .flatMap((entry) => entry.entries)
        .every((entry) => entry.kind !== 'fixture' || entry.result !== null),
    ).toBe(true);
  }, 120000);
});

describe('digest', () => {
  it('reports what the simulated weeks actually did, including an expired offer', () => {
    const world = betweenMatches();
    const since = { ...world.date };
    const expiring = offer(world, 'offer:digest', since.week);
    const after = weeks(world, 2);
    const digest = advanceDigest(after, since)!;
    expect(digest).not.toBeNull();
    expect(digest.from).toBe(since.week);
    expect(digest.to).toBe(after.date.week - 1);
    expect(after.offers.find((entry) => entry.id === expiring.id)!.status).toBe('expired');
    expect(digest.expiredOffers.map((entry) => entry.id)).toContain(expiring.id);
    // Every listed result really involves the club and lies in the simulated weeks.
    for (const { fixture, result } of digest.results) {
      expect([fixture.homeId, fixture.awayId]).toContain(clubId(after));
      expect(fixture.date.week).toBeGreaterThanOrEqual(digest.from);
      expect(fixture.date.week).toBeLessThanOrEqual(digest.to);
      expect(after.results[fixture.id]).toEqual(result);
    }
    expect(digest.messages).toBe(
      after.inbox.filter(
        (message) =>
          message.date.season === since.season &&
          message.date.week >= digest.from &&
          message.date.week <= digest.to,
      ).length,
    );
  });

  it('is empty-safe: no weeks passed, another season, or an empty inbox', () => {
    const world = betweenMatches();
    expect(advanceDigest(world, { ...world.date })).toBeNull();
    expect(advanceDigest(world, { ...world.date, season: world.date.season - 1 })).toBeNull();
    const since = { ...world.date };
    const after = weeks(world, 1);
    after.inbox = [];
    const digest = advanceDigest(after, since)!;
    expect(digest.messages).toBe(0);
    expect(digest.unread).toBe(0);
  });

  it('round-trips its URL value and rejects anything else', () => {
    const date = { season: 2027, week: 14, day: 3 };
    expect(parseSince(sinceValue(date))).toEqual({ season: 2027, week: 14, day: 1 });
    expect(parseSince('2027-14')).toBeNull();
    expect(parseSince(null)).toBeNull();
  });
});
