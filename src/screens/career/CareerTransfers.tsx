import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CONFIG } from '../../engine/config';
import { nextCareerFixture } from '../../engine/career/fixtures';
import {
  activeLoan,
  bridgeWage,
  careerContract,
  careerSelection,
  contractAskState,
  contractExpiring,
  canRequestLoan,
  lineOf,
  managerTrust,
  marketValue,
  openOffers,
  relationshipValue,
  windowState,
} from '../../engine/career/market';
import { cultureFit } from '../../engine/career/social';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
import type {
  Career,
  Club,
  ContractTerms,
  Negotiation,
  Player,
  TransferOffer,
  World,
} from '../../model/domain';
import { Artwork } from '../../ui/Artwork';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/Icon';
import { Button, CardTitle, Chip, HeroPanel, Panel, cx } from '../../ui/kit';
import { ValueMeter } from '../../ui/kit/ValueMeter';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { marketText as m } from '../../i18n/market';
import { socialText } from '../../i18n/social';
import { withSave } from './agenda';
import { competitionLine } from './selectionUi';
import { CareerPage, CrestImage, EmptySection, plural } from './shared';
import { cultureTraits } from './socialUi';
import { useUrlDialog } from './useUrlDialog';
import {
  ActionError,
  AgentPortrait,
  BlockNote,
  ClockIcon,
  money,
  roleName,
  Stat,
  useMarketAction,
  weekly,
  WindowBanner,
} from './marketUi';

const MK = CONFIG.career.market;
const ROLE_ORDER: ContractTerms['role'][] = ['key', 'rotation', 'youth', 'backup'];
const integer = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
/** The small uppercase label over a group inside a card (at most one per card). */
const groupLabel = 'text-xs font-extrabold tracking-[0.1em] text-muted uppercase';
/** A light outlined button for the field-green heroes. */
const heroButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-hero-ink/45 px-4.5 font-bold text-hero-ink transition-colors hover:bg-hero-ink/10';

