import type { Tier, World } from '../../model/domain';
import { admitFeeder, createFeederClub } from './feeder';
import {
  barrage,
  eligibleTable,
  leaguesAt,
  makeTie,
  once,
  recordMovement,
  regularComplete,
  winner,
} from './postseason';
import { rankStandings } from './ranking';

export function advanceGermany(world: World, countryId: string): boolean {
  const first = leaguesAt(world, countryId, 1)[0]!;
  const second = leaguesAt(world, countryId, 2)[0]!;
  const third = leaguesAt(world, countryId, 3)[0]!;
  const fourth = leaguesAt(world, countryId, 4);
  if (!regularComplete(world, [first, second, third, ...fourth])) return false;
  const lower = [second, third];
  once(world, `${countryId}:automatic`, true, () => {
    for (const league of [first, second])
      for (const row of rankStandings(world, league.standings).slice(-2))
        recordMovement(world, row.clubId, (league.tier + 1) as Tier);
    for (const league of lower)
      for (const row of eligibleTable(world, league).slice(0, 2))
        recordMovement(world, row.clubId, (league.tier - 1) as Tier);
    for (const row of rankStandings(world, third.standings).slice(-4))
      recordMovement(world, row.clubId, 4);
    const rotation = [1, 4, 0][(world.date.season - 2026) % 3]!;
    for (const index of [2, 3, rotation])
      recordMovement(world, eligibleTable(world, fourth[index]!)[0]!.clubId, 3);
    const contenders = [0, 1, 4]
      .filter((index) => index !== rotation)
      .map((index) => eligibleTable(world, fourth[index]!)[0]!.clubId);
    makeTie(world, 'regionalliga-promotion', countryId, contenders as [string, string], {
      targetTier: 3,
    });
  });
  const topDone = barrage(
    world,
    countryId,
    'bundesliga-barrage',
    rankStandings(world, first.standings)[15]!.clubId,
    eligibleTable(world, second)[2]!.clubId,
    1,
  );
  const secondDone = barrage(
    world,
    countryId,
    'second-barrage',
    rankStandings(world, second.standings)[15]!.clubId,
    eligibleTable(world, third)[2]!.clubId,
    2,
  );
  const regionalWinner = winner(world, countryId, 'regionalliga-promotion');
  if (!regionalWinner) return false;
  recordMovement(world, regionalWinner, 3, 'playoff');
  once(world, `${countryId}:regional-frontier`, true, () => {
    const incoming = world
      .pyramid!.movements.filter(
        (movement) =>
          movement.toLeagueId === fourth[0]!.id ||
          fourth.some((league) => league.id === movement.toLeagueId),
      )
      .filter((movement) => world.leagues[movement.fromLeagueId]?.tier === 3)
      .map((movement) => world.clubs[movement.clubId]!);
    for (const [index, league] of fourth.entries()) {
      const table = rankStandings(world, league.standings);
      const promoted = world.pyramid!.movements.filter(
        (movement) =>
          movement.fromLeagueId === league.id && world.leagues[movement.toLeagueId]?.tier === 3,
      ).length;
      const returning = incoming.filter((club) => club.identity!.region === league.region).length;
      if (index === 4) {
        const base = league.clubIds.length - promoted + returning - 2 - 2 + 2;
        league.nextCapacity = base + 2;
        for (const row of table.slice(-2)) recordMovement(world, row.clubId, null);
        for (let candidate = 0; candidate < 2; candidate++) {
          const feeder = createFeederClub(world, countryId, league.region!);
          admitFeeder(world, feeder.id, league.id);
        }
        const challengers = Array.from({ length: 2 }, () =>
          createFeederClub(world, countryId, league.region!),
        );
        if (base + 4 <= 18) {
          for (const challenger of challengers) admitFeeder(world, challenger.id, league.id);
          league.nextCapacity = base + 4;
          once(world, `${countryId}:bavaria-no-ties`, true, () => {});
        } else
          for (let pairing = 0; pairing < 2; pairing++)
            makeTie(
              world,
              `bavaria-survival-${pairing}`,
              countryId,
              [challengers[pairing]!.id, table[table.length - 3 - pairing]!.clubId],
              { kind: 'survival' },
            );
      } else {
        const feederCount = [3, 2, 4, 4][index]!;
        let relegations: number;
        if (index === 0) {
          relegations = Math.min(table.length - 1, 3 + Math.max(0, table.length - 18));
          if (table.length - promoted + returning - relegations + feederCount < 18)
            relegations = Math.max(0, table.length - promoted + returning + feederCount - 18);
        } else if (index === 3)
          relegations = Math.min(
            6,
            Math.max(3, table.length - promoted + returning + feederCount - 18),
          );
        else
          relegations = Math.min(
            index === 2 ? 4 : table.length - 1,
            Math.max(index === 1 ? 1 : 0, table.length - promoted + returning + feederCount - 18),
          );
        for (const row of relegations ? table.slice(-relegations) : [])
          recordMovement(world, row.clubId, null);
        for (let candidate = 0; candidate < feederCount; candidate++)
          admitFeeder(world, createFeederClub(world, countryId, league.region!).id, league.id);
        league.nextCapacity = table.length - promoted + returning - relegations + feederCount;
      }
    }
  });
  let bavariaDone = world.pyramid!.completedSteps.includes(`${countryId}:bavaria-no-ties`);
  if (!bavariaDone) {
    const ties = [0, 1].map(
      (index) =>
        world.pyramid!.ties[`${countryId}:${world.date.season}:bavaria-survival-${index}`]!,
    );
    if (ties.every((tie) => tie.winnerId)) {
      const league = fourth[4]!;
      const base = league.nextCapacity! - 2;
      let selected = ties.map((tie) => tie.winnerId!);
      let pending = false;
      if (base + 2 > 18) {
        makeTie(world, 'bavaria-survival-final', countryId, selected as [string, string], {
          kind: 'survival',
          round: 2,
        });
        const survived = winner(world, countryId, 'bavaria-survival-final');
        pending = !survived;
        if (survived) selected = [survived];
      } else if (base + 2 < 18) {
        const losers = ties.map((tie) => tie.clubIds.find((id) => id !== tie.winnerId)!);
        makeTie(world, 'bavaria-survival-extra', countryId, losers as [string, string], {
          kind: 'survival',
          round: 2,
        });
        const survived = winner(world, countryId, 'bavaria-survival-extra');
        pending = !survived;
        if (survived) selected.push(survived);
      }
      if (!pending) {
        const all = ties.flatMap((tie) => tie.clubIds);
        for (const id of all) {
          const club = world.clubs[id]!;
          if (selected.includes(id)) {
            if (!world.leagues[club.leagueId]) admitFeeder(world, id, league.id);
          } else if (world.leagues[club.leagueId]) recordMovement(world, id, null, 'playoff');
        }
        league.nextCapacity = base + selected.length;
        bavariaDone = true;
      }
    }
  }
  return topDone && secondDone && bavariaDone;
}
