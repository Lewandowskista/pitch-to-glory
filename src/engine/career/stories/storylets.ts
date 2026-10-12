/**
 * Story arcs (engagement review, item 4): short multi-week stories drawn from what is happening
 * in the career. A story is offered with two or three choices; the choice has its effect at
 * once, and some are settled weeks later by what happened in between (the form kept, the
 * rival's goals, a result). Unanswered by its deadline, the story takes its default choice.
 *
 * Effects use the career's existing levers: manager trust, fan affection, the dressing room's
 * cliques and mood, one named teammate, morale, form, fatigue, fame, XP, cash, the rival's
 * intensity and a club's scouting confidence. Every transition applies its effects once, so a
 * week reprocessed or a save reloaded never repeats them. At most one story is open at a time.
 */
import type {
  CliqueKind,
  GameDate,
  Player,
  StoryKind,
  StoryState,
  World,
} from '../../../model/domain';
import { CONFIG } from '../../config';
import { createRng, type Rng } from '../../rng';
import { playerAbility } from '../../strength';
import { addXp } from '../progression';
import { adjustRelationship, postMessage } from '../market/records';
import { addWeeks, compareDates, managerTrust, relationshipValue, today } from '../market/rules';
import { chronicle } from '../honours/chronicle';
import { fameLevel } from '../lifestyle/wardrobe';
import { adjustCliques, adjustMood, keyTeammates } from '../social/dressing';
import { adjustIntensity, rivalOf, rivalryOf, seasonLines } from '../social/rival';
import { careerClub, careerPlayer, careerRoom } from '../social/rules';

const T = CONFIG.career.stories;
type Params = StoryState['params'];

/** What a choice or an outcome does. Every key is optional; numbers are deltas. */
export interface StoryEffects {
  trust?: number;
  fans?: number;
  fame?: number;
  /** Dressing-room mood. */
  mood?: number;
  cliques?: Partial<Record<CliqueKind, number>>;
  /** The relationship with the story's teammate (`params.teammateId`). */
  teammate?: number;
  morale?: number;
  form?: number;
  fatigue?: number;
  xp?: number;
  cash?: number;
  /** The rival's intensity. */
  rival?: number;
  /** Scouting confidence of the story's club (`params.clubId`). */
  interest?: number;
  /** Fan affection at the story's club (`params.clubId`), for a former club. */
  oldFans?: number;
}
export interface StoryChoice {
  id: string;
  effects: StoryEffects;
  /** Weeks until the follow-up; absent when the choice settles the story at once. */
  followUp?: number;
}
export interface StoryOutcome {
  outcome: string;
  effects: StoryEffects;
  /** Written into the Chronicle when the outcome is a landmark. */
  chronicle?: boolean;
}
interface Storylet {
  kind: StoryKind;
  weight: number;
  /** Weeks to answer. */
  respond: number;
  /** The choice taken when the story lapses unanswered. */
  lapse: string;
  choices: StoryChoice[];
  /** Parameters when the story can start this week, else null. */
  trigger(world: World, rng: Rng): Params | null;
  /** The follow-up, for choices that have one. */
  resolve?(world: World, story: StoryState, rng: Rng): StoryOutcome;
}

const player = careerPlayer;
const age = (world: World) => world.date.season - player(world).birthSeason;
const seasonMatches = (world: World) =>
  world.career!.matches.filter((match) => match.season === world.date.season);
const thisWeek = (world: World, date: GameDate | null | undefined) =>
  Boolean(date && date.season === world.date.season && date.week === world.date.week);
/** The club's fixture next week, and the opponent. */
function nextFixture(world: World) {
  const club = careerClub(world);
  const fixture = Object.values(world.fixtures).find(
    (entry) =>
      entry.date.season === world.date.season &&
      entry.date.week === world.date.week + 1 &&
      (entry.homeId === club.id || entry.awayId === club.id) &&
      !world.results[entry.id],
  );
  if (!fixture) return null;
  const opponent = world.clubs[fixture.homeId === club.id ? fixture.awayId : fixture.homeId]!;
  return { fixture, opponent };
}
/** The career's result in a fixture, once played. */
function resultOf(world: World, fixtureId: string): 'win' | 'draw' | 'loss' | null {
  return world.career!.matches.find((match) => match.fixtureId === fixtureId)?.result ?? null;
}
const teammateParams = (mate: Player): Params => ({ teammate: mate.name, teammateId: mate.id });

