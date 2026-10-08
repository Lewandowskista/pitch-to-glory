import type {
  CareerMatchRecord,
  Club,
  MediaChoice,
  MediaEffects,
  MediaItem,
  MediaTone,
  World,
} from '../../../model/domain';
import type { Rng } from '../../rng';
import { fixtureKind } from '../fixtures';
import { adjustRelationship, nextId, postMessage } from '../market/records';
import { addWeeks, compareDates, today } from '../market/rules';
import { adjustCliques, adjustMood } from './dressing';
import { adjustIntensity, rivalOf, rivalryOf, seasonLines } from './rival';
import { careerClub, careerPlayer, S } from './rules';

const MD = S.media;

/** Press topics and their answers. Effects are shown to the player before they choose. */
export type PressTopic =
  'win' | 'loss' | 'goal' | 'dropped' | 'rumour' | 'request' | 'newclub' | 'rival' | 'bigmatch';
const effect = (partial: Partial<MediaEffects>): MediaEffects => ({
  fame: 0,
  trust: 0,
  mood: 0,
  fans: 0,
  rival: 0,
  cliques: {},
  ...partial,
});
export const PRESS: Record<PressTopic, [MediaTone, MediaEffects][]> = {
  win: [
    [
      'team',
      effect({ fame: 1, trust: 2, mood: 2, fans: 1, cliques: { core: 2, seniors: 2, young: 1 } }),
    ],
    ['confident', effect({ fame: 3, mood: -1, fans: 2, cliques: { young: 2, seniors: -2 } })],
    ['humble', effect({ fame: 1, trust: 3, mood: 1, cliques: { seniors: 2 } })],
  ],
  loss: [
    ['humble', effect({ fame: 1, trust: 3, mood: 2, fans: 2, cliques: { seniors: 2, core: 1 } })],
    ['deflect', effect({ trust: -1, fans: 1 })],
    [
      'provocative',
      effect({
        fame: 2,
        trust: -3,
        mood: -3,
        fans: -1,
        cliques: { core: -3, seniors: -3, young: -1 },
      }),
    ],
  ],
  goal: [
    ['team', effect({ fame: 1, mood: 2, cliques: { core: 2, young: 1, internationals: 1 } })],
    ['confident', effect({ fame: 3, fans: 2, cliques: { seniors: -1 } })],
    ['humble', effect({ fame: 1, trust: 2, cliques: { seniors: 2 } })],
  ],
  dropped: [
    ['humble', effect({ trust: 3, mood: 1, cliques: { seniors: 2 } })],
    ['confident', effect({ fame: 2, trust: -3, fans: 1, cliques: { young: 1, seniors: -2 } })],
    ['deflect', effect({ fame: -1 })],
  ],
  rumour: [
    ['team', effect({ trust: 3, fans: 3, mood: 1 })],
    ['deflect', effect({ fame: 1 })],
    ['confident', effect({ fame: 3, trust: -3, fans: -3 })],
  ],
  request: [
    ['humble', effect({ trust: 1, fans: 3, mood: 1 })],
    ['confident', effect({ fame: 2, trust: -2, fans: -2 })],
    ['deflect', effect({ fame: -1 })],
  ],
  newclub: [
    ['humble', effect({ fame: 1, fans: 1, cliques: { seniors: 1 } })],
    ['confident', effect({ fame: 3, trust: 1, fans: 2, cliques: { seniors: -1 } })],
    ['team', effect({ trust: 2, mood: 2, cliques: { seniors: 2, core: 1 } })],
  ],
  rival: [
    ['humble', effect({ fame: 1, trust: 1, rival: -4 })],
    [
      'provocative',
      effect({ fame: 4, trust: -2, fans: 2, rival: 8, cliques: { young: 2, seniors: -2 } }),
    ],
    ['deflect', effect({ rival: -1 })],
  ],
  bigmatch: [
    ['confident', effect({ fame: 3, fans: 2, mood: 1, cliques: { young: 1 } })],
    ['team', effect({ trust: 2, mood: 3, cliques: { core: 2, seniors: 1 } })],
    ['humble', effect({ fame: 1, trust: 1 })],
  ],
};
const INTERVIEWS: readonly PressTopic[] = ['rumour', 'rival', 'newclub'];

