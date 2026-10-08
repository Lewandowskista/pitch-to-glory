import type { LeaguePhase, World } from '../../model/domain';
import { rankStandings } from './ranking';
import {
  barrage,
  barrageChallenger,
  createLeaguePhase,
  eligiblePhaseTable,
  eligibleTable,
  leaguesAt,
  makeTie,
  once,
  portugueseSurvivalBonus,
  recordMovement,
  regularComplete,
  winner,
} from './postseason';

export function advanceFrance(world: World, countryId: string): boolean {
  const first = leaguesAt(world, countryId, 1)[0]!;
  const second = leaguesAt(world, countryId, 2)[0]!;
  const third = leaguesAt(world, countryId, 3)[0]!;
  const fourth = leaguesAt(world, countryId, 4);
  if (regularComplete(world, fourth))
    once(world, `${countryId}:fourth-movement`, true, () => {
      for (const league of fourth) {
        recordMovement(world, eligibleTable(world, league)[0]!.clubId, 3);
        for (const row of rankStandings(world, league.standings).slice(-2))
          recordMovement(world, row.clubId, null);
      }
      const fourteenths = fourth.map((league) => rankStandings(world, league.standings)[13]!);
      for (const row of rankStandings(world, fourteenths).slice(-2))
        recordMovement(world, row.clubId, null);
    });
  if (!regularComplete(world, [first, second, third])) return false;
  const a = eligibleTable(world, second);
  const b = eligibleTable(world, third);
  const firstTable = rankStandings(world, first.standings);
  const secondTable = rankStandings(world, second.standings);
  const thirdTable = rankStandings(world, third.standings);
  once(world, `${countryId}:automatic`, true, () => {
    for (const row of firstTable.slice(-2)) recordMovement(world, row.clubId, 2);
    for (const row of secondTable.slice(-2)) recordMovement(world, row.clubId, 3);
    for (const row of thirdTable.slice(-3)) recordMovement(world, row.clubId, 4);
    for (const row of a.slice(0, 2)) recordMovement(world, row.clubId, 1);
    for (const row of b.slice(0, 2)) recordMovement(world, row.clubId, 2);
  });
  makeTie(world, 'ligue-2-eliminator', countryId, [a[3]!.clubId, a[4]!.clubId], {
    legs: 1,
    drawRule: 'penalties',
  });
  const eliminator = winner(world, countryId, 'ligue-2-eliminator');
  if (eliminator)
    makeTie(world, 'ligue-2-final', countryId, [a[2]!.clubId, eliminator], {
      legs: 1,
      drawRule: 'penalties',
      round: 2,
    });
  const l2Winner = winner(world, countryId, 'ligue-2-final');
  const topDone = Boolean(
    l2Winner && barrage(world, countryId, 'ligue-1-barrage', firstTable[15]!.clubId, l2Winner, 1),
  );
  const thirdEntrants = thirdTable
    .slice(2, 6)
    .filter((row) => b.some((eligible) => eligible.clubId === row.clubId));
  const semiWinners: (string | null)[] = [];
  for (const [index, pair] of [
    [thirdTable[2], thirdTable[5]],
    [thirdTable[3], thirdTable[4]],
  ].entries()) {
    const entrants = pair.filter(
      (row) => row && thirdEntrants.some((entrant) => entrant.clubId === row.clubId),
    );
    if (entrants.length === 1) semiWinners.push(entrants[0]!.clubId);
    else if (entrants.length === 2) {
      makeTie(
        world,
        `ligue-3-semi-${index}`,
        countryId,
        [entrants[0]!.clubId, entrants[1]!.clubId],
        { legs: 1, drawRule: 'penalties' },
      );
      semiWinners.push(winner(world, countryId, `ligue-3-semi-${index}`));
    } else semiWinners.push(null);
  }
  let l3Winner: string | null = null;
  if (semiWinners.every(Boolean)) {
    const sorted = (semiWinners as string[]).sort(
      (left, right) =>
        thirdTable.findIndex((row) => row.clubId === left) -
        thirdTable.findIndex((row) => row.clubId === right),
    );
    makeTie(world, 'ligue-3-final', countryId, sorted as [string, string], {
      legs: 1,
      drawRule: 'penalties',
      round: 2,
    });
    l3Winner = winner(world, countryId, 'ligue-3-final');
  }
  const secondDone = Boolean(
    l3Winner && barrage(world, countryId, 'ligue-2-barrage', secondTable[15]!.clubId, l3Winner, 2),
  );
  return topDone && secondDone && regularComplete(world, fourth);
}

const phaseFor = (world: World, countryId: string, suffix: string): LeaguePhase | undefined =>
  world.pyramid!.phases[`${countryId}:${world.date.season}:${suffix}`];
