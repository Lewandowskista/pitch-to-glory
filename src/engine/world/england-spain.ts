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

function fourPlayoff(
  world: World,
  countryId: string,
  key: string,
  field: string[],
  legs: 1 | 2,
  drawRule: 'extra-time-penalties' | 'higher-rank-after-extra-time',
): string | null {
  for (const [index, pair] of [
    [field[0]!, field[3]!],
    [field[1]!, field[2]!],
  ].entries())
    makeTie(world, `${key}-semi-${index}`, countryId, pair as [string, string], {
      legs,
      firstHome: legs === 2 ? pair[1]! : pair[0]!,
      higher: drawRule === 'higher-rank-after-extra-time' ? pair[0]! : null,
      drawRule,
    });
  const semis = [
    winner(world, countryId, `${key}-semi-0`),
    winner(world, countryId, `${key}-semi-1`),
  ];
  if (semis.every(Boolean)) {
    const final = (semis as string[]).sort((a, b) => field.indexOf(a) - field.indexOf(b));
    makeTie(world, `${key}-final`, countryId, final as [string, string], {
      legs: drawRule === 'higher-rank-after-extra-time' ? 2 : 1,
      firstHome: drawRule === 'higher-rank-after-extra-time' ? final[1]! : final[0]!,
      higher: drawRule === 'higher-rank-after-extra-time' ? final[0]! : null,
      drawRule,
      round: 2,
      neutral: drawRule !== 'higher-rank-after-extra-time',
    });
  }
  return winner(world, countryId, `${key}-final`);
}
function sixPlayoff(
  world: World,
  countryId: string,
  key: string,
  field: string[],
  championship: boolean,
): string | null {
  const pairs = championship
    ? [
        [field[2]!, field[5]!],
        [field[3]!, field[4]!],
      ]
    : [
        [field[2]!, field[5]!],
        [field[3]!, field[4]!],
      ];
  for (const [index, pair] of pairs.entries())
    makeTie(world, `${key}-eliminator-${index}`, countryId, pair as [string, string], { legs: 1 });
  const survivors = [
    winner(world, countryId, `${key}-eliminator-0`),
    winner(world, countryId, `${key}-eliminator-1`),
  ];
  if (survivors.every(Boolean)) {
    const sorted = (survivors as string[]).sort((a, b) => field.indexOf(a) - field.indexOf(b));
    const opponents = championship ? [sorted[1]!, sorted[0]!] : [survivors[1]!, survivors[0]!];
    for (let index = 0; index < 2; index++)
      makeTie(world, `${key}-semi-${index}`, countryId, [field[index]!, opponents[index]!], {
        legs: championship ? 2 : 1,
        firstHome: championship ? opponents[index]! : field[index]!,
        round: 2,
      });
  }
  const semis = [
    winner(world, countryId, `${key}-semi-0`),
    winner(world, countryId, `${key}-semi-1`),
  ];
  if (semis.every(Boolean)) {
    const finalists = (semis as string[]).sort((a, b) => field.indexOf(a) - field.indexOf(b));
    const neutral = championship || world.leagues[world.clubs[field[0]!]!.leagueId]!.tier === 5;
    makeTie(world, `${key}-final`, countryId, finalists as [string, string], {
      legs: 1,
      round: 3,
      neutral,
    });
  }
  return winner(world, countryId, `${key}-final`);
}
export function advanceEngland(world: World, countryId: string): boolean {
  const leagues = world.countries[countryId]!.leagueIds.map((id) => world.leagues[id]!);
  if (!regularComplete(world, leagues)) return false;
  once(world, `${countryId}:automatic`, true, () => {
    for (const league of leagues) {
      if (league.tier > 1)
        for (const row of eligibleTable(world, league).slice(0, league.promotionPlaces))
          recordMovement(world, row.clubId, (league.tier - 1) as Tier);
      for (const row of rankStandings(world, league.standings).slice(-league.relegationPlaces))
        recordMovement(world, row.clubId, league.tier === 6 ? null : ((league.tier + 1) as Tier));
    }
  });
  let complete = true;
  for (const league of leagues.filter((item) => item.tier > 1)) {
    const table = eligibleTable(world, league).map((row) => row.clubId);
    const key = `${league.id}-promotion`;
    const field = table.slice(
      league.promotionPlaces,
      league.promotionPlaces + (league.tier === 2 || league.tier >= 5 ? 6 : 4),
    );
    const promoted =
      league.tier === 2 || league.tier >= 5
        ? sixPlayoff(world, countryId, key, field, league.tier === 2)
        : fourPlayoff(world, countryId, key, field, 2, 'extra-time-penalties');
    if (promoted) recordMovement(world, promoted, (league.tier - 1) as Tier, 'playoff');
    else complete = false;
  }
  return complete;
}

