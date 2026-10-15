import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { autoPlayCommand } from '../src/engine/career/matches';
import { CONFIG } from '../src/engine/config';
import {
  applyMatchCommand,
  buildChoices,
  createMatchSession,
  createMatchSetup,
  SITUATION_BY_ID,
  type MatchSession,
} from '../src/engine/match';
import {
  INTENSITIES,
  intensityFor,
  pitchEffect,
  pitchStateFor,
  weatherEffect,
} from '../src/engine/match/conditions';
import { hasMatchLabel } from '../src/i18n/match';
import type { Match } from '../src/model/domain';

/**
 * Weather intensity and the pitch's state as separate odds factors (engine match-15, M8).
 */
const world = generateWorld('match-conditions', { format: 'legacy' });
const clubs = Object.values(world.clubs).slice(0, 2);
const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
const striker = clubs[0]!.playerIds.find((id) => world.players[id]!.primaryPosition === 'ST')!;
const session = (seed: string) =>
  createMatchSession(createMatchSetup(world, clubs[0]!.id, clubs[1]!.id, striker, seed), tactics);
const WEATHERS: Match['weather'][] = ['clear', 'rain', 'snow', 'wind'];

describe('weather intensity and pitch state (match-15)', () => {
  it('draws an intensity for every match and derives the pitch state from it', () => {
    const counts = { light: 0, steady: 0, heavy: 0 };
    for (let i = 0; i < 600; i++) {
      const match = session(`conditions-${i}`).state.match;
      const intensity = match.weatherIntensity!;
      counts[intensity]++;
      expect(match.pitchState).toBe(pitchStateFor(match.weather, match.pitchCondition, intensity));
    }
    // 30 / 40 / 30 %.
    expect(counts.light / 600).toBeGreaterThan(0.24);
    expect(counts.steady / 600).toBeGreaterThan(0.33);
    expect(counts.heavy / 600).toBeGreaterThan(0.24);
  });
  it('keeps no intensity on earlier engines', () => {
    const setup = createMatchSetup(world, clubs[0]!.id, clubs[1]!.id, striker, 'conditions-old');
    delete setup.occasions;
    const match = createMatchSession(setup, tactics).state.match;
    expect(match.weatherIntensity).toBeUndefined();
    expect(match.pitchState).toBeUndefined();
  });
  it('derives the pitch without a draw: snow freezes, rain soaks, a poor surface is heavy', () => {
    expect(pitchStateFor('snow', 95, 'steady')).toBe('frozen');
    expect(pitchStateFor('snow', 95, 'light')).toBe('heavy');
    expect(pitchStateFor('rain', 95, 'light')).toBe('good');
    expect(pitchStateFor('rain', 95, 'heavy')).toBe('heavy');
    expect(pitchStateFor('rain', 50, 'light')).toBe('heavy');
    expect(pitchStateFor('clear', 40, 'heavy')).toBe('heavy');
    expect(pitchStateFor('clear', 90, 'heavy')).toBe('firm');
    expect(pitchStateFor('wind', 90, 'light')).toBe('good');
    expect(intensityFor(0)).toBe('light');
    expect(intensityFor(0.5)).toBe('steady');
    expect(intensityFor(0.99)).toBe('heavy');
  });
  it('keeps the average weather where the combined factor had it', () => {
    const K = CONFIG.match.conditions;
    const mean = INTENSITIES.reduce(
      (sum, intensity) => sum + K.intensityWeights[intensity] * K.intensity[intensity],
      0,
    );
    expect(mean).toBeCloseTo(1, 10);
    for (const weather of WEATHERS) {
      // Long balls and crosses: the weather alone, as before on average.
      const direct = INTENSITIES.reduce(
        (sum, i) => sum + K.intensityWeights[i] * weatherEffect('direct', weather, i),
        0,
      );
      expect(direct).toBeCloseTo(K.direct[weather], 10);
      // Close control on a good surface: weather and pitch together, within a point of before.
      const technical = INTENSITIES.reduce((sum, i) => {
        const state = pitchStateFor(weather, 90, i);
        return (
          sum +
          K.intensityWeights[i] *
            (weatherEffect('technical', weather, i) + pitchEffect('technical', weather, state, 90))
        );
      }, 0);
      expect(Math.abs(technical - K.technical[weather])).toBeLessThan(0.011);
    }
    // A poor surface costs what it did, whatever the sky.
    expect(pitchEffect('technical', 'clear', 'heavy', 50)).toBeCloseTo(-20 * K.pitchSlope, 10);
    expect(pitchEffect('direct', 'rain', 'heavy', 50)).toBe(0);
  });
  it('shows the weather and the pitch as separate, named factors that sum to the chance', () => {
    let heavy = 0;
    for (let i = 0; i < 40; i++) {
      let s: MatchSession = applyMatchCommand(session(`factors-${i}`), { type: 'kickoff' });
      while (s.state.match.status !== 'finished') {
        const moment = s.state.currentMoment;
        if (moment) {
          const intensity = s.state.match.weatherIntensity!;
          for (const choice of moment.choices) {
            const labels = choice.factors.map((f) => f.labelKey);
            expect(labels).toContain(`match.factor.weather.${intensity}.${s.state.match.weather}`);
            expect(labels).toContain(`match.factor.pitch.${s.state.match.pitchState}`);
            expect(labels).not.toContain('match.factor.conditions');
            for (const label of labels) expect(hasMatchLabel(label), label).toBe(true);
            expect(choice.factors.reduce((n, f) => n + f.contribution, 0)).toBeCloseTo(
              choice.probability,
              10,
            );
            const template = SITUATION_BY_ID[moment.situationId]!.choices.find(
              (c) => c.id === choice.id,
            )!;
            const pitch = choice.factors.find((f) => f.labelKey.startsWith('match.factor.pitch.'))!;
            if (template.conditions !== 'technical') expect(pitch.contribution).toBe(0);
            if (
              template.conditions === 'technical' &&
              s.state.match.pitchState === 'heavy' &&
              s.state.match.weather === 'rain'
            ) {
              heavy++;
              expect(pitch.contribution).toBeLessThan(0);
            }
          }
        }
        s = applyMatchCommand(s, autoPlayCommand(s));
      }
    }
    expect(heavy).toBeGreaterThan(0);
  });
  it('cites a heavy pitch as about −5% on a close-control choice', () => {
    const base = session('reason');
    const moment = { situation: SITUATION_BY_ID['box-chance']! };
    const context = {
      player: base.setup.players[striker]!,
      situation: moment.situation,
      budget: { for: 0.1, against: 0 },
      matchLevel: 60,
      importance: 1,
      fatigue: 0,
      tactics,
      weather: 'rain' as const,
      weatherIntensity: 'steady' as const,
      pitchCondition: 90,
      strengthGap: 0,
      opponents: { keeper: 60, defender: 60, attacker: 60 },
      momentum: 50,
      talkOdds: 1,
      teammateFinishing: 60,
      consistencyShift: 0,
      chemistry: 60,
      latest: true,
    };
    const takeOn = buildChoices(context).find((c) => c.id === 'take-on')!;
    const pitch = takeOn.factors.find((f) => f.labelKey === 'match.factor.pitch.heavy')!;
    // The −5% odds multiplier moves a probability near one half by about a point.
    expect(pitch.contribution).toBeLessThan(-0.005);
    expect(pitch.contribution).toBeGreaterThan(-0.03);
  });
});
