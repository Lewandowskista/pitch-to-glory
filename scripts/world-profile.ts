/**
 * World profile (balance gate, docs/GAME-DESIGN-REVIEW.md Phase C). Simulates a national
 * world for several seasons without a career and reports how the world moves: title races,
 * the favourite's edge, squad rotation, whether goals follow ability, reputation mobility,
 * transfers, sackings and the top of the ability distribution. A check mode asserts the gates.
 *
 *   npm run profile:world -- --seasons 12 --seed review-world
 *   npm run profile:world -- --check
 *
 * Writes artifacts/profile/world-<seed>.json.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Id } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { playerAbility } from '../src/engine/strength';
import { rankStandings } from '../src/engine/world/ranking';

const OUT_DIR = 'artifacts/profile';

export interface SeasonMeasures {
  season: number;
  /** Median points of the tier-1 champions, and their points as a share of the maximum. */
  championPoints: number;
  championShare: number;
  /** Tier-1 league matches won by the side with the higher reputation (home or away). */
  favouriteWins: number;
  favouriteMatches: number;
  /** Tier-1 squad members with at least five appearances, over all tier-1 squad members. */
  rotated: number;
  squadMembers: number;
  /** Spearman rank correlation between season goals and finishing among tier-1 strikers. */
  goalsFinishing: number;
  transfers: number;
  transfersWithFee: number;
  sackings: number;
  freeAgents: number;
  players85: number;
  players90: number;
  injured: number;
  tierMeanAbility: number[];
  /** Players injured in week 30 (season-end counts heal through the postseason). */
  injuredNote?: string;
  /** Clubs whose reputation changed by at least one point this season. */
  reputationMoved: number;
  /** Spread of reputations within tier 1 (max − min). */
  tier1ReputationSpread: number;
  negativeBalanceClubs: number;
}
export interface WorldProfile {
  seed: string;
  seasons: SeasonMeasures[];
  /** Distinct tier-1 champions per country over the run. */
  distinctChampions: Record<string, number>;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : Number.NaN;
};
function spearman(pairs: [number, number][]): number {
  if (pairs.length < 3) return Number.NaN;
  const rank = (values: number[]) => {
    const order = values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(values.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j++;
      const shared = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k]!.index] = shared;
      i = j + 1;
    }
    return ranks;
  };
  const a = rank(pairs.map((p) => p[0]));
  const b = rank(pairs.map((p) => p[1]));
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : Number.NaN;
}

