import { CONFIG } from '../engine/config';
import { decodeClip } from '../engine/career/honours/clip';
import {
  array,
  avatar,
  date,
  id,
  ids,
  number,
  object,
  options,
  ref,
  requireValue,
  text,
} from './worldValidation';

const H = CONFIG.career.honours;
const LEVELS = ['U19', 'U21', 'senior'];
const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
const CHRONICLE = [
  'start',
  'debut',
  'first-goal',
  'hat-trick',
  'goal-milestone',
  'apps-milestone',
  'move',
  'injury',
  'trophy',
  'award',
  'call-up',
  'cap',
  'international-goal',
  'tournament',
  'rival',
  'fame',
  'record',
  'moment',
  'promise',
  'retirement',
];
const AWARDS = ['month', 'team-season', 'golden-boot', 'young-player', 'mvp', 'golden-ball'];
const RECORDS = ['season-goals', 'career-goals', 'golden-balls'];
const HEX = /^#[0-9a-f]{6}$/i;

function params(value: unknown): void {
  const entries = Object.entries(object(value));
  requireValue(entries.length <= 20);
  for (const [, entry] of entries)
    if (typeof entry === 'number') number(entry, -1e12);
    else requireValue(typeof entry === 'string' && entry.length <= 200);
}

/**
 * Honours: the career's international record, nations and tournaments, award baselines,
 * awards, records, legacies, the Chronicle and Moments. People named by honours may since
 * have retired into the archive.
 */
