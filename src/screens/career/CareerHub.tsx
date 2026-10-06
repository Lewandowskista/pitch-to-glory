import { Link } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Icon } from '../../ui/Icon';
import { Dialog } from '../../ui/Dialog';
import { CONFIG } from '../../engine/config';
import { fixtureKind, nextCareerFixture, pendingCareerFixture } from '../../engine/career/fixtures';
import { chooseRecovery } from '../../engine/career/training';
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
import { competitionName, leaguePosition, recentForm, seasonLine } from './selectors';
import { continueToMatchday, simulateCareerSeason, startNextCareerSeason } from './actions';
import { useUrlDialog } from './useUrlDialog';
import { careerContract, windowState } from '../../engine/career/market';
import { marketText as m } from '../../i18n/market';
import { messageText, money, roleName, weekly, WindowBanner } from './marketUi';
import { rivalOf, seasonLines } from '../../engine/career/social';
import { socialText as s } from '../../i18n/social';
import { mediaText } from './socialUi';
import { challengeDone, fameProgress } from '../../engine/career/lifestyle';
import { lifestyleText as l } from '../../i18n/lifestyle';
import { fameName, useChallengeRefresh } from './lifestyleUi';
import { HonoursSummary } from './honoursHub';
import { Tutorial } from '../../ui/Tutorial';
import { tutorialText as tt } from '../../i18n/tutorial';

const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;

export default function CareerHub() {
  useChallengeRefresh();
  return (
    <CareerPage eyebrow={c.hub.eyebrow} title={c.titles.hub}>
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
      <NextMatch world={world} career={career} club={club} />
      <PlayerCard career={career} player={player} club={club} age={age} />
      <SeasonStats world={world} career={career} player={player} />
      <LastResult world={world} career={career} />
      <ClubStanding world={world} club={club} />
      <Condition career={career} player={player} />
      <TrainingSummary career={career} />
      <FameSummary world={world} />
      <HonoursSummary world={world} />
      <PressRoom world={world} />
      <RivalWatch world={world} />
      <MarketSummary world={world} />
      <InboxPreview world={world} />
      <Tutorial
        track="week"
        enabled={world.phase === 'active' && career.matches.length === 0}
        steps={(
          ['next-match', 'player-card', 'training', 'career-nav', 'inbox', 'continue'] as const
        ).map((target) => ({ target, ...tt.week[target] }))}
      />
    </div>
  );
}

