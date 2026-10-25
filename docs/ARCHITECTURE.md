# Pitch to Glory architecture

> **Current state — 25 October 2026 (release 0.9.0).** Milestones 1–10 are implemented and the
> web game is released: every push to `main` is a release that CI (typecheck, lint, unit tests,
> Playwright in Chromium, Firefox and WebKit) validates before deploying ([RELEASING.md](RELEASING.md)).
> Milestone 11 (Android) has not started; Capacitor is not installed. Since 20 October the
> [review plan](REVIEW-PLAN-2026-10-20.md) has been carried out through Phase 6, with measurements in
> [REVIEW-PROGRESS-2026-10-20.md](REVIEW-PROGRESS-2026-10-20.md) and rules in [BALANCING.md](BALANCING.md).
> Live versions ([COMPATIBILITY.md](COMPATIBILITY.md)): save schema **23**; match engine
> **match-21** only (sessions from earlier engines restart from kick-off); career development
> rules **3**; world flags `developmentVersion` 2, `selectionVersion` 1, `achievements` 1 and
> `economyVersion` 1, adopted once by older saves when they load (`engine/world/rules.ts`).
> Legacy compact worlds keep their frozen sporting rules in `engine/world/legacy.ts`.
>
> Since this document's milestone notes: the engine gained tournaments played round by round
> and qualification (`career/honours/international.ts`, `nationalMatch.ts`), weekly commitments
> (`career/commitments.ts`), lasting facts (`career/facts.ts`), the preseason
> (`career/preseason.ts`), pending decisions for Continue (`career/pending.ts`), the club
> economy (`world/economy.ts`) and window matches the player plays (`international.window`,
> opened the week before by `openWindow`, waited on by `advanceCareerWeek`). The career hub and
> Matchday load their bodies (`HubBody.tsx`, `MatchBody.tsx`) only when there is a career or a
> save to show. The sections below describe the structure; treat their
> milestone dates as history, and `src/model/domain.ts` as the source of the types.

Milestones 1–4 (including the post-milestone-3 hardening pass), 6 October 2026. The root AGENTS.md is the product authority. Assets, saves, world simulation and interactive friendly matches are implemented; later career systems remain typed contracts.

## Boundaries and folders

```text
src/
  engine/             Pure TypeScript RNG, asset recipes and world simulation
    assets/           Crest, kit and avatar recipes and geometry; colour-blind-safe kit clash check
    world/            Generation, schedules, background scores, squad lifecycle and seasons
      identities/     Real countries and towns; fictional clubs and competitions with real references
      continental.ts  Champions Cup and Shield: qualification, draw, groups and knockouts
      edits.ts        Edit mode: renames, colours, crests, reverting, export and import packs
    match/            Deterministic command engine, session types and replay validation
    career/           Career creation, progression, skills, training, injuries, fixtures and commit
      market/         Contracts, agents, scouting, offers, negotiation, loans and the weekly market
      social/         Morale, dressing room, teammates, culture fit, rival and media
      lifestyle/      Fame levels, sponsors, lifestyle items, wardrobe, celebrations and challenges
      honours/        National team, awards, retirement and legacy, Chronicle and Moments
    ageing.ts         Age curves, attribute targets and AI development
    strength.ts       Team strength model shared by background and interactive matches
    config.ts         Tunable constants; no browser dependencies
  model/              Serializable domain contracts below
  persistence/        Dexie tables, schema upgrades, validation (persistence worker only), the
                      tab's worker-backed repository, slot locks and the lazy save system
  store/              Zustand settings, gallery, world/job, match and active-save slices
  hooks/              Autosave and browser lifecycle integration
  platform/           Platform interface and web implementation
  analytics/          Consent, the event allow-list, a lazily loaded PostHog client (docs/ANALYTICS.md)
  audio/              Procedural synthesiser, rendering worker, Howler player and the facade
  ui/                 Shell, reusable controls, SVG artwork wrapper, tutorial and tooltip
  screens/            Lazy routes: menu, gallery, world, match, saves, settings
    world/            Competition views and club/squad inspector
    match/            Selection, preview, live controls, Pixi pitch and report maps
  styles/             Design tokens (Tailwind @theme), per-area component CSS partials, fonts
  i18n/               English strings and translation entry point
  assets/             Authored SVG brand and PWA icons
  workers/            Simulation and persistence workers, bounded message transport
tests/                 Vitest engine/persistence/worker tests with fake IndexedDB; the fast project, and
                       the slow project (*.slow.test.ts: statistical gates, soaks, multi-season worlds)
  support/             The shared national test world and career, built once per engine revision
e2e/                   Playwright browser journeys
docs/                  Architecture, decisions, balance and release instructions
public/                Static SVG icons and share artwork
.github/workflows/     Validation, browser tests and optional Netlify deployment
```

Dependencies point inward: UI → store/repositories/platform; store → model/engine; persistence → model/validation. Engine imports only other pure engine modules and model types, never React, Zustand, Dexie, DOM APIs or platform code. SVG output is a string produced from validated recipes, never user-provided markup.

## Domain types

These are forward-compatible contracts for every product entity, not implemented future systems. IDs are stable strings; references use IDs rather than nested objects. Values are JSON primitives, records and arrays, never Date, Map, class instances, functions or binary objects. Numeric ratings have documented constraints (attributes 1–99, relationships 0–100); boundary validators enforce constraints when each system is introduced. Dates are ISO strings for wall time and `GameDate` for simulation time. Money uses integer minor units in one fictional world currency.

```typescript
export type Id = string;
export type Hex = `#${string}`;
export type SlotId = 1 | 2 | 3;
export type GameDate = { season: number; week: number; day: number };
export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LW' | 'RW' | 'ST';
export type Foot = 'left' | 'right' | 'both';
export type Attributes = Record<
  | 'finishing'
  | 'passing'
  | 'dribbling'
  | 'firstTouch'
  | 'crossing'
  | 'heading'
  | 'tackling'
  | 'longShots'
  | 'setPieces'
  | 'pace'
  | 'acceleration'
  | 'stamina'
  | 'strength'
  | 'agility'
  | 'jumping'
  | 'vision'
  | 'composure'
  | 'positioning'
  | 'decisions'
  | 'workRate'
  | 'leadership'
  | 'aggression',
  number
>;
export type KeeperAttributes = Record<
  'handling' | 'reflexes' | 'diving' | 'oneOnOnes' | 'kicking' | 'commandOfArea' | 'aerialReach',
  number
>;
export interface HiddenAttributes {
  injuryProneness: number;
  bigMatchTemperament: number;
  consistency: number;
  professionalism: number;
  ambition: number;
  revealed: string[];
}
export interface Personality {
  ambition: number;
  loyalty: number;
  temperament: number;
  sociability: number;
}
export interface PositionFamiliarity {
  position: Position;
  familiarity: number;
}
export interface RngState {
  algorithm: 'mulberry32';
  seed: string;
  state: number;
  draws: number;
}
export interface Crest {
  shape: number;
  symbol: number;
  colors: [Hex, Hex, Hex];
}
export type KitPattern =
  'solid' | 'stripes' | 'hoops' | 'halves' | 'sash' | 'chevron' | 'pinstripe' | 'gradient';
export interface Kit {
  pattern: KitPattern;
  colors: [Hex, Hex, Hex];
  collar: number;
  trim: number;
  sponsor: number;
}
export interface ClubKits {
  home: Kit;
  away: Kit;
  third: Kit;
}
export interface Avatar {
  face: number;
  skin: number;
  hair: number;
  hairColor: number;
  facialHair: number;
  eyebrows: number;
  eyes: number;
  accessory: number;
}
export interface Stadium {
  id: Id;
  name: string;
  capacity: number;
  pitchQuality: number;
}
export interface Manager {
  id: Id;
  name: string;
  age: number;
  avatar: Avatar;
  personality: Personality;
  preferredFormation: string;
  ability: number;
  formerPlayerId: Id | null;
}
export interface ClubCulture {
  youth: number;
  winNow: number;
  fanOwned: boolean;
  discipline: number;
  attacking: number;
}
export interface Finances {
  balance: number;
  weeklyIncome: number;
  weeklyCosts: number;
  transferBudget: number;
  wageBudget: number;
}
export interface Club {
  id: Id;
  name: string;
  city: string;
  countryId: Id;
  leagueId: Id;
  crest: Crest;
  kits: ClubKits;
  stadium: Stadium;
  reputation: number;
  finances: Finances;
  youthFocus: number;
  playingStyle: string;
  culture: ClubCulture;
  managerId: Id;
  playerIds: Id[];
  dressingRoomId: Id;
  identity?: ClubIdentity;
}
export type Counterpart = 'England' | 'France' | 'Spain' | 'Germany' | 'Italy' | 'Portugal';
export type Tier = 1 | 2 | 3 | 4 | 5 | 6;
export type ClubStatus = 'professional' | 'semi-professional' | 'amateur';
export interface ClubIdentity {
  counterpart: Counterpart;
  region: string;
  latitude: number;
  longitude: number;
  status: ClubStatus;
  reserveParentId: Id | null;
}
export interface RuleSource {
  title: string;
  url: string;
  referenceSeason: string;
}
export interface LeagueZone {
  from: number;
  to: number;
  kind: 'promotion' | 'promotion-playoff' | 'relegation' | 'survival-playoff' | 'qualification';
  label: string;
}
export interface DivisionProfile {
  id: string;
  name: string;
  /** The real competition this division is modelled on (display only). */
  reference?: string;
  tier: Tier;
  groups: { id: string; name: string; region: string; size: number }[];
  status: ClubStatus;
  regularRounds: number;
  automaticPromotion: number;
  automaticRelegation: number;
  zones: LeagueZone[];
  rules: string;
  sources: RuleSource[];
}
export interface NationalProfile {
  id: string;
  version: 1;
  counterpart: Counterpart;
  referenceSeason: string;
  divisions: DivisionProfile[];
  adaptations: string[];
  sources: RuleSource[];
}
export interface LeaguePhase {
  id: Id;
  countryId: Id;
  divisionId: string;
  name: string;
  kind: 'promotion' | 'survival' | 'championship';
  sourceLeagueIds: Id[];
  clubIds: Id[];
  fixtureIds: Id[];
  standings: Standing[];
  initialPoints: Record<Id, number>;
  status: 'active' | 'complete';
}
export interface PostseasonTie {
  id: Id;
  countryId: Id;
  name: string;
  kind: 'promotion' | 'survival' | 'championship';
  sourceLeagueIds: Id[];
  targetDivisionId: string | null;
  round: number;
  clubIds: [Id, Id];
  fixtureIds: Id[];
  legs: 1 | 2;
  aggregate: [number, number];
  drawRule: 'extra-time-penalties' | 'penalties' | 'higher-rank' | 'higher-rank-after-extra-time';
  higherRankedId: Id | null;
  winnerId: Id | null;
  resolution: 'aggregate' | 'extra-time' | 'penalties' | 'higher-rank' | null;
  status: 'active' | 'complete';
  neutral?: boolean;
}
export interface Movement {
  clubId: Id;
  fromLeagueId: Id;
  toLeagueId: Id;
  reason?: 'automatic' | 'playoff' | 'regional-allocation' | 'feeder';
}
export interface NationalPyramidState {
  version: 1;
  profiles: Record<Id, NationalProfile>;
  phases: Record<Id, LeaguePhase>;
  ties: Record<Id, PostseasonTie>;
  movements: Movement[];
  stage: 'regular' | 'postseason' | 'resolved';
  completedSteps: string[];
  feederClubIds: Id[];
}
export interface Country {
  id: Id;
  name: string;
  leagueIds: Id[];
  domesticCupId: Id;
  nationalTeamIds: Id[];
  counterpart?: Counterpart;
  referenceSeason?: string;
}
export interface League {
  id: Id;
  countryId: Id;
  name: string;
  tier: Tier;
  clubIds: Id[];
  fixtureIds: Id[];
  standings: Standing[];
  promotionPlaces: number;
  relegationPlaces: number;
  divisionId?: string;
  group?: string;
  region?: string;
  status?: ClubStatus;
  rules?: string;
  zones?: LeagueZone[];
  capacity?: number;
  nextCapacity?: number;
}
export interface Standing {
  clubId: Id;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}