export const STORYLETS: readonly Storylet[] = [
  {
    kind: 'senior-dispute',
    weight: 1,
    respond: 2,
    lapse: 'neutral',
    choices: [
      {
        id: 'back',
        effects: { teammate: 12, cliques: { seniors: 6 }, trust: -6 },
        followUp: 3,
      },
      { id: 'neutral', effects: { teammate: -4 } },
      { id: 'manager', effects: { trust: 6, cliques: { seniors: -8 }, teammate: -15 } },
    ],
    trigger(world, rng) {
      const room = careerRoom(world);
      const seniors = room.cliques.find((clique) => clique.kind === 'seniors');
      const leaderId = seniors?.leaderId;
      const mate = leaderId ? world.players[leaderId] : undefined;
      if (!mate || mate.id === player(world).id || rng.next() > 0.6) return null;
      return teammateParams(mate);
    },
    resolve(world) {
      // The manager forgives a player they still rate; one who already doubted them does not.
      return managerTrust(world) >= T.disputeTrust
        ? { outcome: 'reconciled', effects: { mood: 4, morale: 3 } }
        : { outcome: 'frozen', effects: { trust: -3, morale: -4 } };
    },
  },
  {
    kind: 'mentor-youth',
    weight: 1,
    respond: 2,
    lapse: 'decline',
    choices: [
      { id: 'mentor', effects: { cliques: { young: 8 }, fatigue: 6 }, followUp: 6 },
      { id: 'decline', effects: { cliques: { young: -3 } } },
    ],
    trigger(world) {
      if (age(world) < T.mentorAge) return null;
      const club = careerClub(world);
      const youngster = club.playerIds
        .map((id) => world.players[id]!)
        .filter((p) => p.id !== player(world).id && world.date.season - p.birthSeason <= 19)
        .sort((a, b) => b.potential - a.potential || (a.id < b.id ? -1 : 1))[0];
      return youngster ? teammateParams(youngster) : null;
    },
    resolve(world, story) {
      // The youngster learns from the player: two attributes the player is best at.
      const mate = world.players[String(story.params.teammateId)];
      const own = player(world);
      if (mate && mate.clubId === own.clubId) {
        const best = (Object.keys(own.attributes) as (keyof Player['attributes'])[])
          .sort((a, b) => own.attributes[b] - own.attributes[a] || (a < b ? -1 : 1))
          .slice(0, 2);
        for (const key of best)
          mate.attributes[key] = Math.min(mate.potential, mate.attributes[key] + T.mentorGain);
        return {
          outcome: 'grown',
          effects: { teammate: 15, xp: T.mentorXp, cliques: { young: 4 } },
          chronicle: true,
        };
      }
      return { outcome: 'gone', effects: { xp: Math.round(T.mentorXp / 2) } };
    },
  },
  {
    kind: 'captaincy',
    weight: 0.8,
    respond: 2,
    lapse: 'support',
    choices: [
      { id: 'stand', effects: {}, followUp: 2 },
      { id: 'support', effects: { cliques: { seniors: 6 }, teammate: 8 } },
    ],
    trigger(world) {
      const career = world.career!;
      const club = careerClub(world);
      if (career.captaincy?.clubId === club.id) return null;
      if (age(world) < T.captaincyAge || managerTrust(world) < T.captaincyTrust) return null;
      if (seasonMatches(world).length < T.captaincyMatches) return null;
      const rival = keyTeammates(world).sort(
        (a, b) => b.attributes.leadership - a.attributes.leadership || (a.id < b.id ? -1 : 1),
      )[0];
      return rival ? teammateParams(rival) : null;
    },
    resolve(world, story, rng) {
      const own = player(world);
      const mate = world.players[String(story.params.teammateId)];
      const claim =
        own.attributes.leadership + managerTrust(world) / 2 + rng.next() * T.captaincySpread;
      const other = (mate?.attributes.leadership ?? 50) + 40;
      if (claim >= other) {
        world.career!.captaincy = { clubId: careerClub(world).id, since: today(world) };
        return {
          outcome: 'named',
          effects: { fame: 5, trust: 4, morale: 6, teammate: -6 },
          chronicle: true,
        };
      }
      return { outcome: 'passed', effects: { morale: -4, teammate: 4 } };
    },
  },
  {
    kind: 'new-manager',
    weight: 3,
    respond: 1,
    lapse: 'quiet',
    choices: [
      { id: 'extra', effects: { fatigue: 8 }, followUp: 4 },
      { id: 'quiet', effects: {} },
      { id: 'talk', effects: {}, followUp: 1 },
    ],
    trigger(world) {
      const arrived = world.inbox.some(
        (message) => message.subjectKey === 'new-manager' && thisWeek(world, message.date),
      );
      if (!arrived) return null;
      const manager = world.managers[careerClub(world).managerId];
      return manager ? { manager: manager.name } : null;
    },
    resolve(world, story, rng) {
      if (story.choice === 'extra')
        return player(world).form >= T.newManagerForm
          ? { outcome: 'impressed', effects: { trust: 8, morale: 3 } }
          : { outcome: 'unconvinced', effects: { trust: 2 } };
      // A meeting: a manager reads it as ambition or as pressure.
      return rng.next() < 0.5
        ? { outcome: 'welcomed', effects: { trust: 5 } }
        : { outcome: 'bristled', effects: { trust: -4 } };
    },
  },
  {
    kind: 'rival-war',
    weight: 1,
    respond: 1,
    lapse: 'ignore',
    choices: [
      { id: 'respond', effects: { fame: 3, rival: 10, trust: -2 }, followUp: 5 },
      { id: 'ignore', effects: { mood: 2, morale: 1 } },
      { id: 'joke', effects: { fame: 1, fans: 2 } },
    ],
    trigger(world) {
      const rivalry = rivalryOf(world);
      const rival = rivalOf(world);
      if (!rivalry || !rival || rivalry.intensity < T.rivalIntensity) return null;
      const lines = seasonLines(world);
      return {
        rival: rival.name,
        goals: lines?.career.goals ?? 0,
        rivalGoals: lines?.rival.goals ?? 0,
      };
    },
    resolve(world, story) {
      const lines = seasonLines(world);
      const gained = (lines?.career.goals ?? 0) - Number(story.params.goals);
      const rivalGained = (lines?.rival.goals ?? 0) - Number(story.params.rivalGoals);
      return gained >= rivalGained
        ? { outcome: 'won', effects: { fame: 5, morale: 4 }, chronicle: true }
        : { outcome: 'lost', effects: { fame: -3, morale: -3 } };
    },
  },
  {
    kind: 'transfer-saga',
    weight: 1.2,
    respond: 2,
    lapse: 'quiet',
    choices: [
      { id: 'commit', effects: { fans: 8, trust: 4, interest: -30 } },
      { id: 'quiet', effects: {} },
      { id: 'flirt', effects: { fans: -6, trust: -3, interest: 20, fame: 2 } },
    ],
    trigger(world) {
      const club = careerClub(world);
      const suitor = world.scouting
        .filter((entry) => entry.kind === 'transfer' && entry.stage !== 'watching')
        .map((entry) => world.clubs[entry.clubId]!)
        .filter((entry) => entry && entry.reputation >= club.reputation + T.sagaGap)
        .sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1))[0];
      return suitor ? { club: suitor.name, clubId: suitor.id } : null;
    },
  },
  {
    kind: 'comeback',
    weight: 4,
    respond: 1,
    lapse: 'ease',
    choices: [
      { id: 'ease', effects: { morale: 5, fatigue: -10 } },
      { id: 'prove', effects: { morale: 2 }, followUp: 4 },
    ],
    trigger(world) {
      if (player(world).injuryId) return null;
      // An injury of several weeks that has just ended.
      const injury = [...world.chronicle]
        .reverse()
        .find((entry) => entry.playerId === player(world).id && entry.kind === 'injury');
      const weeks = Number(injury?.params.weeks ?? 0);
      if (!injury || weeks < T.comebackWeeks) return null;
      const back = addWeeks(world, injury.date, weeks);
      const since = world.date.season === back.season ? world.date.week - back.week : 99;
      return since >= 0 && since <= 1 ? { weeks } : null;
    },
    resolve(world, story) {
      const start = story.started;
      const since = world.career!.matches.filter(
        (match) =>
          match.season > start.season ||
          (match.season === start.season && match.week >= start.week),
      );
      const rating = since.length
        ? since.reduce((sum, match) => sum + match.rating, 0) / since.length
        : 0;
      return rating >= T.comebackRating
        ? { outcome: 'roaring', effects: { fame: 6, morale: 5 }, chronicle: true }
        : { outcome: 'slow', effects: { morale: -3 } };
    },
  },
  {
    kind: 'homecoming',
    weight: 4,
    respond: 1,
    lapse: 'cool',
    choices: [
      { id: 'applaud', effects: { oldFans: 10, fans: -2 } },
      { id: 'cool', effects: {} },
      { id: 'nofriends', effects: { fans: 4, oldFans: -8 } },
    ],
    trigger(world) {
      const next = nextFixture(world);
      if (!next) return null;
      const former = world.career!.market.moves.some(
        (move) => move.fromClubId === next.opponent.id,
      );
      return former ? { club: next.opponent.name, clubId: next.opponent.id } : null;
    },
  },
  {
    kind: 'charity',
    weight: 0.6,
    respond: 2,
    lapse: 'decline',
    choices: [
      { id: 'visit', effects: { fans: 5, fame: 3, fatigue: 4 } },
      { id: 'donate', effects: { fans: 2, cash: -T.charityGift } },
      { id: 'decline', effects: { fans: -1 } },
    ],
    trigger(world) {
      return fameLevel(world.career!.fame) >= T.charityFame &&
        world.career!.market.finances.cash >= T.charityGift
        ? { city: careerClub(world).city }
        : null;
    },
  },
  {
    kind: 'night-out',
    weight: 1,
    respond: 1,
    lapse: 'stay',
    choices: [
      { id: 'go', effects: { cliques: { core: 6, young: 4 }, fatigue: 8, morale: 3 }, followUp: 1 },
      { id: 'stay', effects: { cliques: { seniors: 2 }, morale: 1 } },
    ],
    trigger(world) {
      const won = world.career!.matches.some(
        (match) =>
          match.season === world.date.season &&
          match.week === world.date.week &&
          match.result === 'win',
      );
      return won ? { club: careerClub(world).name } : null;
    },
    resolve(_world, _story, rng) {
      return rng.next() < T.nightOutRisk
        ? { outcome: 'photos', effects: { fame: -3, trust: -4, fans: -3 } }
        : { outcome: 'bonded', effects: { mood: 3 } };
    },
  },
  {
    kind: 'derby-promise',
    weight: 4,
    respond: 1,
    lapse: 'respect',
    choices: [
      { id: 'promise', effects: { fans: 2 }, followUp: 1 },
      { id: 'respect', effects: {} },
    ],
    trigger(world) {
      const next = nextFixture(world);
      const club = careerClub(world);
      if (!next || !club.city || next.opponent.city !== club.city) return null;
      return { club: next.opponent.name, fixtureId: next.fixture.id, city: club.city };
    },
    resolve(world, story) {
      const result = resultOf(world, String(story.params.fixtureId));
      return result === 'win'
        ? { outcome: 'delivered', effects: { fans: 8, fame: 3 }, chronicle: true }
        : result === 'loss'
          ? { outcome: 'broken', effects: { fans: -8, fame: -2 } }
          : { outcome: 'drawn', effects: { fans: -2 } };
    },
  },
  {
    kind: 'contract-envy',
    weight: 0.7,
    respond: 2,
    lapse: 'let',
    choices: [
      { id: 'talks', effects: { trust: -3 }, followUp: 3 },
      { id: 'let', effects: { morale: -2 } },
      { id: 'joke', effects: { teammate: 4 } },
    ],
    trigger(world) {
      const own = player(world);
      const wage = own.contractId ? world.contracts[own.contractId]?.weeklyWage : undefined;
      if (!wage) return null;
      const richer = keyTeammates(world)
        .filter((mate) => {
          const theirs = mate.contractId ? world.contracts[mate.contractId]?.weeklyWage : 0;
          return (theirs ?? 0) >= wage * T.envyRatio && playerAbility(mate) <= playerAbility(own);
        })
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      return richer ? teammateParams(richer) : null;
    },
    resolve(world) {
      return managerTrust(world) >= T.disputeTrust
        ? { outcome: 'heard', effects: { morale: 4, trust: 2 } }
        : { outcome: 'ignored', effects: { morale: -3 } };
    },
  },
];
export const STORYLET_BY_KIND = Object.fromEntries(
  STORYLETS.map((story) => [story.kind, story]),
) as Record<StoryKind, Storylet>;

