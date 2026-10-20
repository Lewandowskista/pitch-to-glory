import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Club, Fixture, Hex, Player, Rivalry, RivalryEntry, World } from '../../model/domain';
import { overallRating } from '../../engine/strength';
import { marketValue } from '../../engine/career/market';
import { rivalOf, rivalryOf, seasonLines } from '../../engine/career/social';
import { ART, contrastRatio, mix } from '../../engine/assets/shared';
import { calendarDate } from '../../engine/world/calendar';
import { useAppStore } from '../../store';
import { format } from '../../i18n';
import { formatGameDate } from '../../i18n/calendar';
import { careerText as c } from '../../i18n/career';
import { socialText as s } from '../../i18n/social';
import { CardTitle, Panel, cx } from '../../ui/kit';
import { CareerPage, CrestImage, useSaveLink } from './shared';
import { money } from './marketUi';
import { Portrait } from './socialUi';
import { LifeIcon, type LifeIconName } from './lifeIcons';

export default function CareerRival() {
  const world = useAppStore((state) => state.world);
  return (
    <CareerPage title={s.titles.rival} description={world ? intro(world) : undefined}>
      {({ world, player, club }) => {
        const rivalry = rivalryOf(world);
        const rival = rivalOf(world);
        return rivalry && rival ? (
          <RivalContent world={world} player={player} rival={rival} rivalry={rivalry} />
        ) : (
          <NoRival world={world} player={player} club={club} />
        );
      }}
    </CareerPage>
  );
}

/** One line under the title: who leads on goals this season. */
function intro(world: World): string | undefined {
  if (!world.career) return undefined;
  const lines = seasonLines(world);
  const rival = rivalOf(world);
  if (!lines || !rival) return s.rival.intro.none;
  const gap = lines.career.goals - lines.rival.goals;
  const params = { rival: rival.name, count: Math.abs(gap) };
  if (gap === 0) return format(s.rival.intro.level, params);
  if (gap > 0) return format(gap === 1 ? s.rival.intro.aheadOne : s.rival.intro.ahead, params);
  return format(gap === -1 ? s.rival.intro.behindOne : s.rival.intro.behind, params);
}

const ageOf = (world: World, player: Player) => world.date.season - player.birthSeason;
const clubOf = (world: World, player: Player) =>
  player.clubId ? world.clubs[player.clubId] : undefined;

/** Before the rivalry starts: your portrait facing an empty, dashed place. */
function NoRival({ world, player, club }: { world: World; player: Player; club?: Club }) {
  return (
    <Panel aria-labelledby="rival-heading" className="flex flex-wrap items-center gap-6">
      <div className="flex shrink-0 items-center gap-3.5">
        <Portrait
          player={player}
          age={ageOf(world, player)}
          club={club}
          alt={format(s.rival.portrait, { name: player.name })}
          className="h-[5.5rem] w-[5.5rem]"
        />
        <span aria-hidden="true" className="font-display text-[2rem] text-muted uppercase">
          {c.common.vs}
        </span>
        <span
          aria-hidden="true"
          className="grid h-[5.5rem] w-[5.5rem] place-items-center rounded-full border-2 border-dashed border-line bg-surface-soft font-display text-[2.75rem] text-muted"
        >
          ?
        </span>
      </div>
      <div className="min-w-0 flex-1 basis-64">
        <CardTitle id="rival-heading">{s.rival.title}</CardTitle>
        <p className="mt-1.5 text-muted">{s.rival.none}</p>
      </div>
    </Panel>
  );
}

/** The rival's half of the hero, striped in their club's main colour with readable text. */
function rivalColours(club: Club | undefined): {
  style: CSSProperties;
  ink: string;
  light: boolean;
} {
  const base = (club?.kits.home.colors[0] ?? ART.ink) as Hex;
  // Light text unless the dark ink reads better on this colour.
  const light = contrastRatio(base, ART.onGold) > contrastRatio(base, ART.heroInk);
  const stripe = mix(base, light ? ART.ink : ART.surface, 0.06);
  return {
    style: {
      backgroundColor: base,
      backgroundImage: `repeating-linear-gradient(90deg, ${base} 0 72px, ${stripe} 72px 144px)`,
    },
    ink: light ? 'text-on-gold' : 'text-hero-ink',
    light,
  };
}

