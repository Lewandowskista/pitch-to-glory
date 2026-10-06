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
}
export interface CareerPlayer extends Player {
  level: number;
  xp: number;
  attributePoints: number;
  skillPoints: number;
  fame: number;
  finances: PersonalFinances;
  agentId: Id | null;
  rivalId: Id;
  parentPlayerId: Id | null;
  inheritedBonus: Partial<Attributes>;
  training: TrainingSchedule;
  wardrobe: Wardrobe;
  celebrationId: Id;
  tutorial: TutorialProgress;
}
export interface Skill {
  id: Id;
  nameKey: string;
  descriptionKey: string;
  branch: string;
  prerequisites: Id[];
  pointCost: number;
  attributeBonuses: Partial<Attributes>;
  decisionIds: Id[];
}
export interface TrainingSession {
  day: number;
  focus: keyof Attributes | keyof KeeperAttributes | Position;
  intensity: 'low' | 'normal' | 'high';
  mentorId: Id | null;
  extra: boolean;
}
export interface TrainingSchedule {
  sessions: TrainingSession[];
  week: number;
}
export interface Injury {
  id: Id;
  playerId: Id;
  kind: string;
  started: GameDate;
  expectedRecovery: GameDate;
  severity: number;
  reinjuryRisk: number;
  recovery: 'rehab' | 'rush';
  careerThreatening: boolean;
}
export interface Agent {
  id: Id;
  name: string;
  avatar: Avatar;
  negotiation: number;
  network: number;
  commissionPercent: number;
  personality: 'aggressive' | 'connected' | 'economical';
  clientIds: Id[];
}
export interface ScoutingInterest {
  id: Id;
  clubId: Id;
  playerId: Id;
  started: GameDate;
  weeksObserved: number;
  confidence: number;
  stage: 'watching' | 'scouting' | 'offer';
}
export interface TransferOffer {
  id: Id;
  fromClubId: Id;
  toClubId: Id;
  playerId: Id;
  fee: number;
  contract: Contract;
  kind: 'transfer' | 'loan';
  expires: GameDate;
  negotiationId: Id;
}
export interface Loan {
  id: Id;
  playerId: Id;
  parentClubId: Id;
  destinationClubId: Id;
  start: GameDate;
  end: GameDate;
  wageShare: number;
  purchaseOption: number | null;
}
export interface Negotiation {
  id: Id;
  offerId: Id;
  rounds: NegotiationRound[];
  status: 'open' | 'accepted' | 'rejected' | 'expired';
  transferRequested: boolean;
}
export interface NegotiationRound {
  actor: 'player' | 'club' | 'agent';
  date: GameDate;
  wage: number;
  durationSeasons: number;
  fee: number;
  role: Contract['role'];
}
export interface Relationship {
  id: Id;
  sourceId: Id;
  targetId: Id;
  kind: 'manager' | 'teammate' | 'fans';
  value: number;
  history: Id[];
}
export interface Rivalry {
  id: Id;
  careerPlayerId: Id;
  rivalPlayerId: Id;
  intensity: number;
  eventIds: Id[];
}
export interface DressingRoom {
  id: Id;
  clubId: Id;
  leaderIds: Id[];
  cliques: Clique[];
  mood: number;
}
export interface Clique {
  id: Id;
  playerIds: Id[];
  affinity: number;
  influence: number;
}
export interface MediaItem {
  id: Id;
  authorId: Id;
  date: GameDate;
  kind: 'press' | 'interview' | 'social' | 'headline';
  textKey: string;
  params: Record<string, string | number>;
  choices: MediaChoice[];
}
export interface MediaChoice {
  id: Id;
  labelKey: string;
  fameDelta: number;
  trustDelta: number;
  moodDelta: number;
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
export interface PersonalFinances {
  cash: number;
  lifetimeEarnings: number;
  weeklyExpenses: number;
  purchaseIds: Id[];
}
export interface Sponsorship {
  id: Id;
  brand: string;
  playerId: Id;
  fameRequired: number;
  payment: number;
  start: GameDate;
  end: GameDate;
  obligations: SponsorObligation[];
}
export interface SponsorObligation {
  id: Id;
  kind: 'appearance' | 'performance' | 'equipment';
  target: number;
  progress: number;
  deadline: GameDate;
}
export interface LifestylePurchase {
  id: Id;
  kind: 'car' | 'house' | 'investment';
  nameKey: string;
  cost: number;
  weeklyCost: number;
  moraleBonus: number;
  value: number;
}
export interface Cosmetic {
  id: Id;
  kind: 'boots' | 'hair' | 'sleeves' | 'socks' | 'armband';
  nameKey: string;
  recipe: Record<string, string | number>;
  fameRequired: number;
}
export interface Wardrobe {
  ownedIds: Id[];
  equipped: Partial<Record<Cosmetic['kind'], Id>>;
}
export interface Celebration {
  id: Id;
  nameKey: string;
  animation: ReplayFrame[];
  fameRequired: number;
  signature: boolean;
  commentaryKey: string;
}
export interface Challenge {
  id: Id;
  cadence: 'daily' | 'weekly';
  starts: string;
  expires: string;
  objective: Objective;
  cosmeticRewardId: Id;
  completed: boolean;
}
export interface NationalTeam {
  id: Id;
  countryId: Id;
  level: 'U19' | 'U21' | 'senior';
  managerId: Id;
  playerIds: Id[];
  kits: ClubKits;
  fixtureIds: Id[];
}
export interface CallUp {
  id: Id;
  playerId: Id;
  nationalTeamId: Id;
  date: GameDate;
  accepted: boolean;
}
export interface Award {
  id: Id;
  nameKey: string;
  kind: 'month' | 'team-season' | 'golden-boot' | 'young-player' | 'mvp' | 'golden-ball';
  season: number;
  winnerIds: Id[];
  competitionId: Id | null;
}
export interface Trophy {
  id: Id;
  competitionId: Id;
  season: number;
  clubId: Id;
  playerIds: Id[];
}
export interface RecordEntry {
  id: Id;
  nameKey: string;
  playerId: Id;
  value: number;
  date: GameDate;
}
export interface Legacy {
  id: Id;
  playerId: Id;
  retiredAt: GameDate;
  stats: PlayerStats;
  chronicleIds: Id[];
  trophyIds: Id[];
  recordIds: Id[];
  hallOfFameRank: number;
  childPlayerId: Id | null;
}
export interface ChronicleEntry {
  id: Id;
  playerId: Id;
  eventId: Id;
  date: GameDate;
  titleKey: string;
  narrativeKey: string;
  params: Record<string, string | number>;
  illustration: { avatar: Avatar; crest: Crest | null };
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
export interface Moment {
  id: Id;
  matchId: Id;
  playerId: Id;
  seed: string;
  engineVersion: string;
  rng: RngState;
  inputs: DecisionInput[];
  frames: ReplayFrame[];
  kind: string;
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
}
export interface KeyMoment {
  id: Id;
  minute: number;
  situationKey: string;
  frame: ReplayFrame;
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
  kind: 'goal' | 'pass' | 'shot' | 'tackle' | 'card' | 'substitution' | 'halftime';
  playerId: Id | null;
  teamId: Id;
  point: Point;
  endPoint?: Point;
  commentaryKey: string;
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
    | 'manager-change';
  entityIds: Id[];
  params: Record<string, string | number>;
}
export interface World {
  format?: 'legacy' | 'national-v1';
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
export interface WorldEdits {
  version: 1;
  names: Record<Id, string>;
  colors: Record<Id, [Hex, Hex, Hex]>;
  crests: Record<Id, Crest>;
}
export interface TutorialProgress {
  firstMatch: string[];
  firstWeek: string[];
}
export interface Settings {
  theme: 'system' | 'light' | 'dark';
  fontScale: number;
  reducedMotion: boolean;
  backupReminder: boolean;
  simulationOnly: boolean;
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
export interface CareerState {
  kind: 'career';
  world: World;
  player: CareerPlayer;
  edits: WorldEdits;
}
export interface WorldState {
  kind: 'world';
  gallery: GalleryState;
  settings: Settings;
  world: World;
  matchSession?: import('../engine/match/types').MatchSession;
}
export type SavePayload = FoundationState | WorldState | CareerState;
export interface SaveFile {
  format: 'pitch-to-glory';
  schemaVersion: 5;
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
