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
  /**
   * Eye colour, nose and mouth. Absent on generated people and in older saves: the renderer then
   * derives them from the parts that never change after generation (see `resolveAvatar`).
   */
  iris?: number;
  nose?: number;
  mouth?: number;
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
  /** When the manager took the job (absent for managers in place since the world began). */
  appointed?: GameDate;
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
  /** An academy a career player funded (schema 20): its youngsters come through with more potential. */
  academy?: { patronId: Id; since: number };
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
  /** The club has already taken up its one-season option on this contract (balance pass D). */
  optionTaken?: boolean;
}
export interface PlayerStats {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  ratingTotal: number;
  trophies: Id[];
  /** Career yellow cards (the discipline phase); absent until the first. */
  yellowCards?: number;
  /** Career dismissals, second yellows included (the discipline phase); absent until the first. */
  redCards?: number;
}
export interface Player {
  id: Id;
  name: string;
  birthSeason: number;
  nationalityId: Id;
  clubId: Id | null;
  /**
   * Shirt number, 1–99, unique within the club's current squad (schema 21). Assigned without
   * random draws by `engine/world/squadNumbers.ts` and kept across moves when free.
   */
  squadNumber: number;
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
  /** An AI player's weeks left out (the career player's injury is in `career.injury`). */
  injuryWeeks?: number;
  retired: boolean;
  stats: PlayerStats;
  /** Season in which an unattached player was released; absent while under contract. */
  releasedSeason?: number;
  /**
   * Hall of Fame points earned so far (achievement record 1): club contributions weighted by
   * level, trophies, awards and caps, by the same rules for every player. Absent at zero.
   */
  hallOfFame?: number;
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
  /** Hall of Fame points kept through archiving (achievement record 1). */
  hallOfFame?: number;
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
  /** Completed and attempted passes (recorded from Phase 5.2). */
  passes?: [number, number];
  /** Successful tackles (recorded from Phase 5.2). */
  tackles?: number;
  /** Yellow cards shown, a second yellow included (the discipline phase). */
  yellowCards?: number;
  /** Sent off, and why (the discipline phase). */
  sentOff?: SentOff;
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
  /** XP at which the current level began (schema 17); absent in older saves until migrated. */
  levelXp?: number;
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
  /** Coaching (Phase 5.2): recent decisions and the season goal; absent in older saves. */
  coaching?: CareerCoaching;
  /** The career's chosen ambitions (schema 19); absent until the player sets them. */
  ambitions?: CareerAmbitions;
  /** Multi-week stories (schema 20): offered, awaiting their follow-up, or resolved. */
  stories?: StoryState[];
  /** The club the player captains, and since when (schema 20). */
  captaincy?: { clubId: Id; since: GameDate } | null;
  /** A farewell season announced (schema 20): the career ends when it is complete. */
  farewell?: { season: number; announced: GameDate } | null;
  /** Clubs that have granted the player a testimonial, after long service (schema 20). */
  testimonials?: Id[];
  /**
   * Development rules (schema 21). 2: late-career decline with longevity, and growth from
   * minutes in fixtures the player was available for. Absent means the original rules; older
   * careers adopt 2 when a new season starts, never part-way.
   */
  developmentRules?: 2;
  /** Running share (0-1) of training given to physical conditioning, for longevity (schema 21). */
  conditioning?: number;
  /** The club's recent fixtures and whether the player was available for them (schema 21). */
  availability?: AvailabilityEntry[];
  /** Whole attribute points by source, per season (schema 22); the latest seasons are kept. */
  growth?: GrowthSeason[];
}
/** A season's attribute points: gained by source, and lost to age (`decline`). */
export interface GrowthSeason {
  season: number;
  playing: number;
  training: number;
  points: number;
  skills: number;
  decline: number;
}
/**
 * One of the career club's fixtures from the player's side: played (with minutes), left out
 * while fit, unavailable through injury or not yet registered after a move.
 */
export interface AvailabilityEntry {
  season: number;
  week: number;
  fixtureId: Id;
  status: 'played' | 'benched' | 'injured' | 'unregistered';
  minutes: number;
}
export type StoryKind =
  | 'senior-dispute'
  | 'mentor-youth'
  | 'captaincy'
  | 'new-manager'
  | 'rival-war'
  | 'transfer-saga'
  | 'comeback'
  | 'homecoming'
  | 'charity'
  | 'night-out'
  | 'derby-promise'
  | 'contract-envy';
