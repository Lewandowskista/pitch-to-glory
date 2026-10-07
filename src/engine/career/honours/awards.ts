import type {
  Award,
  League,
  Player,
  RecordKind,
  StatLine,
  Trophy,
  World,
} from '../../../model/domain';
import { CONFIG } from '../../config';
import { CONTINENTAL_IDS } from '../../world/continental';
import { decidedTitles } from '../../world/titles';
import { trophyName } from './trophies';
import { nextId, postMessage } from '../market/records';
import { today } from '../market/rules';
import { chronicle } from './chronicle';
import {
  allCompetitionTotals,
  competitionTotals,
  hasSeasonStatistics,
  type StatTotals,
} from '../../world/statistics';

/**
 * Awards (AGENTS.md §8): player of the month and the season's league awards for the career
 * player's league, young player of the year for their country, and a global Golden Ball
 * with a ranked shortlist.
 *
 * With complete season statistics (Phase 1.3), league awards count only that league's
 * matches, wherever the player is now, while the young player award, the Golden Ball and the
 * records count all club competitions. Worlds saved before then keep the earlier mode for the
 * rest of that season: baselines of all-competition totals taken at the start of each season
 * and month, for the players awards can consider.
 */
const A = CONFIG.career.honours.awards;
const line = (player: Player): StatLine => [
  player.stats.appearances,
  player.stats.goals,
  player.stats.assists,
  player.stats.ratingTotal,
];
interface Line {
  apps: number;
  goals: number;
  assists: number;
  rating: number;
}
function since(player: Player, base: StatLine | undefined): Line {
  const [apps, goals, assists, total] = line(player);
  const [a, g, s, t] = base ?? [apps, goals, assists, total];
  const played = apps - a;
  return {
    apps: played,
    goals: goals - g,
    assists: assists - s,
    rating: played ? (total - t) / played : 0,
  };
}
const fromTotals = (t: StatTotals | undefined): Line =>
  t
    ? {
        apps: t.apps,
        goals: t.goals,
        assists: t.assists,
        rating: t.apps ? t.ratingTotal / t.apps : 0,
      }
    : { apps: 0, goals: 0, assists: 0, rating: 0 };
const totalsLine = (t: StatTotals): StatLine => [t.apps, t.goals, t.assists, t.ratingTotal];
/** A league's players by their totals in it, including those who have since left. */
function leagueEntries(world: World, league: League): { player: Player; line: Line }[] {
  return [...competitionTotals(world, league.id)].flatMap(([id, totals]) => {
    const player = world.players[id];
    return player ? [{ player, line: fromTotals(totals) }] : [];
  });
}
/** Month baselines: league totals in competition mode, all-competition totals before it. */
function monthBaselines(world: World, league: League): Record<string, StatLine> {
  const start: Record<string, StatLine> = {};
  if (hasSeasonStatistics(world))
    for (const [id, totals] of competitionTotals(world, league.id)) start[id] = totalsLine(totals);
  else for (const player of leaguePlayers(world, league)) start[player.id] = line(player);
  return start;
}
const score = (l: Line) =>
  l.rating * A.score.rating + l.goals * A.score.goal + l.assists * A.score.assist;

const careerLeague = (world: World): League | undefined => {
  const player = world.players[world.career!.playerId]!;
  return player.clubId ? world.leagues[world.clubs[player.clubId]!.leagueId] : undefined;
};
const leaguePlayers = (world: World, league: League) =>
  league.clubIds.flatMap((id) => world.clubs[id]!.playerIds.map((pid) => world.players[pid]!));

/** Players the season's awards can consider: top divisions, the player's league and country. */
function candidates(world: World): Player[] {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const own = careerLeague(world);
  const ids = new Set<string>([career.playerId, ...world.rivalries.map((r) => r.rivalPlayerId)]);
  for (const league of Object.values(world.leagues)) {
    const domestic = league.countryId === player.nationalityId && league.tier <= 2;
    if (league.tier === 1 || league.id === own?.id || domestic)
      for (const clubId of league.clubIds)
        for (const id of world.clubs[clubId]!.playerIds) ids.add(id);
  }
  return [...ids]
    .map((id) => world.players[id])
    .filter((p): p is Player => Boolean(p && !p.retired));
}

