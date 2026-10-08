import type {
  Hex,
  InternationalMatch,
  InternationalState,
  Nation,
  NationalLevel,
  Player,
  Position,
  Tournament,
  World,
} from '../../../model/domain';
import { CONFIG } from '../../config';
import { createRng, type Rng } from '../../rng';
import { playerAbility } from '../../strength';
import { ageCurve } from '../../ageing';
import { getSeasonWeeks } from '../../world/calendar';
import { addXp } from '../progression';
import { postMessage } from '../market/records';
import { today } from '../market/rules';
import { chronicle } from './chronicle';

/**
 * International football (AGENTS.md §8): the world's countries pick squads from their own
 * players for the U19, U21 and senior levels, play in three windows a season, and contest a
 * tournament every two years (continental and world, alternating) between seasons. Guest
 * nations outside the simulated world have fixed ratings. Matches are simulated; the career
 * player's part (rating, goals, assists) counts toward caps, fame and XP.
 */
const I = CONFIG.career.honours.international;
const LEVELS: readonly NationalLevel[] = ['senior', 'U21', 'U19'];
type Line = 'GK' | 'DEF' | 'MID' | 'ATT';
const LINE: Record<Position, Line> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  DM: 'MID',
  CM: 'MID',
  AM: 'MID',
  LW: 'ATT',
  RW: 'ATT',
  ST: 'ATT',
};

const EUROPE_REAL: [string, number, Hex, Hex][] = [
  ['Netherlands', 79, '#f36c21', '#ffffff'],
  ['Belgium', 77, '#e30613', '#000000'],
  ['Croatia', 76, '#ff0000', '#ffffff'],
  ['Denmark', 74, '#c8102e', '#ffffff'],
  ['Switzerland', 74, '#d52b1e', '#ffffff'],
  ['Austria', 72, '#ed2939', '#ffffff'],
  ['Poland', 71, '#ffffff', '#dc143c'],
  ['Sweden', 71, '#fecc00', '#006aa7'],
  ['Scotland', 69, '#0065bd', '#ffffff'],
  ['Czechia', 70, '#d7141a', '#11457e'],
];
const WORLD_REAL: [string, number, Hex, Hex][] = [
  ['Brazil', 82, '#fedd00', '#009739'],
  ['Argentina', 82, '#75aadb', '#ffffff'],
  ['Uruguay', 74, '#5cbfeb', '#000000'],
  ['Colombia', 73, '#fcd116', '#003893'],
  ['Mexico', 71, '#006847', '#ce1126'],
  ['United States', 71, '#ffffff', '#002868'],
  ['Japan', 72, '#000555', '#ffffff'],
  ['Morocco', 74, '#c1272d', '#006233'],
  ['Senegal', 72, '#00853f', '#fdef42'],
  ['South Korea', 70, '#cd2e3a', '#0047a0'],
];
const FICTIONAL = [
  'Ostrava',
  'Kelderland',
  'Marvenne',
  'Sudvik',
  'Corvalia',
  'Tessaro',
  'Brannock',
  'Eldoria',
  'Vastmark',
  'Quellon',
  'Arvenza',
  'Duskmoor',
  'Ferrano',
  'Glenhallow',
  'Istrel',
  'Lomaris',
  'Nordale',
  'Praxos',
  'Ruvenna',
  'Solmere',
];
const COUNTRY_COLORS: Record<string, [Hex, Hex]> = {
  England: ['#ffffff', '#1d2951'],
  France: ['#21304d', '#ffffff'],
  Spain: ['#c60b1e', '#ffc400'],
  Germany: ['#ffffff', '#000000'],
  Italy: ['#0066b3', '#ffffff'],
  Portugal: ['#c8102e', '#006600'],
};