export function runWorldProfile(
  seed: string,
  seasons: number,
  log: (line: string) => void = () => {},
): WorldProfile {
  let world = generateWorld(seed);
  const profile: WorldProfile = { seed, seasons: [], distinctChampions: {} };
  const champions = new Map<string, Set<Id>>();
  for (let index = 0; index < seasons; index++) {
    const appearancesBefore = new Map<Id, number>();
    const goalsBefore = new Map<Id, number>();
    const reputationBefore = new Map<Id, number>();
    for (const player of Object.values(world.players)) {
      appearancesBefore.set(player.id, player.stats.appearances);
      goalsBefore.set(player.id, player.stats.goals);
    }
    for (const club of Object.values(world.clubs)) reputationBefore.set(club.id, club.reputation);
    let transfers = 0;
    let transfersWithFee = 0;
    let sackings = 0;
    let eventsSeen = world.events.length;
    let injuredMidSeason = 0;
    while (world.phase === 'active') {
      world = simulateWeek(world, { inPlace: true, allowCareerFixture: true });
      if (world.date.week === 30)
        injuredMidSeason = Object.values(world.players).filter((p) => p.injuryId).length;
      for (const event of world.events.slice(eventsSeen)) {
        if (event.kind === 'transfer') {
          transfers++;
          if (Number(event.params?.fee ?? 0) > 0) transfersWithFee++;
        }
        if (event.kind === 'manager-change') sackings++;
      }
      eventsSeen = world.events.length;
    }
    const tier1 = Object.values(world.leagues).filter((league) => league.tier === 1);
    const points: number[] = [];
    const shares: number[] = [];
    let favouriteWins = 0;
    let favouriteMatches = 0;
    for (const league of tier1) {
      const table = rankStandings(world, league.standings);
      const top = table[0]!;
      points.push(top.points);
      shares.push(top.points / (3 * top.played));
      const set = champions.get(league.id) ?? new Set<Id>();
      set.add(top.clubId);
      champions.set(league.id, set);
      for (const id of league.fixtureIds) {
        const fixture = world.fixtures[id];
        const result = world.results[id];
        if (!fixture || !result || result.winnerId === null) continue;
        const home = world.clubs[fixture.homeId]!;
        const away = world.clubs[fixture.awayId]!;
        if (home.reputation === away.reputation) continue;
        favouriteMatches++;
        const favourite = home.reputation > away.reputation ? home.id : away.id;
        if (result.winnerId === favourite) favouriteWins++;
      }
    }
    const tier1Clubs = tier1.flatMap((league) => league.clubIds.map((id) => world.clubs[id]!));
    const members = tier1Clubs.flatMap((club) => club.playerIds.map((id) => world.players[id]!));
    const rotated = members.filter(
      (player) => player.stats.appearances - (appearancesBefore.get(player.id) ?? 0) >= 5,
    ).length;
    const strikers = members.filter((player) => player.primaryPosition === 'ST');
    const goalsFinishing = spearman(
      strikers.map((player) => [
        player.stats.goals - (goalsBefore.get(player.id) ?? 0),
        player.attributes.finishing,
      ]),
    );
    const active = Object.values(world.players).filter((player) => !player.retired);
    const abilities = active.map(playerAbility);
    const tierMeans: number[] = [];
    for (let tier = 1; tier <= 6; tier++) {
      const values = Object.values(world.leagues)
        .filter((league) => league.tier === tier)
        .flatMap((league) => league.clubIds.flatMap((id) => world.clubs[id]!.playerIds))
        .map((id) => playerAbility(world.players[id]!));
      if (values.length)
        tierMeans.push(Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10);
    }
    const tier1Reputations = tier1Clubs.map((club) => club.reputation);
    const measures: SeasonMeasures = {
      season: world.date.season,
      championPoints: median(points),
      championShare: Math.round(median(shares) * 1000) / 1000,
      favouriteWins,
      favouriteMatches,
      rotated,
      squadMembers: members.length,
      goalsFinishing: Math.round(goalsFinishing * 100) / 100,
      transfers,
      transfersWithFee,
      sackings,
      freeAgents: active.filter((player) => !player.clubId).length,
      players85: abilities.filter((v) => v >= 85).length,
      players90: abilities.filter((v) => v >= 90).length,
      injured: injuredMidSeason,
      tierMeanAbility: tierMeans,
      reputationMoved: Object.values(world.clubs).filter(
        (club) =>
          Math.abs(club.reputation - (reputationBefore.get(club.id) ?? club.reputation)) >= 1,
      ).length,
      tier1ReputationSpread: Math.max(...tier1Reputations) - Math.min(...tier1Reputations),
      negativeBalanceClubs: Object.values(world.clubs).filter((club) => club.finances.balance <= 0)
        .length,
    };
    profile.seasons.push(measures);
    log(
      `${measures.season}: champions ${measures.championPoints} pts (${Math.round(measures.championShare * 100)}%) · favourite ${Math.round((100 * favouriteWins) / Math.max(1, favouriteMatches))}% · rotated ${Math.round((100 * rotated) / members.length)}% · goals~finishing ${measures.goalsFinishing} · transfers ${transfers} (${transfersWithFee} with fee) · sackings ${sackings} · free agents ${measures.freeAgents} · 85+ ${measures.players85} 90+ ${measures.players90} · injured ${measures.injured} · tiers ${tierMeans.join('/')} · reputation moved ${measures.reputationMoved} · T1 spread ${measures.tier1ReputationSpread} · broke ${measures.negativeBalanceClubs}`,
    );
    world = startNextSeason(world, { inPlace: true });
  }
  profile.distinctChampions = Object.fromEntries(
    [...champions.entries()].map(([id, set]) => [world.leagues[id]?.name ?? id, set.size]),
  );
  return profile;
}