export type StoryStatus = 'offered' | 'waiting' | 'resolved';
/**
 * A story arc: offered with choices, answered (or lapsed into its default), then resolved
 * weeks later by what happened in the meantime. Effects apply once, on each transition.
 */
export interface StoryState {
  /** Stable: `story:<kind>:<season>:<week>`. */
  id: Id;
  version: 1;
  kind: StoryKind;
  started: GameDate;
  /** The last day to choose; unanswered, the default choice is taken. */
  respondBy: GameDate;
  /** Names and numbers the story refers to (teammate, club, rival…), and ids it acts on. */
  params: Record<string, string | number>;
  status: StoryStatus;
  choice: string | null;
  /** When the follow-up resolves (null when the choice settles it at once). */
  resolveAt: GameDate | null;
  outcome: string | null;
}
export type AmbitionId =
  | 'goals'
  | 'assists'
  | 'clean-sheets'
  | 'appearances'
  | 'caps'
  | 'league-title'
  | 'champions-cup'
  | 'golden-ball'
  | 'one-club'
  | 'dream-club'
  | 'hall-of-fame';
/** A long-term goal the player chose for the career. */
export interface Ambition {
  id: AmbitionId;
  set: GameDate;
  achieved: GameDate | null;
  /** The dream club, for `dream-club`. */
  clubId?: Id;
}
export interface CareerAmbitions {
  list: Ambition[];
  /** The season they were last changed: once a season, never the achieved ones. */
  changedSeason: number;
}
export type DecisionFamily = 'shooting' | 'passing' | 'dribbling' | 'defending' | 'goalkeeping';
/** One key-moment decision, kept for coaching after its match is recorded. */
export interface DecisionSample {
  season: number;
  week: number;
  family: DecisionFamily;
  success: boolean;
  /** The chance the decision had. */
  probability: number;
  /** Governing attributes, strongest first (at most three). */
  attributes: string[];
  /**
   * Probability points the player's attributes added to the choice against the match's level
   * (negative when they made it harder), from schema 22. What training can change.
   */
  attributeEffect?: number;
  /**
   * Expected goal difference given up against the best choice offered (0 when the best was
   * taken), from schema 22. What a better choice could have changed.
   */
  regret?: number;
}
export type SeasonGoalKind = 'appearances' | 'passing' | 'defending' | 'attribute';
/** A development goal the player accepted for a season; it never changes once accepted. */
export interface SeasonGoal {
  version: 1;
  season: number;
  kind: SeasonGoalKind;
  target: number;
  /** The attribute to develop, for an attribute goal. */
  attribute: string | null;
  /** The attribute's value when the goal was accepted (0 for other goals). */
  baseline: number;
  accepted: GameDate;
}
export interface SeasonGoalResult {
  season: number;
  kind: SeasonGoalKind;
  target: number;
  attribute: string | null;
  achieved: number;
  completed: boolean;
}
export interface CareerCoaching {
  version: 1;
  /** The latest decisions, oldest first. */
  recent: DecisionSample[];
  goal: SeasonGoal | null;
  /** The season whose goal offer the player turned down. */
  declinedSeason: number | null;
  history: SeasonGoalResult[];
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
  /**
   * The same, by celebration (phase 7, C10). Counted from when it arrived, so older saves
   * start without it and the parts may add up to less than `signatureUses`.
   */
  signatureUsesBy?: Record<Id, number>;
  assets: LifestyleAsset[];
  /** When each experience was last taken, by catalogue item; absent in older saves. */
  experiences?: Record<Id, GameDate>;
}
export interface LifestyleAsset {
  id: Id;
  /** Catalogue item: a car, a home, an investment product, staff, an experience or a charity. */
  itemId: Id;
  kind: 'car' | 'house' | 'investment' | 'staff' | 'experience' | 'charity' | 'legacy';
  bought: GameDate;
  cost: number;
  /** Current resale value (an investment's balance). */
  value: number;
  /** Weekly cost fixed at purchase (balance pass D); absent for older assets. */
  upkeep?: number;
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
  /** The manager's development promises, at most one a season, newest last (Phase 6). */
  promises?: ManagerPromise[];
  /** A stance taken to the press, judged by the next result (balance pass D). */
  stance?: { tone: MediaTone; date: GameDate };
}
export type PromiseStatus = 'offered' | 'active' | 'achieved' | 'missed' | 'cancelled';
export type PromiseEnd =
  'declined' | 'expired' | 'transfer' | 'manager' | 'injury' | 'retirement' | 'season';
