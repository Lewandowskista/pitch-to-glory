import type { World, Standing } from '../model/domain';
import { CONFIG } from '../engine/config';
import {
  requireValue,
  object,
  number,
  text,
  id,
  array,
  ids,
  date,
  options,
  map,
  ref,
  standings,
  validateEntities,
} from './worldValidation';
import { validateNationalWorld } from './nationalWorldSchema';

// This module validates imported data; it never imports the heavy generation/simulation code.
export function validateWorld(value: unknown): World {
  const candidate = object(value);
  if (candidate.format === 'national-v1') return validateNationalWorld(value);
  requireValue(candidate.format === undefined || candidate.format === 'legacy');
  const w = object(value);
  id(w.id);
  text(w.seed);
  date(w.date);
  options(w.phase, ['active', 'complete']);
  const rng = object(w.rng);
  requireValue(rng.algorithm === 'mulberry32');
  text(rng.seed, 512);
  number(rng.state, 0, 0xffffffff, true);
  number(rng.draws, 0, Number.MAX_SAFE_INTEGER, true);
  const currentDate = object(w.date);
  requireValue(w.phase === 'complete' ? currentDate.week === 35 : Number(currentDate.week) <= 34);
  const season = object(w.season);
  number(season.year, 1800, 9999, true);
  date(season.start);
  date(season.end);
  requireValue(season.year === currentDate.season);
  ids(season.awardIds);
  ids(season.competitionIds, 30);
  const countries = map(w.countries, 6),
    leagues = map(w.leagues, 24),
    clubs = map(w.clubs, 192);
  const players = map(w.players, 30000);
  map(w.contracts, 30000);
  map(w.managers, 10000);
  const competitions = map(w.competitions, 6),
    fixtures = map(w.fixtures, 4000);
  map(w.dressingRooms, 192);
  requireValue(
    Object.keys(countries).length === 6 &&
      Object.keys(leagues).length === 24 &&
      Object.keys(clubs).length === 192,
  );
  const scheduledIds = new Set<string>();
  const cupCountries = new Map<string, string>();
  for (const country of Object.values(countries)) {
    text(country.name);
    const leagueIds = ids(country.leagueIds, 4);
    requireValue(leagueIds.length === 4);
    requireValue(new Set(leagueIds.map((key) => leagues[key]?.tier)).size === 4);
    for (const [index, key] of leagueIds.entries()) {
      ref(key, leagues);
      requireValue(leagues[key]!.countryId === country.id && leagues[key]!.tier === index + 1);
    }
    ref(country.domesticCupId, competitions);
    requireValue(!cupCountries.has(String(country.domesticCupId)));
    cupCountries.set(String(country.domesticCupId), String(country.id));
    requireValue(array(country.nationalTeamIds).length === 0);
  }
  const membership = new Set<string>();
  for (const league of Object.values(leagues)) {
    text(league.name);
    ref(league.countryId, countries);
    number(league.tier, 1, 4, true);
    const clubIds = ids(league.clubIds, 8);
    requireValue(clubIds.length === 8);
    for (const key of clubIds) {
      ref(key, clubs);
      requireValue(
        !membership.has(key) &&
          clubs[key]!.leagueId === league.id &&
          clubs[key]!.countryId === league.countryId,
      );
      membership.add(key);
    }
    number(league.promotionPlaces, 0, 2, true);
    number(league.relegationPlaces, 0, 2, true);
    standings(league.standings, clubIds);
    const fixtureIds = ids(league.fixtureIds, 112);
    requireValue(fixtureIds.length === 112);
    for (const key of fixtureIds) {
      ref(key, fixtures);
      requireValue(fixtures[key]!.competitionId === league.id);
      requireValue(!scheduledIds.has(key));
      scheduledIds.add(key);
    }
    const pairs = new Map<string, number>();
    const rounds = new Map<number, Set<string>>();
    for (const key of fixtureIds) {
      const fixture = fixtures[key]!;
      const week = Number(object(fixture.date).week);
      number(week, 1, CONFIG.world.leagueRounds, true);
      const participants = rounds.get(week) ?? new Set<string>();
      requireValue(
        !participants.has(String(fixture.homeId)) && !participants.has(String(fixture.awayId)),
      );
      participants.add(String(fixture.homeId));
      participants.add(String(fixture.awayId));
      rounds.set(week, participants);
      const pair = `${fixture.homeId}|${fixture.awayId}`;
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    }
    requireValue(
      rounds.size === CONFIG.world.leagueRounds &&
        [...rounds.values()].every((round) => round.size === 8),
    );
    for (const home of clubIds)
      for (const away of clubIds)
        if (home !== away) requireValue(pairs.get(`${home}|${away}`) === 2);
  }
  validateEntities(w);
  for (const cup of Object.values(competitions)) {
    text(cup.name);
    requireValue(
      cup.kind === 'domestic' && cup.format === 'knockout' && cup.season === season.year,
    );
    if (cup.winnerId !== null) ref(cup.winnerId, clubs);
    const stages = array(cup.stages, 5);
    requireValue(stages.length > 0);
    for (const [index, value] of stages.entries()) {
      const stage = object(value);
      id(stage.id);
      text(stage.name);
      const groups = array(stage.groups, 1);
      requireValue(groups.length === 1);
      const participants = ids(groups[0], 32);
      requireValue(participants.length === 32 / 2 ** index);
      for (const key of participants) {
        ref(key, clubs);
        requireValue(clubs[key]!.countryId === cupCountries.get(String(cup.id)));
      }
      const roundIds = ids(stage.fixtureIds, 16);
      requireValue(roundIds.length === participants.length / 2);
      const paired = new Set<string>();
      for (const key of roundIds) {
        ref(key, fixtures);
        requireValue(fixtures[key]!.competitionId === cup.id);
        requireValue(!scheduledIds.has(key));
        scheduledIds.add(key);
        const fixture = fixtures[key]!;
        requireValue(object(fixture.date).week === CONFIG.world.cupWeeks[index]);
        for (const team of [fixture.homeId, fixture.awayId]) {
          requireValue(participants.includes(String(team)) && !paired.has(String(team)));
          paired.add(String(team));
        }
      }
    }
  }
  requireValue(scheduledIds.size === Object.keys(fixtures).length);
  const expectedTables = new Map<string, Map<string, Standing>>();
  for (const [key, league] of Object.entries(leagues))
    expectedTables.set(
      key,
      new Map(
        (league.clubIds as string[]).map((clubId) => [
          clubId,
          { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
        ]),
      ),
    );
  const results = object(w.results);
  requireValue(Object.keys(results).length <= 4000);
  for (const fixture of Object.values(fixtures)) {
    date(fixture.date);
    requireValue(object(fixture.date).season === season.year);
    ref(fixture.homeId, clubs);
    ref(fixture.awayId, clubs);
    requireValue(fixture.homeId !== fixture.awayId);
    requireValue(
      Object.hasOwn(leagues, String(fixture.competitionId)) ||
        Object.hasOwn(competitions, String(fixture.competitionId)),
    );
    requireValue(fixture.matchId === null);
    requireValue(
      Number(object(fixture.date).week) < Number(currentDate.week)
        ? Object.hasOwn(results, String(fixture.id))
        : !Object.hasOwn(results, String(fixture.id)),
    );
    const league = leagues[String(fixture.competitionId)];
    if (league)
      requireValue(
        (league.clubIds as string[]).includes(String(fixture.homeId)) &&
          (league.clubIds as string[]).includes(String(fixture.awayId)),
      );
  }
  for (const cup of Object.values(competitions)) {
    const stages = cup.stages as { groups: string[][]; fixtureIds: string[] }[];
    for (let index = 1; index < stages.length; index++) {
      const previous = stages[index - 1]!.fixtureIds.map((key) => object(results[key]).winnerId);
      requireValue(previous.every((winner) => stages[index]!.groups[0]!.includes(String(winner))));
    }
    const finalId = stages.length === 5 ? stages[4]!.fixtureIds[0]! : null;
    const final = finalId && results[finalId] ? object(results[finalId]) : null;
    requireValue(final ? cup.winnerId === final.winnerId : cup.winnerId === null);
  }
  for (const [key, value] of Object.entries(results)) {
    ref(key, fixtures);
    const result = object(value);
    requireValue(result.fixtureId === key);
    const fixture = fixtures[key]!;
    const score = array(result.score, 2);
    requireValue(score.length === 2);
    score.forEach((goal) => number(goal, 0, CONFIG.world.maxGoals, true));
    requireValue(Number(object(fixture.date).week) < Number(currentDate.week));
    const home = score[0] as number,
      away = score[1] as number;
    let winner = home > away ? fixture.homeId : away > home ? fixture.awayId : null;
    if (result.penalties !== null) {
      const penalty = array(result.penalties, 2);
      requireValue(
        penalty.length === 2 &&
          home === away &&
          !Object.hasOwn(leagues, String(fixture.competitionId)),
      );
      penalty.forEach((goal) => number(goal, 0, 30, true));
      requireValue(penalty[0] !== penalty[1]);
      winner = Number(penalty[0]) > Number(penalty[1]) ? fixture.homeId : fixture.awayId;
    }
    requireValue(result.winnerId === winner);
    const goals = array(result.goals, 20);
    requireValue(goals.length === home + away);
    let homeGoals = 0;
    for (const value of goals) {
      const goal = object(value);
      ref(goal.playerId, players);
      requireValue(goal.teamId === fixture.homeId || goal.teamId === fixture.awayId);
      number(goal.minute, 1, 120, true);
      if (goal.teamId === fixture.homeId) homeGoals++;
    }
    requireValue(homeGoals === home);
    const table = expectedTables.get(String(fixture.competitionId));
    if (table) {
      const a = table.get(String(fixture.homeId))!,
        b = table.get(String(fixture.awayId))!;
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
  for (const [key, table] of expectedTables)
    for (const row of leagues[key]!.standings as Standing[])
      requireValue(
        Object.entries(table.get(row.clubId)!).every(
          ([field, value]) => row[field as keyof Standing] === value,
        ),
      );
  const history = array(w.history, 100);
  if (w.phase === 'complete')
    requireValue(history.length > 0 && object(history.at(-1)).season === currentDate.season);
  let previousSeason = 0;
  for (const value of history) {
    const summary = object(value);
    number(summary.season, 1800, Number(season.year), true);
    requireValue(
      Number(summary.season) > previousSeason &&
        (w.phase === 'complete' || Number(summary.season) < Number(currentDate.season)),
    );
    previousSeason = Number(summary.season);
    const tables = object(summary.tables);
    requireValue(Object.keys(tables).length === 24);
    for (const [key, value] of Object.entries(tables)) {
      ref(key, leagues);
      const rows = array(value, 8);
      requireValue(rows.length === 8);
      standings(
        rows,
        rows.map((row) => String(object(row).clubId)),
      );
      rows.forEach((row) => ref(object(row).clubId, clubs));
    }
    for (const [key, clubId] of Object.entries(object(summary.champions))) {
      ref(key, leagues);
      ref(clubId, clubs);
    }
    requireValue(
      Object.keys(object(summary.champions)).length === 24 &&
        Object.keys(object(summary.cupWinners)).length === 6,
    );
    for (const [key, clubId] of Object.entries(object(summary.cupWinners))) {
      ref(key, competitions);
      ref(clubId, clubs);
    }
    for (const value of array(summary.movements, 72)) {
      const move = object(value);
      ref(move.clubId, clubs);
      ref(move.fromLeagueId, leagues);
      ref(move.toLeagueId, leagues);
      requireValue(
        leagues[String(move.fromLeagueId)]!.countryId ===
          leagues[String(move.toLeagueId)]!.countryId &&
          Math.abs(
            Number(leagues[String(move.fromLeagueId)]!.tier) -
              Number(leagues[String(move.toLeagueId)]!.tier),
          ) === 1,
      );
    }
  }
  for (const value of array(w.events, 20000)) {
    const event = object(value);
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
    for (const value of Object.values(params))
      if (typeof value === 'number') number(value, -1e12);
      else requireValue(typeof value === 'string' && value.length <= 200);
  }
  for (const value of array(w.trophies, 3000)) {
    const trophy = object(value);
    id(trophy.id);
    ref(trophy.clubId, clubs);
    number(trophy.season, 1800, Number(season.year), true);
    requireValue(
      Object.hasOwn(leagues, String(trophy.competitionId)) ||
        Object.hasOwn(competitions, String(trophy.competitionId)),
    );
    ids(trophy.playerIds, 40).forEach((key) => ref(key, players));
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