export interface Competition {
  id: Id;
  name: string;
  kind: 'domestic' | 'champions' | 'continental' | 'international';
  format: 'league' | 'knockout' | 'groups-knockout';
  season: number;
  stages: CompetitionStage[];
  winnerId: Id | null;
  countryId?: Id;
  divisionId?: string;
}
export interface CompetitionStage {
  id: Id;
  name: string;
  groups: Id[][];
  fixtureIds: Id[];
  byeClubIds?: Id[];
}
export interface Season {
  year: number;
  start: GameDate;
  end: GameDate;
  competitionIds: Id[];
  awardIds: Id[];
}
export interface Contract {
  id: Id;
  playerId: Id;
  clubId: Id;
  start: GameDate;
  end: GameDate;
  weeklyWage: number;
  role: 'key' | 'rotation' | 'backup' | 'youth';
  appearanceBonus: number;
  goalBonus: number;
  cleanSheetBonus: number;
  releaseClause: number | null;
  sellOnPercent: number;
  /** The club owed `sellOnPercent` of the next fee: the club that sold the player. */
  sellOnClubId?: Id;
  loyaltyBonus: number;
}
export interface PlayerStats {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  ratingTotal: number;
  trophies: Id[];
}
export interface Player {
  id: Id;
  name: string;
  birthSeason: number;
  nationalityId: Id;
  clubId: Id | null;
  squadNumber: number; // 1–99, unique per squad (schema 21, engine/world/squadNumbers.ts)
  avatar: Avatar;
  foot: Foot;
  primaryPosition: Position;
  secondaryPositions: PositionFamiliarity[];
  attributes: Attributes;
  keeperAttributes: KeeperAttributes;
  hidden: HiddenAttributes;
  potential: number;
  personality: Personality;
  contractId: Id | null;
  traits: Id[];
  fitness: number;
  fatigue: number;
  morale: number;
  form: number;
  injuryId: Id | null;
  retired: boolean;
  stats: PlayerStats;
  /** Season in which an unattached player was released; absent while under contract. */
  releasedSeason?: number;
}
/** Compact record of a retired player, kept for history after their full entity is pruned. */
export interface ArchivedPlayer {
  id: Id;
  name: string;
  birthSeason: number;
  nationalityId: Id;
  primaryPosition: Position;
  avatar: Avatar;
  retiredSeason: number;
  stats: Omit<PlayerStats, 'trophies' | 'ratingTotal'>;
}
export interface WorldArchive {
  players: Record<Id, ArchivedPlayer>;
}
/** A skill-tree node. Its id doubles as the trait id the match engine reads from `traits`. */
export interface Skill {
  id: Id;
  branch: SkillBranch;
  /** Grid position within its branch, for layout: tier 1 is the root. */
  tier: number;
  prerequisites: Id[];
  pointCost: number;
  minimumLevel: number;
  /** Small permanent attribute bonuses applied when unlocked (soft caps do not apply). */
  attributeBonuses: Partial<Attributes & KeeperAttributes>;
  /** Restricts a skill to goalkeepers or outfield players. */
  for: 'all' | 'outfield' | 'keeper';
}
export type SkillBranch =
  | 'finishing'
  | 'creativity'
  | 'dribbling'
  | 'defending'
  | 'physical'
  | 'mentality'
  | 'set-pieces'
  | 'goalkeeping';
export type TrainingGroup = 'technical' | 'physical' | 'mental' | 'goalkeeping';
/** A training focus: an attribute group, one attribute, a position to learn, or recovery. */
export type TrainingFocus =
  TrainingGroup | 'recovery' | keyof Attributes | keyof KeeperAttributes | `position:${Position}`;
export interface TrainingSession {
  focus: TrainingFocus;
  intensity: 'low' | 'normal' | 'high';
}
export interface TrainingPlan {
  sessions: TrainingSession[];
  /** Optional extra session led by the club's best teammate for that focus. */
  extra: { focus: TrainingFocus; mentorId: Id } | null;
}
export interface TrainingReport {
  season: number;
  week: number;
  /** Fractional progress added per attribute this week (whole points already applied). */
  gains: Record<string, number>;
  improved: string[];
  declined: string[];
  familiarity: { position: Position; familiarity: number } | null;
  fatigue: number;
  injuryId: Id | null;
}
export interface Injury {
  id: Id;
  playerId: Id;
  kind: string;
  started: GameDate;
  /** Whole weeks until fit again, counted down at each simulated week. */
  weeksRemaining: number;
  severity: number;
  /** Chance of aggravating the injury in each match while a rushed return is active. */
  reinjuryRisk: number;
  /** Null until the player chooses how to recover. */
  recovery: 'rehab' | 'rush' | null;
  careerThreatening: boolean;
  cause: 'training' | 'match';
}
export interface CareerMatchRecord {
  fixtureId: Id;
  season: number;
  week: number;
  competitionId: Id;
  opponentId: Id;
  home: boolean;
  /** Own goals first. */
  score: [number, number];
  result: 'win' | 'draw' | 'loss';
  /** Extra time and penalties decided after an interactive 90 minutes, if needed. */
  decided?: 'extra-time' | 'penalties';
  minutes: number;
  rating: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  xp: number;
  /** Played by the headless decision policy during season simulation. */
  auto: boolean;
}
/**
 * The career. The player is an ordinary entry in `world.players` and their club's squad;
 * this record holds progression. Unlocked skills are mirrored into `player.traits`.
 */
export interface Career {
  version: 1;
  playerId: Id;
  archetype: string;
  startSeason: number;
  level: number;
  /** Total XP earned in the career. */
  xp: number;
  attributePoints: number;
  skillPoints: number;
  skills: Id[];
  training: TrainingPlan;
  /** Fractional training progress per attribute, below one point. */
  trainingProgress: Record<string, number>;
  lastTraining: TrainingReport | null;
  injury: Injury | null;
  /** After a rushed return: chance of breaking down in each match, for a number of weeks. */
  reinjury: { risk: number; weeks: number; kind: string } | null;
  /** Cumulative fame from match reports; fame systems arrive in milestone 7. */
  fame: number;
  matches: CareerMatchRecord[];
  /** Contracts, agent, transfers and loans (milestone 5). */
  market: CareerMarket;
  /** Morale, form and media (milestone 6). */
  social: CareerSocial;
  /** Fame, wardrobe, celebrations, lifestyle and challenges (milestone 7). */
  style: CareerStyle;
  /** National team, retirement and legacy (milestone 8). */
  honours: CareerHonours;
}
export type NationalLevel = 'U19' | 'U21' | 'senior';
export interface CareerHonours {
  caps: Record<NationalLevel, number>;
  internationalGoals: Record<NationalLevel, number>;
  /** The level of the latest call-up, and when. */
  lastCallUp: { level: NationalLevel; date: GameDate } | null;
  /** Highest overall ability reached. */
  peakAbility: number;
  /** The legacy of the parent, for a career played as a former player's child. */
  parentLegacyId: Id | null;
}
export type SleeveLength = 'short' | 'long';
export interface CareerStyle {
  /** Cosmetic currency from challenges: it never buys a sporting advantage. */
  tokens: number;
  /** Cosmetics bought with tokens, won from challenges or chosen at creation. */
  owned: Id[];
  equipped: {
    boots: Id;
    socks: Id;
    armband: Id;
    sleeves: SleeveLength;
    celebration: Id | null;
  };
  /** The fame level last announced, for level-up messages. */
  fameLevel: number;
  /** Goals celebrated with the signature celebration in big matches. */
  signatureUses: number;
  assets: LifestyleAsset[];
}
export interface LifestyleAsset {
  id: Id;
  /** Catalogue item: a car, a home or an investment product. */
  itemId: Id;
  kind: 'car' | 'house' | 'investment';
  bought: GameDate;
  cost: number;
  /** Current resale value (an investment's balance). */
  value: number;
}
export interface WellbeingPoint {
  season: number;
  week: number;
  morale: number;
  form: number;
}
export type MoralePart =
  | 'results'
  | 'playingTime'
  | 'trust'
  | 'chemistry'
  | 'dressingRoom'
  | 'cultureFit'
  | 'fans'
  | 'media'
  | 'lifestyle'
  | 'situation';
export interface CareerSocial {
  /** Weekly morale and form, newest last. */
  history: WellbeingPoint[];
  /** The latest weekly morale target and what made it up. */
  morale: { target: number; parts: Record<MoralePart, number> } | null;
  /** Press conferences and interviews answered, for media standing. */
  answered: number;
  /** Sentiment of recent coverage, decaying weekly (−10 to 10). */
  coverage: number;
}
export interface Payslip {
  season: number;
  week: number;
  wage: number;
  bonuses: number;
  commission: number;
}
export interface CareerFinances {
  cash: number;
  lifetimeEarnings: number;
  agentFees: number;
  lastPay: Payslip | null;
}
export interface CareerMove {
  date: GameDate;
  kind:
    'transfer' | 'loan' | 'loan-return' | 'renewal' | 'pre-contract' | 'extension' | 'relocation';
  fromClubId: Id | null;
  toClubId: Id;
  fee: number;
  weeklyWage: number;
}
export interface CareerMarket {
  agentId: Id | null;
  /** When the agent last changed, for the change cooldown. */
  agentChanged: GameDate | null;
  /** When an agent last gave unprompted advice. */
  lastAdvice: GameDate | null;
  finances: CareerFinances;
  /** Bonuses earned since the last pay day. */
  pendingBonuses: number;
  transferRequest: GameDate | null;
  loanRequest: GameDate | null;
  /** Earliest date the player may ask for a new contract again. */
  renewalAskAfter: GameDate | null;
  /** Playing time this season against the squad role promise. */
  selection: { season: number; selected: number; dropped: number; promiseBroken: boolean };
  /** First week the player may play for their current club after a move. */
  registeredFrom: GameDate;
  moves: CareerMove[];
  /** Monotonic counter for market record ids (offers, messages, interest, loans). */
  sequence: number;
}
export interface Agent {
  id: Id;
  name: string;
  avatar: Avatar;
  /** Aggressive negotiator, well-connected, or cheap. */
  personality: 'aggressive' | 'connected' | 'economical';
  /** 1–99: how far clubs stretch in talks, and how well the agent reads their limits. */
  negotiation: number;
  /** 1–99: how many clubs hear about the client, and how far abroad. */
  network: number;
  /** Share of the client's wages, bonuses and signing-on fees. */
  commissionPercent: number;
  /** Minimum career standing the agent requires before taking on a client. */
  minimumStanding: number;
  clientIds: Id[];
}
export interface ScoutingInterest {
  id: Id;
  clubId: Id;
  playerId: Id;
  kind: 'transfer' | 'loan';
  started: GameDate;
  weeksObserved: number;
  /** 0–100. */
  confidence: number;
  stage: 'watching' | 'scouting' | 'offer';
  /** When the club last made an offer; it waits for the next window to try again. */
  lastOffer: GameDate | null;
}
/** Personal terms in a negotiation. Bonuses and the loyalty bonus follow the wage. */
export interface ContractTerms {
  weeklyWage: number;
  /** Seasons after the current one (a renewal or transfer runs to the end of the last). */
  years: number;
  role: Contract['role'];
  releaseClause: number | null;
  signingBonus: number;
}
export interface TransferOffer {
  id: Id;
  kind: 'transfer' | 'loan' | 'renewal' | 'pre-contract';
  /** The club that wants the player (the current club for a renewal). */
  clubId: Id;
  /** The club holding the player's registration when the offer was made. */
  parentClubId: Id;
  playerId: Id;
  created: GameDate;
  expires: GameDate;
  /** Fee agreed between the clubs: 0 for loans, renewals and pre-contracts. */
  fee: number;
  /** Bids made in club-to-club talks, in order. */
  bids: number[];
  releaseClauseTriggered: boolean;
  loan: { wageShare: number; purchaseOption: number | null; role: Contract['role'] } | null;
  status: 'terms' | 'agreed' | 'completed' | 'rejected' | 'declined' | 'collapsed' | 'expired';
  negotiationId: Id | null;
}
export interface Loan {
  id: Id;
  playerId: Id;
  parentClubId: Id;
  destinationClubId: Id;
  start: GameDate;
  end: GameDate;
  /** Share of the wage the destination club pays. */
  wageShare: number;
  purchaseOption: number | null;
  /** Squad role the destination club promised. */
  role: Contract['role'];
}
export interface Negotiation {
  id: Id;
  offerId: Id;
  rounds: NegotiationRound[];
  status: 'open' | 'accepted' | 'collapsed' | 'declined' | 'expired';
  /** The club's private limits. An agent's estimate is derived from them. */
  limits: {
    maxWage: number;
    bestRole: Contract['role'];
    years: [number, number];
    minimumClause: number | null;
    maxSigningBonus: number;
  };
  /** Counter-offers the club will still answer before walking away. */
  patience: number;
  /** The agent's read of the wage ceiling, when the player has an agent. */
  agentEstimate: number | null;
}
export interface NegotiationRound {
  actor: 'club' | 'player';
  date: GameDate;
  terms: ContractTerms;
  /** The club's answer to a player round, with the reasons for it. */
  response?: 'accept' | 'counter' | 'walk-away';
  reasons?: string[];
}
export interface Relationship {
  id: Id;
  sourceId: Id;
  targetId: Id;
  kind: 'manager' | 'teammate' | 'fans';
  value: number;
  history: Id[];
}
export interface SeasonLine {
  clubId: Id;
  appearances: number;
  goals: number;
  assists: number;
  /** Average match rating, 0 without appearances. */
  rating: number;
}
export interface RivalSeason {
  season: number;
  career: SeasonLine;
  rival: SeasonLine;
}
export interface RivalryEntry {
  date: GameDate;
  kind: 'started' | 'transfer' | 'head-to-head' | 'season' | 'media';
  params: Record<string, string | number>;
}
/** A player of the same generation and position whose career runs alongside the player's. */
export interface Rivalry {
  id: Id;
  careerPlayerId: Id;
  rivalPlayerId: Id;
  /** 0–100: how personal it has become. */
  intensity: number;
  started: GameDate;
  headToHead: { played: number; won: number; drawn: number; lost: number };
  seasons: RivalSeason[];
  /** The rival's lifetime statistics when the current season began. */
  seasonStart: { appearances: number; goals: number; assists: number; ratingTotal: number };
  /** The rival's goals at the end of last week, to notice new ones. */
  lastGoals: number;
  timeline: RivalryEntry[];
}
export interface DressingRoom {
  id: Id;
  clubId: Id;
  leaderIds: Id[];
  cliques: Clique[];
  mood: number;
}
export type CliqueKind = 'seniors' | 'young' | 'core' | 'internationals';
export interface Clique {
  id: Id;
  kind: CliqueKind;
  playerIds: Id[];
  leaderId: Id | null;
  /** 0–100: how the group regards the career player. */
  affinity: number;
  /** 0–100: how much the group sways the dressing room. */
  influence: number;
}
export type MediaTone = 'team' | 'confident' | 'humble' | 'provocative' | 'deflect';
export interface MediaEffects {
  fame: number;
  trust: number;
  mood: number;
  fans: number;
  rival: number;
  cliques: Partial<Record<CliqueKind, number>>;
}
export interface MediaChoice {
  id: Id;
  tone: MediaTone;
  labelKey: string;
  effects: MediaEffects;
}
export interface MediaItem {
  id: Id;
  date: GameDate;
  kind: 'press' | 'interview' | 'social' | 'headline';
  author: 'fan' | 'journalist' | 'rival' | 'club' | 'teammate';
  authorName: string;
  /** Topic of a press item, or the template of a post or headline. */
  textKey: string;
  params: Record<string, string | number>;
  /** −2 (hostile) to 2 (glowing). */
  sentiment: number;
  likes: number;
  choices: MediaChoice[];
  /** The chosen answer of a press item; 'silence' if it lapsed unanswered. */
  answer: Id | null;
  expires: GameDate | null;
}
export interface InboxMessage {
  id: Id;
  date: GameDate;
  subjectKey: string;
  bodyKey: string;
  params: Record<string, string | number>;
  read: boolean;
  actionId: Id | null;
}
export type SponsorCategory = 'boots' | 'apparel' | 'drinks' | 'watches' | 'cars' | 'tech';
export interface SponsorObligation {
  kind: 'starts' | 'goals' | 'clean-sheets' | 'press' | 'rating' | 'boots' | 'image';
  /** A count, an average rating, or a minimum fan affection for 'image'. */
  target: number;
}
export interface Sponsorship {
  id: Id;
  brandId: Id;
  category: SponsorCategory;
  status: 'offered' | 'active' | 'completed' | 'ended' | 'declined' | 'expired';
  offered: GameDate;
  expires: GameDate;
  start: GameDate | null;
  /** The deal runs to the end of this season. */
  endSeason: number;
  weeklyFee: number;
  /** Paid when every obligation is met at the end. */
  bonus: number;
  obligations: SponsorObligation[];
  /** Career counters when the deal started, to measure obligations. */
  baseline: { matches: number; answered: number } | null;
}
export type ChallengeKind =
  'play' | 'goals' | 'assists' | 'wins' | 'rating' | 'clean-sheets' | 'press' | 'weeks' | 'xp';