/** The nations: the world's countries plus twenty guests (real names in real-country worlds). */
export function createInternational(world: World): InternationalState {
  const real = world.identityVersion === 2;
  const nations: Nation[] = Object.values(world.countries).map((country, index) => ({
    id: `nation:${country.id}`,
    countryId: country.id,
    name: country.name,
    rating: 70,
    colors: (COUNTRY_COLORS[country.counterpart ?? ''] ??
      [
        ['#123c69', '#ffffff'],
        ['#a4161a', '#ffffff'],
        ['#f2c14e', '#1d1d1f'],
        ['#2a9d8f', '#ffffff'],
        ['#5b2a86', '#ffffff'],
        ['#264653', '#e9c46a'],
      ][index % 6]) as [Hex, Hex],
  }));
  [...EUROPE_REAL, ...WORLD_REAL].forEach(([name, rating, primary, secondary], index) => {
    nations.push({
      id: `nation:guest:${index}`,
      countryId: null,
      name: real ? name : FICTIONAL[index]!,
      rating,
      colors: [primary, secondary],
    });
  });
  return { nations, matches: [], tournaments: [] };
}

const ageAt = (world: World, player: Player) => world.date.season - player.birthSeason;
const eligible = (world: World, player: Player, level: NationalLevel) =>
  level === 'senior' || ageAt(world, player) <= I.ages[level];
function selectionScore(world: World, player: Player, level: NationalLevel): number {
  const career = player.id === world.career?.playerId;
  const fame = career ? world.career!.fame : 0;
  // At youth levels the career player is judged as a prospect: their potential on the age
  // curve, which is what academy players of the same age effectively are.
  const ability =
    career && level !== 'senior'
      ? Math.max(
          playerAbility(player),
          player.potential * ageCurve('technical', ageAt(world, player)),
        )
      : playerAbility(player);
  return (
    ability +
    player.form * I.selection.form +
    Math.min(I.selection.fameCap, fame * I.selection.fame)
  );
}

/** A country's squad for a level: the best available players of each line. */
export function selectSquad(world: World, countryId: string, level: NationalLevel): Player[] {
  const pool = Object.values(world.players).filter(
    (player) =>
      player.nationalityId === countryId &&
      !player.retired &&
      player.clubId &&
      !player.injuryId &&
      eligible(world, player, level),
  );
  const scores = new Map(pool.map((player) => [player.id, selectionScore(world, player, level)]));
  const squad: Player[] = [];
  for (const line of ['GK', 'DEF', 'MID', 'ATT'] as const)
    squad.push(
      ...pool
        .filter((player) => LINE[player.primaryPosition] === line)
        .sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || (a.id < b.id ? -1 : 1))
        .slice(0, I.squad[line]),
    );
  return squad;
}

/** A nation's strength at a level: its squad's first-eleven ability, or a guest's rating. */
function nationRating(
  world: World,
  nation: Nation,
  level: NationalLevel,
  squads: Map<string, Player[]>,
): number {
  if (!nation.countryId) return nation.rating - (level === 'senior' ? 0 : I.youthRating);
  const key = `${nation.countryId}:${level}`;
  if (!squads.has(key)) squads.set(key, selectSquad(world, nation.countryId, level));
  const squad = squads.get(key)!;
  const starters: number[] = [];
  for (const line of ['GK', 'DEF', 'MID', 'ATT'] as const)
    starters.push(
      ...squad
        .filter((player) => LINE[player.primaryPosition] === line)
        .slice(0, I.starterSlots[line])
        .map(playerAbility),
    );
  return starters.length ? starters.reduce((sum, value) => sum + value, 0) / starters.length : 40;
}

function poisson(rng: Rng, mean: number): number {
  const stop = Math.exp(-mean);
  let product = 1;
  let count = 0;
  do {
    product *= rng.next();
    count++;
  } while (product > stop && count <= 10);
  return count - 1;
}

