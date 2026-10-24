import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Icon } from '../../ui/Icon';
import { fixtureKind, nextCareerFixture, pendingCareerFixture } from '../../engine/career/fixtures';
import { StakeLine } from '../career/stakesUi';
import type { CareerMatchOutcome } from '../../engine/career/matches';
import type { Fixture, TournamentFixture, WindowFixture, World } from '../../model/domain';
import {
  nationOf,
  pendingWindowFixture,
  tournamentStep,
} from '../../engine/career/honours/international';
import { NationFlag, tournamentHeading } from '../career/TournamentHub';
import { calendarDate } from '../../engine/world/calendar';
import { formatGameDate } from '../../i18n/calendar';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { CrestImage, JobProgress, PlayerPortrait } from '../career/shared';
import { competitionName, leaguePosition, recentForm, windowTitle } from '../career/selectors';
import { matchFormat, matchText as m } from '../../i18n/match';
import { continueToMatchday, continueTournament } from '../career/actions';
import { cx } from '../../ui/kit';

const u = m.ui;
const FORM_TONE = {
  win: 'bg-gold text-on-gold',
  draw: 'bg-white/20 text-white',
  loss: 'bg-danger-soft text-danger',
} as const;

/** One side of the fixture: crest, Bebas name, table place and, for your club, the form. */
function FixtureSide({ world, clubId, own }: { world: World; clubId: string; own: boolean }) {
  const club = world.clubs[clubId]!;
  const table = leaguePosition(world, clubId);
  const form = own ? recentForm(world.career!) : [];
  return (
    <div className="match-fixture-side">
      <CrestImage crest={club.crest} alt={club.name} className="match-fixture-crest" />
      <div>
        {own && <span className="match-hero-eyebrow">{u.yourClub}</span>}
        <span className="match-fixture-name">{club.name}</span>
      </div>
      {table && (
        <span className="text-sm text-hero-muted">
          {matchFormat(m.fixtureTable, {
            rank: table.rank,
            total: table.total,
            points: table.points,
          })}
        </span>
      )}
      {form.length > 0 && (
        <span
          className="inline-flex gap-1.5"
          role="img"
          aria-label={format(c.hub.formLabel, {
            count: form.length,
            results: form.map((record) => c.hub.resultNames[record.result]).join(', '),
          })}
        >
          {form.map((record) => (
            <span
              key={record.fixtureId}
              className={`grid h-7 w-7 place-items-center rounded-full font-display text-[1.0625rem] leading-none ${FORM_TONE[record.result]}`}
            >
              {c.hub.results[record.result]}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/**
 * The pending career fixture, before the pre-match briefing opens (redesign phase 5b): the
 * field-green hero with both clubs and the one gold action, beside how matchday works.
 */
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
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const clubId = player.clubId;
  const home = world.clubs[fixture.homeId]!;
  const date = formatGameDate(
    calendarDate(fixture.date.season, fixture.date.week, fixture.date.day),
  );
  return (
    <div className="match-fixture-layout">
      <section
        aria-labelledby="career-fixture-heading"
        className="match-fixture-hero"
        data-testid="career-fixture"
      >
        <svg
          viewBox="0 0 800 460"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <g fill="none" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="3">
            <path d="M400 -10V470" />
            <circle cx="400" cy="230" r="86" />
            <path d="M-10 110H120V350H-10" />
            <path d="M810 110H680V350H810" />
          </g>
        </svg>
        <div className="relative flex flex-wrap items-center justify-center gap-2.5">
          <h2 id="career-fixture-heading" className="match-hero-eyebrow">
            {c.report.fixture}
          </h2>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
            {c.hub.importance[kind]}
          </span>
        </div>
        <div className="match-fixture-teams">
          <FixtureSide world={world} clubId={fixture.homeId} own={fixture.homeId === clubId} />
          <span className="match-fixture-v" aria-hidden="true">
            {u.versus}
          </span>
          <span className="sr-only">{c.common.vs}</span>
          <FixtureSide world={world} clubId={fixture.awayId} own={fixture.awayId === clubId} />
        </div>
        <div className="relative flex justify-center text-center">
          <StakeLine world={world} fixture={fixture} />
        </div>
        <div className="relative grid justify-items-center gap-1.5 text-center">
          <p className="text-sm font-bold">
            {format(c.hub.fixtureDate, {
              date,
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
          {!fixture.neutral && (
            <p className="text-[0.8125rem] text-hero-muted">
              {matchFormat(u.venue, {
                stadium: home.stadium.name,
                capacity: home.stadium.capacity.toLocaleString('en-GB'),
              })}
            </p>
          )}
        </div>
        <p className="match-fixture-note">
          <Icon name="history" className="h-5 w-5 shrink-0 text-gold" />
          <span>{c.report.previewNote}</span>
        </p>
        <div className="relative flex justify-center">
          <button
            type="button"
            className="button play button-lg match-fixture-cta"
            disabled={disabled}
            onClick={onPrepare}
          >
            {c.report.prepare}
            <Icon name="arrow" />
          </button>
        </div>
      </section>
      <aside className="match-panel match-steps" aria-labelledby="matchday-steps">
        <h2 id="matchday-steps" className="match-card-title is-display">
          {u.howTitle}
        </h2>
        <ol>
          {u.steps.map((step, index) => (
            <li key={step.title} className={cx(index === 0 && 'is-next')}>
              <span className="match-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="min-w-0">
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="match-steps-player">
          <PlayerPortrait
            player={player}
            age={world.date.season - player.birthSeason}
            club={clubId ? world.clubs[clubId] : null}
            className="h-12 w-12 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-bold">
              {player.name} · {player.primaryPosition}
            </p>
            <p className="match-card-note">
              {matchFormat(u.fitness, {
                fitness: Math.round(player.fitness),
                fatigue: Math.round(player.fatigue),
              })}
            </p>
          </div>
        </div>
        <p className="match-card-note">{u.pausesNote}</p>
      </aside>
    </div>
  );
}

/**
 * The career player's tournament match, before the pre-match briefing opens (review phase 3):
 * the two nations, the round and the one gold action, beside how matchday works.
 */
export function TournamentMatch({
  world,
  fixture,
  disabled,
  onPrepare,
}: {
  world: World;
  fixture: TournamentFixture;
  disabled: boolean;
  onPrepare: () => void;
}) {
  const live = world.international!.live!;
  const heading = tournamentHeading(live);
  return (
    <NationFixture
      world={world}
      fixture={fixture}
      nationId={live.careerNationId}
      title={heading.title}
      badge={heading.round}
      venue={c.common.neutral}
      testId="tournament-fixture"
      disabled={disabled}
      onPrepare={onPrepare}
    />
  );
}

/**
 * The career player's window match (version 0.9.0): a qualifier or friendly for their nation,
 * with the way to have the rest of the window simulated.
 */
export function WindowMatch({
  world,
  fixture,
  disabled,
  onPrepare,
  onSimulate,
}: {
  world: World;
  fixture: WindowFixture;
  disabled: boolean;
  onPrepare: () => void;
  onSimulate: () => void;
}) {
  const window = world.international!.window!;
  const index = window.fixtures.indexOf(fixture);
  return (
    <NationFixture
      world={world}
      fixture={fixture}
      nationId={window.nationId}
      title={windowTitle(world, fixture)}
      badge={format(c.hub.window.match, { index: index + 1, count: window.fixtures.length })}
      venue={fixture.homeId === window.nationId ? c.hub.window.home : c.hub.window.away}
      testId="window-fixture"
      disabled={disabled}
      onPrepare={onPrepare}
      secondary={
        <button
          type="button"
          className="button match-night-button"
          disabled={disabled}
          onClick={onSimulate}
        >
          {c.hub.window.simulate}
        </button>
      }
    />
  );
}

/** A nation's match before the pre-match briefing: the two nations and the gold action. */
function NationFixture({
  world,
  fixture,
  nationId,
  title,
  badge,
  venue,
  testId,
  disabled,
  onPrepare,
  secondary,
}: {
  world: World;
  fixture: { homeId: string; awayId: string };
  nationId: string | null;
  title: string;
  badge: string;
  venue: string;
  testId: string;
  disabled: boolean;
  onPrepare: () => void;
  secondary?: ReactNode;
}) {
  const side = (id: string) => {
    const nation = nationOf(world, id);
    return (
      <div className="match-fixture-side">
        <NationFlag nation={nation} className="h-12 w-[4.5rem] sm:h-16 sm:w-24" />
        <div>
          {id === nationId && (
            <span className="match-hero-eyebrow">{c.hub.tournament.yourNation}</span>
          )}
          <span className="match-fixture-name">{nation.name}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="match-fixture-layout">
      <section
        aria-labelledby="nation-fixture-heading"
        className="match-fixture-hero"
        data-testid={testId}
      >
        <div className="relative flex flex-wrap items-center justify-center gap-2.5">
          <h2 id="nation-fixture-heading" className="match-hero-eyebrow">
            {title}
          </h2>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{badge}</span>
        </div>
        <div className="match-fixture-teams">
          {side(fixture.homeId)}
          <span className="match-fixture-v" aria-hidden="true">
            {u.versus}
          </span>
          <span className="sr-only">{c.common.vs}</span>
          {side(fixture.awayId)}
        </div>
        <p className="relative text-center text-sm font-bold">{venue}</p>
        <div className="relative flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="button play button-lg match-fixture-cta"
            disabled={disabled}
            onClick={onPrepare}
          >
            {c.report.prepare}
            <Icon name="arrow" />
          </button>
          {secondary}
        </div>
      </section>
      <aside className="match-panel match-steps" aria-labelledby="matchday-steps">
        <h2 id="matchday-steps" className="match-card-title is-display">
          {u.howTitle}
        </h2>
        <ol>
          {u.steps.map((step, index) => (
            <li key={step.title} className={cx(index === 0 && 'is-next')}>
              <span className="match-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="min-w-0">
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="match-card-note">{u.pausesNote}</p>
      </aside>
    </div>
  );
}

/** No career fixture can be played this week: the reason, what comes next and the way on. */
export function CareerNoMatch({ world }: { world: World }) {
  const job = useAppStore((s) => s.worldJob);
  const career = world.career!;
  const injured = Boolean(career.injury);
  const next = nextCareerFixture(world);
  const last = career.matches.at(-1);
  const opponent = last ? world.clubs[last.opponentId] : undefined;
  const blocked = Boolean(career.injury && career.injury.recovery === null);
  return (
    <section className="match-panel match-no-match" aria-labelledby="no-match-heading">
      <div className="flex items-center gap-3">
        {injured && (
          <span className="match-injury-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path
                d="M12 4V20M4 12H20"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
        )}
        <h2 id="no-match-heading" className="match-card-title is-display">
          {injured ? c.report.injuredNoMatch : c.report.noMatch}
        </h2>
      </div>
      <p className="match-card-note">
        {world.phase === 'complete' ? c.hub.seasonCompleteBody : c.report.noMatchBody}
      </p>
      {((next && world.phase !== 'complete') || (last && opponent)) && (
        <div className="match-no-match-facts">
          {next && world.phase !== 'complete' && (
            <p>
              <Icon name="history" className="h-[18px] w-[18px] shrink-0 text-accent" />
              <span>
                <strong>{c.report.nextFixture}: </strong>
                {world.clubs[next.homeId]?.name} {c.common.vs} {world.clubs[next.awayId]?.name} ·{' '}
                {format(c.common.week, { week: next.date.week })}
              </span>
            </p>
          )}
          {last && opponent && (
            <p>
              <CrestImage crest={opponent.crest} alt="" className="h-5 w-5 shrink-0" />
              <span>
                <strong>{c.report.lastRecorded}: </strong>
                {opponent.name} {last.score[0]}–{last.score[1]} · +{last.xp} XP
              </span>
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {tournamentStep(world) === 'continue' && (
          <button
            type="button"
            className="button play"
            disabled={Boolean(job)}
            onClick={() => continueTournament(false)}
          >
            {c.hub.tournament.continue}
            <Icon name="arrow" />
          </button>
        )}
        {world.phase !== 'complete' && (
          <button
            type="button"
            className="button play"
            disabled={Boolean(job) || blocked}
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
      {blocked && (
        <p className="match-blocked" role="note">
          <Icon name="warning" className="h-4 w-4 shrink-0" />
          {c.hub.injuredBlock}
        </p>
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
  // The next club fixture, or the window's next match (0.9.0).
  const pending = pendingCareerFixture(world) ?? pendingWindowFixture(world);
  const gained = outcome.levelsGained > 0 || world.career!.attributePoints > 0;
  return (
    <>
      {pending ? (
        <button
          type="button"
          className="button play button-lg"
          disabled={Boolean(job)}
          onClick={() => useAppStore.getState().setCareerResult(null)}
        >
          {c.report.nextFixture}
          <Icon name="arrow" />
        </button>
      ) : world.phase !== 'complete' ? (
        <button
          type="button"
          className="button play button-lg"
          disabled={Boolean(job) || Boolean(world.career!.injury && !world.career!.injury.recovery)}
          onClick={continueToMatchday}
        >
          {c.report.continue}
          <Icon name="arrow" />
        </button>
      ) : tournamentStep(world) === 'continue' ? (
        <button
          type="button"
          className="button play button-lg"
          disabled={Boolean(job)}
          onClick={() => continueTournament(false)}
        >
          {c.hub.tournament.continue}
          <Icon name="arrow" />
        </button>
      ) : null}
      <Link className="button match-night-button" to="/career">
        {c.report.hub}
      </Link>
      {gained && (
        <Link className="button match-night-button" to="/career/profile">
          {c.report.allocate}
        </Link>
      )}
      {world.career!.skillPoints > 0 && (
        <Link className="button match-night-button" to="/career/skills">
          {c.report.unlock}
        </Link>
      )}
      <div className="basis-full">
        <JobProgress />
      </div>
    </>
  );
}
