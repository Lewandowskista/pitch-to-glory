import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Icon } from '../../ui/Icon';
import { HeadToHead } from '../../ui/HeadToHead';
import { Dialog } from '../../ui/Dialog';
import { CONFIG } from '../../engine/config';
import { fixtureKind, nextCareerFixture, pendingCareerFixture } from '../../engine/career/fixtures';
import { chooseRecovery } from '../../engine/career/training';
import { retirementState } from '../../engine/career/honours/retirement';
import type { Career, CareerMatchRecord, Club, Player, World } from '../../model/domain';
import { errorText, format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import {
  CareerPage,
  CrestImage,
  JobProgress,
  Meter,
  PlayerPortrait,
  XpBar,
  plural,
  ui,
  useEditBlock,
} from './shared';
import {
  competitionName,
  leagueSeasonLine,
  leaguePosition,
  recentForm,
  seasonLine,
} from './selectors';
import { continueToMatchday, simulateCareerSeason, startNextCareerSeason } from './actions';
import { useUrlDialog } from './useUrlDialog';
import { careerContract, windowState } from '../../engine/career/market';
import { marketText as m } from '../../i18n/market';
import { messageText, money, roleName, weekly } from './marketUi';
import { rivalOf, seasonLines } from '../../engine/career/social';
import { socialText as s } from '../../i18n/social';
import { mediaText } from './socialUi';
import { challengeDone, fameProgress } from '../../engine/career/lifestyle';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { honoursText as h } from '../../i18n/honours';
import { fameName, useChallengeRefresh } from './lifestyleUi';
import { HonoursSummary } from './honoursHub';
import { Tutorial } from '../../ui/Tutorial';
import { agendaText as a } from '../../i18n/agenda';
import {
  advancePreview,
  hubPriorities,
  sinceValue,
  type AdvancePreview,
  type SessionState,
} from './agenda';
import { AdvanceDigest, AdvancePreviewText, HubPriorities } from './HubPriorities';
import { CoachTile } from './CoachAdvice';
import { tutorialText as tt } from '../../i18n/tutorial';

const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;

/** Large hub cards: a column so the footer link always sits at the bottom. */
const card = `${ui.panel} flex flex-col`;
/** Small summary tiles in the strip under the main cards. */
const tile =
  'flex min-w-0 flex-col rounded-panel border border-line bg-surface p-4 shadow-surface sm:p-5';
const tileHeading = 'text-base font-bold leading-tight';

/** The one card action style on the hub: a footer link to the card's single destination. */
function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <div className="mt-auto pt-3">
      <Link className="text-button -ml-3 inline-flex items-center gap-1" to={to}>
        {children}
      </Link>
    </div>
  );
}

export default function CareerHub() {
  useChallengeRefresh();
  return (
    <CareerPage title={c.titles.hub}>
      {({ world, career, player, club, age }) => (
        <HubContent world={world} career={career} player={player} club={club} age={age} />
      )}
    </CareerPage>
  );
}