type Entrant = { clubId: string; leagueId: string; rank: number };
function entrants(world: World, leagues: League[], from: number, to: number): Entrant[] {
  return leagues.flatMap((league) =>
    eligibleTable(world, league)
      .slice(from - 1, to)
      .map((row, index) => ({ clubId: row.clubId, leagueId: league.id, rank: from + index })),
  );
}
function crossPairing(world: World, key: string, field: Entrant[]): [Entrant, Entrant][] {
  const sorted = [...field].sort((a, b) => a.rank - b.rank || a.clubId.localeCompare(b.clubId));
  const search = (remaining: Entrant[]): [Entrant, Entrant][] | null => {
    if (!remaining.length) return [];
    const first = remaining[0]!;
    const candidates = seededShuffle(
      world,
      `${key}:${remaining.map((row) => row.clubId).join(',')}`,
      remaining
        .slice(1)
        .filter((row) => row.leagueId !== first.leagueId)
        .map((row) => row.clubId),
    );
    const rankedCandidates = candidates
      .map((id) => remaining.find((row) => row.clubId === id)!)
      .sort((a, b) => b.rank - a.rank);
    for (const candidate of rankedCandidates) {
      const rest = search(remaining.filter((row) => row !== first && row !== candidate));
      if (rest) return [[first, candidate], ...rest];
    }
    return null;
  };
  const result = search(sorted);
  if (result) return result;
  // Regulations prohibit same-group opponents where possible; an all-one-group
  // survivor field makes that restriction impossible to satisfy.
  const fallback: [Entrant, Entrant][] = [];
  while (sorted.length) fallback.push([sorted.shift()!, sorted.pop()!]);
  return fallback;
}
function spanishCrossPlayoff(
  world: World,
  countryId: string,
  key: string,
  field: Entrant[],
  explicitPairs?: [Entrant, Entrant][],
): string[] | null {
  const initialKey = `${countryId}:${key}:initial-draw`;
  once(world, initialKey, true, () => {
    for (const [index, pair] of (
      explicitPairs ?? crossPairing(world, `${key}-semis`, field)
    ).entries())
      makeTie(world, `${key}-semi-${index}`, countryId, [pair[0].clubId, pair[1].clubId], {
        firstHome: pair[1].clubId,
        higher: pair[0].rank === pair[1].rank ? null : pair[0].clubId,
        drawRule:
          pair[0].rank === pair[1].rank ? 'extra-time-penalties' : 'higher-rank-after-extra-time',
      });
  });
  const survivors = Array.from({ length: field.length / 2 }, (_, index) =>
    winner(world, countryId, `${key}-semi-${index}`),
  );
  if (!survivors.every(Boolean)) return null;
  once(world, `${countryId}:${key}:final-draw`, true, () => {
    const finalists = (survivors as string[]).map((id) => field.find((row) => row.clubId === id)!);
    for (const [index, pair] of crossPairing(world, `${key}-finals`, finalists).entries())
      makeTie(world, `${key}-final-${index}`, countryId, [pair[0].clubId, pair[1].clubId], {
        firstHome: pair[1].clubId,
        higher: pair[0].rank === pair[1].rank ? null : pair[0].clubId,
        drawRule:
          pair[0].rank === pair[1].rank ? 'extra-time-penalties' : 'higher-rank-after-extra-time',
        round: 2,
      });
  });
  const promoted = Array.from({ length: field.length / 4 }, (_, index) =>
    winner(world, countryId, `${key}-final-${index}`),
  );
  return promoted.every(Boolean) ? (promoted as string[]) : null;
}
export function advanceSpain(world: World, countryId: string): boolean {
  const first = leaguesAt(world, countryId, 1)[0]!;
  const second = leaguesAt(world, countryId, 2)[0]!;
  const third = leaguesAt(world, countryId, 3);
  const fourth = leaguesAt(world, countryId, 4);
  if (!regularComplete(world, [first, second, ...third, ...fourth])) return false;
  once(world, `${countryId}:automatic`, true, () => {
    for (const row of rankStandings(world, first.standings).slice(-3))
      recordMovement(world, row.clubId, 2);
    for (const row of eligibleTable(world, second).slice(0, 2))
      recordMovement(world, row.clubId, 1);
    for (const row of rankStandings(world, second.standings).slice(-4))
      recordMovement(world, row.clubId, 3);
    for (const league of third) {
      recordMovement(world, eligibleTable(world, league)[0]!.clubId, 2);
      for (const row of rankStandings(world, league.standings).slice(-5))
        recordMovement(world, row.clubId, 4);
    }
    for (const league of fourth) {
      recordMovement(world, eligibleTable(world, league)[0]!.clubId, 3);
      for (const row of rankStandings(world, league.standings).slice(-5))
        recordMovement(world, row.clubId, null);
    }
    const worst = rankStandings(
      world,
      fourth.map((league) => rankStandings(world, league.standings)[12]!),
    ).slice(-4);
    const draw = seededShuffle(
      world,
      'segunda-fed-survival',
      worst.map((row) => row.clubId),
    );
    for (let index = 0; index < 2; index++)
      makeTie(
        world,
        `segunda-fed-survival-${index}`,
        countryId,
        [draw[index * 2]!, draw[index * 2 + 1]!],
        { kind: 'survival' },
      );
  });
  const topWinner = fourPlayoff(
    world,
    countryId,
    'segunda-division',
    eligibleTable(world, second)
      .slice(2, 6)
      .map((row) => row.clubId),
    2,
    'higher-rank-after-extra-time',
  );
  if (topWinner) recordMovement(world, topWinner, 1, 'playoff');
  const thirdField = entrants(world, third, 2, 5);
  const pairs: [Entrant, Entrant][] = [
    [thirdField[0]!, thirdField[7]!],
    [thirdField[1]!, thirdField[6]!],
    [thirdField[4]!, thirdField[3]!],
    [thirdField[5]!, thirdField[2]!],
  ];
  const thirdWinners = spanishCrossPlayoff(world, countryId, 'primera-fed', thirdField, pairs);
  if (thirdWinners) for (const id of thirdWinners) recordMovement(world, id, 2, 'playoff');
  const fourthWinners = spanishCrossPlayoff(
    world,
    countryId,
    'segunda-fed',
    entrants(world, fourth, 2, 5),
  );
  if (fourthWinners) for (const id of fourthWinners) recordMovement(world, id, 3, 'playoff');
  let survivalDone = true;
  for (let index = 0; index < 2; index++) {
    const key = `segunda-fed-survival-${index}`;
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
  return Boolean(topWinner && thirdWinners && fourthWinners && survivalDone);
}

export function standingsPoints(rows: Standing[], rank: number): number {
  return rows[rank - 1]!.points;
}