export interface Challenge {
  id: Id;
  cadence: 'daily' | 'weekly';
  /** The real-world day (YYYY-MM-DD) or ISO week (YYYY-Www) it belongs to. */
  period: string;
  kind: ChallengeKind;
  target: number;
  /** The career counter when the challenge was issued. */
  baseline: number;
  rewardTokens: number;
  rewardCosmeticId: Id | null;
  claimed: boolean;
}
/** A nation's squad for one level, as last selected. */
export interface NationalTeam {
  id: Id;
  countryId: Id;
  level: NationalLevel;
  playerIds: Id[];
}
export interface CallUp {
  id: Id;
  playerId: Id;
  nationalTeamId: Id;
  date: GameDate;
  /** Whether the player took the field in the window. */
  played: boolean;
}
/** A national side: one of the world's countries, or a guest nation with a fixed rating. */
export interface Nation {
  id: Id;
  /** The world country, for the six simulated nations. */
  countryId: Id | null;
  name: string;
  rating: number;
  colors: [Hex, Hex];
}
export interface InternationalMatch {
  id: Id;
  date: GameDate;
  level: NationalLevel;
  kind: 'friendly' | 'qualifier' | 'group' | 'knockout' | 'final';
  tournamentId: Id | null;
  homeId: Id;
  awayId: Id;
  score: [number, number];
  penalties: [number, number] | null;
  /** The career player's part, when they played. */
  career: { rating: number; goals: number; assists: number } | null;
}
export interface Tournament {
  id: Id;
  kind: 'continental' | 'world';
  name: string;
  year: number;
  /** Groups of four nation ids. */
  groups: Id[][];
  matchIds: Id[];
  winnerId: Id;
  runnerUpId: Id;
  /** How far the career player's nation went, and whether they were in the squad. */
  career: {
    nationId: Id;
    stage: 'group' | 'quarter' | 'semi' | 'final' | 'winner';
    inSquad: boolean;
  } | null;
}
export type AwardKind =
  'month' | 'team-season' | 'golden-boot' | 'young-player' | 'mvp' | 'golden-ball';
export interface Award {
  id: Id;
  kind: AwardKind;
  season: number;
  /** Month of the season (1–12) for player of the month. */
  month: number | null;
  /** The league the award covers; null for the Golden Ball and young player of the year. */
  competitionId: Id | null;
  winnerIds: Id[];
  /** Golden Ball ranking, best first. */
  shortlist: { playerId: Id; clubId: Id; score: number }[];
  /** The winning value: goals for the golden boot, otherwise the score. */
  value: number;
}
export interface Trophy {
  id: Id;
  /** A league, cup, or (for a multi-phase division) its deciding phase or final. */
  competitionId: Id;
  season: number;
  clubId: Id;
  /** The career player(s) eligible when the title was decided. */
  playerIds: Id[];
  /** The title's name when decided (Phase 1.4). */
  name?: string;
}
export type RecordKind = 'season-goals' | 'career-goals' | 'golden-balls';
export interface RecordEntry {
  id: Id;
  kind: RecordKind;
  playerId: Id;
  playerName: string;
  value: number;
  date: GameDate;
}
export interface Legacy {
  id: Id;
  playerId: Id;
  name: string;
  avatar: Avatar;
  nationalityId: Id;
  position: Position;
  startSeason: number;
  retiredAt: GameDate;
  age: number;
  /** Clubs played for, in order. */
  clubIds: Id[];
  stats: {
    appearances: number;
    goals: number;
    assists: number;
    cleanSheets: number;
    caps: number;
    internationalGoals: number;
  };
  trophyIds: Id[];
  awardIds: Id[];
  records: RecordKind[];
  hallOfFame: { score: number; rank: number; of: number };
  peakAbility: number;
  fame: number;
  level: number;
  earnings: number;
  savings: number;
  teammateIds: Id[];
  childPlayerId: Id | null;
}
export type ChronicleKind =
  | 'start'
  | 'debut'
  | 'first-goal'
  | 'hat-trick'
  | 'goal-milestone'
  | 'apps-milestone'
  | 'move'
  | 'injury'
  | 'trophy'
  | 'award'
  | 'call-up'
  | 'cap'
  | 'international-goal'
  | 'tournament'
  | 'rival'
  | 'fame'
  | 'record'
  | 'moment'
  | 'retirement';
