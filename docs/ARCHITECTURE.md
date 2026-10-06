# Pitch to Glory architecture

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
  persistence/        Dexie tables, schema upgrades, validation, slot repository
  store/              Zustand settings, gallery, world/job, match and active-save slices
  hooks/              Autosave and browser lifecycle integration
  platform/           Platform interface and web implementation
  audio/              Procedural synthesiser, rendering worker, Howler player and the facade
  ui/                 Shell, reusable controls, SVG artwork wrapper, tutorial and tooltip
  screens/            Lazy routes: menu, gallery, world, match, saves, settings
    world/            Competition views and club/squad inspector
    match/            Selection, preview, live controls, Pixi pitch and report maps
  styles/             Design tokens (Tailwind @theme), per-area component CSS partials, fonts
  i18n/               English strings and translation entry point
  assets/             Authored SVG brand and PWA icons
  workers/            Simulation and persistence workers, bounded message transport
tests/                 Vitest engine/persistence/worker tests with fake IndexedDB
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
  competitionId: Id;
  season: number;
  clubId: Id;
  playerIds: Id[];
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
  /** Edit mode changes (milestone 9), with the original values for reverting and export. */
  edits?: WorldEdits;
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
  schemaVersion: 13;
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

Zustand uses settings, gallery, world/job and session slices. Components select small slices. Ordinary edits debounce autosave; worker checkpoints flush it immediately. A world snapshot includes its current gallery/preferences; a foundation collection excludes world data. Writes are serialized and atomic. Failed writes remain dirty and surface recovery actions instead of reporting success.

The module worker runs the same pure generation/simulation functions as Vitest. RNG state travels inside `World`. `simulateWeek` and `startNextSeason` return a copy by default; the worker passes `{ inPlace: true }` because it owns its world and each checkpoint is fully posted before the next week mutates it.

The squad lifecycle (`engine/world/lifecycle.ts`) runs at the intake week and transfer windows for clubs in simulated leagues: age-curve retirement, contract renewal or release, academy intake, trimming, and free-agent signings with generated trialists as a last resort. Clubs below the simulated frontier are dormant and reused for later feeder admissions. At rollover, retired players move to `World.archive`, events older than the previous season are dropped and unemployed managers are removed, which keeps the world bounded (see BALANCING.md). A season job posts each weekly checkpoint and waits for acknowledgement after the store commit and autosave finish. Save failure halts further simulation and retains the dirty checkpoint. Cancellation terminates the worker, waits for startup/checkpoint storage to settle and retains the last committed week. Generation replaces the in-memory world through a guarded handoff, detaching its previous slot without overwriting it. Busy jobs block save-slot mutation. UI animation timing never controls randomness. An unfinished friendly prevents advancing or replacing its source world.

Worker transport breaks large graphs into bounded entity batches and yields while sending. Receivers assemble an unpublished snapshot and expose it only after the end marker; cancellation cannot publish a partial world. Simulation completion sends a small phase notification after the final durable checkpoint rather than echoing the whole graph again.

A persistent persistence worker performs save validation, migrations, JSON parsing/formatting and IndexedDB reads/writes. The browser repository delegates to this service; Node tests use the same local repository directly. Write receipts carry normalized envelope/preferences without repeating the world, and the UI retains its immutable submitted snapshot. Imports always undergo complete validation. Ownership and expected revision are checked inside the original atomic IndexedDB transaction. Cancelling simulation never terminates an in-flight persistence operation. A lightweight main-thread Dexie count observes the slot key range so worker mutations refresh save cards without reading large records on the UI thread.

```typescript
type WorkerRequest =
  | { requestId: Id; type: 'generate'; seed: string }
  | { requestId: Id; type: 'simulate-week' | 'simulate-season' | 'next-season'; world: World }
  | { requestId: Id; type: 'ack'; completedWeeks: number }
  | { requestId: Id; type: 'cancel' };
type WorkerResponse =
  | { requestId: Id; type: 'progress'; completedWeeks: number; totalWeeks: number }
  | { requestId: Id; type: 'checkpoint'; world: World; completedWeeks: number; totalWeeks: number }
  | { requestId: Id; type: 'result'; world: World }
  | { requestId: Id; type: 'complete'; phase: World['phase'] }
  | { requestId: Id; type: 'cancelled'; world: World | null }
  | { requestId: Id; type: 'error'; code: 'invalid' | 'busy' | 'simulation' };
```

## Persistence and tab ownership

Database and file schema versions are independent. DB v1 holds slots; v2 adds revision indexing; v3 migrates collections and supports worlds; v4 admits versioned national pyramids; v6 splits each slot into a metadata record (`saves`), the world graph (`worlds`) and the match session (`matches`). Database upgrades never validate: v1–v5 records migrate lazily on read, and the v6 upgrade only moves data, leaving malformed records untouched so one damaged slot cannot abort the upgrade. File schema v6 adds optional archive, release-season, event-kind and match-engine-version fields; v7 adds the optional career and development version; v8 adds the optional identity version and division references; v9 gives each career its market record, the agent pool and club relationships; v10 adds the social records (rival, cliques, teammates, media, morale history); v11 adds the career style record, sponsorships and challenges. Earlier files migrate unchanged.

