import { Link } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Icon } from '../../ui/Icon';
import { fixtureKind, nextCareerFixture, pendingCareerFixture } from '../../engine/career/fixtures';
import type { CareerMatchOutcome } from '../../engine/career/matches';
import type { Fixture, World } from '../../model/domain';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { CrestImage, JobProgress } from '../career/shared';
import { competitionName } from '../career/selectors';
import { continueToMatchday } from '../career/actions';

function FixtureTeams({ world, fixture }: { world: World; fixture: Fixture }) {
  const clubId = world.players[world.career!.playerId]!.clubId;
  const home = world.clubs[fixture.homeId]!;
  const away = world.clubs[fixture.awayId]!;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
      {[home, away].map((club, index) => (
        <div
          key={club.id}
          className={`flex min-w-0 flex-col items-center gap-2 text-center ${
            index === 0 ? 'col-start-1' : 'col-start-3'
          } row-start-1`}
        >
          <CrestImage crest={club.crest} alt={club.name} className="h-16 w-16 sm:h-24 sm:w-24" />
          <strong className="font-display text-xl leading-tight break-words sm:text-3xl">
            {club.name}
          </strong>
          {club.id === clubId && (
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-accent">
              {c.hub.club}
            </span>
          )}
        </div>
      ))}
      <span className="col-start-2 row-start-1 font-display text-3xl text-muted">
        {c.common.vs}
      </span>
    </div>
  );
}

/** The pending career fixture, before the pre-match briefing opens. */
export function CareerFixture({
  world,
  fixture,
  disabled,
  onPrepare,
}: {
  world: World;
  fixture: Fixture;
  disabled: boolean;
  onPrepare: () => void;
}) {
  const kind = fixtureKind(world, fixture);
  const clubId = world.players[world.career!.playerId]!.clubId;
  return (
    <section
      aria-labelledby="career-fixture-heading"
      className="match-panel flex flex-col gap-5"
      data-testid="career-fixture"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="match-eyebrow">{c.report.fixture}</span>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
          {c.hub.importance[kind]}
        </span>
      </div>
      <h2 id="career-fixture-heading" className="sr-only">
        {c.report.fixture}
      </h2>
      <FixtureTeams world={world} fixture={fixture} />
      <p className="text-center text-sm text-muted">
        {format(c.hub.fixtureDate, {
          week: fixture.date.week,
          competition: competitionName(world, fixture.competitionId),
        })}{' '}
        ·{' '}
        {fixture.neutral
          ? c.common.neutral
          : fixture.homeId === clubId
            ? c.common.home
            : c.common.away}
      </p>
      <p className="text-center text-sm">{c.report.previewNote}</p>
      <div className="flex justify-center">
        <button className="button min-w-60" disabled={disabled} onClick={onPrepare}>
          {c.report.prepare}
          <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
}

/** No career fixture can be played this week. */
export function CareerNoMatch({ world }: { world: World }) {
  const job = useAppStore((s) => s.worldJob);
  const career = world.career!;
  const injured = Boolean(career.injury);
  const next = nextCareerFixture(world);
  const last = career.matches.at(-1);
  const opponent = last ? world.clubs[last.opponentId] : undefined;
  return (
    <section className="match-panel flex flex-col gap-4" aria-labelledby="no-match-heading">
      <h2 id="no-match-heading">{injured ? c.report.injuredNoMatch : c.report.noMatch}</h2>
      <p className="muted">
        {world.phase === 'complete' ? c.hub.seasonCompleteBody : c.report.noMatchBody}
      </p>
      {next && world.phase !== 'complete' && (
        <p className="text-sm">
          <strong>{c.report.nextFixture}: </strong>
          {world.clubs[next.homeId]?.name} {c.common.vs} {world.clubs[next.awayId]?.name} ·{' '}
          {format(c.common.week, { week: next.date.week })}
        </p>
      )}
      {last && opponent && (
        <p className="flex items-center gap-2 text-sm">
          <CrestImage crest={opponent.crest} alt="" className="h-7 w-7" />
          <span>
            <strong>{c.report.lastRecorded}: </strong>
            {opponent.name} {last.score[0]}–{last.score[1]} · +{last.xp} XP
          </span>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {world.phase !== 'complete' && (
          <button
            className="button"
            disabled={Boolean(job) || Boolean(career.injury && career.injury.recovery === null)}
            onClick={continueToMatchday}
          >
            {c.report.continue}
            <Icon name="arrow" />
          </button>
        )}
        <Link className="button secondary" to="/career">
          {c.report.hub}
        </Link>
      </div>
      {career.injury && career.injury.recovery === null && (
        <p className="text-sm font-semibold">{c.hub.injuredBlock}</p>
      )}
      <JobProgress />
    </section>
  );
}

/** Actions after a recorded career match: no replay, only the way forward. */
export function CareerReportActions({
  world,
  outcome,
}: {
  world: World;
  outcome: CareerMatchOutcome;
}) {
  const job = useAppStore((s) => s.worldJob);
  const pending = pendingCareerFixture(world);
  const gained = outcome.levelsGained > 0 || world.career!.attributePoints > 0;
  return (
    <>
      {pending ? (
        <button
          className="button"
          disabled={Boolean(job)}
          onClick={() => useAppStore.getState().setCareerResult(null)}
        >
          {c.report.nextFixture}
          <Icon name="arrow" />
        </button>
      ) : world.phase !== 'complete' ? (
        <button
          className="button"
          disabled={Boolean(job) || Boolean(world.career!.injury && !world.career!.injury.recovery)}
          onClick={continueToMatchday}
        >
          {c.report.continue}
          <Icon name="arrow" />
        </button>
      ) : null}
      <Link className="button secondary" to="/career">
        {c.report.hub}
      </Link>
      {gained && (
        <Link className="button secondary" to="/career/profile">
          {c.report.allocate}
        </Link>
      )}
      {world.career!.skillPoints > 0 && (
        <Link className="button secondary" to="/career/skills">
          {c.report.unlock}
        </Link>
      )}
      <div className="basis-full">
        <JobProgress />
      </div>
    </>
  );
}
