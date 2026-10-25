/**
 * Career profile (balance gate, docs/GAME-DESIGN-REVIEW.md Phase E). Plays one career to
 * retirement with the soak policy and records, every season, the numbers that balancing is
 * judged by: ability and its place in the world, playing time, output, money, fame, honours,
 * the rival, and the key-moment calibration. A check mode reads every recorded profile and
 * asserts the gates.
 *
 *   npm run profile -- --seed review-a --position ST          one career (about seven minutes)
 *   npm run profile -- --seed review-b --position CM --specialise   points into the position's key attributes
 *   npm run profile -- --seed review-a --position ST --policy sponsor   accepts sponsorships (C19)
 *   npm run profile -- --check                               assert the gates over artifacts/profile/*.json
 *   npm run profile -- --check --assert-targets              also fail on the 1.0 targets
 *
 * The check also reports the 1.0 targets (docs/RELEASE-1.0-PLAN.md step 2.3; `TARGETS` below):
 * honours fairness, prime years and the economy. They are reported, not asserted, until phase 7
 * meets them and flips their `asserted` flags. They need careers to retirement for GK, CB, CM
 * and ST with the default policy, and one with the sponsor policy.
 *
 * Writes artifacts/profile/<seed>-<position>.json.
 */
import { suggestCommitments } from '../src/engine/career/commitments';
import { CALIBRATION_GATE, calibrationProblems } from './calibration';
import {
  assertAllTargets,
  evaluateTargets,
  median as middle,
  printTargets,
  within,
  type Target,
} from './targets';
import { awardAchievement } from '../src/engine/career/honours/achievements';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type {
  Award,
  GrowthSeason,
  Id,
  Player,
  Position,
  TrainingFocus,
  TrainingPlan,
  World,
} from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { decide, freshPolicy, type DecideOptions } from './soak-career';
import { growthOf } from '../src/engine/career/growth';
import { playerAbility } from '../src/engine/strength';
import { retirementState } from '../src/engine/career/honours/retirement';
import { applyHonoursAction } from '../src/engine/career/honours/actions';
import { fameLevel } from '../src/engine/career/lifestyle/wardrobe';
import { managerTrust, relationshipValue } from '../src/engine/career/market/rules';
import {
  attributeCost,
  raiseAttribute,
  trainableAttributes,
} from '../src/engine/career/progression';
import { ABILITY_WEIGHTS } from '../src/engine/strength';
import { applyLifestyleAction, priceOf } from '../src/engine/career/lifestyle';
import { careerFameLevel } from '../src/engine/career/lifestyle/wardrobe';
import { LIFESTYLE } from '../src/engine/career/lifestyle/catalogue';

const RETIRE_AGE = 34;
const OUT_DIR = 'artifacts/profile';

export interface SeasonProfile {
  season: number;
  age: number;
  level: number;
  xp: number;
  ability: number;
  potential: number;
  /** Percentile of ability among the world's active players. */
  worldPercentile: number;
  squadRank: number;
  squadSize: number;
  top: string;
  club: string;
  tier: number;
  clubReputation: number;
  leaguePlace: number;
  leagueSize: number;
  role: string | null;
  wage: number | null;
  cash: number;
  earnings: number;
  fame: number;
  fameLevel: number;
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  rating: number | null;
  injuries: number;
  injuryWeeks: number;
  morale: number;
  form: number;
  trust: number;
  fans: number;
  rivalAbility: number | null;
  rivalTier: number | null;
  awards: string[];
  trophies: number;
  caps: number;
  offers: number;
  /** Offers the policy turned down this season. */
  declined: number;
  /** Share of weeks with manager trust below 70. */
  trustBelow70: number;
  /** Money spent on the lifestyle this season, and owned items at the end. */
  spent: number;
  owned: number;
  actions: Record<string, number>;
  /** Mean starting-eleven ability of each tier-1 champion. */
  championXI: number[];
  players85: number;
  players90: number;
  /** Whole attribute points this season by source (review phase 2, step 2.4). */
  growth?: Omit<GrowthSeason, 'season'>;
  /**
   * Income this season (1.0 economy target): sponsorship fees (active deals' weekly fees) and
   * everything else the player was paid (wages, bonuses, transfer money).
   */
  sponsorIncome?: number;
  footballIncome?: number;
  /**
   * The season's awards (1.0 honours target): the league tier each covered (null for the
   * Golden Ball and young player), the Hall of Fame points the engine credits, and what the
   * same award would credit in a tier-1 league.
   */
  awardPoints?: { kind: string; tier: number | null; points: number; tierOnePoints: number }[];
}
/**
 * The ways the headless player plays (review phase 2, step 2.4): `default` is the soak
 * policy; the others change one lever each.
 */