export interface ChronicleEntry {
  id: Id;
  playerId: Id;
  date: GameDate;
  kind: ChronicleKind;
  params: Record<string, string | number>;
  clubId: Id | null;
  momentId: Id | null;
}
export interface Point {
  x: number;
  y: number;
}
export interface ReplayFrame {
  timeMs: number;
  ball: Point;
  players: { id: Id; point: Point; animation: string }[];
}
/** A memorable play, stored as a compact clip that can be replayed and shared as a link. */
export interface Moment {
  id: Id;
  playerId: Id;
  date: GameDate;
  kind: 'winner' | 'equalizer' | 'wonder' | 'final' | 'hat-trick';
  minute: number;
  scorerName: string;
  home: { name: string; color: Hex };
  away: { name: string; color: Hex };
  score: [number, number];
  /** The match seed the clip was cut from. */
  seed: string;
  /** Encoded keyframes (see engine/career/honours/moments.ts). */
  clip: string;
}
export interface Fixture {
  id: Id;
  competitionId: Id;
  date: GameDate;
  homeId: Id;
  awayId: Id;
  matchId: Id | null;
  phaseId?: Id;
  tieId?: Id;
  neutral?: boolean;
}
export interface Lineup {
  teamId: Id;
  formation: string;
  starterIds: Id[];
  benchIds: Id[];
}
export interface Tactics {
  role: string;
  risk: 'low' | 'balanced' | 'high';
  mentality: 'defensive' | 'balanced' | 'attacking';
}
export interface Objective {
  id: Id;
  kind: 'goals' | 'assists' | 'passing' | 'clean-sheet' | 'rating';
  target: number;
  progress: number;
}
export interface ProbabilityFactor {
  labelKey: string;
  source: 'attribute' | 'trait' | 'defender' | 'fatigue';
  contribution: number;
}
export interface DecisionChoice {
  id: Id;
  labelKey: string;
  probability: number;
  factors: ProbabilityFactor[];
  requiredTraitId: Id | null;
  /** Trait that improves this choice (exact id), whether or not the player owns it. */
  traitId: Id | null;
  /** Governing attribute names, strongest first. */
  attributes: string[];
  /** Conditional goal probabilities after success/failure, for the selected team (goal) and
   * the opposition (concede). A direct shot has `successGoal = 1`; a direct save `failureConcede = 1`. */
  stakes: {
    successGoal: number;
    successConcede: number;
    failureGoal: number;
    failureConcede: number;
  };
}
export interface KeyMoment {
  id: Id;
  minute: number;
  situationId: Id;
  situationKey: string;
  frame: ReplayFrame;
  /** Expected goals this moment replaces for the selected team and against it. */
  budget: { for: number; against: number };
  choices: DecisionChoice[];
}
export interface DecisionInput {
  momentId: Id;
  choiceId: Id;
}
export interface DecisionOutcome {
  input: DecisionInput;
  success: boolean;
  roll: number;
  probability: number;
  factors: ProbabilityFactor[];
}
export interface MatchEvent {
  id: Id;
  minute: number;
  kind:
    'goal' | 'pass' | 'shot' | 'save' | 'dribble' | 'tackle' | 'card' | 'substitution' | 'halftime';
  playerId: Id | null;
  teamId: Id;
  point: Point;
  endPoint?: Point;
  commentaryKey: string;
  /** Names and values substituted into the commentary template. */
  commentaryParams?: Record<string, string>;
  /** On goal events: the selected player, when their key-moment choice created the goal. */
  assistId?: Id;
  outcome: DecisionOutcome | null;
}
export interface MatchReport {
  playerId: Id;
  rating: number;
  ratingFactors: ProbabilityFactor[];
  xp: number;
  fameDelta: number;
  heatmap: Point[];
  passes: { from: Point; to: Point; success: boolean }[];
  shots: { from: Point; to: Point; goal: boolean }[];
  objectives: Objective[];
  headlineId: Id;
}
export interface Match {
  id: Id;
  fixtureId: Id;
  seed: string;
  rng: RngState;
  home: Lineup;
  away: Lineup;
  weather: 'clear' | 'rain' | 'snow' | 'wind';
  pitchCondition: number;
  instructionsKey: string;
  tactics: Tactics;
  objectives: Objective[];
  minute: number;
  score: [number, number];
  momentum: number;
  status: 'preview' | 'live' | 'decision' | 'halftime' | 'finished';
  events: MatchEvent[];
  keyMoments: KeyMoment[];
  reports: MatchReport[];
}
export interface GameEvent {
  id: Id;
  date: GameDate;
  kind:
    | 'debut'
    | 'first-goal'
    | 'transfer'
    | 'injury'
    | 'trophy'
    | 'rivalry'
    | 'retirement'
    | 'youth-intake'
    | 'manager-change'
    | 'release'
    | 'signing'
    | 'loan'
    | 'contract';
  entityIds: Id[];
  params: Record<string, string | number>;
}
export interface World {
  format?: 'legacy' | 'national-v1';
  /** 2: potential is peak overall ability and development follows age curves. */
  developmentVersion?: 2;
  /**
   * 2: real countries and towns, with fictional clubs and competitions referencing real ones.
   * Absent for worlds generated with fictional countries, which keep their identities.
   */
  identityVersion?: 2;
  /** The player's career, when this world hosts one (milestone 4). */
  career?: Career;
  pyramid?: NationalPyramidState;
  id: Id;
  seed: string;
  rng: RngState;
  date: GameDate;
  season: Season;
  countries: Record<Id, Country>;
  leagues: Record<Id, League>;
  clubs: Record<Id, Club>;
  managers: Record<Id, Manager>;
  players: Record<Id, Player>;
  contracts: Record<Id, Contract>;
  competitions: Record<Id, Competition>;
  fixtures: Record<Id, Fixture>;
  matches: Record<Id, Match>;
  agents: Record<Id, Agent>;
  scouting: ScoutingInterest[];
  offers: TransferOffer[];
  loans: Loan[];
  negotiations: Record<Id, Negotiation>;
  relationships: Relationship[];
  rivalries: Rivalry[];
  dressingRooms: Record<Id, DressingRoom>;
  media: MediaItem[];
  inbox: InboxMessage[];
  sponsorships: Sponsorship[];
  challenges: Challenge[];
  nationalTeams: Record<Id, NationalTeam>;
  callUps: CallUp[];
  awards: Award[];
  trophies: Trophy[];
  records: RecordEntry[];
  legacies: Legacy[];
  chronicle: ChronicleEntry[];
  moments: Moment[];
  events: GameEvent[];
  phase: 'active' | 'complete';
  results: Record<Id, BackgroundResult>;
  history: SeasonSummary[];
  /** Retired people pruned from the live graph. Absent in worlds saved before schema 6. */
  archive?: WorldArchive;
  /** International football (milestone 8): nations, matches and tournaments. */
  international?: InternationalState;
  /** Season statistics baselines for awards (milestone 8). */
  awardState?: AwardState;
  /** This season's statistics by competition and club (Phase 1.3, schema 14). */
  seasonStats?: SeasonStatistics;
  /**
   * This season's cards by competition and the bans still to serve by scope (the discipline
   * phase; optional, schema 21 unchanged). See BALANCING.md, "Discipline and suspensions".
   */
  discipline?: DisciplineState;
  /** Edit mode changes (milestone 9), with the original values for reverting and export. */
  edits?: WorldEdits;
}
/** Appearances, minutes, goals, assists, clean sheets and rating total. */
export type CompetitionLine = [number, number, number, number, number, number];
export interface SeasonStatistics {
  version: 1;
  season: number;
  /** Competition → club → player → line. A loan or transfer starts a new club line. */
  competitions: Record<Id, Record<Id, Record<Id, CompetitionLine>>>;
}
/** A club changed in edit mode. Only the edited fields are set. */
export interface ClubEdit {
  name?: string;
  /** Club colours, applied to the crest and to all three kits. */
  colors?: [Hex, Hex, Hex];
  /** A regenerated crest's shape and symbol. */
  crest?: { shape: number; symbol: number };
  original: { name: string; crest: Crest; kits: ClubKits };
}
export interface NameEdit {
  name: string;
  original: string;
}
export interface WorldEdits {
  clubs: Record<Id, ClubEdit>;
  leagues: Record<Id, NameEdit>;
  players: Record<Id, NameEdit>;
}
/** Lifetime appearances, goals, assists and rating total at a baseline. */
export type StatLine = [number, number, number, number];
export interface AwardState {
  season: number;
  /** Baselines at the start of the season, for players awards can consider. */
  seasonStart: Record<Id, StatLine>;
  month: number;
  monthStart: Record<Id, StatLine>;
}
export interface InternationalState {
  nations: Nation[];
  matches: InternationalMatch[];
  tournaments: Tournament[];
}
export interface BackgroundResult {
  fixtureId: Id;
  score: [number, number];
  winnerId: Id | null;
  penalties: [number, number] | null;
  goals: { playerId: Id; teamId: Id; minute: number }[];
  extraTime?: [number, number];
}
export interface SeasonSummary {
  season: number;
  tables: Record<Id, Standing[]>;
  champions: Record<Id, Id>;
  cupWinners: Record<Id, Id>;
  movements: Movement[];
  /** Champions of Portugal's qualifying-group divisions, from the deciding phase or final. */
  divisionChampions?: Record<string, { competitionId: Id; clubId: Id }>;
  phases?: Record<Id, LeaguePhase>;
  ties?: Record<Id, PostseasonTie>;
}
export interface Settings {
  theme: 'system' | 'light' | 'dark';
  fontScale: number;
  reducedMotion: boolean;
  backupReminder: boolean;
  simulationOnly: boolean;
  /** Audio (milestone 9): volumes 0–1 per channel, and a master mute. */
  audio: AudioSettings;
  /** Tutorial tracks already completed or skipped on this device (milestone 9). */
  tutorial: { week: boolean; match: boolean };
}
export interface AudioSettings {
  muted: boolean;
  master: number;
  effects: number;
  crowd: number;
}
export interface GalleryState {
  seed: string;
  generation: number;
}
export interface FoundationState {
  kind: 'foundation';
  gallery: GalleryState;
  settings: Settings;
}
export interface WorldState {
  kind: 'world';
  gallery: GalleryState;
  settings: Settings;
  world: World;
  matchSession?: import('../engine/match/types').MatchSession;
}
export type SavePayload = FoundationState | WorldState;
export interface SaveFile {
  format: 'pitch-to-glory';
  schemaVersion: 14;
  engineVersion: string;
  slot: SlotId;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  payload: SavePayload;
}
export interface SaveV1 {
  format: 'pitch-to-glory';
  schemaVersion: 1;
  slot: SlotId;
  name: string;
  createdAt: string;
  updatedAt: string;
  seed: string;
}
export interface SlotSummary {
  slot: SlotId;
  name: string;
  updatedAt: string;
  kind: SavePayload['kind'];
  revision: number;
}
```

Save payloads are validated `FoundationState` or `WorldState`; a career travels inside the world as `World.career` (see the career section below).

## Engine, store, UI and worker interaction

New worlds use `format: 'national-v1'` and immutable version-one counterpart profiles. Missing format retains the original compact world. The national engine separates regular league groups, Portuguese round-robin phases and knockout playoff ties; each stores fixture IDs and resolved sporting state. Country modules select entrants and movement, while shared schedule, ranking, feeder and movement modules preserve deterministic JSON checkpoints. Regional groups have current capacity and, where German regulations make it conditional, next-season capacity. History archives tables, phases, ties and actual movement before rollover clears live postseason state.

The national calendar has 60 abstract weeks; the legacy calendar has 34. Workers derive duration from the world's season rather than a uniform constant. UI selectors derive available tiers, regional groups, phases and auxiliary cups from the saved world, keeping URL state separate from engine rules. Import validation reconstructs every live table and aggregate from results, checks profile identity, calendar coverage, phase bonuses, progress prerequisites and capacity conservation, then checks archive references before storage. No browser dependency enters these simulation modules.

The engine receives explicit data and an explicit RNG. `mulberry32` hashes text seeds once, exposes draws and serializable state, and can resume a sequence exactly. Asset generators use scoped seeds so changing gallery counts cannot alter a career simulation stream. Recipes persist; SVG strings are derived at render time. Age is a renderer input so a player's identity remains consistent over time.

Zustand uses settings, gallery, world/job and session slices. Components select small slices. Ordinary edits debounce autosave; a world job's checkpoints are written as it runs (see "World worker, checkpoints and crash safety"). A world snapshot includes its current gallery/preferences; a foundation collection excludes world data. Writes are serialized and atomic. Failed writes remain dirty and surface recovery actions instead of reporting success.

The module worker runs the same pure generation/simulation functions as Vitest. RNG state travels inside `World`. `simulateWeek` and `startNextSeason` return a copy by default; the worker passes `{ inPlace: true }` because it owns its world: each checkpoint is encoded to bytes before the next week changes it, and a job that fails part-way drops the world it may have half-changed.

The squad lifecycle (`engine/world/lifecycle.ts`) runs at the intake week and transfer windows for clubs in simulated leagues: age-curve retirement, contract renewal or release, academy intake, trimming, and free-agent signings with generated trialists as a last resort. Clubs below the simulated frontier are dormant and reused for later feeder admissions. At rollover, retired players move to `World.archive`, events older than the previous season are dropped and unemployed managers are removed, which keeps the world bounded (see BALANCING.md). A season job writes a checkpoint after every week and runs at most `workers.maxUncommittedWeeks` weeks ahead of storage. Save failure halts further simulation and publishes the simulated world as unsaved (dirty), so autosave retries it. Cancellation stops the worker at the end of the week in hand, with that week committed, and publishes it. Generation replaces the in-memory world through a guarded handoff, detaching its previous slot without overwriting it. Busy jobs block save-slot mutation. UI animation timing never controls randomness. An unfinished friendly prevents advancing or replacing its source world.

Worker transport breaks a world object into bounded entity batches and yields while sending (the tab's whole-world sync to the world worker, a load from the persistence worker). Inside a world it splits again any record wider than `workers.transportWideKeys` keys, or a small record holding one (archived players, season statistics, discipline records, archived seasons' tables), so no single message carries megabytes. Receivers assemble an unpublished snapshot and expose it only after the end marker; cancellation cannot publish a partial world. A message without a world (a match session, patches, a request, world bytes) goes as one structured clone, with world bytes moved rather than copied (finding P7: a finished session was 30,046 patches in 941 messages).

A persistent persistence worker performs save validation, migrations, JSON parsing/formatting and IndexedDB reads/writes. Write receipts carry normalized envelope/preferences without repeating the world or the match session, and the UI retains its immutable submitted snapshot. Imports and loads always undergo complete validation; the app's own world writes do not (below). Ownership and expected revision are checked inside the original atomic IndexedDB transaction. Cancelling simulation never terminates an in-flight persistence operation. The main thread never opens IndexedDB or loads Dexie or the validators: `WorkerSaveRepository` (`persistence/browserRepository.ts`) only sends requests (`persistence/protocol.ts`), and Node tests use the local `SaveRepository` (`persistence/repository.ts`). After each committed change the worker announces the database on the `pitch-to-glory:saves` BroadcastChannel; `saves.watch` re-lists the slots on that announcement, from any tab, and after this tab's own changes, which keeps the Saves screen current as Dexie's `liveQuery` did.

### World worker, checkpoints and crash safety (release 1.0 Phase 3)

One world worker lives as long as the loaded save (`workers/host.ts` on the tab, `workers/hostCore.ts` in the worker, messages in `workers/protocol.ts`). It holds its own copy of the world between jobs. Every world it holds carries a token the tab chose; the tab remembers which of its world objects that token stands for (`base`).

```text
UI action ──(new world, structural sharing)──▶ store.world
   │                                              │
   │ autosave: diffWorld(stored, store.world)      │ job: diffWorld(base, store.world)
   ▼                                              ▼
persistence worker ◀── patches (small) ──  tab ── patch | whole world once ──▶ world worker
   ▲                                       ▲  ▲                                  │ simulate a week
   │ bytes moved, not parsed               │  └── result: world bytes, once ────┤ encode JSON bytes
   └──────────── write-world ──────────────┘◀──── checkpoint bytes, each week ───┘ (≤ 2 uncommitted)