/** Apply a story's effects to the world. */
function applyEffects(world: World, story: StoryState, effects: StoryEffects): void {
  const career = world.career!;
  const own = player(world);
  const club = careerClub(world);
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  if (effects.trust) adjustRelationship(world, 'manager', club.managerId, effects.trust);
  if (effects.fans) adjustRelationship(world, 'fans', club.id, effects.fans);
  if (effects.fame) career.fame = Math.max(0, career.fame + effects.fame);
  if (effects.mood) adjustMood(world, effects.mood);
  if (effects.cliques) adjustCliques(world, effects.cliques);
  const mateId = story.params.teammateId;
  if (effects.teammate && typeof mateId === 'string' && world.players[mateId])
    adjustRelationship(world, 'teammate', mateId, effects.teammate);
  if (effects.morale) own.morale = clamp(own.morale + effects.morale);
  if (effects.form) own.form = clamp(own.form + effects.form);
  if (effects.fatigue) own.fatigue = clamp(own.fatigue + effects.fatigue);
  if (effects.xp) addXp(career, effects.xp);
  if (effects.cash)
    career.market.finances.cash = Math.max(0, career.market.finances.cash + effects.cash);
  const rivalry = rivalryOf(world);
  if (effects.rival && rivalry) adjustIntensity(rivalry, effects.rival);
  const clubId = story.params.clubId;
  if (effects.interest && typeof clubId === 'string')
    for (const entry of world.scouting)
      if (entry.clubId === clubId && entry.playerId === own.id)
        entry.confidence = clamp(entry.confidence + effects.interest);
  if (effects.oldFans && typeof clubId === 'string' && world.clubs[clubId])
    adjustRelationship(world, 'fans', clubId, effects.oldFans);
}

