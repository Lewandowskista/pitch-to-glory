import { beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { nextCareerFixture } from '../src/engine/career/fixtures';
import {
  autoPlayCommand,
  careerMatchSetup,
  commitCareerMatch,
  defaultTactics,
} from '../src/engine/career/matches';
import { applyMatchCommand, createMatchSession, type MatchSession } from '../src/engine/match';
import { reportRecord, restoreReport } from '../src/screens/match/restoreReport';
import { nationalCareer } from './support/world';

/**
 * Release 1.0 step 4.8: the post-match report survives a refresh. The record kept on the device
 * is the session as setup and commands plus the outcome; it replays to the same report, and
 * only for the world and the latest match it belongs to.
 */
describe('the last match report, kept beside the save', () => {
  let career: World;
  let committed: World;
  let session: MatchSession;
  let outcome: ReturnType<typeof commitCareerMatch>;
  let text: string;
  beforeAll(() => {
    career = nationalCareer();
    const setup = careerMatchSetup(career, nextCareerFixture(career)!);
    session = createMatchSession(setup, defaultTactics(career, setup));
    while (session.state.match.status !== 'finished')
      session = applyMatchCommand(session, autoPlayCommand(session));
    committed = JSON.parse(JSON.stringify(career)) as World;
    outcome = commitCareerMatch(committed, session);
    text = JSON.stringify(reportRecord({ careerResult: { session, outcome }, world: committed }));
  }, 120000);

  it('is small: the session as setup and commands, without its state', () => {
    const record = JSON.parse(text) as { session: Record<string, unknown> };
    expect(record.session.state).toBeUndefined();
    expect(text.length).toBeLessThan(JSON.stringify(session).length / 2);
  });

  it('replays to the same report after a refresh', () => {
    const restored = restoreReport(text, committed);
    expect(restored).not.toBeNull();
    expect(restored!.outcome).toEqual(outcome);
    expect(restored!.session.state.match.score).toEqual(session.state.match.score);
    expect(JSON.stringify(restored!.session.state.report)).toBe(
      JSON.stringify(session.state.report),
    );
  });

  it('is not shown for another world, another career or a later match', () => {
    expect(restoreReport(text, { ...committed, seed: 'another' })).toBeNull();
    expect(
      restoreReport(text, {
        ...committed,
        career: { ...committed.career!, playerId: 'someone-else' },
      }),
    ).toBeNull();
    // The world before the match was recorded: the report is not its latest match.
    expect(restoreReport(text, career)).toBeNull();
    const later = {
      ...committed,
      career: {
        ...committed.career!,
        matches: [...committed.career!.matches, { ...committed.career!.matches.at(-1)!, week: 99 }],
      },
    };
    expect(restoreReport(text, later)).toBeNull();
  });

  it('replays a record from the previous engine (match-21) on its own rules', () => {
    const record = JSON.parse(text) as {
      session: { engine: string; setup: { rules22?: true } };
    };
    expect(record.session.engine).toBe('match-22');
    const previous = structuredClone(record);
    previous.session.engine = 'match-21';
    delete previous.session.setup.rules22;
    const restored = restoreReport(JSON.stringify(previous), committed);
    expect(restored).not.toBeNull();
    expect(restored!.session.engine).toBe('match-21');
    // An engine that is not its setup's is a damaged record.
    const mismatched = structuredClone(record);
    mismatched.session.engine = 'match-21';
    expect(restoreReport(JSON.stringify(mismatched), committed)).toBeNull();
  });

  it('ignores a damaged or outdated record', () => {
    expect(restoreReport(null, committed)).toBeNull();
    expect(restoreReport('{', committed)).toBeNull();
    const record = JSON.parse(text) as { session: { engine: string; commands: unknown[] } };
    expect(
      restoreReport(
        JSON.stringify({ ...record, session: { ...record.session, engine: 'match-20' } }),
        committed,
      ),
    ).toBeNull();
    expect(
      restoreReport(
        JSON.stringify({ ...record, session: { ...record.session, commands: [] } }),
        committed,
      ),
    ).toBeNull();
  });
});
