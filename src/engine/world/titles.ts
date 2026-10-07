import type { Id, League, World } from '../../model/domain';
import { rankStandings } from './ranking';
import { sortStandings } from './schedule';

/**
 * Titles: who won what this season, as soon as each is decided (Phase 1.4). A league title is
 * decided when its fixtures are complete, its country's regular season is over (national
 * worlds create their deciders then) and no championship tie between its clubs is still
 * open; a cup when its final is played. Portugal's Liga 3 and Campeonato de Portugal groups
 * only qualify clubs: their titles go to the promotion-phase winner and the winner of the
 * championship final, never to a first-phase group winner.
 */
export interface Title {
  /** The competition the trophy is for: a league, cup, phase or tie id. */
  competitionId: Id;
  clubId: Id;
  name: string;
  /** Competitions of the winning campaign: an appearance in any of them earns the trophy. */
  campaign: Id[];
  /** For a multi-phase division title, the division it crowns. */
  divisionId?: string;
}
/**
 * Divisions whose first-phase groups only qualify clubs, with the competitions that decide
 * their title: Liga 3's promotion league, and the Campeonato de Portugal final between the
 * winners of its two promotion groups (keys of `france-portugal.ts`).
 */
export const QUALIFYING_DIVISIONS: Readonly<
  Record<string, { phases: readonly string[]; final?: string }>
> = {
  'portugal:3': { phases: ['liga-3-promotion'] },
  'portugal:4': {
    phases: ['campeonato-promotion-0', 'campeonato-promotion-1'],
    final: 'campeonato-championship',
  },
};

const divisionName = (world: World, countryId: Id, divisionId: string, fallback: string) =>
  world.pyramid?.profiles[countryId]?.divisions.find((division) => division.id === divisionId)
    ?.name ?? fallback;
const tableWinner = (world: World, league: League) =>
  (world.format === 'national-v1'
    ? rankStandings(world, league.standings)
    : sortStandings([...league.standings]))[0]!.clubId;

/** Titles decided so far this season (the order is stable). */
export function decidedTitles(world: World): Title[] {
  const titles: Title[] = [];
  const season = world.date.season;
  const openChampionships = Object.values(world.pyramid?.ties ?? {}).filter(
    (tie) => tie.kind === 'championship' && !tie.winnerId,
  );
  const complete = (league: League) =>
    league.fixtureIds.length > 0 && league.fixtureIds.every((id) => world.results[id]);
  // A national country creates its deciders (such as Italy's level-points ties) only once all
  // of its leagues have finished, so none of its league titles is decided before then.
  const countryDone = new Map<Id, boolean>();
  const regularSeasonOver = (league: League) => {
    if (world.format !== 'national-v1') return true;
    let done = countryDone.get(league.countryId);
    if (done === undefined) {
      done = world.countries[league.countryId]!.leagueIds.every((id) =>
        complete(world.leagues[id]!),
      );
      countryDone.set(league.countryId, done);
    }
    return done;
  };
  for (const league of Object.values(world.leagues)) {
    if (league.divisionId && QUALIFYING_DIVISIONS[league.divisionId]) continue;
    if (!complete(league) || !regularSeasonOver(league)) continue;
    const deciding = openChampionships.some((tie) =>
      tie.clubIds.every((clubId) => league.clubIds.includes(clubId)),
    );
    if (deciding) continue;
    titles.push({
      competitionId: league.id,
      clubId: tableWinner(world, league),
      name: league.name,
      campaign: [league.id],
    });
  }
  for (const cup of Object.values(world.competitions))
    if (cup.winnerId)
      titles.push({
        competitionId: cup.id,
        clubId: cup.winnerId,
        name: cup.name,
        campaign: [cup.id],
      });
  for (const [divisionId, decider] of Object.entries(QUALIFYING_DIVISIONS)) {
    const groups = Object.values(world.leagues).filter((l) => l.divisionId === divisionId);
    const countryId = groups[0]?.countryId;
    if (!countryId || !world.pyramid) continue;
    const key = (suffix: string) => `${countryId}:${season}:${suffix}`;
    const phases = decider.phases.map((suffix) => world.pyramid!.phases[key(suffix)]);
    const campaign = [...groups.map((league) => league.id), ...decider.phases.map(key)];
    const name = divisionName(world, countryId, divisionId, groups[0]!.name);
    if (decider.final) {
      const final = world.pyramid.ties[key(decider.final)];
      if (!final?.winnerId) continue;
      titles.push({
        competitionId: final.id,
        clubId: final.winnerId,
        name,
        campaign: [...campaign, final.id],
        divisionId,
      });
    } else {
      const phase = phases[0];
      if (phase?.status !== 'complete') continue;
      titles.push({
        competitionId: phase.id,
        clubId: rankStandings(world, phase.standings)[0]!.clubId,
        name,
        campaign,
        divisionId,
      });
    }
  }
  return titles;
}