```

- **Sending the world (3.2).** A job on the same object the worker holds sends nothing. After UI changes it sends only `diffWorld(base, world)`: UI actions copy what they change and share the rest (`tests/action-immutability.test.ts`), so the diff visits only the change and costs about a millisecond. A newly loaded save, a crashed worker or a diff over `workers.maxSyncPatches` sends the whole world once, in bounded batches; after a load this happens when the browser is idle, so the first Continue does not wait for it. Loading another save stops the worker (freeing its memory) and the next one starts fresh. Measured choice: a patch for a press answer or purchase is a few hundred bytes, while the whole late world costs the UI thread about 0.2 s of batches and the worker 0.6 s to rebuild; and after a week about 76% of the world's bytes have changed (13,600 of 29,000 players), so the worker publishes the whole world rather than a diff.
- **Checkpoints (3.3).** For a saved world the worker encodes each changed world once as UTF-8 JSON (`workers/worldCodec.ts`: exactly `JSON.stringify(world)`, written entry by entry, with the byte range of each part). A copy of the bytes goes to the tab as a checkpoint; the tab moves it (no copy, no parse) to the persistence worker's `write-world`, in the autosave queue so writes never interleave, and acknowledges it to the worker. The worker runs at most `workers.maxUncommittedWeeks` (2) checkpoints ahead of storage, waits otherwise, and stops when one is refused. The persistence worker stores the bytes as they are (`worlds` record `{ slot, bytes }`; records from before 1.0 hold a `world` object and still read). The tab relays rather than the two workers sharing a `MessageChannel`: relaying a moved buffer costs the UI thread under a millisecond, and keeps one owner for the persistence worker's lifecycle, watchdog and revision chain, so a restarted persistence worker never leaves a dangling port.
- **Publishing (3.3).** At the end of a job the worker publishes its world once: the last checkpoint's bytes, moved to the tab, which decodes them part by part in slices of `workers.decodeSliceMs` (`decodeWorld`). The store takes the decoded world when the job's last checkpoint has committed (`publishWorld`), together with the slot's new revision, so the screen ends on the committed world and "All changes saved" is true when shown; per week the tab receives only progress. A job whose world did not change publishes nothing.
- **Small changes (3.4).** A UI change to a saved world is written as patches (`workers/worldPatch.ts`) appended to the slot's index record (`worldPatches`), beside the stored world, when the tab knows the stored world exactly (`session.ts`, `stored`: set by a load of a current-schema save, a whole write or a published checkpoint, at the slot's revision). A read applies them in order before validation; the next whole write clears them. Over `saves.maxWorldPatches` or `saves.maxPatchBytes`, or when the stored world is not known exactly (a migrated save, a write in doubt), the world is written whole through the world worker. Patches that no longer apply or validate are dropped on load with the `changes-discarded` notice, never the save.
- **Crash safety.** A committed checkpoint is never lost: each is one IndexedDB transaction under the lease and revision checks. When the world worker stops during a job (a crash, or no answer within 30 s of a cancel), the tab waits for checkpoints in flight; if any committed, it loads the slot's last committed week from storage, otherwise its own world is still the latest. The worker never runs more than two uncommitted weeks ahead, and those are simulated again from the committed week, deterministically, so no week is lost or simulated twice in the save (`tests/worker-client.test.ts` compares the result with an uninterrupted simulation). An unsaved world keeps the world it had when the job started. A job that fails part-way makes the worker drop its world; the tab sends its own copy to the next job.
- **Validation (3.1).** The app's own whole-world writes (checkpoints, autosave, save to a slot) skip `validateWorld`: the engine made the world, the bytes are never parsed by the persistence worker, and the next load or import validates everything, with the recovery export behind it. What a write still checks: the slot, preferences, the bytes' bounds, the summary and session shapes, and inside its transaction the lease, the expected revision and that a checkpoint never replaces another world. `migrateSave` must leave a current-schema world unchanged, as patches rely on it.
- **Persistence watchdog (S9, from Phase 4.5).** The persistence worker answers every request, `ok: false` on any failure, even one while sending its reply. A request without an answer in `saves.requestTimeoutMs` (leases: `saves.leaseTimeoutMs`) restarts the worker and fails with `storage`; a write that fails so is in doubt (`PersistenceInterrupted`). If the next write to the slot then meets a conflict, the tab checks the stored revision: one past the lost write's means it committed (the slot is the tab's, under its lock), so the write goes on from there, whole, instead of reporting a false conflict.

```typescript
type HostRequest =
  | { type: 'sync'; token: number; world: World }
  | { type: 'patch'; from: number; token: number; patches: WorldPatch[] }
  | {
      type: 'job';
      requestId: Id;
      job: JobSpec;
      token: number | null;
      resultToken: number;
      checkpoints: boolean;
    }
  | { type: 'committed' | 'commit-failed'; requestId: Id; checkpoint: number }
  | { type: 'cancel'; requestId: Id }
  | { type: 'encode'; requestId: Id; token: number }
  | { type: 'drop' };
type HostResponse =
  | { type: 'synced' | 'sync-failed'; token: number }
  | { type: 'progress'; requestId: Id; completedWeeks: number; totalWeeks: number }
  | {
      type: 'checkpoint';
      requestId: Id;
      checkpoint: number;
      worldId: string;
      summary: WorldSummary;
      bytes: Uint8Array;
    }
  | {
      type: 'result';
      requestId: Id;
      end: 'done' | 'cancelled' | 'stopped';
      world: { bytes: Uint8Array; parts: WorldPart[]; token: number } | null;
      checkpoints: number;
      checkpointed: boolean; /* … */
    }
  | { type: 'encoded'; requestId: Id; worldId: string; summary: WorldSummary; bytes: Uint8Array }
  | { type: 'error'; requestId: Id; code: 'busy' | 'stale' | 'simulation' };