/**
 * A six-week milestone the manager proposes towards the accepted season goal: offered, then
 * active, then achieved or missed; cancelled without penalty when declined, unanswered or made
 * unfair by a move, a new manager or an injury.
 */
export interface ManagerPromise {
  /** Stable per season (`promise:<season>`), so reprocessing never repeats its effects. */
  id: Id;
  version: 1;
  season: number;
  clubId: Id;
  managerId: Id;
  status: PromiseStatus;
  kind: SeasonGoalKind;
  target: number;
  attribute: string | null;
  /** The measure when accepted: matches, completed passes, tackles or the attribute value. */
  baseline: number;
  offered: GameDate;
  /** The last week to answer the offer. */
  respondBy: number;
  started: GameDate | null;
  /** The last week that counts. */
  deadline: number | null;
  /** Progress at the latest weekly update. */
  progress: number;
  resolved: GameDate | null;
  end: PromiseEnd | null;
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
    /** The club's hidden walk-away wage (balance pass D); absent in older talks. */
    walkAwayWage?: number;
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
  /**
   * Who wrote it, as it stood when it arrived (phase 7, C5): a later manager change or move
   * never rewrites the sender. Absent for kinds with no sender and in older saves.
   */
  sender?: InboxSender;
  /** The last day to answer, for a message that asks for one. Absent otherwise. */
  deadline?: GameDate;
}
export interface InboxSender {
  kind: 'club' | 'agent' | 'press' | 'manager';
  /** The club, agent or manager; absent for a press outlet. */
  id?: Id;
  name: string;
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
  /** Fees paid so far (balance pass D): a failed deal claws a share back. */
  paid?: number;
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
  /** The title's name when decided (Phase 1.4); older trophies are named by competition. */
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
  | 'promise'
  | 'ambition'
  | 'story'
  | 'farewell'
  | 'testimonial'
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
/**
 * How the ball travelled into a keyframe: rolled along the ground, lofted, struck at goal,
 * lifted over the bar, dribbled at a player's feet, running loose, out of play, or reset
 * instantly (the second-half kickoff).
 */
export type BallMotion = 'ground' | 'air' | 'shot' | 'over' | 'carry' | 'loose' | 'dead' | 'reset';
/**
 * What a player does with the ball in a keyframe (engine match-14). Passes split by shape:
 * `cross` from wide in the final third into the box, `cutback` low from the byline, `switch`
 * across the pitch in the air, `through` behind the line, `long` any other lofted pass.
 * `intercept` is a pass cut out or a loose ball won; `restart` a dead ball being placed.
 */
export type BeatKind =
  | 'pass'
  | 'cross'
  | 'switch'
  | 'through'
  | 'long'
  | 'cutback'
  | 'carry'
  | 'dribble'
  | 'shot'
  | 'header'
  | 'tackle'
  | 'intercept'
  | 'block'
  | 'save'
  | 'clearance'
  | 'restart'
  | 'celebration';
/** Thirds of the pitch, from the acting team's own goal: defensive, middle, final. */
export type PitchZone = 'def' | 'mid' | 'final';
/** Channels of the pitch, as the acting team faces the goal it attacks. */
export type PitchFlank = 'left' | 'centre' | 'right';
/** A recognisable move a beat belongs to (the pattern library fills these in). */
export type PatternId =
  | 'wing-play'
  | 'overlap'
  | 'switch'
  | 'through-ball'
  | 'counter'
  | 'cut-back'
  | 'long-ball'
  | 'recycle';
/**
 * The ball action that leads into a keyframe: who played it, to whom, from where. Zone and
 * flank are where the actor plays the ball (where they win it, for tackles, interceptions,
 * blocks and saves), relative to the actor's team's attacking direction.
 */
export interface Beat {
  kind: BeatKind;
  actorId: Id;
  /** The teammate a completed pass, cross or switch reached. */
  receiverId?: Id;
  /** The engine event this action plays out (a shot, a decision, a goal's celebration). */
  eventId?: Id;
  pattern?: PatternId;
  zone: PitchZone;
  flank: PitchFlank;
}
export interface ReplayFrame {
  timeMs: number;
  ball: Point;
  players: { id: Id; point: Point; animation: string }[];
  /** Player with the ball at their feet; null while it travels, runs loose or is out of play. */
  carrierId?: Id | null;
  ballMotion?: BallMotion;
  /** The action between the previous keyframe and this one (engine match-14). */
  beat?: Beat;
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
  /**
   * Starters sent off (engine match-16): they keep their slot in `starterIds` (so the shape
   * and clips keep their order) but are off the pitch and out of play.
   */
  sentOffIds?: Id[];
}
export interface Tactics {
  role: string;
  risk: 'low' | 'balanced' | 'high';
  mentality: 'defensive' | 'balanced' | 'attacking';
}
export interface Objective {
  id: Id;
  kind: 'goals' | 'assists' | 'passing' | 'clean-sheet' | 'rating' | 'tackles' | 'saves' | 'shots';
  target: number;
  progress: number;
}
export interface ProbabilityFactor {
  labelKey: string;
  source: 'attribute' | 'trait' | 'defender' | 'fatigue';
  contribution: number;
}
/**
 * Who a key moment involves (engine match-15, redesign step M4), named by the engine so the
 * camera can label them: the opponent closing you down (or, when you defend, the one on the
 * ball), the players covering (opponents when you attack, teammates when you defend), the
 * keeper that matters, teammates in space, a runner (yours in behind, or theirs to track) and
 * the crosser of an aerial ball. Every id is on the pitch in the moment's frame.
 */
export interface MomentCast {
  selected: Id;
  presser?: Id;
  cover: Id[];
  keeper?: Id;
  free: Id[];
  runner?: Id;
  crosser?: Id;
}
/**
 * Where a choice goes (engine match-15): a post of the goal attacked, a named teammate (the one
 * a pass actually reaches), a lane to carry or step into, or a runner to track or challenge.
 * Points are pitch coordinates of the moment's frame.
 */
export type ChoiceTarget =
  | { kind: 'goal'; post: 'near' | 'far' | 'centre'; point: Point }
  | { kind: 'teammate'; playerId: Id; point: Point }
  | { kind: 'lane'; point: Point }
  | { kind: 'runner'; playerId: Id };
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
  /** Where the choice goes (engine match-15); absent on earlier engines. */
  target?: ChoiceTarget;
  /** A tackle or defending choice's booking risk (engine match-16); absent otherwise. */
  booking?: BookingRisk;
}
export interface KeyMoment {
  id: Id;
  minute: number;
  situationId: Id;
  situationKey: string;
  /** Names and numbers the situation's sentence refers to (opponent, defender, minute…). */
  situationParams?: Record<string, string>;
  /** A line on what the moment means for the game, late in a close match. */
  pressureKey?: string;
  /** A follow-up moment (match-13): the shot after a beaten defender, or the shootout kick. */
  follows?: 'chain' | 'shootout';
  frame: ReplayFrame;
  /** The third the moment happens in, from the selected team's goal (engine match-15). */
  zone?: PitchZone;
  /** Who the moment involves (engine match-15); absent on earlier engines. */
  cast?: MomentCast;
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
  /**
   * A failed defending choice's booking roll (engine match-16): the roll against the foul
   * chance, and the card it brought, if any.
   */
  booking?: { roll: number; foul: number; card?: CardKind };
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
  /** The teammate a completed pass reached, as choreographed (engine match-14). */
  receiverId?: Id;
  /** How the event was played on the pitch: a cross, a header, an interception… */
  action?: BeatKind;
  /** The third of the pitch it happened in, from the acting team's own goal. */
  zone?: PitchZone;
  /** On shots: the chance of a goal from this shot (engine match-14). */
  xg?: number;
  /**
   * On cards: what was shown. Engine match-15 books cosmetic yellows only; match-16 adds a
   * second yellow (a yellow, then red: off) and a straight red.
   */
  card?: CardKind;
}
export type CardKind = 'yellow' | 'second-yellow' | 'red';
/** A dismissal (engine match-16): the minute and why. */
export interface SentOff {
  minute: number;
  reason: 'second-yellow' | 'straight-red';
}
/**
 * The booking risk of a defending choice (engine match-16, decision transparency): a failed
 * attempt is a foul worth a card with chance `foul` (its factors add up to it), and of those a
 * straight red with chance `straight`. `yellow` and `red` are the chances of each card when
 * the choice is made: an already booked player's yellow is a second yellow, so a red.
 */