export default function CareerTransfers() {
  return (
    <CareerPage
      title={m.titles.transfers}
      description={m.offers.pageBody}
      actions={({ world }) => <WindowBanner world={world} />}
    >
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
        <Talks world={world} offer={offer} onClose={talks.close} />
      </div>
    );
  return (
    <div className="grid gap-5">
      <Offers world={world} onOpen={(id) => talks.open(id)} />
      {/* Two independent columns on wide screens so short cards never stretch to match a long
          neighbour; on phones the columns dissolve and `order` sets the sequence. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:items-start">
        <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-5">
          <ContractCard world={world} player={player} />
          <Earnings career={career} />
          <Interest world={world} />
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-5">
          <PlayingTime world={world} career={career} player={player} club={club} />
          <Requests world={world} career={career} />
          <Moves world={world} career={career} />
        </div>
      </div>
    </div>
  );
}

function ContractCard({ world, player }: { world: World; player: Player }) {
  const contract = careerContract(world);
  const parent = world.clubs[contract.clubId]!;
  const loan = activeLoan(world, player.id);
  const final = contract.end.season <= world.date.season;
  // Option used and the season over: where to play next is the player's decision.
  const deciding = world.phase === 'complete' && contractExpiring(world);
  const talks = openOffers(world).filter((offer) => offer.kind === 'pre-contract').length;
  return (
    <Panel aria-labelledby="contract-heading" className="order-1 flex flex-col gap-4 lg:order-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle id="contract-heading" size="lg">
          {m.contract.title}
        </CardTitle>
        {final && <Chip tone="gold-soft">{m.contract.finalSeason}</Chip>}
      </div>
      {deciding && (
        <div
          id="contract-decision"
          className="flex flex-col gap-1 rounded-control border border-gold bg-art-gold px-3.5 py-3 text-[0.8125rem]"
        >
          <p className="font-bold">{m.contract.decisionTitle}</p>
          <p>
            {talks
              ? plural(talks, m.contract.decisionOffersOne, m.contract.decisionOffers)
              : m.contract.decisionNoOffers}
          </p>
          <p>
            {format(m.contract.decisionDefault, {
              club: parent.name,
              wage: weekly(bridgeWage(world)),
            })}
          </p>
        </div>
      )}
      <div className="flex items-center gap-3.5">
        <CrestImage crest={parent.crest} alt="" className="h-13 w-13 shrink-0" />
        <div className="min-w-0">
          <p className="text-base font-bold break-words">{parent.name}</p>
          <p className="text-[0.8125rem] text-muted">
            {roleName(contract.role)} · {m.roleBodies[contract.role]}
          </p>
        </div>
      </div>
      {loan && (
        <div className="flex flex-col gap-1 rounded-control border border-accent bg-accent-soft px-3.5 py-3 text-[0.8125rem]">
          <p className="font-bold">
            {format(m.contract.onLoan, {
              club: world.clubs[loan.destinationClubId]!.name,
              season: loan.end.season,
            })}
          </p>
          <p>
            {m.contract.loanRole}: {roleName(loan.role)} ·{' '}
            {format(m.contract.loanShare, {
              club: world.clubs[loan.destinationClubId]!.name,
              share: Math.round(loan.wageShare * 100),
            })}
          </p>
          {loan.purchaseOption !== null && (
            <p>{format(m.contract.purchaseOption, { fee: money(loan.purchaseOption) })}</p>
          )}
        </div>
      )}
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2.5">
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
        <Stat
          label={m.contract.loyalty}
          value={money(contract.loyaltyBonus)}
          note={m.contract.loyaltyBody}
        />
      </dl>
      <p className="text-xs text-muted">
        {m.contract.option}:{' '}
        {contract.optionTaken
          ? m.contract.optionUsed
          : format(m.contract.optionOpen, { club: parent.name })}
      </p>
      <div>
        <h3 className={cx(groupLabel, 'mb-2')}>{m.contract.bonuses}</h3>
        <dl className="grid grid-cols-3 gap-2">
          <Stat outline label={m.contract.appearance} value={money(contract.appearanceBonus)} />
          <Stat outline label={m.contract.goal} value={money(contract.goalBonus)} />
          <Stat
            outline
            label={m.contract.cleanSheet}
            value={money(contract.cleanSheetBonus)}
            note={m.contract.cleanSheetNote}
          />
        </dl>
      </div>
    </Panel>
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
  const [params] = useSearchParams();
  const selection = career.market.selection;
  const fixture = nextCareerFixture(world);
  const chance = fixture && !player.injuryId ? careerSelection(world, fixture) : null;
  const line = lineOf(player.primaryPosition);
  const manager = club ? world.managers[club.managerId] : undefined;
  const low = chance ? chance.probability < 0.5 : false;
  return (
    <Panel
      aria-labelledby="playing-heading"
      className="order-2 flex flex-col gap-3.5 lg:order-none"
    >
      <div>
        <CardTitle id="playing-heading">{m.playing.title}</CardTitle>
        <p className="mt-1.5 text-muted">{m.playing.body}</p>
      </div>
      <dl className="grid grid-cols-2 gap-2.5">
        <Stat display label={m.playing.selected} value={selection.selected} />
        <Stat display label={m.playing.dropped} value={selection.dropped} />
      </dl>
      {chance &&
        (chance.registered ? (
          <ValueMeter
            label={m.playing.chance}
            value={chance.probability * 100}
            tone={low ? 'danger' : 'accent'}
            numberTone={low ? 'danger' : 'accent'}
            note={
              chance.competition.formation ? (
                <>
                  {competitionLine(world, chance)}{' '}
                  <Link
                    className="font-bold text-accent underline underline-offset-3"
                    to={withSave('/career/club', params.get('save'))}
                  >
                    {m.playing.reasons}
                  </Link>
                </>
              ) : (
                format(m.playing.chanceBody, {
                  count: MK.slots[line],
                  line: m.playing.lines[line],
                })
              )
            }
          />
        ) : (
          <p className="text-[0.8125rem] font-bold">{m.playing.unregistered}</p>
        ))}
      <p
        className={cx(
          'flex items-start gap-2 text-[0.8125rem] font-bold',
          selection.promiseBroken ? 'text-danger' : 'text-accent',
        )}
      >
        <Icon
          name={selection.promiseBroken ? 'warning' : 'check'}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        {selection.promiseBroken ? m.playing.promiseBroken : m.playing.promiseKept}
      </p>
      <div className="flex flex-col gap-3 border-t border-line pt-3.5">
        <h3 className={groupLabel}>{m.relations.title}</h3>
        <ValueMeter
          label={m.relations.trust}
          value={managerTrust(world)}
          note={manager ? format(m.relations.manager, { name: manager.name }) : undefined}
        />
        {club && (
          <ValueMeter
            label={m.relations.fans}
            value={relationshipValue(world, 'fans', club.id)}
            tone="gold"
          />
        )}
      </div>
    </Panel>
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
    <Panel
      aria-labelledby="requests-heading"
      className="order-3 flex flex-col gap-4.5 lg:order-none"
    >
      <CardTitle id="requests-heading">{m.requests.title}</CardTitle>
      <BlockNote block={block} />
      <ActionError error={error} />
      <p role="status" className="text-[0.8125rem] font-bold text-accent empty:hidden">
        {notice}
      </p>
      <div>
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          aria-describedby="ask-hint"
          disabled={Boolean(block) || ask !== 'available'}
          onClick={() => {
            const result = run({ type: 'ask-contract' });
            if (result === 'opened') setNotice(m.requests.askOpened);
            else if (result === 'refused')
              setNotice(format(m.requests.askRefused, { weeks: MK.renewal.askCooldownWeeks }));
          }}
        >
          {m.requests.askContract}
        </Button>
        <p id="ask-hint" className="mt-1.5 text-xs text-muted">
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
            <p className="text-[0.8125rem] font-bold">
              {format(m.requests.transferActive, {
                week: market.transferRequest.week,
                season: market.transferRequest.season,
              })}
            </p>
            <Button
              variant="text"
              className="-ml-3"
              disabled={Boolean(block)}
              onClick={() => run({ type: 'withdraw-transfer-request' })}
            >
              {m.requests.withdraw}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="danger-outline"
              icon="warning"
              className="w-full sm:w-auto"
              aria-describedby="transfer-hint"
              disabled={Boolean(block) || onLoan}
              onClick={() => confirm.open('transfer')}
            >
              {m.requests.transferRequest}
            </Button>
            <p id="transfer-hint" className="mt-1.5 text-xs text-muted">
              {m.requests.transferRequestBody}
            </p>
          </>
        )}
      </div>
      <div>
        {market.loanRequest ? (
          <>
            <p className="text-[0.8125rem] font-bold">{m.requests.loanActive}</p>
            <Button
              variant="text"
              className="-ml-3"
              disabled={Boolean(block)}
              onClick={() => run({ type: 'withdraw-loan-request' })}
            >
              {m.requests.loanWithdraw}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              aria-describedby="loan-hint"
              disabled={Boolean(block) || !canRequestLoan(world)}
              onClick={() => run({ type: 'loan-request' })}
            >
              {m.requests.loanRequest}
            </Button>
            <p id="loan-hint" className="mt-1.5 text-xs text-muted">
              {canRequestLoan(world) || onLoan
                ? m.requests.loanRequestBody
                : m.requests.loanUnavailable}
            </p>
          </>
        )}
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
    </Panel>
  );
}

function Earnings({ career }: { career: Career }) {
  const finances = career.market.finances;
  return (
    <Panel
      aria-labelledby="earnings-heading"
      className="order-4 flex flex-col gap-3.5 lg:order-none"
    >
      <CardTitle id="earnings-heading">{m.earnings.title}</CardTitle>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2.5">
        <Stat display label={m.earnings.cash} value={money(finances.cash)} />
        <Stat display label={m.earnings.lifetime} value={money(finances.lifetimeEarnings)} />
        <Stat display label={m.earnings.agentFees} value={money(finances.agentFees)} />
      </dl>
      <p className="text-sm">
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
          <span className="text-muted">{m.earnings.none}</span>
        )}
      </p>
      {career.market.pendingBonuses > 0 && (
        <p className="self-start rounded-control bg-art-gold px-3 py-2 text-[0.8125rem] font-bold text-gold-ink">
          {format(m.earnings.pending, { amount: money(career.market.pendingBonuses) })}
        </p>
      )}
    </Panel>
  );
}

function OfferSummary({ world, offer }: { world: World; offer: TransferOffer }) {
  const negotiation = offer.negotiationId ? world.negotiations[offer.negotiationId] : undefined;
  const terms = negotiation?.rounds.filter((round) => round.actor === 'club').at(-1)?.terms;
  if (offer.loan)
    return (
      <>
        {format(m.offers.loanTerms, {
          role: roleName(offer.loan.role),
          club: world.clubs[offer.clubId]!.name,
          share: Math.round(offer.loan.wageShare * 100),
        })}
      </>
    );
  if (!terms) return <>{format(m.offers.bids, { bids: offer.bids.map(money).join(' → ') })}</>;
  return (
    <>
      {format(m.talks.summary, {
        wage: weekly(terms.weeklyWage),
        years: plural(terms.years, m.talks.yearsOne, m.talks.yearsValue),
        role: roleName(terms.role),
      })}
    </>
  );
}

/** Where the bidding club plays, measured against the player's own club. */
function leagueLine(world: World, club: Club): string {
  const league = world.leagues[club.leagueId];
  const parent = world.clubs[careerContract(world).clubId];
  if (!league) return '';
  if (!parent || parent.id === club.id) return league.name;
  if (club.countryId !== parent.countryId)
    return `${league.name} · ${format(m.offers.abroad, { country: world.countries[club.countryId]?.name ?? '' })}`;
  const own = world.leagues[parent.leagueId];
  if (!own) return league.name;
  const gap = own.tier - league.tier;
  const relation =
    gap === 0
      ? format(m.offers.tierSame, { club: parent.name })
      : gap > 0
        ? format(gap === 1 ? m.offers.tierAboveOne : m.offers.tierAbove, {
            count: gap,
            club: parent.name,
          })
        : format(gap === -1 ? m.offers.tierBelowOne : m.offers.tierBelow, {
            count: -gap,
            club: parent.name,
          });
  return `${league.name} · ${relation}`;
}

/** The footnote of an open offer: its deadline, or why an agreed one stands. */
function offerFoot(offer: TransferOffer): string {
  if (offer.status === 'terms') return format(m.offers.expires, { week: offer.expires.week });
  return offer.releaseClauseTriggered ? m.offers.clause : '';
}

/** The open offer that needs an answer first: the hero of the page, with its one gold action. */
function LeadOffer({
  world,
  offer,
  onOpen,
}: {
  world: World;
  offer: TransferOffer;
  onOpen: (id: string) => void;
}) {
  const club = world.clubs[offer.clubId]!;
  return (
    <HeroPanel
      as="li"
      padding="compact"
      markings
      className="min-w-0 flex-[1.5_1_26rem]"
      aria-labelledby={`offer-${offer.id}`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <CrestImage crest={club.crest} alt="" className="h-18 w-16 shrink-0" />
          <div className="min-w-0 flex-[1_1_11rem]">
            <p className="text-xs font-extrabold tracking-[0.12em] text-gold uppercase">
              {m.kinds[offer.kind]} · {m.statuses[offer.status]}
            </p>
            <h3
              id={`offer-${offer.id}`}
              className="mt-0.5 font-display text-[2.5rem] leading-[0.95] break-words"
            >
              {club.name}
            </h3>
            <p className="mt-0.5 text-[0.8125rem] text-hero-muted">{leagueLine(world, club)}</p>
          </div>
          {offer.fee > 0 && (
            <div className="text-right">
              <p className="text-xs font-semibold text-hero-muted">{m.offers.fee}</p>
              <p className="font-display text-[2.25rem] leading-[0.9] text-gold tabular-nums sm:text-[2.75rem]">
                {money(offer.fee)}
              </p>
            </div>
          )}
        </div>
        <p className="rounded-control bg-night/35 px-3.5 py-3 font-semibold">
          <OfferSummary world={world} offer={offer} />
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[0.8125rem] font-bold">
            <ClockIcon className="h-4 w-4 shrink-0 text-gold" />
            {offerFoot(offer)}
          </span>
          <Button variant="play" size="lg" iconEnd="arrow" onClick={() => onOpen(offer.id)}>
            {m.offers.open}
            <span className="sr-only">{format(m.offers.openWith, { club: club.name })}</span>
          </Button>
        </div>
      </div>
    </HeroPanel>
  );
}

/** Any other open offer: a quiet card beside the lead one. */
function OpenOffer({
  world,
  offer,
  onOpen,
}: {
  world: World;
  offer: TransferOffer;
  onOpen: (id: string) => void;
}) {
  const club = world.clubs[offer.clubId]!;
  const note =
    offer.kind === 'renewal'
      ? m.talks.renewalNote
      : offer.kind === 'pre-contract'
        ? format(m.talks.preContract, { club: club.name })
        : '';
  return (
    <li
      aria-labelledby={`offer-${offer.id}`}
      className="flex min-w-0 flex-[1_1_19rem] flex-col gap-3.5 rounded-panel border border-line bg-surface-soft p-5.5"
    >
      <div className="flex items-center gap-3.5">
        <CrestImage crest={club.crest} alt="" className="h-13 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 id={`offer-${offer.id}`} className="text-base font-bold break-words">
            {club.name}
          </h3>
          <p className="text-xs text-muted">
            {m.kinds[offer.kind]} · {m.statuses[offer.status]}
          </p>
        </div>
        {offer.fee > 0 && (
          <span className="text-base font-extrabold tabular-nums">{money(offer.fee)}</span>
        )}
      </div>
      <p className="text-sm">
        <OfferSummary world={world} offer={offer} />
      </p>
      {note && <p className="text-[0.8125rem] text-muted">{note}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-xs font-semibold text-muted">{offerFoot(offer)}</span>
        <Button variant="secondary" iconEnd="arrow" onClick={() => onOpen(offer.id)}>
          {offer.status === 'terms' ? m.offers.open : m.offers.view}
          <span className="sr-only">{format(m.offers.openWith, { club: club.name })}</span>
        </Button>
      </div>
    </li>
  );
}

const EARLIER_SHOWN = 3;

/** One closed offer: crest, club and fee on the first line; kind, outcome and date below. */
function EarlierOffer({
  world,
  offer,
  onOpen,
}: {
  world: World;
  offer: TransferOffer;
  onOpen: (id: string) => void;
}) {
  const club = world.clubs[offer.clubId]!;
  return (
    <li className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
      <CrestImage crest={club.crest} alt="" className="h-10 w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
          <span className="min-w-0 font-bold break-words">{club.name}</span>
          {offer.fee > 0 && <span className="font-bold tabular-nums">{money(offer.fee)}</span>}
        </p>
        <p className="text-xs text-muted">
          {m.kinds[offer.kind]} · {m.statuses[offer.status]} ·{' '}
          {format(c.common.seasonWeek, { season: offer.created.season, week: offer.created.week })}
        </p>
      </div>
      {offer.negotiationId && (
        <Button variant="text" className="shrink-0" onClick={() => onOpen(offer.id)}>
          {m.offers.view}
          <span className="sr-only"> — {club.name}</span>
        </Button>
      )}
    </li>
  );
}

function Offers({ world, onOpen }: { world: World; onOpen: (id: string) => void }) {
  const open = world.offers.filter(
    (offer) => offer.status === 'terms' || offer.status === 'agreed',
  );
  const [showAll, setShowAll] = useState(false);
  const earlier = world.offers
    .filter((offer) => offer.status !== 'terms' && offer.status !== 'agreed')
    .slice(-20)
    .reverse();
  if (!open.length && !earlier.length)
    return (
      <EmptySection id="offers-heading" title={m.offers.title}>
        <p className="max-w-prose">{m.offers.empty}</p>
      </EmptySection>
    );
  const waiting = open.filter((offer) => offer.status === 'terms').length;
  const lead = open.find((offer) => offer.status === 'terms');
  const rest = open.filter((offer) => offer !== lead);
  return (
    <Panel aria-labelledby="offers-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <CardTitle id="offers-heading" size="lg">
          {m.offers.title}
        </CardTitle>
        {waiting > 0 && (
          <span className="text-[0.8125rem] font-semibold text-muted">
            {waiting === 1 ? m.offers.waitingOne : format(m.offers.waiting, { count: waiting })}
          </span>
        )}
      </div>
      {open.length ? (
        <ul className="flex flex-wrap gap-3.5">
          {lead && <LeadOffer world={world} offer={lead} onOpen={onOpen} />}
          {rest.map((offer) => (
            <OpenOffer key={offer.id} world={world} offer={offer} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="max-w-prose text-sm text-muted">{m.offers.empty}</p>
      )}
      {earlier.length > 0 && (
        <div className={open.length ? 'border-t border-line pt-3.5' : ''}>
          <h3 className="text-[0.9375rem] font-bold">{m.offers.history}</h3>
          <ul className="mt-1.5">
            {(showAll ? earlier : earlier.slice(0, EARLIER_SHOWN)).map((offer) => (
              <EarlierOffer key={offer.id} world={world} offer={offer} onOpen={onOpen} />
            ))}
          </ul>
          {!showAll && earlier.length > EARLIER_SHOWN && (
            <Button variant="text" className="-ml-3 mt-1" onClick={() => setShowAll(true)}>
              {plural(
                earlier.length - EARLIER_SHOWN,
                m.offers.showEarlierOne,
                m.offers.showEarlier,
              )}
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}

function Interest({ world }: { world: World }) {
  const entries = [...world.scouting].sort((a, b) => b.confidence - a.confidence);
  const parent = world.clubs[careerContract(world).clubId]!;
  return (
    <Panel
      aria-labelledby="interest-heading"
      className="order-5 flex flex-col gap-3.5 lg:order-none"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <CardTitle id="interest-heading">{m.interest.title}</CardTitle>
        {entries.length > 0 && (
          <span className="text-[0.8125rem] font-semibold text-muted">
            {entries.length === 1
              ? m.interest.countOne
              : format(m.interest.count, { count: entries.length })}
          </span>
        )}
      </div>
      <p className="max-w-prose text-muted">{m.interest.body}</p>
      {entries.length ? (
        <ul className="flex flex-col gap-2.5">
          {entries.map((interest) => {
            const club = world.clubs[interest.clubId]!;
            const league = world.leagues[club.leagueId];
            const ready = interest.stage === 'offer';
            return (
              <li
                key={interest.id}
                className="flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-control bg-surface-soft px-3.5 py-3"
              >
                <CrestImage crest={club.crest} alt="" className="h-11 w-10 shrink-0" />
                <div className="min-w-0 flex-[1_1_11rem]">
                  <p className="text-sm font-bold break-words">{club.name}</p>
                  <p className="text-xs break-words text-muted">
                    {league?.name}
                    {club.countryId !== parent.countryId
                      ? ` · ${m.interest.abroad}: ${world.countries[club.countryId]!.name}`
                      : ''}
                  </p>
                </div>
                <ValueMeter
                  className="flex-[1_1_12rem]"
                  size="sm"
                  track="surface"
                  label={m.interest.confidence}
                  ariaLabel={`${m.interest.confidence} · ${club.name}`}
                  value={interest.confidence}
                  tone={ready ? 'gold' : 'accent'}
                  note={format(m.interest.weeks, { weeks: interest.weeksObserved })}
                />
                <Chip tone={ready ? 'gold' : 'accent'}>
                  {interest.kind === 'loan' ? `${m.interest.loan} · ` : ''}
                  {m.stages[interest.stage]}
                </Chip>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">{m.interest.empty}</p>
      )}
    </Panel>
  );
}

function Moves({ world, career }: { world: World; career: Career }) {
  const moves = [...career.market.moves].reverse();
  if (!moves.length)
    return (
      <EmptySection id="moves-heading" title={m.moves.title} className="order-6 lg:order-none">
        {m.moves.empty}
      </EmptySection>
    );
  return (
    <Panel aria-labelledby="moves-heading" className="order-6 flex flex-col gap-3 lg:order-none">
      <CardTitle id="moves-heading">{m.moves.title}</CardTitle>
      <div
        className="relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={m.moves.table}
      >
        <table className="w-full min-w-[21rem] border-collapse text-left text-[0.8125rem] tabular-nums">
          <thead>
            <tr className="text-[0.6875rem] tracking-[0.08em] text-muted uppercase">
              <th scope="col" className="py-2 pr-2.5 font-extrabold">
                {m.moves.columns.date}
              </th>
              <th scope="col" className="py-2 pr-2.5 font-extrabold">
                {m.moves.columns.move}
              </th>
              <th scope="col" className="py-2 pr-2.5 font-extrabold">
                {m.moves.columns.club}
              </th>
              <th scope="col" className="py-2 text-right font-extrabold">
                {m.moves.columns.fee}
              </th>
            </tr>
          </thead>
          <tbody>
            {moves.map((move, index) => (
              <tr
                key={`${move.date.season}-${move.date.week}-${index}`}
                className="border-t border-line"
              >
                <td className="py-2.5 pr-2.5 whitespace-nowrap text-muted">
                  {format(c.common.seasonWeek, {
                    season: move.date.season,
                    week: move.date.week,
                  })}
                </td>
                <td className="py-2.5 pr-2.5">{m.moves.kinds[move.kind]}</td>
                <td className="py-2.5 pr-2.5 font-bold">{world.clubs[move.toClubId]?.name}</td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  {move.fee > 0 ? money(move.fee) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** The latest club terms, as the starting point of the player's counter-offer. */
function clubTerms(negotiation: Negotiation): ContractTerms {
  return negotiation.rounds.filter((round) => round.actor === 'club').at(-1)!.terms;
}

function TermsList({ terms }: { terms: ContractTerms }) {
  // Two tiles a row while values fit whole, one when enlarged text would split words. The
  // signing-on fee spans the row, however many columns there are.
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2.5">
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
      <Stat
        className="col-span-full"
        label={m.talks.signingBonus}
        value={money(terms.signingBonus)}
      />
    </dl>
  );
}

type Outcome = '' | 'accept' | 'counter' | 'walk-away';
const OUTCOME_STYLE: Record<Exclude<Outcome, ''>, string> = {
  accept: 'bg-gold text-on-gold font-extrabold',
  counter: 'bg-accent-soft text-accent font-bold',
  'walk-away': 'bg-danger-soft text-danger font-bold',
};
const OUTCOME_ICON = { accept: 'check', counter: 'refresh', 'walk-away': 'close' } as const;

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
  const [outcome, setOutcome] = useState<Outcome>('');
  const isOpen = offer.status === 'terms';
  const windowClosed =
    (offer.kind === 'transfer' || offer.kind === 'loan') && !windowState(world).open;
  const disabled = Boolean(block) || !isOpen || windowClosed;
  const player = world.players[world.career!.playerId]!;
  const fit = cultureFit(world, player, club).value;
  return (
    <div className="grid gap-5">
      <HeroPanel aria-labelledby="talks-heading" markings>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4.5">
          {/* On phones the crest has a row to itself: smaller, so the terms come sooner. */}
          <CrestImage crest={club.crest} alt="" className="h-18 w-16 shrink-0 sm:h-27 sm:w-24" />
          <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-1.5">
            <p className="text-xs font-extrabold tracking-[0.12em] text-gold uppercase">
              {m.kinds[offer.kind]} · {m.statuses[offer.status]}
            </p>
            <h2
              id="talks-heading"
              className="font-display text-[2.75rem] leading-[0.9] break-words sm:text-[4rem]"
            >
              {format(m.talks.title, { club: club.name })}
            </h2>
            {offer.fee > 0 && (
              <p className="text-[0.9375rem]">
                {m.talks.fee.split('{fee}')[0]}
                <strong className="text-gold">{money(offer.fee)}</strong>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-hero-muted">
              <span>
                {format(socialText.fit.talks, { club: club.name })}:{' '}
                <strong className="text-[0.9375rem] text-hero-ink">{fit}</strong>
              </span>
              <ul className="flex flex-wrap gap-1.5" aria-label={socialText.fit.traits}>
                {cultureTraits(club).map((trait) => (
                  <li
                    key={trait}
                    className="rounded-full border border-hero-ink/30 px-2.5 py-0.5 font-semibold"
                  >
                    {trait}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button type="button" className={heroButton} onClick={onClose}>
            <Icon name="arrow" className="h-4.5 w-4.5 rotate-180" />
            {m.talks.back}
          </button>
        </div>
      </HeroPanel>
      <p
        role="status"
        className={
          outcome
            ? cx('flex items-center gap-2.5 rounded-control px-4 py-3', OUTCOME_STYLE[outcome])
            : 'sr-only'
        }
      >
        {outcome && (
          <>
            <Icon name={OUTCOME_ICON[outcome]} className="h-4.5 w-4.5 shrink-0" />
            {m.talks.outcomes[outcome]}
          </>
        )}
      </p>
      <BlockNote block={block} />
      <ActionError error={error} />
      {offer.kind === 'pre-contract' && (
        <TalksNote label={m.kinds[offer.kind]}>
          {format(m.talks.preContract, { club: club.name })}
        </TalksNote>
      )}
      {offer.kind === 'renewal' && (
        <TalksNote label={m.kinds[offer.kind]}>{m.talks.renewalNote}</TalksNote>
      )}
      {!isOpen && (
        <TalksNote label={m.statuses[offer.status]} strong>
          {m.talks.closed}
        </TalksNote>
      )}
      {isOpen && windowClosed && <TalksNote strong>{m.talks.windowClosed}</TalksNote>}
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
          <div className="flex flex-wrap items-start gap-5">
            <TheirOffer
              world={world}
              offer={offer}
              negotiation={negotiation}
              disabled={disabled}
              onAccept={() => {
                if (run({ type: 'accept', offerId: offer.id })) setOutcome('accept');
              }}
              onDecline={() => confirm.open('decline')}
            />
            <CounterForm
              key={`${negotiation.id}:${negotiation.rounds.length}`}
              negotiation={negotiation}
              disabled={disabled}
              onSubmit={(terms) => {
                const result = run({ type: 'counter', offerId: offer.id, terms });
                if (result === 'accept' || result === 'counter' || result === 'walk-away')
                  setOutcome(result);
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
    </div>
  );
}

/** A note on what kind of talks these are, or why they cannot move. */
function TalksNote({
  label,
  strong = false,
  children,
}: {
  label?: string;
  strong?: boolean;
  children: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-control bg-art-blue px-3.5 py-2.5 text-ink">
      {label && <span className="text-[0.6875rem] font-extrabold text-info">{label}</span>}
      <p className={cx('text-[0.8125rem]', strong && 'font-bold')}>{children}</p>
    </div>
  );
}

/** Patience as pips: filled for the counter-offers left, empty for the ones already spent. */
function Patience({ negotiation }: { negotiation: Negotiation }) {
  const spent = negotiation.rounds.filter(
    (round) => round.actor === 'player' && round.response === 'counter',
  ).length;
  const total = Math.max(1, negotiation.patience + spent);
  const text =
    negotiation.patience === 0
      ? m.talks.patienceNone
      : plural(negotiation.patience, m.talks.patienceOne, m.talks.patience);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="meter"
        aria-label={m.talks.patienceLabel}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={negotiation.patience}
        aria-valuetext={text}
        className="flex gap-1"
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cx(
              'h-2.5 w-7 rounded-full',
              index < negotiation.patience ? 'bg-accent' : 'bg-track',
            )}
          />
        ))}
      </div>
      <span
        className={cx(
          'text-[0.8125rem]',
          negotiation.patience === 0 ? 'font-bold text-danger' : 'text-muted',
        )}
      >
        {text}
      </span>
    </div>
  );
}

function TheirOffer({
  world,
  offer,
  negotiation,
  disabled,
  onAccept,
  onDecline,
}: {
  world: World;
  offer: TransferOffer;
  negotiation: Negotiation;
  disabled: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const isOpen = offer.status === 'terms';
  const agent = world.career!.market.agentId
    ? world.agents[world.career!.market.agentId]
    : undefined;
  const round = negotiation.rounds.filter((entry) => entry.actor === 'club').length;
  const meta = [
    format(m.talks.round, { round }),
    isOpen ? format(m.offers.expires, { week: offer.expires.week }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const [before = '', after = ''] = m.talks.agentRead.split('{wage}');
  return (
    <Panel aria-labelledby="their-heading" className="flex min-w-0 flex-[1_1_26rem] flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <CardTitle id="their-heading" size="lg">
          {m.talks.clubTerms}
        </CardTitle>
        <span className="text-xs font-semibold text-muted">{meta}</span>
      </div>
      <TermsList terms={clubTerms(negotiation)} />
      {offer.kind !== 'renewal' || !careerContract(world).optionTaken ? (
        <p className="text-xs text-muted">
          {format(m.talks.clubOption, { club: world.clubs[offer.clubId]!.name })}
        </p>
      ) : null}
      {agent && negotiation.agentEstimate !== null ? (
        <div className="flex items-center gap-3.5 rounded-control bg-art-gold px-4 py-3.5">
          <AgentPortrait avatar={agent.avatar} name={agent.name} className="h-14 w-14 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-gold-ink">{m.talks.agentReadTitle}</p>
            <p className="mt-0.5 text-sm">
              {format(before, { agent: agent.name })}
              <strong>{weekly(negotiation.agentEstimate)}</strong>
              {after}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm">
          {m.talks.noAgent}{' '}
          <Link className="font-bold text-accent underline underline-offset-3" to="/career/agent">
            {m.inbox.goAgent}
          </Link>
        </p>
      )}
      {isOpen && <Patience negotiation={negotiation} />}
      <div className="flex flex-wrap gap-2.5 border-t border-line pt-4">
        <Button disabled={disabled} onClick={onAccept}>
          {m.talks.accept}
        </Button>
        <Button variant="danger-outline" disabled={disabled} onClick={onDecline}>
          {m.talks.decline}
        </Button>
      </div>
    </Panel>
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
    <Panel aria-labelledby="their-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <CardTitle id="their-heading" size="lg">
          {m.talks.clubTerms}
        </CardTitle>
        {offer.status === 'terms' && (
          <span className="text-xs font-semibold text-muted">
            {format(m.offers.expires, { week: offer.expires.week })}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2.5">
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
      <p className="text-[0.8125rem] text-muted">{m.roleBodies[loan.role]}</p>
      <div className="flex flex-wrap gap-2.5 border-t border-line pt-4">
        <Button disabled={disabled} onClick={onAccept}>
          {m.talks.acceptLoan}
        </Button>
        <Button variant="secondary" disabled={disabled} onClick={onDecline}>
          {m.talks.declineLoan}
        </Button>
      </div>
    </Panel>
  );
}

/** A whole, safe number at or above `min`. */
const wholeAtLeast = (value: number, min: number) => Number.isSafeInteger(value) && value >= min;

/** "Wage 600 Cr above their offer, 100 Cr under your agent's estimate." */
function wageHint(wage: number, offered: number, estimate: number | null): string {
  if (!wholeAtLeast(wage, 1)) return '';
  const gap = wage - offered;
  const parts = [
    gap > 0
      ? format(m.talks.wageAbove, { amount: money(gap) })
      : gap < 0
        ? format(m.talks.wageBelow, { amount: money(-gap) })
        : m.talks.wageSame,
  ];
  if (estimate !== null) {
    const room = estimate - wage;
    parts.push(
      room > 0
        ? format(m.talks.agentUnder, { amount: money(room) })
        : room < 0
          ? format(m.talks.agentOver, { amount: money(-room) })
          : m.talks.agentAt,
    );
  }
  return `${parts.join(', ')}.`;
}

/** A number field with "Cr" before it and an optional unit after, in one 48px box. */
function MoneyField({
  id,
  label,
  value,
  onChange,
  min,
  suffix,
  invalid,
  describedBy,
  disabled,
  srLabel = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  suffix?: string;
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
  srLabel?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className={srLabel ? 'sr-only' : 'mb-1.5 block text-[0.8125rem] font-bold'}
      >
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-bold',
            invalid ? 'text-danger' : 'text-muted',
          )}
        >
          {m.talks.currency}
        </span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          step={1}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? describedBy : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cx(
            'text-[0.9375rem] font-bold tabular-nums',
            suffix ? 'pr-16 pl-11' : 'pl-11',
          )}
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs text-muted"
          >
            {suffix}
          </span>
        )}
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
  const [checked, setChecked] = useState(false);
  useEffect(() => setChecked(false), [wage, clause, bonus, clauseOn]);
  const floor = CONFIG.world.generation.wageFloor;
  const wageValue = Number(wage);
  const bad = {
    wage: !(wholeAtLeast(wageValue, floor) && wageValue <= 10_000_000),
    clause: clauseOn && !wholeAtLeast(Number(clause), 1),
    bonus: !wholeAtLeast(Number(bonus), 0),
  };
  const invalid = checked && (bad.wage || bad.clause || bad.bonus);
  const hint = useMemo(
    () => wageHint(wageValue, start.weeklyWage, negotiation.agentEstimate),
    [wageValue, start.weeklyWage, negotiation.agentEstimate],
  );
  return (
    <form
      noValidate
      className="ui-card flex min-w-0 flex-[1_1_26rem] flex-col gap-4 rounded-panel border-2 border-accent bg-surface p-panel shadow-surface sm:p-panel-lg"
      aria-labelledby="counter-heading"
      onSubmit={(event) => {
        event.preventDefault();
        const next: ContractTerms = {
          weeklyWage: wageValue,
          years,
          role,
          releaseClause: clauseOn ? Number(clause) : null,
          signingBonus: Number(bonus),
        };
        if (bad.wage || bad.clause || bad.bonus) return setChecked(true);
        onSubmit(next);
      }}
    >
      <CardTitle id="counter-heading" size="lg">
        {m.talks.yourTerms}
      </CardTitle>
      <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap gap-3.5">
          <div className="min-w-0 flex-[1_1_11rem]">
            <MoneyField
              id="counter-wage"
              label={m.talks.wage}
              value={wage}
              onChange={setWage}
              min={floor}
              suffix={m.talks.perWeekShort}
              invalid={invalid && bad.wage}
              describedBy="counter-invalid"
            />
          </div>
          <div className="min-w-0 flex-[1_1_11rem]">
            <label htmlFor="counter-years" className="mb-1.5 block text-[0.8125rem] font-bold">
              {m.talks.years}
            </label>
            <select
              id="counter-years"
              value={years}
              onChange={(event) => setYears(Number(event.target.value))}
              className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-[0.9375rem] font-bold text-ink disabled:opacity-60"
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
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-[0.8125rem] font-bold">{m.talks.role}</legend>
          <div className="grid grid-cols-2 gap-1 rounded-control bg-surface-soft p-1 sm:grid-cols-4">
            {ROLE_ORDER.map((option) => (
              <label
                key={option}
                className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-chip px-1 text-center text-[0.8125rem] leading-tight font-extrabold has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent"
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
          <p className="mt-1.5 text-xs text-muted">
            {roleName(role)} · {m.roleBodies[role]}
          </p>
        </fieldset>
        <div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.8125rem] font-bold">
            <input
              type="checkbox"
              checked={clauseOn}
              onChange={(event) => setClauseOn(event.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            {m.talks.clauseAsk}
          </label>
          <div className="mt-1">
            <MoneyField
              id="counter-clause"
              label={m.talks.clause}
              srLabel
              value={clause}
              onChange={setClause}
              min={1}
              disabled={!clauseOn}
              invalid={invalid && bad.clause}
              describedBy="counter-invalid"
            />
          </div>
        </div>
        <MoneyField
          id="counter-bonus"
          label={m.talks.signingBonus}
          value={bonus}
          onChange={setBonus}
          min={0}
          invalid={invalid && bad.bonus}
          describedBy="counter-invalid"
        />
      </fieldset>
      {invalid && (
        <p
          id="counter-invalid"
          role="alert"
          className="flex items-start gap-2 text-[0.8125rem] font-bold text-danger"
        >
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          {format(m.talks.invalid, { floor })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3.5 border-t border-line pt-4">
        <Button type="submit" disabled={disabled}>
          {m.talks.counter}
        </Button>
        {hint && !disabled && <span className="text-xs text-muted">{hint}</span>}
      </div>
    </form>
  );
}

/** A small portrait of the career player in their club's kit, for the rounds list. */
function RoundPortrait({ world }: { world: World }) {
  const player = world.players[world.career!.playerId]!;
  const club = player.clubId ? world.clubs[player.clubId] : undefined;
  const age = world.date.season - player.birthSeason;
  const svg = useMemo(
    () => renderAvatar(player.avatar, Math.max(0, Math.min(110, age)), clubDress(club)),
    [player.avatar, age, club],
  );
  return <Artwork svg={svg} alt="" className="h-9 w-9 shrink-0" />;
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
    <Panel aria-labelledby="rounds-heading" className="flex flex-col gap-3.5">
      <CardTitle id="rounds-heading">{m.talks.rounds}</CardTitle>
      <ol className="flex flex-col gap-2.5">
        {negotiation.rounds.map((round, index) => (
          <li
            key={index}
            className={cx(
              'flex items-start gap-3 rounded-control px-3.5 py-3 text-sm',
              round.actor === 'club' ? 'bg-surface-soft' : 'border border-line bg-surface',
            )}
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-track font-display text-xl leading-none"
            >
              {integer.format(index + 1)}
            </span>
            {round.actor === 'club' ? (
              <CrestImage crest={club.crest} alt="" className="h-10 w-9 shrink-0" />
            ) : (
              <RoundPortrait world={world} />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {round.actor === 'club'
                  ? format(m.talks.roundClub, { club: club.name })
                  : m.talks.roundPlayer}{' '}
                <span className="font-medium text-muted">
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
                  <strong
                    className={
                      round.response === 'accept'
                        ? 'text-accent'
                        : round.response === 'walk-away'
                          ? 'text-danger'
                          : ''
                    }
                  >
                    {m.talks.responses[round.response]}.
                  </strong>{' '}
                  {(round.reasons ?? [])
                    .map((reason) => m.talks.reasons[reason as keyof typeof m.talks.reasons])
                    .join(' ')}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
