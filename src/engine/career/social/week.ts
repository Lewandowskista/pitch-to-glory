import type {
  CareerMatchRecord,
  CareerSocial,
  Fixture,
  MoralePart,
  World,
} from '../../../model/domain';
import { createRng } from '../../rng';
import { adjustRelationship, postMessage } from '../market/records';
import { currentRole, relationshipValue } from '../market/rules';
import {
  adjustCliques,
  chemistry,
  dressingWeek,
  ensureTeammates,
  recentResults,
  syncCliques,
} from './dressing';
import { mediaWeek } from './media';
import { lifestyleMorale } from '../lifestyle/lifestyle';
import { recordHeadToHead, rivalOf, rivalSeasonEnd, rivalTransfer, startRivalry } from './rival';
import {
  boundPart,
  careerClub,
  careerPlayer,
  careerRoom,
  cultureFit,
  MORALE_PARTS,
  S,
} from './rules';

const M = S.morale;
const EXPECTED_STARTS = { key: 0.9, rotation: 0.7, backup: 0.4, youth: 0.5 } as const;
const clampPercent = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

export function initialSocial(): CareerSocial {
  return { history: [], morale: null, answered: 0, coverage: 0 };
}

/**
 * The parts of the player's weekly morale target, each bounded, so the UI can show exactly
 * why morale is rising or falling.
 */
export function moraleParts(world: World): Record<MoralePart, number> {
  const career = world.career!;
  const player = careerPlayer(world);
  const club = careerClub(world);
  const results = recentResults(world, club.id, 4);
  const score = results.reduce((sum, r) => sum + (r === 'win' ? 1 : r === 'loss' ? -1 : 0), 0);
  const selection = career.market.selection;
  const matchdays = selection.selected + selection.dropped;
  const playing =
    player.injuryId || matchdays < 3
      ? 0
      : (selection.selected / matchdays - EXPECTED_STARTS[currentRole(world)]) * 20;
  const situation =
    (player.injuryId ? M.injury : 0) +
    (career.market.transferRequest && !selection.promiseBroken ? M.transferRequest : 0);
  const parts: Record<MoralePart, number> = {
    results: boundPart(score * M.resultsPerPoint, M.resultsLimit),
    playingTime: boundPart(playing, M.playingTime),
    trust: boundPart((relationshipValue(world, 'manager', club.managerId) - 50) * M.trust),
    chemistry: boundPart((chemistry(world) - 50) * M.chemistry),
    dressingRoom: boundPart((careerRoom(world).mood - 50) * M.dressingRoom),
    cultureFit: boundPart((cultureFit(world, player, club).value - 50) * M.cultureFit),
    fans: boundPart((relationshipValue(world, 'fans', club.id) - 50) * M.fans),
    media: boundPart(career.social.coverage * M.media),
    lifestyle: career.style ? boundPart(lifestyleMorale(world)) : 0,
    situation: boundPart(situation),
  };
  return parts;
}

/**
 * Manager trust, fan affection and the dressing room react to a match the player played;
 * a meeting with the rival's club counts in the rivalry. Called from the single commit path.
 */
export function socialMatch(world: World, record: CareerMatchRecord, fixture: Fixture): void {
  if (!world.career?.social) return;
  const P = S.performance;
  const club = careerClub(world);
  const band =
    record.rating >= P.greatRating
      ? 'great'
      : record.rating >= P.goodRating
        ? 'good'
        : record.rating < P.poorRating
          ? 'poor'
          : null;
  if (band) {
    adjustRelationship(world, 'manager', club.managerId, P.trust[band]);
    adjustRelationship(world, 'fans', club.id, P.fans[band]);
  }
  if (record.goals) adjustRelationship(world, 'fans', club.id, P.fans.goal * record.goals);
  const C = S.cliques;
  if (record.rating >= C.goodRating) adjustCliques(world, C.performance);
  else if (record.rating < C.poorRating) adjustCliques(world, -C.performance);
  recordHeadToHead(world, fixture);
}

/**
 * The career's social week, after the market week: dressing room, rival, media and the
 * morale and form record. Mutates the world, which the caller owns.
 */
export function socialWeek(world: World): void {
  const career = world.career!;
  const rng = createRng(`${world.seed}:social:${world.date.season}:${world.date.week}`);
  const player = careerPlayer(world);
  const matches = career.matches.filter(
    (m) => m.season === world.date.season && m.week === world.date.week,
  );
  dressingWeek(world, matches.length > 0);
  const moved = rivalTransfer(world, rng);
  const sentiment = mediaWeek(world, rng, matches);
  if (moved) {
    const rival = rivalOf(world)!;
    postMessage(world, 'rival-transfer', {
      rival: rival.name,
      club: moved.club.name,
      fee: moved.fee,
    });
  }
  const social = career.social;
  social.coverage =
    Math.round(
      Math.max(-10, Math.min(10, social.coverage * S.media.coverageDecay + sentiment * 0.5)) * 10,
    ) / 10;
  const parts = moraleParts(world);
  const target = clampPercent(
    S.moraleBase + MORALE_PARTS.reduce((sum, part) => sum + parts[part], 0),
  );
  social.morale = { target, parts };
  player.morale = clampPercent(player.morale + (target - player.morale) * S.moraleStep);
  if (!matches.length && !player.injuryId)
    player.form = clampPercent(player.form + (S.formRest - player.form) * S.formRestStep);
  social.history.push({
    season: world.date.season,
    week: world.date.week,
    morale: player.morale,
    form: player.form,
  });
  if (social.history.length > S.historyLimit)
    social.history.splice(0, social.history.length - S.historyLimit);
}

/** Season change: the rival comparison closes and the dressing room regroups. */
export function socialRollover(world: World): void {
  rivalSeasonEnd(world, world.date.season - 1);
  syncCliques(world);
  ensureTeammates(world);
}

/**
 * The social records a career needs: its rival, the club's cliques and key teammates.
 * Used at career creation and when migrating careers saved before milestone 6.
 */
export function attachSocial(world: World): void {
  const career = world.career!;
  career.social ??= initialSocial();
  if (!world.rivalries.length)
    startRivalry(world, createRng(`${world.seed}:rival:${career.playerId}`));
  syncCliques(world);
  ensureTeammates(world);
}
