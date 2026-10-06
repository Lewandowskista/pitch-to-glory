import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONFIG } from '../../engine/config';
import { nextCareerFixture } from '../../engine/career/fixtures';
import {
  activeLoan,
  careerContract,
  careerSelection,
  contractAskState,
  canRequestLoan,
  lineOf,
  managerTrust,
  marketValue,
  relationshipValue,
  validTerms,
  windowState,
} from '../../engine/career/market';
import type {
  Career,
  Club,
  ContractTerms,
  Negotiation,
  Player,
  TransferOffer,
  World,
} from '../../model/domain';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/Icon';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { marketText as m } from '../../i18n/market';
import { CareerPage, CrestImage, Meter, plural, ui } from './shared';
import { useUrlDialog } from './useUrlDialog';
import { cultureFit } from '../../engine/career/social';
import { socialText } from '../../i18n/social';
import { cultureTraits } from './socialUi';
import {
  ActionError,
  BlockNote,
  money,
  roleName,
  Stat,
  useMarketAction,
  weekly,
  WindowBanner,
} from './marketUi';

const MK = CONFIG.career.market;
const ROLE_ORDER: ContractTerms['role'][] = ['key', 'rotation', 'youth', 'backup'];

export default function CareerTransfers() {
  return (
    <CareerPage eyebrow={m.eyebrow} title={m.titles.transfers}>
      {(context) => <TransfersContent {...context} />}
    </CareerPage>
  );
}

function TransfersContent({
  world,
  career,
  player,
  club,
}: {
  world: World;
  career: Career;
  player: Player;
  club: Club | undefined;
}) {
  const talks = useUrlDialog('offer');
  const offer = talks.value ? world.offers.find((entry) => entry.id === talks.value) : undefined;
  if (offer)
    return (
      <div className="grid gap-5">
        <WindowBanner world={world} />
        <Talks world={world} offer={offer} onClose={talks.close} />
      </div>
    );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <WindowBanner world={world} />
      </div>
      <Offers world={world} onOpen={(id) => talks.open(id)} />
      <ContractCard world={world} player={player} />
      <PlayingTime world={world} career={career} player={player} club={club} />
      <Requests world={world} career={career} />
      <Earnings career={career} />
      <Interest world={world} />
      <Moves world={world} career={career} />
    </div>
  );
}

