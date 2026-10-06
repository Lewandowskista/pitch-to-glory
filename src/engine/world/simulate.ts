import type {
  BackgroundResult,
  Club,
  Fixture,
  Player,
  SeasonSummary,
  World,
} from '../../model/domain';
import { CONFIG } from '../config';
import { createRng, restoreRng, type Rng } from '../rng';
import { ATTRIBUTE_KEYS, KEEPER_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, clampAttribute } from './catalog';
import { generateManager } from './generate';
import { addCupRound, createLeagueFixtures, emptyStanding, sortStandings } from './schedule';
import { advanceNationalPyramid } from './pyramid';
import { getSeasonWeeks } from './calendar';
import { rankStandings } from './ranking';
import { resetNationalSeason } from './movement';
import { recordEvent as event } from './events';
import { expectedGoals, selectStartingPlayers, teamStrength } from '../strength';
import {
  archiveAndPrune,
  fillSquads,
  isActiveClub,
  refreshDressingRoom,
  refreshReturningClub,
  seasonalSquadReview,
} from './lifecycle';

const copyWorld = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const BACKGROUND = CONFIG.world.background;
const DEVELOPMENT = CONFIG.world.development;
const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
const money = (value: number): number => Math.max(0, Math.round(value));

function poisson(rng: Rng, mean: number): number {
  const stop = Math.exp(-mean);
  let product = 1;
  let count = 0;
  do {
    product *= rng.next();
    count++;
  } while (product > stop && count <= CONFIG.world.maxGoals);
  return Math.min(CONFIG.world.maxGoals, count - 1);
}
/** The background XI: available squad members, best by ability within each line. */
function startingPlayers(world: World, club: Club): Player[] {
  return selectStartingPlayers(club.playerIds.map((id) => world.players[id]!));
}
function scoreGoals(
  players: Player[],
  teamId: string,
  count: number,
  rng: Rng,
): BackgroundResult['goals'] {
  const weights = players.map((player) =>
    player.primaryPosition === 'GK'
      ? BACKGROUND.scorerWeights.GK
      : player.primaryPosition === 'ST'
        ? BACKGROUND.scorerWeights.ST
        : ['LW', 'RW', 'AM'].includes(player.primaryPosition)
          ? BACKGROUND.scorerWeights.winger
          : ['CM', 'DM'].includes(player.primaryPosition)
            ? BACKGROUND.scorerWeights.midfield
            : BACKGROUND.scorerWeights.defender,
  );
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return Array.from({ length: count }, () => {
    let target = rng.next() * sum;
    let scorer = players[players.length - 1]!;
    for (let index = 0; index < players.length; index++) {
      target -= weights[index]!;
      if (target < 0) {
        scorer = players[index]!;
        break;
      }
    }
    scorer.stats.goals++;
    if (rng.next() < BACKGROUND.assistedGoalChance)
      rng.pick(
        players.filter((player) => player.id !== scorer.id && player.primaryPosition !== 'GK'),
      ).stats.assists++;
    return { playerId: scorer.id, teamId, minute: rng.int(1, 90) };
  });
}
/** Background resolver only; interactive decisions, highlights and match reports arrive in milestone 3. */
function resolveFixture(world: World, fixture: Fixture): void {
  const rng = createRng(`${world.seed}:result:${fixture.id}`);
  const home = world.clubs[fixture.homeId]!;
  const away = world.clubs[fixture.awayId]!;
  const homePlayers = startingPlayers(world, home);
  const awayPlayers = startingPlayers(world, away);
  // Shared with the interactive match engine so played and simulated fixtures agree.
  const homeStrength = teamStrength(home.reputation, homePlayers);
  const awayStrength = teamStrength(away.reputation, awayPlayers);
  const difference = (homeStrength - awayStrength) * CONFIG.world.strengthScale;
  const [homeGoals, awayGoals] = expectedGoals(
    homeStrength,
    awayStrength,
    Boolean(fixture.neutral),
  );
  const score: [number, number] = [poisson(rng, homeGoals), poisson(rng, awayGoals)];
  let winnerId = score[0] === score[1] ? null : score[0] > score[1] ? home.id : away.id;
  let penalties: [number, number] | null = null;
  let extraTime: [number, number] | undefined;
  const tie = fixture.tieId ? world.pyramid!.ties[fixture.tieId] : undefined;
  if (tie && fixture.id === tie.fixtureIds.at(-1)) {
    const aggregate: [number, number] = [0, 0];
    for (const id of tie.fixtureIds) {
      const previousFixture = world.fixtures[id]!;
      const resultScore = id === fixture.id ? score : world.results[id]?.score;
      if (!resultScore) throw new Error('A tie cannot resolve before its first leg');
      const homeIndex = tie.clubIds.indexOf(previousFixture.homeId) as 0 | 1;
      aggregate[homeIndex] += resultScore[0];
      aggregate[(1 - homeIndex) as 0 | 1] += resultScore[1];
    }
    if (aggregate[0] === aggregate[1] && tie.drawRule !== 'higher-rank') {
      if (tie.drawRule !== 'penalties') {
        extraTime = [
          poisson(
            rng,
            Math.max(BACKGROUND.minimumGoals, CONFIG.world.baseGoals / 3 + difference / 3),
          ),
          poisson(
            rng,
            Math.max(BACKGROUND.minimumGoals, CONFIG.world.baseGoals / 3 - difference / 3),
          ),
        ];
        score[0] += extraTime[0];
        score[1] += extraTime[1];
        const homeIndex = tie.clubIds.indexOf(home.id) as 0 | 1;
        aggregate[homeIndex] += extraTime[0];
        aggregate[(1 - homeIndex) as 0 | 1] += extraTime[1];
      }
      if (aggregate[0] === aggregate[1] && tie.drawRule !== 'higher-rank-after-extra-time') {
        const homeWins = rng.next() < BACKGROUND.penaltyWinnerChance;
        const loserScore = rng.int(...BACKGROUND.penaltyLoserGoals);
        penalties = homeWins ? [loserScore + 1, loserScore] : [loserScore, loserScore + 1];
        winnerId = homeWins ? home.id : away.id;
      } else winnerId = score[0] === score[1] ? null : score[0] > score[1] ? home.id : away.id;
    }
  }
  if (!winnerId && world.competitions[fixture.competitionId]?.format === 'knockout') {
    const homeWins = rng.next() < BACKGROUND.penaltyWinnerChance;
    const loserScore = rng.int(...BACKGROUND.penaltyLoserGoals);
    penalties = homeWins ? [loserScore + 1, loserScore] : [loserScore, loserScore + 1];
    winnerId = homeWins ? home.id : away.id;
  }
  const goals = [
    ...scoreGoals(homePlayers, home.id, score[0], rng),
    ...scoreGoals(awayPlayers, away.id, score[1], rng),
  ].sort((a, b) => a.minute - b.minute);
  world.results[fixture.id] = {
    fixtureId: fixture.id,
    score,
    winnerId,
    penalties,
    goals,
    ...(extraTime ? { extraTime } : {}),
  };
  for (const [players, ownGoals, oppositionGoals] of [
    [homePlayers, score[0], score[1]],
    [awayPlayers, score[1], score[0]],
  ] as const) {
    for (const player of players) {
      player.stats.appearances++;
      player.stats.minutes += extraTime ? 120 : 90;
      if (oppositionGoals === 0) player.stats.cleanSheets++;
      const scored = goals.filter((goal) => goal.playerId === player.id).length;
      const rating = Math.max(
        BACKGROUND.minimumRating,
        Math.min(
          BACKGROUND.maximumRating,
          BACKGROUND.ratingBase +
            (ownGoals > oppositionGoals
              ? BACKGROUND.ratingWin
              : ownGoals < oppositionGoals
                ? BACKGROUND.ratingLoss
                : 0) +
            scored * BACKGROUND.ratingGoal +
            rng.next() * BACKGROUND.ratingVariation,
        ),
      );
      player.stats.ratingTotal = Math.round((player.stats.ratingTotal + rating) * 100) / 100;
      player.form = clampPercent(
        player.form * BACKGROUND.formRetention + rating * 10 * BACKGROUND.formRatingWeight,
      );
      player.morale = clampPercent(
        player.morale +
          (ownGoals > oppositionGoals
            ? BACKGROUND.moraleResultDelta
            : ownGoals < oppositionGoals
              ? -BACKGROUND.moraleResultDelta
              : 0),
      );
      player.fatigue = clampPercent(player.fatigue + BACKGROUND.matchFatigue);
    }
  }
  const league = fixture.phaseId
    ? world.pyramid!.phases[fixture.phaseId]
    : world.leagues[fixture.competitionId];
  if (league) {
    const homeRow = league.standings.find((row) => row.clubId === home.id)!;
    const awayRow = league.standings.find((row) => row.clubId === away.id)!;
    for (const [row, goalsFor, goalsAgainst] of [
      [homeRow, score[0], score[1]],
      [awayRow, score[1], score[0]],
    ] as const) {
      row.played++;
      row.goalsFor += goalsFor;
      row.goalsAgainst += goalsAgainst;
      if (goalsFor > goalsAgainst) {
        row.won++;
        row.points += 3;
      } else if (goalsFor < goalsAgainst) row.lost++;
      else {
        row.drawn++;
        row.points++;
      }
    }
  }
}