/** Take the season and month baselines; called at career start and each new season. */
export function startAwardSeason(world: World): void {
  // Complete season statistics need no season baselines.
  const seasonStart: Record<string, StatLine> = {};
  if (!hasSeasonStatistics(world))
    for (const player of candidates(world)) seasonStart[player.id] = line(player);
  const league = careerLeague(world);
  const monthStart = league ? monthBaselines(world, league) : {};
  world.awardState = { season: world.date.season, seasonStart, month: 1, monthStart };
}
/** A player who joins the tracked leagues mid-season starts from their current numbers. */
export function trackPlayers(world: World, players: Player[]): void {
  const state = world.awardState;
  if (!state || hasSeasonStatistics(world)) return;
  for (const player of players) {
    state.seasonStart[player.id] ??= line(player);
    state.monthStart[player.id] ??= line(player);
  }
}

function addAward(world: World, award: Omit<Award, 'id'>): Award {
  const full: Award = { id: nextId(world, 'award'), ...award };
  world.awards.push(full);
  // Keep a manageable record: the career's own awards and the last seasons of everything else.
  if (world.awards.length > 400) {
    const careerId = world.career?.playerId;
    const index = world.awards.findIndex(
      (entry) => !entry.winnerIds.includes(careerId ?? '') && entry.kind !== 'golden-ball',
    );
    if (index >= 0) world.awards.splice(index, 1);
  }
  return full;
}
function celebrate(world: World, award: Award, fame: number): void {
  const career = world.career!;
  if (!award.winnerIds.includes(career.playerId)) return;
  career.fame += fame;
  chronicle(world, 'award', { kind: award.kind, season: award.season, month: award.month ?? 0 });
  postMessage(world, 'award', { kind: award.kind, season: award.season });
}

/** Player of the month in the career player's league, every few weeks. */
export function monthlyAward(world: World): void {
  const state = world.awardState;
  const league = world.career ? careerLeague(world) : undefined;
  if (!state || !league || world.date.week % A.monthWeeks !== 0) return;
  const competition = hasSeasonStatistics(world);
  trackPlayers(world, leaguePlayers(world, league));
  const zero: StatLine = [0, 0, 0, 0];
  const entries = competition
    ? [...competitionTotals(world, league.id)].flatMap(([id, totals]) => {
        const player = world.players[id];
        if (!player) return [];
        const [apps, goals, assists, rating] = state.monthStart[id] ?? zero;
        const played = totals.apps - apps;
        return [
          {
            player,
            line: {
              apps: played,
              goals: totals.goals - goals,
              assists: totals.assists - assists,
              rating: played ? (totals.ratingTotal - rating) / played : 0,
            },
          },
        ];
      })
    : leaguePlayers(world, league).map((player) => ({
        player,
        line: since(player, state.monthStart[player.id]),
      }));
  const ranked = entries
    .filter((entry) => entry.line.apps >= A.monthMinimumApps)
    .map((entry) => ({
      ...entry,
      score:
        entry.line.rating * A.score.rating +
        entry.line.goals * A.score.monthGoal +
        entry.line.assists * A.score.monthAssist,
    }))
    .sort((a, b) => b.score - a.score || (a.player.id < b.player.id ? -1 : 1));
  if (ranked.length) {
    const award = addAward(world, {
      kind: 'month',
      season: world.date.season,
      month: state.month,
      competitionId: league.id,
      winnerIds: [ranked[0]!.player.id],
      shortlist: [],
      value: Math.round(ranked[0]!.score * 10) / 10,
    });
    celebrate(world, award, A.fame.month);
  }
  state.month++;
  state.monthStart = monthBaselines(world, league);
}

const LINES: Record<string, 'GK' | 'DEF' | 'MID' | 'ATT'> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  DM: 'MID',
  CM: 'MID',
  AM: 'MID',
  LW: 'ATT',
  RW: 'ATT',
  ST: 'ATT',
};

function addTrophy(world: World, trophy: Trophy): void {
  world.trophies.push(trophy);
  const competition = trophyName(world, trophy);
  chronicle(world, 'trophy', { competition, club: world.clubs[trophy.clubId]!.name });
  postMessage(world, 'trophy', { competition });
}

/**
 * Club trophies (Phase 1.4), recorded as each title is decided: the career player earns one
 * for a competitive appearance for the winning club in the winning campaign, wherever they
 * play when it is decided or at the end of the season. Joining afterwards earns nothing. Each
 * title is recorded once, so a repeated week or award run cannot duplicate it.
 */
export function recordCareerTrophies(world: World): void {
  const career = world.career;
  const stats = world.seasonStats;
  if (!career || !stats || !hasSeasonStatistics(world)) return;
  for (const title of decidedTitles(world)) {
    const id = `trophy:${world.date.season}:${title.competitionId}`;
    if (world.trophies.some((trophy) => trophy.id === id)) continue;
    const played = title.campaign.some(
      (competitionId) =>
        (stats.competitions[competitionId]?.[title.clubId]?.[career.playerId]?.[0] ?? 0) > 0,
    );
    if (!played) continue;
    addTrophy(world, {
      id,
      competitionId: title.competitionId,
      season: world.date.season,
      clubId: title.clubId,
      playerIds: [career.playerId],
      name: title.name,
    });
  }
}

