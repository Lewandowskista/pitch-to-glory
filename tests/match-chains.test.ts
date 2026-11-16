import { describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { CONFIG } from '../src/engine/config';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { autoPlayCommand, careerMatchSetup } from '../src/engine/career/matches';
import { chainDrought } from '../src/engine/career/matchSetup';
import { careerSelection } from '../src/engine/career/market/rules';
import { nextCareerFixture } from '../src/engine/career/fixtures';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  rolePosition,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import { halftimeChoice } from '../src/engine/match/touchline';
import { outcomeBand } from '../src/engine/match/chains';
import { LEAD_IN_IDS } from '../src/engine/match/chainTable';
import { hasMatchLabel } from '../src/i18n/match';
import { hasCommentaryLabel } from '../src/i18n/commentary';
import { momentCopy } from '../src/i18n/momentsCopy';
import { expectReplays, onEngine } from './support/engines';
import type { Position } from '../src/model/domain';

/**
 * Decision chains (engine match-22, release 1.0 X1a; docs/EXPERIENCE-REDESIGN-1.0.md 1.1 and
 * 1.7): two or three linked decisions in one phase of play, the honest director, one touchline
 * interrupt, one objective, and a new career's first fixtures.
 */
const world = generateWorld('match-chains', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
const K = CONFIG.match.chains;
function setupFor(position: Position, seed: string, index = 0): MatchSetup {
  const [home, away] = index % 2 ? [clubs[1]!, clubs[0]!] : [clubs[0]!, clubs[1]!];
  const club = index % 2 ? clubs[1]! : clubs[0]!;
  const ids = club.playerIds.filter((id) => world.players[id]!.primaryPosition === position);
  return createMatchSetup(world, home.id, away.id, ids[Math.floor(index / 2) % ids.length]!, seed);
}
function play(session: MatchSession): MatchSession {
  let s = session;
  while (s.state.match.status !== 'finished') s = applyMatchCommand(s, autoPlayCommand(s));
  return s;
}
const played = (['ST', 'CM', 'CB', 'GK'] as Position[]).flatMap((position) =>
  Array.from({ length: 25 }, (_, index) => ({
    position,
    session: play(
      createMatchSession(setupFor(position, `chains:${position}:${index}`, index), tactics),
    ),
  })),
);

describe('decision chains (match-22)', () => {
  it('plan four to six chains by position, each two or three steps', () => {
    for (const { session } of played) {
      const chains = session.state.chains!;
      const [low, high] = K.counts[rolePosition(session.setup)]!;
      if (!session.state.substituted && !session.state.sentOff && !session.state.knock)
        expect(chains.length).toBeGreaterThanOrEqual(low);
      expect(chains.length).toBeLessThanOrEqual(high + K.demand);
      for (const chain of chains) {
        expect([2, 3]).toContain(chain.steps);
        expect(chain.results.length).toBeGreaterThanOrEqual(1);
        expect(chain.results.length).toBeLessThanOrEqual(chain.steps);
        // A chain ends early only on a failed step (a set piece's read never ends it).
        if (chain.results.length < chain.steps)
          expect(chain.results[chain.results.length - 1]!.success).toBe(false);
      }
      expect(session.state.decisionChain).toBeUndefined();
    }
  });

  it('offer at most three options a step, each naming its outcome, band and consequence', () => {
    for (const { session } of played)
      for (const moment of session.state.match.keyMoments) {
        if (moment.follows === 'shootout') continue;
        expect(moment.chainId).toBeDefined();
        expect(moment.choices.length).toBeGreaterThanOrEqual(2);
        expect(moment.choices.length).toBeLessThanOrEqual(3);
        expect(moment.chainCast?.you).toBe(session.setup.selectedPlayerId);
        expect(moment.chainCast!.ghosts.length).toBeLessThanOrEqual(4);
        for (const choice of moment.choices) {
          expect(choice.band).toBe(outcomeBand(choice.probability));
          expect(hasMatchLabel(`match.outcome.${choice.outcome}`)).toBe(true);
          expect(hasMatchLabel(`match.chain.failure.${choice.ifFailed}`)).toBe(true);
          expect(hasMatchLabel(choice.labelKey)).toBe(true);
        }
        for (const read of moment.reads ?? [])
          expect(hasMatchLabel(`match.read.${read.id}.${read.state}`)).toBe(true);
        if (LEAD_IN_IDS.has(moment.situationId))
          expect(hasMatchLabel(moment.situationKey)).toBe(true);
      }
  });

  it('band a chance as likely, even or a long shot', () => {
    expect(outcomeBand(0.65)).toBe('likely');
    expect(outcomeBand(0.64)).toBe('even');
    expect(outcomeBand(0.4)).toBe('even');
    expect(outcomeBand(0.39)).toBe('long');
  });

  it('log a start and an end line for every chain, with copy', () => {
    for (const { session } of played) {
      const events = session.state.match.events;
      const starts = events.filter((e) => e.kind === 'chain-start');
      const ends = events.filter((e) => e.kind === 'chain-end');
      expect(starts.length).toBe(session.state.chains!.length);
      expect(ends.map((e) => e.chainOutcome)).toEqual(session.state.chains!.map((c) => c.outcome));
      for (const e of [...starts, ...ends]) expect(hasCommentaryLabel(e.commentaryKey)).toBe(true);
    }
  });

  it('keep stated odds honest at every step', () => {
    let n = 0,
      stated = 0,
      actual = 0;
    for (const { session } of played)
      for (const chain of session.state.chains!)
        for (const result of chain.results) {
          n++;
          stated += result.probability;
          actual += result.success ? 1 : 0;
        }
    expect(n).toBeGreaterThan(600);
    expect(Math.abs(stated - actual) / n).toBeLessThan(0.03);
  });

  it('give the hero beat to a player on the pitch an hour', () => {
    for (const { session } of played) {
      if (session.state.selectedPlayerMinutes < 60) continue;
      expect(session.state.chains!.some((c) => (c.prize ?? 0) >= K.hero.prize - 1e-9)).toBe(true);
    }
  });

  it('place a close game climax late, with three steps', () => {
    let climaxes = 0;
    for (const { session } of played)
      for (const chain of session.state.chains!)
        if (chain.climax) {
          climaxes++;
          expect(chain.steps).toBe(3);
          expect(chain.minute).toBeGreaterThanOrEqual(K.climax.minutes[0]);
        }
    expect(climaxes).toBeGreaterThan(10);
  });

  it('ask at most one touchline interrupt a match', () => {
    for (const { session } of played) expect(session.state.interrupts ?? 0).toBeLessThanOrEqual(1);
  });

  it('set one objective', () => {
    for (const { session } of played) expect(session.state.match.objectives).toHaveLength(1);
  });

  it('offer half-time as two options, the manager’s first', () => {
    let s = createMatchSession(setupFor('ST', 'chains:halftime'), tactics);
    while (s.state.match.status !== 'halftime') s = applyMatchCommand(s, autoPlayCommand(s));
    const choice = halftimeChoice(s);
    expect(choice.default.response).toBe('motivate');
    expect(choice.alternative).toBeDefined();
  });

  it('replay exactly, and leave match-21 sessions without chains', () => {
    for (const { session } of played.slice(0, 8)) expectReplays(session);
    const previous = play(
      createMatchSession(onEngine(setupFor('ST', 'chains:21'), 'match-21'), tactics),
    );
    expect(previous.state.chains).toBeUndefined();
    expect(previous.state.match.keyMoments.some((m) => m.chainId)).toBe(false);
  });

  it('bring a debut’s first chain inside 15 minutes', () => {
    const setup = { ...setupFor('CB', 'chains:debut'), debut: true as const };
    const session = createMatchSession(setup, tactics);
    expect(session.state.momentMinutes[0]).toBeLessThanOrEqual(K.debutBy);
  });

  it('copy every chain key', () => {
    for (const key of Object.keys(momentCopy)) expect(hasMatchLabel(key)).toBe(true);
    expect(hasMatchLabel('match.director.drought')).toBe(true);
  });
});

describe('the career side of the chains', () => {
  const draft: CareerDraft = {
    name: 'Robin Vale',
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
    position: 'ST',
    foot: 'right',
    age: 17,
    archetype: 'finisher',
  };
  const base = generateWorld('match-chains-career');
  const trial = trialOffers(base, 'country:0', 'chains')[0]!;
  const fresh = (): World => createCareer(base, draft, trial.id, 'chains');

  it('start a new career’s first two fixtures, and its first is a debut', () => {
    const world = fresh();
    const fixture = nextCareerFixture(world)!;
    expect(careerSelection(world, fixture).selected).toBe(true);
    expect(careerMatchSetup(world, fixture).debut).toBe(true);
    world.career!.matches.push(structuredClone(world.career!.matches[0] ?? ({} as never)));
    expect(careerSelection(world, fixture).selected).toBe(true);
    expect(careerMatchSetup(world, fixture).debut).toBeUndefined();
  });

  it('tell the pre-match card about a drought after three matches without a positive chain', () => {
    const world = fresh();
    const fixture = nextCareerFixture(world)!;
    expect(chainDrought(world)).toBe(false);
    world.career!.chainDrought = K.droughtMatches;
    expect(chainDrought(world)).toBe(true);
    expect(careerMatchSetup(world, fixture).drought).toBe(true);
  });
});