export const POLICIES = {
  default: {},
  /** Every session on the position's most valued attributes, at high intensity. */
  focused: {},
  /** Two recovery sessions a week, the third on the position's most valued attribute. */
  recovery: {},
  /** Never spends attribute or skill points. */
  'no-points': { spendPoints: false },
  /** Stays: no transfers, no transfer request, no loans; renewals accepted. */
  loyal: { moves: 'never', requestTransferAt: null, loans: 'never' },
  /** Accepts any move and asks to leave from 20. */
  mover: { moves: 'any', requestTransferAt: 20 },
  /** Asks for a loan only while short of minutes, and takes it. */
  minutes: { loans: 'minutes' },
  /** Weekly commitments (review phase 4): the team, the community and family every week. */
  social: {},
  /** Weekly commitments: the suggested week, re-chosen every week (delegation). */
  delegate: {},
  /** Accepts every sponsorship the fame level allows and keeps its commitment (C19). */
  sponsor: { sponsors: 'accept' },
  /** Answers every story scene, each choice in turn (C19). */
  stories: { stories: 'rotate' },
  /** Answers the press in each tone in turn instead of always the first (C19). */
  press: { press: 'rotate' },
  /** All three: sponsors, stories and a varied press, as a person might play (C19). */
  human: { sponsors: 'accept', stories: 'rotate', press: 'rotate' },
} as const satisfies Record<string, DecideOptions>;
export type Policy = keyof typeof POLICIES;

/** A training plan for the policy, or null to keep the career's own plan. */
function policyPlan(policy: Policy, player: Player): TrainingPlan | null {
  if (policy !== 'focused' && policy !== 'recovery') return null;
  const weights = ABILITY_WEIGHTS[player.primaryPosition] as Record<string, number>;
  const valued = trainableAttributes(player)
    .filter((key) => (weights[key] ?? 0) > 0)
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || (a < b ? -1 : 1));
  const focus = (index: number) =>
    (valued[index % Math.max(1, valued.length)] ?? 'technical') as TrainingFocus;
  return policy === 'focused'
    ? {
        sessions: [0, 1, 2].map((index) => ({ focus: focus(index), intensity: 'high' as const })),
        extra: null,
      }
    : {
        sessions: [
          { focus: 'recovery', intensity: 'low' },
          { focus: 'recovery', intensity: 'low' },
          { focus: focus(0), intensity: 'normal' },
        ],
        extra: null,
      };
}
export interface CareerProfile {
  seed: string;
  position: Position;
  archetype: string;
  specialise: boolean;
  policy?: Policy;
  seasons: SeasonProfile[];
  legacy: Record<string, unknown> | null;
  calibration: Record<string, { n: number; stated: number; actual: number }>;
}