interface Side {
  nation: Nation;
  rating: number;
}
/** Simulate an international; the career player's part if they are in this side's squad. */
function playMatch(
  world: World,
  rng: Rng,
  home: Side,
  away: Side,
  level: NationalLevel,
  kind: InternationalMatch['kind'],
  tournamentId: string | null,
  careerSide: 0 | 1 | null,
  careerStarts: boolean,
): InternationalMatch {
  const gap = (home.rating - away.rating) * I.strengthScale;
  const score: [number, number] = [
    poisson(rng, Math.max(0.2, I.baseGoals + gap / 2)),
    poisson(rng, Math.max(0.2, I.baseGoals - gap / 2)),
  ];
  let penalties: [number, number] | null = null;
  if ((kind === 'knockout' || kind === 'final') && score[0] === score[1]) {
    const homeWins = rng.next() < 0.5;
    const loser = rng.int(2, 4);
    penalties = homeWins ? [loser + 1, loser] : [loser, loser + 1];
  }
  let career: InternationalMatch['career'] = null;
  if (careerSide !== null && world.career) {
    const player = world.players[world.career.playerId]!;
    const plays = careerStarts || rng.next() < I.benchChance;
    if (plays) {
      const line = LINE[player.primaryPosition];
      const own = score[careerSide];
      const theirs = score[1 - careerSide]!;
      let goals = 0;
      let assists = 0;
      for (let goal = 0; goal < own; goal++) {
        const roll = rng.next();
        if (roll < I.goalShare[line]) goals++;
        else if (roll < I.goalShare[line] + I.assistShare[line]) assists++;
      }
      const result = own > theirs ? 0.5 : own < theirs ? -0.4 : 0;
      const rating =
        Math.round(
          Math.max(
            3,
            Math.min(10, 6.2 + result + goals * 0.8 + assists * 0.4 + rng.next() * 0.8 - 0.4),
          ) * 10,
        ) / 10;
      career = { rating, goals, assists };
    }
  }
  const match: InternationalMatch = {
    // A pairing meets at most once per date, level and kind, so this stays unique.
    id: `intl:${world.date.season}:${world.date.week}:${level}:${kind}:${home.nation.id}:${away.nation.id}`,
    date: today(world),
    level,
    kind,
    tournamentId,
    homeId: home.nation.id,
    awayId: away.nation.id,
    score,
    penalties,
    career,
  };
  const state = world.international!;
  state.matches.push(match);
  if (state.matches.length > I.matchLimit)
    state.matches.splice(0, state.matches.length - I.matchLimit);
  return match;
}
const winnerOf = (match: InternationalMatch) =>
  match.penalties
    ? match.penalties[0] > match.penalties[1]
      ? match.homeId
      : match.awayId
    : match.score[0] > match.score[1]
      ? match.homeId
      : match.score[1] > match.score[0]
        ? match.awayId
        : null;

/** Count the career player's appearance: caps, goals, fame, XP and the Chronicle. */
function credit(world: World, match: InternationalMatch, nationName: string): void {
  const career = world.career!;
  const part = match.career;
  if (!part) return;
  const honours = career.honours;
  const first = honours.caps[match.level] === 0;
  honours.caps[match.level]++;
  honours.internationalGoals[match.level] += part.goals;
  const senior = match.level === 'senior';
  career.fame += (senior ? I.fame.cap : 0) + part.goals * (senior ? I.fame.goal : 1);
  addXp(career, I.xp.cap + part.goals * I.xp.goal);
  const player = world.players[career.playerId]!;
  player.fatigue = Math.min(100, player.fatigue + 8);
  if (first) chronicle(world, 'cap', { level: match.level, nation: nationName });
  if (part.goals && honours.internationalGoals[match.level] === part.goals)
    chronicle(world, 'international-goal', { level: match.level, nation: nationName });
}

/** The levels the career player can be called to, best first. */
function careerCallUp(
  world: World,
): { level: NationalLevel; squad: Player[]; starts: boolean } | null {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  if (player.injuryId) return null;
  for (const level of LEVELS) {
    if (!eligible(world, player, level)) continue;
    const squad = selectSquad(world, player.nationalityId, level);
    if (!squad.some((member) => member.id === player.id)) continue;
    const line = LINE[player.primaryPosition];
    const rank = squad
      .filter((member) => LINE[member.primaryPosition] === line)
      .findIndex((member) => member.id === player.id);
    return { level, squad, starts: rank < I.starterSlots[line] };
  }
  return null;
}

export function windowWeeks(world: World): number[] {
  const weeks = getSeasonWeeks(world);
  return I.windows.map((fraction) => Math.max(1, Math.round(fraction * weeks)));
}