export function advancePortugal(world: World, countryId: string): boolean {
  const first = leaguesAt(world, countryId, 1)[0]!;
  const second = leaguesAt(world, countryId, 2)[0]!;
  const third = leaguesAt(world, countryId, 3);
  const fourth = leaguesAt(world, countryId, 4);
  once(world, `${countryId}:liga-3-phases`, regularComplete(world, third), () => {
    const qualifiers = third.flatMap((league) =>
      rankStandings(world, league.standings)
        .slice(0, 4)
        .map((row) => row.clubId),
    );
    createLeaguePhase(world, {
      id: `${countryId}:${world.date.season}:liga-3-promotion`,
      countryId,
      divisionId: 'portugal:3',
      name: 'Liga 3 promotion league',
      kind: 'promotion',
      sourceLeagueIds: third.map((league) => league.id),
      clubIds: qualifiers,
      initialPoints: {},
    });
    for (const [index, league] of third.entries()) {
      const remaining = rankStandings(world, league.standings).slice(4);
      createLeaguePhase(world, {
        id: `${countryId}:${world.date.season}:liga-3-survival-${index}`,
        countryId,
        divisionId: 'portugal:3',
        name: `Liga 3 survival · ${league.region}`,
        kind: 'survival',
        sourceLeagueIds: [league.id],
        clubIds: remaining.map((row) => row.clubId),
        initialPoints: Object.fromEntries(
          remaining.map((row, rank) => [row.clubId, portugueseSurvivalBonus(rank + 5, row.points)]),
        ),
      });
    }
  });
  once(world, `${countryId}:campeonato-phases`, regularComplete(world, fourth), () => {
    for (let index = 0; index < 2; index++) {
      const sources = fourth.slice(index * 2, index * 2 + 2);
      createLeaguePhase(world, {
        id: `${countryId}:${world.date.season}:campeonato-promotion-${index}`,
        countryId,
        divisionId: 'portugal:4',
        name: `Campeonato promotion · ${index ? 'South' : 'North'}`,
        kind: 'promotion',
        sourceLeagueIds: sources.map((league) => league.id),
        clubIds: sources.flatMap((league) =>
          rankStandings(world, league.standings)
            .slice(0, 2)
            .map((row) => row.clubId),
        ),
        initialPoints: {},
      });
      const firstTable = rankStandings(world, sources[0]!.standings);
      const secondTable = rankStandings(world, sources[1]!.standings);
      makeTie(
        world,
        `campeonato-survival-${index}-0`,
        countryId,
        [firstTable[11]!.clubId, secondTable[10]!.clubId],
        { kind: 'survival' },
      );
      makeTie(
        world,
        `campeonato-survival-${index}-1`,
        countryId,
        [secondTable[11]!.clubId, firstTable[10]!.clubId],
        { kind: 'survival' },
      );
    }
    for (const league of fourth)
      for (const row of rankStandings(world, league.standings).slice(-2))
        recordMovement(world, row.clubId, null);
  });
  const promotion = phaseFor(world, countryId, 'liga-3-promotion');
  const survival = [
    phaseFor(world, countryId, 'liga-3-survival-0'),
    phaseFor(world, countryId, 'liga-3-survival-1'),
  ];
  once(
    world,
    `${countryId}:liga-3-movement`,
    Boolean(
      promotion?.status === 'complete' && survival.every((phase) => phase?.status === 'complete'),
    ),
    () => {
      for (const row of eligiblePhaseTable(world, promotion!, 2).slice(0, 2))
        recordMovement(world, row.clubId, 2);
      for (const phase of survival)
        for (const row of rankStandings(world, phase!.standings).slice(-2))
          recordMovement(world, row.clubId, 4);
    },
  );
  const regionalPromotion = [
    phaseFor(world, countryId, 'campeonato-promotion-0'),
    phaseFor(world, countryId, 'campeonato-promotion-1'),
  ];
  const regionalComplete = regionalPromotion.every((phase) => phase?.status === 'complete');
  once(world, `${countryId}:campeonato-movement`, regionalComplete, () => {
    for (const phase of regionalPromotion)
      for (const row of eligiblePhaseTable(world, phase!, 3).slice(0, 2))
        recordMovement(world, row.clubId, 3);
    makeTie(
      world,
      'campeonato-championship',
      countryId,
      regionalPromotion.map((phase) => rankStandings(world, phase!.standings)[0]!.clubId) as [
        string,
        string,
      ],
      { legs: 1, kind: 'championship', neutral: true },
    );
  });
  let survivalDone = true;
  for (let index = 0; index < 2; index++)
    for (let other = 0; other < 2; other++) {
      const key = `campeonato-survival-${index}-${other}`;
      const tie = world.pyramid!.ties[`${countryId}:${world.date.season}:${key}`];
      if (!tie?.winnerId) survivalDone = false;
      else
        recordMovement(
          world,
          tie.clubIds.find((id) => id !== tie.winnerId)!,
          null,
          'playoff',
        );
    }
  let topDone = false;
  let secondDone = false;
  if (regularComplete(world, [first, second])) {
    const a = rankStandings(world, first.standings);
    const b = rankStandings(world, second.standings);
    const eligible = eligibleTable(world, second);
    once(world, `${countryId}:professional-movement`, true, () => {
      for (const row of a.slice(-2)) recordMovement(world, row.clubId, 2);
      for (const row of b.slice(-2)) recordMovement(world, row.clubId, 3);
      for (const row of eligible.slice(0, 2)) recordMovement(world, row.clubId, 1);
    });
    topDone = barrage(
      world,
      countryId,
      'primeira-barrage',
      a[15]!.clubId,
      barrageChallenger(world, eligible),
      1,
    );
    if (promotion?.status === 'complete')
      secondDone = barrage(
        world,
        countryId,
        'liga-2-barrage',
        b[15]!.clubId,
        barrageChallenger(world, eligiblePhaseTable(world, promotion, 2)),
        2,
      );
  }
  return (
    topDone &&
    secondDone &&
    survivalDone &&
    Boolean(winner(world, countryId, 'campeonato-championship')) &&
    survival.every((phase) => phase?.status === 'complete')
  );
}