export function validateHonours(w: Record<string, unknown>): void {
  const players = object(w.players);
  const clubs = object(w.clubs);
  const archive = w.archive === undefined ? {} : object(object(w.archive).players);
  const current = object(w.date);
  const person = (value: unknown) => {
    id(value);
    requireValue(Object.hasOwn(players, String(value)) || Object.hasOwn(archive, String(value)));
  };
  const career = w.career === undefined ? null : object(w.career);
  if (career) {
    const honours = object(career.honours);
    for (const key of ['caps', 'internationalGoals']) {
      const counts = object(honours[key]);
      requireValue(Object.keys(counts).length === 3);
      LEVELS.forEach((level) => number(counts[level], 0, 10000, true));
    }
    if (honours.lastCallUp !== null) {
      const call = object(honours.lastCallUp);
      options(call.level, LEVELS);
      date(call.date);
    }
    number(honours.peakAbility, 1, 99);
    if (honours.parentLegacyId !== null)
      requireValue(
        array(w.legacies).some((legacy) => object(legacy).id === honours.parentLegacyId),
      );
  } else requireValue(array(w.callUps).length === 0);

  // Nations, international matches and tournaments.
  const nationIds = new Set<string>();
  if (w.international !== undefined) {
    const state = object(w.international);
    for (const value of array(state.nations, 40)) {
      const nation = object(value);
      id(nation.id);
      requireValue(!nationIds.has(String(nation.id)));
      nationIds.add(String(nation.id));
      if (nation.countryId !== null) ref(nation.countryId, object(w.countries));
      text(nation.name, 80);
      number(nation.rating, 1, 99);
      const colors = array(nation.colors, 2);
      requireValue(
        colors.length === 2 && colors.every((c) => typeof c === 'string' && HEX.test(c)),
      );
    }
    const matchIds = new Set<string>();
    for (const value of array(state.matches, H.international.matchLimit)) {
      const match = object(value);
      id(match.id);
      requireValue(!matchIds.has(String(match.id)));
      matchIds.add(String(match.id));
      date(match.date);
      options(match.level, LEVELS);
      options(match.kind, ['friendly', 'qualifier', 'group', 'knockout', 'final']);
      requireValue(nationIds.has(String(match.homeId)) && nationIds.has(String(match.awayId)));
      const score = array(match.score, 2);
      requireValue(score.length === 2);
      score.forEach((goals) => number(goals, 0, 40, true));
      if (match.penalties !== null)
        array(match.penalties, 2).forEach((goals) => number(goals, 0, 40, true));
      if (match.tournamentId !== null) id(match.tournamentId);
      if (match.career !== null) {
        const part = object(match.career);
        number(part.rating, 0, 10);
        number(part.goals, 0, 40, true);
        number(part.assists, 0, 40, true);
      }
    }
    for (const value of array(state.tournaments, H.international.tournamentLimit)) {
      const tournament = object(value);
      id(tournament.id);
      options(tournament.kind, ['continental', 'world']);
      text(tournament.name, 80);
      number(tournament.year, 1800, Number(current.season), true);
      const groups = array(tournament.groups, 4);
      groups.forEach((group) => ids(group, 4).forEach((key) => requireValue(nationIds.has(key))));
      requireValue(
        nationIds.has(String(tournament.winnerId)) && nationIds.has(String(tournament.runnerUpId)),
      );
      ids(tournament.matchIds, 40);
      if (tournament.career !== null) {
        const part = object(tournament.career);
        requireValue(nationIds.has(String(part.nationId)));
        options(part.stage, ['group', 'quarter', 'semi', 'final', 'winner']);
        requireValue(typeof part.inSquad === 'boolean');
      }
    }
  }
  for (const [key, value] of Object.entries(object(w.nationalTeams))) {
    const team = object(value);
    requireValue(team.id === key);
    id(key);
    ref(team.countryId, object(w.countries));
    options(team.level, LEVELS);
    ids(team.playerIds, 30).forEach(person);
  }
  for (const value of array(w.callUps, 60)) {
    const call = object(value);
    id(call.id);
    requireValue(career !== null && call.playerId === career.playerId);
    id(call.nationalTeamId);
    date(call.date);
    requireValue(typeof call.played === 'boolean');
  }

  // Award baselines, awards and records.
  if (w.awardState !== undefined) {
    const state = object(w.awardState);
    number(state.season, 1800, Number(current.season), true);
    number(state.month, 1, 20, true);
    for (const key of ['seasonStart', 'monthStart'])
      for (const [playerId, line] of Object.entries(object(state[key]))) {
        id(playerId);
        const values = array(line, 4);
        requireValue(values.length === 4);
        values.forEach((value) => number(value, 0, 1e8));
      }
  }
  const awardIds = new Set<string>();
  for (const value of array(w.awards, H.awards.maxRecords)) {
    const award = object(value);
    id(award.id);
    requireValue(!awardIds.has(String(award.id)));
    awardIds.add(String(award.id));
    options(award.kind, AWARDS);
    number(award.season, 1800, Number(current.season), true);
    if (award.month !== null) number(award.month, 1, 20, true);
    if (award.competitionId !== null) id(award.competitionId);
    const winners = ids(award.winnerIds, 11);
    requireValue(winners.length === (award.kind === 'team-season' ? 11 : 1));
    winners.forEach(person);
    for (const entryValue of array(award.shortlist, H.awards.shortlist)) {
      const entry = object(entryValue);
      person(entry.playerId);
      ref(entry.clubId, clubs);
      number(entry.score, -1000, 10000);
    }
    number(award.value, -1000, 10000);
  }
  for (const value of array(w.records, 10)) {
    const record = object(value);
    id(record.id);
    options(record.kind, RECORDS);
    person(record.playerId);
    text(record.playerName);
    number(record.value, 0, 1e7);
    date(record.date);
  }

  // Legacies.
  const legacyPlayers = new Set<string>();
  for (const value of array(w.legacies, 50)) {
    const legacy = object(value);
    id(legacy.id);
    ref(legacy.playerId, players);
    requireValue(object(players[String(legacy.playerId)]).retired === true);
    legacyPlayers.add(String(legacy.playerId));
    text(legacy.name);
    avatar(legacy.avatar);
    ref(legacy.nationalityId, object(w.countries));
    options(legacy.position, POSITIONS);
    number(legacy.startSeason, 1800, Number(current.season), true);
    date(legacy.retiredAt);
    number(legacy.age, 15, 60, true);
    ids(legacy.clubIds, 60).forEach((key) => ref(key, clubs));
    const stats = object(legacy.stats);
    for (const key of [
      'appearances',
      'goals',
      'assists',
      'cleanSheets',
      'caps',
      'internationalGoals',
    ])
      number(stats[key], 0, 1e6, true);
    ids(legacy.trophyIds, 200);
    ids(legacy.awardIds, 400);
    array(legacy.records, 3).forEach((kind) => options(kind, RECORDS));
    const fame = object(legacy.hallOfFame);
    number(fame.score, 0, 1e9, true);
    number(fame.rank, 1, 1e7, true);
    number(fame.of, 1, 1e7, true);
    requireValue(Number(fame.rank) <= Number(fame.of));
    for (const key of ['peakAbility', 'level']) number(legacy[key], 0, 99);
    number(legacy.fame, -1e6, 1e9);
    number(legacy.earnings, 0, 1e15);
    number(legacy.savings, 0, 1e15);
    ids(legacy.teammateIds, 12).forEach(id);
    if (legacy.childPlayerId !== null) person(legacy.childPlayerId);
  }

  // Chronicle and Moments.
  const momentIds = new Set<string>();
  for (const value of array(w.moments, H.moments.limit * 10)) {
    const moment = object(value);
    id(moment.id);
    requireValue(!momentIds.has(String(moment.id)));
    momentIds.add(String(moment.id));
    ref(moment.playerId, players);
    date(moment.date);
    options(moment.kind, ['winner', 'equalizer', 'wonder', 'final', 'hat-trick']);
    number(moment.minute, 1, 130, true);
    text(moment.scorerName);
    for (const side of ['home', 'away']) {
      const team = object(moment[side]);
      text(team.name);
      requireValue(typeof team.color === 'string' && HEX.test(team.color));
    }
    const score = array(moment.score, 2);
    requireValue(score.length === 2);
    score.forEach((goals) => number(goals, 0, 40, true));
    text(moment.seed, 256);
    requireValue(typeof moment.clip === 'string' && moment.clip.length <= 1200);
    try {
      decodeClip(String(moment.clip));
    } catch {
      requireValue(false);
    }
  }
  const chronicleIds = new Set<string>();
  for (const value of array(w.chronicle, H.chronicleLimit * 10)) {
    const entry = object(value);
    id(entry.id);
    requireValue(!chronicleIds.has(String(entry.id)));
    chronicleIds.add(String(entry.id));
    ref(entry.playerId, players);
    requireValue(
      (career !== null && entry.playerId === career.playerId) ||
        legacyPlayers.has(String(entry.playerId)),
    );
    date(entry.date);
    options(entry.kind, CHRONICLE);
    params(entry.params);
    if (entry.clubId !== null) ref(entry.clubId, clubs);
    if (entry.momentId !== null) id(entry.momentId);
  }
}