/** A compared value; the side ahead gets a marked pill, never colour alone. */
function Value({ value, lead }: { value: string | number; lead: 'you' | 'rival' | null }) {
  if (!lead) return <span className="font-semibold [overflow-wrap:anywhere]">{value}</span>;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-extrabold whitespace-nowrap tabular-nums sm:gap-1 sm:px-2.5',
        lead === 'you' ? 'bg-accent-soft text-accent' : 'bg-gold text-on-gold',
      )}
    >
      <LifeIcon name="check" className="h-3 w-3" />
      {value}
      <span className="sr-only"> ({s.rival.better})</span>
    </span>
  );
}

/** The next unplayed meeting of the two clubs this season, if there is one. */
function nextMeeting(world: World, mine: Club | undefined, theirs: Club | undefined) {
  if (!mine || !theirs || mine.id === theirs.id) return null;
  const fixture = Object.values(world.fixtures)
    .filter(
      (f) =>
        !world.results[f.id] &&
        f.date.season === world.date.season &&
        f.date.week >= world.date.week &&
        ((f.homeId === mine.id && f.awayId === theirs.id) ||
          (f.homeId === theirs.id && f.awayId === mine.id)),
    )
    .sort((a, b) => a.date.week - b.date.week || a.date.day - b.date.day)[0];
  return fixture ?? null;
}

function MeetingLink({ world, fixture }: { world: World; fixture: Fixture }) {
  const link = useSaveLink();
  const home = world.clubs[fixture.homeId]!;
  const away = world.clubs[fixture.awayId]!;
  const opponent = home.id === clubOf(world, rivalOf(world)!)?.id ? home : away;
  return (
    <Link
      to={link('/career/calendar')}
      className="flex min-h-11 items-center gap-3 rounded-control bg-art-gold px-3.5 py-3 text-ink transition-colors hover:bg-gold"
    >
      <CrestImage crest={opponent.crest} alt="" className="h-9 w-8 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">
          {format(s.rival.nextMeeting, { home: home.name, away: away.name })}
        </span>
        <span className="block text-xs text-gold-ink">
          {format(s.rival.nextMeta, {
            week: format(c.common.week, { week: fixture.date.week }),
            date: formatGameDate(
              calendarDate(fixture.date.season, fixture.date.week, fixture.date.day),
            ),
            stadium: home.stadium.name,
          })}
        </span>
      </span>
      <LifeIcon name="chevronRight" className="h-[1.125rem] w-[1.125rem]" />
    </Link>
  );
}

const ENTRY: Record<RivalryEntry['kind'], { icon: LifeIconName; tone: string }> = {
  media: { icon: 'chat', tone: 'bg-art-blue text-info' },
  'head-to-head': { icon: 'ball', tone: 'bg-accent-soft text-accent' },
  transfer: { icon: 'transfer', tone: 'bg-art-gold text-gold-ink' },
  season: { icon: 'trophy', tone: 'bg-gold text-on-gold' },
  started: { icon: 'star', tone: 'bg-danger-soft text-danger' },
};