/** The open story (offered or waiting), if any. */
export function openStory(world: World): StoryState | null {
  return (
    world.career?.stories?.find((story) => story.status === 'offered') ??
    world.career?.stories?.find((story) => story.status === 'waiting') ??
    null
  );
}
/** The story awaiting the player's choice, if any. */
export function offeredStory(world: World): StoryState | null {
  return world.career?.stories?.find((story) => story.status === 'offered') ?? null;
}

function choose(world: World, story: StoryState, choiceId: string): void {
  const def = STORYLET_BY_KIND[story.kind];
  const choice = def.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('Unknown story choice');
  story.choice = choice.id;
  applyEffects(world, story, choice.effects);
  if (choice.followUp && def.resolve) {
    story.status = 'waiting';
    story.resolveAt = addWeeks(world, today(world), choice.followUp);
  } else {
    story.status = 'resolved';
    story.outcome = choice.id;
  }
}
function resolve(world: World, story: StoryState, rng: Rng): void {
  const def = STORYLET_BY_KIND[story.kind];
  const result = def.resolve!(world, story, rng);
  story.status = 'resolved';
  story.outcome = result.outcome;
  applyEffects(world, story, result.effects);
  const params = { story: story.kind, outcome: result.outcome, ...story.params };
  postMessage(world, 'story-outcome', params, story.id);
  if (result.chronicle) chronicle(world, 'story', params);
}