export interface BookingRisk {
  foul: number;
  straight: number;
  yellow: number;
  red: number;
  /** Already booked: a second yellow sends the player off. */
  booked: boolean;
  factors: ProbabilityFactor[];
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
  /** Names and numbers the headline refers to (player, opponent, score…). */
  headlineParams?: Record<string, string>;
  /**
   * The player's cards (engine match-16): yellows shown (a second yellow counts) and the
   * dismissal, if any. Absent on earlier engines.
   */
  cards?: { yellow: number; sentOff?: SentOff };
}
export interface Match {
  id: Id;
  fixtureId: Id;
  seed: string;
  rng: RngState;
  home: Lineup;
  away: Lineup;
  weather: 'clear' | 'rain' | 'snow' | 'wind';
  /** How hard it rains, blows or snows (engine match-15; absent on earlier engines). */
  weatherIntensity?: 'light' | 'steady' | 'heavy';
  pitchCondition: number;
  /** The pitch's state from the weather and its quality (engine match-15). */
  pitchState?: 'firm' | 'good' | 'heavy' | 'frozen';
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
   * One Hall of Fame record for every player (schema 21), from season `since`. `titles` are
   * the titles already credited this season. Absent until the world adopts it at a season start.
   */
  achievements?: { version: 1; since: number; titles: Id[] };
  /** Formation-aware team selection (Phase 5.1); absent before the world adopts it. */
  selectionVersion?: 1;
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
  /**
   * This season's statistics by competition and club (Phase 1.3). Present from a world's first
   * season, or from the next season for worlds saved before it; awards use it when it covers
   * the current season.
   */
  seasonStats?: SeasonStatistics;
  /**
   * This season's cards and suspensions (the discipline phase). Absent in worlds saved before
   * it until the first card; reset at each season's rollover.
   */
  discipline?: DisciplineState;
  /** Edit mode changes (milestone 9), with the original values for reverting and export. */
  edits?: WorldEdits;
}
/** Where a ban is served: league football, the domestic cup, or continental football. */
export type DisciplineScope = 'league' | 'cup' | 'continental';
/** One player's record: this season's cards, and bans (only the non-empty entries). */
export interface DisciplineRecord {
  /** Yellow cards and dismissals this season, by competition. */
  cards: Record<Id, [number, number]>;
  /** This season's yellows towards an accumulation ban, by scope (not those that ended in a dismissal). */
  tally: Partial<Record<DisciplineScope, number>>;
  /** Matches still to serve, by scope; they carry over a season's end. */
  bans: Partial<Record<DisciplineScope, number>>;
}
export interface DisciplineState {
  version: 1;
  season: number;
  players: Record<Id, DisciplineRecord>;
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
/** Appearances, minutes, goals, assists, clean sheets and rating total. */
export type CompetitionLine = [number, number, number, number, number, number];
export interface SeasonStatistics {
  version: 1;
  season: number;
  /** Competition → club → player → line. A loan or transfer starts a new club line. */
  competitions: Record<Id, Record<Id, Record<Id, CompetitionLine>>>;
}
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
  /**
   * Champions of divisions whose first-phase groups only qualify clubs (Portugal's Liga 3 and
   * Campeonato de Portugal), from the deciding phase or final. `champions` keeps each group's
   * table winner. Absent in seasons archived before Phase 1.4.
   */
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
  /**
   * Tutorial tracks already completed or skipped on this device (milestone 9). `replay` is
   * set by "Show the tutorial again": until both tracks are seen again, this device's flags
   * win over a save that recorded them as seen.
   */
  tutorial: { week: boolean; match: boolean; replay?: true };
}
export interface AudioSettings {
  muted: boolean;
  master: number;
  effects: number;
  crowd: number;
  music: number;
  musicEnabled: boolean;
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
  schemaVersion: 22;
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
