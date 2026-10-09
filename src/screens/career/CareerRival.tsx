import { useMemo } from 'react';
import type { Player, Rivalry, World } from '../../model/domain';
import { playerAbility } from '../../engine/strength';
import { marketValue } from '../../engine/career/market';
import { rivalOf, rivalryOf, seasonLines } from '../../engine/career/social';
import { renderAvatar } from '../../engine/assets/avatar';
import { Artwork } from '../../ui/Artwork';
import { HeadToHead } from '../../ui/HeadToHead';
import { Icon } from '../../ui/Icon';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { socialText as s } from '../../i18n/social';
import { CareerPage, CrestImage, Meter, ui } from './shared';
import { money } from './marketUi';

export default function CareerRival() {
  return (
    <CareerPage title={s.titles.rival}>
      {({ world, player }) => {
        const rivalry = rivalryOf(world);
        const rival = rivalOf(world);
        return rivalry && rival ? (
          <RivalContent world={world} player={player} rival={rival} rivalry={rivalry} />
        ) : (
          <section className={ui.panel}>
            <p className={ui.muted}>{s.rival.none}</p>
          </section>
        );
      }}
    </CareerPage>
  );
}

function Portrait({ player, age }: { player: Player; age: number }) {
  const svg = useMemo(() => renderAvatar(player.avatar, age), [player.avatar, age]);
  return (
    <Artwork
      svg={svg}
      alt={format(s.rival.portrait, { name: player.name })}
      className="h-16 w-16 shrink-0 rounded-full bg-art-blue sm:h-20 sm:w-20"
    />
  );
}

