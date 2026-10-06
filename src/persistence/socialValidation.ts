import { CONFIG } from '../engine/config';
import { MORALE_PARTS } from '../engine/career/social/rules';
import {
  array,
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

const S = CONFIG.career.social;
const CLIQUES = ['seniors', 'young', 'core', 'internationals'];
const TONES = ['team', 'confident', 'humble', 'provocative', 'deflect'];

function params(value: unknown): void {
  const entries = Object.entries(object(value));
  requireValue(entries.length <= 20);
  for (const [, entry] of entries)
    if (typeof entry === 'number') number(entry, -1e12);
    else requireValue(typeof entry === 'string' && entry.length <= 200);
}
function seasonLine(value: unknown, clubs: Record<string, unknown>): void {
  const line = object(value);
  ref(line.clubId, clubs);
  for (const key of ['appearances', 'goals', 'assists']) number(line[key], 0, 1000, true);
  number(line.rating, 0, 10);
}

/**
 * Cliques in every dressing room, and the career's social records: morale history,
 * the rivalry and the media. A world without a career has no cliques, rival or media.
 */
export function validateSocial(w: Record<string, unknown>): void {
  const clubs = object(w.clubs);
  const players = object(w.players);
  const current = object(w.date);
  const career = w.career === undefined ? null : object(w.career);
  for (const value of Object.values(object(w.dressingRooms))) {
    const room = object(value);
    const cliques = array(room.cliques, 4);
    if (!career) requireValue(cliques.length === 0);
    const roster = object(clubs[String(room.clubId)]).playerIds as string[];
    const kinds = new Set<string>();
    for (const cliqueValue of cliques) {
      const clique = object(cliqueValue);
      id(clique.id);
      options(clique.kind, CLIQUES);
      requireValue(!kinds.has(String(clique.kind)));
      kinds.add(String(clique.kind));
      const members = ids(clique.playerIds, 40);
      requireValue(members.length >= 2 && members.every((member) => roster.includes(member)));
      if (clique.leaderId !== null) requireValue(members.includes(String(clique.leaderId)));
      number(clique.affinity, 0, 100);
      number(clique.influence, 0, 100);
    }
  }
  if (!career) {
    requireValue(array(w.rivalries).length === 0 && array(w.media).length === 0);
    return;
  }
  const playerId = String(career.playerId);
  const social = object(career.social);
  for (const value of array(social.history, S.historyLimit)) {
    const point = object(value);
    number(point.season, 1800, Number(current.season), true);
    number(point.week, 1, 80, true);
    number(point.morale, 0, 100);
    number(point.form, 0, 100);
  }
  if (social.morale !== null) {
    const morale = object(social.morale);
    number(morale.target, 0, 100);
    const parts = object(morale.parts);
    requireValue(Object.keys(parts).length === MORALE_PARTS.length);
    for (const part of MORALE_PARTS) number(parts[part], -20, 20);
  }
  number(social.answered, 0, 1e6, true);
  number(social.coverage, -10, 10);

  const rivalries = array(w.rivalries, 1);
  for (const value of rivalries) {
    const rivalry = object(value);
    id(rivalry.id);
    requireValue(rivalry.careerPlayerId === playerId && rivalry.rivalPlayerId !== playerId);
    ref(rivalry.rivalPlayerId, players);
    requireValue(object(players[String(rivalry.rivalPlayerId)]).retired === false);
    number(rivalry.intensity, 0, 100, true);
    date(rivalry.started);
    const h2h = object(rivalry.headToHead);
    for (const key of ['played', 'won', 'drawn', 'lost']) number(h2h[key], 0, 10000, true);
    requireValue(h2h.played === Number(h2h.won) + Number(h2h.drawn) + Number(h2h.lost));
    for (const seasonValue of array(rivalry.seasons, 100)) {
      const season = object(seasonValue);
      number(season.season, 1800, Number(current.season), true);
      seasonLine(season.career, clubs);
      seasonLine(season.rival, clubs);
    }
    const start = object(rivalry.seasonStart);
    for (const key of ['appearances', 'goals', 'assists']) number(start[key], 0, 1e7, true);
    number(start.ratingTotal, 0, 1e8);
    number(rivalry.lastGoals, 0, 1e7, true);
    for (const entryValue of array(rivalry.timeline, S.rival.timelineLimit)) {
      const entry = object(entryValue);
      date(entry.date);
      options(entry.kind, ['started', 'transfer', 'head-to-head', 'season', 'media']);
      params(entry.params);
    }
  }

  const seen = new Set<string>();
  for (const value of array(w.media, S.media.limit)) {
    const item = object(value);
    id(item.id);
    requireValue(!seen.has(String(item.id)));
    seen.add(String(item.id));
    date(item.date);
    options(item.kind, ['press', 'interview', 'social', 'headline']);
    options(item.author, ['fan', 'journalist', 'rival', 'club', 'teammate']);
    text(item.authorName, 80);
    text(item.textKey, 60);
    params(item.params);
    number(item.sentiment, -2, 2, true);
    number(item.likes, 0, 1e9, true);
    const choices = array(item.choices, 4);
    const choiceIds = new Set<string>();
    for (const choiceValue of choices) {
      const choice = object(choiceValue);
      id(choice.id);
      choiceIds.add(String(choice.id));
      options(choice.tone, TONES);
      text(choice.labelKey, 60);
      const effects = object(choice.effects);
      for (const key of ['fame', 'trust', 'mood', 'fans', 'rival']) number(effects[key], -20, 20);
      for (const [kind, delta] of Object.entries(object(effects.cliques))) {
        options(kind, CLIQUES);
        number(delta, -20, 20);
      }
    }
    if (!choices.length) requireValue(item.answer === null && item.expires === null);
    else {
      requireValue(
        item.answer === null || item.answer === 'silence' || choiceIds.has(String(item.answer)),
      );
      date(item.expires);
    }
  }
}
