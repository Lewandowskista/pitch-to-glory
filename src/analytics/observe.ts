import type { CareerMatchRecord, DecisionChoice, Match, World } from '../model/domain';
import { useAppStore, type AppStore } from '../store';
import { readConsent } from './consent';
import { setConsentInvitation } from '.';
import type { EventName, PropertyValue } from './events';

/**
 * Events derived from what the game has already committed: store updates, world job results
 * and the finished match. The engine is never touched; this module only reads its results on the
 * main thread. Loading a save is never mistaken for play: a world that arrives with the save it
 * came from (`savedChange === change`) only becomes the new baseline.
 */
export type Capture = (event: EventName, properties: Record<string, PropertyValue>) => void;

/** A power-of-ten band: 0 for nothing, else 1, 10, 100… at or below the value. */
export const tenBand = (value: number): number =>
  value > 0 ? 10 ** Math.floor(Math.log10(value)) : 0;
/** A Hall of Fame rank as a band: top 10, 50, 100, 500, or beyond. */
export const rankBand = (rank: number): string =>
  rank <= 10
    ? 'top10'
    : rank <= 50
      ? 'top50'
      : rank <= 100
        ? 'top100'
        : rank <= 500
          ? 'top500'
          : 'other';
const round = (value: number, places = 3) => Math.round(value * 10 ** places) / 10 ** places + 0;

/** Expected goal difference of a choice, as the engine's own `expectedImpact` computes it. */
export const expectedValue = ({ probability: p, stakes: s }: DecisionChoice): number =>
  p * (s.successGoal - s.successConcede) + (1 - p) * (s.failureGoal - s.failureConcede);

function careerPlayer(world: World) {
  const career = world.career;
  const player = career ? world.players[career.playerId] : undefined;
  return career && player ? { career, player } : null;
}
const tierOf = (world: World, clubId: string | null | undefined): number | undefined => {
  const club = clubId ? world.clubs[clubId] : undefined;
  return club ? world.leagues[club.leagueId]?.tier : undefined;
};
const ageOf = (world: World, birthSeason: number) => world.date.season - birthSeason;

/** The competition a match belonged to, as a coarse kind. */
function competitionKind(world: World, id: string): string {
  const competition = world.competitions[id];
  if (!competition) return 'other';
  if (competition.kind === 'domestic') return competition.format === 'league' ? 'league' : 'cup';
  return competition.kind;
}

/** One `key_moment` per decision of the selected player in a finished match. */
export function keyMomentEvents(match: Match, position: string): Record<string, PropertyValue>[] {
  const seen = new Set<string>();
  const events: Record<string, PropertyValue>[] = [];
  for (const event of match.events) {
    const outcome = event.outcome;
    if (!outcome || seen.has(outcome.input.momentId)) continue;
    seen.add(outcome.input.momentId);
    const moment = match.keyMoments.find((entry) => entry.id === outcome.input.momentId);
    const choice = moment?.choices.find((entry) => entry.id === outcome.input.choiceId);
    if (!moment || !choice) continue;
    events.push({
      situation: moment.situationId,
      position,
      choice: choice.id,
      chance: round(outcome.probability),
      success: outcome.success,
      chosen_ev: round(expectedValue(choice)),
      best_ev: round(Math.max(...moment.choices.map(expectedValue))),
      options: moment.choices.length,
      minute: moment.minute,
    });
  }
  return events;
}

/** The career player's season, at its end. */
export function seasonSummary(world: World): Record<string, PropertyValue> | null {
  const found = careerPlayer(world);
  if (!found) return null;
  const { career, player } = found;
  const season = world.date.season;
  const matches = career.matches.filter((record) => record.season === season);
  const club = player.clubId ? world.clubs[player.clubId] : undefined;
  return {
    season_index: season - career.startSeason + 1,
    position: player.primaryPosition,
    age: ageOf(world, player.birthSeason),
    ...(club ? { club_reputation: Math.round(club.reputation / 5) * 5 } : {}),
    ...(tierOf(world, player.clubId) !== undefined ? { tier: tierOf(world, player.clubId)! } : {}),
    level: career.level,
    fame_band: career.style.fameLevel,
    wealth_band: tenBand(career.market.finances.cash),
    awards: world.awards.filter(
      (award) => award.season === season && award.winnerIds.includes(player.id),
    ).length,
    hof_band: tenBand(player.hallOfFame ?? 0),
    apps: matches.length,
    goals: matches.reduce((sum, record) => sum + record.goals, 0),
    assists: matches.reduce((sum, record) => sum + record.assists, 0),
    ...(matches.length
      ? {
          rating: round(
            matches.reduce((sum, record) => sum + record.rating, 0) / matches.length,
            1,
          ),
        }
      : {}),
  };
}