/**
 * Club trophies for a world saved before Phase 1.4, for the rest of that season: titles won
 * by the career player's club at the end of the season.
 */
function clubTrophies(world: World): void {
  if (hasSeasonStatistics(world)) return;
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const summary = world.history.at(-1);
  if (!summary || !player.clubId) return;
  const won = [
    ...Object.entries(summary.champions).filter(([leagueId]) =>
      world.leagues[leagueId]?.clubIds.includes(player.clubId!),
    ),
    ...Object.entries(summary.cupWinners),
  ].filter(([, clubId]) => clubId === player.clubId);
  for (const [competitionId] of won) {
    const id = `trophy:${world.date.season}:${competitionId}`;
    if (world.trophies.some((trophy) => trophy.id === id)) continue;
    addTrophy(world, {
      id,
      competitionId,
      season: world.date.season,
      clubId: player.clubId,
      playerIds: [player.id],
    });
  }
}

function updateRecord(world: World, kind: RecordKind, playerId: string, value: number): void {
  const current = world.records.find((record) => record.kind === kind);
  if (current && current.value >= value) return;
  const player = world.players[playerId];
  if (!player) return;
  const entry = {
    id: `record:${kind}`,
    kind,
    playerId,
    playerName: player.name,
    value,
    date: today(world),
  };
  if (current) Object.assign(current, entry);
  else world.records.push(entry);
  if (playerId === world.career?.playerId) {
    chronicle(world, 'record', { kind, value });
    postMessage(world, 'record', { kind, value });
  }
}

/**
 * The season's awards, at its final week after the tables are archived: club trophies,
 * the league's golden boot, MVP and team of the season, the country's young player of the
 * year, the Golden Ball and world records.
 */
