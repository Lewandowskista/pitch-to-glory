import type { AmbitionId, Award, Position, Trophy, World } from '../../model/domain';
import { CONFIG } from '../config';
import { rivalOf, seasonLines } from './social/rival';

/**
 * The end-of-season review (engagement review, season milestones): how the season went for the
 * player and the club, graded, with the honours, the rival's verdict and the ambitions reached.
 * Read from the world once its season is complete and archived.
 */
const R = CONFIG.career.review;
export type SeasonGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E';
export type ClubOutcome = 'champions' | 'promoted' | 'relegated' | null;
export interface ReviewLine {
  apps: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  /** Average rating (0 without appearances). */
  rating: number;
}
export interface SeasonReview {
  season: number;
  clubId: string;
  /** The league the club finished in, its place and the table's size. */
  league: { id: string; name: string; rank: number; of: number } | null;
  outcome: ClubOutcome;
  line: ReviewLine;
  previous: ReviewLine | null;
  /** The share of the club's matches the player played (0–1). */
  share: number;
  awards: Award[];
  trophies: Trophy[];
  rival: {
    name: string;
    goals: number;
    rivalGoals: number;
    rating: number;
    rivalRating: number;
  } | null;
  ambitions: AmbitionId[];
  score: number;
  grade: SeasonGrade;
}

function lineOf(world: World, season: number): ReviewLine {
  const matches = world.career!.matches.filter((match) => match.season === season);
  return {
    apps: matches.length,
    goals: matches.reduce((sum, match) => sum + match.goals, 0),
    assists: matches.reduce((sum, match) => sum + match.assists, 0),
    cleanSheets: matches.filter((match) => match.cleanSheet).length,
    rating: matches.length
      ? Math.round((matches.reduce((sum, match) => sum + match.rating, 0) / matches.length) * 100) /
        100
      : 0,
  };
}
/** Goal involvements (or clean sheets) a match the position's reference season reaches. */
function contribution(position: Position, line: ReviewLine): number {
  const target = R.contribution[position];
  const value = ['GK', 'CB'].includes(position)
    ? line.cleanSheets
    : position === 'DM' || position === 'LB' || position === 'RB'
      ? line.cleanSheets * 0.5 + line.goals + line.assists
      : line.goals + line.assists;
  return line.apps ? Math.min(1, value / line.apps / target) : 0;
}
export function gradeFor(score: number): SeasonGrade {
  const bands = R.grades;
  return score >= bands['A+']
    ? 'A+'
    : score >= bands.A
      ? 'A'
      : score >= bands.B
        ? 'B'
        : score >= bands.C
          ? 'C'
          : score >= bands.D
            ? 'D'
            : 'E';
}

/** The review of the season just completed; null before the season ends. */
export function seasonReview(world: World): SeasonReview | null {
  const career = world.career;
  if (!career || world.phase !== 'complete') return null;
  const player = world.players[career.playerId]!;
  const clubId = player.clubId;
  if (!clubId) return null;
  const season = world.date.season;
  const summary = world.history.at(-1);
  const club = world.clubs[clubId]!;
  const table = summary?.tables[club.leagueId];
  const index = table ? table.findIndex((row) => row.clubId === clubId) : -1;
  const league =
    table && index >= 0
      ? {
          id: club.leagueId,
          name: world.leagues[club.leagueId]?.name ?? '',
          rank: index + 1,
          of: table.length,
        }
      : null;
  const movement = summary?.movements.find((entry) => entry.clubId === clubId);
  const tier = (id: string | undefined) => (id ? world.leagues[id]?.tier : undefined);
  const from = tier(movement?.fromLeagueId),
    to = tier(movement?.toLeagueId);
  const outcome: ClubOutcome =
    summary?.champions[club.leagueId] === clubId
      ? 'champions'
      : from !== undefined && to !== undefined && to < from
        ? 'promoted'
        : from !== undefined && to !== undefined && to > from
          ? 'relegated'
          : null;
  const line = lineOf(world, season);
  const earlier = career.matches.some((match) => match.season === season - 1);
  const played = Object.values(world.fixtures).filter(
    (fixture) =>
      fixture.date.season === season &&
      (fixture.homeId === clubId || fixture.awayId === clubId) &&
      world.results[fixture.id],
  ).length;
  const share = played ? Math.min(1, line.apps / played) : 0;
  const awards = world.awards.filter(
    (award) => award.season === season && award.winnerIds.includes(player.id),
  );
  const trophies = world.trophies.filter(
    (trophy) => trophy.season === season && trophy.playerIds.includes(player.id),
  );
  const lines = seasonLines(world, season);
  const rival = rivalOf(world);
  const W = R.weights;
  const raw = Math.round(
    W.playingTime * share +
      W.rating * Math.max(0, Math.min(1, (line.rating - R.ratingFloor) / R.ratingSpan)) +
      W.contribution * contribution(player.primaryPosition, line) +
      W.trophy * Math.min(1, trophies.length) +
      W.award * Math.min(2, awards.filter((award) => award.kind !== 'month').length) +
      (outcome === 'champions' || outcome === 'promoted'
        ? W.clubSuccess
        : outcome === 'relegated'
          ? -W.clubSuccess
          : 0),
  );
  const score = Math.max(0, Math.min(100, raw));
  return {
    season,
    clubId,
    league,
    outcome,
    line,
    previous: earlier ? lineOf(world, season - 1) : null,
    share,
    awards,
    trophies,
    rival:
      lines && rival
        ? {
            name: rival.name,
            goals: lines.career.goals,
            rivalGoals: lines.rival.goals,
            rating: lines.career.rating,
            rivalRating: lines.rival.rating,
          }
        : null,
    ambitions: (career.ambitions?.list ?? [])
      .filter((ambition) => ambition.achieved?.season === season)
      .map((ambition) => ambition.id),
    score,
    grade: gradeFor(score),
  };
}