const OUTLETS = [
  'The Touchline Daily',
  'Matchday Wire',
  'The Football Ledger',
  'Final Whistle',
  'Pressbox Weekly',
  'Inside Left Review',
];
const FAN_WORDS = ['Faithful', 'Terrace', 'Scarf', 'Chant', 'Stand', 'Ultra', 'Season', 'Away'];
function fanHandle(rng: Rng, club: Club): string {
  const city =
    club.city
      .normalize('NFD')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 12) || 'Club';
  return `@${city}${rng.pick(FAN_WORDS)}${rng.int(1, 99)}`;
}

function addItem(
  world: World,
  rng: Rng,
  item: Omit<MediaItem, 'id' | 'date' | 'likes' | 'choices' | 'answer' | 'expires'> &
    Partial<Pick<MediaItem, 'choices' | 'expires'>>,
): MediaItem {
  const full: MediaItem = {
    id: nextId(world, 'media'),
    date: today(world),
    likes: Math.max(0, Math.round(rng.int(3, 40) + world.career!.fame * MD.likesPerFame)),
    choices: [],
    answer: null,
    expires: null,
    ...item,
  };
  world.media.push(full);
  if (world.media.length > MD.limit) world.media.splice(0, world.media.length - MD.limit);
  return full;
}

function pendingPress(world: World): MediaItem | undefined {
  return world.media.find((item) => item.choices.length > 0 && item.answer === null);
}

/** Whether a topic was raised recently: the press does not ask the same thing every week. */
function askedRecently(world: World, topic: PressTopic): boolean {
  return world.media.some(
    (item) =>
      item.choices.length > 0 &&
      item.textKey === topic &&
      compareDates(addWeeks(world, item.date, MD.topicCooldown), world.date) > 0,
  );
}

/** Open a press conference or interview on a topic; the inbox announces it. */
export function openPress(
  world: World,
  rng: Rng,
  topic: PressTopic,
  params: MediaItem['params'],
): MediaItem {
  const kind = INTERVIEWS.includes(topic) ? 'interview' : 'press';
  const item = addItem(world, rng, {
    kind,
    author: 'journalist',
    authorName: rng.pick(OUTLETS),
    textKey: topic,
    params,
    sentiment: 0,
    choices: PRESS[topic].map(([tone, effects]): MediaChoice => ({
      id: `${topic}:${tone}`,
      tone,
      labelKey: `${topic}.${tone}`,
      effects,
    })),
    expires: { ...addWeeks(world, today(world), MD.pressWeeks), day: 7 },
  });
  postMessage(world, 'press-request', { topic, outlet: item.authorName }, item.id);
  return item;
}

/** Apply a chosen answer: fame, the manager, the fans, the dressing room and the rival. */
export function answerPress(world: World, mediaId: string, choiceId: string): void {
  const item = world.media.find((entry) => entry.id === mediaId);
  if (!item || item.answer !== null) throw new Error('This question has already been answered');
  const choice = item.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('Unknown answer');
  const club = careerClub(world);
  const e = choice.effects;
  world.career!.fame += e.fame;
  if (e.trust) adjustRelationship(world, 'manager', club.managerId, e.trust);
  if (e.fans) adjustRelationship(world, 'fans', club.id, e.fans);
  if (e.mood) adjustMood(world, e.mood);
  adjustCliques(world, e.cliques);
  const rivalry = rivalryOf(world);
  if (rivalry && e.rival) adjustIntensity(rivalry, e.rival);
  item.answer = choice.id;
  const social = world.career!.social;
  social.answered++;
  // Bold words are judged by the next result; humble ones earn trust from a win.
  if (choice.tone === 'confident' || choice.tone === 'provocative' || choice.tone === 'humble')
    social.stance = { tone: choice.tone, date: today(world) };
  // Bold words are judged by the next result; humble ones earn trust from a win.
  if (choice.tone === 'confident' || choice.tone === 'provocative' || choice.tone === 'humble')
    social.stance = { tone: choice.tone, date: today(world) };
  social.coverage = Math.max(-10, Math.min(10, social.coverage + Math.sign(e.fans + e.fame / 2)));
  // The rival bites back at a provocation.
  const rival = rivalOf(world);
  if (rival && choice.tone === 'provocative' && item.textKey === 'rival') {
    world.media.push({
      id: nextId(world, 'media'),
      date: today(world),
      kind: 'social',
      author: 'rival',
      authorName: rival.name,
      textKey: 'rival.reply',
      params: { player: careerPlayer(world).name },
      sentiment: -1,
      likes: Math.round(world.career!.fame * MD.likesPerFame) + 25,
      choices: [],
      answer: null,
      expires: null,
    });
  }
}

