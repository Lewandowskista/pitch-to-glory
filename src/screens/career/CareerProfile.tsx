import { useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../store';
import { CONFIG } from '../../engine/config';
import { careerCap, type AnyAttribute } from '../../engine/ageing';
import { attributeCost, attributeValue, raiseAttribute } from '../../engine/career/progression';
import type { Career, CareerMatchRecord, Club, Player, World } from '../../model/domain';
import { format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { CareerPage, CrestImage, PlayerPortrait, XpBar, plural, ui, useEditBlock } from './shared';
import { attributeGroups, competitionName, potentialBand, seasonLines } from './selectors';

const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;
const PAGE = 20;

export default function CareerProfile() {
  return (
    <CareerPage title={c.titles.profile}>
      {(context) => (
        // Phones read who the player is first, then the attributes; on wide screens the
        // attributes take the left column beside the summary.
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] xl:grid-rows-[auto_auto_1fr_auto]">
          <Summary {...context} />
          <Positions player={context.player} />
          <Attributes {...context} />
          <Hidden player={context.player} />
          <History world={context.world} career={context.career} />
        </div>
      )}
    </CareerPage>
  );
}

function Attributes({
  world,
  career,
  player,
  age,
}: {
  world: World;
  career: Career;
  player: Player;
  age: number;
}) {
  const block = useEditBlock();
  const [announcement, setAnnouncement] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const systemReduced = useReducedMotion();
  const reduced = useAppStore((s) => s.settings.reducedMotion) || Boolean(systemReduced);
  const groups = attributeGroups(player);
  const raise = (key: AnyAttribute) => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    const cost = attributeCost(current, key);
    if (cost === null || cost > current.career!.attributePoints) return;
    const next = raiseAttribute(current, key);
    useAppStore.getState().setWorld(next);
    const value = attributeValue(next.players[next.career!.playerId]!, key);
    setAnnouncement(format(c.profile.raised, { attribute: attributeName(key), value }));
    setFlash(`${key}:${value}`);
  };
  return (
    <section
      aria-labelledby="attributes-heading"
      className={`${ui.panel} xl:col-start-1 xl:row-span-3 xl:row-start-1`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="attributes-heading" className={ui.heading}>
            {c.profile.attributes}
          </h2>
          <p className={`${ui.muted} mt-2 max-w-prose`}>
            {format(c.profile.attributesBody, {
              below: CONFIG.career.costs.belowCap,
              near: CONFIG.career.costs.nearCap,
              beyond: CONFIG.career.costs.beyondCap,
              surcharge: CONFIG.career.costs.physicalSurcharge,
              age: CONFIG.career.costs.physicalAge,
            })}
          </p>
        </div>
        <div
          className={`rounded-control px-4 py-2 text-center ${
            career.attributePoints ? 'bg-gold text-[#1d3127]' : 'bg-surface-soft text-muted'
          }`}
        >
          <span className="block text-xs font-bold uppercase tracking-wider">
            {c.profile.available}
          </span>
          <strong className="font-display text-3xl leading-none" data-testid="attribute-points">
            {career.attributePoints}
          </strong>
        </div>
      </div>
      {block && <p className="mt-3 rounded-control bg-surface-soft p-3 text-sm">{block}</p>}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <p className="mt-2 text-xs text-muted">{c.profile.keyboard}</p>
      <div
        ref={list}
        className="mt-4 gap-6 md:columns-2"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          const buttons = Array.from(
            list.current?.querySelectorAll<HTMLButtonElement>('button[data-attribute]') ?? [],
          );
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : buttons.length - 1;
          buttons[(index + step) % buttons.length]?.focus();
        }}
      >
        {groups.trained.map(({ group, keys }) => (
          <div
            key={group}
            role="group"
            aria-labelledby={`group-${group}`}
            className="mb-6 break-inside-avoid"
          >
            <h3 id={`group-${group}`} className="mb-2 text-sm font-bold text-muted">
              {c.profile.groups[group]}
            </h3>
            <ul className="grid gap-1.5">
              {keys.map((key) => {
                const value = attributeValue(player, key);
                const cap = careerCap(player, key, age);
                const cost = attributeCost(world, key);
                const affordable = cost !== null && cost <= career.attributePoints;
                const reason =
                  cost === null
                    ? c.profile.atMax
                    : !affordable
                      ? format(c.profile.needs, { cost })
                      : null;
                const status =
                  value >= cap + CONFIG.career.costs.capMargin
                    ? c.profile.beyond
                    : value >= cap
                      ? c.profile.near
                      : null;
                return (
                  <li
                    key={key}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-control px-2 py-1.5 hover:bg-surface-soft"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="break-words text-sm font-semibold">
                          {attributeName(key)}
                        </span>
                        <m.span
                          key={flash?.startsWith(`${key}:`) ? flash : 'static'}
                          initial={
                            reduced || !flash?.startsWith(`${key}:`) ? false : { scale: 1.6 }
                          }
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                          className="font-display text-xl leading-none"
                        >
                          {value}
                        </m.span>
                      </div>
                      <div
                        className="relative mt-1 h-2 rounded-full bg-surface-soft"
                        aria-hidden="true"
                      >
                        <span
                          className={`block h-full rounded-full ${
                            value >= cap ? 'bg-gold' : 'bg-accent'
                          }`}
                          style={{ width: `${value}%` }}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute -top-1 h-4 w-0.5 rounded bg-ink"
                          style={{ left: `calc(${Math.min(99, cap)}% - 1px)` }}
                        />
                      </div>
                      <span className="mt-0.5 block text-xs text-muted">
                        {format(c.profile.cap, { cap })}
                        {status ? ` · ${status}` : ''}
                      </span>
                    </div>
                    <button
                      data-attribute={key}
                      className="flex min-h-11 min-w-12 flex-col items-center justify-center rounded-control border border-line bg-surface px-2 text-sm font-bold transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!affordable || Boolean(block)}
                      aria-label={
                        cost === null
                          ? `${attributeName(key)}: ${c.profile.atMax}`
                          : format(c.profile.raise, {
                              attribute: attributeName(key),
                              value: value + 1,
                              cost: plural(cost, c.common.attributePoint, c.common.attributePoints),
                            })
                      }
                      aria-describedby={reason ? `reason-${key}` : undefined}
                      onClick={() => raise(key)}
                    >
                      <span aria-hidden="true">{cost === null ? '—' : c.profile.raiseShort}</span>
                      {/* The usual price is in the helper text; only a dearer point says so. */}
                      {cost !== null && cost > CONFIG.career.costs.belowCap && (
                        <span aria-hidden="true" className="text-xs font-semibold text-muted">
                          {format(c.profile.cost, { cost })}
                        </span>
                      )}
                    </button>
                    {reason && (
                      <span id={`reason-${key}`} className="sr-only">
                        {reason}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <details className="mt-6 rounded-control border border-line p-3">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">
          {player.primaryPosition === 'GK' ? c.profile.untrained : c.profile.untrainedKeeper}
        </summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {groups.untrained.map((key) => (
            <li key={key} className="flex justify-between gap-2 text-sm text-muted">
              <span className="min-w-0 break-words">{attributeName(key)}</span>
              <span className="shrink-0 font-semibold">{attributeValue(player, key)}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function Summary({
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
  const contract = player.contractId ? world.contracts[player.contractId] : undefined;
  const band = potentialBand(player.potential);
  return (
    <section
      aria-labelledby="summary-heading"
      className={`${ui.panel} xl:col-start-2 xl:row-start-1`}
    >
      <div className="flex flex-wrap items-center gap-4">
        <PlayerPortrait player={player} age={age} className="h-20 w-20 shrink-0" />
        <div className="min-w-0 flex-1 basis-40">
          <h2 id="summary-heading" className="font-display text-[2rem] leading-none break-words">
            {player.name}
          </h2>
          <p className="text-sm text-muted">
            {c.positions[player.primaryPosition]} · {format(c.common.age, { age })}
          </p>
          {club && (
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
              <CrestImage crest={club.crest} alt="" className="h-5 w-5 shrink-0" />
              <span className="min-w-0 break-words">{club.name}</span>
            </p>
          )}
        </div>
      </div>
      <div className="mt-4">
        <XpBar career={career} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="col-span-2 rounded-control bg-art-gold p-3">
          <dt className="text-xs font-semibold text-muted">{c.profile.potential}</dt>
          <dd className="font-display text-2xl leading-tight">{c.profile.potentialBands[band]}</dd>
          <dd className="text-xs text-muted">{c.profile.potentialBody}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">{c.profile.archetype}</dt>
          <dd className="font-semibold">
            {c.archetypes[career.archetype]?.name ?? career.archetype}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">{c.profile.foot}</dt>
          <dd className="font-semibold">{c.feet[player.foot]}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">{c.profile.nationality}</dt>
          <dd className="font-semibold">{world.countries[player.nationalityId]?.name}</dd>
        </div>
        {contract && (
          <div>
            <dt className="text-xs font-semibold text-muted">{c.profile.contract}</dt>
            <dd className="font-semibold">
              {format(c.profile.contractValue, {
                role: c.profile.roles[contract.role],
                season: contract.end.season,
              })}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Positions({ player }: { player: Player }) {
  const entries = [
    { position: player.primaryPosition, familiarity: 100, primary: true },
    ...player.secondaryPositions
      .filter((entry) => entry.position !== player.primaryPosition)
      .sort((a, b) => b.familiarity - a.familiarity)
      .map((entry) => ({ ...entry, primary: false })),
  ];
  return (
    <section
      aria-labelledby="positions-heading"
      className={`${ui.panel} xl:col-start-2 xl:row-start-2`}
    >
      <h2 id="positions-heading" className={ui.heading}>
        {c.profile.positions}
      </h2>
      <ul className="mt-4 grid gap-3">
        {entries.map((entry) => (
          <li
            key={entry.position}
            className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3"
          >
            <span
              className={`grid h-11 place-items-center rounded-control font-display text-xl ${
                entry.primary ? 'bg-accent text-on-accent' : 'bg-surface-soft'
              }`}
            >
              {entry.position}
            </span>
            <div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-semibold">{c.positions[entry.position]}</span>
                <span className="text-muted">
                  {entry.primary
                    ? c.profile.primary
                    : format(c.profile.familiarity, { value: entry.familiarity })}
                </span>
              </div>
              <div
                role="meter"
                aria-label={c.positions[entry.position]}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={entry.familiarity}
                className="mt-1 h-2 overflow-hidden rounded-full bg-surface-soft"
              >
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${entry.familiarity}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className={`${ui.muted} mt-3`}>{c.profile.learnPosition}</p>
    </section>
  );
}

function Hidden({ player }: { player: Player }) {
  const { appearances, order } = CONFIG.career.reveal;
  return (
    <section
      aria-labelledby="hidden-heading"
      className={`${ui.panel} xl:col-start-2 xl:row-start-3 xl:self-start`}
    >
      <h2 id="hidden-heading" className={ui.heading}>
        {c.profile.hidden}
      </h2>
      <p className={`${ui.muted} mt-1`}>{c.profile.hiddenBody}</p>
      <ul className="mt-4 grid gap-2">
        {order.map((key, index) => {
          const revealed = player.hidden.revealed.includes(key);
          return (
            <li
              key={key}
              className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-surface-soft px-3 py-2"
            >
              <span className="text-sm font-semibold">{c.profile.hiddenNames[key]}</span>
              {revealed ? (
                <span className="font-display text-2xl leading-none">{player.hidden[key]}</span>
              ) : (
                <span className="text-right text-xs text-muted">
                  {format(c.profile.revealAt, { count: appearances[index]! })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const resultTone = (result: CareerMatchRecord['result']) =>
  result === 'win'
    ? 'bg-accent text-on-accent'
    : result === 'loss'
      ? 'bg-danger-soft text-danger'
      : 'bg-surface-soft';

function ResultScore({ match }: { match: CareerMatchRecord }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`mr-2 inline-grid h-6 w-6 shrink-0 place-items-center rounded-full font-display ${resultTone(match.result)}`}
      >
        {c.hub.results[match.result]}
      </span>
      <span className="sr-only">{c.hub.resultNames[match.result]} </span>
      {match.score[0]}–{match.score[1]}
      {match.decided && (
        <span className="ml-1 text-xs text-muted">{c.profile.decided[match.decided]}</span>
      )}
    </>
  );
}

function AutoTag({ match }: { match: CareerMatchRecord }) {
  if (!match.auto) return null;
  return (
    <span
      className="ml-2 rounded-full bg-surface-soft px-2 py-0.5 text-xs font-bold uppercase text-muted"
      title={c.profile.autoLabel}
    >
      {c.profile.auto}
      <span className="sr-only">: {c.profile.autoLabel}</span>
    </span>
  );
}

function History({ world, career }: { world: World; career: Career }) {
  const [shown, setShown] = useState(PAGE);
  const matches = [...career.matches].reverse();
  const lines = seasonLines(career);
  const cols = c.profile.columns;
  const visible = matches.slice(0, shown);
  const cell = 'px-1.5 py-2 sm:px-2';
  return (
    <section
      aria-labelledby="history-heading"
      className={`${ui.panel} xl:col-span-2 xl:col-start-1 xl:row-start-4`}
    >
      <h2 id="history-heading" className={ui.heading}>
        {c.profile.history}
      </h2>
      {!matches.length ? (
        <p className={`${ui.muted} mt-3`}>{c.profile.historyEmpty}</p>
      ) : (
        <>
          <h3 className="mt-5 text-sm font-semibold text-muted">{c.profile.seasons}</h3>
          <div className="relative mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm sm:min-w-[34rem]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  {[
                    cols.season,
                    cols.apps,
                    cols.goals,
                    cols.assists,
                    cols.avg,
                    cols.cleanSheets,
                    cols.xp,
                  ].map((label) => (
                    <th key={label} scope="col" className={`${cell} align-bottom font-semibold`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.season} className="border-b border-line/60">
                    <th scope="row" className={`${cell} text-left font-semibold`}>
                      {line.season}
                    </th>
                    <td className={cell}>{line.apps}</td>
                    <td className={cell}>{line.goals}</td>
                    <td className={cell}>{line.assists}</td>
                    <td className={cell}>{line.rating.toFixed(2)}</td>
                    <td className={cell}>{line.cleanSheets}</td>
                    <td className={cell}>{line.xp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mt-6 text-sm font-semibold text-muted">{c.profile.matches}</h3>
          {/* Phones: one stacked row per match, so score, rating and XP are never cut off. */}
          <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] sm:hidden">
            {visible.map((match) => {
              const opponent = world.clubs[match.opponentId];
              return (
                <li key={match.fixtureId} className="border-b border-line/60 py-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex shrink-0 items-center font-semibold whitespace-nowrap">
                      <ResultScore match={match} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {opponent?.name ?? match.opponentId}
                      <span className="ml-1 text-xs font-normal text-muted">
                        ({match.home ? c.common.home : c.common.away})
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-lg leading-none">
                      <span className="sr-only">{cols.rating} </span>
                      {match.rating.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs text-muted">
                    <span className="min-w-0">
                      {format(c.profile.matchLine, {
                        competition: competitionName(world, match.competitionId),
                        season: match.season,
                        week: match.week,
                      })}
                    </span>
                    <span className="whitespace-nowrap">
                      {cols.ga} {match.goals}/{match.assists} · {cols.xp} +{match.xp}
                      <AutoTag match={match} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="relative mt-2 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  {[
                    cols.season,
                    cols.opponent,
                    cols.competition,
                    cols.score,
                    cols.rating,
                    cols.ga,
                    cols.xp,
                  ].map((label) => (
                    <th key={label} scope="col" className="px-2 py-2 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((match) => {
                  const opponent = world.clubs[match.opponentId];
                  return (
                    <tr key={match.fixtureId} className="border-b border-line/60">
                      <td className="px-2 py-2 whitespace-nowrap text-muted">
                        {match.season} · {format(c.common.week, { week: match.week })}
                      </td>
                      <th scope="row" className="px-2 py-2 text-left font-semibold">
                        <span className="flex items-center gap-2">
                          {opponent && (
                            <CrestImage
                              crest={opponent.crest}
                              alt=""
                              className="h-6 w-6 shrink-0"
                            />
                          )}
                          <span className="truncate">
                            {opponent?.name ?? match.opponentId}
                            <span className="ml-1 text-xs font-normal text-muted">
                              ({match.home ? c.common.home : c.common.away})
                            </span>
                          </span>
                        </span>
                      </th>
                      <td className="px-2 py-2 text-muted">
                        {competitionName(world, match.competitionId)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <ResultScore match={match} />
                      </td>
                      <td className="px-2 py-2">{match.rating.toFixed(1)}</td>
                      <td className="px-2 py-2">
                        {match.goals}/{match.assists}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        +{match.xp}
                        <AutoTag match={match} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {matches.length > shown && (
            <button
              className="button secondary mt-4"
              onClick={() => setShown((value) => value + PAGE)}
            >
              {format(c.profile.showMore, { count: Math.min(PAGE, matches.length - shown) })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