const ARCHETYPES: Partial<Record<Position, string>> = {
  ST: 'finisher',
  CM: 'playmaker',
  CB: 'destroyer',
  RW: 'speedster',
  LW: 'speedster',
  AM: 'technician',
  DM: 'destroyer',
  LB: 'box-to-box',
  RB: 'box-to-box',
  GK: 'shot-stopper',
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Spend points on the position's weighted attributes first (a specialising player). */
function specialisedSpend(input: World, position: Position): World {
  let world = input;
  const weights = ABILITY_WEIGHTS[position];
  for (let guard = 0; guard < 60 && world.career!.attributePoints > 0; guard++) {
    const player = world.players[world.career!.playerId]!;
    const options = trainableAttributes(player)
      .map((key) => ({ key, cost: attributeCost(world, key) }))
      .filter(
        (entry): entry is { key: (typeof entry)['key']; cost: number } =>
          entry.cost !== null && entry.cost <= world.career!.attributePoints,
      )
      .sort((a, b) => {
        const wa = (weights as Record<string, number>)[a.key] ?? 1;
        const wb = (weights as Record<string, number>)[b.key] ?? 1;
        return wb - wa || a.cost - b.cost || (a.key < b.key ? -1 : 1);
      });
    if (!options.length) break;
    world = raiseAttribute(world, options[0]!.key);
  }
  return world;
}

const percentile = (values: number[], value: number) =>
  Math.round((100 * values.filter((v) => v < value).length) / values.length);
function topAttributes(player: Player, count = 6): string {
  const source = player.primaryPosition === 'GK' ? player.keeperAttributes : player.attributes;
  return Object.entries(source)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ');
}

/**
 * A player who spends: with savings above twice the price, buy the dearest car or home not
 * owned, hire staff, fund a charity. Returns what was spent this week.
 */
function shop(world: World, commit: (next: World) => void): number {
  const career = world.career!;
  const cash = career.market.finances.cash;
  const owned = new Set(career.style.assets.map((asset) => asset.itemId));
  const level = careerFameLevel(world);
  const candidates = LIFESTYLE.filter(
    (item) =>
      item.fameLevel <= level &&
      !owned.has(item.id) &&
      item.kind !== 'investment' &&
      item.kind !== 'experience',
  )
    .map((item) => ({ item, price: priceOf(world, item) }))
    .filter(({ price }) => price * 2 <= cash)
    .sort((a, b) => b.price - a.price || (a.item.id < b.item.id ? -1 : 1));
  const pick = candidates[0];
  if (!pick) return 0;
  commit(applyLifestyleAction(world, { type: 'buy-asset', itemId: pick.item.id }));
  return pick.price;
}
/**
 * The Hall of Fame points an award credits, and the same award's points in a tier-1 league:
 * equal points below tier 2 mean the award counts at full weight (finding C1).
 */
function awardPointsOf(world: World, award: Award) {
  const tier = award.competitionId ? (world.leagues[award.competitionId]?.tier ?? null) : null;
  const tierOne = Object.values(world.leagues).find((league) => league.tier === 1);
  const twin: Award = { ...award, competitionId: tierOne?.id ?? award.competitionId };
  return {
    kind: award.kind,
    tier,
    points: awardAchievement(award),
    tierOnePoints: awardAchievement(twin),
  };
}

export function runProfile(
  seed: string,
  position: Position,
  specialise: boolean,
  log: (line: string) => void = () => {},
  policy: Policy = 'default',
): CareerProfile {
  const archetype = ARCHETYPES[position] ?? 'box-to-box';
  const draft: CareerDraft = {
    name: 'Profile Vale',
    avatar: {
      face: 1,
      skin: 2,
      hair: 3,
      hairColor: 4,
      facialHair: 0,
      eyebrows: 1,
      eyes: 2,
      accessory: 3,
    },
    nationalityId: 'country:0',
    position,
    foot: 'right',
    age: 17,
    archetype,
  };
  let world = generateWorld(seed);
  const trial = trialOffers(world, draft.nationalityId, `${seed}:career:0`)[0]!;
  world = createCareer(world, draft, trial.id, `${seed}:career`);
  const state = freshPolicy();
  const profile: CareerProfile = {
    seed,
    position,
    archetype,
    specialise,
    policy,
    seasons: [],
    legacy: null,
    calibration: {},
  };
  const buckets: Record<string, { n: number; p: number; s: number }> = {};
  for (let guard = 0; guard < 25; guard++) {
    const offers = new Set<Id>();
    const actions: Record<string, number> = {};
    const note = (action: string) => (actions[action] = (actions[action] ?? 0) + 1);
    let injuryWeeks = 0;
    let weeks = 0;
    let lowTrustWeeks = 0;
    let spent = 0;
    let injuries = 0;
    let sponsorIncome = 0;
    let earned = 0;
    const earningsBefore = world.career?.market.finances.lifetimeEarnings ?? 0;
    while (world.phase === 'active') {
      if (world.career) {
        const plan = policyPlan(policy, world.players[world.career.playerId]!);
        if (plan) world.career.training = plan;
        if (policy === 'social')
          world.career.training.commitments = ['team-social', 'community', 'family'];
        if (policy === 'delegate') world.career.training.commitments = suggestCommitments(world);
        if (specialise && policy !== 'no-points') world = specialisedSpend(world, position);
        world = decide(world, state, note, POLICIES[policy]);
      }
      for (const offer of world.offers) offers.add(offer.id);
      if (world.career) spent += shop(world, (next) => (world = next));
      const played = { season: world.date.season, week: world.date.week };
      if (world.career)
        sponsorIncome += world.sponsorships
          .filter((deal) => deal.status === 'active')
          .reduce((sum, deal) => sum + deal.weeklyFee, 0);
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
      weeks++;
      if (managerTrust(world) < 70) lowTrustWeeks++;
      const injury = world.career?.injury;
      if (injury && injury.started.week === world.date.week - 1) {
        injuries++;
        injuryWeeks += injury.weeksRemaining;
      }
      // The decisions of the week just played, each once. (A key of season, week, family, odds
      // and result merged a keeper's identical saves at capped odds, review phase 6, and so
      // understated success at high odds.)
      for (const sample of world.career?.coaching?.recent ?? []) {
        if (sample.season !== played.season || sample.week !== played.week) continue;
        const bucket = `${sample.family}:${Math.floor(sample.probability * 5) * 20}`;
        buckets[bucket] ??= { n: 0, p: 0, s: 0 };
        buckets[bucket].n++;
        buckets[bucket].p += sample.probability;
        buckets[bucket].s += sample.success ? 1 : 0;
      }
    }
    const career = world.career!;
    earned = career.market.finances.lifetimeEarnings - earningsBefore;
    const player = world.players[career.playerId]!;
    const age = world.date.season - player.birthSeason;
    const club = world.clubs[player.clubId!]!;
    // A club below the simulated frontier has a placeholder league id.
    const league = world.leagues[club.leagueId] ?? {
      tier: 7,
      standings: [] as { clubId: string }[],
    };
    const contract = player.contractId ? world.contracts[player.contractId] : null;
    const matches = career.matches.filter((m) => m.season === world.date.season && m.minutes > 0);
    const abilities = Object.values(world.players)
      .filter((p) => !p.retired)
      .map(playerAbility);
    const squad = club.playerIds.map((id) => playerAbility(world.players[id]!));
    const ability = playerAbility(player);
    const rivalry = world.rivalries.find((r) => r.careerPlayerId === player.id);
    const rival = rivalry ? world.players[rivalry.rivalPlayerId] : null;
    const season: SeasonProfile = {
      season: world.date.season,
      age,
      level: career.level,
      xp: career.xp,
      ability: Math.round(ability * 10) / 10,
      potential: player.potential,
      worldPercentile: percentile(abilities, ability),
      squadRank: squad.filter((v) => v > ability).length + 1,
      squadSize: squad.length,
      top: topAttributes(player),
      club: club.name,
      tier: league.tier,
      clubReputation: club.reputation,
      leaguePlace: league.standings.findIndex((s) => s.clubId === club.id) + 1,
      leagueSize: league.standings.length,
      role: contract?.role ?? null,
      wage: contract?.weeklyWage ?? null,
      cash: Math.round(career.market.finances.cash),
      earnings: Math.round(career.market.finances.lifetimeEarnings),
      fame: Math.round(career.fame),
      fameLevel: fameLevel(career.fame),
      apps: matches.length,
      starts: matches.filter((m) => m.minutes >= 60).length,
      minutes: matches.reduce((sum, m) => sum + m.minutes, 0),
      goals: matches.reduce((sum, m) => sum + m.goals, 0),
      assists: matches.reduce((sum, m) => sum + m.assists, 0),
      rating: matches.length
        ? Math.round((matches.reduce((sum, m) => sum + m.rating, 0) / matches.length) * 100) / 100
        : null,
      injuries,
      injuryWeeks,
      morale: Math.round(player.morale),
      form: Math.round(player.form),
      trust: Math.round(managerTrust(world)),
      fans: Math.round(relationshipValue(world, 'fans', club.id)),
      rivalAbility: rival ? Math.round(playerAbility(rival) * 10) / 10 : null,
      rivalTier: rival?.clubId ? world.leagues[world.clubs[rival.clubId]!.leagueId]!.tier : null,
      awards: world.awards
        .filter((a) => a.season === world.date.season && a.winnerIds.includes(player.id))
        .map((a) => a.kind),
      trophies: world.trophies.filter(
        (t) => t.season === world.date.season && t.playerIds.includes(player.id),
      ).length,
      caps: Object.values(career.honours.caps).reduce((sum, value) => sum + value, 0),
      offers: offers.size,
      declined: Object.entries(actions)
        .filter(([key]) => key.startsWith('decline-'))
        .reduce((sum, [, count]) => sum + count, 0),
      trustBelow70: Math.round((100 * lowTrustWeeks) / Math.max(1, weeks)) / 100,
      spent,
      owned: career.style.assets.length,
      actions,
      championXI: Object.values(world.leagues)
        .filter((l) => l.tier === 1 && l.standings.length)
        .map((l) => {
          const champion = world.clubs[l.standings[0]!.clubId]!;
          const xi = champion.playerIds
            .map((id) => playerAbility(world.players[id]!))
            .sort((a, b) => b - a)
            .slice(0, 11);
          return Math.round(xi.reduce((sum, v) => sum + v, 0) / xi.length);
        }),
      players85: abilities.filter((v) => v >= 85).length,
      players90: abilities.filter((v) => v >= 90).length,
      sponsorIncome: Math.round(sponsorIncome),
      footballIncome: Math.round(Math.max(0, earned - sponsorIncome)),
      awardPoints: world.awards
        .filter((a) => a.season === world.date.season && a.winnerIds.includes(player.id))
        .map((award) => awardPointsOf(world, award)),
      growth: (() => {
        const { playing, training, points, skills, decline } = growthOf(career, world.date.season);
        return { playing, training, points, skills, decline };
      })(),
    };
    profile.seasons.push(season);
    log(
      `${season.season} age ${age} level ${season.level} ability ${season.ability} (${season.worldPercentile}%, ${season.squadRank}/${season.squadSize}) T${season.tier} ${season.club} ${season.role} ${season.wage} · ${season.apps} apps ${season.goals} g ${season.assists} a ${season.rating} · fame ${season.fame} · rival ${season.rivalAbility} T${season.rivalTier} · caps ${season.caps}`,
    );
    const rule = retirementState(world);
    if (rule === 'forced' || (rule === 'available' && age >= RETIRE_AGE)) {
      world = applyHonoursAction(world, { type: 'retire' });
      profile.legacy = world.legacies.at(-1) as unknown as Record<string, unknown>;
      break;
    }
    world = startNextSeason(world, { inPlace: true });
    if (!world.career) break;
  }
  profile.calibration = Object.fromEntries(
    Object.entries(buckets).map(([key, v]) => [
      key,
      { n: v.n, stated: Math.round((100 * v.p) / v.n), actual: Math.round((100 * v.s) / v.n) },
    ]),
  );
  return profile;
}

/**
 * The gates. Each returns a problem, or null when it holds, over all recorded profiles, and
 * shows what it measured (review phase 6): the raw values, and for a share of careers a 95%
 * Wilson interval, so a pass on few profiles is read for what it is.
 */
type Gate = {
  name: string;
  check: (profiles: CareerProfile[]) => string | null;
  /** The values the gate judges, one per career (or season), for the distribution. */
  values?: (profiles: CareerProfile[]) => number[];
  /** For a gate on a share of careers: how many of how many. */
  share?: (profiles: CareerProfile[]) => { hits: number; of: number };
};
/** A 95% Wilson score interval for a share. */
export function wilson(hits: number, of: number): [number, number] {
  if (!of) return [0, 1];
  const z = 1.96;
  const p = hits / of;
  const centre = (p + (z * z) / (2 * of)) / (1 + (z * z) / of);
  const half = (z * Math.sqrt((p * (1 - p)) / of + (z * z) / (4 * of * of))) / (1 + (z * z) / of);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
const quartiles = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!;
  return sorted.length
    ? `n ${sorted.length}: min ${q(0)} · p25 ${q(0.25)} · median ${q(0.5)} · p75 ${q(0.75)} · max ${sorted.at(-1)}`
    : 'n 0';
};
const at = (profile: CareerProfile, age: number) =>
  profile.seasons.find((season) => season.age === age);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : Number.NaN;
};
export const GATES: Gate[] = [
  {
    // Phase A: one ability scale. A career reaches the top tier's level by its mid-twenties.
    name: 'ability at 25 (median ≥ 68, every career ≥ 60)',
    check: (profiles) => {
      const values = profiles.map((p) => at(p, 25)?.ability ?? 0);
      const low = Math.min(...values);
      return median(values) >= 68 && low >= 60 ? null : `median ${median(values)}, lowest ${low}`;
    },
    values: (profiles) => profiles.map((p) => at(p, 25)?.ability ?? 0),
  },
  {
    // Tier 1 itself (review phase 6): this gate once accepted tier 2.
    name: 'top tier (tier 1) reached by 27 in most careers',
    check: (profiles) => {
      const reached = profiles.filter((p) =>
        p.seasons.some((s) => s.age <= 27 && s.tier === 1),
      ).length;
      return reached * 2 >= profiles.length ? null : `${reached} of ${profiles.length}`;
    },
    share: (profiles) => ({
      hits: profiles.filter((p) => p.seasons.some((s) => s.age <= 27 && s.tier === 1)).length,
      of: profiles.length,
    }),
    // The age each career first played in tier 1 (careers that never did are in the share).
    values: (profiles) =>
      profiles.flatMap((p) => {
        const age = p.seasons.find((s) => s.tier === 1)?.age;
        return age === undefined ? [] : [age];
      }),
  },
  {
    name: 'tier 2 or better reached by 25 in most careers',
    check: (profiles) => {
      const reached = profiles.filter((p) =>
        p.seasons.some((s) => s.age <= 25 && s.tier <= 2),
      ).length;
      return reached * 2 >= profiles.length ? null : `${reached} of ${profiles.length}`;
    },
    share: (profiles) => ({
      hits: profiles.filter((p) => p.seasons.some((s) => s.age <= 25 && s.tier <= 2)).length,
      of: profiles.length,
    }),
  },
  {
    name: 'playing time: median appearances at 21–25 ≥ 20 a season',
    check: (profiles) => {
      const values = profiles.flatMap((p) =>
        p.seasons.filter((s) => s.age >= 21 && s.age <= 25).map((s) => s.apps),
      );
      return median(values) >= 20 ? null : `median ${median(values)}`;
    },
    values: (profiles) =>
      profiles.flatMap((p) =>
        p.seasons.filter((s) => s.age >= 21 && s.age <= 25).map((s) => s.apps),
      ),
  },
  {
    name: 'specialised and balanced builds end within 10 ability points',
    check: (profiles) => {
      const peak = (p: CareerProfile) => Math.max(...p.seasons.map((s) => s.ability));
      const special = profiles.filter((p) => p.specialise).map(peak);
      const balanced = profiles.filter((p) => !p.specialise).map(peak);
      if (!special.length || !balanced.length) return null;
      const gap = Math.abs(median(special) - median(balanced));
      return gap <= 10 ? null : `gap ${gap.toFixed(1)}`;
    },
  },
  {
    // Pass D: offers are not spam, standing has to be kept up, money has somewhere to go,
    // and honours come at the right level.
    name: 'offers: at most 60 declined over a career',
    check: (profiles) => {
      // The default player only: a loyal policy declines every offer by design.
      const off = profiles
        .filter((p) => (p.policy ?? 'default') === 'default')
        .map((p) => ({ p, declined: p.seasons.reduce((sum, s) => sum + s.declined, 0) }))
        .filter(({ declined }) => declined > 60)
        .map(({ p, declined }) => `${p.seed} ${declined}`);
      return off.length ? off.join('; ') : null;
    },
  },
  {
    name: 'standing has to be kept up: trust below 70 in at least 15% of weeks',
    check: (profiles) => {
      const values = profiles.map(
        (p) => p.seasons.reduce((sum, s) => sum + s.trustBelow70, 0) / p.seasons.length,
      );
      return median(values) >= 0.15 ? null : `median ${Math.round(median(values) * 100)}%`;
    },
    values: (profiles) =>
      profiles.map(
        (p) =>
          Math.round(
            (p.seasons.reduce((sum, s) => sum + s.trustBelow70, 0) / p.seasons.length) * 100,
          ) / 100,
      ),
  },
  {
    name: 'money has somewhere to go: the spender puts at least 20% of earnings into the lifestyle',
    check: (profiles) => {
      const values = profiles.map((p) => {
        const spent = p.seasons.reduce((sum, s) => sum + s.spent, 0);
        const earnings = p.seasons.at(-1)?.earnings ?? 0;
        return earnings ? spent / earnings : 0;
      });
      return median(values) >= 0.2 ? null : `median ${Math.round(median(values) * 100)}%`;
    },
  },
  {
    name: 'no national award for a season below tier 3',
    check: (profiles) => {
      const off = profiles.flatMap((p) =>
        p.seasons
          .filter(
            (s) => s.tier >= 4 && s.awards.some((a) => a === 'young-player' || a === 'golden-ball'),
          )
          .map((s) => `${p.seed} ${s.season} tier ${s.tier}: ${s.awards.join(', ')}`),
      );
      return off.length ? off.join('; ') : null;
    },
  },
  {
    name: CALIBRATION_GATE,
    check: (profiles) => {
      const off = profiles.flatMap((p) => calibrationProblems(p.calibration, String(p.seed)));
      return off.length ? off.join('; ') : null;
    },
  },
];