export function seasonAwards(world: World): void {
  const state = world.awardState;
  const career = world.career;
  if (!state || !career) return;
  clubTrophies(world);
  const season = world.date.season;
  const totals = hasSeasonStatistics(world) ? allCompetitionTotals(world) : null;
  const all = candidates(world).map((player) => ({
    player,
    line: totals ? fromTotals(totals.get(player.id)) : since(player, state.seasonStart[player.id]),
  }));
  const qualified = all.filter((entry) => entry.line.apps >= A.seasonMinimumApps);
  const league = careerLeague(world);
  const summary = world.history.at(-1);
  const rankOf = (clubId: string) => {
    const club = world.clubs[clubId]!;
    const table = summary?.tables[club.leagueId];
    const tier = world.leagues[club.leagueId]?.tier;
    const index = table ? table.findIndex((row) => row.clubId === clubId) : -1;
    return { rank: index + 1, tier };
  };
  if (league) {
    // League awards: the league's own matches, or (before complete statistics) its members.
    const members = totals
      ? leagueEntries(world, league)
      : all.filter((entry) => league.clubIds.includes(entry.player.clubId ?? ''));
    const scorers = [...members].sort(
      (a, b) =>
        b.line.goals - a.line.goals ||
        b.line.rating - a.line.rating ||
        (a.player.id < b.player.id ? -1 : 1),
    );
    if (scorers[0]?.line.goals)
      celebrate(
        world,
        addAward(world, {
          kind: 'golden-boot',
          season,
          month: null,
          competitionId: league.id,
          winnerIds: [scorers[0].player.id],
          shortlist: [],
          value: scorers[0].line.goals,
        }),
        A.fame.season,
      );
    const mvp = members
      .filter((entry) => entry.line.apps >= A.seasonMinimumApps)
      .sort((a, b) => score(b.line) - score(a.line) || (a.player.id < b.player.id ? -1 : 1));
    if (mvp[0])
      celebrate(
        world,
        addAward(world, {
          kind: 'mvp',
          season,
          month: null,
          competitionId: league.id,
          winnerIds: [mvp[0].player.id],
          shortlist: [],
          value: Math.round(score(mvp[0].line) * 10) / 10,
        }),
        A.fame.season,
      );
    const team: string[] = [];
    for (const [lineName, count] of [
      ['GK', 1],
      ['DEF', 4],
      ['MID', 3],
      ['ATT', 3],
    ] as const)
      team.push(
        ...mvp
          .filter((entry) => LINES[entry.player.primaryPosition] === lineName)
          .slice(0, count)
          .map((entry) => entry.player.id),
      );
    if (team.length === 11)
      celebrate(
        world,
        addAward(world, {
          kind: 'team-season',
          season,
          month: null,
          competitionId: league.id,
          winnerIds: team,
          shortlist: [],
          value: 0,
        }),
        A.fame.season,
      );
  }
  const nationality = world.players[career.playerId]!.nationalityId;
  const young = qualified
    .filter(
      (entry) =>
        entry.player.nationalityId === nationality &&
        season - entry.player.birthSeason <= A.youngAge,
    )
    .sort((a, b) => score(b.line) - score(a.line) || (a.player.id < b.player.id ? -1 : 1));
  if (young[0])
    celebrate(
      world,
      addAward(world, {
        kind: 'young-player',
        season,
        month: null,
        competitionId: null,
        winnerIds: [young[0].player.id],
        shortlist: [],
        value: Math.round(score(young[0].line) * 10) / 10,
      }),
      A.fame.season,
    );
  // Golden Ball: top-division players (and the career player and rival) with team success.
  const lastTournament = world.international?.tournaments.at(-1);
  const compared = new Set([career.playerId, ...world.rivalries.map((r) => r.rivalPlayerId)]);
  const ball = qualified
    .filter((entry) => {
      const club = entry.player.clubId ? world.clubs[entry.player.clubId] : undefined;
      return club && (world.leagues[club.leagueId]?.tier === 1 || compared.has(entry.player.id));
    })
    .map((entry) => {
      const clubId = entry.player.clubId!;
      const { rank, tier } = rankOf(clubId);
      let bonus =
        tier === 1 ? (rank === 1 ? A.champion : rank > 0 && rank <= 4 ? A.topFour : 0) : 0;
      for (const id of CONTINENTAL_IDS) {
        const cup = world.competitions[id];
        if (!cup) continue;
        if (cup.winnerId === clubId)
          bonus += A.continentalWinner * (id === 'continental:champions' ? 1 : 0.5);
        else if (
          cup.stages.at(-1)?.groups[0]?.length === 2 &&
          cup.stages.at(-1)!.groups[0]!.includes(clubId)
        )
          bonus += A.continentalFinal * (id === 'continental:champions' ? 1 : 0.5);
      }
      const nation = world.international?.nations.find(
        (n) => n.countryId === entry.player.nationalityId,
      );
      if (
        lastTournament &&
        lastTournament.year === season &&
        nation &&
        lastTournament.winnerId === nation.id
      )
        bonus += A.tournamentWinner;
      return {
        playerId: entry.player.id,
        clubId,
        score: Math.round((score(entry.line) + bonus) * 10) / 10,
      };
    })
    .sort((a, b) => b.score - a.score || (a.playerId < b.playerId ? -1 : 1));
  if (ball.length) {
    const award = addAward(world, {
      kind: 'golden-ball',
      season,
      month: null,
      competitionId: null,
      winnerIds: [ball[0]!.playerId],
      shortlist: ball.slice(0, A.shortlist),
      value: ball[0]!.score,
    });
    celebrate(world, award, A.fame.goldenBall);
    if (
      award.shortlist.some((entry) => entry.playerId === career.playerId) &&
      award.winnerIds[0] !== career.playerId
    )
      career.fame += A.fame.shortlist;
    postMessage(world, 'golden-ball', { season, winner: world.players[ball[0]!.playerId]!.name });
    const wins = new Map<string, number>();
    for (const entry of world.awards.filter((a) => a.kind === 'golden-ball'))
      wins.set(entry.winnerIds[0]!, (wins.get(entry.winnerIds[0]!) ?? 0) + 1);
    for (const [playerId, count] of wins) updateRecord(world, 'golden-balls', playerId, count);
  }
  // Records: most goals in a season among tracked players, and most career goals in the world.
  const topSeason = [...all].sort((a, b) => b.line.goals - a.line.goals)[0];
  if (topSeason) updateRecord(world, 'season-goals', topSeason.player.id, topSeason.line.goals);
  const topCareer = Object.values(world.players).reduce<Player | null>(
    (best, player) => (!best || player.stats.goals > best.stats.goals ? player : best),
    null,
  );
  if (topCareer) {
    const archived = Object.values(world.archive?.players ?? {}).reduce(
      (max, record) => Math.max(max, record.stats.goals),
      0,
    );
    if (topCareer.stats.goals >= archived)
      updateRecord(world, 'career-goals', topCareer.id, topCareer.stats.goals);
  }
}