```

Measured on the 78.6 MB late save with `e2e/performance.spec.ts` (Apple M1 Pro, 25 October 2026; "exact" is timed inside the page, the polled figures include Playwright's polling interval):

| Metric                                                                        | Before Phase 3                            | After 3.1–3.5                                                       | 1.0 target      |
| ----------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | --------------- |
| One-week Continue, desktop, to the matchday                                   | 1.71 s exact (2.19 s polled)              | 1.44 s exact (2.11 s polled)                                        | ≤ 1.2 s         |
| One-week Continue, desktop, to saved                                          | 3.29 s exact (3.67 s polled)              | 1.44 s exact (2.12 s polled)                                        | ≤ 2 s           |
| One-week Continue, phone profile, to saved (workers scaled ×4)                | 17.4 s                                    | 6.7 s                                                               | ≤ 5 s           |
| Rest of the season (27 weeks), desktop, until saved                           | 84 s (3.1 s a week, about 187 s a season) | 23.6 s (0.87 s a week, about 52 s a season)                         | ≤ 75 s a season |
| Longest main-thread task during Continue, desktop / phone                     | 75–102 ms / 305–330 ms                    | 87 ms / 344 ms                                                      | ≤ 200 ms        |
| Peak heap across threads during Continue, desktop / phone                     | 667–773 MB / 557–579 MB                   | 404–455 MB / 327 MB                                                 | ≤ 400 MB        |
| First hub load of a day until its challenge refresh is saved, desktop / phone | 3.69 s / 7.44 s                           | 2.35 s / 4.22 s (both include a 0.6 s wait past the autosave delay) | —               |

The one-week Continue's remaining time is the simulation itself (about 0.7 s of the worker's 1.1 s; step 3.8 caches the engine's hot spots), the encoding (0.33 s) and the UI thread's decoding (0.35 s). The phone's longest task is the hub's re-render after the new world, as before (step 3.10).

## Persistence and tab ownership

Database and file schema versions are independent. DB v1 holds slots; v2 adds revision indexing; v3 migrates collections and supports worlds; v4 admits versioned national pyramids; v6 splits each slot into a metadata record (`saves`), the world graph (`worlds`) and the match session (`matches`). Database upgrades never validate: v1–v5 records migrate lazily on read, and the v6 upgrade only moves data, leaving malformed records untouched so one damaged slot cannot abort the upgrade. File schema v6 adds optional archive, release-season, event-kind and match-engine-version fields; v7 adds the optional career and development version; v8 adds the optional identity version and division references; v9 gives each career its market record, the agent pool and club relationships; v10 adds the social records (rival, cliques, teammates, media, morale history); v11 adds the career style record, sponsorships and challenges; v12 adds honours; v13 admits optional edits, audio and tutorial settings; v14 adds optional current-season competition statistics (`World.seasonStats`), which validation bounds and checks against every current-season result (each club's goals per competition). Earlier files migrate unchanged; a world without statistics keeps its earlier award mode until its next season.

File schema v15–v22 added optional fields (see the comments in `src/persistence/schema.ts`). Releases 0.4.0 to 0.9.1 then added further optional fields under v22, so v23 changes nothing stored and marks the shape from which `npm run check:save-shape` holds every persisted-shape change to a schema bump ([RELEASING.md](RELEASING.md), "Save schema"): it hashes the types reachable from `SaveFile` with the TypeScript compiler API and compares them with `src/persistence/saveShape.json`. Real files exported by past releases (`tests/fixtures/saves`, made by `scripts/make-golden-save.ts`) are imported, played on and round-tripped by `tests/golden-saves.test.ts`.

Reads assemble and fully validate one slot, applying its stored patches first. A world that fails validation rejects the save; an attached match session that is from another match-engine version, fails replay or no longer matches the world is discarded with a `match-discarded` recovery notice while the world is kept. Imports stay strict; the app's own world writes are checked for shape, ownership and revision only (step 3.1, above). National profiles are compared by rule fingerprint for their profile version, so corrected citations or descriptions never invalidate saves. The slot list reads metadata only and reports `ready`, `empty` or `error` per slot. Writes that leave the world graph unchanged (match checkpoints, preferences) update metadata and the session without transferring, validating or storing the world. Timestamps never run backwards: every write stores the later of the device time and the slot's `createdAt`, and a read treats an `updatedAt` before `createdAt` (from a device clock that ran behind, before 0.9.1) as `createdAt` instead of rejecting the save; imports from a device whose clock ran ahead are stamped the same way. Backups are compact JSON. File v1 → v2 adds settings/gallery/engine version/revision; v2 → v3 preserves those values and adds the world payload capability; v3 → v4 preserves each existing world and its rules without regeneration. Import checks the 128 MiB limit, format/version/timestamps/slot/settings and every implemented world entity. World validation checks bounded values, rosters, foreign keys, fixture pair/calendar coverage, tables reconstructed from results, cup progression and archive structure before a transaction. Malformed/future files never replace valid saves. Web Locks are preferred; transactional heartbeat leases provide a fallback. The native lock is held by the tab (`SlotLocks`, `persistence/locks.ts`); the lease record lives in IndexedDB and is written by the persistence worker on the tab's behalf (`lease-acquire`, `lease-release`, `persistence/leaseLock.ts`). Lease requests skip the worker's save queue and the chunked transport in both directions, so a heartbeat never waits behind a large world, and every write still checks the lease inside its own transaction. Revision checks prevent stale writes even after ownership loss. Cancelled generation reacquires a retained session's slot after cleanup, or reports a lock/storage error. Switching slots and unload release ownership; crashed fallback leases expire.

Only three slot IDs are accepted at every repository boundary. Export uses JSON downloads. A **recovery export** reads a slot's `saves`, `worlds` and `matches` records in a read-only transaction in the persistence worker and downloads them, reassembled into the backup envelope but neither migrated nor validated, as `pitch-to-glory-slot-<n>-recovery-<date>.json`; it is offered on unreadable slots, in their delete and replace confirmations and when a load or export fails validation, and never writes. When the in-memory session fails validation, "Export unsaved copy" falls back to the same unchecked envelope around the snapshot. Import uses a labelled native file input. Delete and replacement use URL-backed confirmation dialogs so back/Esc cancels. Browser storage persistence is requested only from a user action explaining that it reduces eviction; export remains available because persistence is not a backup.

## Platform contract

```typescript
interface PlatformAdapter {
  /** Device preferences: the settings, or another device-only record (`'analytics'`); null removes. */
  readPreferences(scope?: 'settings' | 'analytics'): unknown;
  writePreferences(value: unknown, scope?: 'settings' | 'analytics'): boolean;
  /** POST a JSON body (analytics); resolves whether it was accepted and never rejects. */
  send(url: string, body: string, hiding?: boolean): Promise<boolean>;
  saveFile(name: string, content: string | Blob, mime: string): Promise<void>;
  shareFile(name: string, content: string | Blob, mime: string): Promise<void>;
  /** Share a link through the system share sheet, or copy it; reports which happened. */
  shareLink(url: string, title: string): Promise<'shared' | 'copied' | 'failed'>;
  readFile(file: File): Promise<string>;
  requestPersistentStorage(): Promise<boolean>;
  isStoragePersistent(): Promise<boolean>;
  haptic(kind: 'selection' | 'success'): Promise<void>;
  onBack(handler: () => void): () => void;
  wakeLock(): Promise<() => Promise<void>>;
  notify(title: string, body: string): Promise<boolean>;
}
```

The web adapter owns download/share fallback, file size limits, storage persistence, optional vibration, popstate, wake lock, optional notifications and analytics delivery (`fetch` with `keepalive`, handing a failed request to `sendBeacon` while the page is hidden). Analytics consent and the tier-2 install id live under the `analytics` preference scope (`ptg-analytics` on the web), never in `Settings` or a save.

Analytics (`src/analytics/`, [ANALYTICS.md](ANALYTICS.md)) adds a few hundred bytes to the shell: `track()` queues events in memory, and `startAnalytics()` imports the client when the browser is idle after load. The client checks consent and the per-event allow-list, adds the common properties and sends batches through `platform.send`. A separately loaded observer derives play events from store updates, world job results and the finished match on the main thread; the engine is never involved. Without a build-time key, or under automation, nothing loads. Unsupported capabilities return a documented benign result. No feature requests notification permission automatically. Android/Capacitor is intentionally absent until the final milestone.

## UI, accessibility and delivery

Real URLs: `/`, `/gallery`, `/world`, `/match`, `/saves`, `/settings`. World query parameters retain country, tier, club, player and competition view. A `save` parameter reacquires/restores a world slot and its optional match on refresh; unsaved worlds prompt before unload. Desktop uses a sidebar and side-by-side competition/club inspector or pitch/commentary/stats; narrow layouts retain all data with an optional horizontally scrolling full table. Controls have labels, visible focus, keyboard operation and 44px targets. Settings follow system theme/motion and support 85–130% scaling; loaded saves restore preferences.

Career navigation (`src/screens/career/navigation.ts`) groups the career pages into five sections: Overview, Player, Club, Life and History. The desktop sidebar lists the sections under Career; phones show Overview, Player, Club, Life and More in the bottom bar, where More is a URL-backed dialog (`?more=1`, closed by Back or Escape) holding History, Matchday, World, Clubhouse and the utilities. Every career page opens with its section's page tabs, placed above the heading and outside the page entrance animation so they never move between pages. Section labels live in `src/i18n/navigation.ts` so the shell does not pull career strings into the entry bundle.

The career agenda (`src/screens/career/agenda.ts`) derives everything the hub and the Calendar page (`/career/calendar`) show from the saved world, with no new stored state: the priority queue (a recovery choice, then the match, then deadlines by date, then unspent points), the season week by week, what Continue will simulate and which deadlines would lapse on the way, and a digest of the simulated weeks. The hub writes the week an advance started to the URL (`since`), so the digest survives a refresh; nothing predicts selection or results.

English UI strings live in the copy modules under `src/i18n/` (the shell's `en.ts`, and one module per area, split by route for bundle size), served through the locale seam (Localization, below); generated names and recipe identifiers are data. CSS tokens define theme colors, spacing, radii, fonts and shadows, and are exposed to Tailwind utilities through `@theme inline`. New UI uses utilities; screens built before milestone 4 keep their component CSS partials until reworked. Fonts are bundled locally from licensed font packages. Route and reward transitions honour reduced motion.

Vite PWA precaches route chunks, both workers, SVG icons and fonts after one connected visit. Updates flush autosave before activation. Netlify preserves deep-link refresh. CI runs types, lint, Vitest, build and Chromium/Firefox/WebKit tests; deployment requires configured secrets. Nothing has been deployed by these milestones.

## Localization

The game ships in English, and every string, number, date and plural goes through one seam, `src/i18n/locale.ts` (release 1.0 plan, step 2.6), so adding a language is translation work rather than a code change on every screen.

**The registry.** `LOCALES` lists each language with its BCP 47 formatting tag (English formats as `en-GB`, as the game always has), its currency template (`{amount} Cr`) and its ordinal suffixes. `LOCALE` is the active language. Each copy module keeps its English table and serves it through the registry, typed by that table:

```ts
const careerTextEn = { … };
export const careerText = ({ en: careerTextEn } satisfies Translations<typeof careerTextEn>)[LOCALE];
```

`Translations<T>` requires a table for every language in `LOCALES`, each of type `Translation<T>`: the English shape with its strings widened to `string` (so `as const` literals do not bind a translation), its tuples and functions kept. The shell's `t` (`src/i18n/index.ts`) is served the same way from `en`. Imports did not change: screens still import `careerText` or `t`, and each copy module stays its own file, so the per-route copy split (the bundle budget) is untouched. The registry is an object literal indexed by a constant rather than a function call on purpose: Rollup sees through it to the English table, so a route that imports a copy module without reading it still leaves it out. A call, even one marked pure, made every route with a rating badge load the whole career copy (about 13 KB gzip). Where one English table reuses another's words (career's `common.level` is the kit's), it reads the other module's English table (`kitTextEn`); a translation reuses its own. The seam cost 0.4 KB gzip in the entry (106.7 → 107.1 KB) and at most 0.8 KB on any route's static load (MatchBody 242.0 → 242.8 KB); the hub's usable load grew 1.4 KB (287.9 → 289.3 KB, 67 files) because the preseason copy now has its own chunk, which in turn took 25 KB off the Preseason page (221.1 → 196.3 KB static), no longer tied to the market screens through `honoursUi.ordinal`.

**Helpers.** Screens never build a formatter or pick a word form themselves:

| Helper                                          | Use                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `format(template, params)`                      | Fill `{name}` placeholders (re-exported from `src/i18n/index.ts`).                                                         |
| `plural(count, forms, params?)`                 | Pick the form for `count` with `Intl.PluralRules` and fill `{count}` and `params`. `pluralForm` returns the unfilled form. |
| `plurals({ one, other, … })`                    | Declare a copy entry as plural forms (CLDR categories `zero`, `one`, `two`, `few`, `many`, `other`; `other` required).     |
| `ordinal(n)`                                    | "1st", "22nd", from the language's ordinal rules.                                                                          |
| `formatNumber(n, options?)`, `formatInteger(n)` | Grouped numbers ("12,500"); options as `Intl.NumberFormat`'s.                                                              |
| `formatMoney(amount)`                           | Credits, rounded: "12,500 Cr".                                                                                             |
| `formatDate(value, options?)`                   | Real-world dates and times (release dates). Game dates use `formatGameDate` in `i18n/calendar.ts`.                         |
| `formatList(items, type?)`                      | Names in running text: "A and B", "A, B and C".                                                                            |

Formatters are cached per option set. The ESLint rule in `eslint.config.js` rejects a literal locale (`'en'`, `` `en` ``, `['en-GB']`) passed to an `Intl` constructor or a `toLocale…String` call anywhere but `locale.ts`, in `src`, `tests`, `e2e` and `scripts`. The save slots' timestamp deliberately keeps the browser's own date format (`Intl.DateTimeFormat(undefined, …)`).

**Writing copy.** A count's wording is a `plurals` entry, never a `xOne`/`x` pair chosen with `=== 1`; keep `{count}` in a form when the layout draws the count apart (`pluralForm` splits around it). A sentence is one template with placeholders, never pieces joined in code: the Continue preview, the wage hint in talks, the report maps' labels and tallies, the morale chart label, the hub description with the recovery prompt and the offer buttons' accessible names were rewritten this way. `tests/locale.test.ts` pins representative English output of the helpers and templates against the code they replaced.

**What remains for a translation** (none of it changes English output):

- Clause placeholders: some templates take a phrase another template produced, such as the wage hint's `{wage}` and `{agent}` clauses or the Continue preview's `{action}`, a priority label lower-cased with `lowerFirst`. A language whose grammar needs to inflect those phrases would need whole-sentence variants.
- Lists and labels joined in code with `·`, `, ` or `→` (fixture and club metadata, attribute lists, the training plan's ` · mentor session`, the Gallery colours label) and value pairs such as `{cols.ga} 2/1 · {cols.xp} +40` on the profile's match history.
- Two-count labels without plural forms (`Pass map: {attempts} attempts, {completed} completed`, `{seconds} seconds of play`) read "1 attempts" at a count of one; they need a form per count or a rewording.
- Tournament and season names built as `{name} {year}`, and the award name with its month in brackets (`honoursUi.tsx`).
- The patch notes (`i18n/patchNotes.ts`) stay English, like the CHANGELOG they generate; game dates use abbreviated English month and weekday names from `i18n/calendar.ts`.

**Adding a language:**

1. Add it to `LOCALES` in `locale.ts` with its formatting tag, currency template and ordinal forms. The build now fails in every copy module until it provides the new table.
2. Write each module's table beside the English one (or in a sibling file the module imports) and add it to the module's registry object: `{ en: careerTextEn, es: careerTextEs }`. Plural entries may use the categories the language needs.
3. Choose the language before the copy modules evaluate: make `LOCALE` read the player's setting (stored with the preferences) and reload the page when it changes. Once `LOCALE` is no longer a constant, every language's copy ships in each module's chunk, and the registry lookups can no longer be resolved at build time; check `scripts/check-bundle.mjs` and, if the cost matters, build one bundle per language with `LOCALE` defined at build time.
4. Translate the strings that are not copy modules: `index.html`'s title and share tags, the web app manifest, and the release notes if wanted.

## Bundle budget

`scripts/check-bundle.mjs` runs with `npm run build` and gives every route in `src/App.tsx` (plus the match body, `MatchBody`) two figures, both with a hard budget of 300 KB gzip and a warning from 285 KB (a GitHub annotation in CI):

- **Static**: the shell (entry) and the route chunk with their static imports, the code needed before the route can render.
- **Usable**: static plus the dynamic imports the shell and the route request during their first render and initial effects, for a returning player opening the address with a save, each with its own static imports. The shell always requests Framer Motion's features and the service-worker registration; routes that read a save request the save system (`persistence/api.ts`); career pages draw the shell portrait; the hub requests its body and ambitions card; the match body requests the pitch component. These are declared per route (`FIRST_RENDER`) and checked against the build manifest: each must be a dynamic import of code already in the route's set, so a refactor that drops or renames one fails the build until the list is updated. The Pixi renderer is excluded: the pitch requests it once the match screen is up. The workers a usable route starts (the persistence worker) are reported beside it and not budgeted. `node scripts/check-bundle.mjs --list <route>` prints a route's files.

The method was checked against Chromium: a cold load of `/career?save=1` (HTTP cache cleared, service worker blocked, the `populated` performance fixture) fetched the same 66 main-thread files, 288.0 KB, as the hub's usable set, and 72 files, 408.3 KB, before step 2.8, again equal to the usable set computed for that build. The build also fails if Dexie appears in a main-thread chunk, if Pixi's WebGPU or canvas renderer is built, or if Pixi's environment bundles are precached.

Release 1.0 step 2.8 (25 October 2026), gzip KB:

| Route            | Static before | Static after | Usable before | Usable after |
| ---------------- | ------------: | -----------: | ------------: | -----------: |
| Menu             |         130.2 |        130.4 |         300.3 |        162.5 |
| Gallery          |         125.1 |        125.3 |         144.1 |        144.3 |
| Saves            |         109.0 |        108.8 |         299.8 |        161.5 |
| Settings         |         114.9 |        115.0 |         133.9 |        134.0 |
| World            |         165.9 |        165.0 |         325.5 |        194.6 |
| EditMode         |         171.2 |        171.3 |         333.9 |        198.1 |
| Match (no world) |         122.5 |        120.7 |         141.5 |        139.7 |
| MatchBody        |         299.9 |        242.0 |         395.7 |        272.2 |
| CareerNew        |         208.3 |        207.0 |         339.0 |        231.3 |
| CareerHub        |         160.0 |        160.4 |         408.3 |        288.0 |
| CareerProfile    |         176.6 |        175.9 |         339.6 |        202.6 |
| CareerSkills     |         191.3 |        190.0 |         349.1 |        214.9 |
| CareerTraining   |         201.0 |        200.0 |         345.5 |        222.8 |
| CareerTransfers  |         224.9 |        223.6 |         363.3 |        246.4 |
| CareerAgent      |         198.1 |        198.5 |         348.2 |        221.8 |
| CareerInbox      |         219.0 |        217.9 |         362.7 |        240.7 |
| CareerCalendar   |         224.5 |        223.4 |         368.2 |        246.2 |
| CareerClub       |         220.4 |        220.3 |         357.6 |        243.7 |
| CareerMedia      |         210.6 |        210.4 |         351.9 |        233.8 |
| CareerRival      |         210.5 |        210.4 |         351.9 |        233.7 |
| CareerLifestyle  |         214.3 |        214.7 |         360.9 |        235.6 |
| CareerWardrobe   |         217.4 |        217.9 |         363.9 |        238.6 |
| CareerNational   |         218.1 |        217.0 |         362.3 |        240.3 |
| CareerPreseason  |         222.3 |        221.1 |         366.0 |        244.0 |
| CareerTrophies   |         230.3 |        228.7 |         366.4 |        250.1 |
| CareerChronicle  |         219.4 |        218.3 |         362.0 |        241.7 |
| CareerMoments    |         218.6 |        217.5 |         361.2 |        240.8 |
| CareerLegacy     |         222.9 |        221.9 |         365.6 |        245.2 |
| MomentViewer     |         124.6 |        124.6 |         143.6 |        143.6 |
| WhatsNew         |         117.1 |        117.2 |         136.1 |        136.2 |
| Privacy          |         109.5 |        109.7 |         128.5 |        128.6 |

The entry stays at 106.7 KB gzip (311.9 KB). A cold hub load fetched 73 JavaScript files, 547.6 KB (72 main-thread files, 408.3 KB, and the 139.3 KB persistence worker) before, and 67 files, 427.7 KB (66 main-thread files, 288.0 KB, and the 139.7 KB worker) after. The precache fell from 163 entries (3,763 KiB) to 160 (3,450 KiB). The hub's usable figure is the one above the warning; it is the next route to trim.

What moved: the match screen builds its setup from `engine/career/matchSetup.ts` instead of the commit path, so it no longer bundles the world simulation, the name catalogues or the squad-number backfill; the report's headlines and reactions (`i18n/matchReport.ts`) and its heat, pass and shot maps travel with the lazily loaded report (`match/pitchKit.tsx` keeps the kit colours and markings the live pitch needs); the live match takes the celebration names and squad-role names from small i18n modules; the guided tour and its copy load only while a track is unfinished (`ui/TutorialLoader.tsx`); the save system's main-thread half is a worker client (Persistence and tab ownership); and the pitch starts Pixi's `WebGLRenderer` directly with `manageImports: false` (`pitchScene.ts`), so Pixi's WebGPU and canvas renderers are not built and its unused environment bundles are left out of the precache.

## Verification

Tests cover foundation reproducibility, save migrations/round trips/ownership, world generation, schedule/table conservation, cups, weekly AI changes, JSON resume and promotion rollover. Match tests replay complete sessions, validate conserved statistics and simulate 10,000 matches for goals/home advantage/upsets. Worker tests cover acknowledgement ordering, failures and cancellation during startup/yield/lock cleanup. Browser flows exercise real workers, world backup/import/restoration, full-season rollover, match decisions/refresh/report, large-text layouts and offline resources. Builds enforce the bundle budget for every route (see Bundle budget) and reject eager Pixi loading, Dexie on the main thread and unused Pixi renderers. Tutorial and audio retain their later milestone scope.

Team selection (`src/engine/selection/`): `formations.ts` catalogues the four formations' slots (position, line, role and shape point); `lineup.ts` picks a club's eleven for a formation, valuing each player in a slot by ability and positional fit; `world.ts` applies it per world (`selectionVersion`) for background results, career selection, club level and the dressing room, and match setups carry both managers' formations. Match motion takes shape and set-piece roles from the slots. Coaching (`src/engine/career/coaching.ts`) keeps the latest key decisions from each recorded match in `career.coaching`, derives advice and a season goal offer each time they are shown, and stores only an accepted goal and past results.

Story arcs (`src/engine/career/stories/`): `promise.ts` runs the manager's development promise as a state machine stored in `career.social.promises` (offered, active, achieved, missed, cancelled; one a season, id `promise:<season>`). Its weekly step runs at the end of the social week; every effect (inbox message, manager trust, Chronicle entry) happens once, on a transition, so reprocessing or reloading never repeats it.

Long careers are checked by `scripts/soak-career.ts`, which plays seeded national careers headlessly through the same engine entry points as the UI and, at every season end, runs `careerInvariants` (`src/engine/career/invariants.ts`: single fixture commits, non-negative cash, statistics against match records, completed competitions, unique trophies, surviving Chronicle/Moment/legacy references and Hall of Fame order), exports, re-imports and continues from the imported world. `scripts/performance-fixtures.ts` saves real play states for `e2e/performance.spec.ts` and the populated Lighthouse audit; `e2e/update.spec.ts` replaces one build with another under a saved career. Nothing in the shipped game exists for these checks.

## Interactive match sessions

The pure match engine exposes createMatchSetup, createMatchSession, applyMatchCommand and validateMatchSession. Its supplementary contracts are kept in src/engine/match/types.ts:

```typescript
import type {
  Club,
  Player,
  Match,
  MatchReport,
  KeyMoment,
  ReplayFrame,
  Tactics,
} from '../../model/domain';
export type { Tactics } from '../../model/domain';
export interface MatchSetup {
  version: 1;
  seed: string;
  season: number;
  home: Club;
  away: Club;
  players: Record<string, Player>;
  selectedPlayerId: string;
  neutral: boolean;
}
export type MatchCommand =
  | { type: 'kickoff' }
  | { type: 'advance' }
  | { type: 'choose'; choiceId: string }
  | { type: 'halftime'; response: 'motivate' | 'role' | 'complain' }
  | { type: 'substitution'; response: 'accept' | 'encourage' }
  | { type: 'captain'; instruction: 'push' | 'calm' };