function HubContent({
  world,
  career,
  player,
  club,
  age,
}: {
  world: World;
  career: Career;
  player: Player;
  club: Club | undefined;
  age: number;
}) {
  const error = useAppStore((s) => s.worldError);
  const notice = useAppStore((s) => s.worldNotice);
  const session = useAppStore((s): SessionState =>
    s.matchSession
      ? s.matchSession.state.match.status === 'finished'
        ? 'finished'
        : 'live'
      : null,
  );
  const [params] = useSearchParams();
  const { hash } = useLocation();
  // Links into the hub (such as a recovery choice from the priorities) bring their target into
  // view and focus its first control.
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target
      .querySelector<HTMLElement>('button:not(:disabled), a[href]')
      ?.focus({ preventScroll: true });
  }, [hash]);
  // Late in a career the honours card carries the retirement decision, so it stays full size.
  const retirement = retirementState(world) !== 'young';
  const priorities = hubPriorities(world, session);
  const preview = advancePreview(world, session);
  // Quiet summaries shrink to tiles; the URL can ask for every summary in full.
  const full = params.get('summaries') === 'all';
  const pressActive =
    full || world.media.some((item) => item.choices.length > 0 && item.answer === null);
  const marketActive =
    full || world.offers.some((offer) => offer.status === 'terms' || offer.status === 'agreed');
  const inboxActive = full || world.inbox.some((message) => !message.read);
  const active = [inboxActive, pressActive, marketActive].filter(Boolean).length;
  const span = active === 1 ? 'lg:col-span-12' : active === 2 ? 'lg:col-span-6' : 'lg:col-span-4';
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      {error && (
        <div role="alert" className="inline-error lg:col-span-12">
          {errorText(error)}
        </div>
      )}
      <p
        role="status"
        className="min-h-0 text-sm font-semibold text-accent empty:hidden lg:col-span-12"
      >
        {notice && notice !== 'generated' ? t.world.notices[notice] : ''}
      </p>
      <NextMatch world={world} career={career} club={club} preview={preview} />
      <HubPriorities world={world} items={priorities} />
      <AdvanceDigest world={world} />
      <PlayerCard career={career} player={player} club={club} age={age} />
      <LastResult world={world} career={career} />
      <SeasonStats world={world} career={career} player={player} />
      <Condition career={career} player={player} />
      <ClubStanding world={world} club={club} />
      {retirement && <HonoursSummary world={world} className="lg:col-span-12" />}
      {inboxActive && <InboxPreview world={world} span={span} />}
      {pressActive && <PressRoom world={world} span={span} />}
      {marketActive && <MarketSummary world={world} span={span} />}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {!inboxActive && <InboxTile world={world} />}
        {!pressActive && <PressTile world={world} />}
        {!marketActive && <MarketTile world={world} />}
        <TrainingSummary career={career} />
        <CoachTile world={world} className={tile} />
        <FameSummary world={world} />
        {!retirement && <HonoursTile world={world} />}
        <RivalWatch world={world} />
      </div>
      <SummariesToggle full={full} />
      <Tutorial
        track="week"
        enabled={world.phase === 'active' && career.matches.length === 0}
        steps={(
          [
            'next-match',
            'priorities',
            'player-card',
            'training',
            'career-nav',
            'inbox',
            'continue',
          ] as const
        ).map((target) => ({ target, ...tt.week[target] }))}
      />
    </div>
  );
}

