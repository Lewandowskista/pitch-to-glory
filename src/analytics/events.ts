/**
 * The event catalogue and its property allow-list (docs/ANALYTICS.md). An event may carry only
 * the properties listed here, as ids, enums, flags and bucketed numbers: never a typed name, a
 * seed, save contents or free text. The client drops anything else before sending, and
 * tests/analytics.test.ts checks every event against this list.
 */
export const EVENTS = {
  // Funnel
  landing_viewed: ['initial'],
  wizard_step: ['step', 'index'],
  world_built: ['ms'],
  career_created: ['position', 'archetype', 'nation', 'tier', 'child'],
  first_key_moment: ['situation', 'position', 'session_s'],
  match_finished: ['count', 'played'],
  season_finished: ['season_index'],
  // Balance
  key_moment: [
    'situation',
    'position',
    'choice',
    'chance',
    'success',
    'chosen_ev',
    'best_ev',
    'options',
    'minute',
  ],
  match_result: [
    'tier',
    'competition',
    'position',
    'minutes',
    'rating',
    'goals',
    'assists',
    'decisions',
    'goals_for',
    'goals_against',
    'result',
    'home',
    'sim_only',
    'played',
  ],
  level_up: ['level', 'age'],
  skill_unlocked: ['skill', 'level', 'age'],
  season_summary: [
    'season_index',
    'position',
    'age',
    'tier',
    'club_reputation',
    'level',
    'fame_band',
    'wealth_band',
    'awards',
    'hof_band',
    'apps',
    'goals',
    'assists',
    'rating',
  ],
  transfer: ['kind', 'from_tier', 'to_tier', 'age', 'fee_band'],
  retired: ['position', 'age', 'seasons', 'hof_band'],
  // Performance
  app_loaded: ['ttfb_ms', 'dcl_ms', 'load_ms', 'fcp_ms', 'idle_ms'],
  continue_timed: ['weeks', 'matchday_ms', 'saved_ms', 'outcome'],
  season_simulated: ['ms', 'weeks', 'outcome'],
  save_failed: ['kind'],
  error: ['kind', 'message'],
  // Engagement
  session_started: ['resumed'],
  session_ended: ['seconds', 'screens'],
  route_viewed: ['route'],
  press_answered: ['kind', 'answer'],
  story_resolved: ['story', 'choice'],
  sponsor_decided: ['accepted', 'category'],
  shared: ['what', 'method'],
  export_done: ['what'],
  setting_changed: ['setting'],
  consent_prompt: ['answer'],
} as const satisfies Record<string, readonly string[]>;

/** Properties every event carries, set by the client rather than the caller. */
export const COMMON_PROPERTIES = [
  'distinct_id',
  '$process_person_profile',
  '$lib',
  'app_version',
  'schema',
  'engine',
  'world_format',
  'environment',
  'device_class',
  'cores',
  'memory',
  'viewport',
  'input',
  'route',
] as const;

/** Properties whose value is scrubbed text rather than an id or enum. */
export const TEXT_PROPERTIES: readonly string[] = ['message'];

export type EventName = keyof typeof EVENTS;
export type PropertyValue = string | number | boolean;
export type EventProps<E extends EventName> = {
  [K in (typeof EVENTS)[E][number]]?: PropertyValue;
};
