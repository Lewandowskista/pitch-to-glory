import type { League, Standing, Tier, World } from '../../model/domain';
import {
  eligibleTable,
  leaguesAt,
  makeTie,
  once,
  recordMovement,
  regularComplete,
  seededShuffle,
  winner,
} from './postseason';
import { rankStandings } from './ranking';

function survivalPair(
  world: World,
  countryId: string,
  key: string,
  high: Standing,
  low: Standing,
  targetTier: Tier | null,
  gap: number,
  inclusive: boolean,
  legs: 1 | 2,
): boolean {
  if (inclusive ? high.points - low.points >= gap : high.points - low.points > gap) {
    recordMovement(world, low.clubId, targetTier);
    return true;
  }
  const equalSerieB = key === 'serie-b-survival' && high.points === low.points;
  const tie = makeTie(world, key, countryId, [high.clubId, low.clubId], {
    legs,
    firstHome: legs === 2 ? low.clubId : high.clubId,
    higher: equalSerieB ? null : high.clubId,
    drawRule:
      legs === 1
        ? 'higher-rank-after-extra-time'
        : equalSerieB
          ? 'extra-time-penalties'
          : 'higher-rank',
    kind: 'survival',
  });
  if (!tie.winnerId) return false;
  recordMovement(
    world,
    tie.clubIds.find((id) => id !== tie.winnerId)!,
    targetTier,
    'playoff',
  );
  return true;
}
function serieBPlayoff(world: World, countryId: string, table: Standing[]): string | null {
  if (table[2]!.points - table[3]!.points > 14) return table[2]!.clubId;
  const field = table.slice(2, 8).map((row) => row.clubId);
  for (const [index, pair] of [
    [field[2]!, field[5]!],
    [field[3]!, field[4]!],
  ].entries())
    makeTie(world, `serie-b-preliminary-${index}`, countryId, pair as [string, string], {
      legs: 1,
      higher: pair[0]!,
      drawRule: 'higher-rank-after-extra-time',
    });
  const first = winner(world, countryId, 'serie-b-preliminary-0');
  const second = winner(world, countryId, 'serie-b-preliminary-1');
  if (first && second) {
    makeTie(world, 'serie-b-semi-0', countryId, [field[0]!, second], {
      higher: field[0]!,
      drawRule: 'higher-rank',
      firstHome: second,
      round: 2,
    });
    makeTie(world, 'serie-b-semi-1', countryId, [field[1]!, first], {
      higher: field[1]!,
      drawRule: 'higher-rank',
      firstHome: first,
      round: 2,
    });
  }
  const finalists = [
    winner(world, countryId, 'serie-b-semi-0'),
    winner(world, countryId, 'serie-b-semi-1'),
  ];
  if (finalists.every(Boolean)) {
    const final = (finalists as string[]).sort((a, b) => field.indexOf(a) - field.indexOf(b));
    const equalPoints =
      table.find((row) => row.clubId === final[0])!.points ===
      table.find((row) => row.clubId === final[1])!.points;
    makeTie(world, 'serie-b-final', countryId, final as [string, string], {
      firstHome: final[1]!,
      higher: equalPoints ? null : final[0]!,
      drawRule: equalPoints ? 'extra-time-penalties' : 'higher-rank',
      round: 3,
    });
  }
  return winner(world, countryId, 'serie-b-final');
}
function rankAcrossGroups(world: World, leagues: League[], ids: string[]): string[] {
  const locate = (id: string) => {
    const league = leagues.find((item) => item.clubIds.includes(id))!;
    const table = rankStandings(world, league.standings);
    return {
      rank: table.findIndex((row) => row.clubId === id),
      row: table.find((row) => row.clubId === id)!,
    };
  };
  return [...ids].sort((a, b) => {
    const x = locate(a);
    const y = locate(b);
    return (
      x.rank - y.rank ||
      y.row.points - x.row.points ||
      y.row.won - x.row.won ||
      y.row.goalsFor - x.row.goalsFor ||
      a.localeCompare(b)
    );
  });
}
function nationalRound(
  world: World,
  countryId: string,
  key: string,
  seeds: string[],
  others: string[],
  round: number,
): string[] | null {
  once(world, `${countryId}:${key}:draw`, true, () => {
    const drawn = seededShuffle(world, key, others);
    for (const [index, seed] of seeds.entries())
      makeTie(world, `${key}-${index}`, countryId, [seed, drawn[index]!], {
        higher: seed,
        firstHome: drawn[index]!,
        drawRule: 'higher-rank',
        round,
      });
  });
  const qualified = seeds.map((_, index) => winner(world, countryId, `${key}-${index}`));
  return qualified.every(Boolean) ? (qualified as string[]) : null;
}
function serieCPlayoff(world: World, countryId: string, leagues: League[]): string | null {
  const cup = Object.values(world.competitions).find(
    (competition) => competition.countryId === countryId && competition.divisionId === 'italy:3',
  )!;
  if (!cup.winnerId) return null;
  const cupFinal = world.fixtures[cup.stages.at(-1)!.fixtureIds[0]!]!;
  const finalist = cupFinal.homeId === cup.winnerId ? cupFinal.awayId : cupFinal.homeId;
  const eligibleCup = (id: string) => {
    const league = leagues.find((item) => item.clubIds.includes(id))!;
    const rank = rankStandings(world, league.standings).findIndex((row) => row.clubId === id) + 1;
    return rank >= 4 && rank <= 15 && eligibleTable(world, league).some((row) => row.clubId === id);
  };
  const winnerLeague = leagues.find((league) => league.clubIds.includes(cup.winnerId!))!;
  const cupQualifier = eligibleCup(cup.winnerId)
    ? cup.winnerId
    : eligibleCup(finalist)
      ? finalist
      : eligibleTable(world, winnerLeague)[3]!.clubId;
  const groupSurvivors: string[] = [];
  for (const [group, league] of leagues.entries()) {
    const table = eligibleTable(world, league);
    const field = table
      .slice(3)
      .filter((row) => row.clubId !== cupQualifier)
      .slice(0, 7)
      .map((row) => row.clubId);
    for (let index = 0; index < 3; index++)
      makeTie(
        world,
        `serie-c-group-${group}-first-${index}`,
        countryId,
        [field[index + 1]!, field[6 - index]!],
        { legs: 1, higher: field[index + 1]!, drawRule: 'higher-rank' },
      );
    const initial = Array.from({ length: 3 }, (_, index) =>
      winner(world, countryId, `serie-c-group-${group}-first-${index}`),
    );
    if (!initial.every(Boolean)) continue;
    const secondField = [field[0]!, ...(initial as string[])].sort(
      (a, b) => field.indexOf(a) - field.indexOf(b),
    );
    for (let index = 0; index < 2; index++)
      makeTie(
        world,
        `serie-c-group-${group}-second-${index}`,
        countryId,
        [secondField[index]!, secondField[3 - index]!],
        { legs: 1, higher: secondField[index]!, drawRule: 'higher-rank', round: 2 },
      );
    const survived = [
      winner(world, countryId, `serie-c-group-${group}-second-0`),
      winner(world, countryId, `serie-c-group-${group}-second-1`),
    ];
    if (survived.every(Boolean)) groupSurvivors.push(...(survived as string[]));
  }
  if (groupSurvivors.length !== 6) return null;
  const bestSurvivor = rankAcrossGroups(world, leagues, groupSurvivors)[0]!;
  const seeds = [
    ...leagues.map((league) => eligibleTable(world, league)[2]!.clubId),
    cupQualifier,
    bestSurvivor,
  ];
  const firstQualified = nationalRound(
    world,
    countryId,
    'serie-c-national-first',
    seeds,
    groupSurvivors.filter((id) => id !== bestSurvivor),
    3,
  );
  if (!firstQualified) return null;
  const bestFirst = rankAcrossGroups(world, leagues, firstQualified)[0]!;
  const secondSeeds = [
    ...leagues.map((league) => eligibleTable(world, league)[1]!.clubId),
    bestFirst,
  ];
  const finalists = nationalRound(
    world,
    countryId,
    'serie-c-national-second',
    secondSeeds,
    firstQualified.filter((id) => id !== bestFirst),
    4,
  );
  if (!finalists) return null;
  once(world, `${countryId}:serie-c-final-four-draw`, true, () => {
    const draw = seededShuffle(world, 'serie-c-final-four', finalists);
    for (let index = 0; index < 2; index++)
      makeTie(world, `serie-c-semi-${index}`, countryId, [draw[index * 2]!, draw[index * 2 + 1]!], {
        round: 5,
      });
  });
  const semifinalists = [
    winner(world, countryId, 'serie-c-semi-0'),
    winner(world, countryId, 'serie-c-semi-1'),
  ];
  if (semifinalists.every(Boolean))
    makeTie(world, 'serie-c-final', countryId, semifinalists as [string, string], { round: 6 });
  return winner(world, countryId, 'serie-c-final');
}
export function advanceItaly(world: World, countryId: string): boolean {
  const first = leaguesAt(world, countryId, 1)[0]!;
  const second = leaguesAt(world, countryId, 2)[0]!;
  const third = leaguesAt(world, countryId, 3);
  const fourth = leaguesAt(world, countryId, 4);
  if (!regularComplete(world, [first, second, ...third, ...fourth])) return false;
  // At the Serie D direct-drop boundary, equal points require a neutral
  // preliminary decider before allocating the playout and relegation places.
  let preliminaryDone = true;
  for (const [group, league] of fourth.entries()) {
    const table = rankStandings(world, league.standings);
    if (table[0]!.points === table[1]!.points) {
      const tie = makeTie(
        world,
        `serie-d-championship-${group}`,
        countryId,
        [table[0]!.clubId, table[1]!.clubId],
        { legs: 1, neutral: true, kind: 'championship' },
      );
      if (!tie.winnerId) preliminaryDone = false;
    }
    if (table[15]!.points !== table[16]!.points) continue;
    const tie = makeTie(
      world,
      `serie-d-boundary-${group}`,
      countryId,
      [table[15]!.clubId, table[16]!.clubId],
      { legs: 1, neutral: true, kind: 'survival' },
    );
    if (!tie.winnerId) preliminaryDone = false;
  }
  if (!preliminaryDone) return false;
  const secondTable = rankStandings(world, second.standings);
  const firstTable = rankStandings(world, first.standings);
  const championshipNeeded = firstTable[0]!.points === firstTable[1]!.points;
  const survivalNeeded = firstTable[16]!.points === firstTable[17]!.points;
  if (championshipNeeded)
    makeTie(
      world,
      'serie-a-championship',
      countryId,
      [firstTable[0]!.clubId, firstTable[1]!.clubId],
      { legs: 1, kind: 'championship', drawRule: 'penalties' },
    );
  if (survivalNeeded)
    makeTie(
      world,
      'serie-a-survival',
      countryId,
      [firstTable[16]!.clubId, firstTable[17]!.clubId],
      { firstHome: firstTable[17]!.clubId, kind: 'survival', drawRule: 'penalties' },
    );
  once(world, `${countryId}:automatic`, true, () => {
    for (const row of firstTable.slice(survivalNeeded ? -2 : -3))
      recordMovement(world, row.clubId, 2);
    for (const row of eligibleTable(world, second).slice(0, 2))
      recordMovement(world, row.clubId, 1);
    for (const row of secondTable.slice(-3)) recordMovement(world, row.clubId, 3);
    for (const league of third) {
      recordMovement(world, eligibleTable(world, league)[0]!.clubId, 2);
      recordMovement(world, rankStandings(world, league.standings).at(-1)!.clubId, 4);
    }
    for (const league of fourth) {
      recordMovement(world, eligibleTable(world, league)[0]!.clubId, 3);
      for (const row of rankStandings(world, league.standings).slice(-2))
        recordMovement(world, row.clubId, null);
    }
  });
  const survivalWinner = winner(world, countryId, 'serie-a-survival');
  if (survivalWinner)
    recordMovement(
      world,
      [firstTable[16]!.clubId, firstTable[17]!.clubId].find((id) => id !== survivalWinner)!,
      2,
      'playoff',
    );
  let survivalDone = survivalPair(
    world,
    countryId,
    'serie-b-survival',
    secondTable[15]!,
    secondTable[16]!,
    3,
    4,
    false,
    2,
  );
  for (const [group, league] of third.entries()) {
    const table = rankStandings(world, league.standings);
    for (const [index, ranks] of [
      [15, 18],
      [16, 17],
    ].entries())
      if (
        !survivalPair(
          world,
          countryId,
          `serie-c-survival-${group}-${index}`,
          table[ranks[0]!]!,
          table[ranks[1]!]!,
          4,
          8,
          false,
          2,
        )
      )
        survivalDone = false;
  }
  let rankingDone = true;
  for (const [group, league] of fourth.entries()) {
    const table = rankStandings(world, league.standings);
    for (const [index, ranks] of [
      [12, 15],
      [13, 14],
    ].entries())
      if (
        !survivalPair(
          world,
          countryId,
          `serie-d-survival-${group}-${index}`,
          table[ranks[0]!]!,
          table[ranks[1]!]!,
          null,
          8,
          true,
          1,
        )
      )
        survivalDone = false;
    const field = eligibleTable(world, league)
      .slice(1, 5)
      .map((row) => row.clubId);
    for (let index = 0; index < 2; index++)
      makeTie(
        world,
        `serie-d-ranking-${group}-semi-${index}`,
        countryId,
        [field[index]!, field[3 - index]!],
        {
          legs: 1,
          higher: field[index]!,
          drawRule: 'higher-rank-after-extra-time',
          kind: 'championship',
        },
      );
    const finalists = [
      winner(world, countryId, `serie-d-ranking-${group}-semi-0`),
      winner(world, countryId, `serie-d-ranking-${group}-semi-1`),
    ];
    if (finalists.every(Boolean)) {
      const sorted = (finalists as string[]).sort((a, b) => field.indexOf(a) - field.indexOf(b));
      makeTie(world, `serie-d-ranking-${group}-final`, countryId, sorted as [string, string], {
        legs: 1,
        higher: sorted[0]!,
        drawRule: 'higher-rank-after-extra-time',
        kind: 'championship',
        round: 2,
      });
    }
    if (!winner(world, countryId, `serie-d-ranking-${group}-final`)) rankingDone = false;
  }
  const secondWinner = serieBPlayoff(world, countryId, eligibleTable(world, second));
  if (secondWinner) recordMovement(world, secondWinner, 1, 'playoff');
  const thirdWinner = serieCPlayoff(world, countryId, third);
  if (thirdWinner) recordMovement(world, thirdWinner, 2, 'playoff');
  return Boolean(
    secondWinner &&
    thirdWinner &&
    survivalDone &&
    rankingDone &&
    (!championshipNeeded || winner(world, countryId, 'serie-a-championship')) &&
    (!survivalNeeded || survivalWinner),
  );
}