/** An international window: squads are named and the career player's side plays twice. */
export function internationalWindow(world: World): void {
  const career = world.career;
  const state = world.international;
  if (!career || !state || !windowWeeks(world).includes(world.date.week)) return;
  const rng = createRng(`${world.seed}:international:${world.date.season}:${world.date.week}`);
  const player = world.players[career.playerId]!;
  const call = careerCallUp(world);
  const nation = state.nations.find((entry) => entry.countryId === player.nationalityId);
  if (!nation) return;
  for (const level of LEVELS) {
    const id = `national:${player.nationalityId}:${level}`;
    const squad =
      call?.level === level ? call.squad : selectSquad(world, player.nationalityId, level);
    world.nationalTeams[id] = {
      id,
      countryId: player.nationalityId,
      level,
      playerIds: squad.map((member) => member.id),
    };
  }
  if (!call) return;
  const firstEver = !career.honours.lastCallUp;
  career.honours.lastCallUp = { level: call.level, date: today(world) };
  const firstSenior =
    call.level === 'senior' && !world.callUps.some((c) => c.nationalTeamId.endsWith(':senior'));
  if (firstEver || firstSenior)
    chronicle(world, 'call-up', { level: call.level, nation: nation.name });
  player.morale = Math.min(100, player.morale + 3);
  const squads = new Map<string, Player[]>([[`${player.nationalityId}:${call.level}`, call.squad]]);
  const opponents = state.nations.filter((entry) => entry.id !== nation.id);
  let played = false;
  for (let index = 0; index < I.matchesPerWindow; index++) {
    const opponent = rng.pick(opponents);
    const home = index % 2 === 0;
    const own: Side = {
      nation,
      rating: nationRating(world, nation, call.level, squads) + (home ? 1 : 0),
    };
    const other: Side = {
      nation: opponent,
      rating: nationRating(world, opponent, call.level, squads),
    };
    const match = playMatch(
      world,
      rng,
      home ? own : other,
      home ? other : own,
      call.level,
      world.date.season % 2 ? 'qualifier' : 'friendly',
      null,
      home ? 0 : 1,
      call.starts,
    );
    if (match.career) played = true;
    credit(world, match, nation.name);
  }
  world.callUps.push({
    id: `callup:${world.date.season}:${world.date.week}`,
    playerId: player.id,
    nationalTeamId: `national:${player.nationalityId}:${call.level}`,
    date: today(world),
    played,
  });
  if (world.callUps.length > 60) world.callUps.splice(0, world.callUps.length - 60);
  postMessage(world, 'call-up', { level: call.level, nation: nation.name });
}

/**
 * A tournament between seasons, every two years: continental in years divisible by four,
 * world in the others. Sixteen nations play four groups of four, then knockouts.
 */