export interface LiveStats {
  homeShots: number;
  awayShots: number;
  homePossession: number;
  passesAttempted: number;
  passesCompleted: number;
  tackles: number;
  saves: number;
  goals: number;
  assists: number;
  rating: number;
  fatigue: number;
}
export interface MatchState {
  match: Match;
  currentMoment: KeyMoment | null;
  frames: ReplayFrame[];
  selectedPlayerMinutes: number;
  substituted: boolean;
  substitutionDecisionPending: boolean;
  captain: boolean;
  captainDecisionPending: boolean;
  expectedGoals: [number, number];
  stats: LiveStats;
  report: MatchReport | null;
  momentMinutes: number[];
  managerTrustDelta: number;
  managerReactionKey: string;
  fanReactionKey: string;
  headlineKey: string;
}
export interface MatchSession {
  version: 1;
  setup: MatchSetup;
  initialTactics: Tactics;
  commands: MatchCommand[];
  state: MatchState;
}
```

The match slice stores an immutable session. Browser timeouts dispatch compact advance commands after the displayed passage can finish; decision, half-time, substitution and captain prompts require explicit commands. Skip uses the same transitions in a bounded loop. A session stores its initial tactics, seed, frozen squads and complete command log, so refresh and import replay exactly. UI playback speed and Pixi interpolation are presentation state, never sporting state. Visibility loss and open dialogs pause playback. A friendly's source world remains frozen until it finishes or is cleared; its report does not alter scheduled competition results.

The lazy Pitch route imports PixiJS only when rendered. The engine supplies each passage of play as keyframes (`state.motion`, see `engine/match/motion.ts`); a ticker plays them with `screens/match/playback.ts`. Live minutes use a base rate of 18 sporting seconds per real second and a 2.2-second progression interval; decision build-ups and outcomes use a slower rate of 6 with a 4.2-second cap. Action-specific minimum durations keep quick shots and passes visible before the overall cap compresses the passage. Player runs use time-aware monotone Hermite interpolation, preventing overshoot at stops and treating restarts as discontinuities. The renderer draws the ball beside its carrier, adds short flight trails, lofted shadows and arrival cues, and starts a goal celebration once the ball reaches the net. New passages start from the positions and carrier on screen. Pause and visibility loss freeze the animation clock. `pitchArt.ts` shares geometry and kit-number contrast with the SVG fallback; labels are rasterized at 32 pixels and scaled down rather than enlarged from tiny text. ResizeObserver adjusts canvas and stage scale; cleanup handles asynchronous initialization, unmount and context loss. The SVG fallback animates with the same sampler through `useSvgPlayback`, with reduced motion showing the final frame. Simulation-only presentation renders commentary and decisions without constructing the pitch. Reports use SVG to visualize actual recorded positions, passes and shots.

A key moment is `screens/match/DecisionPanel.tsx`, rendered once: beside the pitch (top of the right column) from 951 px wide, after the pitch on narrower screens, where it opens with a cropped `SvgPitch` drawing of the moment. Focus moves to the first choice with `preventScroll`, and the screen then scrolls the pitch and decision (or, on phones, the decision) into view. The guided tour places action steps inline (`data-tour-slot`) on phones and keeps its floating card off the focused control elsewhere; the update/offline notice waits while a key moment is open.

File schema v5 added optional WorldState.matchSession; v6 versions it by match engine. Match state is validated by finite bounded setup checks, legal commands and exact deterministic replay; its team/player snapshots must match the saved world. A slot stores a session as its setup, opening tactics and commands plus a little derived progress (`persistence/matchRecord.ts`, release 1.0 step 3.5), about the size of the setup, never the state (which grew from 64 to 342 KB by full time). For minute checkpoints the browser sends that, with preferences, world id and expected revision, as one message; the persistence worker checks its shape (no replay), ownership, revision, world id and season, and writes only the metadata and `matches` records atomically. A load or an import replays it to the full session and validates it as before; a session stored whole by an earlier release reads as it is. The world graph is neither transferred nor rewritten. Full-time explicitly flushes autosave before displaying the saved indicator.

## Career player (milestone 4)

`World.career` holds the progression record; the player is a normal entry in `world.players`. Key modules:

- `engine/career/catalogue.ts`: archetypes and the 49-skill tree.
- `engine/career/create.ts`: trial offers and career creation.
- `engine/career/progression.ts`: XP and levels, soft-cap costs, attribute allocation, skills. UI actions return a new world that copies only the career record and the career player.
- `engine/career/training.ts`: the weekly career step (training, injuries, recovery, ageing decline, hidden reveals) and the recovery choice.
- `engine/career/fixtures.ts`: pending and next fixtures, fixture kind and importance.
- `engine/career/matches.ts`: match setup for a fixture, the commit path, and the headless auto-play policy.
- `engine/career/season.ts`: one week with career fixtures stopped or auto-played.

Weekly flow:

1. The world worker calls `advanceCareerWeek`.
2. If the career player's club has an unplayed fixture this week and the player is fit, the job ends with `pendingFixtureId` (notice `matchday`). With auto-play, the worker plays and commits that fixture first.
3. The UI creates a session from `careerMatchSetup` and the player plays it.
4. At full time the UI starts a `commit-match` job. The worker commits the result and the career progress, and returns the world plus the outcome (XP, level-ups, injury).
5. The store replaces the world (clearing the session) and keeps `careerResult` in memory for the report.

`simulateWeek` refuses a week with a pending career fixture, so the background resolver can never play the career player's match. A committed fixture already has a result, which the resolver skips.

**Finalized fixtures (Phase 1.2).** `engine/world/finalize.ts` decides every fixture once, background or played, as a pure `FinalizedFixture`: final and regulation score, extra time, penalties, the deciding method, each goal with its scorer and assister, and every participant's regulation minutes, extra-time minutes, goals, assists and rating. `applyFinalizedFixture` stores the result, player statistics and table from that object alone, and `commitPlayedFixture` returns it to `commitCareerMatch`, which derives the career record, contract bonuses, fame, objectives and XP from the career player's participant entry. The report shows `CareerMatchOutcome.final`. The interactive session stays the unmodified regulation replay; simulated extra time appears as a summary and creates no Moments, because only recorded keyframes do. A fixture with a result cannot be committed again, so a commit retried after a save round trip is rejected before any reward.

```typescript
// Worker request additions
| { type: 'simulate-to-match'; world: World }
| { type: 'simulate-season'; world: World; autoPlay: boolean }
| { type: 'commit-match'; world: World; session: MatchSession }
| { type: 'create-career'; world: World; seed: string; draft: CareerDraft; clubId: Id }
// Responses: 'result' may carry `outcome: CareerMatchOutcome`; 'complete' carries `pendingFixtureId`.
```

Validation (`persistence/careerValidation.ts`) checks every career field against the world:

- level equals `levelForXp(xp)`;
- points are within what the levels earned;
- skills exist and have their prerequisites, and the player's traits equal the skills;
- training foci are valid for the player's position;
- the injury and the player's `injuryId` agree;
- the match history is bounded.

AI players cannot carry injuries.

## World identities

`engine/world/identities/` holds one `CountryIdentity` per country, in `NATIONAL_PROFILES` order:

- division and group display names, each with its real `reference`;
- the domestic cup, and Italy's tier cup;
- referenced clubs per tier (`ReferencedClub`: name, reference, city, coordinates, region, colours, kit pattern, stadium, capacity, stature, optional `reserveOf`);
- real towns per region;
- `groupRegions`, which lists the regions each generated group draws towns from.

Generation for a national world:

1. `identityProfile` copies the sporting profile with display names, references and the adaptation note. Rules and region keys are untouched, so `profileRuleFingerprint` does not change.
2. A referenced club fills each slot in a referenced tier, in data order. Every other slot gets a real town from `TownPicker`, which shuffles each region by seed and never repeats a town or a referenced club's city.
3. Reserve links come from `reserveOf`. Lower-tier reserves are still converted from generated clubs.
4. Feeder clubs (`feeder.ts`) use `TownPicker` with `usedTowns(world, countryId)` when `world.identityVersion === 2`, and the older fictional pool otherwise.

The UI never reads identity data directly; it reads names and references from the saved world and profile. `scripts/check-identity.ts` validates a country's data during authoring.

## Career market (milestone 5)

`engine/career/market/` is pure and runs unchanged in the world worker and on the main thread:

- `rules.ts`: transfer windows, market value, wages by role, the role a club can promise (`deservedRole`), matchday selection (`careerSelection`), standing with agents and recent form.
- `records.ts`: record ids, the inbox, relationships with managers and fans, and the move history.
- `agents.ts`: the seeded agent pool and `attachMarket` (also used by the schema 9 migration). It keeps a compact name list so the migration does not pull the name catalogues into the shell bundle.
- `offers.ts`: club-to-club bids (asking price, release clause), loan, pre-contract, renewal and purchase-option offers, the club's private limits, counter-offers and expiry.
- `moves.ts`: transfers, loans, loan returns, renewals and the club option, plus pay days and match bonuses.
- `week.ts`: `marketWeek` (after the week's fixtures and training) and `marketRollover` (at the season change).
- `actions.ts`: the player's decisions for the UI. `applyMarketAction(world, action)` returns a new world with structural sharing: it copies the small market records and only the clubs, player, contract and dressing rooms a move touches.

How it plugs into the existing paths:

1. `pendingCareerFixture` returns only fixtures the player is picked for. `simulateWeek` leaves an unpicked (or not yet registered) player out of the background XI, and passes those fixtures to `marketWeek`, which counts them.
2. `commitCareerMatch` accrues appearance, goal and clean-sheet bonuses and counts the start. It stays the single commit path.
3. `startNextSeason` runs `marketRollover` before `keepCareerInSimulatedLeagues`: loans end, agreed pre-contracts complete, an expired contract is extended by the club option, and open talks lapse.
4. `updateFinances` splits a loaned player's wage between the two clubs.

Offers made in the weekly step are dated from the week the player first sees them; they lapse after their last week has been simulated, and transfer and loan offers never outlive their window. The UI runs actions through `useMarketAction`, which waits while a job or match session is active, like other career edits.

Validation (`persistence/marketValidation.ts`) checks every market record against the world. Notable rules:

- agent clients match the hired agent;
- at most one loan, and the registration matches it (`worldValidation` allows a loaned player's contract to belong to the parent club);
- offers and negotiations link one to one, and every round's terms are valid;
- inbox kinds come from a fixed list;
- agent fees never exceed lifetime earnings;
- a world without a career keeps every market collection empty.

## Career social systems (milestone 6)

`engine/career/social/` is pure, like the market:

- `rules.ts`: culture fit, clique membership, teammate compatibility, morale parts.
- `dressing.ts`: `syncCliques`, key teammates and their chemistry, mood, `dressingWeek`.
- `rival.ts`: choosing the rival, transfers, meetings, the season comparison.
- `media.ts`: the press catalogue, weekly coverage, `openPress`, `answerPress` and the lapse of unanswered questions.
- `week.ts`: `socialWeek`, `socialMatch`, `socialRollover`, and `attachSocial` (also used by the schema 10 migration).
- `actions.ts`: `applySocialAction` for the UI, using the market's structural-sharing draft.

How it plugs into the existing paths:

1. `simulateWeek` runs `socialWeek` after `marketWeek`.
2. `commitCareerMatch` calls `socialMatch`: trust, fans, cliques and head-to-head. It stays the single commit path.
3. `startNextSeason` runs `socialRollover` after the career's market and relocation steps.
4. A move (`moveRegistration`) regroups the new club's cliques and teammates.
5. The AI lifecycle and the AI exchanges skip the rival.
6. `buildChoices` adds a morale factor (`moraleMultiplier`), so the session format is `match-6`.

`world/dressing.ts` keeps clique members and leaders valid whenever a roster changes. `persistence/socialValidation.ts` validates every social record.

## Career lifestyle (milestone 7)

`engine/career/lifestyle/` is pure:

- `catalogue.ts`: cosmetics, celebrations, brands and lifestyle items.
- `wardrobe.ts`: fame levels, availability (owned, fame, sponsor, tokens or locked), equipping and buying.
- `lifestyle.ts`: sponsor offers, deals and obligations; assets, upkeep and returns; lifestyle morale.
- `challenges.ts`: real-calendar periods, seeded sets, progress and claims.
- `week.ts`: `lifestyleWeek`, `lifestyleRollover`, `celebrationFame` and `attachLifestyle`.
- `actions.ts`: `applyLifestyleAction`, with the shared structural-sharing draft.

How it plugs into the existing paths:

1. `simulateWeek` runs `lifestyleWeek` after `socialWeek`.
2. `startNextSeason` runs `lifestyleRollover` after the market rollover.
3. `commitCareerMatch` calls `celebrationFame` and reports it in `CareerMatchOutcome.celebrationFame`.
4. `moraleParts` adds the `lifestyle` part.

The challenge calendar is an input: the UI passes the local date (`useChallengeRefresh`), so the engine stays free of wall-clock time. The celebration is presentation only:

- `Match.tsx` passes the latest goal by the selected player to `Pitch`.
- The Pixi scene animates the token's inner body (`celebrate(motion)`), and the SVG fallback uses CSS keyframes (`styles/celebrations.css`).

`engine/assets/gear.ts` renders the dressed shirt and the socks and boots. `persistence/lifestyleValidation.ts` validates the records.

## Honours and legacy (milestone 8)

`engine/world/continental.ts` runs the continental cups of national worlds:

- `continentalQualifiers` and `startContinental` pick the 32 clubs of each cup from the last tables (or reputation in a new world) and draw the groups.
- `advanceContinental` runs each week and on the commit path. It builds the round of 16, quarter-finals, semi-finals and final from finished stages. `groupTable` derives group standings from results.
- `isKnockoutFixture` tells the shared resolver which fixtures need a winner.

`engine/career/honours/` is pure:

- `chronicle.ts`: `chronicle(world, kind, params, options)` appends a dated entry for the career player and trims to the limit.
- `clip.ts`: the clip codec and the share-link payload (`encodeClip`, `decodeClip`, `momentLink`, `parseMomentLink`). It has no engine dependencies, so the public replay page and the validator stay light.
- `moments.ts`: `captureMoments` cuts keyframes from a committed session.
- `international.ts`: nations, squad selection, international windows, matches and biennial tournaments.
- `awards.ts`: award baselines, player of the month, season awards, the Golden Ball and world records.
- `retirement.ts`: retirement state, the Hall of Fame, `retireCareer`, `formerTeammates` and `keptPlayerIds`.
- `week.ts`: `attachHonours`, `honoursMatch`, `honoursWeek`, `honoursSeasonEnd` and `honoursRollover`.
- `actions.ts`: `applyHonoursAction` (retire), with the shared structural-sharing draft.

How it plugs into the existing paths:

1. `simulateWeek` runs `honoursWeek` after `lifestyleWeek`, and `honoursSeasonEnd` after the season's tables are archived.
2. `startNextSeason` runs `honoursRollover` after the social rollover: the tournament, then forced retirement, which may remove `world.career`. After the leagues are rebuilt, it starts the continental cups and the award season.
3. `commitCareerMatch` calls `honoursMatch` (moments, debut, first goal, hat-tricks, milestones).
4. Moves, long injuries, fame levels and the rival comparison write Chronicle entries where they happen.
5. `managerChanges` may appoint a retired former teammate (`formerTeammates`).
6. `archiveAndPrune` keeps legacy players and their children (`keptPlayerIds`).

`createCareer` accepts `draft.parentLegacyId` for a child career. `persistence/honoursValidation.ts` validates every honours record, and allows a world with legacies but no career. `nationalWorldSchema.ts` validates the continental cups.

UI: `CareerNational`, `CareerTrophies` (ceremony in `?ceremony=`), `CareerChronicle` (with the shared `ChronicleView`, also used by Legacy), `CareerMoments`, `CareerLegacy` (works without a career) and the public `MomentViewer` at `/moment`, which reads the URL hash only. `MomentPitch` replays a clip on an SVG pitch. The platform adapter's `shareFile` accepts a `Blob`, and `shareLink` shares or copies a link.

## Edit mode, audio and onboarding (milestone 9)

`engine/assets/clash.ts` is pure: `colourDifference` simulates protanopia, deuteranopia and tritanopia and measures CIELAB differences; `chooseMatchKits` picks the away kit that is distinct for every viewer, or flags a clash. The pitch (`screens/match/Maps.tsx` `kitAppearance`) and `captureMoments` use it.

`engine/world/edits.ts` is pure: `applyEditAction` (rename, recolour, regenerate or set a crest, revert) copies only the edits record and the touched maps and entities; `exportEdits`, `parseEditPack` and `applyEditPack` handle files, with one draft per pack. `persistence/editsValidation.ts` validates `World.edits` in both world schemas. `screens/EditMode.tsx` is the `/edit` route; files go through `platform.saveFile` and `platform.readFile`.

Audio lives outside the engine, in `src/audio/`:

- `synth.ts` is pure DSP (oscillators, seeded noise, RBJ biquads) that renders each `SoundName` deterministically, and `encodeWav` writes 16-bit PCM. Tests run it in Node.
- `synth.worker.ts` renders on request off the main thread.
- `player.ts` wraps WAV blob URLs in Howler `Howl`s, sets channel volumes (effects, crowd) and runs the crowd loop with fades.
- `index.ts` is the facade the app imports: `configure`, `unlock`, `prepare`, `play`, `crowd`. It dynamically imports the player on the first user gesture, so Howler is not in the initial bundle.

The shell calls `audio.configure(settings.audio)`, unlocks on the first pointer or key press, and plays interface sounds by delegation. `screens/match/useMatchAudio.ts` maps status changes, new events and momentum to whistles, goal sounds and the crowd level.

`ui/Tutorial.tsx` renders a step list against `data-tour` anchors in a portal, marks the target with `data-tour-active`, and records completion in `Settings.tutorial`. The hub and the match screen supply their steps with `when`, `action` and `done` from their own state. `ui/Tooltip.tsx` is the shared hover, focus and long-press tooltip.

Settings (device preferences and saves) gain `audio` and `tutorial`. When a save is applied, the device's tutorial flags are kept (`withDeviceTutorial` in the store).

## Release structure (milestone 10)

- **Lazy save system.** `persistence/lazy.ts` exposes `persistence()` (one shared dynamic import of `persistence/api.ts`, which re-exports the repository, session and update functions), `loadedPersistence()` for synchronous paths that only run once a save is active, `mayHaveSaves()` (via `indexedDB.databases()`), and `preloadPersistence()` (idle preload for returning players). `persistence/errors.ts` (`SaveError`, `UnsavedWorldError`, `errorCode`) and `persistence/settings.ts` (`DEFAULT_SETTINGS`, `validateSettings`) are light modules the shell and store import directly; `schema.ts` re-exports them. Only the Saves screen imports the save system statically.
- **Motion.** The shell wraps the app in `LazyMotion` with `ui/motionFeatures.ts` (Framer's `domAnimation`) loaded lazily; components use `m` elements. `Page` is a plain element with a CSS entrance.
- **Headers and preview.** `public/_headers` is the production header file (Cloudflare Pages format). `vite.config.ts` parses it and applies it in `vite preview`, and replaces `%SITE_URL%` in `index.html` from `SITE_URL`.
- **Delivery.** `.github/workflows/ci.yml`: `build`, `checks` and sharded `unit` jobs (Linux), sharded `browsers` (Windows matrix, starting after `build`), `custom-domain`, then `deploy` (Cloudflare Pages via Wrangler). See `docs/DEPLOY.md`.

Balance pass A (October 2026): `playerAbility` in `src/engine/strength.ts` is position-weighted (`ABILITY_WEIGHTS`), the career player develops passively toward their caps in `developCareer` (`src/engine/career/training.ts`) with playing time as the driver, and `Career.levelXp` records where the current level began so level curves can change without a migration taking or granting levels (schema 17). `scripts/career-profile.ts` is the balance instrument: it plays a career to retirement and checks the gates listed in `GATES`.

Balance pass C: `src/engine/world/transfers.ts` runs the AI market from `simulateWeek` on the lifecycle weeks (`lifecycleWeeks`); `updateReputations` runs in `archiveSeason`; `selectLineup` takes a seed and a rotation range for background elevens; `injureParticipants` in `finalize.ts` sets `Player.injuryWeeks`; `Manager.appointed` dates sackings' grace period; `MatchSetup.strengthBonus` carries the managers' strength into interactive matches so played and simulated fixtures agree. `scripts/world-profile.ts` measures the world over seasons and checks its gates.

Connected systems, phase 0: `CareerStyle.experiences` records when each experience was last taken, for its cooldown (schema 18, a no-op migration). `MatchSetup.slotMoments` makes key moments follow the selected player's formation slot (`playedSlot` in `src/engine/match/index.ts`, engine `match-11`); `engineFor(setup)` derived the engine from the setup, so `match-10` sessions kept replaying (until the 1.0 compatibility cut, which kept only the current engine: `isCurrentSetup`). `INBOX_KINDS` in `src/persistence/marketValidation.ts` must list every message kind that has copy in an i18n `messages` table; `tests/market.test.ts` checks the two agree.