/**
 * The 1.0 career targets (docs/RELEASE-1.0-PLAN.md step 2.3). Phase 7 meets them and sets
 * `asserted: true`. The bands marked "proposed" are this step's proposals, to be agreed in phase
 * 7 (docs/BALANCING.md, "1.0 targets").
 */
export const TARGET_BANDS = {
  /**
   * Proposed: each line's median Hall of Fame rank within this factor of the striker careers'
   * median rank, either way (an order of magnitude, among some 60,000 ranked players).
   */
  honoursFactor: 10,
  /** Median age at fame level 10. */
  fameTenAge: 27,
  /** Fan affection pinned: at or above this, in at most this share of seasons from 25. */
  fansPinned: 95,
  fansPinnedShare: 0.5,
  fansFromAge: 25,
  /**
   * Proposed: with the sponsor-accepting policy, lifetime earnings at each age within this
   * multiple of the football income (wages, bonuses, transfers) earned by then.
   */
  wealthMultiple: { 21: 1.25, 25: 1.5, 29: 2 } as Record<number, number>,
} as const;
const LINES: Partial<Record<Position, string>> = {
  GK: 'keeper',
  CB: 'defender',
  LB: 'defender',
  RB: 'defender',
  DM: 'midfielder',
  CM: 'midfielder',
  AM: 'midfielder',
  ST: 'striker',
};
const policyOf = (profile: CareerProfile) => profile.policy ?? 'default';
/** Policies added for the 1.0 targets (C19): judged by the targets, not by the gates. */
const TARGET_POLICIES: ReadonlySet<string> = new Set(['sponsor', 'stories', 'press', 'human']);
/** The retired career's Hall of Fame rank and score (null before retirement). */
const hallOfFame = (profile: CareerProfile) =>
  (profile.legacy as { hallOfFame?: { rank: number; of: number; score: number } } | null)
    ?.hallOfFame ?? null;
