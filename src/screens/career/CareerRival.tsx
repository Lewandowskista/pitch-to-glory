import { useMemo } from 'react';
import type { Player, Rivalry, World } from '../../model/domain';
import { playerAbility } from '../../engine/strength';
import { marketValue } from '../../engine/career/market';
import { rivalOf, rivalryOf, seasonLines } from '../../engine/career/social';
import { renderAvatar } from '../../engine/assets/avatar';
import { Artwork } from '../../ui/Artwork';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { socialText as s } from '../../i18n/social';
import { CareerPage, CrestImage, Meter, ui } from './shared';
import { money } from './marketUi';

export default function CareerRival() {
  return (
    <CareerPage eyebrow={s.eyebrow} title={s.titles.rival}>
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
      className="h-24 w-24 shrink-0 rounded-full bg-art-blue sm:h-28 sm:w-28"
    />
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
  const rows: [string, string | number, string | number][] = [
    [s.rival.rows.age, age(player), age(rival)],
    [s.rival.rows.club, club(player).name, club(rival).name],
    [s.rival.rows.division, division(player), division(rival)],
    [
      s.rival.rows.position,
      c.positions[player.primaryPosition]!,
      c.positions[rival.primaryPosition]!,
    ],
    [s.rival.rows.ability, Math.round(playerAbility(player)), Math.round(playerAbility(rival))],
    [s.rival.rows.value, money(marketValue(world, player)), money(marketValue(world, rival))],
    [s.rival.rows.apps, lines.career.appearances, lines.rival.appearances],
    [s.rival.rows.goals, lines.career.goals, lines.rival.goals],
    [s.rival.rows.assists, lines.career.assists, lines.rival.assists],
    [
      s.rival.rows.rating,
      lines.career.appearances ? lines.career.rating.toFixed(2) : '–',
      lines.rival.appearances ? lines.rival.rating.toFixed(2) : '–',
    ],
    [s.rival.rows.careerGoals, careerGoals, rival.stats.goals],
    [
      s.rival.rows.fees,
      careerFees.length ? money(Math.max(...careerFees)) : '–',
      rivalFees.length ? money(Math.max(...rivalFees)) : '–',
    ],
  ];
  const h2h = rivalry.headToHead;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      <section aria-labelledby="rival-heading" className={`${ui.panel} lg:col-span-12`}>
        <h2 id="rival-heading" className="sr-only">
          {s.rival.title}
        </h2>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          {[player, rival].map((p, index) => (
            <div
              key={p.id}
              className={`flex min-w-0 flex-col items-center gap-2 text-center ${index === 0 ? 'sm:items-end sm:text-right' : 'sm:items-start sm:text-left'}`}
            >
              <Portrait player={p} age={age(p)} />
              <strong className="font-display text-2xl leading-tight break-words sm:text-3xl">
                {p.name}
              </strong>
              <span className="flex items-center gap-2 text-sm text-muted">
                <CrestImage crest={club(p).crest} alt="" className="h-6 w-6" />
                <span className="truncate">{club(p).name}</span>
              </span>
              {index === 0 && <span className={ui.chip}>{s.rival.you}</span>}
            </div>
          ))}
          <span className="col-start-2 row-start-1 font-display text-3xl text-muted">
            {c.common.vs}
          </span>
        </div>
        <p className={`${ui.muted} mx-auto mt-4 max-w-prose text-center`}>{s.rival.body}</p>
        <div className="mx-auto mt-4 max-w-md">
          <Meter label={s.rival.intensity} value={rivalry.intensity} tone="danger" />
        </div>
      </section>
      <section aria-labelledby="compare-heading" className={`${ui.panel} lg:col-span-7`}>
        <h2 id="compare-heading" className={ui.heading}>
          {s.rival.compare}
        </h2>
        <div
          className="relative mt-4 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={s.rival.compare}
        >
          <table className="w-full min-w-[20rem] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="py-2 pr-3">
                  {s.rival.columns.measure}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {s.rival.columns.you}
                </th>
                <th scope="col" className="py-2 text-right">
                  {s.rival.columns.rival}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(([label, mine, theirs]) => {
                const better =
                  typeof mine === 'number' &&
                  typeof theirs === 'number' &&
                  label !== s.rival.rows.age
                    ? Math.sign(mine - theirs)
                    : 0;
                return (
                  <tr key={label}>
                    <th scope="row" className="py-2 pr-3 font-normal text-muted">
                      {label}
                    </th>
                    <td
                      className={`py-2 pr-3 text-right ${better > 0 ? 'font-bold text-accent' : ''}`}
                    >
                      {mine}
                    </td>
                    <td className={`py-2 text-right ${better < 0 ? 'font-bold text-danger' : ''}`}>
                      {theirs}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="h2h-heading" className={`${ui.panel} lg:col-span-5`}>
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
      <section aria-labelledby="timeline-heading" className={`${ui.panel} lg:col-span-12`}>
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
  );
}
