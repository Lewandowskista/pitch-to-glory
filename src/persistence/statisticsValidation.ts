import { CONFIG } from '../engine/config';
import { array, id, number, object, requireValue } from './worldValidation';

/**
 * Current-season competition statistics (Phase 1.3). Lines name a competition and club that
 * play this season, bounded values and known players; each club's goals in a competition
 * equal its goals in that competition's stored results.
 */
export function validateSeasonStatistics(w: Record<string, unknown>): void {
  if (w.seasonStats === undefined) return;
  const stats = object(w.seasonStats);
  const season = Number(object(w.date).season);
  requireValue(stats.version === 1 && stats.season === season);
  const players = object(w.players);
  const archived = object(object(w.archive ?? {}).players ?? {});
  // Which clubs play in which competition this season, and the goals they scored there.
  const fixtures = object(w.fixtures);
  const results = object(w.results);
  const playing = new Set<string>();
  const scored = new Map<string, number>();
  for (const value of Object.values(fixtures)) {
    const fixture = object(value);
    if (object(fixture.date).season !== season) continue;
    const competitionId = String(fixture.competitionId);
    for (const clubId of [fixture.homeId, fixture.awayId]) {
      const key = `${competitionId}|${String(clubId)}`;
      playing.add(key);
      scored.set(key, scored.get(key) ?? 0);
    }
    const result = results[String(fixture.id)];
    if (!result) continue;
    for (const goal of array(object(result).goals)) {
      const key = `${competitionId}|${String(object(goal).teamId)}`;
      scored.set(key, (scored.get(key) ?? 0) + 1);
    }
  }
  const counted = new Map<string, number>();
  const competitions = Object.entries(object(stats.competitions));
  requireValue(competitions.length <= 5000);
  const maxGoals = CONFIG.world.maxGoals * 2;
  for (const [competitionId, clubsValue] of competitions) {
    id(competitionId);
    for (const [clubId, linesValue] of Object.entries(object(clubsValue))) {
      const key = `${competitionId}|${clubId}`;
      requireValue(playing.has(key));
      let goals = 0;
      for (const [playerId, lineValue] of Object.entries(object(linesValue))) {
        requireValue(Object.hasOwn(players, playerId) || Object.hasOwn(archived, playerId));
        const line = array(lineValue, 6);
        requireValue(line.length === 6);
        const [apps, minutes, scoredGoals, assists, cleanSheets, ratingTotal] = line as number[];
        number(apps, 1, 400, true);
        number(minutes, 0, apps! * 120, true);
        number(scoredGoals, 0, apps! * maxGoals, true);
        number(assists, 0, apps! * maxGoals, true);
        number(cleanSheets, 0, apps!, true);
        number(ratingTotal, apps! * 3 - 0.01, apps! * 10 + 0.01);
        goals += scoredGoals!;
      }
      counted.set(key, goals);
    }
  }
  // Every club's goals in every competition agree with its results.
  for (const [key, goals] of scored) requireValue((counted.get(key) ?? 0) === goals);
}