function RivalContent({
  world,
  player,
  rival,
  rivalry,
}: {
  world: World;
  player: Player;
  rival: Player;
  rivalry: Rivalry;
}) {
  const lines = seasonLines(world)!;
  const myClub = clubOf(world, player);
  const theirClub = clubOf(world, rival);
  const division = (club: Club | undefined) => (club && world.leagues[club.leagueId]?.name) || '–';
  const careerFees = world.career!.market.moves.map((move) => move.fee);
  const rivalFees = rivalry.timeline
    .filter((entry) => entry.kind === 'transfer')
    .map((entry) => Number(entry.params.fee));
  const careerGoals = world.career!.matches.reduce((sum, m) => sum + m.goals, 0);
  const careerRating = lines.career.appearances ? lines.career.rating : null;
  const rivalRating = lines.rival.appearances ? lines.rival.rating : null;
  const bestFee = (fees: number[]) => (fees.length ? Math.max(...fees) : null);
  const myValue = marketValue(world, player);
  const rivalValue = marketValue(world, rival);
  const myAbility = overallRating(player);
  const rivalAbility = overallRating(rival);
  const myFee = bestFee(careerFees);
  const rivalFee = bestFee(rivalFees);
  /** Label, both shown values and, where higher is better, both raw numbers to compare. */
  const rows: {
    label: string;
    mine: string | number;
    theirs: string | number;
    compare?: [number | null, number | null];
  }[] = [
    { label: s.rival.rows.age, mine: ageOf(world, player), theirs: ageOf(world, rival) },
    { label: s.rival.rows.club, mine: myClub?.name ?? '–', theirs: theirClub?.name ?? '–' },
    { label: s.rival.rows.division, mine: division(myClub), theirs: division(theirClub) },
    {
      label: s.rival.rows.position,
      mine: c.positions[player.primaryPosition]!,
      theirs: c.positions[rival.primaryPosition]!,
    },
    {
      label: s.rival.rows.ability,
      mine: myAbility,
      theirs: rivalAbility,
      compare: [myAbility, rivalAbility],
    },
    {
      label: s.rival.rows.value,
      mine: money(myValue),
      theirs: money(rivalValue),
      compare: [myValue, rivalValue],
    },
    {
      label: s.rival.rows.apps,
      mine: lines.career.appearances,
      theirs: lines.rival.appearances,
      compare: [lines.career.appearances, lines.rival.appearances],
    },
    {
      label: s.rival.rows.goals,
      mine: lines.career.goals,
      theirs: lines.rival.goals,
      compare: [lines.career.goals, lines.rival.goals],
    },
    {
      label: s.rival.rows.assists,
      mine: lines.career.assists,
      theirs: lines.rival.assists,
      compare: [lines.career.assists, lines.rival.assists],
    },
    {
      label: s.rival.rows.rating,
      mine: careerRating?.toFixed(2) ?? '–',
      theirs: rivalRating?.toFixed(2) ?? '–',
      compare: [careerRating, rivalRating],
    },
    {
      label: s.rival.rows.careerGoals,
      mine: careerGoals,
      theirs: rival.stats.goals,
      compare: [careerGoals, rival.stats.goals],
    },
    {
      label: s.rival.rows.fees,
      mine: myFee === null ? '–' : money(myFee),
      theirs: rivalFee === null ? '–' : money(rivalFee),
      compare: [myFee, rivalFee],
    },
  ];
  const leads = rows.map(({ compare }) => {
    const [a, b] = compare ?? [null, null];
    return a !== null && b !== null ? Math.sign(a - b) : 0;
  });
  const youLead = leads.filter((lead) => lead > 0).length;
  const theyLead = leads.filter((lead) => lead < 0).length;
  const h2h = rivalry.headToHead;
  const meeting = nextMeeting(world, myClub, theirClub);
  const rivalSide = rivalColours(theirClub);
  const firstName = rival.name.split(' ')[0] ?? rival.name;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <section
        aria-labelledby="rival-heading"
        className="ui-card min-w-0 overflow-hidden rounded-panel border border-line bg-surface shadow-surface"
      >
        <h2 id="rival-heading" className="sr-only">
          {s.rival.title}
        </h2>
        <div className="relative grid md:grid-cols-2">
          <div className="flex min-w-0 items-center gap-4 bg-field-stripes px-5 py-6 text-hero-ink sm:gap-5 sm:py-7 sm:pr-16 sm:pl-8">
            <Portrait
              player={player}
              age={ageOf(world, player)}
              club={myClub}
              alt={format(s.rival.portrait, { name: player.name })}
              className="h-20 w-20 shrink-0 rounded-full ring-4 ring-gold sm:h-32 sm:w-32"
            />
            <div className="flex min-w-0 flex-col items-start gap-2">
              <span className="rounded-full bg-gold px-3 py-0.5 text-xs font-extrabold text-on-gold">
                {s.rival.you}
              </span>
              <p className="font-display text-[2.25rem] leading-[0.88] break-words sm:text-[3.25rem]">
                {player.name}
              </p>
              {myClub && (
                <p className="flex items-center gap-2 text-sm font-semibold text-hero-muted">
                  <CrestImage crest={myClub.crest} alt="" className="h-7 w-6 shrink-0" />
                  <span className="min-w-0">{myClub.name}</span>
                </p>
              )}
              <p className="text-[0.8125rem] text-hero-muted">
                {format(s.rival.identity, {
                  position: c.positions[player.primaryPosition]!,
                  age: ageOf(world, player),
                  overall: myAbility,
                })}
              </p>
            </div>
          </div>
          <div
            className={cx(
              'flex min-w-0 flex-row-reverse items-center gap-4 px-5 py-6 text-right sm:gap-5 sm:py-7 sm:pr-8 sm:pl-16',
              rivalSide.ink,
            )}
            style={rivalSide.style}
          >
            <Portrait
              player={rival}
              age={ageOf(world, rival)}
              club={theirClub}
              alt={format(s.rival.portrait, { name: rival.name })}
              className={cx(
                'h-20 w-20 shrink-0 rounded-full ring-4 sm:h-32 sm:w-32',
                rivalSide.light ? 'ring-on-gold' : 'ring-hero-ink',
              )}
            />
            <div className="flex min-w-0 flex-col items-end gap-2">
              <span className="rounded-full border border-current px-3 py-px text-xs font-extrabold">
                {s.rival.rivalChip}
              </span>
              <p className="font-display text-[2.25rem] leading-[0.88] break-words sm:text-[3.25rem]">
                {rival.name}
              </p>
              {theirClub && (
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="min-w-0">{theirClub.name}</span>
                  <CrestImage crest={theirClub.crest} alt="" className="h-7 w-6 shrink-0" />
                </p>
              )}
              <p className="text-[0.8125rem]">
                {format(s.rival.identity, {
                  position: c.positions[rival.primaryPosition]!,
                  age: ageOf(world, rival),
                  overall: rivalAbility,
                })}
              </p>
            </div>
          </div>
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 hidden h-[4.75rem] w-[4.75rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gold font-display text-[2.75rem] leading-none text-on-gold uppercase shadow-[0_0_0_6px_var(--color-surface)] md:grid"
          >
            {c.common.vs}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-10 gap-y-5 px-5 pt-5 pb-6 sm:px-8">
          <p className="min-w-0 flex-[1.3_1_22rem] text-[0.9375rem] text-muted">{s.rival.body}</p>
          <Intensity value={rivalry.intensity} />
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]">
        <Panel aria-labelledby="compare-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <CardTitle id="compare-heading" size="lg">
              {s.rival.compare}
            </CardTitle>
            <span className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-accent">
                {format(s.rival.leads.you, { count: youLead })}
              </span>
              <span className="rounded-full bg-gold px-2.5 py-0.5 text-on-gold">
                {format(s.rival.leads.rival, { name: firstName, count: theyLead })}
              </span>
            </span>
          </div>
          <table className="w-full table-fixed text-left text-[0.8125rem] tabular-nums sm:text-sm">
            <colgroup>
              <col className="w-[30%] sm:w-[40%]" />
              <col className="w-[35%] sm:w-[30%]" />
              <col className="w-[35%] sm:w-[30%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="py-2 pr-2 font-bold">
                  <span className="sr-only sm:not-sr-only">{s.rival.columns.measure}</span>
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  <span className="inline-flex items-center gap-1.5">
                    <Portrait
                      player={player}
                      age={ageOf(world, player)}
                      club={myClub}
                      alt=""
                      className="h-6 w-6 max-sm:hidden"
                    />
                    {s.rival.columns.you}
                  </span>
                </th>
                <th scope="col" className="py-2 pl-2 text-right font-bold">
                  <span className="inline-flex items-center gap-1.5">
                    <Portrait
                      player={rival}
                      age={ageOf(world, rival)}
                      club={theirClub}
                      alt=""
                      className="h-6 w-6 max-sm:hidden"
                    />
                    {s.rival.columns.rival}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, mine, theirs }, index) => (
                <tr key={label} className="border-t border-line">
                  <th
                    scope="row"
                    className="py-2.5 pr-2 align-top font-medium break-words text-muted"
                  >
                    {label}
                  </th>
                  <td className="px-2 py-2.5 text-right align-top break-words">
                    <Value value={mine} lead={leads[index]! > 0 ? 'you' : null} />
                  </td>
                  <td className="py-2.5 pl-2 text-right align-top break-words">
                    <Value value={theirs} lead={leads[index]! < 0 ? 'rival' : null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">{s.rival.scope}</p>
        </Panel>

        <Panel aria-labelledby="h2h-heading" className="flex flex-col gap-3.5">
          <CardTitle id="h2h-heading">{s.rival.headToHead}</CardTitle>
          {h2h.played ? (
            <>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {(['won', 'drawn', 'lost'] as const).map((key) => (
                  <div
                    key={key}
                    className={cx(
                      'flex flex-col-reverse rounded-control px-1.5 py-2.5',
                      key === 'won' ? 'bg-accent-soft text-accent' : 'bg-surface-soft',
                    )}
                  >
                    <dt className={cx('text-xs font-bold', key === 'won' ? '' : 'text-muted')}>
                      {s.rival.tallies[key]}
                    </dt>
                    <dd className="font-display text-[2.75rem] leading-[0.9] tabular-nums">
                      {h2h[key]}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="font-display text-2xl leading-[1.05]">
                {format(s.rival.record, { won: h2h.won, drawn: h2h.drawn, lost: h2h.lost })}
              </p>
            </>
          ) : (
            <p className="text-muted">{s.rival.noMeetings}</p>
          )}
          {meeting && <MeetingLink world={world} fixture={meeting} />}
          <div className="border-t border-line pt-3.5">
            <h3 className="text-xs font-extrabold tracking-[0.12em] text-muted uppercase">
              {s.rival.seasons}
            </h3>
            {rivalry.seasons.length ? (
              <table className="mt-2 w-full text-left text-sm tabular-nums">
                <thead>
                  <tr className="text-xs text-muted">
                    <th scope="col" className="py-1.5 pr-2 font-bold">
                      {s.rival.seasonColumns.season}
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-bold">
                      {s.rival.seasonColumns.you}
                    </th>
                    <th scope="col" className="py-1.5 pl-2 font-bold">
                      {s.rival.seasonColumns.rival}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...rivalry.seasons].reverse().map((season) => (
                    <tr key={season.season} className="border-t border-line">
                      <th scope="row" className="py-2 pr-2 font-bold">
                        {season.season}
                      </th>
                      <td className="px-2 py-2">
                        {season.career.goals}/{season.career.assists} ·{' '}
                        {season.career.rating.toFixed(2)}
                      </td>
                      <td className="py-2 pl-2">
                        {season.rival.goals}/{season.rival.assists} ·{' '}
                        {season.rival.rating.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-muted">–</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel aria-labelledby="timeline-heading" className="flex flex-col gap-4">
        <CardTitle id="timeline-heading" size="lg">
          {s.rival.timeline}
        </CardTitle>
        <ol className="grid">
          {[...rivalry.timeline].reverse().map((entry, index, list) => {
            const params: Record<string, string | number> = { ...entry.params };
            if (typeof params.fee === 'number') params.fee = money(params.fee);
            if (entry.kind === 'head-to-head')
              params.outcome =
                s.rival.outcomes[String(params.outcome) as keyof typeof s.rival.outcomes];
            if (entry.kind === 'season')
              params.verdict = params.ahead ? s.rival.verdicts.ahead : s.rival.verdicts.behind;
            if (entry.kind === 'media')
              params.text = format(s.rivalPress.entry, {
                rival: String(params.rival ?? ''),
                answer: s.answers[String(params.answer)] ?? '',
                reply: format(s.posts[String(params.reply)] ?? '', params),
              });
            const look = ENTRY[entry.kind];
            return (
              <li
                key={`${entry.date.season}-${entry.date.week}-${index}`}
                className="flex items-stretch gap-4"
              >
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <span
                    aria-hidden="true"
                    className={cx('grid h-10 w-10 place-items-center rounded-full', look.tone)}
                  >
                    <LifeIcon name={look.icon} className="h-[1.125rem] w-[1.125rem]" />
                  </span>
                  {index < list.length - 1 && (
                    <span aria-hidden="true" className="mt-1 w-0.5 flex-1 bg-line" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-2 pb-[1.125rem]">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted">
                      {format(c.common.seasonWeek, {
                        season: entry.date.season,
                        week: entry.date.week,
                      })}
                    </span>
                    <span
                      className={cx('rounded-full px-2 text-[0.6875rem] font-extrabold', look.tone)}
                    >
                      {s.rival.tags[entry.kind]}
                    </span>
                  </p>
                  <p className="mt-1 text-[0.9375rem]">
                    {format(s.rival.entries[entry.kind] ?? '', params)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>
    </div>
  );
}

/** How hot the rivalry runs, from friendly to bitter. */
function Intensity({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="min-w-0 flex-[1_1_18rem]">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-bold">{s.rival.intensity}</span>
        <span className="font-display text-[2rem] leading-[0.9] text-danger tabular-nums">
          {bounded}
        </span>
      </div>
      <div
        role="meter"
        aria-label={s.rival.intensity}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={bounded}
        aria-valuetext={`${bounded}, ${
          bounded < 34
            ? s.rival.intensityScale.friendly
            : bounded < 67
              ? s.rival.intensityScale.heated
              : s.rival.intensityScale.bitter
        }`}
        className="h-3 overflow-hidden rounded-full bg-danger-soft"
      >
        <span className="block h-full rounded-full bg-danger" style={{ width: `${bounded}%` }} />
      </div>
      <div
        aria-hidden="true"
        className="mt-1 flex justify-between text-[0.6875rem] font-semibold text-muted"
      >
        <span>{s.rival.intensityScale.friendly}</span>
        <span>{s.rival.intensityScale.heated}</span>
        <span>{s.rival.intensityScale.bitter}</span>
      </div>
    </div>
  );
}