/** A compared value; the side ahead gets a marked pill, never colour alone. */
function Value({ value, lead }: { value: string | number; lead: 'you' | 'rival' | null }) {
  if (!lead) return <>{value}</>;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-bold tabular-nums ${
        lead === 'you' ? 'bg-accent-soft text-accent' : 'bg-gold text-on-gold'
      }`}
    >
      <Icon name="check" className="h-3.5 w-3.5 shrink-0" />
      {value}
      <span className="sr-only"> ({s.rival.better})</span>
    </span>
  );
}

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
  const age = (p: Player) => world.date.season - p.birthSeason;
  const club = (p: Player) => world.clubs[p.clubId!]!;
  const division = (p: Player) => world.leagues[club(p).leagueId]?.name ?? '';
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
  const myAbility = Math.round(playerAbility(player));
  const rivalAbility = Math.round(playerAbility(rival));
  const myFee = bestFee(careerFees);
  const rivalFee = bestFee(rivalFees);
  /** Label, both shown values and, where higher is better, both raw numbers to compare. */
  const rows: {
    label: string;
    mine: string | number;
    theirs: string | number;
    compare?: [number | null, number | null];
  }[] = [
    { label: s.rival.rows.age, mine: age(player), theirs: age(rival) },
    { label: s.rival.rows.club, mine: club(player).name, theirs: club(rival).name },
    { label: s.rival.rows.division, mine: division(player), theirs: division(rival) },
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
  const h2h = rivalry.headToHead;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:items-start">
      {/* A compact identity strip: who the rival is and how hot it runs, then the comparison. */}
      <section
        aria-labelledby="rival-heading"
        className={`${ui.panel} grid items-center gap-5 lg:col-span-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]`}
      >
        <h2 id="rival-heading" className="sr-only">
          {s.rival.title}
        </h2>
        <HeadToHead
          inward
          versus={c.common.vs}
          sides={[player, rival].map((p, index) => ({
            id: p.id,
            name: p.name,
            artwork: <Portrait player={p} age={age(p)} />,
            detail: (
              <span className="flex min-w-0 items-start gap-2 text-sm text-muted">
                <CrestImage crest={club(p).crest} alt="" className="h-6 w-6 shrink-0" />
                <span className="min-w-0 break-words text-balance">{club(p).name}</span>
              </span>
            ),
            badge: index === 0 && <span className={ui.chip}>{s.rival.you}</span>,
          }))}
        />
        <div className="mx-auto w-full max-w-md lg:mx-0">
          <p className={`${ui.muted} text-center lg:text-left`}>{s.rival.body}</p>
          <div className="mt-4">
            <Meter label={s.rival.intensity} value={rivalry.intensity} tone="danger" />
          </div>
        </div>
      </section>
      <section aria-labelledby="compare-heading" className={`${ui.panel} lg:col-span-7`}>
        <h2 id="compare-heading" className={ui.heading}>
          {s.rival.compare}
        </h2>
        <table className="mt-4 w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[34%] sm:w-[40%]" />
            <col className="w-[33%] sm:w-[30%]" />
            <col className="w-[33%] sm:w-[30%]" />
          </colgroup>
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="py-2 pr-2 font-bold">
                <span className="sr-only sm:not-sr-only">{s.rival.columns.measure}</span>
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-bold">
                {s.rival.columns.you}
              </th>
              <th scope="col" className="py-2 text-right font-bold">
                {s.rival.columns.rival}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ label, mine, theirs, compare }) => {
              const [a, b] = compare ?? [null, null];
              const better = a !== null && b !== null ? Math.sign(a - b) : 0;
              return (
                <tr key={label}>
                  <th
                    scope="row"
                    className="py-2 pr-2 align-top font-normal break-words text-muted"
                  >
                    {label}
                  </th>
                  <td className="py-2 pr-2 text-right align-top break-words">
                    <Value value={mine} lead={better > 0 ? 'you' : null} />
                  </td>
                  <td className="py-2 text-right align-top break-words">
                    <Value value={theirs} lead={better < 0 ? 'rival' : null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">{s.rival.scope}</p>
      </section>
      {/* Meetings and the story beside the table: the history reads as one column. */}
      <div className="grid min-w-0 content-start gap-5 lg:col-span-5">
        <section aria-labelledby="h2h-heading" className={ui.panel}>
          <h2 id="h2h-heading" className={ui.heading}>
            {s.rival.headToHead}
          </h2>
          {h2h.played ? (
            <p className="mt-4 font-display text-3xl leading-tight">
              {format(s.rival.record, { won: h2h.won, drawn: h2h.drawn, lost: h2h.lost })}
            </p>
          ) : (
            <p className={`${ui.muted} mt-4`}>{s.rival.noMeetings}</p>
          )}
          <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-muted">
            {s.rival.seasons}
          </h3>
          {rivalry.seasons.length ? (
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th scope="col" className="py-1 pr-2">
                    {s.rival.seasonColumns.season}
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    {s.rival.seasonColumns.you}
                  </th>
                  <th scope="col" className="py-1">
                    {s.rival.seasonColumns.rival}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...rivalry.seasons].reverse().map((season) => (
                  <tr key={season.season}>
                    <th scope="row" className="py-1 pr-2 font-semibold">
                      {season.season}
                    </th>
                    <td className="py-1 pr-2">
                      {season.career.goals}/{season.career.assists} ·{' '}
                      {season.career.rating.toFixed(2)}
                    </td>
                    <td className="py-1">
                      {season.rival.goals}/{season.rival.assists} · {season.rival.rating.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={`${ui.muted} mt-2`}>–</p>
          )}
        </section>
        <section aria-labelledby="timeline-heading" className={ui.panel}>
          <h2 id="timeline-heading" className={ui.heading}>
            {s.rival.timeline}
          </h2>
          <ol className="mt-4 grid gap-3 border-l-2 border-line pl-4">
            {[...rivalry.timeline].reverse().map((entry, index) => {
              const params: Record<string, string | number> = { ...entry.params };
              if (typeof params.fee === 'number') params.fee = money(params.fee);
              if (entry.kind === 'head-to-head')
                params.outcome =
                  s.rival.outcomes[String(params.outcome) as keyof typeof s.rival.outcomes];
              if (entry.kind === 'season')
                params.verdict = params.ahead ? s.rival.verdicts.ahead : s.rival.verdicts.behind;
              return (
                <li key={`${entry.date.season}-${entry.date.week}-${index}`} className="text-sm">
                  <span className="block text-xs text-muted">
                    {format(c.common.seasonWeek, {
                      season: entry.date.season,
                      week: entry.date.week,
                    })}
                  </span>
                  {format(s.rival.entries[entry.kind] ?? '', params)}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