function NextMatch({
  world,
  career,
  club,
  preview,
}: {
  world: World;
  career: Career;
  club: Club | undefined;
  preview: AdvancePreview;
}) {
  const job = useAppStore((s) => s.worldJob);
  const session = useAppStore((s) => s.matchSession);
  const dialog = useUrlDialog('confirm');
  const [params, setParams] = useSearchParams();
  const pending = pendingCareerFixture(world);
  // The match Continue heads for; a fixture this week the player was not picked for is
  // played without them.
  const fixture = pending ?? preview.fixture ?? nextCareerFixture(world);
  // Remember where this advance started, so the hub can summarize what actually happened.
  const advance = (run: () => void) => {
    const next = new URLSearchParams(params);
    next.delete('confirm');
    next.set('since', sinceValue(world.date));
    setParams(next, { replace: true });
    run();
  };
  const opponentId = fixture && (fixture.homeId === club?.id ? fixture.awayId : fixture.homeId);
  const opponent = opponentId ? world.clubs[opponentId] : undefined;
  const home = fixture?.homeId === club?.id;
  const kind = fixture ? fixtureKind(world, fixture) : null;
  const awaitingRecovery = Boolean(career.injury && career.injury.recovery === null);
  const complete = world.phase === 'complete';
  const busy = Boolean(job);
  const action = session ? (
    <Link className="button play min-w-48" to="/match">
      {session.state.match.status === 'finished' ? c.hub.record : c.hub.resume}
      <Icon name="arrow" />
    </Link>
  ) : complete ? (
    <button className="button play min-w-48" disabled={busy} onClick={startNextCareerSeason}>
      {c.hub.nextSeason}
      <Icon name="arrow" />
    </button>
  ) : pending ? (
    <Link className="button play min-w-48" to="/match" data-tour="continue">
      {c.hub.play}
      <Icon name="ball" />
    </Link>
  ) : awaitingRecovery ? (
    <Link
      className="button play min-w-48"
      to={{ search: params.get('save') ? `?save=${params.get('save')}` : '', hash: '#recovery' }}
      data-tour="continue"
    >
      {a.priorities.kinds.recovery}
      <Icon name="arrow" />
    </Link>
  ) : (
    <button
      className="button play min-w-48"
      disabled={busy}
      data-tour="continue"
      onClick={() => advance(continueToMatchday)}
    >
      {fixture ? c.hub.continue : c.hub.continueSeason}
      <Icon name="arrow" />
    </button>
  );
  return (
    <section
      aria-labelledby="next-match-heading"
      data-tour="next-match"
      className="relative overflow-hidden rounded-panel bg-field p-5 text-white shadow-surface sm:p-7 lg:col-span-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] [background:repeating-linear-gradient(90deg,transparent_0_56px,white_56px_112px)]"
      />
      <div className="relative flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-gold">
            {complete ? c.hub.seasonComplete : pending ? c.hub.matchday : c.hub.nextMatch}
          </span>
          {kind && !complete && (
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
              {c.hub.importance[kind]}
            </span>
          )}
        </div>
        <h2 id="next-match-heading" className="sr-only">
          {c.hub.nextMatch}
        </h2>
        {complete ? (
          <div>
            <p className="font-display text-[2.6rem] leading-none">{c.hub.seasonComplete}</p>
            <p className="mt-2 max-w-prose text-sm text-white/85">{c.hub.seasonCompleteBody}</p>
          </div>
        ) : fixture && opponent && club ? (
          <HeadToHead
            inward
            versus={c.common.vs}
            versusClass="text-white/70"
            sides={[home ? club : opponent, home ? opponent : club].map((side) => ({
              id: side.id,
              name: side.name,
              artwork: (
                <CrestImage
                  crest={side.crest}
                  alt={side.name}
                  className="h-16 w-16 drop-shadow-lg sm:h-24 sm:w-24"
                />
              ),
              label: side.id === club.id && (
                <span className="block text-xs font-bold uppercase tracking-wider text-gold">
                  {c.hub.club}
                </span>
              ),
            }))}
          />
        ) : (
          <div>
            <p className="font-display text-[2.2rem] leading-none">{c.hub.noFixture}</p>
            <p className="mt-2 max-w-prose text-sm text-white/85">{c.hub.noFixtureBody}</p>
          </div>
        )}
        {fixture && !complete && (
          <p className="text-sm text-white/85">
            {format(c.hub.fixtureDate, {
              week: fixture.date.week,
              competition: competitionName(world, fixture.competitionId),
            })}{' '}
            · {fixture.neutral ? c.common.neutral : home ? c.common.home : c.common.away}
          </p>
        )}
        {pending && !session && (
          <p className="max-w-prose text-sm text-white/85">{c.hub.matchdayBody}</p>
        )}
        {!session && <AdvancePreviewText world={world} preview={preview} />}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {action}
          {!complete && !session && !awaitingRecovery && (
            <button
              className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-white underline underline-offset-4 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/60 disabled:no-underline"
              disabled={busy}
              onClick={() => dialog.open('autoplay')}
            >
              {c.hub.simulateSeason}
            </button>
          )}
        </div>
        <div className="text-ink">
          <JobProgress />
        </div>
      </div>
      {dialog.value === 'autoplay' && (
        <Dialog
          title={c.hub.autoTitle}
          body={c.hub.autoBody}
          confirmLabel={c.hub.autoConfirm}
          busy={busy}
          onClose={dialog.close}
          onConfirm={() => {
            advance(() => simulateCareerSeason(true));
          }}
        />
      )}
    </section>
  );
}

/** Unspent points: a clear call to spend them, quiet when there is nothing to spend. */
function PointsLink({
  to,
  count,
  label,
  action,
}: {
  to: string;
  count: number;
  label: string;
  action: string;
}) {
  return (
    <Link
      to={to}
      className={`flex min-h-11 items-center justify-between gap-3 rounded-control px-4 text-sm font-bold transition-colors ${
        count
          ? 'border-2 border-gold bg-art-gold text-ink hover:bg-gold hover:text-on-gold'
          : 'border border-line bg-surface-soft font-semibold text-muted hover:text-ink'
      }`}
    >
      <span className="min-w-0">
        {label}
        <span className="sr-only"> — {action}</span>
      </span>
      {count > 0 && (
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
          {c.hub.spend}
          <Icon name="arrow" />
        </span>
      )}
    </Link>
  );
}

function PlayerCard({
  career,
  player,
  club,
  age,
}: {
  career: Career;
  player: Player;
  club: Club | undefined;
  age: number;
}) {
  return (
    <section
      aria-labelledby="player-card-heading"
      data-tour="player-card"
      className={`${card} lg:col-span-4`}
    >
      <div className="flex flex-wrap items-center gap-4">
        <PlayerPortrait player={player} age={age} className="h-20 w-20 shrink-0 sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1 basis-40">
          <h2
            id="player-card-heading"
            className="font-display text-[2rem] leading-none break-words"
          >
            {player.name}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {c.positions[player.primaryPosition]} · {format(c.common.age, { age })}
          </p>
          {club && (
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
              <CrestImage crest={club.crest} alt="" className="h-6 w-6 shrink-0" />
              <span className="min-w-0 break-words">{club.name}</span>
            </p>
          )}
        </div>
      </div>
      <div className="mt-5">
        <XpBar career={career} />
      </div>
      <div className="mt-5 grid gap-2">
        <PointsLink
          to="/career/profile"
          count={career.attributePoints}
          label={plural(career.attributePoints, c.common.attributePoint, c.common.attributePoints)}
          action={c.hub.allocate}
        />
        <PointsLink
          to="/career/skills"
          count={career.skillPoints}
          label={plural(career.skillPoints, c.common.skillPoint, c.common.skillPoints)}
          action={c.hub.unlock}
        />
      </div>
    </section>
  );
}