/** Unanswered questions lapse; silence costs a little fame. */
export function lapsePress(world: World): void {
  for (const item of world.media) {
    if (!item.choices.length || item.answer !== null || !item.expires) continue;
    if (
      item.expires.season > world.date.season ||
      (item.expires.season === world.date.season && item.expires.week > world.date.week)
    )
      continue;
    item.answer = 'silence';
    world.career!.fame += MD.silenceFame;
  }
}

function performanceBand(record: CareerMatchRecord): 'great' | 'good' | 'mixed' | 'poor' {
  if (record.rating >= 7.5 || record.goals >= 2) return 'great';
  if (record.rating >= 6.8 || (record.goals >= 1 && record.result !== 'loss')) return 'good';
  if (record.rating >= 5.8) return 'mixed';
  return 'poor';
}
const SENTIMENT = { great: 2, good: 1, mixed: 0, poor: -1 } as const;

/**
 * The week's coverage: a headline and fan posts for each match played, journalists on
 * notable performances, the rival's own posts, and at most one open press question.
 * Returns the summed sentiment of new posts.
 */
export function mediaWeek(world: World, rng: Rng, matches: CareerMatchRecord[]): number {
  lapsePress(world);
  const player = careerPlayer(world);
  const club = careerClub(world);
  let sentiment = 0;
  for (const record of matches) {
    const band = performanceBand(record);
    const opponent = world.clubs[record.opponentId]?.name ?? '';
    const params = {
      player: player.name,
      club: club.name,
      opponent,
      score: `${record.score[0]}–${record.score[1]}`,
      rating: record.rating.toFixed(1),
      goals: record.goals,
    };
    const headline =
      record.goals > 0
        ? 'scorer'
        : record.result === 'loss'
          ? band === 'poor'
            ? 'poor'
            : 'defeat'
          : band === 'great'
            ? 'strong'
            : 'steady';
    addItem(world, rng, {
      kind: 'headline',
      author: 'journalist',
      authorName: rng.pick(OUTLETS),
      textKey: `headline.${headline}`,
      params,
      sentiment: SENTIMENT[band],
    });
    for (let index = 0; index < MD.fanPosts; index++) {
      const tone =
        record.result === 'loss' && band !== 'great'
          ? Math.min(SENTIMENT[band], 0)
          : SENTIMENT[band];
      sentiment += tone;
      addItem(world, rng, {
        kind: 'social',
        author: 'fan',
        authorName: fanHandle(rng, club),
        textKey: `fan.${tone > 0 ? 'happy' : tone < 0 ? 'angry' : 'neutral'}.${rng.int(1, 3)}`,
        params,
        sentiment: tone,
      });
    }
    if ((band === 'great' || band === 'poor') && rng.next() < MD.journalistChance) {
      sentiment += SENTIMENT[band];
      addItem(world, rng, {
        kind: 'social',
        author: 'journalist',
        authorName: rng.pick(OUTLETS),
        textKey: `journalist.${band}`,
        params,
        sentiment: SENTIMENT[band],
      });
    }
  }
  rivalPosts(world, rng);
  if (!pendingPress(world)) pickPress(world, rng, matches);
  return sentiment;
}