function ContractCard({ world, player }: { world: World; player: Player }) {
  const contract = careerContract(world);
  const parent = world.clubs[contract.clubId]!;
  const loan = activeLoan(world, player.id);
  const final = contract.end.season <= world.date.season;
  return (
    <section aria-labelledby="contract-heading" className={`${ui.panel} lg:col-span-7`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="contract-heading" className={ui.heading}>
          {m.contract.title}
        </h2>
        {final && <span className={ui.chip}>{m.contract.finalSeason}</span>}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <CrestImage crest={parent.crest} alt="" className="h-12 w-12 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{parent.name}</p>
          <p className="text-sm text-muted">
            {roleName(contract.role)} · {m.roleBodies[contract.role]}
          </p>
        </div>
      </div>
      {loan && (
        <div className="mt-4 rounded-control border border-accent/40 bg-accent-soft p-4 text-sm">
          <p className="font-semibold">
            {format(m.contract.onLoan, {
              club: world.clubs[loan.destinationClubId]!.name,
              season: loan.end.season,
            })}
          </p>
          <p className="mt-1">
            {m.contract.loanRole}: {roleName(loan.role)} ·{' '}
            {format(m.contract.loanShare, {
              club: world.clubs[loan.destinationClubId]!.name,
              share: Math.round(loan.wageShare * 100),
            })}
          </p>
          {loan.purchaseOption !== null && (
            <p className="mt-1">
              {format(m.contract.purchaseOption, { fee: money(loan.purchaseOption) })}
            </p>
          )}
        </div>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={m.contract.wage} value={weekly(contract.weeklyWage)} />
        <Stat
          label={m.contract.ends}
          value={format(m.contract.endsValue, { season: contract.end.season })}
        />
        <Stat label={m.contract.value} value={money(marketValue(world, player))} />
        <Stat
          label={m.contract.releaseClause}
          value={
            contract.releaseClause === null ? m.contract.noClause : money(contract.releaseClause)
          }
        />
        <Stat
          label={m.contract.sellOn}
          value={
            contract.sellOnClubId && contract.sellOnPercent
              ? format(m.contract.sellOnValue, {
                  percent: contract.sellOnPercent,
                  club: world.clubs[contract.sellOnClubId]?.name ?? '',
                })
              : m.contract.noClause
          }
        />
        <Stat label={m.contract.loyalty} value={money(contract.loyaltyBonus)} />
      </dl>
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
        {m.contract.bonuses}
      </h3>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[
          [m.contract.appearance, contract.appearanceBonus],
          [m.contract.goal, contract.goalBonus],
          [m.contract.cleanSheet, contract.cleanSheetBonus],
        ].map(([label, value]) => (
          <div key={label} className="rounded-control bg-surface-soft p-2">
            <dt className="text-[0.68rem] font-bold uppercase tracking-wider text-muted">
              {label}
            </dt>
            <dd className="font-display text-xl leading-tight">{money(Number(value))}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        {m.contract.cleanSheetNote} · {m.contract.loyaltyBody}
      </p>
    </section>
  );
}

function PlayingTime({
  world,
  career,
  player,
  club,
}: {
  world: World;
  career: Career;
  player: Player;
  club: Club | undefined;
}) {
  const selection = career.market.selection;
  const fixture = nextCareerFixture(world);
  const chance = fixture && !player.injuryId ? careerSelection(world, fixture) : null;
  const line = lineOf(player.primaryPosition);
  const manager = club ? world.managers[club.managerId] : undefined;
  return (
    <section aria-labelledby="playing-heading" className={`${ui.panel} lg:col-span-5`}>
      <h2 id="playing-heading" className={ui.heading}>
        {m.playing.title}
      </h2>
      <p className={`${ui.muted} mt-1`}>{m.playing.body}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Stat label={m.playing.selected} value={selection.selected} />
        <Stat label={m.playing.dropped} value={selection.dropped} />
      </dl>
      {chance && (
        <div className="mt-4">
          {chance.registered ? (
            <>
              <Meter
                label={m.playing.chance}
                value={chance.probability * 100}
                tone={chance.probability < 0.5 ? 'danger' : 'accent'}
              />
              <p className="mt-1.5 text-xs text-muted">
                {format(m.playing.chanceBody, {
                  count: MK.slots[line],
                  line: m.playing.lines[line],
                })}
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold">{m.playing.unregistered}</p>
          )}
        </div>
      )}
      <p
        className={`mt-4 text-sm font-semibold ${selection.promiseBroken ? 'text-danger' : 'text-accent'}`}
      >
        {selection.promiseBroken ? m.playing.promiseBroken : m.playing.promiseKept}
      </p>
      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">
        {m.relations.title}
      </h3>
      <div className="mt-2 grid gap-3">
        <Meter label={m.relations.trust} value={managerTrust(world)} />
        {manager && (
          <p className="-mt-1.5 text-xs text-muted">
            {format(m.relations.manager, { name: manager.name })}
          </p>
        )}
        {club && (
          <Meter
            label={m.relations.fans}
            value={relationshipValue(world, 'fans', club.id)}
            tone="gold"
          />
        )}
      </div>
    </section>
  );
}

function Requests({ world, career }: { world: World; career: Career }) {
  const { run, error, block } = useMarketAction();
  const confirm = useUrlDialog('confirm');
  const [notice, setNotice] = useState('');
  const market = career.market;
  const ask = contractAskState(world);
  const onLoan = Boolean(activeLoan(world, career.playerId));
  const T = MK.transferRequest;
  return (
    <section aria-labelledby="requests-heading" className={`${ui.panel} lg:col-span-5`}>
      <h2 id="requests-heading" className={ui.heading}>
        {m.requests.title}
      </h2>
      <div className="mt-4 grid gap-4">
        <BlockNote block={block} />
        <ActionError error={error} />
        <p role="status" className="text-sm font-semibold text-accent empty:hidden">
          {notice}
        </p>
        <div>
          <button
            className="button secondary w-full sm:w-auto"
            disabled={Boolean(block) || ask !== 'available'}
            onClick={() => {
              const result = run({ type: 'ask-contract' });
              if (result === 'opened') setNotice(m.requests.askOpened);
              else if (result === 'refused')
                setNotice(format(m.requests.askRefused, { weeks: MK.renewal.askCooldownWeeks }));
            }}
          >
            {m.requests.askContract}
          </button>
          <p className="mt-1.5 text-xs text-muted">
            {ask === 'available'
              ? m.requests.askContractBody
              : ask === 'cooldown'
                ? format(m.requests.askStates.cooldown, {
                    week: market.renewalAskAfter?.week ?? '',
                  })
                : m.requests.askStates[ask]}
          </p>
        </div>
        <div>
          {market.transferRequest ? (
            <>
              <p className="text-sm font-semibold">
                {format(m.requests.transferActive, {
                  week: market.transferRequest.week,
                  season: market.transferRequest.season,
                })}
              </p>
              <button
                className="text-button -ml-3 mt-1"
                disabled={Boolean(block)}
                onClick={() => run({ type: 'withdraw-transfer-request' })}
              >
                {m.requests.withdraw}
              </button>
            </>
          ) : (
            <>
              <button
                className="button secondary w-full sm:w-auto"
                disabled={Boolean(block) || onLoan}
                onClick={() => confirm.open('transfer')}
              >
                {m.requests.transferRequest}
              </button>
              <p className="mt-1.5 text-xs text-muted">{m.requests.transferRequestBody}</p>
            </>
          )}
        </div>
        <div>
          {market.loanRequest ? (
            <>
              <p className="text-sm font-semibold">{m.requests.loanActive}</p>
              <button
                className="text-button -ml-3 mt-1"
                disabled={Boolean(block)}
                onClick={() => run({ type: 'withdraw-loan-request' })}
              >
                {m.requests.loanWithdraw}
              </button>
            </>
          ) : (
            <>
              <button
                className="button secondary w-full sm:w-auto"
                disabled={Boolean(block) || !canRequestLoan(world)}
                onClick={() => run({ type: 'loan-request' })}
              >
                {m.requests.loanRequest}
              </button>
              <p className="mt-1.5 text-xs text-muted">
                {canRequestLoan(world) || onLoan
                  ? m.requests.loanRequestBody
                  : m.requests.loanUnavailable}
              </p>
            </>
          )}
        </div>
      </div>
      {confirm.value === 'transfer' && (
        <Dialog
          title={m.requests.transferConfirmTitle}
          body={format(m.requests.transferConfirmBody, {
            trust: Math.abs(market.selection.promiseBroken ? T.brokenTrust : T.trust),
            fans: Math.abs(T.fans),
            discount: Math.round(MK.transferRequestDiscount * 100),
          })}
          confirmLabel={m.requests.transferConfirm}
          danger
          onClose={confirm.close}
          onConfirm={() => {
            confirm.close();
            run({ type: 'transfer-request' });
          }}
        />
      )}
    </section>
  );
}

function Earnings({ career }: { career: Career }) {
  const finances = career.market.finances;
  return (
    <section aria-labelledby="earnings-heading" className={`${ui.panel} lg:col-span-7`}>
      <h2 id="earnings-heading" className={ui.heading}>
        {m.earnings.title}
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={m.earnings.cash} value={money(finances.cash)} />
        <Stat label={m.earnings.lifetime} value={money(finances.lifetimeEarnings)} />
        <Stat label={m.earnings.agentFees} value={money(finances.agentFees)} />
      </dl>
      <p className="mt-4 text-sm">
        {finances.lastPay ? (
          <>
            <strong>
              {m.earnings.lastPay} ·{' '}
              {format(c.common.seasonWeek, {
                season: finances.lastPay.season,
                week: finances.lastPay.week,
              })}
            </strong>
            <br />
            {format(m.earnings.lastPayValue, {
              wage: money(finances.lastPay.wage),
              bonuses: money(finances.lastPay.bonuses),
              commission: money(finances.lastPay.commission),
            })}
          </>
        ) : (
          m.earnings.none
        )}
      </p>
      {career.market.pendingBonuses > 0 && (
        <p className="mt-2 text-sm text-muted">
          {format(m.earnings.pending, { amount: money(career.market.pendingBonuses) })}
        </p>
      )}
    </section>
  );
}

function OfferSummary({ world, offer }: { world: World; offer: TransferOffer }) {
  const negotiation = offer.negotiationId ? world.negotiations[offer.negotiationId] : undefined;
  const terms = negotiation?.rounds.filter((round) => round.actor === 'club').at(-1)?.terms;
  if (offer.loan)
    return (
      <span>
        {format(m.offers.loanTerms, {
          role: roleName(offer.loan.role),
          club: world.clubs[offer.clubId]!.name,
          share: Math.round(offer.loan.wageShare * 100),
        })}
      </span>
    );
  if (!terms)
    return <span>{format(m.offers.bids, { bids: offer.bids.map(money).join(' → ') })}</span>;
  return (
    <span>
      {format(m.talks.summary, {
        wage: weekly(terms.weeklyWage),
        years: plural(terms.years, m.talks.yearsOne, m.talks.yearsValue),
        role: roleName(terms.role),
      })}
    </span>
  );
}

function Offers({ world, onOpen }: { world: World; onOpen: (id: string) => void }) {
  const open = world.offers.filter(
    (offer) => offer.status === 'terms' || offer.status === 'agreed',
  );
  const earlier = world.offers
    .filter((offer) => offer.status !== 'terms' && offer.status !== 'agreed')
    .slice(-6)
    .reverse();
  return (
    <section aria-labelledby="offers-heading" className={`${ui.panel} lg:col-span-12`}>
      <h2 id="offers-heading" className={ui.heading}>
        {m.offers.title}
      </h2>
      {open.length ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {open.map((offer) => {
            const club = world.clubs[offer.clubId]!;
            return (
              <li
                key={offer.id}
                className="flex flex-col gap-3 rounded-control border border-line bg-surface-soft p-4"
              >
                <div className="flex items-center gap-3">
                  <CrestImage crest={club.crest} alt="" className="h-12 w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{club.name}</p>
                    <p className="text-xs text-muted">
                      {m.kinds[offer.kind]} · {m.statuses[offer.status]}
                    </p>
                  </div>
                  {offer.fee > 0 && (
                    <span className="font-display text-2xl leading-none">{money(offer.fee)}</span>
                  )}
                </div>
                <p className="text-sm">
                  <OfferSummary world={world} offer={offer} />
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted">
                    {offer.status === 'terms'
                      ? format(m.offers.expires, { week: offer.expires.week })
                      : offer.releaseClauseTriggered
                        ? m.offers.clause
                        : ''}
                  </span>
                  <button className="button" onClick={() => onOpen(offer.id)}>
                    {offer.status === 'terms' ? m.offers.open : m.offers.view}
                    <Icon name="arrow" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-4 max-w-prose`}>{m.offers.empty}</p>
      )}
      {earlier.length > 0 && (
        <>
          <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-muted">
            {m.offers.history}
          </h3>
          <ul className="mt-2 divide-y divide-line">
            {earlier.map((offer) => (
              <li
                key={offer.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
              >
                <span className="font-semibold">{world.clubs[offer.clubId]!.name}</span>
                <span className="text-muted">
                  {m.kinds[offer.kind]} · {m.statuses[offer.status]}
                  {offer.fee > 0 ? ` · ${money(offer.fee)}` : ''}
                </span>
                {offer.negotiationId && (
                  <button className="text-button ml-auto" onClick={() => onOpen(offer.id)}>
                    {m.offers.view}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Interest({ world }: { world: World }) {
  const entries = [...world.scouting].sort((a, b) => b.confidence - a.confidence);
  const parent = world.clubs[careerContract(world).clubId]!;
  return (
    <section aria-labelledby="interest-heading" className={`${ui.panel} lg:col-span-7`}>
      <h2 id="interest-heading" className={ui.heading}>
        {m.interest.title}
      </h2>
      <p className={`${ui.muted} mt-1 max-w-prose`}>{m.interest.body}</p>
      {entries.length ? (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
          {entries.map((interest) => {
            const club = world.clubs[interest.clubId]!;
            const league = world.leagues[club.leagueId];
            return (
              <li key={interest.id} className="rounded-control bg-surface-soft p-3">
                <div className="flex items-center gap-3">
                  <CrestImage crest={club.crest} alt="" className="h-10 w-10 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{club.name}</p>
                    <p className="truncate text-xs text-muted">
                      {league?.name}
                      {club.countryId !== parent.countryId
                        ? ` · ${m.interest.abroad}: ${world.countries[club.countryId]!.name}`
                        : ''}
                    </p>
                  </div>
                  <span className={ui.chip}>
                    {interest.kind === 'loan' ? `${m.interest.loan} · ` : ''}
                    {m.stages[interest.stage]}
                  </span>
                </div>
                <div className="mt-3">
                  <Meter
                    label={`${m.interest.confidence} · ${club.name}`}
                    value={interest.confidence}
                    tone={interest.stage === 'offer' ? 'gold' : 'accent'}
                  />
                  <p className="mt-1 text-xs text-muted">
                    {format(m.interest.weeks, { weeks: interest.weeksObserved })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-4`}>{m.interest.empty}</p>
      )}
    </section>
  );
}

function Moves({ world, career }: { world: World; career: Career }) {
  const moves = [...career.market.moves].reverse();
  return (
    <section aria-labelledby="moves-heading" className={`${ui.panel} lg:col-span-5`}>
      <h2 id="moves-heading" className={ui.heading}>
        {m.moves.title}
      </h2>
      {moves.length ? (
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={m.moves.table}>
          <table className="w-full min-w-[22rem] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="py-2 pr-3 font-bold">
                  {m.moves.columns.date}
                </th>
                <th scope="col" className="py-2 pr-3 font-bold">
                  {m.moves.columns.move}
                </th>
                <th scope="col" className="py-2 pr-3 font-bold">
                  {m.moves.columns.club}
                </th>
                <th scope="col" className="py-2 text-right font-bold">
                  {m.moves.columns.fee}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {moves.map((move, index) => (
                <tr key={`${move.date.season}-${move.date.week}-${index}`}>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted">
                    {format(c.common.seasonWeek, {
                      season: move.date.season,
                      week: move.date.week,
                    })}
                  </td>
                  <td className="py-2 pr-3">{m.moves.kinds[move.kind]}</td>
                  <td className="py-2 pr-3 font-semibold">{world.clubs[move.toClubId]?.name}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {move.fee > 0 ? money(move.fee) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={`${ui.muted} mt-4`}>{m.moves.empty}</p>
      )}
    </section>
  );
}

/** The latest club terms, as the starting point of the player's counter-offer. */
function clubTerms(negotiation: Negotiation): ContractTerms {
  return negotiation.rounds.filter((round) => round.actor === 'club').at(-1)!.terms;
}

function TermsList({ terms }: { terms: ContractTerms }) {
  return (
    <dl className="grid grid-cols-2 gap-3">
      <Stat label={m.talks.wage} value={weekly(terms.weeklyWage)} />
      <Stat
        label={m.talks.years}
        value={plural(terms.years, m.talks.yearsOne, m.talks.yearsValue)}
      />
      <Stat label={m.talks.role} value={roleName(terms.role)} />
      <Stat
        label={m.talks.clause}
        value={terms.releaseClause === null ? m.talks.clauseNone : money(terms.releaseClause)}
      />
      <Stat label={m.talks.signingBonus} value={money(terms.signingBonus)} />
    </dl>
  );
}

function Talks({
  world,
  offer,
  onClose,
}: {
  world: World;
  offer: TransferOffer;
  onClose: () => void;
}) {
  const club = world.clubs[offer.clubId]!;
  const { run, error, block } = useMarketAction();
  const confirm = useUrlDialog('confirm');
  const negotiation = offer.negotiationId ? world.negotiations[offer.negotiationId] : undefined;
  const [outcome, setOutcome] = useState('');
  const isOpen = offer.status === 'terms';
  const windowClosed =
    (offer.kind === 'transfer' || offer.kind === 'loan') && !windowState(world).open;
  const disabled = Boolean(block) || !isOpen || windowClosed;
  const agent = world.career!.market.agentId
    ? world.agents[world.career!.market.agentId]
    : undefined;
  return (
    <section aria-labelledby="talks-heading" className={`${ui.panel} flex flex-col gap-5`}>
      <div className="flex flex-wrap items-center gap-4">
        <CrestImage crest={club.crest} alt="" className="h-16 w-16 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={ui.eyebrow}>
            {m.kinds[offer.kind]} · {m.statuses[offer.status]}
          </p>
          <h2 id="talks-heading" className="font-display text-[2.2rem] leading-none break-words">
            {format(m.talks.title, { club: club.name })}
          </h2>
          {offer.fee > 0 && (
            <p className="mt-1 text-sm">{format(m.talks.fee, { fee: money(offer.fee) })}</p>
          )}
          <p className="mt-1 text-sm">
            {format(socialText.fit.talks, { club: club.name })}:{' '}
            <strong>{cultureFit(world, world.players[world.career!.playerId]!, club).value}</strong>{' '}
            · {cultureTraits(club).join(' · ')}
          </p>
        </div>
        <button className="button secondary" onClick={onClose}>
          {m.talks.back}
        </button>
      </div>
      <BlockNote block={block} />
      <ActionError error={error} />
      <p role="status" className="text-sm font-semibold text-accent empty:hidden">
        {outcome}
      </p>
      {offer.kind === 'pre-contract' && (
        <p className="text-sm">{format(m.talks.preContract, { club: club.name })}</p>
      )}
      {offer.kind === 'renewal' && <p className="text-sm">{m.talks.renewalNote}</p>}
      {!isOpen && <p className="text-sm font-semibold">{m.talks.closed}</p>}
      {isOpen && windowClosed && <p className="text-sm font-semibold">{m.talks.windowClosed}</p>}
      {offer.loan ? (
        <LoanTerms
          world={world}
          offer={offer}
          disabled={disabled}
          onAccept={() => run({ type: 'accept', offerId: offer.id })}
          onDecline={() => run({ type: 'decline', offerId: offer.id })}
        />
      ) : (
        negotiation && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                {m.talks.clubTerms}
              </h3>
              <TermsList terms={clubTerms(negotiation)} />
              {agent && negotiation.agentEstimate !== null ? (
                <p className="text-sm">
                  {format(m.talks.agentRead, {
                    agent: agent.name,
                    wage: weekly(negotiation.agentEstimate),
                  })}
                </p>
              ) : (
                <p className="text-sm">
                  {m.talks.noAgent}{' '}
                  <Link className="font-semibold text-accent underline" to="/career/agent">
                    {m.inbox.goAgent}
                  </Link>
                </p>
              )}
              {isOpen && (
                <p className="text-xs text-muted">
                  {negotiation.patience === 0
                    ? m.talks.patienceNone
                    : plural(negotiation.patience, m.talks.patienceOne, m.talks.patience)}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  className="button"
                  disabled={disabled}
                  onClick={() => {
                    if (run({ type: 'accept', offerId: offer.id }))
                      setOutcome(m.talks.outcomes.accept);
                  }}
                >
                  {m.talks.accept}
                </button>
                <button
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => confirm.open('decline')}
                >
                  {m.talks.decline}
                </button>
              </div>
            </div>
            <CounterForm
              key={`${negotiation.id}:${negotiation.rounds.length}`}
              negotiation={negotiation}
              disabled={disabled}
              onSubmit={(terms) => {
                const result = run({ type: 'counter', offerId: offer.id, terms });
                if (result === 'accept' || result === 'counter' || result === 'walk-away')
                  setOutcome(m.talks.outcomes[result]);
              }}
            />
          </div>
        )
      )}
      {negotiation && <Rounds world={world} offer={offer} negotiation={negotiation} />}
      {confirm.value === 'decline' && (
        <Dialog
          title={m.talks.declineTitle}
          body={format(m.talks.declineBody, { club: club.name })}
          confirmLabel={m.talks.decline}
          danger
          onClose={confirm.close}
          onConfirm={() => {
            confirm.close();
            run({ type: 'decline', offerId: offer.id });
          }}
        />
      )}
    </section>
  );
}

function LoanTerms({
  world,
  offer,
  disabled,
  onAccept,
  onDecline,
}: {
  world: World;
  offer: TransferOffer;
  disabled: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const loan = offer.loan!;
  const club = world.clubs[offer.clubId]!;
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={m.contract.loanRole} value={roleName(loan.role)} />
        <Stat
          label={m.talks.wage}
          value={format(m.contract.loanShare, {
            club: club.name,
            share: Math.round(loan.wageShare * 100),
          })}
        />
        <Stat
          label={m.contract.purchaseLabel}
          value={loan.purchaseOption === null ? m.contract.noClause : money(loan.purchaseOption)}
        />
      </dl>
      <p className="text-sm text-muted">{m.roleBodies[loan.role]}</p>
      <div className="flex flex-wrap gap-3">
        <button className="button" disabled={disabled} onClick={onAccept}>
          {m.talks.acceptLoan}
        </button>
        <button className="button secondary" disabled={disabled} onClick={onDecline}>
          {m.talks.declineLoan}
        </button>
      </div>
    </div>
  );
}

function CounterForm({
  negotiation,
  disabled,
  onSubmit,
}: {
  negotiation: Negotiation;
  disabled: boolean;
  onSubmit: (terms: ContractTerms) => void;
}) {
  const start = clubTerms(negotiation);
  const [wage, setWage] = useState(String(start.weeklyWage));
  const [years, setYears] = useState(start.years);
  const [role, setRole] = useState(start.role);
  const [clauseOn, setClauseOn] = useState(start.releaseClause !== null);
  const [clause, setClause] = useState(String(start.releaseClause ?? ''));
  const [bonus, setBonus] = useState(String(start.signingBonus));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setInvalid(false), [wage, clause, bonus]);
  const field =
    'min-h-12 w-full rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink disabled:opacity-60';
  const terms = (): ContractTerms => ({
    weeklyWage: Number(wage),
    years,
    role,
    releaseClause: clauseOn ? Number(clause) : null,
    signingBonus: Number(bonus),
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-control border border-line p-4"
      aria-labelledby="counter-heading"
      onSubmit={(event) => {
        event.preventDefault();
        const next = terms();
        if (!validTerms(next)) return setInvalid(true);
        onSubmit(next);
      }}
    >
      <h3 id="counter-heading" className="text-xs font-bold uppercase tracking-wider text-muted">
        {m.talks.yourTerms}
      </h3>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="counter-wage" className="mb-1.5 block text-sm font-semibold">
            {m.talks.wage}
          </label>
          <input
            id="counter-wage"
            type="number"
            inputMode="numeric"
            min={CONFIG.world.generation.wageFloor}
            step={1}
            value={wage}
            onChange={(event) => setWage(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="counter-years" className="mb-1.5 block text-sm font-semibold">
            {m.talks.years}
          </label>
          <select
            id="counter-years"
            value={years}
            onChange={(event) => setYears(Number(event.target.value))}
            className={field}
          >
            {Array.from({ length: MK.negotiation.maximumYears }, (_, index) => index + 1).map(
              (count) => (
                <option key={count} value={count}>
                  {plural(count, m.talks.yearsOne, m.talks.yearsValue)}
                </option>
              ),
            )}
          </select>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-semibold">{m.talks.role}</legend>
          <div className="grid grid-cols-2 gap-1 rounded-control bg-surface-soft p-1 sm:grid-cols-4">
            {ROLE_ORDER.map((option) => (
              <label
                key={option}
                className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-[0.6rem] px-1 text-center text-xs leading-tight font-bold has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent"
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="counter-role"
                  value={option}
                  checked={role === option}
                  onChange={() => setRole(option)}
                />
                {roleName(option)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={clauseOn}
              onChange={(event) => setClauseOn(event.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            {m.talks.clauseAsk}
          </label>
          <label htmlFor="counter-clause" className="sr-only">
            {m.talks.clause}
          </label>
          <input
            id="counter-clause"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            disabled={!clauseOn}
            value={clause}
            onChange={(event) => setClause(event.target.value)}
            className={`${field} mt-2`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="counter-bonus" className="mb-1.5 block text-sm font-semibold">
            {m.talks.signingBonus}
          </label>
          <input
            id="counter-bonus"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={bonus}
            onChange={(event) => setBonus(event.target.value)}
            className={field}
          />
        </div>
      </fieldset>
      {invalid && (
        <p role="alert" className="inline-error">
          {format(m.talks.invalid, { floor: CONFIG.world.generation.wageFloor })}
        </p>
      )}
      <div>
        <button type="submit" className="button" disabled={disabled}>
          {m.talks.counter}
        </button>
      </div>
    </form>
  );
}

function Rounds({
  world,
  offer,
  negotiation,
}: {
  world: World;
  offer: TransferOffer;
  negotiation: Negotiation;
}) {
  const club = world.clubs[offer.clubId]!;
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{m.talks.rounds}</h3>
      <ol className="mt-2 grid gap-2">
        {negotiation.rounds.map((round, index) => (
          <li
            key={index}
            className={`rounded-control p-3 text-sm ${
              round.actor === 'club' ? 'bg-surface-soft' : 'border border-line'
            }`}
          >
            <p className="font-semibold">
              {round.actor === 'club'
                ? format(m.talks.roundClub, { club: club.name })
                : m.talks.roundPlayer}{' '}
              <span className="font-normal text-muted">
                ·{' '}
                {format(m.talks.summary, {
                  wage: weekly(round.terms.weeklyWage),
                  years: plural(round.terms.years, m.talks.yearsOne, m.talks.yearsValue),
                  role: roleName(round.terms.role),
                })}
              </span>
            </p>
            {round.response && (
              <p className="mt-1">
                <strong>{m.talks.responses[round.response]}.</strong>{' '}
                {(round.reasons ?? [])
                  .map((reason) => m.talks.reasons[reason as keyof typeof m.talks.reasons])
                  .join(' ')}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
