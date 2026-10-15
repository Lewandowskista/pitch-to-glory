import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Icon } from '../../ui/Icon';
import { Artwork } from '../../ui/Artwork';
import { Dialog } from '../../ui/Dialog';
import {
  Button,
  ButtonLink,
  CardTitle,
  Chip,
  FormGuide,
  HeroPanel,
  KeyHint,
  OverallBadge,
  Panel,
  StatTile,
  cx,
  type MatchResult,
} from '../../ui/kit';
import { CONFIG } from '../../engine/config';
import { fixtureKind, nextCareerFixture, pendingCareerFixture } from '../../engine/career/fixtures';
import { StakeLine } from './stakesUi';
import { lazyPage } from '../../ui/lazyPage';
import { chooseRecovery } from '../../engine/career/training';
import { canAnnounceFarewell, retirementState } from '../../engine/career/honours/retirement';
import { attributeSummary } from '../../engine/strength';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
import { recentResults } from '../../engine/career/social/dressing';
import type { Career, Club, Injury, Player, World } from '../../model/domain';
import { errorText, format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { calendarDate, getSeasonWeeks } from '../../engine/world/calendar';
import { formatGameDate } from '../../i18n/calendar';
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
import { HallOfFameRankLine, HonoursSummary } from './honoursHub';
import { Glyph, ordinal, type GlyphName } from './honoursUi';
import { Tutorial } from '../../ui/Tutorial';
import { agendaText as a } from '../../i18n/agenda';
import {
  advancePreview,
  hubPriorities,
  sinceValue,
  withSave,
  type AdvancePreview,
  type SessionState,
} from './agenda';
import { AdvanceDigest, AdvancePreviewText, HubPriorities } from './HubPriorities';
import { CoachTile } from './CoachAdvice';
import { tutorialText as tt } from '../../i18n/tutorial';

const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;
const RESULT_LETTER: Record<'win' | 'draw' | 'loss', MatchResult> = {
  win: 'W',
  draw: 'D',
  loss: 'L',
};
/** A true minus for negative goal differences. */
const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');

/** Rows of cards: each wraps under its neighbour when the screen is too narrow for both. */
const row = 'flex flex-wrap gap-5';
/** Small summary tiles: two across on phones, a wrapping strip on wider screens. */
const tileClass = (hot = false) =>
  cx(
    'ui-card flex min-w-0 flex-col gap-1 rounded-panel border p-4 shadow-surface sm:flex-[1_1_12.5rem] sm:p-[1.125rem]',
    hot ? 'border-gold bg-art-gold' : 'border-line bg-surface',
  );

/** The one card action style on the hub: a footer link to the card's single destination. */
function CardLink({ to, children, small }: { to: string; children: ReactNode; small?: boolean }) {
  const [params] = useSearchParams();
  return (
    <div className="mt-auto pt-2">
      <Link
        className={cx(
          'text-button -ml-3 inline-flex items-center gap-1',
          small && 'text-[0.8125rem]',
        )}
        to={withSave(to, params.get('save'))}
      >
        {children}
      </Link>
    </div>
  );
}

/** Ambitions rank every player in the world: their code loads after the hub itself. */
const AmbitionsCard = lazyPage(() =>
  import('./ambitionsUi').then((module) => ({ default: module.AmbitionsCard })),
);

/** This week's story, while one is open. */
const StoryCard = lazyPage(() =>
  import('./storyletsUi').then((module) => ({ default: module.StoryCard })),
);
/** The end-of-season review, shown once a season is complete. */
const SeasonReviewPanel = lazyPage(() =>
  import('./reviewUi').then((module) => ({ default: module.SeasonReviewPanel })),
);

/** "Season 2026 · Week 15 of 34", plus what to do first while a recovery choice waits. */
function hubDescription(world: World | null): string | undefined {
  const career = world?.career;
  if (!world || !career) return undefined;
  const weeks = getSeasonWeeks(world);
  const line =
    world.phase === 'complete'
      ? format(c.hub.seasonDone, { season: world.date.season })
      : format(c.hub.seasonWeek, {
          season: world.date.season,
          week: Math.min(world.date.week, weeks),
          weeks,
        });
  return career.injury?.recovery === null && world.phase === 'active'
    ? `${line}. ${c.hub.recoveryFirst}`
    : line;
}

export default function CareerHub() {
  useChallengeRefresh();
  const description = useAppStore((s) => hubDescription(s.world));
  return (
    <CareerPage title={c.titles.hub} description={description}>
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
  // Enter, with nothing focused and no dialog open, takes the hero's action.
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (
        event.key !== 'Enter' ||
        event.repeat ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.target !== document.body ||
        document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]')
      )
        return;
      const action = document.querySelector<HTMLElement>('[data-hub-action]');
      if (!action || action.matches(':disabled, [aria-disabled="true"]')) return;
      event.preventDefault();
      action.click();
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, []);
  // Late in a career the honours card carries the retirement decision, so it stays full size.
  const retirement =
    retirementState(world) !== 'young' ||
    canAnnounceFarewell(world) ||
    career.farewell?.season === world.date.season;
  const priorities = hubPriorities(world, session);
  const preview = advancePreview(world, session);
  // Quiet summaries shrink to tiles; the URL can ask for every summary in full.
  const full = params.get('summaries') === 'all';
  const pressActive =
    full || world.media.some((item) => item.choices.length > 0 && item.answer === null);
  const marketActive =
    full || world.offers.some((offer) => offer.status === 'terms' || offer.status === 'agreed');
  const inboxActive = full || world.inbox.some((message) => !message.read);
  const league = club ? world.leagues[club.leagueId] : undefined;
  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div role="alert" className="inline-error">
          {errorText(error)}
        </div>
      )}
      <p role="status" className="min-h-0 text-sm font-semibold text-accent empty:hidden">
        {notice && notice !== 'generated' ? t.world.notices[notice] : ''}
      </p>
      {/* Phones read in order: the match, what needs you, you, your last game, then the rest. */}
      <div className={row}>
        <NextMatch
          world={world}
          career={career}
          player={player}
          club={club}
          preview={preview}
          className="flex-[2_1_35rem]"
        />
        <HubPriorities world={world} items={priorities} className="flex-[1_1_18.75rem]" />
      </div>
      {/* The week's story follows the match, so the next action stays in the first view. */}
      {career.stories?.some((story) => story.status !== 'resolved') && (
        <Suspense fallback={null}>
          <StoryCard world={world} />
        </Suspense>
      )}
      <AdvanceDigest world={world} />
      <div className={row}>
        <PlayerCard
          world={world}
          career={career}
          player={player}
          club={club}
          age={age}
          className="flex-[1.25_1_21.25rem]"
        />
        <LastResult world={world} career={career} club={club} className="flex-[1_1_17.5rem]" />
        <SeasonStats
          world={world}
          career={career}
          player={player}
          className="flex-[1_1_16.25rem] max-sm:hidden"
        />
      </div>
      {/* Two independent stacks, so a tall card never leaves a hole beside a short one: your
          condition, the table and your ambitions; then your club and the rivalry. */}
      <div className={cx(row, 'items-start')}>
        <div className="flex min-w-0 flex-[2_1_35rem] flex-col gap-5">
          <Condition world={world} career={career} player={player} />
          {club && league && <LeagueTable world={world} club={club} />}
          <Suspense fallback={<div aria-hidden="true" className={`${ui.panel} min-h-[16rem]`} />}>
            <AmbitionsCard world={world} />
          </Suspense>
        </div>
        <div className="flex min-w-0 flex-[1_1_17.5rem] flex-col gap-5">
          <ClubStanding world={world} club={club} />
          <RivalCard world={world} player={player} club={club} age={age} />
        </div>
      </div>
      {world.phase === 'complete' && (
        <Suspense fallback={null}>
          <SeasonReviewPanel world={world} />
        </Suspense>
      )}
      {retirement && <HonoursSummary world={world} className="" />}
      {(inboxActive || pressActive || marketActive) && (
        <div className={row}>
          {inboxActive && <InboxPreview world={world} />}
          {pressActive && <PressRoom world={world} />}
          {marketActive && <MarketSummary world={world} />}
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        <h2 className="font-display text-[1.75rem] leading-none sm:sr-only">{c.hub.tiles}</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:gap-4">
          {!inboxActive && <InboxTile world={world} />}
          {!pressActive && <PressTile world={world} />}
          {!marketActive && <MarketTile world={world} />}
          <TrainingSummary career={career} />
          <CoachTile world={world} className={tileClass()} />
          <FameSummary world={world} />
          {!retirement && <HonoursTile world={world} />}
        </div>
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

/** One side of the next fixture: crest, name, venue and place, and the last five results. */
function FixtureSide({
  world,
  side,
  own,
  venue,
}: {
  world: World;
  side: Club;
  own: boolean;
  venue: string | null;
}) {
  const standing = leaguePosition(world, side.id);
  const form = recentResults(world, side.id, 5).map((result) => RESULT_LETTER[result]);
  const facts = [
    own ? null : venue,
    standing
      ? format(c.hub.standing, { rank: ordinal(standing.rank), points: standing.points })
      : null,
  ].filter(Boolean);
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:gap-2.5">
      <CrestImage crest={side.crest} alt="" className="h-[3.94rem] w-14 sm:h-[7.875rem] sm:w-28" />
      <p className="font-display text-[1.375rem] leading-none break-words sm:text-4xl">
        {side.name}
      </p>
      <p className="text-xs text-hero-muted sm:text-[0.8125rem]">
        {own && (
          <span className="text-[0.6875rem] font-extrabold tracking-[0.08em] text-gold uppercase">
            {c.hub.club}
          </span>
        )}
        {own && facts.length > 0 && ' · '}
        {facts.join(' · ')}
      </p>
      {form.length > 0 && (
        <FormGuide
          results={form}
          label={format(c.hub.formOf, { club: side.name })}
          onHero
          className="max-sm:hidden"
        />
      )}
    </div>
  );
}

function NextMatch({
  world,
  career,
  player,
  club,
  preview,
  className,
}: {
  world: World;
  career: Career;
  player: Player;
  club: Club | undefined;
  preview: AdvancePreview;
  className?: string;
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
  const injury = career.injury;
  const awaitingRecovery = Boolean(injury && injury.recovery === null);
  const complete = world.phase === 'complete';
  const busy = Boolean(job);
  const save = params.get('save');
  const action = session ? (
    <ButtonLink
      variant="play"
      size="lg"
      className="max-sm:w-full"
      to="/match"
      iconEnd="arrow"
      data-hub-action=""
    >
      {session.state.match.status === 'finished' ? c.hub.record : c.hub.resume}
    </ButtonLink>
  ) : complete ? (
    <Button
      variant="play"
      size="lg"
      className="max-sm:w-full"
      iconEnd="arrow"
      disabled={busy}
      onClick={startNextCareerSeason}
      data-hub-action=""
    >
      {c.hub.nextSeason}
    </Button>
  ) : pending ? (
    <ButtonLink
      variant="play"
      size="lg"
      className="max-sm:w-full"
      to="/match"
      iconEnd="ball"
      data-tour="continue"
      data-hub-action=""
    >
      {c.hub.play}
    </ButtonLink>
  ) : awaitingRecovery ? (
    <ButtonLink
      variant="play"
      size="lg"
      className="max-sm:w-full"
      to={{ search: save ? `?save=${save}` : '', hash: '#recovery' }}
      iconEnd="arrow"
      data-tour="continue"
      data-hub-action=""
    >
      {a.priorities.kinds.recovery}
    </ButtonLink>
  ) : (
    <Button
      variant="play"
      size="lg"
      className="max-sm:w-full"
      iconEnd="arrow"
      disabled={busy}
      data-tour="continue"
      data-hub-action=""
      onClick={() => advance(continueToMatchday)}
    >
      {fixture ? c.hub.continue : c.hub.continueSeason}
    </Button>
  );
  // The eyebrow says what the card is about now; its heading always names the card.
  const eyebrow = complete ? c.hub.seasonComplete : pending ? c.hub.matchday : null;
  const eyebrowClass = 'text-xs font-extrabold tracking-[0.14em] text-gold uppercase';
  const homeSide = fixture ? world.clubs[fixture.homeId] : undefined;
  const awaySide = fixture ? world.clubs[fixture.awayId] : undefined;
  const venueName = fixture?.neutral ? null : homeSide?.stadium?.name;
  const enter = c.hub.enterHint.split('{key}');
  return (
    <HeroPanel
      markings
      aria-labelledby="next-match-heading"
      data-tour="next-match"
      className={cx('shadow-surface', className)}
    >
      <div className="flex flex-col gap-3.5 sm:gap-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="next-match-heading" className={eyebrow ? 'sr-only' : eyebrowClass}>
              {c.hub.nextMatch}
            </h2>
            {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
            {kind && !complete && (
              <span className="rounded-full bg-[rgb(255_247_228/0.14)] px-2.5 py-0.5 text-xs font-semibold">
                {c.hub.importance[kind]}
              </span>
            )}
          </div>
          {fixture && !complete && (
            <p className="text-[0.8125rem] text-hero-muted">
              {[
                formatGameDate(
                  calendarDate(fixture.date.season, fixture.date.week, fixture.date.day),
                ),
                venueName,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        {complete ? (
          <div>
            <p className="font-display text-[2.6rem] leading-none">{c.hub.seasonComplete}</p>
            <p className="mt-2 max-w-prose text-sm text-hero-muted">{c.hub.seasonCompleteBody}</p>
          </div>
        ) : fixture && homeSide && awaySide && club ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-7">
            <FixtureSide
              world={world}
              side={homeSide}
              own={homeSide.id === club.id}
              venue={fixture.neutral ? null : c.hub.sideHome}
            />
            <span
              aria-hidden="true"
              className="self-center pb-6 font-display text-[2.75rem] leading-[0.8] text-gold sm:pb-9 sm:text-[4rem]"
            >
              {c.common.vs.toUpperCase()}
            </span>
            <FixtureSide
              world={world}
              side={awaySide}
              own={awaySide.id === club.id}
              venue={fixture.neutral ? null : c.hub.sideAway}
            />
          </div>
        ) : (
          <div>
            <p className="font-display text-[2.2rem] leading-none">{c.hub.noFixture}</p>
            <p className="mt-2 max-w-prose text-sm text-hero-muted">{c.hub.noFixtureBody}</p>
          </div>
        )}
        {fixture && !complete && opponent && (
          <p className="text-sm text-hero-muted">
            {format(c.hub.fixtureMeta, {
              week: fixture.date.week,
              competition: competitionName(world, fixture.competitionId),
              venue: fixture.neutral ? c.common.neutral : home ? c.common.home : c.common.away,
            })}
          </p>
        )}
        {fixture && !complete && <StakeLine world={world} fixture={fixture} />}
        {pending && !session && (
          <p className="max-w-prose text-sm text-hero-muted max-sm:order-1">{c.hub.matchdayBody}</p>
        )}
        {awaitingRecovery && injury && !session && (
          <div className="flex items-start gap-3 rounded-control bg-black/25 px-4 py-3.5 max-sm:order-1">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-danger text-on-danger"
            >
              <Glyph name="injury" />
            </span>
            <div className="min-w-0">
              <p className="font-bold">
                {format(injury.weeksRemaining === 1 ? c.hub.injuredHeroOne : c.hub.injuredHero, {
                  weeks: injury.weeksRemaining,
                  injury: c.injuries[injury.kind as keyof typeof c.injuries] ?? injury.kind,
                })}
              </p>
              <p className="text-[0.8125rem] text-hero-muted">{a.preview.recovery}</p>
            </div>
          </div>
        )}
        {!session && (
          <div className="max-sm:order-1">
            <AdvancePreviewText world={world} preview={preview} />
          </div>
        )}
        <HeroCondition career={career} player={player} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {action}
          {!complete && !session && !awaitingRecovery && (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-semibold text-hero-ink underline underline-offset-4 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
              disabled={busy}
              onClick={() => dialog.open('autoplay')}
            >
              {c.hub.simulateSeason}
            </button>
          )}
          {awaitingRecovery && !session && (
            <span className="text-xs text-hero-muted">{c.hub.recoveryPaused}</span>
          )}
          {!busy && (
            <span className="ml-auto text-xs text-hero-muted max-sm:hidden">
              {enter[0]}
              <KeyHint keys={c.hub.enterKey} onHero />
              {enter[1]}
            </span>
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
    </HeroPanel>
  );
}

/**
 * Phones: level and condition in the match card, just above its action, so fatigue can be
 * checked before playing. Wider screens show the Condition card beside it instead.
 */
function HeroCondition({ career, player }: { career: Career; player: Player }) {
  const values: [string, number, boolean][] = [
    [c.common.meters.fitness, player.fitness, player.fitness < 70],
    [c.common.meters.fatigue, player.fatigue, player.fatigue > 60],
    [c.common.meters.form, player.form, false],
    [c.common.meters.morale, player.morale, false],
  ];
  return (
    <div className="rounded-control bg-black/25 px-3 py-2.5 sm:hidden">
      <p className="text-xs font-bold text-gold">
        {format(c.common.level, { level: career.level })}
        {career.injury && ` · ${c.hub.injury}`}
      </p>
      <dl className="mt-1.5 grid grid-cols-4 gap-2">
        {values.map(([label, value, warn]) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-xs text-hero-muted">{label}</dt>
            <dd className={cx('font-display text-xl leading-none', warn && 'text-gold')}>
              {Math.round(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
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
  const [params] = useSearchParams();
  return (
    <Link
      to={withSave(to, params.get('save'))}
      className={cx(
        'flex min-h-11 items-center justify-between gap-3 rounded-control px-4 text-sm font-bold transition-colors',
        count
          ? 'border-2 border-gold bg-art-gold text-ink hover:bg-gold hover:text-on-gold'
          : 'border border-line bg-surface-soft font-semibold text-muted hover:text-ink',
      )}
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
  world,
  career,
  player,
  club,
  age,
  className,
}: {
  world: World;
  career: Career;
  player: Player;
  club: Club | undefined;
  age: number;
  className?: string;
}) {
  const axes = useMemo(() => attributeSummary(player), [player]);
  const line = seasonLine(career, world.date.season);
  const keeper = player.primaryPosition === 'GK';
  const short = c.profile.axesShort as Record<string, string>;
  const long = c.profile.axes as Record<string, string>;
  const season: [string, string | number][] = [
    [c.hub.seasonShort.apps, line.apps],
    [c.hub.seasonShort.goals, line.goals],
    keeper
      ? [c.hub.seasonShort.cleanSheets, line.cleanSheets]
      : [c.hub.seasonShort.assists, line.assists],
    [c.hub.seasonShort.rating, line.apps ? line.rating.toFixed(1) : '–'],
  ];
  return (
    <Panel
      aria-labelledby="player-card-heading"
      data-tour="player-card"
      className={cx('@container flex flex-col gap-4', className)}
    >
      <div className="flex items-center gap-3.5 sm:gap-4">
        <PlayerPortrait
          player={player}
          age={age}
          club={club}
          className="h-16 w-16 shrink-0 sm:h-[7.5rem] sm:w-[7.5rem]"
        />
        <div className="min-w-0 flex-1">
          <h2
            id="player-card-heading"
            className="font-display text-[1.75rem] leading-[0.95] break-words sm:text-[2.375rem]"
          >
            {player.name}
          </h2>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {format(c.hub.playerLine, {
              position: c.positions[player.primaryPosition] ?? player.primaryPosition,
              age,
              foot: c.feet[player.foot],
            })}
          </p>
          {club && (
            <p className="mt-2 flex items-center gap-2 text-[0.8125rem] font-semibold">
              <CrestImage crest={club.crest} alt="" className="h-[1.4rem] w-5 shrink-0" />
              <span className="min-w-0 break-words">{club.name}</span>
            </p>
          )}
        </div>
        <OverallBadge
          player={player}
          size="md"
          className="max-sm:h-14 max-sm:w-[3.125rem] max-sm:text-[1.75rem]"
        />
      </div>
      <XpBar career={career} />
      <div
        role="group"
        aria-label={c.hub.axesLabel}
        className="grid grid-cols-3 gap-2 max-sm:hidden @min-[24rem]:grid-cols-6"
      >
        {axes.map((axis) => (
          <StatTile
            key={axis.axis}
            size="sm"
            valueFirst
            label={
              <>
                <span aria-hidden="true">{short[axis.axis]}</span>
                <span className="sr-only">{long[axis.axis]}</span>
              </>
            }
            value={axis.value}
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:hidden">
        {season.map(([label, value]) => (
          <StatTile key={label} size="sm" valueFirst label={label} value={value} />
        ))}
      </div>
      <div className="grid gap-2">
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
    </Panel>
  );
}

function LastResult({
  world,
  career,
  club,
  className,
}: {
  world: World;
  career: Career;
  club: Club | undefined;
  className?: string;
}) {
  const last = career.matches.at(-1);
  const form = recentForm(career).map((record) => RESULT_LETTER[record.result]);
  const opponent = last ? world.clubs[last.opponentId] : undefined;
  const ownClub = last ? (clubAt(world, career, last.fixtureId) ?? club) : undefined;
  const headline = last
    ? world.media
        .filter(
          (item) =>
            item.kind === 'headline' &&
            item.date.season === last.season &&
            item.date.week === last.week,
        )
        .at(-1)
    : undefined;
  const own = { club: ownClub, goals: last?.score[0] ?? 0 };
  const their = { club: opponent, goals: last?.score[1] ?? 0 };
  const [left, right] = last?.home === false ? [their, own] : [own, their];
  return (
    <Panel aria-labelledby="last-result-heading" className={cx('flex flex-col gap-3.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle id="last-result-heading">{c.hub.lastResult}</CardTitle>
        {last && (
          <span className="shrink-0 text-xs font-semibold text-muted">
            {format(c.hub.lastMeta, {
              week: last.week,
              venue: last.home ? c.common.home : c.common.away,
            })}
          </span>
        )}
      </div>
      {last ? (
        <>
          <p className="sr-only">
            {format(c.hub.resultLine[last.result], {
              score: `${last.score[0]}–${last.score[1]}`,
              opponent: opponent?.name ?? last.opponentId,
            })}
            {last.decided ? ` (${c.hub.decidedLong[last.decided]})` : ''} ·{' '}
            {competitionName(world, last.competitionId)}
          </p>
          <div
            aria-hidden="true"
            className="flex items-center justify-between gap-2 rounded-control bg-surface-soft px-3 py-3.5"
          >
            <ResultSide club={left.club} />
            <div className="text-center">
              <p className="font-display text-5xl leading-[0.9] tabular-nums">
                {left.goals} – {right.goals}
              </p>
              <p className="text-[0.6875rem] font-extrabold tracking-[0.1em] text-muted uppercase">
                {last.decided ? c.hub.decidedLong[last.decided] : c.hub.fullTime}
              </p>
            </div>
            <ResultSide club={right.club} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip tone="accent">
              {format(c.hub.yourRating, { rating: last.rating.toFixed(1) })}
            </Chip>
            {last.goals > 0 && (
              <Chip tone="gold-soft">{plural(last.goals, c.hub.goal, c.hub.goals)}</Chip>
            )}
            {last.assists > 0 && (
              <Chip tone="gold-soft">{plural(last.assists, c.hub.assist, c.hub.assists)}</Chip>
            )}
            {last.cleanSheet && <Chip tone="accent">{c.hub.cleanSheet}</Chip>}
            <Chip tone="neutral">{format(c.hub.xpChip, { xp: last.xp })}</Chip>
          </div>
          {headline && (
            <blockquote className="text-sm text-muted">
              <p>“{mediaText(headline)}”</p>
              <footer className="mt-0.5 text-xs font-semibold">
                {format(c.hub.headlineBy, { outlet: headline.authorName })}
              </footer>
            </blockquote>
          )}
          {form.length > 1 && (
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
              <h3 className="text-[0.8125rem] font-semibold text-muted">{c.hub.form}</h3>
              <FormGuide results={form} label={c.hub.form} size="md" />
            </div>
          )}
        </>
      ) : (
        <p className={ui.muted}>{c.hub.noMatches}</p>
      )}
    </Panel>
  );
}

/** The club the player represented in a fixture (a move since then keeps the old badge). */
function clubAt(world: World, career: Career, fixtureId: string): Club | undefined {
  const fixture = world.fixtures[fixtureId];
  const record = career.matches.find((match) => match.fixtureId === fixtureId);
  if (!fixture || !record) return undefined;
  return world.clubs[record.home ? fixture.homeId : fixture.awayId];
}

function ResultSide({ club }: { club: Club | undefined }) {
  return (
    <div className="flex w-20 min-w-0 flex-col items-center gap-1.5 text-center">
      {club && <CrestImage crest={club.crest} alt="" className="h-[3.1rem] w-11" />}
      <span className="w-full truncate text-xs font-semibold">{club?.name ?? ''}</span>
    </div>
  );
}

function SeasonStats({
  world,
  career,
  player,
  className,
}: {
  world: World;
  career: Career;
  player: Player;
  className?: string;
}) {
  const line = seasonLine(career, world.date.season);
  const league = leagueSeasonLine(world, career, world.date.season);
  const keeper = player.primaryPosition === 'GK';
  const stats: [string, string | number][] = [
    [c.hub.stats.apps, line.apps],
    [c.hub.stats.goals, line.goals],
    keeper ? [c.hub.stats.cleanSheets, line.cleanSheets] : [c.hub.stats.assists, line.assists],
    [c.hub.stats.rating, line.apps ? line.rating.toFixed(1) : '–'],
  ];
  return (
    <Panel
      aria-labelledby="season-stats-heading"
      className={cx('flex flex-col gap-3.5', className)}
    >
      <div>
        <CardTitle id="season-stats-heading">
          {format(c.hub.season, { season: world.date.season })}
        </CardTitle>
        <p className="text-xs text-muted">{c.hub.scope}</p>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2.5">
        {stats.map(([label, value]) => (
          <StatTile key={label} label={label} value={value} />
        ))}
      </div>
      {league.apps > 0 && (
        <p className="text-[0.8125rem] text-muted">
          {format(c.hub.leagueLine, {
            goals: plural(league.goals, c.hub.goal, c.hub.goals),
            assists: plural(league.assists, c.hub.assist, c.hub.assists),
            apps: plural(league.apps, c.hub.game, c.hub.games),
          })}
        </p>
      )}
    </Panel>
  );
}

const tableLink = (club: Club, tier: number, leagueId: string) =>
  `/world?country=${encodeURIComponent(club.countryId)}&tier=${tier}&group=${encodeURIComponent(leagueId)}&club=${encodeURIComponent(club.id)}`;

function ClubStanding({
  world,
  club,
  className,
}: {
  world: World;
  club: Club | undefined;
  className?: string;
}) {
  const standing = club ? leaguePosition(world, club.id) : null;
  const league = club ? world.leagues[club.leagueId] : undefined;
  return (
    <Panel aria-labelledby="club-heading" className={cx('flex flex-col gap-4', className)}>
      <CardTitle id="club-heading">{c.hub.club}</CardTitle>
      {club ? (
        <>
          <div className="flex items-center gap-3.5">
            <CrestImage crest={club.crest} alt="" className="h-[3.9rem] w-14 shrink-0" />
            <div className="min-w-0">
              <p className="font-bold break-words">{club.name}</p>
              <p className="text-xs break-words text-muted">{league?.name}</p>
            </div>
          </div>
          {standing ? (
            <div className="rounded-control bg-surface-soft p-4">
              <p className="text-xs font-semibold text-muted">{c.hub.position}</p>
              <p className="font-display text-[2.75rem] leading-none">
                {format(c.hub.positionValue, { rank: standing.rank, total: standing.total })}
              </p>
              <p className="text-[0.8125rem] text-muted">
                {format(c.hub.points_, { points: standing.points, played: standing.played })}
              </p>
            </div>
          ) : (
            <p className={ui.muted}>{c.hub.noLeague}</p>
          )}
          {league && (
            <CardLink to={tableLink(club, league.tier, league.id)}>{c.hub.viewTable}</CardLink>
          )}
        </>
      ) : (
        <p className={ui.muted}>{c.common.unknownClub}</p>
      )}
    </Panel>
  );
}

/** The club's place in its table with two neighbours either side. */
function LeagueTable({ world, club, className }: { world: World; club: Club; className?: string }) {
  const [params] = useSearchParams();
  const league = world.leagues[club.leagueId]!;
  const rows = league.standings;
  const index = rows.findIndex((entry) => entry.clubId === club.id);
  if (index < 0 || rows.length === 0) return null;
  const start = Math.max(0, Math.min(index - 2, rows.length - 5));
  const shown = rows.slice(start, start + 5);
  const T = c.hub.table;
  const head = (key: keyof typeof T.names, wide = true) => (
    <th scope="col" className={cx('px-2 py-2 text-right font-semibold', !wide && 'max-sm:hidden')}>
      <abbr title={T.names[key]} className="no-underline">
        {T.columns[key]}
      </abbr>
    </th>
  );
  return (
    <Panel aria-labelledby="league-table-heading" className={cx('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <CardTitle id="league-table-heading">{league.name}</CardTitle>
        <Link
          className="text-button -mr-3"
          to={withSave(tableLink(club, league.tier, league.id), params.get('save'))}
        >
          {T.fullTable}
        </Link>
      </div>
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="sr-only">{format(T.caption, { league: league.name })}</caption>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="px-2 py-2 font-semibold">
              <abbr title={T.names.pos} className="no-underline">
                {T.columns.pos}
              </abbr>
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              {T.columns.club}
            </th>
            {head('p')}
            {head('w', false)}
            {head('d', false)}
            {head('l', false)}
            {head('gd')}
            {head('pts')}
          </tr>
        </thead>
        <tbody>
          {shown.map((entry, offset) => {
            const you = entry.clubId === club.id;
            const side = world.clubs[entry.clubId];
            const cell = 'px-2 py-2.5 text-right';
            return (
              <tr
                key={entry.clubId}
                className={you ? 'bg-accent-soft text-accent' : 'border-b border-line/60'}
              >
                <td className={cx('rounded-l-control px-2 py-2.5 font-bold')}>
                  {start + offset + 1}
                </td>
                <th scope="row" className="px-2 py-1.5 text-left font-semibold">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {side && (
                      <CrestImage crest={side.crest} alt="" className="h-[1.7rem] w-6 shrink-0" />
                    )}
                    <span className="min-w-0 break-words">{side?.name ?? entry.clubId}</span>
                    {you && (
                      <span className="shrink-0 rounded-full bg-accent px-2 text-[0.6875rem] font-extrabold text-on-accent">
                        {T.you}
                      </span>
                    )}
                  </span>
                </th>
                <td className={cell}>{entry.played}</td>
                <td className={cx(cell, 'max-sm:hidden')}>{entry.won}</td>
                <td className={cx(cell, 'max-sm:hidden')}>{entry.drawn}</td>
                <td className={cx(cell, 'max-sm:hidden')}>{entry.lost}</td>
                <td className={cell}>{signed(entry.goalsFor - entry.goalsAgainst)}</td>
                <td className={cx(cell, 'rounded-r-control font-extrabold')}>{entry.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

/** A small decorative bust (the name is written beside it). */
function Bust({ player, club, age }: { player: Player; club?: Club | null; age: number }) {
  const svg = useMemo(
    () => renderAvatar(player.avatar, age, clubDress(club)),
    [player.avatar, age, club],
  );
  return <Artwork svg={svg} alt="" className="h-16 w-16" />;
}

/** This season, side by side with the rival: goals, assists and the average rating. */
function RivalCard({
  world,
  player,
  club,
  age,
}: {
  world: World;
  player: Player;
  club: Club | undefined;
  age: number;
}) {
  const rival = rivalOf(world);
  const lines = seasonLines(world);
  if (!rival || !lines) return null;
  const rivalClub = rival.clubId ? world.clubs[rival.clubId] : undefined;
  const surname = (name: string) => name.split(' ').slice(-1)[0] ?? name;
  const R = c.hub.rival;
  const rows: [string, number, number, string, string][] = [
    [
      R.goals,
      lines.career.goals,
      lines.rival.goals,
      String(lines.career.goals),
      String(lines.rival.goals),
    ],
    [
      R.assists,
      lines.career.assists,
      lines.rival.assists,
      String(lines.career.assists),
      String(lines.rival.assists),
    ],
    [
      R.rating,
      lines.career.rating,
      lines.rival.rating,
      lines.career.appearances ? lines.career.rating.toFixed(1) : '–',
      lines.rival.appearances ? lines.rival.rating.toFixed(1) : '–',
    ],
  ];
  return (
    <Panel aria-labelledby="rival-card-heading" className="flex flex-col gap-3.5">
      <CardTitle id="rival-card-heading">{R.title}</CardTitle>
      <div aria-hidden="true" className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          <Bust player={player} club={club} age={age} />
          <span className="max-w-full truncate text-[0.8125rem] font-bold">
            {surname(player.name)}
          </span>
        </div>
        <span className="font-display text-[1.75rem] text-muted">{c.common.vs.toUpperCase()}</span>
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          <Bust player={rival} club={rivalClub} age={world.date.season - rival.birthSeason} />
          <span className="max-w-full truncate text-[0.8125rem] font-bold">
            {surname(rival.name)}
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map(([label, you, theirs, youText, theirText]) => {
          const total = you + theirs;
          const share = total > 0 ? Math.round((you / total) * 100) : 50;
          return (
            <li key={label} className="flex flex-col gap-1">
              <span className="sr-only">
                {format(R.spoken, { label, you: youText, rival: rival.name, theirs: theirText })}
              </span>
              <span aria-hidden="true" className="flex justify-between text-[0.8125rem]">
                <span className="font-extrabold">{youText}</span>
                <span className="text-muted">{label}</span>
                <span className="font-extrabold">{theirText}</span>
              </span>
              <span aria-hidden="true" className="flex h-2 gap-[3px]">
                <span className="rounded-full bg-accent" style={{ flex: `${share} 1 0` }} />
                <span className="rounded-full bg-info" style={{ flex: `${100 - share} 1 0` }} />
              </span>
            </li>
          );
        })}
      </ul>
      {rivalClub && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <CrestImage crest={rivalClub.crest} alt="" className="h-5 w-[1.1rem] shrink-0" />
          {format(s.hub.rivalLine, { rival: rival.name, club: rivalClub.name })}
        </p>
      )}
      <CardLink to="/career/rival">{s.hub.seeRival}</CardLink>
    </Panel>
  );
}

/** A weekly change in form or morale, from the stored history. */
function trendNote(world: World, key: 'form' | 'morale', current: number): string | null {
  const history = world.career!.social.history;
  const { season, week } = world.date;
  const previous = [...history]
    .reverse()
    .find((point) => point.season < season || (point.season === season && point.week < week));
  if (!previous) return null;
  const change = Math.round(current - previous[key]);
  return change > 0
    ? format(c.hub.conditionNote.up, { value: change })
    : change < 0
      ? format(c.hub.conditionNote.down, { value: -change })
      : c.hub.conditionNote.steady;
}

function Condition({
  world,
  career,
  player,
  className,
}: {
  world: World;
  career: Career;
  player: Player;
  className?: string;
}) {
  const injury = career.injury;
  const meters: [string, number, 'accent' | 'gold' | 'danger', string | null][] = [
    [c.common.meters.form, player.form, 'accent', trendNote(world, 'form', player.form)],
    [c.common.meters.morale, player.morale, 'accent', trendNote(world, 'morale', player.morale)],
    [c.common.meters.fitness, player.fitness, player.fitness < 70 ? 'danger' : 'accent', null],
    [
      c.common.meters.fatigue,
      player.fatigue,
      player.fatigue > 60 ? 'danger' : 'gold',
      format(c.hub.conditionNote.fatigue, { value: 60 }),
    ],
  ];
  return (
    <Panel
      aria-labelledby="condition-heading"
      // Phones carry the four values in the match card; the card returns for an injury.
      className={cx(
        'flex flex-col gap-4',
        !injury && !career.reinjury && 'max-sm:hidden',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle id="condition-heading">{c.hub.condition}</CardTitle>
        {injury && <Chip tone="danger">{c.hub.injuredStatus}</Chip>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13.75rem),1fr))] gap-x-7 gap-y-3.5">
        {meters.map(([label, value, tone, note]) => (
          <div key={label}>
            <Meter label={label} value={value} tone={tone} />
            {note && <p className="mt-1 text-xs text-muted">{note}</p>}
          </div>
        ))}
      </div>
      {injury && <InjuryBox world={world} injury={injury} />}
      {!injury && career.reinjury && (
        <p className="flex items-center gap-2 text-sm font-semibold text-danger">
          <Icon name="warning" className="h-4 w-4 shrink-0" />
          {format(c.hub.reinjury, {
            risk: Math.round(career.reinjury.risk * 100),
            weeks: career.reinjury.weeks,
          })}
        </p>
      )}
    </Panel>
  );
}

/** Club fixtures still to play before a given week. */
function matchesBefore(world: World, week: number): number {
  const clubId = world.players[world.career!.playerId]?.clubId;
  return Object.values(world.fixtures).filter(
    (fixture) =>
      (fixture.homeId === clubId || fixture.awayId === clubId) &&
      fixture.date.season === world.date.season &&
      fixture.date.week >= world.date.week &&
      fixture.date.week < week &&
      !world.results[fixture.id],
  ).length;
}

function InjuryBox({ world, injury }: { world: World; injury: Injury }) {
  const block = useEditBlock();
  const I = CONFIG.career.injuries;
  const rushWeeks = Math.max(1, Math.ceil(injury.weeksRemaining * I.rush.durationFactor));
  const risk = Math.round(I.rush.reinjuryPerSeverity * injury.severity * 100);
  const back = world.date.week + injury.weeksRemaining;
  const choose = (recovery: 'rehab' | 'rush') => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    useAppStore.getState().setWorld(chooseRecovery(current, recovery));
  };
  const misses = (week: number) => {
    const count = matchesBefore(world, week);
    return count === 0
      ? c.hub.missesNone
      : count === 1
        ? c.hub.missesOne
        : format(c.hub.misses, { count });
  };
  const fact = 'rounded-full bg-surface-soft px-2.5 py-0.5';
  const choice =
    'flex min-h-11 flex-col items-start gap-2 rounded-control bg-surface p-4 text-left transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60';
  return (
    <div className="flex flex-col gap-1 rounded-control border border-danger/40 bg-danger-soft p-4 sm:p-[1.125rem]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-extrabold text-danger">{c.hub.injury}</p>
          <p className="mt-0.5 font-display text-[2rem] leading-none">
            {c.injuries[injury.kind as keyof typeof c.injuries] ?? injury.kind}
          </p>
          <p className="mt-1 text-sm">
            {injury.weeksRemaining === 1
              ? c.hub.injuryOutOne
              : format(c.hub.injuryOut, { weeks: injury.weeksRemaining })}{' '}
            · {c.injuryCause[injury.cause]}
          </p>
        </div>
        {world.phase === 'active' && (
          <span className="rounded-full border border-danger/40 bg-surface px-3 py-1 text-xs font-extrabold text-danger">
            {format(c.hub.backInWeek, { week: back })}
          </span>
        )}
      </div>
      {injury.careerThreatening && (
        <p className="mt-2 text-sm font-semibold text-danger">{c.hub.injuryThreatening}</p>
      )}
      {injury.recovery === null ? (
        <fieldset id="recovery" className="mt-3.5 min-w-0 scroll-mt-24">
          <legend className="text-sm font-extrabold">{c.hub.recoveryTitle}</legend>
          {block && <p className="mt-1 text-xs text-muted">{block}</p>}
          <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-2.5">
            <button
              type="button"
              className={cx(choice, 'border-2 border-accent')}
              disabled={Boolean(block)}
              onClick={() => choose('rehab')}
            >
              <span className="flex w-full items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
                >
                  <Icon name="club" className="h-4 w-4" />
                </span>
                <strong className="text-[0.9375rem]">{c.hub.rehab}</strong>
                <span className="ml-auto rounded-full bg-accent-soft px-2 text-[0.6875rem] font-extrabold text-accent">
                  {c.hub.safer}
                </span>
              </span>
              <span className="text-[0.8125rem] text-muted">
                {format(c.hub.rehabBody, { weeks: injury.weeksRemaining })}
              </span>
              <span className="flex flex-wrap gap-1.5 text-xs font-bold">
                <span className={fact}>{format(c.hub.backChip, { week: back })}</span>
                <span className={fact}>{misses(back)}</span>
              </span>
            </button>
            <button
              type="button"
              className={cx(choice, 'border border-line')}
              disabled={Boolean(block)}
              onClick={() => choose('rush')}
            >
              <span className="flex w-full items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-art-gold text-gold-ink"
                >
                  <Glyph name="rival" className="h-4 w-4" />
                </span>
                <strong className="text-[0.9375rem]">{c.hub.rush}</strong>
                <span className="ml-auto rounded-full bg-art-gold px-2 text-[0.6875rem] font-extrabold text-gold-ink">
                  {c.hub.faster}
                </span>
              </span>
              <span className="text-[0.8125rem] text-muted">
                {format(c.hub.rushBody, { weeks: rushWeeks, risk })}
              </span>
              <span className="flex flex-wrap gap-1.5 text-xs font-bold">
                <span className={fact}>
                  {format(c.hub.backChip, { week: world.date.week + rushWeeks })}
                </span>
                <span className={fact}>{misses(world.date.week + rushWeeks)}</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-danger">
                <Icon name="warning" className="h-3.5 w-3.5 shrink-0" />
                {format(c.hub.riskLine, { risk })}
              </span>
            </button>
          </div>
        </fieldset>
      ) : (
        <p className="mt-2 text-[0.8125rem] font-bold">
          {format(c.hub.recoveryChosen[injury.recovery], {
            risk: Math.round(injury.reinjuryRisk * 100),
          })}
        </p>
      )}
    </div>
  );
}

const fullCard = 'flex flex-[1_1_18.75rem] flex-col gap-3';

function InboxPreview({ world }: { world: World }) {
  const [params] = useSearchParams();
  const latest = [...world.inbox].reverse().slice(0, 4);
  return (
    <Panel aria-labelledby="inbox-preview-heading" data-tour="inbox" className={fullCard}>
      <CardTitle id="inbox-preview-heading">{m.hub.inbox}</CardTitle>
      {latest.length ? (
        <ul className="-mx-3 grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {latest.map((message) => (
            <li key={message.id}>
              <Link
                to={withSave(
                  `/career/inbox?message=${encodeURIComponent(message.id)}`,
                  params.get('save'),
                )}
                className="flex min-h-11 items-start gap-3 rounded-control px-3 py-2 transition-colors hover:bg-surface-soft"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                    message.read ? 'bg-line' : 'bg-accent',
                  )}
                />
                <span
                  className={cx(
                    'min-w-0 flex-1 text-sm line-clamp-2',
                    message.read ? 'font-medium' : 'font-extrabold',
                  )}
                >
                  {messageText(message).subject}
                  {!message.read && (
                    <span className="sr-only"> · {format(m.inbox.unread, { count: 1 })}</span>
                  )}
                </span>
                <span className="mt-px shrink-0 text-xs text-muted">
                  {format(c.common.week, { week: message.date.week })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={ui.muted}>{m.inbox.empty}</p>
      )}
      <CardLink to="/career/inbox">{m.hub.seeAll}</CardLink>
    </Panel>
  );
}

function PressRoom({ world }: { world: World }) {
  const [params] = useSearchParams();
  const pending = world.media.find((item) => item.choices.length > 0 && item.answer === null);
  const headline = [...world.media].reverse().find((item) => item.kind === 'headline');
  return (
    <Panel
      aria-labelledby="press-room-heading"
      className={cx(fullCard, pending && 'border-2 border-gold')}
    >
      <CardTitle id="press-room-heading">{s.hub.press}</CardTitle>
      {pending ? (
        <>
          <p className="text-[0.8125rem] font-bold text-accent">
            {format(s.hub.pressWaiting, { outlet: pending.authorName })}
          </p>
          <p className="font-display text-[1.625rem] leading-[1.05]">{mediaText(pending)}</p>
          <div>
            <ButtonLink to={withSave('/career/media', params.get('save'))} iconEnd="arrow">
              {s.hub.pressOpen}
            </ButtonLink>
          </div>
        </>
      ) : (
        <p className={ui.muted}>{s.hub.pressNone}</p>
      )}
      {headline && (
        <div className="mt-auto border-t border-line pt-3.5">
          <p className="text-[0.8125rem] font-semibold text-muted">{s.hub.latest}</p>
          <p className="mt-1 font-display text-[1.375rem] leading-[1.05]">{mediaText(headline)}</p>
        </div>
      )}
      {!pending && <CardLink to="/career/media">{s.hub.seeMedia}</CardLink>}
    </Panel>
  );
}

function windowLine(world: World): string {
  const state = windowState(world);
  return world.phase === 'complete'
    ? m.window.between
    : state.open
      ? format(m.window.open, { week: state.closes! })
      : state.opens
        ? format(m.window.opens, { week: state.opens })
        : m.window.closed;
}

function MarketSummary({ world }: { world: World }) {
  const contract = careerContract(world);
  const waiting = world.offers.filter((offer) => offer.status === 'terms').length;
  const following = world.scouting.length;
  const open = windowState(world).open && world.phase !== 'complete';
  return (
    <Panel aria-labelledby="market-summary-heading" className={fullCard}>
      <CardTitle id="market-summary-heading">{m.hub.market}</CardTitle>
      <p
        className={cx(
          'flex items-start gap-2.5 rounded-control px-3.5 py-2.5 text-[0.8125rem] font-semibold text-balance',
          open ? 'bg-accent text-on-accent' : 'border border-line bg-surface-soft text-muted',
        )}
      >
        <span
          aria-hidden="true"
          className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', open ? 'bg-gold' : 'bg-muted')}
        />
        <span className="min-w-0">{windowLine(world)}</span>
      </p>
      <p className={cx('text-sm font-bold', waiting > 0 && open && 'text-accent')}>
        {format(m.hub.marketBody, { interest: following, offers: waiting })}
      </p>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
        {[
          [m.contract.wage, weekly(contract.weeklyWage)],
          [m.contract.role, roleName(contract.role)],
          [m.earnings.cash, money(world.career!.market.finances.cash)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-control bg-surface-soft p-2.5">
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="font-display text-[1.375rem] leading-tight">{value}</dd>
          </div>
        ))}
      </dl>
      <CardLink to="/career/transfers">{m.hub.seeMarket}</CardLink>
    </Panel>
  );
}

/** A quiet summary: title and icon, a big value, one or two lines, and where to go. */
function Tile({
  id,
  title,
  glyph,
  value,
  to,
  link,
  hot,
  tour,
  children,
}: {
  id: string;
  title: string;
  glyph: GlyphName;
  value?: string;
  to: string;
  link: string;
  hot?: boolean;
  tour?: string;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} data-tour={tour} className={tileClass(hot)}>
      <div className="flex items-start justify-between gap-2">
        <h2 id={id} className="text-[0.9375rem] leading-tight font-extrabold sm:text-base">
          {title}
        </h2>
        <span className="text-accent">
          <Glyph name={glyph} className="h-[1.125rem] w-[1.125rem]" />
        </span>
      </div>
      {value && <p className="font-display text-[1.875rem] leading-[0.95]">{value}</p>}
      <div className="grid gap-0.5 text-[0.8125rem] break-words">{children}</div>
      <CardLink to={to} small>
        {link}
      </CardLink>
    </section>
  );
}

function TrainingSummary({ career }: { career: Career }) {
  const report = career.lastTraining;
  const sessions = career.training.sessions.length;
  return (
    <Tile
      id="training-summary-heading"
      title={c.hub.training}
      glyph="boot"
      tour="training"
      value={
        sessions === 1
          ? c.hub.tileValues.trainingOne
          : format(c.hub.tileValues.training, { count: sessions })
      }
      to="/career/training"
      link={c.hub.editTraining}
    >
      {report ? (
        <>
          <p className="text-xs text-muted">
            {format(c.common.seasonWeek, { season: report.season, week: report.week })} ·{' '}
            {format(c.hub.trainingFatigue, {
              value: `${report.fatigue > 0 ? '+' : ''}${report.fatigue}`,
            })}
          </p>
          {report.improved.length > 0 && (
            <p className="font-bold text-accent">
              {format(c.hub.trainingImprovedList, {
                attributes: report.improved.map(attributeName).join(', '),
              })}
            </p>
          )}
          {report.declined.length > 0 && (
            <p className="font-bold text-danger">
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
          {report.injuryId && <p className="font-bold text-danger">{c.hub.trainingInjury}</p>}
        </>
      ) : (
        <p className="text-muted">{c.hub.trainingEmpty}</p>
      )}
    </Tile>
  );
}

function FameSummary({ world }: { world: World }) {
  const career = world.career!;
  const progress = fameProgress(career.fame);
  const ready = world.challenges.filter(
    (challenge) => challenge.claimed || challengeDone(world, challenge),
  ).length;
  return (
    <Tile
      id="fame-summary-heading"
      title={l.hub.title}
      glyph="star"
      value={fameName(progress.level)}
      to="/career/wardrobe"
      link={l.hub.open}
    >
      <p className="text-muted">
        {format(c.hub.fameLine, { level: progress.level, name: fameName(progress.level) })}
      </p>
      <p>
        {progress.needed
          ? format(l.fame.progressTowards, {
              into: progress.into,
              needed: progress.needed,
              level: progress.level + 1,
            })
          : l.fame.max}
      </p>
      <p>
        {format(l.hub.challenges, { done: ready, total: world.challenges.length })} ·{' '}
        {format(l.wardrobe.tokens, { count: career.style.tokens })}
      </p>
    </Tile>
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
    <Tile
      id="honours-summary-heading"
      title={h.hub.honours}
      glyph="trophy"
      value={
        trophies === 1
          ? c.hub.tileValues.honoursOne
          : format(c.hub.tileValues.honours, { count: trophies })
      }
      to="/career/trophies"
      link={h.hub.open}
    >
      <p className="text-muted">
        {format(c.hub.honoursLine, {
          trophies: plural(trophies, h.legacy.trophy, h.legacy.trophies),
          awards: plural(awards, h.legacy.award, h.legacy.awards),
        })}
      </p>
      <p>
        {format(c.hub.capsLine, {
          caps: plural(caps, h.hub.cap, h.hub.caps),
          goals: plural(goals, h.hub.goal, h.hub.goals),
        })}
      </p>
      <HallOfFameRankLine world={world} className="font-bold" />
    </Tile>
  );
}

/** The inbox in brief, when nothing is unread. */
function InboxTile({ world }: { world: World }) {
  const latest = world.inbox.at(-1);
  return (
    <Tile
      id="inbox-tile-heading"
      title={m.hub.inbox}
      glyph="contract"
      tour="inbox"
      value={c.hub.tileValues.inboxRead}
      to="/career/inbox"
      link={m.hub.seeAll}
    >
      <p className="text-muted">{latest ? messageText(latest).subject : m.inbox.empty}</p>
    </Tile>
  );
}

/** The press in brief, when no question is waiting. */
function PressTile({ world }: { world: World }) {
  const headline = [...world.media].reverse().find((item) => item.kind === 'headline');
  return (
    <Tile
      id="press-tile-heading"
      title={s.hub.press}
      glyph="fame"
      value={c.hub.tileValues.pressQuiet}
      to="/career/media"
      link={s.hub.seeMedia}
    >
      <p className="text-muted">{headline ? mediaText(headline) : s.hub.pressNone}</p>
    </Tile>
  );
}

/** The market in brief, when no offer is open. */
function MarketTile({ world }: { world: World }) {
  const following = world.scouting.length;
  return (
    <Tile
      id="market-tile-heading"
      title={m.hub.market}
      glyph="transfer"
      value={
        following === 1
          ? c.hub.tileValues.marketOne
          : format(c.hub.tileValues.market, { count: following })
      }
      to="/career/transfers"
      link={m.hub.seeMarket}
    >
      <p className="text-muted">{windowLine(world)}</p>
      <p>{format(m.hub.marketBody, { interest: following, offers: 0 })}</p>
    </Tile>
  );
}

/** Every summary in full, or quiet ones as tiles; the choice lives in the URL. */
function SummariesToggle({ full }: { full: boolean }) {
  const [params, setParams] = useSearchParams();
  return (
    <div className="max-sm:self-center">
      <button
        type="button"
        className="text-button sm:-ml-3"
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