function NextMatch({
  world,
  career,
  club,
}: {
  world: World;
  career: Career;
  club: Club | undefined;
}) {
  const job = useAppStore((s) => s.worldJob);
  const session = useAppStore((s) => s.matchSession);
  const dialog = useUrlDialog('confirm');
  const pending = pendingCareerFixture(world);
  const fixture = pending ?? nextCareerFixture(world);
  const opponentId = fixture && (fixture.homeId === club?.id ? fixture.awayId : fixture.homeId);
  const opponent = opponentId ? world.clubs[opponentId] : undefined;
  const home = fixture?.homeId === club?.id;
  const kind = fixture ? fixtureKind(world, fixture) : null;
  const awaitingRecovery = Boolean(career.injury && career.injury.recovery === null);
  const complete = world.phase === 'complete';
  const busy = Boolean(job);
  const action = session ? (
    <Link className="button hero-button min-w-48" to="/match">
      {session.state.match.status === 'finished' ? c.hub.record : c.hub.resume}
      <Icon name="arrow" />
    </Link>
  ) : complete ? (
    <button className="button hero-button min-w-48" disabled={busy} onClick={startNextCareerSeason}>
      {c.hub.nextSeason}
      <Icon name="arrow" />
    </button>
  ) : pending ? (
    <Link className="button hero-button min-w-48" to="/match" data-tour="continue">
      {c.hub.play}
      <Icon name="ball" />
    </Link>
  ) : (
    <button
      className="button hero-button min-w-48"
      disabled={busy || awaitingRecovery}
      aria-describedby={awaitingRecovery ? 'recovery-required' : undefined}
      data-tour="continue"
      onClick={continueToMatchday}
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
          <span className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-gold">
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
            <p className="mt-2 max-w-prose text-sm text-white/80">{c.hub.seasonCompleteBody}</p>
          </div>
        ) : fixture && opponent && club ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
            {[home ? club : opponent, home ? opponent : club].map((side, index) => (
              <div
                key={side.id}
                className={`flex min-w-0 flex-col items-center gap-2 text-center ${
                  index === 0 ? 'sm:items-end sm:text-right' : 'sm:items-start sm:text-left'
                }`}
              >
                <CrestImage
                  crest={side.crest}
                  alt={side.name}
                  className="h-16 w-16 drop-shadow-lg sm:h-24 sm:w-24"
                />
                <strong className="font-display text-xl leading-tight break-words sm:text-3xl">
                  {side.name}
                </strong>
                {side.id === club.id && (
                  <span className="text-[0.65rem] font-bold uppercase tracking-wider text-gold">
                    {c.hub.club}
                  </span>
                )}
              </div>
            ))}
            <span className="col-start-2 row-start-1 font-display text-3xl text-white/70">
              {c.common.vs}
            </span>
          </div>
        ) : (
          <div>
            <p className="font-display text-[2.2rem] leading-none">{c.hub.noFixture}</p>
            <p className="mt-2 max-w-prose text-sm text-white/80">{c.hub.noFixtureBody}</p>
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
        <p className="max-w-prose text-sm text-white/80">
          {pending ? c.hub.matchdayBody : !complete && !session ? c.hub.continueBody : ''}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {action}
          {!complete && !session && (
            <button
              className="button secondary"
              disabled={busy || awaitingRecovery}
              onClick={() => dialog.open('autoplay')}
            >
              {c.hub.simulateSeason}
            </button>
          )}
        </div>
        {awaitingRecovery && !session && (
          <p id="recovery-required" className="text-sm font-semibold text-gold">
            {c.hub.injuredBlock}
          </p>
        )}
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
            dialog.close();
            simulateCareerSeason(true);
          }}
        />
      )}
    </section>
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
      className={`${ui.panel} lg:col-span-4`}
    >
      <p className={ui.eyebrow}>{c.hub.player}</p>
      <div className="mt-3 flex items-center gap-4">
        <PlayerPortrait player={player} age={age} className="h-24 w-24 shrink-0" />
        <div className="min-w-0">
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
              <CrestImage crest={club.crest} alt="" className="h-6 w-6" />
              <span className="truncate">{club.name}</span>
            </p>
          )}
        </div>
      </div>
      <div className="mt-5">
        <XpBar career={career} />
      </div>
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">{c.hub.points}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          to="/career/profile"
          className={`flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold ${
            career.attributePoints
              ? 'bg-gold text-[#1d3127]'
              : 'border border-line bg-surface-soft text-muted'
          }`}
        >
          {plural(career.attributePoints, c.common.attributePoint, c.common.attributePoints)}
          <span className="sr-only">— {c.hub.allocate}</span>
        </Link>
        <Link
          to="/career/skills"
          className={`flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold ${
            career.skillPoints
              ? 'bg-gold text-[#1d3127]'
              : 'border border-line bg-surface-soft text-muted'
          }`}
        >
          {plural(career.skillPoints, c.common.skillPoint, c.common.skillPoints)}
          <span className="sr-only">— {c.hub.unlock}</span>
        </Link>
      </div>
      <Link className="text-button mt-3 -ml-3 inline-flex" to="/career/profile">
        {c.hub.profile}
      </Link>
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
    <section aria-labelledby="last-result-heading" className={`${ui.panel} lg:col-span-4`}>
      <h2 id="last-result-heading" className={ui.heading}>
        {c.hub.lastResult}
      </h2>
      {last ? (
        <>
          <div className="mt-4 flex items-center gap-3">
            {opponent && <CrestImage crest={opponent.crest} alt="" className="h-12 w-12" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {last.home ? c.common.home : c.common.away} · {opponent?.name}
              </p>
              <p className="text-xs text-muted">
                {competitionName(world, last.competitionId)} ·{' '}
                {format(c.common.week, { week: last.week })}
              </p>
            </div>
            <span className="font-display text-4xl leading-none">
              {last.score[0]}–{last.score[1]}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              [c.profile.columns.rating, last.rating.toFixed(1)],
              [c.profile.columns.ga, `${last.goals}/${last.assists}`],
              [c.profile.columns.xp, `+${last.xp}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-control bg-surface-soft p-2">
                <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
                  {label}
                </dt>
                <dd className="font-display text-2xl leading-tight">{value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
            {c.hub.form}
          </h3>
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
  const keeper = player.primaryPosition === 'GK';
  const stats: [string, string | number][] = [
    [c.hub.stats.apps, line.apps],
    [c.hub.stats.goals, line.goals],
    [c.hub.stats.assists, line.assists],
    [c.hub.stats.rating, line.apps ? line.rating.toFixed(2) : '–'],
    keeper ? [c.hub.stats.cleanSheets, line.cleanSheets] : [c.hub.stats.xp, line.xp],
  ];
  return (
    <section aria-labelledby="season-stats-heading" className={`${ui.panel} lg:col-span-4`}>
      <h2 id="season-stats-heading" className={ui.heading}>
        {format(c.hub.season, { season: world.date.season })}
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {stats.map(([label, value], index) => (
          <div
            key={label}
            className={`rounded-control bg-surface-soft p-3 ${index === 0 ? 'col-span-2' : ''}`}
          >
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="font-display text-3xl leading-tight">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ClubStanding({ world, club }: { world: World; club: Club | undefined }) {
  const standing = club ? leaguePosition(world, club.id) : null;
  const league = club ? world.leagues[club.leagueId] : undefined;
  return (
    <section aria-labelledby="club-heading" className={`${ui.panel} lg:col-span-4`}>
      <h2 id="club-heading" className={ui.heading}>
        {c.hub.club}
      </h2>
      {club ? (
        <>
          <div className="mt-4 flex items-center gap-3">
            <CrestImage crest={club.crest} alt="" className="h-14 w-14" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{club.name}</p>
              <p className="truncate text-xs text-muted">{league?.name}</p>
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
            <Link
              className="text-button mt-2 -ml-3 inline-flex"
              to={`/world?country=${encodeURIComponent(club.countryId)}&tier=${league.tier}&group=${encodeURIComponent(league.id)}&club=${encodeURIComponent(club.id)}`}
            >
              {c.hub.viewTable}
            </Link>
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
  const risk = Math.round(I.rush.reinjuryRisk * 100);
  const choose = (recovery: 'rehab' | 'rush') => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    useAppStore.getState().setWorld(chooseRecovery(current, recovery));
  };
  return (
    <section aria-labelledby="condition-heading" className={`${ui.panel} lg:col-span-6`}>
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
          <p className="text-xs font-bold uppercase tracking-wider text-danger">{c.hub.injury}</p>
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
            <fieldset className="mt-4">
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

function TrainingSummary({ career }: { career: Career }) {
  const report = career.lastTraining;
  return (
    <section
      aria-labelledby="training-summary-heading"
      data-tour="training"
      className={`${ui.panel} lg:col-span-6`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="training-summary-heading" className={ui.heading}>
          {c.hub.training}
        </h2>
        <Link className="button secondary" to="/career/training">
          {c.hub.editTraining}
        </Link>
      </div>
      {report ? (
        <div className="mt-4 grid gap-3">
          <p className="text-xs text-muted">
            {format(c.common.seasonWeek, { season: report.season, week: report.week })} ·{' '}
            {format(c.hub.trainingFatigue, {
              value: `${report.fatigue > 0 ? '+' : ''}${report.fatigue}`,
            })}
          </p>
          {report.improved.length || report.declined.length ? (
            <ul className="flex flex-wrap gap-2">
              {report.improved.map((key) => (
                <li key={`up-${key}`} className={ui.chip}>
                  ▲ {attributeName(key)}
                </li>
              ))}
              {report.declined.map((key) => (
                <li
                  key={`down-${key}`}
                  className="inline-flex min-h-7 items-center gap-1 rounded-full bg-danger-soft px-3 text-xs font-bold text-danger"
                >
                  ▼ {attributeName(key)}
                </li>
              ))}
            </ul>
          ) : (
            <p className={ui.muted}>{c.hub.trainingNone}</p>
          )}
          {report.familiarity && (
            <p className="text-sm">
              {format(c.training.familiarityGain, {
                position: report.familiarity.position,
                value: report.familiarity.familiarity,
              })}
            </p>
          )}
          {report.injuryId && (
            <p className="text-sm font-semibold text-danger">{c.hub.trainingInjury}</p>
          )}
        </div>
      ) : (
        <p className={`${ui.muted} mt-4`}>{c.hub.trainingEmpty}</p>
      )}
    </section>
  );
}

function MarketSummary({ world }: { world: World }) {
  const contract = careerContract(world);
  const waiting = world.offers.filter((offer) => offer.status === 'terms').length;
  const following = world.scouting.length;
  const open = windowState(world).open && world.phase !== 'complete';
  return (
    <section aria-labelledby="market-summary-heading" className={`${ui.panel} lg:col-span-6`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="market-summary-heading" className={ui.heading}>
          {m.hub.market}
        </h2>
        <Link className="button secondary" to="/career/transfers">
          {m.hub.seeMarket}
        </Link>
      </div>
      <div className="mt-4 grid gap-3">
        <WindowBanner world={world} />
        <p className={`text-sm font-semibold ${waiting && open ? 'text-accent' : ''}`}>
          {format(m.hub.marketBody, { interest: following, offers: waiting })}
        </p>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-control bg-surface-soft p-3">
            <dt className="text-xs font-semibold text-muted">{m.contract.wage}</dt>
            <dd className="font-display text-2xl leading-tight">{weekly(contract.weeklyWage)}</dd>
          </div>
          <div className="rounded-control bg-surface-soft p-3">
            <dt className="text-xs font-semibold text-muted">{m.contract.role}</dt>
            <dd className="font-display text-2xl leading-tight">{roleName(contract.role)}</dd>
          </div>
          <div className="col-span-2 rounded-control bg-surface-soft p-3">
            <dt className="text-xs font-semibold text-muted">{m.earnings.cash}</dt>
            <dd className="font-display text-2xl leading-tight">
              {money(world.career!.market.finances.cash)}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function InboxPreview({ world }: { world: World }) {
  const latest = [...world.inbox].reverse().slice(0, 4);
  return (
    <section
      aria-labelledby="inbox-preview-heading"
      data-tour="inbox"
      className={`${ui.panel} lg:col-span-6`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="inbox-preview-heading" className={ui.heading}>
          {m.hub.inbox}
        </h2>
        <Link className="button secondary" to="/career/inbox">
          {m.hub.seeAll}
        </Link>
      </div>
      {latest.length ? (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
          {latest.map((message) => (
            <li key={message.id}>
              <Link
                to={`/career/inbox?message=${encodeURIComponent(message.id)}`}
                className="flex min-h-11 items-center gap-3 rounded-control px-3 py-2 transition hover:bg-surface-soft"
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${message.read ? 'bg-line' : 'bg-accent'}`}
                />
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${message.read ? '' : 'font-bold'}`}
                >
                  {messageText(message).subject}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {format(c.common.week, { week: message.date.week })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-4`}>{m.inbox.empty}</p>
      )}
    </section>
  );
}

