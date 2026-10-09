import { Link } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Icon } from '../../ui/Icon';
import { HeadToHead } from '../../ui/HeadToHead';
import { fixtureKind, nextCareerFixture, pendingCareerFixture } from '../../engine/career/fixtures';
import { StakeLine } from '../career/stakesUi';
import type { CareerMatchOutcome } from '../../engine/career/matches';
import type { Fixture, World } from '../../model/domain';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { CrestImage, JobProgress } from '../career/shared';
import { competitionName, leaguePosition, recentForm } from '../career/selectors';
import { matchFormat, matchText as m } from '../../i18n/match';
import { continueToMatchday } from '../career/actions';

const FORM_TONE = {
  win: 'bg-gold text-on-gold',
  draw: 'bg-white/20 text-white',
  loss: 'bg-danger-soft text-danger',
} as const;

/** Table place, and for your club the recent form, under each crest. */
function SideDetail({
  world,
  clubId,
  own,
  home,
}: {
  world: World;
  clubId: string;
  own: boolean;
  /** Wide screens align each side's details towards the centre, like the names. */
  home: boolean;
}) {
  const table = leaguePosition(world, clubId);
  const form = own ? recentForm(world.career!) : [];
  if (!table && !form.length) return null;
  return (
    <div className="grid gap-2">
      {table && (
        <span className="text-sm text-white/85">
          {matchFormat(m.fixtureTable, {
            rank: table.rank,
            total: table.total,
            points: table.points,
          })}
        </span>
      )}
      {form.length > 0 && (
        <span
          className={`inline-flex gap-1.5 justify-self-center ${home ? 'sm:justify-self-end' : 'sm:justify-self-start'}`}
          role="img"
          aria-label={format(c.hub.formLabel, {
            count: form.length,
            results: form.map((record) => c.hub.resultNames[record.result]).join(', '),
          })}
        >
          {form.map((record) => (
            <span
              key={record.fixtureId}
              className={`grid h-7 w-7 place-items-center rounded-full font-display text-base leading-none ${FORM_TONE[record.result]}`}
            >
              {c.hub.results[record.result]}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function FixtureTeams({ world, fixture }: { world: World; fixture: Fixture }) {
  const clubId = world.players[world.career!.playerId]!.clubId;
  const home = world.clubs[fixture.homeId]!;
  const away = world.clubs[fixture.awayId]!;
  return (
    <HeadToHead
      inward
      versus={c.common.vs}
      versusClass="text-white/70"
      sides={[home, away].map((club) => ({
        id: club.id,
        name: club.name,
        artwork: (
          <CrestImage
            crest={club.crest}
            alt={club.name}
            className="h-16 w-16 drop-shadow-lg sm:h-24 sm:w-24"
          />
        ),
        detail: (
          <SideDetail
            world={world}
            clubId={club.id}
            own={club.id === clubId}
            home={club.id === home.id}
          />
        ),
        label: club.id === clubId && (
          <span className="block text-xs font-bold uppercase tracking-wider text-gold">
            {c.hub.club}
          </span>
        ),
      }))}
    />
  );
}

/** The pending career fixture, before the pre-match briefing opens: the hub's pitch hero. */
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
      className="relative overflow-hidden rounded-panel bg-field p-5 text-white shadow-surface sm:p-7"
      data-testid="career-fixture"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] [background:repeating-linear-gradient(90deg,transparent_0_56px,white_56px_112px)]"
      />
      <div className="relative mx-auto flex max-w-[40rem] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-gold">
            {c.report.fixture}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
            {c.hub.importance[kind]}
          </span>
        </div>
        <h2 id="career-fixture-heading" className="sr-only">
          {c.report.fixture}
        </h2>
        <FixtureTeams world={world} fixture={fixture} />
        <div className="flex justify-center text-center">
          <StakeLine world={world} fixture={fixture} />
        </div>
        <p className="text-center text-sm font-semibold text-white/90">
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
        <p className="text-center text-sm text-white/80">{c.report.previewNote}</p>
        <div className="flex justify-center">
          <button className="button play min-w-60" disabled={disabled} onClick={onPrepare}>
            {c.report.prepare}
            <Icon name="arrow" />
          </button>
        </div>
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
            className="button play"
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
          className="button play"
          disabled={Boolean(job)}
          onClick={() => useAppStore.getState().setCareerResult(null)}
        >
          {c.report.nextFixture}
          <Icon name="arrow" />
        </button>
      ) : world.phase !== 'complete' ? (
        <button
          className="button play"
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