function ResultChip({ record }: { record: CareerMatchRecord }) {
  const tone =
    record.result === 'win'
      ? 'bg-accent text-on-accent'
      : record.result === 'loss'
        ? 'bg-danger-soft text-danger'
        : 'bg-surface-soft text-ink';
  return (
    <span
      className={`grid h-9 w-9 place-items-center rounded-full font-display text-lg ${tone}`}
      title={c.hub.resultNames[record.result]}
    >
      {c.hub.results[record.result]}
    </span>
  );
}

function LastResult({ world, career }: { world: World; career: Career }) {
  const last = career.matches.at(-1);
  const form = recentForm(career);
  const opponent = last ? world.clubs[last.opponentId] : undefined;
  return (
    <section aria-labelledby="last-result-heading" className={`${card} lg:col-span-4`}>
      <h2 id="last-result-heading" className={ui.heading}>
        {c.hub.lastResult}
      </h2>
      {last ? (
        <>
          <div className="mt-4 flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-control font-display text-3xl ${
                last.result === 'win'
                  ? 'bg-accent text-on-accent'
                  : last.result === 'loss'
                    ? 'bg-danger-soft text-danger'
                    : 'bg-surface-soft text-ink'
              }`}
            >
              {c.hub.results[last.result]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl leading-tight break-words">
                {format(c.hub.resultLine[last.result], {
                  score: `${last.score[0]}–${last.score[1]}`,
                  opponent: opponent?.name ?? last.opponentId,
                })}
                {last.decided && (
                  <span className="ml-1 font-sans text-sm text-muted">
                    {c.profile.decided[last.decided]}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">
                {format(c.hub.resultMeta, {
                  venue: last.home ? c.common.home : c.common.away,
                  competition: competitionName(world, last.competitionId),
                  week: last.week,
                })}
              </p>
            </div>
            {opponent && (
              <CrestImage crest={opponent.crest} alt="" className="h-10 w-10 shrink-0" />
            )}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              [c.profile.columns.rating, last.rating.toFixed(1)],
              [c.profile.columns.ga, `${last.goals}/${last.assists}`],
              [c.profile.columns.xp, `+${last.xp}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-control bg-surface-soft p-2">
                <dt className="text-xs font-semibold text-muted">{label}</dt>
                <dd className="font-display text-2xl leading-tight">{value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-5 text-sm font-semibold text-muted">{c.hub.form}</h3>
          <div
            className="mt-2 flex gap-2"
            role="img"
            aria-label={format(c.hub.formLabel, {
              count: form.length,
              results: form.map((record) => c.hub.resultNames[record.result]).join(', '),
            })}
          >
            {form.map((record) => (
              <ResultChip key={record.fixtureId} record={record} />
            ))}
          </div>
        </>
      ) : (
        <p className={`${ui.muted} mt-4`}>{c.hub.noMatches}</p>
      )}
    </section>
  );
}

function SeasonStats({ world, career, player }: { world: World; career: Career; player: Player }) {
  const line = seasonLine(career, world.date.season);
  const league = leagueSeasonLine(world, career, world.date.season);
  const keeper = player.primaryPosition === 'GK';
  const stats: [string, string | number][] = [
    [c.hub.stats.apps, line.apps],
    [c.hub.stats.goals, line.goals],
    [c.hub.stats.assists, line.assists],
    [c.hub.stats.rating, line.apps ? line.rating.toFixed(2) : '–'],
    keeper ? [c.hub.stats.cleanSheets, line.cleanSheets] : [c.hub.stats.xp, line.xp],
  ];
  return (
    <section aria-labelledby="season-stats-heading" className={`${card} lg:col-span-4`}>
      <h2 id="season-stats-heading" className={ui.heading}>
        {format(c.hub.season, { season: world.date.season })}
      </h2>
      <p className="mt-1 text-xs text-muted">{c.hub.scope}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-3">
        {stats.map(([label, value], index) => (
          <div
            key={label}
            className={`rounded-control bg-surface-soft p-2.5 sm:p-3 ${index === 0 ? 'sm:col-span-2' : ''}`}
          >
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="font-display text-2xl leading-tight sm:text-3xl">{value}</dd>
          </div>
        ))}
      </dl>
      {league.apps > 0 && (
        <p className="mt-3 text-sm text-muted">
          {format(c.hub.leagueLine, {
            goals: plural(league.goals, c.hub.goal, c.hub.goals),
            assists: plural(league.assists, c.hub.assist, c.hub.assists),
            apps: plural(league.apps, c.hub.game, c.hub.games),
          })}
        </p>
      )}
    </section>
  );
}