/** Answer the offered story. Returns a new world; the input is untouched. */
export function answerStory(input: World, storyId: string, choiceId: string): World {
  const world = draft(input);
  const story = world.career!.stories?.find((entry) => entry.id === storyId);
  if (!story || story.status !== 'offered') throw new Error('No story awaiting an answer');
  choose(world, story, choiceId);
  return world;
}

/**
 * The stories' week: lapse unanswered offers into their default, resolve follow-ups that are
 * due, then perhaps start a new story when none is open. Mutates the world.
 */
export function storiesWeek(world: World): void {
  const career = world.career;
  if (!career || !player(world).clubId) return;
  const stories = (career.stories ??= []);
  const rng = createRng(`${world.seed}:stories:${world.date.season}:${world.date.week}`);
  const now = today(world);
  for (const story of stories)
    if (story.status === 'offered' && compareDates(story.respondBy, now) < 0)
      choose(world, story, STORYLET_BY_KIND[story.kind].lapse);
  for (const story of stories)
    if (story.status === 'waiting' && story.resolveAt && compareDates(story.resolveAt, now) <= 0)
      resolve(world, story, rng);
  if (stories.some((story) => story.status !== 'resolved')) return;
  const last = stories.at(-1);
  if (last && compareDates(addWeeks(world, last.started, T.gapWeeks), now) > 0) return;
  const usedThisSeason = new Set(
    stories.filter((story) => story.started.season === world.date.season).map((s) => s.kind),
  );
  // Stories tied to an occasion (a new manager, a comeback, a derby) always come up; the
  // others only on some weeks.
  const ready = STORYLETS.flatMap((def) => {
    if (usedThisSeason.has(def.kind)) return [];
    const params = def.trigger(world, rng);
    return params ? [{ def, params }] : [];
  });
  if (!ready.length) return;
  const urgent = ready.filter((entry) => entry.def.weight >= T.occasionWeight);
  if (!urgent.length && rng.next() > T.weeklyChance) return;
  const pool = urgent.length ? urgent : ready;
  let pick = rng.next() * pool.reduce((sum, entry) => sum + entry.def.weight, 0);
  const chosen = pool.find((entry) => (pick -= entry.def.weight) < 0) ?? pool[pool.length - 1]!;
  const story: StoryState = {
    id: `story:${chosen.def.kind}:${world.date.season}:${world.date.week}`,
    version: 1,
    kind: chosen.def.kind,
    started: now,
    respondBy: { ...addWeeks(world, now, chosen.def.respond - 1), day: 7 },
    params: chosen.params,
    status: 'offered',
    choice: null,
    resolveAt: null,
    outcome: null,
  };
  stories.push(story);
  if (stories.length > T.limit) stories.splice(0, stories.length - T.limit);
  postMessage(world, 'story-offer', { story: story.kind, ...story.params }, story.id);
}

/** The fan affection the story changes at a former club, for the UI's chips. */
export function oldFansValue(world: World, story: StoryState): number | null {
  const clubId = story.params.clubId;
  return typeof clubId === 'string' && world.clubs[clubId]
    ? relationshipValue(world, 'fans', clubId)
    : null;
}

function draft(input: World): World {
  const own = input.career!.playerId;
  return {
    ...input,
    career: structuredClone(input.career!),
    // A choice changes the player's morale, form and fatigue: the player is copied first.
    players: { ...input.players, [own]: structuredClone(input.players[own]!) },
    inbox: [...input.inbox],
    chronicle: [...input.chronicle],
    relationships: input.relationships.map((entry) => ({ ...entry })),
    dressingRooms: structuredClone(input.dressingRooms),
    rivalries: structuredClone(input.rivalries),
    scouting: input.scouting.map((entry) => ({ ...entry })),
  };
}
