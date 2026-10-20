import type {
  CardKind,
  Club,
  DisciplineRecord,
  DisciplineScope,
  DisciplineState,
  Fixture,
  Id,
  World,
} from '../../model/domain';
import { CONFIG } from '../config';
import { createRng } from '../rng';
import { drawCard } from '../match/discipline';
import { available } from '../selection/lineup';

/**
 * Cards and suspensions in the world (the discipline phase, decision 5). Every finalized
 * fixture serves the bans due in its scope, then records its cards: an interactive match's
 * from the session, a background match's drawn on its own stream (`${seed}:cards:${fixture}`,
 * never an existing one). A ban is served in the scope it was earned in: league football, the
 * domestic cup or continental football (docs/BALANCING.md, "Discipline and suspensions").
 */
const S = CONFIG.world.background.suspensions;
const F = CONFIG.match.cards;

/** A card shown in a fixture. */
export interface FixtureCard {
  playerId: Id;
  teamId: Id;
  minute: number;
  card: CardKind;
}

/** Where a fixture's bans are served. */
export function disciplineScope(
  world: World,
  fixture: Pick<Fixture, 'competitionId'>,
): DisciplineScope {
  const competition = world.competitions[fixture.competitionId];
  if (!competition || world.leagues[fixture.competitionId]) return 'league';
  return competition.kind === 'domestic' ? 'cup' : 'continental';
}
/** This season's discipline, created (or rolled into the season) on first use. */
export function disciplineState(world: World): DisciplineState {
  if (!world.discipline) world.discipline = { version: 1, season: world.date.season, players: {} };
  else if (world.discipline.season !== world.date.season) rollDiscipline(world);
  return world.discipline!;
}
/**
 * A new season (called at the rollover): cards and tallies start again; bans still to serve
 * carry over, and records of players who left the world are dropped.
 */
export function rollDiscipline(world: World): void {
  const state = world.discipline;
  if (!state) return;
  const players: Record<Id, DisciplineRecord> = {};
  for (const [id, record] of Object.entries(state.players))
    if (world.players[id] && Object.keys(record.bans).length)
      players[id] = { cards: {}, tally: {}, bans: { ...record.bans } };
  world.discipline = { version: 1, season: world.date.season, players };
}
/** Matches a player still has to serve in a fixture's scope (0 when free to play). */
export function suspension(world: World, playerId: Id, fixture: Pick<Fixture, 'competitionId'>) {
  return world.discipline?.players[playerId]?.bans[disciplineScope(world, fixture)] ?? 0;
}
/** Every ban a player has left, by scope. */
export function bansOf(world: World, playerId: Id): Partial<Record<DisciplineScope, number>> {
  return world.discipline?.players[playerId]?.bans ?? {};
}
/** A player's cards this season: [yellows, dismissals], in one competition or all. */
export function seasonCards(world: World, playerId: Id, competitionId?: Id): [number, number] {
  const cards = world.discipline?.players[playerId]?.cards;
  if (!cards || world.discipline!.season !== world.date.season) return [0, 0];
  if (competitionId) return cards[competitionId] ?? [0, 0];
  return Object.values(cards).reduce<[number, number]>(
    (sum, [y, r]) => [sum[0] + y, sum[1] + r],
    [0, 0],
  );
}
/**
 * The fixtures a player's bans rule them out of: in each scope, their club's next unplayed
 * fixtures in it this season, as many as the matches left to serve.
 */
export function bannedFixtures(
  world: World,
  playerId: Id,
): Map<Id, { scope: DisciplineScope; match: number; of: number }> {
  const banned = new Map<Id, { scope: DisciplineScope; match: number; of: number }>();
  const bans = bansOf(world, playerId);
  const clubId = world.players[playerId]?.clubId;
  if (!clubId || !Object.keys(bans).length) return banned;
  const upcoming = Object.values(world.fixtures)
    .filter(
      (f) =>
        (f.homeId === clubId || f.awayId === clubId) &&
        f.date.season === world.date.season &&
        !world.results[f.id],
    )
    .sort((a, b) => a.date.week - b.date.week || a.date.day - b.date.day || (a.id < b.id ? -1 : 1));
  for (const [scope, matches] of Object.entries(bans) as [DisciplineScope, number][])
    upcoming
      .filter((f) => disciplineScope(world, f) === scope)
      .slice(0, matches)
      .forEach((fixture, index) =>
        banned.set(fixture.id, { scope, match: index + 1, of: matches }),
      );
  return banned;
}
/**
 * The players a club leaves out of a fixture for suspension: everyone with a ban in its scope,
 * as long as eleven available players remain (a squad never goes short for a ban).
 */