function ClubStanding({ world, club }: { world: World; club: Club | undefined }) {
  const standing = club ? leaguePosition(world, club.id) : null;
  const league = club ? world.leagues[club.leagueId] : undefined;
  return (
    <section aria-labelledby="club-heading" className={`${card} lg:col-span-4 lg:self-start`}>
      <h2 id="club-heading" className={ui.heading}>
        {c.hub.club}
      </h2>
      {club ? (
        <>
          <div className="mt-4 flex items-center gap-3">
            <CrestImage crest={club.crest} alt="" className="h-14 w-14 shrink-0" />
            <div className="min-w-0">
              <p className="break-words font-semibold">{club.name}</p>
              <p className="break-words text-xs text-muted">{league?.name}</p>
            </div>
          </div>
          {standing ? (
            <div className="mt-4 rounded-control bg-surface-soft p-4">
              <p className="text-xs font-semibold text-muted">{c.hub.position}</p>
              <p className="font-display text-4xl leading-tight">
                {format(c.hub.positionValue, { rank: standing.rank, total: standing.total })}
              </p>
              <p className="text-sm text-muted">
                {format(c.hub.points_, { points: standing.points, played: standing.played })}
              </p>
            </div>
          ) : (
            <p className={`${ui.muted} mt-4`}>{c.hub.noLeague}</p>
          )}
          {league && (
            <CardLink
              to={`/world?country=${encodeURIComponent(club.countryId)}&tier=${league.tier}&group=${encodeURIComponent(league.id)}&club=${encodeURIComponent(club.id)}`}
            >
              {c.hub.viewTable}
            </CardLink>
          )}
        </>
      ) : (
        <p className={`${ui.muted} mt-4`}>{c.common.unknownClub}</p>
      )}
    </section>
  );
}

function Condition({ career, player }: { career: Career; player: Player }) {
  const block = useEditBlock();
  const injury = career.injury;
  const I = CONFIG.career.injuries;
  const rushWeeks = injury
    ? Math.max(1, Math.ceil(injury.weeksRemaining * I.rush.durationFactor))
    : 0;
  const risk = injury ? Math.round(I.rush.reinjuryPerSeverity * injury.severity * 100) : 0;
  const choose = (recovery: 'rehab' | 'rush') => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    useAppStore.getState().setWorld(chooseRecovery(current, recovery));
  };
  return (
    <section aria-labelledby="condition-heading" className={`${card} lg:col-span-8 lg:self-start`}>
      <h2 id="condition-heading" className={ui.heading}>
        {c.hub.condition}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Meter label={c.common.meters.form} value={player.form} />
        <Meter label={c.common.meters.morale} value={player.morale} />
        <Meter label={c.common.meters.fitness} value={player.fitness} />
        <Meter
          label={c.common.meters.fatigue}
          value={player.fatigue}
          tone={player.fatigue > 60 ? 'danger' : 'gold'}
        />
      </div>
      {injury && (
        <div className="mt-5 rounded-control border border-danger/40 bg-danger-soft p-4">
          <p className="text-sm font-bold text-danger">{c.hub.injury}</p>
          <p className="mt-1 font-display text-2xl leading-tight">
            {c.injuries[injury.kind] ?? injury.kind}
          </p>
          <p className="text-sm">
            {injury.weeksRemaining === 1
              ? c.hub.injuryOutOne
              : format(c.hub.injuryOut, { weeks: injury.weeksRemaining })}{' '}
            · {c.injuryCause[injury.cause]}
          </p>
          {injury.careerThreatening && (
            <p className="mt-2 text-sm font-semibold text-danger">{c.hub.injuryThreatening}</p>
          )}
          {injury.recovery === null ? (
            <fieldset id="recovery" className="mt-4 scroll-mt-24">
              <legend className="text-sm font-bold">{c.hub.recoveryTitle}</legend>
              {block && <p className="mt-1 text-xs text-muted">{block}</p>}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  className="flex min-h-11 flex-col items-start gap-1 rounded-control border border-line bg-surface p-3 text-left transition hover:border-accent disabled:opacity-50"
                  disabled={Boolean(block)}
                  onClick={() => choose('rehab')}
                >
                  <strong className="text-sm">{c.hub.rehab}</strong>
                  <span className="text-xs text-muted">
                    {format(c.hub.rehabBody, { weeks: injury.weeksRemaining })}
                  </span>
                </button>
                <button
                  className="flex min-h-11 flex-col items-start gap-1 rounded-control border border-line bg-surface p-3 text-left transition hover:border-accent disabled:opacity-50"
                  disabled={Boolean(block)}
                  onClick={() => choose('rush')}
                >
                  <strong className="text-sm">{c.hub.rush}</strong>
                  <span className="text-xs text-muted">
                    {format(c.hub.rushBody, { weeks: rushWeeks, risk })}
                  </span>
                </button>
              </div>
            </fieldset>
          ) : (
            <p className="mt-2 text-sm font-semibold">
              {format(c.hub.recoveryChosen[injury.recovery], {
                risk: Math.round(injury.reinjuryRisk * 100),
              })}
            </p>
          )}
        </div>
      )}
      {!injury && career.reinjury && (
        <p className="mt-4 text-sm font-semibold text-danger">
          {format(c.hub.reinjury, {
            risk: Math.round(career.reinjury.risk * 100),
            weeks: career.reinjury.weeks,
          })}
        </p>
      )}
    </section>
  );
}