function rivalPosts(world: World, rng: Rng): void {
  const rivalry = rivalryOf(world);
  const rival = rivalOf(world);
  if (!rivalry || !rival) return;
  const rivalClub = world.clubs[rival.clubId!]!;
  const goals = rival.stats.goals - rivalry.lastGoals;
  rivalry.lastGoals = rival.stats.goals;
  if (goals > 0)
    addItem(world, rng, {
      kind: 'social',
      author: 'rival',
      authorName: rival.name,
      textKey: goals > 1 ? 'rival.brace' : 'rival.goal',
      params: { club: rivalClub.name, goals },
      sentiment: 0,
    });
  const last = rivalry.timeline.at(-1);
  if (last && compareDates(last.date, world.date) === 0 && last.kind === 'transfer')
    addItem(world, rng, {
      kind: 'social',
      author: 'journalist',
      authorName: rng.pick(OUTLETS),
      textKey: 'journalist.rival-transfer',
      params: { rival: rival.name, club: String(last.params.club), fee: Number(last.params.fee) },
      sentiment: 0,
    });
  if (world.date.week % S.rival.compareEvery === 0) {
    const lines = seasonLines(world);
    if (lines && (lines.career.appearances || lines.rival.appearances))
      addItem(world, rng, {
        kind: 'social',
        author: 'journalist',
        authorName: rng.pick(OUTLETS),
        textKey: 'journalist.compare',
        params: {
          player: careerPlayer(world).name,
          rival: rival.name,
          goals: lines.career.goals,
          rivalGoals: lines.rival.goals,
        },
        sentiment: lines.career.goals >= lines.rival.goals ? 1 : -1,
      });
  }
}

/** At most one question at a time, on the week's most newsworthy topic. */
function pickPress(world: World, rng: Rng, matches: CareerMatchRecord[]): void {
  const career = world.career!;
  const market = career.market;
  const club = careerClub(world);
  const rival = rivalOf(world);
  const rivalry = rivalryOf(world);
  const ask = (topic: PressTopic, params: MediaItem['params']): boolean => {
    if (askedRecently(world, topic)) return false;
    openPress(world, rng, topic, params);
    return true;
  };
  const thisWeek = (date: { season: number; week: number } | null | undefined) =>
    Boolean(date && date.season === world.date.season && date.week === world.date.week);
  const lastMove = market.moves.at(-1);
  if (
    lastMove &&
    thisWeek(lastMove.date) &&
    ['transfer', 'loan', 'pre-contract'].includes(lastMove.kind)
  ) {
    if (ask('newclub', { club: club.name })) return;
  }
  if (thisWeek(market.transferRequest)) {
    if (ask('request', { club: club.name })) return;
  }
  const headToHead = rivalry?.timeline.at(-1);
  if (rival && headToHead?.kind === 'head-to-head' && thisWeek(headToHead.date)) {
    if (ask('rival', { rival: rival.name })) return;
  }
  const next = Object.values(world.fixtures).find(
    (f) =>
      f.date.season === world.date.season &&
      f.date.week === world.date.week + 1 &&
      (f.homeId === club.id || f.awayId === club.id) &&
      !world.results[f.id],
  );
  if (
    next &&
    ['final', 'tie'].includes(fixtureKind(world, next)) &&
    rng.next() < MD.bigMatchChance
  ) {
    const opponent = world.clubs[next.homeId === club.id ? next.awayId : next.homeId]!;
    if (ask('bigmatch', { opponent: opponent.name })) return;
  }
  const record = matches.at(-1);
  if (record && rng.next() < MD.pressChance) {
    const opponent = world.clubs[record.opponentId]?.name ?? '';
    const topic: PressTopic =
      record.goals > 0
        ? 'goal'
        : record.result === 'win'
          ? 'win'
          : record.result === 'loss'
            ? 'loss'
            : 'win';
    if (record.result !== 'draw' || record.goals > 0) {
      if (ask(topic, { opponent, score: `${record.score[0]}–${record.score[1]}` })) return;
    }
  }
  const lastMatch = career.matches.at(-1);
  const idle =
    !lastMatch || lastMatch.season !== world.date.season || world.date.week - lastMatch.week >= 3;
  if (
    market.selection.dropped >= 2 &&
    idle &&
    !world.players[career.playerId]!.injuryId &&
    rng.next() < 0.4
  ) {
    if (ask('dropped', { club: club.name })) return;
  }
  const suitor = world.scouting
    .filter((interest) => interest.kind === 'transfer' && interest.stage === 'offer')
    .map((interest) => world.clubs[interest.clubId]!)
    .sort((a, b) => b.reputation - a.reputation)[0];
  if (suitor && suitor.reputation > club.reputation && rng.next() < MD.rumourChance) {
    if (ask('rumour', { suitor: suitor.name })) return;
  }
  if (rival && rivalry && rivalry.intensity >= 40 && rng.next() < MD.rivalPressChance)
    ask('rival', { rival: rival.name });
}