export function suspendedFor(
  world: World,
  club: Club,
  fixture: Pick<Fixture, 'competitionId'>,
): Id[] {
  if (!world.discipline) return [];
  const scope = disciplineScope(world, fixture);
  const ready = club.playerIds.filter((id) => available(world.players[id]));
  const banned = ready.filter((id) => (world.discipline!.players[id]?.bans[scope] ?? 0) > 0);
  return banned.slice(0, Math.max(0, ready.length - 11));
}

/**
 * A background fixture's cards (national worlds), on its own stream: for each side, every
 * regulation minute, the same draw as the match engine's (`drawCard`) among its players on the
 * pitch, keepers aside, with second yellows and straight reds; a player sent off takes no
 * further part. Results are already decided: the cards change who is suspended later, not the
 * score.
 */
export function backgroundCards(
  world: World,
  fixture: Fixture,
  participants: readonly { playerId: Id; teamId: Id; minutes: number }[],
): FixtureCard[] {
  const rng = createRng(`${world.seed}:cards:${fixture.id}`);
  const cards: FixtureCard[] = [];
  for (const teamId of [fixture.homeId, fixture.awayId]) {
    const side = participants.filter(
      (p) => p.teamId === teamId && world.players[p.playerId]?.primaryPosition !== 'GK',
    );
    const booked = new Set<Id>(),
      off = new Set<Id>();
    for (let minute = 1; minute <= 90; minute++) {
      // On the pitch this minute: a background starter plays the 90.
      const pool = side
        .filter((p) => p.minutes >= minute && !off.has(p.playerId))
        .map((p) => p.playerId);
      const drawn = drawCard(rng, F.perTeamPerMinute, pool, world.players, booked);
      if (!drawn) continue;
      if (drawn.card !== 'yellow' && off.size >= F.maxDismissals) continue;
      cards.push({ playerId: drawn.playerId, teamId, minute, card: drawn.card });
      if (drawn.card === 'yellow') booked.add(drawn.playerId);
      else off.add(drawn.playerId);
    }
  }
  return cards.sort((a, b) => a.minute - b.minute || (a.teamId < b.teamId ? -1 : 1));
}

/** What a fixture's cards did to one player, for the career's inbox. */
export interface NewBan {
  playerId: Id;
  scope: DisciplineScope;
  matches: number;
  reason: 'second-yellow' | 'straight-red' | 'accumulation';
}
/**
 * After a fixture: both squads serve a match of any ban in its scope, then its cards are
 * recorded, with new bans for dismissals and for reaching an accumulation threshold. Returns
 * the bans that started.
 */
export function applyDiscipline(
  world: World,
  fixture: Fixture,
  cards: readonly FixtureCard[],
): NewBan[] {
  const scope = disciplineScope(world, fixture);
  if (world.discipline)
    for (const clubId of [fixture.homeId, fixture.awayId])
      for (const id of world.clubs[clubId]?.playerIds ?? []) {
        const record = world.discipline.players[id];
        const due = record?.bans[scope];
        if (!record || !due) continue;
        if (due > 1) record.bans[scope] = due - 1;
        else delete record.bans[scope];
      }
  if (!cards.length) return [];
  const state = disciplineState(world);
  const started: NewBan[] = [];
  const byPlayer = new Map<Id, FixtureCard[]>();
  for (const card of cards)
    byPlayer.set(card.playerId, [...(byPlayer.get(card.playerId) ?? []), card]);
  for (const [playerId, own] of byPlayer) {
    const player = world.players[playerId];
    if (!player) continue;
    const record = (state.players[playerId] ??= { cards: {}, tally: {}, bans: {} });
    const yellows = own.filter((c) => c.card === 'yellow' || c.card === 'second-yellow').length;
    const dismissal = own.find((c) => c.card !== 'yellow');
    const line = (record.cards[fixture.competitionId] ??= [0, 0]);
    line[0] += yellows;
    line[1] += dismissal ? 1 : 0;
    player.stats.yellowCards = (player.stats.yellowCards ?? 0) + yellows;
    if (dismissal) player.stats.redCards = (player.stats.redCards ?? 0) + 1;
    let matches = 0;
    let reason: NewBan['reason'] | undefined;
    if (dismissal) {
      matches = dismissal.card === 'red' ? S.straightRed : S.secondYellow;
      reason = dismissal.card === 'red' ? 'straight-red' : 'second-yellow';
    } else if (yellows) {
      // Yellows that ended in a dismissal never count towards an accumulation ban.
      const before = record.tally[scope] ?? 0;
      const after = before + yellows;
      record.tally[scope] = after;
      const threshold = S.accumulation[scope];
      if (Math.floor(after / threshold) > Math.floor(before / threshold)) {
        matches = 1;
        reason = 'accumulation';
      }
    }
    if (matches && reason) {
      record.bans[scope] = (record.bans[scope] ?? 0) + matches;
      started.push({ playerId, scope, matches: record.bans[scope]!, reason });
    }
  }
  return started;
}
