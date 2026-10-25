import { CONFIG } from '../engine/config';
import { MATCH_ENGINE_VERSION } from '../engine/match/types';
import { format } from '../i18n/locale';
import { diagnosticsText as d } from '../i18n/diagnostics';
import type { AppSave } from '../persistence/schema';
import type { World } from '../model/domain';
import { APP_VERSION } from '../release/version';
import type { DiagnosticEntry } from '.';
import { browserEngine, deviceContext, installed, type DeviceContext } from './device';

/**
 * What a player attaches to a bug report (release 1.0 step 4.7): versions, a coarse device, the
 * loaded save's seed and revision (the player chooses to export them; with the seed a bug can be
 * replayed) and the diagnostics log. No names, no save contents, no address of any kind.
 */
export interface DiagnosticsReport {
  format: 'pitch-to-glory-diagnostics';
  version: 1;
  createdAt: string;
  app: { version: string; schema: number; engine: string };
  device: {
    class: DeviceContext['device_class'];
    input: DeviceContext['input'];
    viewport: DeviceContext['viewport'];
    browser: ReturnType<typeof browserEngine>;
    installed: boolean;
  };
  save: {
    slot: number;
    revision: number;
    schema: number;
    engine: string;
    seed: string;
    world: {
      format: 'legacy' | 'national-v1';
      identity: number | null;
      season: number;
      week: number;
      career: boolean;
    };
  } | null;
  entries: DiagnosticEntry[];
}
export interface ReportContext {
  activeSave: AppSave | null;
  world: World | null;
  device: DeviceContext;
  userAgent: string;
  installed: boolean;
  now: Date;
}
export function diagnosticsReport(
  entries: readonly DiagnosticEntry[],
  context: ReportContext,
): DiagnosticsReport {
  const { activeSave, world, device } = context;
  return {
    format: 'pitch-to-glory-diagnostics',
    version: 1,
    createdAt: context.now.toISOString(),
    app: { version: APP_VERSION, schema: CONFIG.saves.schemaVersion, engine: MATCH_ENGINE_VERSION },
    device: {
      class: device.device_class,
      input: device.input,
      viewport: device.viewport,
      browser: browserEngine(context.userAgent),
      installed: context.installed,
    },
    save:
      activeSave && world && activeSave.payload.kind === 'world'
        ? {
            slot: activeSave.slot,
            revision: activeSave.revision,
            schema: activeSave.schemaVersion,
            engine: activeSave.engineVersion,
            seed: world.seed,
            world: {
              format: world.format ?? 'legacy',
              identity: world.identityVersion ?? null,
              season: world.date.season,
              week: world.date.week,
              career: Boolean(world.career),
            },
          }
        : null,
    entries: [...entries],
  };
}
/** This browser's context for a report. */
export const currentContext = (
  state: Pick<ReportContext, 'activeSave' | 'world'>,
): ReportContext => ({
  ...state,
  device: deviceContext(),
  userAgent: navigator.userAgent,
  installed: installed(),
  now: new Date(),
});
export const diagnosticsFileName = (now: Date): string =>
  `pitch-to-glory-diagnostics-${now.toISOString().slice(0, 10)}.json`;

/** Where bug reports go: a new issue on the game's repository. */
export const ISSUES_URL = 'https://github.com/Lewandowskista/pitch-to-glory/issues/new';
/**
 * A prefilled GitHub issue: a title to finish, the questions to answer, and the version, schema,
 * engine and coarse device, with a prompt to attach the diagnostics file. Nothing else: no seed,
 * no log (those are in the file, which the player chooses to attach).
 */
export function bugReportUrl(context: Pick<ReportContext, 'device' | 'userAgent' | 'installed'>) {
  const body = format(d.issue.body, {
    version: APP_VERSION,
    schema: CONFIG.saves.schemaVersion,
    engine: MATCH_ENGINE_VERSION,
    device: `${context.device.device_class} · ${context.device.input} · ${context.device.viewport}`,
    browser: browserEngine(context.userAgent),
    installed: context.installed ? 'yes' : 'no',
  });
  const query = new URLSearchParams({ title: d.issue.title, body, labels: 'bug' });
  return `${ISSUES_URL}?${query.toString()}`;
}
