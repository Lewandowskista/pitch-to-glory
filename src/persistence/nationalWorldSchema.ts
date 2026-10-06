import type { Standing, World } from '../model/domain';
import { CONFIG } from '../engine/config';
import { NATIONAL_PROFILES } from '../engine/world/profiles';
import { portugueseSurvivalBonus } from '../engine/world/postseason';
import {
  array,
  date,
  id,
  ids,
  map,
  number,
  object,
  options,
  ref,
  requireValue,
  standings,
  text,
  validateEntities,
} from './worldValidation';

// Bounds apply before traversing imported graphs. Rules are frozen by profile version.
function canonicalData(value: unknown): string {
  const ordered = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(ordered);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, v]) => [key, ordered(v)]),
      );
    return value;
  };
  return JSON.stringify(ordered(value));
}
/**
 * Sporting rules are frozen per profile version. Only rule-bearing fields take part in the
 * fingerprint, so corrected citations, adaptation notes, names or rule descriptions in a
 * later build never invalidate an existing save. A rule change requires a new profile
 * version, registered alongside the old one so saved worlds keep their original rules.
 */
export function profileRuleFingerprint(profile: unknown): string {
  const p = object(profile);
  return canonicalData({
    version: p.version,
    counterpart: p.counterpart,
    divisions: array(p.divisions, 12).map((value) => {
      const d = object(value);
      return {
        id: d.id,
        tier: d.tier,
        status: d.status,
        regularRounds: d.regularRounds,
        automaticPromotion: d.automaticPromotion,
        automaticRelegation: d.automaticRelegation,
        groups: array(d.groups, 12).map((group) => {
          const g = object(group);
          return { id: g.id, region: g.region, size: g.size };
        }),
        zones: array(d.zones, 10).map((zone) => {
          const z = object(zone);
          return { from: z.from, to: z.to, kind: z.kind };
        }),
      };
    }),
  });
}
const profileRules = new Map(
  NATIONAL_PROFILES.map((profile) => [
    `${profile.version}:${profile.counterpart}`,
    profileRuleFingerprint(profile),
  ]),
);
interface SavedDivision {
  id: string;
  tier: number;
  status: string;
  rules: string;
  name: string;
  groups: { id: string; name: string; region: string; size: number }[];
}
function savedProfile(value: unknown): { referenceSeason: string; divisions: SavedDivision[] } {
  const p = object(value);
  requireValue(p.version === 1);
  text(p.counterpart);
  text(p.referenceSeason, 20);
  for (const divisionValue of array(p.divisions, 12)) {
    const d = object(divisionValue);
    text(d.id);
    text(d.name);
    text(d.rules, 4000);
    for (const groupValue of array(d.groups, 12)) {
      const g = object(groupValue);
      text(g.id);
      text(g.name);
      text(g.region);
      number(g.size, 2, 32, true);
    }
  }
  return p as unknown as { referenceSeason: string; divisions: SavedDivision[] };
}
export function validateNationalWorld(value: unknown): World {
  const w = object(value);
  id(w.id);
  text(w.seed);
  date(w.date);
  options(w.phase, ['active', 'complete']);
  const current = object(w.date),
    season = object(w.season),
    rng = object(w.rng);
  requireValue(rng.algorithm === 'mulberry32');
  text(rng.seed, 512);
  number(rng.state, 0, 0xffffffff, true);
  number(rng.draws, 0, Number.MAX_SAFE_INTEGER, true);
  number(season.year, 1800, 9999, true);
  date(season.start);
  date(season.end);
  requireValue(
    season.year === current.season &&
      object(season.start).season === season.year &&
      object(season.end).season === season.year,
  );
  const lastWeek = Number(object(season.end).week);
  requireValue(lastWeek === CONFIG.world.nationalWeeksPerSeason);
  requireValue(
    w.phase === 'complete' ? current.week === lastWeek + 1 : Number(current.week) <= lastWeek,
  );
  ids(season.awardIds);
  const countries = map(w.countries, 6),
    leagues = map(w.leagues, 80),
    clubs = map(w.clubs, 2500);
  const fixtures = map(w.fixtures, 60000),
    competitions = map(w.competitions, 20);
  const pyramid = object(w.pyramid);
  requireValue(pyramid.version === 1);
  options(pyramid.stage, ['regular', 'postseason', 'resolved']);
  const profiles = object(pyramid.profiles),
    phases = map(pyramid.phases, 80),
    ties = map(pyramid.ties, 1000);
  const feederIds = ids(pyramid.feederClubIds, 1500);
  const completedSteps = ids(pyramid.completedSteps, 1000);
  requireValue(Object.keys(countries).length === 6 && Object.keys(profiles).length === 6);
  const claimedLeagues = new Set<string>(),
    claimedCups = new Set<string>(),
    counterparts = new Set<string>();
  for (const country of Object.values(countries)) {
    text(country.name);
    text(country.counterpart);
    requireValue(!counterparts.has(String(country.counterpart)));
    counterparts.add(String(country.counterpart));
    text(country.referenceSeason);
    const profileValue = object(profiles[String(country.id)]);
    requireValue(profileValue.counterpart === country.counterpart);
    requireValue(
      profileRuleFingerprint(profileValue) ===
        profileRules.get(`${String(profileValue.version)}:${String(country.counterpart)}`),
    );
    // Structure and display text come from the profile frozen in this save.
    const canonical = savedProfile(profileValue);
    requireValue(country.referenceSeason === canonical.referenceSeason);
    const leagueIds = ids(country.leagueIds, 30);
    requireValue(leagueIds.length === canonical.divisions.reduce((n, d) => n + d.groups.length, 0));
    for (const division of canonical.divisions) {
      const groupLeagues = leagueIds.filter((key) => leagues[key]?.divisionId === division.id);
      requireValue(groupLeagues.length === division.groups.length);
      requireValue(
        new Set(groupLeagues.map((key) => leagues[key]!.group)).size === groupLeagues.length,
      );
      for (const key of groupLeagues) {
        const league = leagues[key]!;
        requireValue(league.countryId === country.id && league.tier === division.tier);
        const group = division.groups.find((g) => g.name === league.group);
        requireValue(
          group &&
            league.region === group.region &&
            league.rules === division.rules &&
            league.status === division.status,
        );
        // Regional capacities can vary in subsequent seasons when relegations are allocated.
        const count = array(league.clubIds, 32).length;
        number(league.capacity, 8, 32, true);
        requireValue(league.capacity === count);
        if (league.nextCapacity !== undefined) {
          requireValue(country.counterpart === 'Germany' && division.tier === 4);
          number(league.nextCapacity, 8, 32, true);
        }
        requireValue(
          Number(season.year) === CONFIG.world.startSeason
            ? count === group.size
            : country.counterpart === 'Germany' && division.tier === 4
              ? count >= 8 && count <= 32
              : count === group.size,
        );
      }
    }
    for (const key of leagueIds) {
      ref(key, leagues);
      requireValue(!claimedLeagues.has(key));
      claimedLeagues.add(key);
    }
    ref(country.domesticCupId, competitions);
    requireValue(!claimedCups.has(String(country.domesticCupId)));
    claimedCups.add(String(country.domesticCupId));
    requireValue(array(country.nationalTeamIds).length === 0);
  }
  for (const competition of Object.values(competitions)) {
    if (claimedCups.has(String(competition.id))) continue;
    ref(competition.countryId, countries);
    const profile = object(profiles[String(competition.countryId)]);
    requireValue(
      (profile.divisions as { id: string }[]).some((d) => d.id === competition.divisionId),
    );
    claimedCups.add(String(competition.id));
  }
  requireValue(claimedLeagues.size === Object.keys(leagues).length);
  const seasonIds = ids(season.competitionIds, 120);
  requireValue([...claimedLeagues, ...claimedCups].every((key) => seasonIds.includes(key)));
  const scheduled = new Set<string>(),
    members = new Set<string>();
  const expectedTables = new Map<string, Map<string, Standing>>();
  const registerTable = (key: string, teams: string[], initial: Record<string, number>) => {
    expectedTables.set(
      key,
      new Map(
        teams.map((clubId) => [
          clubId,
          {
            clubId,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: initial[clubId] ?? 0,
          },
        ]),
      ),
    );
  };
  const registerFixtures = (keys: string[], competitionId: string, teams: string[]) => {
    for (const key of keys) {
      ref(key, fixtures);
      requireValue(!scheduled.has(key));
      scheduled.add(key);
      const fixture = fixtures[key]!;
      requireValue(
        fixture.competitionId === competitionId &&
          teams.includes(String(fixture.homeId)) &&
          teams.includes(String(fixture.awayId)),
      );
    }
  };
  const roundRobin = (keys: string[], teams: string[]) => {
    requireValue(keys.length === teams.length * (teams.length - 1));
    const pairs = new Map<string, number>(),
      rounds = new Map<number, Set<string>>();
    for (const key of keys) {
      const f = fixtures[key]!,
        week = Number(object(f.date).week),
        round = rounds.get(week) ?? new Set<string>();
      requireValue(!round.has(String(f.homeId)) && !round.has(String(f.awayId)));
      round.add(String(f.homeId));
      round.add(String(f.awayId));
      rounds.set(week, round);
      const pair = `${f.homeId}|${f.awayId}`;
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    }
    requireValue(rounds.size === 2 * (teams.length % 2 ? teams.length : teams.length - 1));
    requireValue(
      [...rounds.values()].every((round) => round.size === teams.length - (teams.length % 2)),
    );
    for (const home of teams)
      for (const away of teams) if (home !== away) requireValue(pairs.get(`${home}|${away}`) === 1);
  };
  for (const league of Object.values(leagues)) {
    text(league.name);
    ref(league.countryId, countries);
    number(league.tier, 1, 6, true);
    const teams = ids(league.clubIds, 32);
    requireValue(teams.length >= 8);
    for (const key of teams) {
      ref(key, clubs);
      requireValue(
        !members.has(key) &&
          !feederIds.includes(key) &&
          clubs[key]!.leagueId === league.id &&
          clubs[key]!.countryId === league.countryId,
      );
      members.add(key);
    }
    number(league.promotionPlaces, 0, 5, true);
    number(league.relegationPlaces, 0, 8, true);
    standings(league.standings, teams, {});
    const keys = ids(league.fixtureIds, 1200);
    registerFixtures(keys, String(league.id), teams);
    roundRobin(keys, teams);
    registerTable(String(league.id), teams, {});
    for (const zoneValue of array(league.zones, 10)) {
      const zone = object(zoneValue);
      number(zone.from, 1, 32, true);
      number(zone.to, Number(zone.from), 32, true);
      options(zone.kind, [
        'promotion',
        'promotion-playoff',
        'relegation',
        'survival-playoff',
        'qualification',
      ]);
      text(zone.label);
    }
  }
  for (const key of feederIds) {
    ref(key, clubs);
    requireValue(!members.has(key));
    members.add(key);
  }
  requireValue(members.size === Object.keys(clubs).length);
  validateEntities(w, feederIds);
  for (const club of Object.values(clubs)) {
    const identity = object(club.identity);
    requireValue(identity.counterpart === countries[String(club.countryId)]!.counterpart);
    text(identity.region);
    number(identity.latitude, -90, 90);
    number(identity.longitude, -180, 180);
    options(identity.status, ['professional', 'semi-professional', 'amateur']);
    if (identity.reserveParentId !== null) {
      ref(identity.reserveParentId, clubs);
      requireValue(
        identity.reserveParentId !== club.id &&
          clubs[String(identity.reserveParentId)]!.countryId === club.countryId,
      );
    }
  }
  for (const phase of Object.values(phases)) {
    ref(phase.countryId, countries);
    text(phase.name);
    text(phase.divisionId);
    options(phase.kind, ['promotion', 'survival', 'championship']);
    options(phase.status, ['active', 'complete']);
    const sources = ids(phase.sourceLeagueIds, 10);
    sources.forEach((key) => {
      ref(key, leagues);
      requireValue(leagues[key]!.countryId === phase.countryId);
    });
    const teams = ids(phase.clubIds, 32);
    requireValue(teams.length >= 2);
    teams.forEach((key) => {
      ref(key, clubs);
      requireValue(clubs[key]!.countryId === phase.countryId);
    });
    const initial = object(phase.initialPoints) as Record<string, number>;
    requireValue(Object.keys(initial).length <= teams.length);
    for (const [key, bonus] of Object.entries(initial)) {
      requireValue(teams.includes(key));
      number(bonus, 0, 10, true);
    }
    requireValue(countries[String(phase.countryId)]!.counterpart === 'Portugal');
    requireValue(
      sources.every((key) =>
        (leagues[key]!.fixtureIds as string[]).every((fixtureId) =>
          Object.hasOwn(object(w.results), fixtureId),
        ),
      ),
    );
    if (phase.kind === 'survival') {
      requireValue(sources.length === 1 && teams.length === 6);
      const rows = leagues[sources[0]!]!.standings as Standing[];
      requireValue(teams.every((key) => rows.slice(4).some((r) => r.clubId === key)));
      for (const key of teams) {
        const rank = rows.findIndex((r) => r.clubId === key) + 1;
        requireValue(initial[key] === portugueseSurvivalBonus(rank, rows[rank - 1]!.points));
      }
    } else {
      const perGroup = phase.divisionId === 'portugal:3' ? 4 : 2;
      requireValue(
        sources.length === 2 &&
          teams.length === sources.length * perGroup &&
          Object.keys(initial).length === 0,
      );
      const qualifiers = sources.flatMap((key) =>
        (leagues[key]!.standings as Standing[]).slice(0, perGroup).map((r) => r.clubId),
      );
      requireValue(qualifiers.every((key) => teams.includes(key)));
    }
    standings(phase.standings, teams, initial);
    const keys = ids(phase.fixtureIds, 1000);
    registerFixtures(keys, String(phase.id), teams);
    roundRobin(keys, teams);
    registerTable(String(phase.id), teams, initial);
    for (const key of keys) requireValue(fixtures[key]!.phaseId === phase.id);
  }
  for (const tie of Object.values(ties)) {
    ref(tie.countryId, countries);
    text(tie.name);
    if (tie.targetDivisionId !== null)
      requireValue(
        (object(profiles[String(tie.countryId)]).divisions as { id: string }[]).some(
          (d) => d.id === tie.targetDivisionId,
        ),
      );
    options(tie.kind, ['promotion', 'survival', 'championship']);
    ids(tie.sourceLeagueIds, 10).forEach((key) => {
      const league = leagues[key];
      requireValue(
        league
          ? league.countryId === tie.countryId
          : key.startsWith(`feeder:${String(tie.countryId).split(':')[1]}:`),
      );
    });
    number(tie.round, 1, 20, true);
    options(tie.status, ['active', 'complete']);
    number(tie.legs, 1, 2, true);
    options(tie.drawRule, [
      'extra-time-penalties',
      'penalties',
      'higher-rank',
      'higher-rank-after-extra-time',
    ]);
    const teams = ids(tie.clubIds, 2);
    requireValue(teams.length === 2);
    teams.forEach((key) => {
      ref(key, clubs);
      requireValue(clubs[key]!.countryId === tie.countryId);
    });
    if (tie.higherRankedId !== null) requireValue(teams.includes(String(tie.higherRankedId)));
    const keys = ids(tie.fixtureIds, 2);
    requireValue(keys.length === tie.legs);
    registerFixtures(keys, String(tie.id), teams);
    for (const key of keys) requireValue(fixtures[key]!.tieId === tie.id);
    if (tie.neutral !== undefined) requireValue(typeof tie.neutral === 'boolean');
    keys.forEach((key) => requireValue(Boolean(fixtures[key]!.neutral) === Boolean(tie.neutral)));
    if (keys.length === 2) requireValue(fixtures[keys[0]!]!.homeId === fixtures[keys[1]!]!.awayId);
    const aggregate = array(tie.aggregate, 2);
    requireValue(aggregate.length === 2);
    aggregate.forEach((score) => number(score, 0, 30, true));
    if (tie.winnerId !== null) requireValue(teams.includes(String(tie.winnerId)));
    if (tie.resolution !== null)
      options(tie.resolution, ['aggregate', 'extra-time', 'penalties', 'higher-rank']);
  }
  for (const cup of Object.values(competitions)) {
    text(cup.name);
    requireValue(
      cup.kind === 'domestic' && cup.format === 'knockout' && cup.season === season.year,
    );
    const country =
      Object.values(countries).find((c) => c.domesticCupId === cup.id) ??
      countries[String(cup.countryId)];
    requireValue(country);
    const stages = array(cup.stages, 12);
    requireValue(stages.length > 0);
    for (const stageValue of stages) {
      const stage = object(stageValue);
      id(stage.id);
      text(stage.name);
      const groups = array(stage.groups, 1);
      requireValue(groups.length === 1);
      const teams = ids(groups[0], 600),
        byes = ids(stage.byeClubIds, 600);
      teams.forEach((key) => {
        ref(key, clubs);
        requireValue(clubs[key]!.countryId === country.id);
      });
      requireValue(byes.every((key) => teams.includes(key)));
      const keys = ids(stage.fixtureIds, 300);
      requireValue(keys.length * 2 + byes.length === teams.length);
      registerFixtures(keys, String(cup.id), teams);
      const played = keys.flatMap((key) => [
        String(fixtures[key]!.homeId),
        String(fixtures[key]!.awayId),
      ]);
      requireValue(new Set([...played, ...byes]).size === teams.length);
    }
  }
  requireValue(scheduled.size === Object.keys(fixtures).length);
  const results = object(w.results);
  requireValue(Object.keys(results).length <= 60000);
  for (const f of Object.values(fixtures)) {
    date(f.date);
    requireValue(object(f.date).season === season.year && Number(object(f.date).week) <= lastWeek);
    ref(f.homeId, clubs);
    ref(f.awayId, clubs);
    requireValue(f.homeId !== f.awayId && f.matchId === null);
    requireValue(
      Number(object(f.date).week) < Number(current.week)
        ? Object.hasOwn(results, String(f.id))
        : !Object.hasOwn(results, String(f.id)),
    );
  }
  for (const [key, resultValue] of Object.entries(results)) {
    ref(key, fixtures);
    const result = object(resultValue),
      f = fixtures[key]!;
    requireValue(result.fixtureId === key);
    const score = array(result.score, 2);
    requireValue(score.length === 2);
    score.forEach((v) => number(v, 0, CONFIG.world.maxGoals * 2, true));
    const home = Number(score[0]),
      away = Number(score[1]);
    let winner = home > away ? f.homeId : away > home ? f.awayId : null;
    if (result.penalties !== null) {
      const penalty = array(result.penalties, 2);
      requireValue(
        penalty.length === 2 &&
          penalty[0] !== penalty[1] &&
          !expectedTables.has(String(f.competitionId)),
      );
      penalty.forEach((v) => number(v, 0, 30, true));
      winner = Number(penalty[0]) > Number(penalty[1]) ? f.homeId : f.awayId;
    }
    if (result.extraTime !== undefined) {
      const extra = array(result.extraTime, 2);
      requireValue(extra.length === 2 && !expectedTables.has(String(f.competitionId)));
      extra.forEach((v) => number(v, 0, CONFIG.world.maxGoals, true));
      requireValue(Number(extra[0]) <= home && Number(extra[1]) <= away);
    }
    requireValue(result.winnerId === winner);
    const goals = array(result.goals, CONFIG.world.maxGoals * 4);
    requireValue(goals.length === home + away);
    let homeGoals = 0;
    for (const goalValue of goals) {
      const goal = object(goalValue);
      ref(goal.playerId, object(w.players));
      requireValue(goal.teamId === f.homeId || goal.teamId === f.awayId);
      number(goal.minute, 1, 120, true);
      if (goal.teamId === f.homeId) homeGoals++;
    }
    requireValue(homeGoals === home);
    const table = expectedTables.get(String(f.competitionId));
    if (table) {
      const a = table.get(String(f.homeId))!,
        b = table.get(String(f.awayId))!;
      a.played++;
      b.played++;
      a.goalsFor += home;
      a.goalsAgainst += away;
      b.goalsFor += away;
      b.goalsAgainst += home;
      if (home === away) {
        a.drawn++;
        b.drawn++;
        a.points++;
        b.points++;
      } else if (home > away) {
        a.won++;
        b.lost++;
        a.points += 3;
      } else {
        b.won++;
        a.lost++;
        b.points += 3;
      }
    }
  }
  for (const [key, table] of expectedTables) {
    const entity = leagues[key] ?? phases[key]!;
    for (const row of entity.standings as Standing[])
      requireValue(
        Object.entries(table.get(row.clubId)!).every(
          ([field, v]) => row[field as keyof Standing] === v,
        ),
      );
    if (phases[key] && phases[key]!.status === 'complete')
      requireValue((entity.fixtureIds as string[]).every((f) => Object.hasOwn(results, f)));
  }
  for (const tie of Object.values(ties)) {
    const totals = [0, 0];
    for (const key of tie.fixtureIds as string[]) {
      if (!results[key]) continue;
      const r = object(results[key]),
        f = fixtures[key]!,
        score = r.score as number[];
      const index = (tie.clubIds as string[]).indexOf(String(f.homeId));
      totals[index]! += score[0]!;
      totals[1 - index]! += score[1]!;
      const lastLeg = key === (tie.fixtureIds as string[]).at(-1);
      if (r.extraTime !== undefined) {
        requireValue(
          lastLeg &&
            ['extra-time-penalties', 'higher-rank-after-extra-time'].includes(String(tie.drawRule)),
        );
        const extra = r.extraTime as number[];
        requireValue(totals[index]! - extra[0]! === totals[1 - index]! - extra[1]!);
      }
      if (r.penalties !== null)
        requireValue(
          lastLeg &&
            totals[0] === totals[1] &&
            ['penalties', 'extra-time-penalties'].includes(String(tie.drawRule)),
        );
    }
    requireValue((tie.aggregate as number[]).every((v, i) => v === totals[i]));
    const complete = (tie.fixtureIds as string[]).every((key) => Object.hasOwn(results, key));
    requireValue(
      complete
        ? tie.status === 'complete' && tie.winnerId !== null && tie.resolution !== null
        : tie.status === 'active' && tie.winnerId === null,
    );
    if (complete && totals[0] !== totals[1])
      requireValue(
        tie.winnerId === (tie.clubIds as string[])[totals[0]! > totals[1]! ? 0 : 1] &&
          tie.resolution ===
            (object(results[(tie.fixtureIds as string[]).at(-1)!]).extraTime
              ? 'extra-time'
              : 'aggregate'),
      );
    if (complete && totals[0] === totals[1]) {
      if (tie.drawRule === 'higher-rank' || tie.drawRule === 'higher-rank-after-extra-time') {
        requireValue(tie.winnerId === tie.higherRankedId && tie.resolution === 'higher-rank');
      } else {
        const finalId = (tie.fixtureIds as string[]).at(-1)!,
          result = object(results[finalId]),
          f = fixtures[finalId]!;
        const penalty = array(result.penalties, 2);
        requireValue(
          tie.resolution === 'penalties' &&
            tie.winnerId === (Number(penalty[0]) > Number(penalty[1]) ? f.homeId : f.awayId),
        );
      }
    }
  }
  for (const cup of Object.values(competitions)) {
    const stages = cup.stages as {
      groups: string[][];
      fixtureIds: string[];
      byeClubIds: string[];
    }[];
    for (let i = 1; i < stages.length; i++) {
      const previous = stages[i - 1]!,
        advancing = [
          ...previous.byeClubIds,
          ...previous.fixtureIds.map((key) => String(object(results[key]).winnerId)),
        ];
      requireValue(
        advancing.length === stages[i]!.groups[0]!.length &&
          advancing.every((key) => stages[i]!.groups[0]!.includes(key)),
      );
    }
    const last = stages.at(-1)!,
      final = last.groups[0]!.length === 2 ? results[last.fixtureIds[0]!] : undefined;
    requireValue(final ? cup.winnerId === object(final).winnerId : cup.winnerId === null);
  }
  const validateMovement = (value: unknown) => {
    const m = object(value);
    ref(m.clubId, clubs);
    id(m.fromLeagueId);
    id(m.toLeagueId);
    requireValue(m.fromLeagueId !== m.toLeagueId);
    for (const key of [m.fromLeagueId, m.toLeagueId])
      requireValue(Object.hasOwn(leagues, String(key)) || String(key).startsWith('feeder:'));
    const countryId = clubs[String(m.clubId)]!.countryId;
    for (const key of [m.fromLeagueId, m.toLeagueId]) {
      const league = leagues[String(key)];
      requireValue(
        league
          ? league.countryId === countryId
          : String(key).startsWith(`feeder:${String(countryId).split(':')[1]}:`),
      );
    }
    const from = leagues[String(m.fromLeagueId)],
      to = leagues[String(m.toLeagueId)];
    if (from && to) requireValue(Math.abs(Number(from.tier) - Number(to.tier)) <= 1);
    if (m.reason !== undefined)
      options(m.reason, ['automatic', 'playoff', 'regional-allocation', 'feeder']);
  };
  const movements = array(pyramid.movements, 2000).map(object);
  movements.forEach(validateMovement);
  requireValue(new Set(movements.map((m) => m.clubId)).size === movements.length);
  movements.forEach((m) => requireValue(clubs[String(m.clubId)]!.leagueId === m.fromLeagueId));
  // Resume markers control which engine actions are skipped. A forged marker must not
  // bypass an unfinished regular season or erase an outstanding playoff.
  for (const key of completedSteps) {
    const country = Object.values(countries).find((c) => key.startsWith(`${c.id}:`));
    requireValue(country);
    const suffix = key.slice(String(country.id).length + 1);
    const extra: Record<string, string[]> = {
      England: [],
      France: ['fourth-movement'],
      Spain: [
        'primera-fed:initial-draw',
        'primera-fed:final-draw',
        'segunda-fed:initial-draw',
        'segunda-fed:final-draw',
      ],
      Germany: ['regional-frontier', 'bavaria-no-ties'],
      Italy: [
        'serie-c-national-first:draw',
        'serie-c-national-second:draw',
        'serie-c-final-four-draw',
      ],
      Portugal: [
        'liga-3-phases',
        'campeonato-phases',
        'liga-3-movement',
        'campeonato-movement',
        'professional-movement',
      ],
    };
    requireValue(
      ['automatic', 'resolved', ...extra[String(country.counterpart)]!].includes(suffix),
    );
    const countryLeagues = (country.leagueIds as string[]).map((id) => leagues[id]!);
    const requiredLeagues =
      country.counterpart === 'Portugal' && suffix !== 'resolved'
        ? countryLeagues.filter((l) =>
            suffix.startsWith('liga-3')
              ? l.tier === 3
              : suffix.startsWith('campeonato')
                ? l.tier === 4
                : Number(l.tier) <= 2,
          )
        : country.counterpart === 'France' && suffix === 'fourth-movement'
          ? countryLeagues.filter((l) => l.tier === 4)
          : country.counterpart === 'France' && suffix === 'automatic'
            ? countryLeagues.filter((l) => Number(l.tier) <= 3)
            : countryLeagues;
    requireValue(
      requiredLeagues.every((l) =>
        (l.fixtureIds as string[]).every((id) => Object.hasOwn(results, id)),
      ),
    );
    const countryPhases = Object.values(phases).filter((p) => p.countryId === country.id);
    if (suffix === 'liga-3-phases' || suffix === 'liga-3-movement')
      requireValue(countryPhases.filter((p) => p.divisionId === 'portugal:3').length === 3);
    if (suffix === 'campeonato-phases' || suffix === 'campeonato-movement')
      requireValue(countryPhases.filter((p) => p.divisionId === 'portugal:4').length === 2);
    if (suffix === 'liga-3-movement' || suffix === 'campeonato-movement')
      requireValue(
        countryPhases
          .filter(
            (p) => p.divisionId === (suffix === 'liga-3-movement' ? 'portugal:3' : 'portugal:4'),
          )
          .every((p) => p.status === 'complete'),
      );
    if (suffix === 'resolved') {
      requireValue(Object.values(ties).some((t) => t.countryId === country.id));
      requireValue(
        Object.values(ties)
          .filter((t) => t.countryId === country.id)
          .every((t) => t.status === 'complete'),
      );
      requireValue(countryPhases.every((p) => p.status === 'complete'));
      if (country.counterpart === 'Portugal') requireValue(countryPhases.length === 5);
    }
  }
  if (pyramid.stage === 'resolved') {
    requireValue(
      Object.values(countries).every((c) => completedSteps.includes(`${c.id}:resolved`)),
    );
    const planned = new Map(movements.map((m) => [String(m.clubId), String(m.toLeagueId)]));
    for (const country of Object.values(countries)) {
      const countryLeagues = (country.leagueIds as string[]).map((id) => leagues[id]!);
      for (const tier of new Set(countryLeagues.map((l) => l.tier))) {
        const capacity = countryLeagues
          .filter((l) => l.tier === tier)
          .reduce((n, l) => n + Number(l.nextCapacity ?? l.capacity), 0);
        const count = Object.values(clubs).filter((club) => {
          const destination = leagues[planned.get(String(club.id)) ?? String(club.leagueId)];
          return destination?.countryId === country.id && destination?.tier === tier;
        }).length;
        requireValue(count === capacity);
      }
    }
  }
  const history = array(w.history, 100);
  if (w.phase === 'complete')
    requireValue(
      pyramid.stage === 'resolved' &&
        history.length > 0 &&
        object(history.at(-1)).season === current.season,
    );
  let previousYear = 0;
  for (const summaryValue of history) {
    const summary = object(summaryValue);
    number(summary.season, 1800, Number(season.year), true);
    requireValue(
      Number(summary.season) > previousYear &&
        (w.phase === 'complete' || Number(summary.season) < Number(current.season)),
    );
    previousYear = Number(summary.season);
    const tables = object(summary.tables);
    requireValue(Object.keys(tables).length === claimedLeagues.size);
    for (const [key, rowsValue] of Object.entries(tables)) {
      ref(key, leagues);
      const rows = array(rowsValue, 32);
      requireValue(rows.length >= 8);
      standings(
        rows,
        rows.map((r) => String(object(r).clubId)),
        {},
      );
      rows.forEach((r) => ref(object(r).clubId, clubs));
    }
    for (const [key, club] of Object.entries(object(summary.champions))) {
      ref(key, leagues);
      ref(club, clubs);
      requireValue((tables[key] as Standing[]).some((row) => row.clubId === club));
    }
    for (const [key, club] of Object.entries(object(summary.cupWinners))) {
      ref(key, competitions);
      ref(club, clubs);
    }
    requireValue(
      Object.keys(object(summary.champions)).length === claimedLeagues.size &&
        Object.keys(object(summary.cupWinners)).length === claimedCups.size,
    );
    array(summary.movements, 2000).forEach(validateMovement);
    const archivedPhases = map(summary.phases, 80),
      archivedTies = map(summary.ties, 1000);
    for (const phase of Object.values(archivedPhases)) {
      ref(phase.countryId, countries);
      text(phase.name);
      text(phase.divisionId);
      options(phase.kind, ['promotion', 'survival', 'championship']);
      requireValue(phase.status === 'complete');
      requireValue(String(phase.id).startsWith(`${phase.countryId}:${summary.season}:`));
      const teams = ids(phase.clubIds, 32);
      requireValue(teams.length >= 2);
      for (const key of teams) {
        ref(key, clubs);
        requireValue(clubs[key]!.countryId === phase.countryId);
      }
      ids(phase.sourceLeagueIds, 10).forEach((key) => {
        ref(key, leagues);
        requireValue(leagues[key]!.countryId === phase.countryId);
      });
      const initial = object(phase.initialPoints) as Record<string, number>;
      for (const [key, v] of Object.entries(initial)) {
        requireValue(teams.includes(key));
        number(v, 0, 10, true);
      }
      requireValue(countries[String(phase.countryId)]!.counterpart === 'Portugal');
      const sources = phase.sourceLeagueIds as string[];
      if (phase.kind === 'survival') {
        requireValue(
          sources.length === 1 && teams.length === 6 && phase.divisionId === 'portugal:3',
        );
        const original = tables[sources[0]!] as Standing[];
        requireValue(teams.every((key) => original.slice(4).some((row) => row.clubId === key)));
        for (const key of teams) {
          const rank = original.findIndex((row) => row.clubId === key) + 1;
          requireValue(initial[key] === portugueseSurvivalBonus(rank, original[rank - 1]!.points));
        }
      } else {
        requireValue(
          ['portugal:3', 'portugal:4'].includes(String(phase.divisionId)) &&
            Object.keys(initial).length === 0,
        );
        const perGroup = phase.divisionId === 'portugal:3' ? 4 : 2;
        requireValue(sources.length === 2 && teams.length === perGroup * 2);
        requireValue(
          sources
            .flatMap((key) =>
              (tables[key] as Standing[]).slice(0, perGroup).map((row) => row.clubId),
            )
            .every((key) => teams.includes(key)),
        );
      }
      const rows = standings(phase.standings, teams, initial);
      requireValue(rows.every((r) => r.played === 2 * (teams.length - 1)));
      requireValue(ids(phase.fixtureIds, 1000).length === teams.length * (teams.length - 1));
    }
    for (const tie of Object.values(archivedTies)) {
      ref(tie.countryId, countries);
      text(tie.name);
      options(tie.kind, ['promotion', 'survival', 'championship']);
      requireValue(String(tie.id).startsWith(`${tie.countryId}:${summary.season}:`));
      const teams = ids(tie.clubIds, 2);
      requireValue(teams.length === 2);
      for (const key of teams) {
        ref(key, clubs);
        requireValue(clubs[key]!.countryId === tie.countryId);
      }
      requireValue(tie.status === 'complete' && teams.includes(String(tie.winnerId)));
      number(tie.round, 1, 20, true);
      number(tie.legs, 1, 2, true);
      requireValue(ids(tie.fixtureIds, 2).length === tie.legs);
      const aggregate = array(tie.aggregate, 2);
      requireValue(aggregate.length === 2);
      aggregate.forEach((v) => number(v, 0, 30, true));
      options(tie.drawRule, [
        'extra-time-penalties',
        'penalties',
        'higher-rank',
        'higher-rank-after-extra-time',
      ]);
      options(tie.resolution, ['aggregate', 'extra-time', 'penalties', 'higher-rank']);
      if (tie.higherRankedId !== null) requireValue(teams.includes(String(tie.higherRankedId)));
      if (aggregate[0] !== aggregate[1])
        requireValue(tie.winnerId === teams[Number(aggregate[0]) > Number(aggregate[1]) ? 0 : 1]);
      if (tie.resolution === 'higher-rank')
        requireValue(aggregate[0] === aggregate[1] && tie.winnerId === tie.higherRankedId);
      ids(tie.sourceLeagueIds, 10).forEach((key) =>
        requireValue(
          leagues[key]
            ? leagues[key]!.countryId === tie.countryId
            : key.startsWith(`feeder:${String(tie.countryId).split(':')[1]}:`),
        ),
      );
    }
    if (summary.season === current.season) {
      requireValue(canonicalData(archivedPhases) === canonicalData(phases));
      requireValue(canonicalData(archivedTies) === canonicalData(ties));
      requireValue(canonicalData(summary.movements) === canonicalData(pyramid.movements));
      for (const key of Object.keys(leagues))
        requireValue(canonicalData(tables[key]) === canonicalData(leagues[key]!.standings));
    }
  }
  for (const eventValue of array(w.events, 100000)) {
    const event = object(eventValue);
    id(event.id);
    date(event.date);
    options(event.kind, [
      'transfer',
      'retirement',
      'youth-intake',
      'manager-change',
      'trophy',
      'release',
      'signing',
    ]);
    ids(event.entityIds, 10);
    const params = object(event.params);
    requireValue(Object.keys(params).length <= 20);
    for (const v of Object.values(params))
      if (typeof v === 'number') number(v, -1e12);
      else requireValue(typeof v === 'string' && v.length <= 200);
  }
  for (const trophyValue of array(w.trophies, 10000)) {
    const trophy = object(trophyValue);
    id(trophy.id);
    ref(trophy.clubId, clubs);
    number(trophy.season, 1800, Number(season.year), true);
    requireValue(
      Object.hasOwn(leagues, String(trophy.competitionId)) ||
        Object.hasOwn(competitions, String(trophy.competitionId)) ||
        Object.hasOwn(ties, String(trophy.competitionId)) ||
        Object.hasOwn(phases, String(trophy.competitionId)),
    );
    ids(trophy.playerIds, 40).forEach((key) => ref(key, object(w.players)));
  }
  for (const key of ['matches', 'agents', 'negotiations', 'nationalTeams'])
    requireValue(Object.keys(object(w[key])).length === 0);
  for (const key of [
    'scouting',
    'offers',
    'loans',
    'relationships',
    'rivalries',
    'media',
    'inbox',
    'sponsorships',
    'challenges',
    'callUps',
    'awards',
    'records',
    'legacies',
    'chronicle',
    'moments',
  ])
    requireValue(array(w[key]).length === 0);
  return value as World;
}