export function playTournament(world: World): Tournament | null {
  const state = world.international;
  const year = world.date.season;
  if (!state || year % 2 !== 0) return null;
  const kind: Tournament['kind'] = year % 4 === 0 ? 'continental' : 'world';
  const rng = createRng(`${world.seed}:tournament:${year}`);
  const home = state.nations.filter((nation) => nation.countryId);
  const guests = state.nations.filter((nation) => !nation.countryId);
  const field = [
    ...home,
    ...(kind === 'continental' ? guests.slice(0, 10) : guests.slice(10, 20)),
  ].slice(0, 16);
  const squads = new Map<string, Player[]>();
  const ratings = new Map(
    field.map((nation) => [nation.id, nationRating(world, nation, 'senior', squads)]),
  );
  const career = world.career;
  const player = career ? world.players[career.playerId]! : undefined;
  const careerNation = player
    ? field.find((nation) => nation.countryId === player.nationalityId)
    : undefined;
  const call = career ? careerCallUp(world) : null;
  const inSquad = Boolean(call && call.level === 'senior');
  const id = `tournament:${year}`;
  const seeded = [...field].sort(
    (a, b) => ratings.get(b.id)! - ratings.get(a.id)! || (a.id < b.id ? -1 : 1),
  );
  const groups: string[][] = [[], [], [], []];
  seeded.forEach((nation, index) => {
    const pot = Math.floor(index / 4);
    const order = [0, 1, 2, 3];
    const slot = order.filter((g) => groups[g]!.length === pot);
    groups[rng.pick(slot)]!.push(nation.id);
  });
  const matchIds: string[] = [];
  const side = (nationId: string): Side => ({
    nation: field.find((n) => n.id === nationId)!,
    rating: ratings.get(nationId)!,
  });
  const careerSide = (a: string, b: string): 0 | 1 | null =>
    inSquad && careerNation ? (a === careerNation.id ? 0 : b === careerNation.id ? 1 : null) : null;
  const play = (a: string, b: string, stage: InternationalMatch['kind']) => {
    const match = playMatch(
      world,
      rng,
      side(a),
      side(b),
      'senior',
      stage,
      id,
      careerSide(a, b),
      Boolean(call?.starts),
    );
    matchIds.push(match.id);
    if (careerNation) credit(world, match, careerNation.name);
    return match;
  };
  const standings = groups.map((group) => {
    const points = new Map(group.map((n) => [n, { points: 0, difference: 0, scored: 0 }]));
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++) {
        const match = play(group[a]!, group[b]!, 'group');
        const [x, y] = match.score;
        const rowA = points.get(group[a]!)!;
        const rowB = points.get(group[b]!)!;
        rowA.points += x > y ? 3 : x === y ? 1 : 0;
        rowB.points += y > x ? 3 : x === y ? 1 : 0;
        rowA.difference += x - y;
        rowB.difference += y - x;
        rowA.scored += x;
        rowB.scored += y;
      }
    return [...group].sort((a, b) => {
      const p = points.get(a)!;
      const q = points.get(b)!;
      return (
        q.points - p.points ||
        q.difference - p.difference ||
        q.scored - p.scored ||
        (a < b ? -1 : 1)
      );
    });
  });
  let round = [
    standings[0]![0]!,
    standings[1]![1]!,
    standings[1]![0]!,
    standings[0]![1]!,
    standings[2]![0]!,
    standings[3]![1]!,
    standings[3]![0]!,
    standings[2]![1]!,
  ];
  let stage: NonNullable<Tournament['career']>['stage'] = 'group';
  const reached = new Map<string, 'quarter' | 'semi' | 'final'>();
  const names: ('quarter' | 'semi' | 'final')[] = ['quarter', 'semi', 'final'];
  let runnerUp = '';
  for (const name of names) {
    round.forEach((nation) => reached.set(nation, name));
    const next: string[] = [];
    for (let index = 0; index < round.length; index += 2) {
      const match = play(round[index]!, round[index + 1]!, name === 'final' ? 'final' : 'knockout');
      const winner = winnerOf(match)!;
      next.push(winner);
      if (name === 'final') runnerUp = winner === round[index] ? round[index + 1]! : round[index]!;
    }
    round = next;
  }
  const winnerId = round[0]!;
  if (careerNation) {
    const reach = reached.get(careerNation.id);
    stage = winnerId === careerNation.id ? 'winner' : (reach ?? 'group');
  }
  const tournament: Tournament = {
    id,
    kind,
    name:
      kind === 'continental'
        ? world.identityVersion === 2
          ? 'European Nations Championship'
          : 'Continental Nations Championship'
        : 'World Nations Cup',
    year,
    groups,
    matchIds,
    winnerId,
    runnerUpId: runnerUp,
    career: careerNation ? { nationId: careerNation.id, stage, inSquad } : null,
  };
  state.tournaments.push(tournament);
  if (state.tournaments.length > I.tournamentLimit)
    state.tournaments.splice(0, state.tournaments.length - I.tournamentLimit);
  if (career && careerNation && inSquad) {
    chronicle(world, 'tournament', { name: tournament.name, year, stage });
    if (stage === 'winner') career.fame += I.fame.tournament;
    postMessage(world, 'tournament', { name: tournament.name, stage, nation: careerNation.name });
  }
  return tournament;
}