Reads assemble and fully validate one slot. A world that fails validation rejects the save; an attached match session that is from another match-engine version, fails replay or no longer matches the world is discarded with a `match-discarded` recovery notice while the world is kept. Writes stay strict. National profiles are compared by rule fingerprint for their profile version, so corrected citations or descriptions never invalidate saves. The slot list reads metadata only and reports `ready`, `empty` or `error` per slot. Writes that leave the world graph unchanged (match checkpoints, preferences) update metadata and the session without transferring, validating or storing the world. Backups are compact JSON. File v1 → v2 adds settings/gallery/engine version/revision; v2 → v3 preserves those values and adds the world payload capability; v3 → v4 preserves each existing world and its rules without regeneration. Import checks the 128 MiB limit, format/version/timestamps/slot/settings and every implemented world entity. World validation checks bounded values, rosters, foreign keys, fixture pair/calendar coverage, tables reconstructed from results, cup progression and archive structure before a transaction. Malformed/future files never replace valid saves. Web Locks are preferred; transactional heartbeat leases provide a fallback. Revision checks prevent stale writes even after ownership loss. Cancelled generation reacquires a retained session's slot after cleanup, or reports a lock/storage error. Switching slots and unload release ownership; crashed fallback leases expire.

Only three slot IDs are accepted at every repository boundary. Export uses JSON downloads. Import uses a labelled native file input. Delete and replacement use URL-backed confirmation dialogs so back/Esc cancels. Browser storage persistence is requested only from a user action explaining that it reduces eviction; export remains available because persistence is not a backup.

## Platform contract

```typescript
interface PlatformAdapter {
  readPreferences(): unknown;
  writePreferences(value: unknown): boolean;
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

The web adapter owns download/share fallback, file size limits, storage persistence, optional vibration, popstate, wake lock and optional notifications. Unsupported capabilities return a documented benign result. No feature requests notification permission automatically. Android/Capacitor is intentionally absent until the final milestone.

## UI, accessibility and delivery

Real URLs: `/`, `/gallery`, `/world`, `/match`, `/saves`, `/settings`. World query parameters retain country, tier, club, player and competition view. A `save` parameter reacquires/restores a world slot and its optional match on refresh; unsaved worlds prompt before unload. Desktop uses a sidebar and side-by-side competition/club inspector or pitch/commentary/stats; narrow layouts retain all data with an optional horizontally scrolling full table. Controls have labels, visible focus, keyboard operation and 44px targets. Settings follow system theme/motion and support 85–130% scaling; loaded saves restore preferences.

English UI strings live in `src/i18n/en.ts`, `match.ts` and `pitch.ts`; generated names and recipe identifiers are data. CSS tokens define theme colors, spacing, radii, fonts and shadows, and are exposed to Tailwind utilities through `@theme inline`. New UI uses utilities; screens built before milestone 4 keep their component CSS partials until reworked. Fonts are bundled locally from licensed font packages. Route and reward transitions honour reduced motion.

Vite PWA precaches route chunks, both workers, SVG icons and fonts after one connected visit. Updates flush autosave before activation. Netlify preserves deep-link refresh. CI runs types, lint, Vitest, build and Chromium/Firefox/WebKit tests; deployment requires configured secrets. Nothing has been deployed by these milestones.

## Verification

Tests cover foundation reproducibility, save migrations/round trips/ownership, world generation, schedule/table conservation, cups, weekly AI changes, JSON resume and promotion rollover. Match tests replay complete sessions, validate conserved statistics and simulate 10,000 matches for goals/home advantage/upsets. Worker tests cover acknowledgement ordering, failures and cancellation during startup/yield/lock cleanup. Browser flows exercise real workers, world backup/import/restoration, full-season rollover, match decisions/refresh/report, large-text layouts and offline resources. Builds enforce 300 KB initial JavaScript gzip for every route and reject eager Pixi loading. Tutorial and audio retain their later milestone scope.

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

The match slice stores an immutable session. Browser intervals dispatch compact advance commands; decision, half-time, substitution and captain prompts require explicit commands. Skip uses the same transitions in a bounded loop. A session stores its initial tactics, seed, frozen squads and complete command log, so refresh and import replay exactly. UI playback speed and Pixi interpolation are presentation state, never sporting state. Visibility loss and open dialogs pause playback. A friendly's source world remains frozen until it finishes or is cleared; its report does not alter scheduled competition results.

The lazy Pitch route imports PixiJS only when rendered. A ticker interpolates reusable player/ball vector objects towards engine frame coordinates. ResizeObserver adjusts canvas and stage scale; cleanup handles asynchronous initialization, unmount and context loss. SVG fallback uses the same kit selection and token conventions. Simulation-only presentation renders commentary and decisions without constructing the pitch. Reports use SVG to visualize actual recorded positions, passes and shots.

File schema v5 added optional WorldState.matchSession; v6 versions it by match engine. Match state is validated by finite bounded setup checks, legal commands and exact deterministic replay; its team/player snapshots must match the saved world. For minute checkpoints the browser sends the session, preferences, world id and expected revision. The persistence worker validates the session by replay, checks ownership, revision and world id against the slot metadata, and writes only the metadata and `matches` records atomically. The world graph is neither transferred nor rewritten. World transfers still use bounded batches. Full-time explicitly flushes autosave before displaying the saved indicator.

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
