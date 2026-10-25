import type {
  Hex,
  InternationalMatch,
  InternationalState,
  LiveTournament,
  Nation,
  Qualifying,
  QualifyingFixture,
  NationalLevel,
  Player,
  Position,
  Tournament,
  TournamentFixture,
  WindowFixture,
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
import { addAchievement, creditCaps, usesAchievements } from './achievements';

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
/** Guests who join the qualifying pools (review phase 3, step 3.3): eight for each tournament. */
const EUROPE_MORE: [string, number, Hex, Hex][] = [
  ['Norway', 72, '#ba0c2f', '#ffffff'],
  ['Turkey', 72, '#e30a17', '#ffffff'],
  ['Serbia', 71, '#c6363c', '#0c4076'],
  ['Ukraine', 71, '#ffd500', '#005bbb'],
  ['Hungary', 69, '#cd2a3e', '#436f4d'],
  ['Wales', 68, '#c8102e', '#00b140'],
  ['Greece', 67, '#0d5eaf', '#ffffff'],
  ['Republic of Ireland', 67, '#169b62', '#ffffff'],
];
const WORLD_MORE: [string, number, Hex, Hex][] = [
  ['Nigeria', 71, '#008751', '#ffffff'],
  ['Ecuador', 71, '#ffd100', '#034ea2'],
  ['Canada', 70, '#d80621', '#ffffff'],
  ['Australia', 69, '#ffcd00', '#00843d'],
  ['Chile', 69, '#d52b1e', '#0039a6'],
  ['Iran', 69, '#ffffff', '#239f40'],
  ['Egypt', 68, '#c8102e', '#000000'],
  ['Peru', 68, '#ffffff', '#d91023'],
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
  // Qualifying pools (review phase 3, step 3.3).
  'Varneth',
  'Ostmarra',
  'Calvaro',
  'Brisolde',
  'Thornvale',
  'Kessaly',
  'Mirandel',
  'Hollowmere',
  'Zantara',
  'Pellucia',
  'Grevholm',
  'Auremont',
  'Sarvona',
  'Dravik',
  'Lunaro',
  'Westmarch',
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
  nations.push(...guestNations(real));
  return { nations, matches: [], tournaments: [] };
}

/**
 * The guest nations: twenty tournament guests, then (from review phase 3, step 3.3) eight
 * more for each tournament's qualifying pool.
 */
function guestNations(real: boolean): Nation[] {
  return [...EUROPE_REAL, ...WORLD_REAL, ...EUROPE_MORE, ...WORLD_MORE].map(
    ([name, rating, primary, secondary], index) => ({
      id: `nation:guest:${index}`,
      countryId: null,
      name: real ? name : FICTIONAL[index]!,
      rating,
      colors: [primary, secondary],
    }),
  );
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
export function selectSquad(
  world: World,
  countryId: string,
  level: NationalLevel,
  /** The country's players, when the caller has already grouped them. */
  nationals: readonly Player[] = Object.values(world.players),
): Player[] {
  const pool = nationals.filter(
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

/** A squad's first eleven: the best of each line, as `nationRating` picks them. */
function starters(squad: readonly Player[]): Player[] {
  return (['GK', 'DEF', 'MID', 'ATT'] as const).flatMap((line) =>
    squad.filter((player) => LINE[player.primaryPosition] === line).slice(0, I.starterSlots[line]),
  );
}

/**
 * Caps for the world's other internationals in a window: every home nation's first eleven at
 * each level plays the window's matches, each player at their highest level only. The career
 * player's own matches are played and credited in full.
 */
function windowCaps(world: World, squads: Map<string, Player[]>): void {
  if (!usesAchievements(world)) return;
  const byCountry = new Map<string, Player[]>();
  for (const player of Object.values(world.players)) {
    const list = byCountry.get(player.nationalityId);
    if (list) list.push(player);
    else byCountry.set(player.nationalityId, [player]);
  }
  for (const nation of world.international!.nations) {
    if (!nation.countryId) continue;
    const capped = new Set<string>();
    const nationals = byCountry.get(nation.countryId) ?? [];
    for (const level of LEVELS) {
      const key = `${nation.countryId}:${level}`;
      if (!squads.has(key)) squads.set(key, selectSquad(world, nation.countryId, level, nationals));
      const ids = starters(squads.get(key)!)
        .map((player) => player.id)
        .filter((id) => !capped.has(id));
      for (const id of ids) capped.add(id);
      creditCaps(world, ids, I.matchesPerWindow);
    }
  }
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
/**
 * Count the career player's appearance: caps, goals, fame, XP and the Chronicle. A match they
 * played in the match engine brings its own XP; a simulated one the cap's and goals'.
 */
function credit(world: World, match: InternationalMatch, nationName: string, xp?: number): void {
  const career = world.career!;
  const part = match.career;
  if (!part) return;
  const honours = career.honours;
  const first = honours.caps[match.level] === 0;
  honours.caps[match.level]++;
  if (usesAchievements(world))
    addAchievement(world, career.playerId, CONFIG.career.honours.hallOfFame.cap);
  honours.internationalGoals[match.level] += part.goals;
  const senior = match.level === 'senior';
  career.fame += (senior ? I.fame.cap : 0) + part.goals * (senior ? I.fame.goal : 1);
  addXp(career, xp ?? I.xp.cap + part.goals * I.xp.goal);
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
  // The window's qualifiers (review phase 3, step 3.3): the career player's nation's, when
  // they are called up to its senior side, then everyone else's.
  const qualifiers = windowQualifiers(world);
  careerWindow(world, qualifiers);
  if (qualifiers.length) playQualifiers(world, qualifiers);
  // The window the player planned to play has been played or simulated.
  state.window = null;
}

/**
 * The week before a window (version 0.9.0): when the player plays their own window matches and
 * starts for their senior side, the window's matches are set out to wait for them. Qualifiers
 * keep their qualifying fixtures' ids; friendlies are drawn here.
 */
export function openWindow(world: World): void {
  const career = world.career;
  const state = world.international;
  if (!career?.honours.playInternationals || !state || world.phase !== 'active') return;
  const week = world.date.week + 1;
  if (!windowWeeks(world).includes(week)) return;
  const id = `window:${world.date.season}:${week}`;
  if (state.window?.id === id) return;
  const player = world.players[career.playerId]!;
  const nation = state.nations.find((entry) => entry.countryId === player.nationalityId);
  const call = careerCallUp(world);
  if (!nation || call?.level !== 'senior' || !call.starts) return;
  const qualifiers = windowQualifiers(world, week).filter(
    (fixture) => fixture.homeId === nation.id || fixture.awayId === nation.id,
  );
  const rng = createRng(`${world.seed}:${id}`);
  const opponents = state.nations.filter((entry) => entry.id !== nation.id);
  const fixtures: WindowFixture[] = qualifiers.length
    ? qualifiers.map((fixture) => ({
        id: fixture.id,
        kind: 'qualifier',
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        matchId: null,
        score: null,
      }))
    : Array.from({ length: I.matchesPerWindow }, (_, index) => {
        const opponent = rng.pick(opponents);
        const home = index % 2 === 0;
        return {
          id: `${id}:${index}`,
          kind: world.date.season % 2 ? 'qualifier' : 'friendly',
          homeId: home ? nation.id : opponent.id,
          awayId: home ? opponent.id : nation.id,
          matchId: null,
          score: null,
        };
      });
  state.window = {
    id,
    season: world.date.season,
    week,
    nationId: nation.id,
    fixtures,
    simulate: false,
  };
}

/** The career player's window match waiting this week, while they are fit to play it. */
export function pendingWindowFixture(world: World): WindowFixture | null {
  const window = world.international?.window;
  const career = world.career;
  if (!window || !career || window.simulate || world.phase !== 'active') return null;
  if (window.season !== world.date.season || window.week !== world.date.week) return null;
  if (career.injury) return null;
  return window.fixtures.find((fixture) => !fixture.matchId) ?? null;
}

/**
 * Store a window match the career player played: the fixture's result (a qualifier's in the
 * campaign too), and their cap, goals, fame and the match's XP. Throws if already played.
 */
export function recordWindowMatch(
  world: World,
  fixture: WindowFixture,
  match: InternationalMatch,
  xp: number,
): void {
  if (fixture.matchId) throw new Error('This match has already been played');
  const state = world.international!;
  fixture.matchId = match.id;
  fixture.score = [match.score[0], match.score[1]];
  const qualifier = state.qualifying?.fixtures.find((entry) => entry.id === fixture.id);
  if (qualifier && !qualifier.score) qualifier.score = [match.score[0], match.score[1]];
  credit(world, match, nationOf(world, state.window!.nationId).name, xp);
}

/** The career player's window: squads named, their call-up and their matches. */
function careerWindow(world: World, qualifiers: readonly QualifyingFixture[]): void {
  const career = world.career!;
  const state = world.international!;
  const rng = createRng(`${world.seed}:international:${world.date.season}:${world.date.week}`);
  const player = world.players[career.playerId]!;
  const call = careerCallUp(world);
  const nation = state.nations.find((entry) => entry.countryId === player.nationalityId);
  if (!nation) return;
  const named = new Map<string, Player[]>();
  for (const level of LEVELS) {
    const id = `national:${player.nationalityId}:${level}`;
    const squad =
      call?.level === level ? call.squad : selectSquad(world, player.nationalityId, level);
    named.set(`${player.nationalityId}:${level}`, squad);
    world.nationalTeams[id] = {
      id,
      countryId: player.nationalityId,
      level,
      playerIds: squad.map((member) => member.id),
    };
  }
  windowCaps(world, named);
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
  const own =
    call.level === 'senior'
      ? qualifiers.filter((fixture) => fixture.homeId === nation.id || fixture.awayId === nation.id)
      : [];
  const qualifierSquads = new Map<string, Player[]>();
  for (const fixture of own) {
    // Drawn exactly as the simulation draws it, so the score is the same with them or without.
    const [home, away] = qualifierSides(world, fixture, qualifierSquads);
    const match = playMatch(
      world,
      createRng(`${world.seed}:${fixture.id}`),
      home,
      away,
      'senior',
      'qualifier',
      null,
      fixture.homeId === nation.id ? 0 : 1,
      call.starts,
    );
    fixture.score = [match.score[0], match.score[1]];
    if (match.career) played = true;
    credit(world, match, nation.name);
  }
  // A window the player set out to play (version 0.9.0): its matches they played are counted
  // already; the rest are simulated here, a qualifier among the qualifiers above.
  const planned =
    state.window?.season === world.date.season && state.window.week === world.date.week
      ? state.window
      : null;
  if (planned) {
    if (planned.fixtures.some((fixture) => fixture.matchId)) played = true;
    for (const fixture of planned.fixtures) {
      if (fixture.matchId || qualifiers.some((entry) => entry.id === fixture.id)) continue;
      const side = (id: string): Side => {
        const entry = nationOf(world, id);
        return {
          nation: entry,
          rating: nationRating(world, entry, call.level, squads) + (id === fixture.homeId ? 1 : 0),
        };
      };
      const match = playMatch(
        world,
        createRng(`${world.seed}:${fixture.id}`),
        side(fixture.homeId),
        side(fixture.awayId),
        call.level,
        fixture.kind,
        null,
        fixture.homeId === nation.id ? 0 : 1,
        call.starts,
      );
      fixture.matchId = match.id;
      fixture.score = [match.score[0], match.score[1]];
      if (match.career) played = true;
      credit(world, match, nation.name);
    }
  }
  for (let index = 0; index < (own.length || planned ? 0 : I.matchesPerWindow); index++) {
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
 * Qualification (review phase 3, step 3.3): in the season before a tournament, twenty-four
 * nations (the world's six and eighteen guests) play home and away in six seeded groups of
 * four, two matchdays a window. The group winners, the runners-up and the four best
 * third-placed nations go through.
 */
const Q = I.qualifying;
const POOL: Record<Tournament['kind'], readonly [number, number][]> = {
  continental: [
    [0, 10],
    [20, 28],
  ],
  world: [
    [10, 20],
    [28, 36],
  ],
};

/** Open the campaign for next season's tournament, when one is due. */
export function openQualifying(world: World): Qualifying | null {
  const state = world.international;
  const year = world.date.season + 1;
  if (!state || !tournamentYear(year)) return null;
  const tournamentId = `tournament:${year}`;
  if (state.qualifying?.tournamentId === tournamentId) return null;
  // Worlds from before qualification gain its guests now.
  for (const guest of guestNations(world.identityVersion === 2))
    if (!state.nations.some((nation) => nation.id === guest.id)) state.nations.push(guest);
  const kind: Tournament['kind'] = year % 4 === 0 ? 'continental' : 'world';
  const guests = new Set(
    POOL[kind].flatMap(([from, to]) =>
      Array.from({ length: to - from }, (_, offset) => `nation:guest:${from + offset}`),
    ),
  );
  const pool = state.nations.filter((nation) => nation.countryId || guests.has(nation.id));
  const squads = new Map<string, Player[]>();
  const ratings = new Map(
    pool.map((nation) => [nation.id, nationRating(world, nation, 'senior', squads)]),
  );
  const seeded = [...pool].sort(
    (a, b) => ratings.get(b.id)! - ratings.get(a.id)! || (a.id < b.id ? -1 : 1),
  );
  const rng = createRng(`${world.seed}:qualifying:${year}`);
  const groups: string[][] = Array.from({ length: Q.groups }, () => []);
  seeded.forEach((nation, index) => {
    const pot = Math.floor(index / Q.groups);
    const open = groups.flatMap((group, g) => (group.length === pot ? [g] : []));
    groups[rng.pick(open)]!.push(nation.id);
  });
  const fixtures: QualifyingFixture[] = [];
  for (let matchday = 1; matchday <= GROUP_ROUNDS.length * 2; matchday++) {
    const second = matchday > GROUP_ROUNDS.length;
    const pairs = GROUP_ROUNDS[(matchday - 1) % GROUP_ROUNDS.length]!;
    groups.forEach((group, g) =>
      pairs.forEach(([a, b]) => {
        const [home, away] = second ? [b, a] : [a, b];
        fixtures.push({
          id: `qualifying:${year}:${g}:${matchday}:${home}${away}`,
          matchday,
          homeId: group[home]!,
          awayId: group[away]!,
          score: null,
        });
      }),
    );
  }
  state.qualifying = {
    tournamentId,
    year,
    kind,
    groups,
    fixtures,
    played: 0,
    qualified: null,
  };
  return state.qualifying;
}

/** This window's qualifiers, still to play: two matchdays a window. */
function windowQualifiers(world: World, week = world.date.week): QualifyingFixture[] {
  const qualifying = world.international?.qualifying;
  if (!qualifying || qualifying.qualified || qualifying.year !== world.date.season + 1) return [];
  const window = windowWeeks(world).indexOf(week);
  if (window < 0) return [];
  const days = new Set([window * 2 + 1, window * 2 + 2]);
  return qualifying.fixtures.filter((fixture) => days.has(fixture.matchday) && !fixture.score);
}

/**
 * A qualifier's two sides, the home side's rating raised by the home bonus. The same with or
 * without the career player, so a qualifier's score does not depend on who was called up.
 */
function qualifierSides(
  world: World,
  fixture: QualifyingFixture,
  squads: Map<string, Player[]>,
): [Side, Side] {
  const home = nationOf(world, fixture.homeId);
  const away = nationOf(world, fixture.awayId);
  return [
    { nation: home, rating: nationRating(world, home, 'senior', squads) + Q.homeBonus },
    { nation: away, rating: nationRating(world, away, 'senior', squads) },
  ];
}

/** The window's other qualifiers: their scores, then the table once every matchday is played. */
function playQualifiers(world: World, fixtures: readonly QualifyingFixture[]): void {
  const qualifying = world.international!.qualifying!;
  const squads = new Map<string, Player[]>();
  for (const fixture of fixtures) {
    if (fixture.score) continue;
    const rng = createRng(`${world.seed}:${fixture.id}`);
    const [home, away] = qualifierSides(world, fixture, squads);
    const gap = (home.rating - away.rating) * I.strengthScale;
    fixture.score = [
      poisson(rng, Math.max(0.2, I.baseGoals + gap / 2)),
      poisson(rng, Math.max(0.2, I.baseGoals - gap / 2)),
    ];
  }
  qualifying.played = qualifying.fixtures.reduce(
    (played, fixture) => (fixture.score ? Math.max(played, fixture.matchday) : played),
    qualifying.played,
  );
  if (qualifying.fixtures.every((fixture) => fixture.score)) closeQualifying(world, qualifying);
}

/** The nations through: group winners and runners-up, then the best third-placed. */
export function qualifiedNations(qualifying: Qualifying): string[] {
  const tables = qualifying.groups.map((group) => tableOf(qualifying.fixtures, group));
  const thirds = tables
    .map((table) => table[2]!)
    .sort(byStanding)
    .slice(0, Q.bestThirds)
    .map((row) => row.nationId);
  return [
    ...tables.map((table) => table[0]!.nationId),
    ...tables.map((table) => table[1]!.nationId),
    ...thirds,
  ];
}

/** A qualifying group's table. */
export const qualifyingStandings = (qualifying: Qualifying, group: readonly string[]) =>
  tableOf(qualifying.fixtures, group);

function closeQualifying(world: World, qualifying: Qualifying): void {
  qualifying.qualified = qualifiedNations(qualifying);
  const career = world.career;
  const player = career ? world.players[career.playerId] : undefined;
  const nation = player
    ? world.international!.nations.find((entry) => entry.countryId === player.nationalityId)
    : undefined;
  if (!career || !nation || !qualifying.groups.some((group) => group.includes(nation.id))) return;
  // The story is the player's when they have played for their nation's senior side.
  if (!career.honours.caps.senior) return;
  const outcome = qualifying.qualified.includes(nation.id) ? 'qualified' : 'missed';
  const params = {
    name: tournamentName(world, qualifying.kind),
    year: qualifying.year,
    nation: nation.name,
  };
  chronicle(world, 'qualifying', { ...params, outcome });
  postMessage(world, outcome === 'qualified' ? 'qualified' : 'missed-qualification', params);
}

/** Group matchdays: who meets whom among a group's four, by seeding order. */
const GROUP_ROUNDS: readonly (readonly [number, number])[][] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];
const KNOCKOUT: Record<number, TournamentFixture['stage']> = {
  4: 'quarter',
  5: 'semi',
  6: 'final',
};
export const tournamentName = (world: World, kind: Tournament['kind']): string =>
  kind === 'continental'
    ? world.identityVersion === 2
      ? 'European Nations Championship'
      : 'Continental Nations Championship'
    : 'World Nations Cup';

/** Whether a tournament is played before season `year`: every two years, between seasons. */
export const tournamentYear = (year: number): boolean => year % 2 === 0;

/**
 * Open the tournament before season `year` (review phase 3, step 3.2): sixteen nations drawn
 * into four seeded groups of four, the career player's place in the squad named now. Played
 * one round at a time (`advanceTournament`), so the career player can play their nation's
 * matches. Continental in years divisible by four, world in the others.
 */
export function openTournament(world: World, year = world.date.season + 1): LiveTournament | null {
  const state = world.international;
  if (!state || !tournamentYear(year) || state.live) return null;
  const id = `tournament:${year}`;
  if (state.tournaments.some((entry) => entry.id === id)) return null;
  const kind: Tournament['kind'] = year % 4 === 0 ? 'continental' : 'world';
  const rng = createRng(`${world.seed}:tournament:${year}`);
  const home = state.nations.filter((nation) => nation.countryId);
  const guests = state.nations.filter((nation) => !nation.countryId);
  // The qualifiers when the world played a campaign; the fixed field before it.
  const qualified = state.qualifying?.tournamentId === id ? state.qualifying.qualified : null;
  const field = qualified
    ? qualified.map((nationId) => nationOf(world, nationId))
    : [...home, ...(kind === 'continental' ? guests.slice(0, 10) : guests.slice(10, 20))].slice(
        0,
        16,
      );
  const squads = new Map<string, Player[]>();
  const ratings = new Map(
    field.map((nation) => [nation.id, nationRating(world, nation, 'senior', squads)]),
  );
  const seeded = [...field].sort(
    (a, b) => ratings.get(b.id)! - ratings.get(a.id)! || (a.id < b.id ? -1 : 1),
  );
  const groups: string[][] = [[], [], [], []];
  seeded.forEach((nation, index) => {
    const pot = Math.floor(index / 4);
    const slot = [0, 1, 2, 3].filter((g) => groups[g]!.length === pot);
    groups[rng.pick(slot)]!.push(nation.id);
  });
  const fixtures: TournamentFixture[] = [];
  GROUP_ROUNDS.forEach((pairs, index) =>
    groups.forEach((group, g) =>
      pairs.forEach(([a, b]) =>
        fixtures.push({
          id: `${id}:group:${g}:${index + 1}:${a}${b}`,
          round: index + 1,
          stage: 'group',
          homeId: group[a]!,
          awayId: group[b]!,
          matchId: null,
          score: null,
          penalties: null,
        }),
      ),
    ),
  );
  const career = world.career;
  const player = career ? world.players[career.playerId] : undefined;
  const careerNation = player
    ? field.find((nation) => nation.countryId === player.nationalityId)
    : undefined;
  const call = career ? careerCallUp(world) : null;
  const live: LiveTournament = {
    id,
    kind,
    name: tournamentName(world, kind),
    year,
    groups,
    fixtures,
    round: 1,
    careerNationId: careerNation?.id ?? null,
    inSquad: Boolean(careerNation && call?.level === 'senior'),
    starts: Boolean(careerNation && call?.level === 'senior' && call.starts),
    styled: true,
  };
  state.live = live;
  return live;
}

/**
 * The career leaves international football (version 0.9.1): a tournament under way plays on
 * without them, as a simulated tournament, and a window they set out to play is dropped, so the
 * next career never inherits their squad place, starts or matches. Replaces the state rather
 * than changing it, as retiring copies only part of the world.
 */
export function leaveInternationalFootball(world: World): void {
  const state = world.international;
  if (!state) return;
  const live = state.live;
  const held = Boolean(live && (live.careerNationId !== null || live.inSquad || live.starts));
  if (!held && !state.window) return;
  const next = { ...state };
  if (live && held) next.live = { ...live, careerNationId: null, inSquad: false, starts: false };
  if (state.window) next.window = null;
  world.international = next;
}

export const nationOf = (world: World, id: string) =>
  world.international!.nations.find((nation) => nation.id === id)!;

/** The career player's nation's match in this round, while they are fit to play it. */
export function pendingTournamentFixture(world: World): TournamentFixture | null {
  const live = world.international?.live;
  const career = world.career;
  if (!live || !career || !live.inSquad || !live.careerNationId) return null;
  if (world.players[career.playerId]?.injuryId) return null;
  return (
    live.fixtures.find(
      (fixture) =>
        fixture.round === live.round &&
        !fixture.matchId &&
        (fixture.homeId === live.careerNationId || fixture.awayId === live.careerNationId),
    ) ?? null
  );
}

/**
 * What the career player can do with the tournament between seasons: play their nation's
 * waiting match, continue once it is played (the rest of the round, then their next match or
 * the end), or nothing, when they are not in it (the next season plays it out).
 */
export function tournamentStep(world: World): 'play' | 'continue' | null {
  const live = world.international?.live;
  if (!live || !world.career) return null;
  if (pendingTournamentFixture(world)) return 'play';
  const involved =
    live.inSquad &&
    live.fixtures.some(
      (fixture) =>
        fixture.round === live.round &&
        (fixture.homeId === live.careerNationId || fixture.awayId === live.careerNationId),
    );
  return involved ? 'continue' : null;
}

/** A fixture's match kind and importance for the record and the match engine. */
export function tournamentStakes(fixture: TournamentFixture): {
  kind: InternationalMatch['kind'];
  importance: number;
} {
  const T = I.tournament;
  return fixture.stage === 'group'
    ? { kind: 'group', importance: T.importance.group }
    : fixture.stage === 'final'
      ? { kind: 'final', importance: T.importance.final }
      : { kind: 'knockout', importance: T.importance.knockout };
}

/**
 * Store a played tournament match, from the simulation or from the career player's session:
 * the fixture's result, the career player's caps and goals (once), and the caps of both
 * home nations' first elevens. Throws if the fixture was already played.
 */
export function recordTournamentMatch(
  world: World,
  fixture: TournamentFixture,
  match: InternationalMatch,
  /** The XP of a match the career player played in the match engine. */
  xp?: number,
  /** Squads already selected this round, shared between its matches. */
  squads = new Map<string, Player[]>(),
): void {
  if (fixture.matchId) throw new Error('This match has already been played');
  const live = world.international!.live!;
  fixture.matchId = match.id;
  fixture.score = [match.score[0], match.score[1]];
  fixture.penalties = match.penalties ? [match.penalties[0], match.penalties[1]] : null;
  if (live.careerNationId) credit(world, match, nationOf(world, live.careerNationId).name, xp);
  for (const nationId of [fixture.homeId, fixture.awayId]) {
    const nation = nationOf(world, nationId);
    if (!nation.countryId) continue;
    nationRating(world, nation, 'senior', squads);
    const squad = squads.get(`${nation.countryId}:senior`);
    if (squad)
      creditCaps(
        world,
        starters(squad).map((p) => p.id),
      );
  }
}

/** Simulate one tournament fixture, with the career player's part if their nation plays. */
function simulateFixture(
  world: World,
  live: LiveTournament,
  fixture: TournamentFixture,
  squads: Map<string, Player[]>,
): void {
  const rng = createRng(`${world.seed}:${fixture.id}`);
  const side = (id: string): Side => ({
    nation: nationOf(world, id),
    rating: nationRating(world, nationOf(world, id), 'senior', squads),
  });
  const careerSide =
    live.inSquad && live.careerNationId
      ? fixture.homeId === live.careerNationId
        ? 0
        : fixture.awayId === live.careerNationId
          ? 1
          : null
      : null;
  const match = playMatch(
    world,
    rng,
    side(fixture.homeId),
    side(fixture.awayId),
    'senior',
    tournamentStakes(fixture).kind,
    live.id,
    careerSide,
    live.starts,
  );
  recordTournamentMatch(world, fixture, match, undefined, squads);
}

/** A group's table row: matches played, points, goal difference and goals scored. */
export interface GroupRow {
  nationId: string;
  played: number;
  points: number;
  difference: number;
  scored: number;
}
/** A group's table from its played matches: points, goal difference, goals, then id. */
export const groupStandings = (live: LiveTournament, group: readonly string[]): GroupRow[] =>
  tableOf(
    live.fixtures.filter((fixture) => fixture.stage === 'group'),
    group,
  );
const byStanding = (p: GroupRow, q: GroupRow) =>
  q.points - p.points ||
  q.difference - p.difference ||
  q.scored - p.scored ||
  (p.nationId < q.nationId ? -1 : 1);
function tableOf(
  fixtures: readonly { homeId: string; awayId: string; score: [number, number] | null }[],
  group: readonly string[],
): GroupRow[] {
  const rows = new Map<string, GroupRow>(
    group.map((id) => [id, { nationId: id, played: 0, points: 0, difference: 0, scored: 0 }]),
  );
  for (const fixture of fixtures) {
    if (!fixture.score || !rows.has(fixture.homeId)) continue;
    const [x, y] = fixture.score;
    const home = rows.get(fixture.homeId)!;
    const away = rows.get(fixture.awayId)!;
    home.played++;
    away.played++;
    home.points += x > y ? 3 : x === y ? 1 : 0;
    away.points += y > x ? 3 : x === y ? 1 : 0;
    home.difference += x - y;
    away.difference += y - x;
    home.scored += x;
    away.scored += y;
  }
  return [...rows.values()].sort(byStanding);
}
const groupTable = (live: LiveTournament, group: readonly string[]): string[] =>
  groupStandings(live, group).map((row) => row.nationId);
const fixtureWinner = (fixture: TournamentFixture): string | null =>
  fixture.penalties
    ? fixture.penalties[0] > fixture.penalties[1]
      ? fixture.homeId
      : fixture.awayId
    : fixture.score && fixture.score[0] !== fixture.score[1]
      ? fixture.score[0] > fixture.score[1]
        ? fixture.homeId
        : fixture.awayId
      : null;

/** Draw the next knockout round from the last one's results, or the groups'. */
function nextRound(live: LiveTournament): void {
  const round = live.round + 1;
  if (round <= GROUP_ROUNDS.length) {
    live.round = round;
    return;
  }
  let teams: string[];
  if (round === GROUP_ROUNDS.length + 1) {
    const tables = live.groups.map((group) => groupTable(live, group));
    teams = [
      tables[0]![0]!,
      tables[1]![1]!,
      tables[1]![0]!,
      tables[0]![1]!,
      tables[2]![0]!,
      tables[3]![1]!,
      tables[3]![0]!,
      tables[2]![1]!,
    ];
  } else
    teams = live.fixtures
      .filter((fixture) => fixture.round === live.round)
      .map((fixture) => fixtureWinner(fixture)!);
  for (let index = 0; index < teams.length; index += 2)
    live.fixtures.push({
      id: `${live.id}:${KNOCKOUT[round]}:${index / 2}`,
      round,
      stage: KNOCKOUT[round]!,
      homeId: teams[index]!,
      awayId: teams[index + 1]!,
      matchId: null,
      score: null,
      penalties: null,
    });
  live.round = round;
}

/** The tournament is over: its record, and the career player's story of it. */
function closeTournament(world: World, live: LiveTournament): Tournament {
  const state = world.international!;
  const final = live.fixtures.find((fixture) => fixture.stage === 'final')!;
  const winnerId = fixtureWinner(final)!;
  const runnerUpId = winnerId === final.homeId ? final.awayId : final.homeId;
  let stage: NonNullable<Tournament['career']>['stage'] = 'group';
  if (live.careerNationId) {
    const reached = live.fixtures
      .filter(
        (fixture) =>
          fixture.homeId === live.careerNationId || fixture.awayId === live.careerNationId,
      )
      .reduce((best, fixture) => Math.max(best, fixture.round), 0);
    stage =
      winnerId === live.careerNationId
        ? 'winner'
        : reached >= 6
          ? 'final'
          : reached === 5
            ? 'semi'
            : reached === 4
              ? 'quarter'
              : 'group';
  }
  const tournament: Tournament = {
    id: live.id,
    kind: live.kind,
    name: live.name,
    year: live.year,
    groups: live.groups,
    matchIds: live.fixtures.map((fixture) => fixture.matchId!),
    winnerId,
    runnerUpId,
    career: live.careerNationId
      ? { nationId: live.careerNationId, stage, inSquad: live.inSquad }
      : null,
  };
  state.tournaments.push(tournament);
  if (state.tournaments.length > I.tournamentLimit)
    state.tournaments.splice(0, state.tournaments.length - I.tournamentLimit);
  state.live = null;
  const career = world.career;
  if (career && live.careerNationId && live.inSquad) {
    const nation = nationOf(world, live.careerNationId).name;
    chronicle(world, 'tournament', { name: tournament.name, year: tournament.year, stage });
    if (stage === 'winner') career.fame += I.fame.tournament;
    postMessage(world, 'tournament', { name: tournament.name, stage, nation });
  }
  return tournament;
}

/**
 * Play the tournament on: every match of the round except the career player's (unless
 * `simulateCareer`), then the next round once this one is done. Stops when the career player's
 * match is due, and closes the tournament after the final. Returns the match waiting for the
 * player, if any.
 */
export function advanceTournament(
  world: World,
  options: { simulateCareer?: boolean } = {},
): { pending: TournamentFixture | null; tournament: Tournament | null } {
  const live = world.international?.live;
  if (!live) return { pending: null, tournament: null };
  // Squads are picked once for the whole advance: nobody's club football changes during it.
  const squads = new Map<string, Player[]>();
  for (let guard = 0; guard < 8; guard++) {
    const pending = options.simulateCareer ? null : pendingTournamentFixture(world);
    for (const fixture of live.fixtures)
      if (fixture.round === live.round && !fixture.matchId && fixture !== pending)
        simulateFixture(world, live, fixture, squads);
    if (pending) return { pending, tournament: null };
    if (live.round === 6) return { pending: null, tournament: closeTournament(world, live) };
    nextRound(live);
  }
  throw new Error('The tournament did not finish');
}

/** Play out whatever remains of a tournament, the career player's matches simulated. */
export function finishTournament(world: World): Tournament | null {
  if (!world.international?.live) return null;
  return advanceTournament(world, { simulateCareer: true }).tournament;
}

/**
 * The tournament between seasons, at the season change, for a world that did not play it
 * round by round (no career, or saved before review phase 3): opened and played out at once.
 */
export function playTournament(world: World): Tournament | null {
  const state = world.international;
  if (!state) return null;
  if (state.live) return finishTournament(world);
  if (!openTournament(world, world.date.season)) return null;
  return finishTournament(world);
}