function PressRoom({ world }: { world: World }) {
  const pending = world.media.find((item) => item.choices.length > 0 && item.answer === null);
  const headline = [...world.media].reverse().find((item) => item.kind === 'headline');
  return (
    <section
      aria-labelledby="press-room-heading"
      className={`${ui.panel} lg:col-span-6 ${pending ? 'border-gold' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="press-room-heading" className={ui.heading}>
          {s.hub.press}
        </h2>
        <Link className="button secondary" to="/career/media">
          {s.hub.seeMedia}
        </Link>
      </div>
      {pending ? (
        <div className="mt-4 grid gap-3">
          <p className={ui.eyebrow}>{format(s.hub.pressWaiting, { outlet: pending.authorName })}</p>
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
          <p className="text-xs font-bold uppercase tracking-wider text-muted">{s.hub.latest}</p>
          <p className="mt-1 font-display text-xl leading-tight">{mediaText(headline)}</p>
        </div>
      )}
    </section>
  );
}

function RivalWatch({ world }: { world: World }) {
  const rival = rivalOf(world);
  const lines = seasonLines(world);
  if (!rival || !lines) return null;
  return (
    <section aria-labelledby="rival-watch-heading" className={`${ui.panel} lg:col-span-6`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="rival-watch-heading" className={ui.heading}>
          {s.hub.rival}
        </h2>
        <Link className="button secondary" to="/career/rival">
          {s.hub.seeRival}
        </Link>
      </div>
      <p className="mt-4 flex items-center gap-2 font-semibold">
        <CrestImage crest={world.clubs[rival.clubId!]!.crest} alt="" className="h-8 w-8 shrink-0" />
        <span className="min-w-0 truncate">
          {format(s.hub.rivalLine, { rival: rival.name, club: world.clubs[rival.clubId!]!.name })}
        </span>
      </p>
      <p className="mt-2 text-sm text-muted">
        {format(s.hub.rivalSeason, {
          goals: lines.career.goals,
          rival: rival.name,
          rivalGoals: lines.rival.goals,
        })}
      </p>
      <Link className="text-button mt-2 -ml-3 inline-flex" to="/career/club">
        {s.hub.seeClub}
      </Link>
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
    <section aria-labelledby="fame-summary-heading" className={`${ui.panel} lg:col-span-6`}>
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gold font-display text-3xl text-[#1d3127]"
        >
          {progress.level}
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="fame-summary-heading" className={ui.heading}>
            {l.hub.title}
          </h2>
          <p className="text-sm text-muted">
            {format(l.fame.level, { level: progress.level })} · {fameName(progress.level)} ·{' '}
            {progress.needed
              ? format(l.fame.progress, { into: progress.into, needed: progress.needed })
              : l.fame.max}
          </p>
          <p className="text-sm">
            {format(l.hub.challenges, { done: ready, total: world.challenges.length })} ·{' '}
            {format(l.wardrobe.tokens, { count: career.style.tokens })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="button secondary" to="/career/wardrobe">
            {l.hub.open}
          </Link>
          <Link className="button secondary" to="/career/lifestyle">
            {l.hub.lifestyle}
          </Link>
        </div>
      </div>
    </section>
  );
}
