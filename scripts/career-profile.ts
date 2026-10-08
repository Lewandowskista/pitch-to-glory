/**
 * Career profile (balance gate, docs/GAME-DESIGN-REVIEW.md Phase E). Plays one career to
 * retirement with the soak policy and records, every season, the numbers that balancing is
 * judged by: ability and its place in the world, playing time, output, money, fame, honours,
 * the rival, and the key-moment calibration. A check mode reads every recorded profile and
 * asserts the gates.
 *
 *   npm run profile -- --seed review-a --position ST          one career (about seven minutes)
 *   npm run profile -- --seed review-b --position CM --specialise   points into the position's key attributes
 *   npm run profile -- --check                               assert the gates over artifacts/profile/*.json
 *
 * Writes artifacts/profile/<seed>-<position>.json.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Id, Player, Position, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { decide, freshPolicy } from './soak-career';
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
}
export interface CareerProfile {
  seed: string;
  position: Position;
  archetype: string;
  specialise: boolean;
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
export function runProfile(
  seed: string,
  position: Position,
  specialise: boolean,
  log: (line: string) => void = () => {},
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
    seasons: [],
    legacy: null,
    calibration: {},
  };
  const seen = new Set<string>();
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
    while (world.phase === 'active') {
      if (world.career) {
        if (specialise) world = specialisedSpend(world, position);
        world = decide(world, state, note);
      }
      for (const offer of world.offers) offers.add(offer.id);
      if (world.career) spent += shop(world, (next) => (world = next));
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
      weeks++;
      if (managerTrust(world) < 70) lowTrustWeeks++;
      const injury = world.career?.injury;
      if (injury && injury.started.week === world.date.week - 1) {
        injuries++;
        injuryWeeks += injury.weeksRemaining;
      }
      for (const sample of world.career?.coaching?.recent ?? []) {
        const key = `${sample.season}:${sample.week}:${sample.family}:${sample.probability}:${sample.success}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const bucket = `${sample.family}:${Math.floor(sample.probability * 5) * 20}`;
        buckets[bucket] ??= { n: 0, p: 0, s: 0 };
        buckets[bucket].n++;
        buckets[bucket].p += sample.probability;
        buckets[bucket].s += sample.success ? 1 : 0;
      }
    }
    const career = world.career!;
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

/** The gates. Each returns a problem, or null when it holds, over all recorded profiles. */
type Gate = { name: string; check: (profiles: CareerProfile[]) => string | null };
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
  },
  {
    name: 'top tier reached by 27 in most careers',
    check: (profiles) => {
      const reached = profiles.filter((p) =>
        p.seasons.some((s) => s.age <= 27 && s.tier <= 2),
      ).length;
      return reached * 2 >= profiles.length ? null : `${reached} of ${profiles.length}`;
    },
  },
  {
    name: 'playing time: median appearances at 21–25 ≥ 20 a season',
    check: (profiles) => {
      const values = profiles.flatMap((p) =>
        p.seasons.filter((s) => s.age >= 21 && s.age <= 25).map((s) => s.apps),
      );
      return median(values) >= 20 ? null : `median ${median(values)}`;
    },
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
      const off = profiles
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
    name: 'key-moment odds stay honest (within 7 points over 150 decisions, 5 over 500)',
    check: (profiles) => {
      const off = profiles.flatMap((p) =>
        Object.entries(p.calibration)
          .filter(
            ([, v]) =>
              (v.n >= 150 && Math.abs(v.stated - v.actual) > 7) ||
              (v.n >= 500 && Math.abs(v.stated - v.actual) > 5),
          )
          .map(([key, v]) => `${p.seed} ${key}: ${v.stated} vs ${v.actual}`),
      );
      return off.length ? off.join('; ') : null;
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
  let failed = 0;
  for (const gate of GATES) {
    const problem = gate.check(profiles);
    console.log(`${problem ? 'FAIL' : 'ok  '} ${gate.name}${problem ? ` — ${problem}` : ''}`);
    if (problem) failed++;
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/career-profile.ts')) {
  if (process.argv.includes('--check')) check();
  else {
    const seed = argument('seed') ?? 'profile';
    const position = (argument('position') ?? 'ST') as Position;
    const specialise = process.argv.includes('--specialise');
    const profile = runProfile(seed, position, specialise, (line) => console.log(line));
    mkdirSync(OUT_DIR, { recursive: true });
    const path = `${OUT_DIR}/${seed}-${position}${specialise ? '-specialised' : ''}.json`;
    writeFileSync(path, JSON.stringify(profile, null, 2));
    console.log(`Profile: ${path}`);
  }
}
