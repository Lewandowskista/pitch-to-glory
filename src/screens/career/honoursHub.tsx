import { Link, useNavigate } from 'react-router-dom';
import type { World } from '../../model/domain';
import { CONFIG } from '../../engine/config';
import { retirementAge, retirementState } from '../../engine/career/honours/retirement';
import { Dialog } from '../../ui/Dialog';
import { format } from '../../i18n';
import { honoursText as h } from '../../i18n/honours';
import { plural, ui } from './shared';
import { useHonoursAction } from './honoursUi';
import { useUrlDialog } from './useUrlDialog';

const R = CONFIG.career.honours.retirement;

/** Hub card: caps, honours and, late in a career, the choice to retire. */
export function HonoursSummary({ world }: { world: World }) {
  const career = world.career!;
  const navigate = useNavigate();
  const dialog = useUrlDialog('retire');
  const { run, error, block } = useHonoursAction();
  const caps = Object.values(career.honours.caps).reduce((sum, value) => sum + value, 0);
  const goals = Object.values(career.honours.internationalGoals).reduce(
    (sum, value) => sum + value,
    0,
  );
  const trophies = world.trophies.filter((trophy) =>
    trophy.playerIds.includes(career.playerId),
  ).length;
  const awards = world.awards.filter((award) => award.winnerIds.includes(career.playerId)).length;
  const state = retirementState(world);
  const age = retirementAge(world);
  const canRetire = state === 'available' || (state === 'forced' && world.phase === 'complete');
  const message =
    state === 'young'
      ? format(h.retirement.young, { age: R.optionalAge })
      : state === 'season'
        ? h.retirement.season
        : state === 'forced'
          ? format(h.retirement.forced, { age })
          : format(h.retirement.available, { age: R.forcedAge });
  return (
    <section
      aria-labelledby="honours-summary-heading"
      className={`${ui.panel} flex flex-col gap-4 lg:col-span-6`}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gold font-display text-3xl text-[#1d3127]"
        >
          ★
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <h2 id="honours-summary-heading" className={ui.heading}>
            {h.hub.honours}
          </h2>
          <p className="text-sm text-muted">
            {plural(trophies, h.legacy.trophy, h.legacy.trophies)} ·{' '}
            {plural(awards, h.legacy.award, h.legacy.awards)}
          </p>
          <p className="text-sm">
            {plural(caps, h.hub.cap, h.hub.caps)} · {plural(goals, h.hub.goal, h.hub.goals)}
          </p>
        </div>
        <Link className="button secondary" to="/career/trophies">
          {h.hub.open}
        </Link>
      </div>
      {state !== 'young' && (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-control border p-4 ${
            state === 'forced' ? 'border-gold bg-art-gold' : 'border-line bg-surface-soft'
          }`}
        >
          <div className="min-w-0 flex-1 basis-48">
            <strong className="block text-sm">{h.retirement.title}</strong>
            <p className="text-sm text-muted">{message}</p>
          </div>
          {canRetire && (
            <button
              className="button secondary"
              disabled={Boolean(block)}
              title={block ?? undefined}
              onClick={() => dialog.open()}
            >
              {h.retirement.retire}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {dialog.value && canRetire && (
        <Dialog
          title={h.retirement.confirmTitle}
          body={h.retirement.confirmBody}
          confirmLabel={h.retirement.confirm}
          danger
          onClose={dialog.close}
          onConfirm={() => {
            if (run({ type: 'retire' })) navigate('/career/legacy', { replace: true });
            else dialog.close();
          }}
        />
      )}
    </section>
  );
}