/** The age a career first reached fame level 10 (Infinity when it never did). */
const fameTenAge = (profile: CareerProfile) =>
  profile.seasons.find((season) => season.fameLevel >= 10)?.age ?? Number.POSITIVE_INFINITY;
/** Lifetime earnings over football income, by the end of the season at `age`. */
function wealthMultiple(profile: CareerProfile, age: number): number | null {
  const upTo = profile.seasons.filter((season) => season.age <= age);
  if (!upTo.length || upTo.at(-1)!.age !== age || upTo.some((s) => s.footballIncome === undefined))
    return null;
  const football = upTo.reduce((sum, season) => sum + season.footballIncome!, 0);
  const sponsors = upTo.reduce((sum, season) => sum + season.sponsorIncome!, 0);
  return football ? (football + sponsors) / football : null;
}
const percent = (value: number) => `${Math.round(value * 100)}%`;
export const TARGETS: Target<CareerProfile[]>[] = [
  {
    id: 'honours-fairness',
    name: `honours fairness: median Hall of Fame rank of keeper, defender and midfielder careers within ×${TARGET_BANDS.honoursFactor} of striker careers' (proposed band)`,
    phase: 7,
    asserted: false,
    evaluate: (profiles) => {
      const retired = profiles.filter((p) => policyOf(p) === 'default' && hallOfFame(p));
      const byLine = new Map<string, number[]>();
      for (const profile of retired) {
        const line = LINES[profile.position];
        if (line) byLine.set(line, [...(byLine.get(line) ?? []), hallOfFame(profile)!.rank]);
      }
      const striker = byLine.get('striker');
      const describe = [...byLine.entries()]
        .map(([line, ranks]) => {
          const scores = retired
            .filter((p) => LINES[p.position] === line)
            .map((p) => hallOfFame(p)!.score);
          return `${line} #${ranks.join('/#')} (score ${scores.join('/')})`;
        })
        .join(', ');
      const others = ['keeper', 'defender', 'midfielder'].filter((line) => byLine.has(line));
      if (!striker || !others.length)
        return {
          met: null,
          value: `needs retired striker and other careers: ${describe || 'none'}`,
        };
      const reference = middle(striker);
      const off = others.filter((line) => {
        const ratio = middle(byLine.get(line)!) / reference;
        return !within(ratio, 1 / TARGET_BANDS.honoursFactor, TARGET_BANDS.honoursFactor);
      });
      const missing = ['keeper', 'defender', 'midfielder'].filter((line) => !byLine.has(line));
      return {
        met: off.length ? false : missing.length ? null : true,
        value: `${describe}${off.length ? `; outside the band: ${off.join(', ')}` : ''}${missing.length ? `; not measured: ${missing.join(', ')}` : ''}`,
      };
    },
  },
  {
    id: 'award-tier-weight',
    name: 'honours fairness: no award below tier 2 counted at full weight',
    phase: 7,
    asserted: false,
    evaluate: (profiles) => {
      const below = profiles.flatMap((p) =>
        p.seasons.flatMap((s) =>
          (s.awardPoints ?? [])
            .filter((award) => award.tier !== null && award.tier > 2)
            .map((award) => ({ ...award, seed: p.seed, season: s.season })),
        ),
      );
      if (!profiles.some((p) => p.seasons.some((s) => s.awardPoints)))
        return { met: null, value: 'no award data (rerun the profiles)' };
      const full = below.filter((award) => award.points > 0 && award.points >= award.tierOnePoints);
      return {
        met: full.length === 0,
        value: `${full.length} of ${below.length} awards below tier 2 at full weight${
          full.length
            ? ` (${full
                .slice(0, 6)
                .map((a) => `${a.seed} ${a.season} ${a.kind} tier ${a.tier}: ${a.points}`)
                .join('; ')}${full.length > 6 ? '; …' : ''})`
            : ''
        }`,
      };
    },
  },
  {
    id: 'prime-fame',
    name: `prime years: median age at fame level 10 ≥ ${TARGET_BANDS.fameTenAge}`,
    phase: 7,
    asserted: false,
    evaluate: (profiles) => {
      const ages = profiles.filter((p) => policyOf(p) === 'default').map(fameTenAge);
      if (!ages.length) return { met: null, value: 'no default-policy careers' };
      const value = middle(ages);
      return {
        met: value >= TARGET_BANDS.fameTenAge,
        value: `median ${value} (${ages.map((a) => (Number.isFinite(a) ? a : 'never')).join(', ')})`,
      };
    },
  },
  {
    id: 'prime-fans',
    name: `prime years: fan affection not pinned at ≥ ${TARGET_BANDS.fansPinned} for more than half of seasons from ${TARGET_BANDS.fansFromAge} (median career)`,
    phase: 7,
    asserted: false,
    evaluate: (profiles) => {
      const shares = profiles
        .filter((p) => policyOf(p) === 'default')
        .map((p) => p.seasons.filter((s) => s.age >= TARGET_BANDS.fansFromAge))
        .filter((seasons) => seasons.length)
        .map(
          (seasons) =>
            seasons.filter((s) => s.fans >= TARGET_BANDS.fansPinned).length / seasons.length,
        );
      if (!shares.length) return { met: null, value: 'no seasons from 25' };
      const value = middle(shares);
      return {
        met: value <= TARGET_BANDS.fansPinnedShare,
        value: `median ${percent(value)} of seasons pinned (${shares.map(percent).join(', ')})`,
      };
    },
  },
  {
    id: 'economy',
    name: 'economy: with the sponsor-accepting policy, lifetime earnings at 21, 25 and 29 within ×1.25, ×1.5 and ×2 of football income (proposed band, C19)',
    phase: 7,
    asserted: false,
    evaluate: (profiles) => {
      const sponsored = profiles.filter(
        (p) => policyOf(p) === 'sponsor' || policyOf(p) === 'human',
      );
      if (!sponsored.length)
        return { met: null, value: 'no sponsor-accepting careers (run --policy sponsor)' };
      const parts: string[] = [];
      let met = true;
      for (const [age, limit] of Object.entries(TARGET_BANDS.wealthMultiple)) {
        const values = sponsored
          .map((p) => wealthMultiple(p, Number(age)))
          .filter((v): v is number => v !== null);
        if (!values.length) continue;
        const value = middle(values);
        met &&= value <= limit;
        const cash = sponsored
          .map((p) => p.seasons.find((s) => s.age === Number(age))?.cash)
          .filter((v): v is number => v !== undefined);
        parts.push(
          `at ${age} ×${value.toFixed(2)} (cash ${cash.map((c) => `${Math.round(c / 1000)}k`).join('/')})`,
        );
      }
      return parts.length
        ? { met, value: parts.join(', ') }
        : { met: null, value: 'no income data (rerun the profiles)' };
    },
  },
];