type Gate = { name: string; check: (profiles: WorldProfile[]) => string | null };
const last = (profile: WorldProfile, count: number) => profile.seasons.slice(-count);
export const GATES: Gate[] = [
  {
    name: 'tier-1 champions take at least 60% of their points (median over the run)',
    check: (profiles) => {
      const values = profiles.flatMap((p) => p.seasons.map((s) => s.championShare));
      return median(values) >= 0.6 ? null : `median ${median(values)}`;
    },
  },
  {
    name: 'the higher-reputation side wins at least 50% of decided tier-1 matches',
    check: (profiles) => {
      const wins = profiles.flatMap((p) => p.seasons).reduce((s, m) => s + m.favouriteWins, 0);
      const matches = profiles
        .flatMap((p) => p.seasons)
        .reduce((s, m) => s + m.favouriteMatches, 0);
      return wins / matches >= 0.5 ? null : `${Math.round((100 * wins) / matches)}%`;
    },
  },
  {
    name: 'at least 60% of tier-1 squad members make five appearances in a season',
    check: (profiles) => {
      const values = profiles.flatMap((p) => p.seasons.map((s) => s.rotated / s.squadMembers));
      return median(values) >= 0.6 ? null : `median ${Math.round(median(values) * 100)}%`;
    },
  },
  {
    name: 'goals follow finishing among tier-1 strikers (Spearman ≥ 0.3)',
    check: (profiles) => {
      const values = profiles.flatMap((p) => p.seasons.map((s) => s.goalsFinishing));
      return median(values) >= 0.3 ? null : `median ${median(values)}`;
    },
  },
  {
    name: 'clubs move: at least 100 reputations change a season and transfers carry fees',
    check: (profiles) => {
      const moved = median(profiles.flatMap((p) => last(p, 3).map((s) => s.reputationMoved)));
      const fees = median(profiles.flatMap((p) => last(p, 3).map((s) => s.transfersWithFee)));
      return moved >= 100 && fees >= 100 ? null : `moved ${moved}, with fee ${fees}`;
    },
  },
  {
    name: 'sackings 40–200 a season across the world',
    check: (profiles) => {
      const values = profiles.flatMap((p) => last(p, 3).map((s) => s.sackings));
      const value = median(values);
      return value >= 40 && value <= 200 ? null : `${value}`;
    },
  },
  {
    name: 'someone reaches 90 and the tiers keep their level',
    check: (profiles) => {
      const problems: string[] = [];
      for (const p of profiles) {
        const final = p.seasons.at(-1)!;
        const first = p.seasons[0]!;
        if (final.players90 < 1) problems.push(`${p.seed}: ${final.players90} players at 90+`);
        first.tierMeanAbility.forEach((value, index) => {
          if (Math.abs(value - (final.tierMeanAbility[index] ?? value)) > 4)
            problems.push(
              `${p.seed}: tier ${index + 1} drifted ${value} → ${final.tierMeanAbility[index]}`,
            );
        });
      }
      return problems.length ? problems.join('; ') : null;
    },
  },
];

function check(): void {
  const files = readdirSync(OUT_DIR).filter(
    (name) => name.startsWith('world-') && name.endsWith('.json'),
  );
  const profiles = files.map(
    (name) => JSON.parse(readFileSync(`${OUT_DIR}/${name}`, 'utf8')) as WorldProfile,
  );
  if (!profiles.length) throw new Error(`No world profiles in ${OUT_DIR}`);
  console.log(`${profiles.length} profiles: ${files.join(', ')}`);
  let failed = 0;
  for (const gate of GATES) {
    const problem = gate.check(profiles);
    console.log(`${problem ? 'FAIL' : 'ok  '} ${gate.name}${problem ? ` — ${problem}` : ''}`);
    if (problem) failed++;
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/world-profile.ts')) {
  if (process.argv.includes('--check')) check();
  else {
    const seed = argument('seed') ?? 'review-world';
    const seasons = Number(argument('seasons') ?? 12);
    const profile = runWorldProfile(seed, seasons, (line) => console.log(line));
    console.log('Distinct champions:', JSON.stringify(profile.distinctChampions));
    mkdirSync(OUT_DIR, { recursive: true });
    const path = `${OUT_DIR}/world-${seed}.json`;
    writeFileSync(path, JSON.stringify(profile, null, 2));
    console.log(`Profile: ${path}`);
  }
}