function InboxPreview({ world, span }: { world: World; span: string }) {
  const latest = [...world.inbox].reverse().slice(0, 4);
  return (
    <section
      aria-labelledby="inbox-preview-heading"
      data-tour="inbox"
      className={`${card} ${span}`}
    >
      <h2 id="inbox-preview-heading" className={ui.heading}>
        {m.hub.inbox}
      </h2>
      {latest.length ? (
        <ul className="-mx-3 mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
          {latest.map((message) => (
            <li key={message.id}>
              <Link
                to={`/career/inbox?message=${encodeURIComponent(message.id)}`}
                className="flex min-h-11 items-start gap-3 rounded-control px-3 py-2 transition hover:bg-surface-soft"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${message.read ? 'bg-line' : 'bg-accent'}`}
                />
                <span
                  className={`min-w-0 flex-1 text-sm line-clamp-2 ${message.read ? '' : 'font-bold'}`}
                >
                  {messageText(message).subject}
                  {!message.read && (
                    <span className="sr-only"> · {format(m.inbox.unread, { count: 1 })}</span>
                  )}
                </span>
                <span className="mt-0.5 shrink-0 text-xs text-muted">
                  {format(c.common.week, { week: message.date.week })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-4`}>{m.inbox.empty}</p>
      )}
      <CardLink to="/career/inbox">{m.hub.seeAll}</CardLink>
    </section>
  );
}

function PressRoom({ world, span }: { world: World; span: string }) {
  const pending = world.media.find((item) => item.choices.length > 0 && item.answer === null);
  const headline = [...world.media].reverse().find((item) => item.kind === 'headline');
  return (
    <section
      aria-labelledby="press-room-heading"
      className={`${card} ${span} ${pending ? 'border-gold' : ''}`}
    >
      <h2 id="press-room-heading" className={ui.heading}>
        {s.hub.press}
      </h2>
      {pending ? (
        <div className="mt-4 grid gap-3">
          <p className="text-sm font-semibold text-accent">
            {format(s.hub.pressWaiting, { outlet: pending.authorName })}
          </p>
          <p className="font-display text-2xl leading-tight">{mediaText(pending)}</p>
          <div>
            <Link className="button" to="/career/media">
              {s.hub.pressOpen}
              <Icon name="arrow" />
            </Link>
          </div>
        </div>
      ) : (
        <p className={`${ui.muted} mt-4`}>{s.hub.pressNone}</p>
      )}
      {headline && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-semibold text-muted">{s.hub.latest}</p>
          <p className="mt-1 font-display text-xl leading-tight">{mediaText(headline)}</p>
        </div>
      )}
      {!pending && <CardLink to="/career/media">{s.hub.seeMedia}</CardLink>}
    </section>
  );
}

function MarketSummary({ world, span }: { world: World; span: string }) {
  const contract = careerContract(world);
  const waiting = world.offers.filter((offer) => offer.status === 'terms').length;
  const following = world.scouting.length;
  const state = windowState(world);
  const open = state.open && world.phase !== 'complete';
  const windowText =
    world.phase === 'complete'
      ? m.window.between
      : state.open
        ? format(m.window.open, { week: state.closes! })
        : state.opens
          ? format(m.window.opens, { week: state.opens })
          : m.window.closed;
  return (
    <section aria-labelledby="market-summary-heading" className={`${card} ${span}`}>
      <h2 id="market-summary-heading" className={ui.heading}>
        {m.hub.market}
      </h2>
      <p
        className={`mt-4 flex items-start gap-2 rounded-control px-4 py-2.5 text-sm font-semibold text-balance ${
          open ? 'bg-accent text-on-accent' : 'border border-line bg-surface-soft text-muted'
        }`}
      >
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${open ? 'bg-gold' : 'bg-muted'}`}
        />
        <span className="min-w-0">{windowText}</span>
      </p>
      <p className={`mt-3 text-sm font-semibold ${waiting && open ? 'text-accent' : ''}`}>
        {format(m.hub.marketBody, { interest: following, offers: waiting })}
      </p>
      <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
        {[
          [m.contract.wage, weekly(contract.weeklyWage)],
          [m.contract.role, roleName(contract.role)],
          [m.earnings.cash, money(world.career!.market.finances.cash)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-control bg-surface-soft p-2.5">
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="font-display text-xl leading-tight">{value}</dd>
          </div>
        ))}
      </dl>
      <CardLink to="/career/transfers">{m.hub.seeMarket}</CardLink>
    </section>
  );
}

function TrainingSummary({ career }: { career: Career }) {
  const report = career.lastTraining;
  return (
    <section aria-labelledby="training-summary-heading" data-tour="training" className={tile}>
      <h2 id="training-summary-heading" className={tileHeading}>
        {c.hub.training}
      </h2>
      {report ? (
        <div className="mt-1 grid gap-1 text-sm">
          <p className="text-xs text-muted">
            {format(c.common.seasonWeek, { season: report.season, week: report.week })} ·{' '}
            {format(c.hub.trainingFatigue, {
              value: `${report.fatigue > 0 ? '+' : ''}${report.fatigue}`,
            })}
          </p>
          {report.improved.length > 0 && (
            <p className="font-semibold text-accent">
              {format(c.hub.trainingImprovedList, {
                attributes: report.improved.map(attributeName).join(', '),
              })}
            </p>
          )}
          {report.declined.length > 0 && (
            <p className="font-semibold text-danger">
              {format(c.hub.trainingDeclinedList, {
                attributes: report.declined.map(attributeName).join(', '),
              })}
            </p>
          )}
          {!report.improved.length && !report.declined.length && (
            <p className="text-muted">{c.hub.trainingNone}</p>
          )}
          {report.familiarity && (
            <p>
              {format(c.training.familiarityGain, {
                position: report.familiarity.position,
                value: report.familiarity.familiarity,
              })}
            </p>
          )}
          {report.injuryId && <p className="font-semibold text-danger">{c.hub.trainingInjury}</p>}
        </div>
      ) : (
        <p className={`${ui.muted} mt-1`}>{c.hub.trainingEmpty}</p>
      )}
      <CardLink to="/career/training">{c.hub.editTraining}</CardLink>
    </section>
  );
}

function FameSummary({ world }: { world: World }) {
  const career = world.career!;
  const progress = fameProgress(career.fame);
  const ready = world.challenges.filter(
    (challenge) => challenge.claimed || challengeDone(world, challenge),
  ).length;
  return (
    <section aria-labelledby="fame-summary-heading" className={tile}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold font-display text-2xl text-on-gold"
        >
          {progress.level}
        </span>
        <div className="min-w-0">
          <h2 id="fame-summary-heading" className={tileHeading}>
            {l.hub.title}
          </h2>
          <p className="text-sm text-muted">
            {format(c.hub.fameLine, { level: progress.level, name: fameName(progress.level) })}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm">
        {progress.needed
          ? format(l.fame.progressTowards, {
              into: progress.into,
              needed: progress.needed,
              level: progress.level + 1,
            })
          : l.fame.max}
      </p>
      <p className="text-sm">
        {format(l.hub.challenges, { done: ready, total: world.challenges.length })} ·{' '}
        {format(l.wardrobe.tokens, { count: career.style.tokens })}
      </p>
      <CardLink to="/career/wardrobe">{l.hub.open}</CardLink>
    </section>
  );
}

/** Compact honours tile while retirement is still years away. */
function HonoursTile({ world }: { world: World }) {
  const career = world.career!;
  const caps = Object.values(career.honours.caps).reduce((sum, value) => sum + value, 0);
  const goals = Object.values(career.honours.internationalGoals).reduce(
    (sum, value) => sum + value,
    0,
  );
  const trophies = world.trophies.filter((trophy) =>
    trophy.playerIds.includes(career.playerId),
  ).length;
  const awards = world.awards.filter((award) => award.winnerIds.includes(career.playerId)).length;
  return (
    <section aria-labelledby="honours-summary-heading" className={tile}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold text-xl text-on-gold"
        >
          ★
        </span>
        <div className="min-w-0">
          <h2 id="honours-summary-heading" className={tileHeading}>
            {h.hub.honours}
          </h2>
          <p className="text-sm text-muted">
            {format(c.hub.honoursLine, {
              trophies: plural(trophies, h.legacy.trophy, h.legacy.trophies),
              awards: plural(awards, h.legacy.award, h.legacy.awards),
            })}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm">
        {format(c.hub.capsLine, {
          caps: plural(caps, h.hub.cap, h.hub.caps),
          goals: plural(goals, h.hub.goal, h.hub.goals),
        })}
      </p>
      <CardLink to="/career/trophies">{h.hub.open}</CardLink>
    </section>
  );
}

function RivalWatch({ world }: { world: World }) {
  const rival = rivalOf(world);
  const lines = seasonLines(world);
  if (!rival || !lines) return null;
  const club = world.clubs[rival.clubId!]!;
  return (
    <section aria-labelledby="rival-watch-heading" className={tile}>
      <h2 id="rival-watch-heading" className={tileHeading}>
        {s.hub.rival}
      </h2>
      <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
        <CrestImage crest={club.crest} alt="" className="h-7 w-7 shrink-0" />
        <span className="min-w-0 break-words">
          {format(s.hub.rivalLine, { rival: rival.name, club: club.name })}
        </span>
      </p>
      <p className="mt-1 text-sm text-muted">
        {format(s.hub.rivalSeason, {
          goals: lines.career.goals,
          rival: rival.name,
          rivalGoals: lines.rival.goals,
        })}
      </p>
      <CardLink to="/career/rival">{s.hub.seeRival}</CardLink>
    </section>
  );
}

/** The inbox in brief, when nothing is unread. */
function InboxTile({ world }: { world: World }) {
  const latest = world.inbox.at(-1);
  return (
    <section aria-labelledby="inbox-tile-heading" data-tour="inbox" className={tile}>
      <h2 id="inbox-tile-heading" className={tileHeading}>
        {m.hub.inbox}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {latest ? messageText(latest).subject : m.inbox.empty}
      </p>
      <CardLink to="/career/inbox">{m.hub.seeAll}</CardLink>
    </section>
  );
}

/** The press in brief, when no question is waiting. */
function PressTile({ world }: { world: World }) {
  const headline = [...world.media].reverse().find((item) => item.kind === 'headline');
  return (
    <section aria-labelledby="press-tile-heading" className={tile}>
      <h2 id="press-tile-heading" className={tileHeading}>
        {s.hub.press}
      </h2>
      <p className="mt-1 text-sm text-muted">{headline ? mediaText(headline) : s.hub.pressNone}</p>
      <CardLink to="/career/media">{s.hub.seeMedia}</CardLink>
    </section>
  );
}

/** The market in brief, when no offer is open. */
function MarketTile({ world }: { world: World }) {
  const state = windowState(world);
  const text =
    world.phase === 'complete'
      ? m.window.between
      : state.open
        ? format(m.window.open, { week: state.closes! })
        : state.opens
          ? format(m.window.opens, { week: state.opens })
          : m.window.closed;
  return (
    <section aria-labelledby="market-tile-heading" className={tile}>
      <h2 id="market-tile-heading" className={tileHeading}>
        {m.hub.market}
      </h2>
      <p className="mt-1 text-sm text-muted">{text}</p>
      <p className="text-sm">
        {format(m.hub.marketBody, { interest: world.scouting.length, offers: 0 })}
      </p>
      <CardLink to="/career/transfers">{m.hub.seeMarket}</CardLink>
    </section>
  );
}

/** Every summary in full, or quiet ones as tiles; the choice lives in the URL. */
function SummariesToggle({ full }: { full: boolean }) {
  const [params, setParams] = useSearchParams();
  return (
    <div className="lg:col-span-12">
      <button
        type="button"
        className="text-button -ml-3"
        aria-pressed={full}
        onClick={() => {
          const next = new URLSearchParams(params);
          if (full) next.delete('summaries');
          else next.set('summaries', 'all');
          setParams(next, { replace: true });
        }}
      >
        {full ? a.summaries.compact : a.summaries.full}
      </button>
    </div>
  );
}