function check(): void {
  // Career profiles only: the match and world profiles live beside them.
  const files = readdirSync(OUT_DIR).filter(
    (name) => name.endsWith('.json') && !name.startsWith('world-') && name !== 'matches.json',
  );
  const profiles = files.map(
    (name) => JSON.parse(readFileSync(`${OUT_DIR}/${name}`, 'utf8')) as CareerProfile,
  );
  if (!profiles.length) throw new Error(`No profiles in ${OUT_DIR}`);
  console.log(`${profiles.length} profiles: ${files.join(', ')}`);
  // The C19 policies feed the 1.0 targets only; the gates keep judging the careers they did.
  const gated = profiles.filter((p) => !TARGET_POLICIES.has(policyOf(p)));
  if (gated.length < profiles.length)
    console.log(
      `Gates over ${gated.length}; ${profiles.length - gated.length} for the targets only.`,
    );
  let failed = 0;
  for (const gate of GATES) {
    const problem = gate.check(gated);
    console.log(`${problem ? 'FAIL' : 'ok  '} ${gate.name}${problem ? ` — ${problem}` : ''}`);
    if (gate.share) {
      const { hits, of } = gate.share(gated);
      const [low, high] = wilson(hits, of);
      console.log(
        `       ${hits} of ${of} (${Math.round((100 * hits) / of)}%), 95% interval ${Math.round(low * 100)}–${Math.round(high * 100)}%`,
      );
    }
    if (gate.values) console.log(`       ${quartiles(gate.values(gated))}`);
    if (problem) failed++;
  }
  // The 1.0 targets: reported until their phase asserts them.
  failed += printTargets(evaluateTargets(TARGETS, profiles, assertAllTargets()));
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/career-profile.ts')) {
  if (process.argv.includes('--check')) check();
  else {
    const seed = argument('seed') ?? 'profile';
    const position = (argument('position') ?? 'ST') as Position;
    const specialise = process.argv.includes('--specialise');
    const policy = (argument('policy') ?? 'default') as Policy;
    if (!(policy in POLICIES)) throw new Error(`Unknown policy ${policy}`);
    const profile = runProfile(seed, position, specialise, (line) => console.log(line), policy);
    mkdirSync(OUT_DIR, { recursive: true });
    const path = `${OUT_DIR}/${seed}-${position}${specialise ? '-specialised' : ''}${policy === 'default' ? '' : `-${policy}`}.json`;
    writeFileSync(path, JSON.stringify(profile, null, 2));
    console.log(`Profile: ${path}`);
  }
}
