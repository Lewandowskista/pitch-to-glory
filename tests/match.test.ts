import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import type { MatchSession } from '../src/engine/match/types';
const path = '../src/engine/match/index';
async function engine() {
  const module = await import(path).catch(() => null);
  expect(module, 'headless match engine exists').not.toBeNull();
  return module as typeof import('../src/engine/match/index');
}
const world = generateWorld('match-tests', { format: 'legacy' });
const clubs = Object.values(world.clubs);
async function setup(position = 'ST') {
  const api = await engine();
  const home = clubs[0]!;
  const selected = home.playerIds.find((id) => world.players[id]!.primaryPosition === position)!;
  return {
    api,
    value: api.createMatchSetup(world, home.id, clubs[1]!.id, selected, 'replay-seed'),
  };
}
function finish(session: MatchSession, api: Awaited<ReturnType<typeof engine>>) {
  let value = api.applyMatchCommand(session, { type: 'kickoff' });
  while (value.state.match.status !== 'finished') {
    const state = value.state;
    value = api.applyMatchCommand(
      value,
      state.currentMoment
        ? { type: 'choose', choiceId: state.currentMoment.choices[0]!.id }
        : state.match.status === 'halftime'
          ? { type: 'halftime', response: 'motivate' }
          : { type: 'advance' },
    );
  }
  return value;
}
describe('deterministic personal match', () => {
  it('replays a complete match without mutating its preview and conserves goals', async () => {
    const { api, value } = await setup();
    const preview = api.createMatchSession(value, {
      role: 'balanced',
      risk: 'balanced',
      mentality: 'balanced',
    });
    const final = finish(preview, api);
    expect(preview.state.match.minute).toBe(0);
    expect(final.state.match.minute).toBe(90);
    expect(final.state.match.keyMoments.length).toBeGreaterThanOrEqual(6);
    expect(api.validateMatchSession(JSON.parse(JSON.stringify(final)))).toEqual(final);
    expect(final.state.match.events.filter((e) => e.kind === 'goal').length).toBe(
      final.state.match.score[0] + final.state.match.score[1],
    );
    expect(final.state.report?.heatmap.length).toBeGreaterThan(60);
    const forged = JSON.parse(JSON.stringify(final));
    forged.state.match.score[0]++;
    expect(() => api.validateMatchSession(forged)).toThrow();
  });
  it('gives keepers defensive decisions and produces transparent outcomes', async () => {
    const { api, value } = await setup('GK');
    const final = finish(
      api.createMatchSession(value, { role: 'sweeper', risk: 'balanced', mentality: 'balanced' }),
      api,
    );
    expect(final.state.match.keyMoments[0]!.choices[0]!.id).toBe('hold');
    for (const event of final.state.match.events.filter((e) => e.outcome)) {
      expect(event.outcome!.factors.map((f) => f.source)).toEqual(
        expect.arrayContaining(['attribute', 'trait', 'defender', 'fatigue']),
      );
      expect(event.outcome!.success).toBe(event.outcome!.roll < event.outcome!.probability);
    }
  });
});