const SETTINGS = [
  'theme',
  'fontScale',
  'reducedMotion',
  'backupReminder',
  'simulationOnly',
  'audio',
] as const;

/**
 * Compare two store states and report what happened between them. `job` carries the timing of
 * world jobs across updates.
 */
export function createObserver(capture: Capture, now: () => number = Date.now) {
  let job: { type: string; start: number } | null = null;
  /** A Continue that reached its matchday and waits for the save. */
  let continuing: { start: number; weeks: number; matchday: number; outcome: string } | null = null;
  const moments = new Set<string>();
  let settingTimer: ReturnType<typeof setTimeout> | null = null;
  const changedSettings = new Set<string>();

  function finishContinue(state: AppStore, saved: boolean): void {
    if (!continuing) return;
    const { start, weeks, matchday, outcome } = continuing;
    continuing = null;
    capture('continue_timed', {
      weeks,
      matchday_ms: matchday,
      ...(saved ? { saved_ms: now() - start } : {}),
      outcome: state.saveStatus === 'error' ? 'save-error' : outcome,
    });
  }

  function jobEnded(type: string, start: number, weeks: number, state: AppStore): void {
    const ms = now() - start;
    const outcome = state.worldError ? 'error' : (state.worldNotice ?? 'none');
    if (type === 'generate' && state.worldNotice === 'generated') capture('world_built', { ms });
    else if (type === 'simulate-season') capture('season_simulated', { ms, weeks, outcome });
    else if (type === 'simulate-to-match') {
      continuing = { start, weeks, matchday: ms, outcome };
      // Checkpoints save as the job goes, so the save may already be done.
      if (!state.activeSave || state.saveStatus === 'error') finishContinue(state, false);
      else if (state.savedChange === state.change && state.saveStatus === 'saved')
        finishContinue(state, true);
    }
  }

  function matches(before: World, state: AppStore, world: World): void {
    const found = careerPlayer(world);
    const previous = before.career;
    if (!found || !previous) return;
    const { career, player } = found;
    // The history is bounded, so new records are told apart by key rather than by count.
    const key = (record: CareerMatchRecord) =>
      `${record.season}:${record.week}:${record.fixtureId}`;
    const known = new Set(previous.matches.map(key));
    const result = state.careerResult;
    const fresh = career.matches.filter((record) => !known.has(key(record)));
    for (const record of fresh) {
      const ours =
        result &&
        !result.outcome.internationalMatchId &&
        result.outcome.record.fixtureId === record.fixtureId &&
        result.outcome.record.season === record.season;
      const tier = tierOf(world, player.clubId);
      capture('match_result', {
        ...(tier !== undefined ? { tier } : {}),
        competition: competitionKind(world, record.competitionId),
        position: player.primaryPosition,
        minutes: record.minutes,
        rating: record.rating,
        goals: record.goals,
        assists: record.assists,
        ...(ours ? { decisions: keyMomentEvents(result.session.state.match, '').length } : {}),
        goals_for: record.score[0],
        goals_against: record.score[1],
        result: record.result,
        home: record.home,
        sim_only: !record.auto && state.settings.simulationOnly,
        played: !record.auto,
      });
      // The running count, which stops at the history limit (far beyond the funnel's ten).
      capture('match_finished', {
        count: career.matches.indexOf(record) + 1,
        played: !record.auto,
      });
    }
    // After a finished match, invite the player once to share their play over time.
    if (fresh.some((record) => !record.auto)) {
      const consent = readConsent();
      if (consent.anonymous && !consent.personal && !consent.prompted) setConsentInvitation(true);
    }
  }

  function career(before: World, state: AppStore, world: World): void {
    const found = careerPlayer(world);
    const previous = before.career;
    if (previous && !world.career) {
      // Retired: the career is replaced by its legacy.
      const legacy = world.legacies.find((entry) => entry.playerId === previous.playerId);
      if (legacy)
        capture('retired', {
          position: legacy.position,
          age: legacy.age,
          seasons: legacy.retiredAt.season - legacy.startSeason + 1,
          hof_band: rankBand(legacy.hallOfFame.rank),
        });
      return;
    }
    if (!found) return;
    const { career, player } = found;
    if (!previous || previous.playerId !== career.playerId) {
      if (state.worldJob?.type === 'create-career')
        capture('career_created', {
          position: player.primaryPosition,
          archetype: career.archetype,
          nation: world.countries[player.nationalityId]?.counterpart ?? 'other',
          ...(tierOf(world, player.clubId) !== undefined
            ? { tier: tierOf(world, player.clubId)! }
            : {}),
          child: career.honours.parentLegacyId !== null,
        });
      return;
    }
    const age = ageOf(world, player.birthSeason);
    matches(before, state, world);
    if (career.level > previous.level) capture('level_up', { level: career.level, age });
    for (const skill of career.skills)
      if (!previous.skills.includes(skill))
        capture('skill_unlocked', { skill, level: career.level, age });
    for (const move of career.market.moves.slice(previous.market.moves.length))
      if (['transfer', 'pre-contract', 'loan', 'loan-return'].includes(move.kind))
        capture('transfer', {
          kind: move.kind,
          ...(tierOf(world, move.fromClubId) !== undefined
            ? { from_tier: tierOf(world, move.fromClubId)! }
            : {}),
          ...(tierOf(world, move.toClubId) !== undefined
            ? { to_tier: tierOf(world, move.toClubId)! }
            : {}),
          age,
          fee_band: tenBand(move.fee),
        });
    const resolved = new Set(
      (previous.stories ?? []).filter((story) => story.status === 'resolved').map((s) => s.id),
    );
    for (const story of career.stories ?? [])
      if (story.status === 'resolved' && !resolved.has(story.id))
        capture('story_resolved', {
          story: story.kind,
          ...(story.choice ? { choice: story.choice } : {}),
        });
    if (before.phase !== 'complete' && world.phase === 'complete') {
      capture('season_finished', {
        season_index: world.date.season - career.startSeason + 1,
      });
      const summary = seasonSummary(world);
      if (summary) capture('season_summary', summary);
    }
  }

  return function observe(before: AppStore, state: AppStore): void {
    // World jobs: timings for building a world, Continue and simulating a season.
    if (!before.worldJob && state.worldJob) job = { type: state.worldJob.type, start: now() };
    if (before.worldJob && !state.worldJob && job) {
      const ended = job;
      const weeks = before.worldJob.completedWeeks;
      job = null;
      // The job's notice is set straight after it ends.
      queueMicrotask(() => jobEnded(ended.type, ended.start, weeks, useAppStore.getState()));
    }
    if (continuing && !state.worldJob) {
      if (state.saveStatus === 'error') finishContinue(state, false);
      else if (state.saveStatus === 'saved' && state.savedChange !== before.savedChange)
        finishContinue(state, true);
    }
    if (state.saveStatus === 'error' && before.saveStatus !== 'error')
      capture('save_failed', { kind: state.saveError ?? 'storage' });

    // The first key moment of a new career's first match.
    const moment = state.matchSession?.state.currentMoment;
    const world = state.world;
    if (
      moment &&
      moment !== before.matchSession?.state.currentMoment &&
      state.matchSession?.setup.fixture &&
      world?.career?.matches.length === 0 &&
      !moments.has(world.career.playerId)
    ) {
      moments.add(world.career.playerId);
      capture('first_key_moment', {
        situation: moment.situationId,
        position: world.players[world.career.playerId]?.primaryPosition ?? 'other',
        session_s: Math.round(performance.now() / 1000),
      });
    }

    // Decisions of a match the player has just finished and committed.
    const result = state.careerResult;
    if (result && result !== before.careerResult && world?.career) {
      const position = world.players[world.career.playerId]?.primaryPosition ?? 'other';
      for (const event of keyMomentEvents(result.session.state.match, position))
        capture('key_moment', event);
    }

    // A loaded save only becomes the baseline.
    const loaded = state.change === state.savedChange && state.change !== before.change;
    if (loaded) return;
    if (before.world && world && before.world !== world) career(before.world, state, world);

    if (before.settings !== state.settings)
      for (const key of SETTINGS)
        if (JSON.stringify(before.settings[key]) !== JSON.stringify(state.settings[key])) {
          // A slider reports once it has settled.
          changedSettings.add(key);
          if (settingTimer) clearTimeout(settingTimer);
          settingTimer = setTimeout(() => {
            settingTimer = null;
            for (const setting of changedSettings) capture('setting_changed', { setting });
            changedSettings.clear();
          }, 1500);
        }
  };
}

/** Report store changes for the rest of the page's life. */
export function observeStore(capture: Capture): void {
  const observe = createObserver(capture);
  useAppStore.subscribe((state, before) => {
    try {
      observe(before, state);
    } catch {
      // Analytics never breaks the game.
    }
  });
}
