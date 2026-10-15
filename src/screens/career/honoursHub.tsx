import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { World } from '../../model/domain';
import { CONFIG } from '../../engine/config';
import {
  canAnnounceFarewell,
  liveHallOfFameRank,
  retirementAge,
  retirementState,
} from '../../engine/career/honours/retirement';
import { Dialog } from '../../ui/Dialog';
import { format } from '../../i18n';
import { honoursText as h } from '../../i18n/honours';
import { careerText as c } from '../../i18n/career';
import { Button, ButtonLink, CardTitle, Panel, cx } from '../../ui/kit';
import { plural } from './shared';
import { Glyph, useHonoursAction } from './honoursUi';
import { useUrlDialog } from './useUrlDialog';
import { withSave } from './agenda';

const R = CONFIG.career.honours.retirement;
const integer = new Intl.NumberFormat('en');

/**
 * "Hall of Fame #4 of 3,812": where the career stands right now, scored as retirement will
 * score it. Nothing until the career has a score (a tie at nothing is not a rank).
 */
export function HallOfFameRankLine({ world, className }: { world: World; className?: string }) {
  // The table reads every player the world remembers; it is memoised per world state.
  const standing = useMemo(() => liveHallOfFameRank(world), [world]);
  if (standing.score <= 0) return null;
  return (
    <p className={className} data-testid="hall-of-fame-rank">
      {format(h.hallOfFameLive.line, {
        rank: standing.rank,
        of: integer.format(standing.of),
      })}
    </p>
  );
}

/** Hub card: caps, honours and, late in a career, the choice to retire. */
export function HonoursSummary({
  world,
  className = '',
}: {
  world: World;
  /** Placement in the surrounding grid. */
  className?: string;
}) {
  const career = world.career!;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const dialog = useUrlDialog('retire');
  const farewellDialog = useUrlDialog('farewell');
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
  const farewell = canAnnounceFarewell(world);
  const announced = career.farewell?.season === world.date.season;
  const message = announced
    ? h.retirement.farewellActive
    : state === 'young' && farewell
      ? h.retirement.farewellBody
      : state === 'young'
        ? format(h.retirement.young, { age: R.optionalAge })
        : state === 'season'
          ? h.retirement.season
          : state === 'forced'
            ? format(h.retirement.forced, { age })
            : format(h.retirement.available, { age: R.forcedAge });
  // The final season: the choice is coming, but only once the season is complete.
  const locked = state === 'forced' && !canRetire;
  return (
    <Panel
      aria-labelledby="honours-summary-heading"
      className={cx('flex flex-col gap-4', className)}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gold text-on-gold"
        >
          <Glyph name="star" className="h-7 w-7 fill-current" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <CardTitle id="honours-summary-heading">{h.hub.honours}</CardTitle>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            {plural(trophies, h.legacy.trophy, h.legacy.trophies)} ·{' '}
            {plural(awards, h.legacy.award, h.legacy.awards)}
          </p>
          <p className="text-[0.8125rem]">
            {plural(caps, h.hub.cap, h.hub.caps)} · {plural(goals, h.hub.goal, h.hub.goals)}
          </p>
          <HallOfFameRankLine world={world} className="text-[0.8125rem] font-bold" />
        </div>
        <ButtonLink variant="secondary" to={withSave('/career/trophies', params.get('save'))}>
          {h.hub.open}
        </ButtonLink>
      </div>
      {(state !== 'young' || farewell || announced) && (
        <div
          className={cx(
            'flex flex-wrap items-center gap-3 rounded-control border p-4',
            state === 'forced' ? 'border-gold bg-art-gold' : 'border-line bg-surface-soft',
          )}
        >
          <div className="min-w-0 flex-1 basis-56">
            <strong className="block text-sm">
              {state === 'forced'
                ? format(c.hub.retirement.finalSeason, { title: h.retirement.title })
                : h.retirement.title}
            </strong>
            <p
              className={cx(
                'mt-0.5 text-[0.8125rem]',
                state === 'forced' ? 'text-gold-ink' : 'text-muted',
              )}
            >
              {message}
            </p>
          </div>
          {farewell && (
            <Button
              variant="secondary"
              disabled={Boolean(block)}
              title={block ?? undefined}
              onClick={() => farewellDialog.open()}
            >
              {h.retirement.farewell}
            </Button>
          )}
          {canRetire && (
            <Button
              variant="secondary"
              disabled={Boolean(block)}
              title={block ?? undefined}
              onClick={() => dialog.open()}
            >
              {h.retirement.retire}
            </Button>
          )}
          {locked && (
            <span className="text-xs font-bold text-gold-ink">{c.hub.retirement.locked}</span>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {farewellDialog.value && farewell && (
        <Dialog
          title={h.retirement.farewellConfirmTitle}
          body={h.retirement.farewellConfirmBody}
          confirmLabel={h.retirement.farewellConfirm}
          onClose={farewellDialog.close}
          onConfirm={() => {
            run({ type: 'farewell' });
            farewellDialog.close();
          }}
        />
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
    </Panel>
  );
}
