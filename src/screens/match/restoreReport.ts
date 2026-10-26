import { useEffect, useRef } from 'react';
import { applyMatchCommand, createMatchSession } from '../../engine/match';
import { setupEngine, type MatchSession } from '../../engine/match/types';
import type { CareerMatchOutcome } from '../../engine/career/matches';
import type { SlotId, World } from '../../model/domain';
import { compactSession, type StoredMatchSession } from '../../persistence/matchRecord';
import { platform, type DeviceRecord } from '../../platform';
import { reportFor, useAppStore, type AppStore } from '../../store';

/**
 * The last career match report of each save slot, kept on this device beside the saves (release
 * 1.0 step 4.8): the finished session as setup and commands, which replay to the full match, and
 * the outcome the commit returned. Not part of the save; the match screen restores it after a
 * refresh, and only while it is still the career's latest match.
 */
export interface ReportRecord {
  version: 1;
  seed: string;
  playerId: string;
  session: StoredMatchSession;
  outcome: CareerMatchOutcome;
}
const reportKey = (slot: SlotId): DeviceRecord => `match-report-${slot}`;
type CareerResult = { session: MatchSession; outcome: CareerMatchOutcome };

/** The record to keep for a report shown in `state`. */
export function reportRecord(state: Pick<AppStore, 'careerResult' | 'world'>): ReportRecord | null {
  const result = state.careerResult;
  const career = state.world?.career;
  if (!result || !career) return null;
  return {
    version: 1,
    seed: state.world!.seed,
    playerId: career.playerId,
    session: compactSession(result.session),
    outcome: result.outcome,
  };
}

/**
 * A slot's last match report from its device record, replayed to the full session: only for
 * this world and career, on the engine its setup plays on (the current or the previous one),
 * finished, and still the career's latest match.
 * Anything else is null (a stale or damaged record is simply not shown).
 */
export function restoreReport(text: string | null, world: World): CareerResult | null {
  if (!text || !world.career) return null;
  try {
    const record = JSON.parse(text) as Partial<ReportRecord>;
    const stored = record.session;
    if (
      record.version !== 1 ||
      record.seed !== world.seed ||
      record.playerId !== world.career.playerId ||
      !stored ||
      !stored.setup ||
      !setupEngine(stored.setup) ||
      stored.engine !== setupEngine(stored.setup) ||
      !Array.isArray(stored.commands) ||
      !record.outcome?.record
    )
      return null;
    let session = createMatchSession(stored.setup, stored.initialTactics);
    for (const command of stored.commands) session = applyMatchCommand(session, command);
    if (session.state.match.status !== 'finished') return null;
    return reportFor({ session, outcome: record.outcome }, world);
  } catch {
    return null;
  }
}

/**
 * Keep each slot's record in step with the report in memory, from the first time the match
 * screen loads (only it records career matches): written when a report appears, removed when
 * the player moves on from it in the same slot. Loading another slot leaves the first slot's
 * record for when it is loaded again.
 */
let watching = false;
function watchReports(): void {
  if (watching) return;
  watching = true;
  useAppStore.subscribe((state, previous) => {
    if (state.careerResult === previous.careerResult) return;
    const slot = state.activeSave?.payload.kind === 'world' ? state.activeSave.slot : null;
    if (!slot) return;
    if (state.careerResult) {
      const record = reportRecord(state);
      if (record) platform.writeRecord(reportKey(slot), JSON.stringify(record));
    } else if (previous.activeSave?.slot === slot) platform.writeRecord(reportKey(slot), null);
  });
}

/**
 * After a refresh, bring back the report of the match just recorded in this slot, as it was
 * before the refresh. Tried once for each state of the career.
 */
export function useRestoredReport(world: World | null, slot: SlotId | null, idle: boolean): void {
  const tried = useRef('');
  useEffect(watchReports, []);
  useEffect(() => {
    if (!idle || !slot || !world?.career) return;
    const key = `${slot}:${world.seed}:${world.date.season}:${world.date.week}:${world.career.matches.length}`;
    if (tried.current === key) return;
    tried.current = key;
    const restored = restoreReport(platform.readRecord(reportKey(slot)), world);
    if (restored) useAppStore.getState().setCareerResult(restored);
  }, [world, slot, idle]);
}