function developPlayers(world: World, rng: Rng): void {
  for (const player of Object.values(world.players)) {
    if (player.retired) continue;
    // Squads of clubs below the simulated frontier are dormant until readmitted.
    if (player.clubId && !isActiveClub(world, world.clubs[player.clubId]!)) continue;
    const age = world.date.season - player.birthSeason;
    const youthFactor =
      age < DEVELOPMENT.youthAge
        ? DEVELOPMENT.youthFactor
        : age < DEVELOPMENT.growthEndAge
          ? DEVELOPMENT.adultFactor
          : 0;
    const professionalism = DEVELOPMENT.professionalismBase + player.hidden.professionalism / 100;
    for (const key of ATTRIBUTE_KEYS) {
      const mentalGrowth =
        MENTAL_KEYS.includes(key) && age < DEVELOPMENT.mentalEndAge ? DEVELOPMENT.mentalFactor : 0;
      if (
        player.attributes[key] < player.potential &&
        rng.next() < CONFIG.world.developmentChance * (youthFactor + mentalGrowth) * professionalism
      )
        player.attributes[key]++;
      if (
        age >= DEVELOPMENT.declineStartAge &&
        rng.next() <
          CONFIG.world.declineChance *
            ((age - DEVELOPMENT.declineStartAge + 1) / DEVELOPMENT.declineAgeDivisor) *
            (PHYSICAL_KEYS.includes(key)
              ? DEVELOPMENT.physicalDeclineFactor
              : MENTAL_KEYS.includes(key)
                ? DEVELOPMENT.mentalDeclineFactor
                : DEVELOPMENT.technicalDeclineFactor)
      )
        player.attributes[key] = clampAttribute(player.attributes[key] - 1);
    }
    if (player.primaryPosition === 'GK')
      for (const key of KEEPER_KEYS) {
        if (
          age < DEVELOPMENT.keeperGrowthEndAge &&
          player.keeperAttributes[key] < player.potential &&
          rng.next() < CONFIG.world.developmentChance * professionalism
        )
          player.keeperAttributes[key]++;
        if (
          age >= DEVELOPMENT.keeperDeclineAge &&
          rng.next() <
            (CONFIG.world.declineChance * (age - DEVELOPMENT.keeperDeclineAge + 1)) /
              DEVELOPMENT.keeperDeclineDivisor
        )
          player.keeperAttributes[key] = clampAttribute(player.keeperAttributes[key] - 1);
      }
    player.fatigue = clampPercent(player.fatigue - BACKGROUND.weeklyRecovery);
    player.fitness = clampPercent(100 - player.fatigue * BACKGROUND.fitnessFatigueWeight);
  }
}
function updateFinances(world: World): void {
  for (const club of Object.values(world.clubs)) {
    if (!isActiveClub(world, club)) continue;
    const wages = club.playerIds.reduce(
      (sum, id) => sum + world.contracts[world.players[id]!.contractId!]!.weeklyWage,
      0,
    );
    club.finances.balance = money(
      club.finances.balance + club.finances.weeklyIncome - club.finances.weeklyCosts - wages,
    );
    club.finances.wageBudget = money(Math.max(club.finances.wageBudget, wages));
    club.finances.transferBudget = money(
      Math.min(
        club.finances.transferBudget,
        club.finances.balance * BACKGROUND.transferBudgetBalanceShare,
      ),
    );
  }
}
function exchangeTransfers(world: World, rng: Rng): void {
  for (const country of Object.values(world.countries)) {
    const clubs = country.leagueIds
      .flatMap((id) => world.leagues[id]!.clubIds)
      .map((id) => world.clubs[id]!);
    const a = rng.pick(clubs);
    // Exchanges happen between clubs of a similar level, never top flight and sixth tier.
    const tier = world.leagues[a.leagueId]!.tier;
    const b = rng.pick(
      clubs.filter(
        (club) => club.id !== a.id && Math.abs(world.leagues[club.leagueId]!.tier - tier) <= 1,
      ),
    );
    const positionsOf = (club: Club) =>
      new Set(club.playerIds.map((id) => world.players[id]!.primaryPosition));
    const shared = [...positionsOf(a)].filter(
      (position) => position !== 'GK' && positionsOf(b).has(position),
    );
    if (!shared.length) continue;
    const position = rng.pick(
      (['CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'] as const).filter((p) =>
        shared.includes(p),
      ),
    );
    const playerA = rng.pick(
      a.playerIds
        .map((id) => world.players[id]!)
        .filter((player) => player.primaryPosition === position),
    );
    const playerB = rng.pick(
      b.playerIds
        .map((id) => world.players[id]!)
        .filter((player) => player.primaryPosition === position),
    );
    const move = (player: Player, old: Club, destination: Club) => {
      player.clubId = destination.id;
      const contract = world.contracts[player.contractId!]!;
      contract.clubId = destination.id;
      contract.start = { ...world.date };
      contract.end = {
        season: world.date.season + BACKGROUND.transferContractYears,
        week: getSeasonWeeks(world),
        day: 7,
      };
      old.playerIds = old.playerIds.filter((id) => id !== player.id);
      destination.playerIds.push(player.id);
      event(world, 'transfer', [player.id, old.id, destination.id], {
        name: player.name,
        old: old.name,
        new: destination.name,
        fee: 0,
      });
    };
    move(playerA, a, b);
    move(playerB, b, a);
    refreshDressingRoom(world, a);
    refreshDressingRoom(world, b);
  }
}
function managerChanges(world: World, rng: Rng): void {
  for (const league of Object.values(world.leagues)) {
    const table =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings, league.fixtureIds)
        : sortStandings(league.standings);
    const bottom = table.at(-1)!;
    if (
      bottom.played === 0 ||
      bottom.points / bottom.played > BACKGROUND.managerPointsThreshold ||
      rng.next() > BACKGROUND.managerDismissalChance
    )
      continue;
    const club = world.clubs[bottom.clubId]!;
    const old = world.managers[club.managerId]!;
    const id = `manager:${club.id}:${world.date.season}:${world.date.week}`;
    const manager = generateManager(
      id,
      rng,
      world.format === 'national-v1' ? Number(club.countryId.split(':')[1]) : undefined,
    );
    world.managers[id] = manager;
    club.managerId = id;
    event(world, 'manager-change', [club.id, old.id, id], {
      name: club.name,
      old: old.name,
      new: manager.name,
    });
  }
}
function advanceCups(world: World): void {
  for (const cup of Object.values(world.competitions)) {
    if (cup.winnerId) continue;
    const stage = cup.stages.at(-1)!;
    if (!stage.fixtureIds.every((id) => world.results[id])) continue;
    const winners = [
      ...(stage.byeClubIds ?? []),
      ...stage.fixtureIds.map((id) => world.results[id]!.winnerId!),
    ];
    if (winners.length === 1) {
      cup.winnerId = winners[0]!;
      event(world, 'trophy', [cup.winnerId, cup.id], {
        name: world.clubs[cup.winnerId]!.name,
        competition: cup.name,
      });
    } else addCupRound(world, cup, winners);
  }
}
function archiveSeason(world: World): void {
  if (
    world.format === 'national-v1' &&
    (world.pyramid!.stage !== 'resolved' ||
      Object.values(world.competitions).some((competition) => !competition.winnerId))
  )
    throw new Error('A national season cannot finish before all competitions and movement resolve');
  const summary: SeasonSummary = {
    season: world.date.season,
    tables: {},
    champions: {},
    cupWinners: {},
    movements: [],
  };
  for (const league of Object.values(world.leagues)) {
    const table =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings)
        : sortStandings(league.standings);
    summary.tables[league.id] = table.map((row) => ({ ...row }));
    summary.champions[league.id] = table[0]!.clubId;
    event(world, 'trophy', [table[0]!.clubId, league.id], {
      name: world.clubs[table[0]!.clubId]!.name,
      competition: league.name,
    });
    const country = world.countries[league.countryId]!;
    if (world.format !== 'national-v1' && league.promotionPlaces)
      for (const row of table.slice(0, league.promotionPlaces))
        summary.movements.push({
          clubId: row.clubId,
          fromLeagueId: league.id,
          toLeagueId: country.leagueIds[league.tier - 2]!,
        });
    if (world.format !== 'national-v1' && league.relegationPlaces)
      for (const row of table.slice(-league.relegationPlaces))
        summary.movements.push({
          clubId: row.clubId,
          fromLeagueId: league.id,
          toLeagueId: country.leagueIds[league.tier]!,
        });
  }
  if (world.format === 'national-v1') {
    summary.movements = world.pyramid!.movements.map((movement) => ({ ...movement }));
    summary.phases = JSON.parse(JSON.stringify(world.pyramid!.phases)) as typeof summary.phases;
    summary.ties = JSON.parse(JSON.stringify(world.pyramid!.ties)) as typeof summary.ties;
  }
  for (const cup of Object.values(world.competitions))
    if (cup.winnerId) summary.cupWinners[cup.id] = cup.winnerId;
  world.history.push(summary);
  world.phase = 'complete';
}

export interface SimulationOptions {
  /**
   * Mutate the given world instead of copying it. Only for callers that own the object
   * and have finished serializing any earlier checkpoint of it, such as the world worker;
   * the deep copy was two thirds of each simulated week's cost.
   */
  inPlace?: boolean;
}
export function simulateWeek(input: World, options: SimulationOptions = {}): World {
  if (input.phase === 'complete') return input;
  const world = options.inPlace ? input : copyWorld(input);
  const rng = restoreRng(world.rng);
  const fixtures = Object.values(world.fixtures)
    .filter(
      (fixture) =>
        fixture.date.season === world.date.season &&
        fixture.date.week === world.date.week &&
        !world.results[fixture.id],
    )
    .sort((a, b) => a.date.day - b.date.day || (a.id < b.id ? -1 : 1));
  for (const fixture of fixtures) resolveFixture(world, fixture);
  for (const league of Object.values(world.leagues))
    league.standings =
      world.format === 'national-v1'
        ? rankStandings(world, league.standings, league.fixtureIds)
        : sortStandings(league.standings);
  advanceCups(world);
  if (world.format === 'national-v1') advanceNationalPyramid(world);
  developPlayers(world, rng);
  if ((CONFIG.world.transferWeeks as readonly number[]).includes(world.date.week)) {
    exchangeTransfers(world, rng);
    fillSquads(world, rng);
  }
  if ((CONFIG.world.managerWeeks as readonly number[]).includes(world.date.week))
    managerChanges(world, rng);
  if (world.date.week === CONFIG.world.intakeWeek) seasonalSquadReview(world, rng);
  updateFinances(world);
  if (world.date.week === getSeasonWeeks(world)) archiveSeason(world);
  world.date.week++;
  world.rng = rng.snapshot();
  return world;
}
export function startNextSeason(input: World, options: SimulationOptions = {}): World {
  if (input.phase !== 'complete')
    throw new Error('The current season must finish before starting another');
  const world = options.inPlace ? input : copyWorld(input);
  const summary = world.history.at(-1)!;
  archiveAndPrune(world, world.date.season);
  for (const movement of summary.movements)
    world.clubs[movement.clubId]!.leagueId = movement.toLeagueId;
  world.date = { season: world.date.season + 1, week: 1, day: 1 };
  for (const movement of summary.movements)
    if (movement.fromLeagueId.startsWith('feeder:') && world.leagues[movement.toLeagueId])
      refreshReturningClub(world, world.clubs[movement.clubId]!);
  world.phase = 'active';
  world.fixtures = {};
  world.results = {};
  world.matches = {};
  world.season = {
    year: world.date.season,
    start: { ...world.date },
    end: { season: world.date.season, week: getSeasonWeeks(world), day: 7 },
    competitionIds: [...Object.keys(world.leagues), ...Object.keys(world.competitions)],
    awardIds: [],
  };
  for (const league of Object.values(world.leagues)) {
    league.clubIds = Object.values(world.clubs)
      .filter((club) => club.leagueId === league.id)
      .map((club) => club.id)
      .sort();
    league.standings = league.clubIds.map(emptyStanding);
    const fixtures = createLeagueFixtures(
      league.clubIds,
      league.id,
      world.date.season,
      world.format === 'national-v1' ? { cycles: 2 } : undefined,
    );
    league.fixtureIds = fixtures.map((fixture) => fixture.id);
    for (const fixture of fixtures) world.fixtures[fixture.id] = fixture;
  }
  for (const cup of Object.values(world.competitions)) {
    cup.season = world.date.season;
    cup.stages = [];
    cup.winnerId = null;
    const country = cup.countryId
      ? world.countries[cup.countryId]!
      : Object.values(world.countries).find((country) => country.domesticCupId === cup.id)!;
    addCupRound(
      world,
      cup,
      country.leagueIds
        .filter((id) => !cup.divisionId || world.leagues[id]!.divisionId === cup.divisionId)
        .flatMap((id) => world.leagues[id]!.clubIds),
    );
  }
  if (world.format === 'national-v1') resetNationalSeason(world);
  return world;
}
