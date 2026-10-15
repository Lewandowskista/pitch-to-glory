import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { useAppStore } from '../../store';
import { CONFIG } from '../../engine/config';
import { careerCap, type AnyAttribute } from '../../engine/ageing';
import {
  attributeCost,
  attributeValue,
  levelProgress,
  raiseAttribute,
  skillState,
} from '../../engine/career/progression';
import { SKILLS, SKILL_BY_ID } from '../../engine/career/catalogue';
import { familiarityLevel } from '../../engine/strength';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
import { ART } from '../../engine/assets/shared';
import { calendarDate } from '../../engine/world/calendar';
import type { Career, CareerMatchRecord, Club, Player, World } from '../../model/domain';
import { format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { marketText as mk } from '../../i18n/market';
import { calendarText } from '../../i18n/calendar';
import { Artwork } from '../../ui/Artwork';
import { Icon } from '../../ui/Icon';
import {
  AttributeBar,
  CardTitle,
  Chip,
  Disclosure,
  HeroPanel,
  Meter,
  OverallBadge,
  Panel,
  RadarChart,
  ResultChip,
  cx,
  type MatchResult,
} from '../../ui/kit';
import { PositionPitch, type PitchPosition } from '../../ui/kit/PositionPitch';
import { CareerPage, CrestImage, plural, ui, useEditBlock, useSaveLink } from './shared';
import {
  attributeGroups,
  competitionName,
  potentialBand,
  seasonLine,
  seasonLines,
} from './selectors';
import { SkillGlyph } from './skillGlyphs';
import { usePhone } from './usePhone';

const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;
const skillName = (id: string) => c.skillNames[id] ?? id;
const PAGE = 20;
const integer = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const HEX = '[clip-path:polygon(50%_0,100%_22%,100%_78%,50%_100%,0_78%,0_22%)]';
const RESULT: Record<CareerMatchRecord['result'], MatchResult> = { win: 'W', draw: 'D', loss: 'L' };

/** The player's positions, primary first, then the secondary ones by familiarity. */
function positionsOf(player: Player): PitchPosition[] {
  return [
    { position: player.primaryPosition, familiarity: 100, primary: true },
    ...player.secondaryPositions
      .filter((entry) => entry.position !== player.primaryPosition)
      .sort((a, b) => b.familiarity - a.familiarity),
  ];
}

export default function CareerProfile() {
  return (
    <CareerPage title={c.titles.profile}>
      {(context) => (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <ProfileHero {...context} />
          {/* Attributes lead; traits, contract and the season sit beside them once both fit. */}
          <div className="flex flex-wrap items-start gap-5">
            <Attributes {...context} />
            <div className="grid min-w-0 flex-[1_1_20rem] grid-cols-[minmax(0,1fr)] gap-5">
              <Traits world={context.world} career={context.career} />
              <ContractCard world={context.world} player={context.player} />
              <SeasonCard world={context.world} career={context.career} player={context.player} />
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-5">
            <Positions player={context.player} />
            <Hidden player={context.player} />
          </div>
          <Untrained player={context.player} />
          <History world={context.world} career={context.career} />
          <PointsBar points={context.career.attributePoints} />
        </div>
      )}
    </CareerPage>
  );
}

/** The field-green identity card: portrait, name, level, overall and positions. */
function ProfileHero({
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
  const portrait = useMemo(
    () => renderAvatar(player.avatar, age, { ...clubDress(club), background: ART.fieldStripe }),
    [player.avatar, age, club],
  );
  const band = potentialBand(player.potential);
  const nation = world.countries[player.nationalityId]?.name ?? '';
  const archetype = c.archetypes[career.archetype]?.name ?? career.archetype;
  const positions = positionsOf(player);
  const second = positions[1];
  const pitchLabel = format(c.profile.positionsPitch, {
    positions: positions
      .map((entry) =>
        entry.primary
          ? format(c.profile.positionPrimary, {
              position: c.positions[entry.position] ?? entry.position,
            })
          : format(c.profile.positionSecondary, {
              position: c.positions[entry.position] ?? entry.position,
              level: c.profile.familiarityLevels[familiarityLevel(entry.familiarity)],
            }),
      )
      .join(', '),
  });
  const { into, needed } = levelProgress(career);
  const percent = needed ? Math.min(100, (into / needed) * 100) : 100;
  const heroChip =
    'inline-flex min-h-7 items-center rounded-full bg-hero-ink/15 px-3 text-xs font-bold';
  return (
    <HeroPanel
      aria-labelledby="profile-name"
      markings
      padding="compact"
      className="sm:px-8 sm:pt-7 sm:pb-0"
    >
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-9 sm:gap-y-3">
        <Artwork
          svg={portrait}
          alt={format(c.wizard.previewAlt, { age })}
          className="col-start-1 row-span-3 row-start-1 h-[6.5rem] w-[6.5rem] self-center sm:row-span-4 sm:size-40 sm:self-end xl:size-[14.375rem]"
        />
        <div className="col-start-2 row-start-1 flex flex-wrap items-center gap-2 self-end max-sm:hidden">
          <Chip tone="gold" className="tracking-[0.08em] uppercase">
            {c.profile.potentialBands[band]}
          </Chip>
          <span className={heroChip}>{format(c.profile.archetypeChip, { archetype })}</span>
        </div>
        <h2
          id="profile-name"
          className="col-start-2 row-start-2 self-end pr-16 font-display text-[2.5rem] leading-[0.85] font-normal break-words sm:pr-0 sm:text-[4rem] xl:text-[5.75rem]"
        >
          {player.name}
        </h2>
        <div className="col-start-2 row-start-3 flex flex-col gap-x-4.5 gap-y-1 self-start text-[0.8125rem] text-hero-muted sm:flex-row sm:flex-wrap sm:items-center sm:text-sm">
          <span>
            {[
              c.positions[player.primaryPosition],
              format(c.common.age, { age }),
              c.feet[player.foot],
            ].join(' · ')}
            <span className="max-sm:hidden"> · {nation}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 font-bold text-hero-ink">
            {club && <CrestImage crest={club.crest} alt="" className="h-6 w-6 shrink-0" />}
            <span className="min-w-0 break-words">{club?.name ?? c.common.unknownClub}</span>
            {club && (
              <span className="font-display text-xl leading-none font-normal text-gold tabular-nums">
                <span aria-hidden="true">#{player.squadNumber}</span>
                <span className="sr-only">
                  {format(c.profile.squadNumber, { number: player.squadNumber })}
                </span>
              </span>
            )}
          </span>
        </div>
        <div className="col-span-2 col-start-1 row-start-4 mt-2 flex flex-wrap gap-1.5 sm:hidden">
          <Chip tone="gold" className="tracking-[0.08em] uppercase">
            {c.profile.potentialBands[band]}
          </Chip>
          <span className={heroChip}>{format(c.profile.archetypeChip, { archetype })}</span>
          <span className={heroChip}>
            {second
              ? `${player.primaryPosition} · ${format(c.profile.positionChip, {
                  position: second.position,
                  value: second.familiarity,
                })}`
              : player.primaryPosition}
          </span>
          {nation && <span className={heroChip}>{nation}</span>}
        </div>
        <div className="col-span-2 col-start-1 row-start-5 mt-2 sm:col-span-1 sm:col-start-2 sm:row-start-4 sm:mt-0 sm:mb-7 sm:max-w-[28.75rem]">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-display text-[1.625rem] leading-none text-gold">
              {format(c.common.level, { level: career.level })}
            </span>
            <span className="text-[0.8125rem] text-hero-muted tabular-nums">
              {needed ? format(c.common.xp, { into, needed }) : c.common.xpMax}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={format(c.common.xpLabel, { level: career.level + 1 })}
            aria-valuemin={0}
            aria-valuemax={Math.max(1, needed)}
            aria-valuenow={needed ? into : 1}
            className="h-2.5 overflow-hidden rounded-full bg-night/50"
          >
            <span className="block h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="absolute top-0 right-0 flex items-end gap-6 sm:static sm:col-start-3 sm:row-span-4 sm:row-start-1 sm:mb-7 sm:self-end">
          <div className="flex flex-col items-center gap-1.5">
            <span className={cx('inline-grid place-items-center bg-gold p-[3px]', HEX)}>
              <OverallBadge
                player={player}
                size="lg"
                className="max-sm:h-[3.5rem] max-sm:w-[3.25rem] max-sm:text-[1.75rem]"
              />
            </span>
            <span
              aria-hidden="true"
              className="text-[0.6875rem] font-extrabold tracking-[0.1em] text-hero-muted uppercase max-sm:hidden"
            >
              {c.profile.overall}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1.5 max-sm:hidden">
            <PositionPitch positions={positions} label={pitchLabel} />
            <span aria-hidden="true" className="text-[0.6875rem] font-bold text-hero-muted">
              {c.profile.positions}
            </span>
          </div>
        </div>
      </div>
    </HeroPanel>
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
  const phone = usePhone();
  const [announcement, setAnnouncement] = useState('');
  const [flash, setFlash] = useState<{ key: string; count: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const systemReduced = useReducedMotion();
  const reduced = useAppStore((s) => s.settings.reducedMotion) || Boolean(systemReduced);
  const groups = attributeGroups(player);
  const [tab, setTab] = useState(0);
  const shownTab = Math.min(tab, groups.trained.length - 1);
  // The raised value pops once; reduced motion skips it (the live region still speaks).
  useEffect(() => {
    if (!flash || reduced) return;
    const value = list.current?.querySelector<HTMLElement>(
      `[data-attribute-row="${flash.key}"] .font-display`,
    );
    value?.animate?.([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], {
      duration: 420,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    });
  }, [flash, reduced]);
  const raise = (key: AnyAttribute) => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    const cost = attributeCost(current, key);
    if (cost === null || cost > current.career!.attributePoints) return;
    const next = raiseAttribute(current, key);
    useAppStore.getState().setWorld(next);
    const value = attributeValue(next.players[next.career!.playerId]!, key);
    setAnnouncement(format(c.profile.raised, { attribute: attributeName(key), value }));
    setFlash((last) => ({ key, count: (last?.count ?? 0) + 1 }));
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = groups.trained.length;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % count
        : event.key === 'ArrowLeft'
          ? (index + count - 1) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`attribute-tab-${next}`)?.focus();
  };
  const points = career.attributePoints;
  return (
    <section
      aria-labelledby="attributes-heading"
      className={cx(ui.panel, '@container min-w-0 flex-[2.2_1_38rem]')}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-[1_1_16rem]">
          <CardTitle id="attributes-heading" size="lg">
            {c.profile.attributes}
          </CardTitle>
          <p className={cx(ui.helper, 'max-w-[26rem]')}>{c.profile.attributesSummary}</p>
        </div>
        <div className="flex items-center gap-5">
          <RadarChart
            player={player}
            label={player.name}
            size={176}
            className="max-[700px]:hidden"
          />
          <div
            className={cx(
              'flex flex-col items-center rounded-control px-4 py-2.5 max-[700px]:hidden',
              points ? 'bg-gold text-on-gold' : 'bg-surface-soft text-muted',
            )}
          >
            <span className="text-[0.6875rem] font-extrabold tracking-[0.1em] uppercase">
              {c.profile.available}
            </span>
            <strong
              className="font-display text-5xl leading-[0.9] font-normal"
              data-testid="attribute-points"
            >
              {points}
            </strong>
          </div>
        </div>
      </div>
      <div id="cost-rules" className="mt-3 max-w-prose">
        <Disclosure summary={c.profile.costRules}>
          <p className="text-sm text-muted">
            {format(c.profile.attributesBody, {
              below: CONFIG.career.costs.belowCap,
              near: CONFIG.career.costs.nearCap,
              beyond: CONFIG.career.costs.beyondCap,
              step: CONFIG.career.costs.beyondCapStep,
              hardAge: CONFIG.career.costs.hardCapAge,
              hardMargin: CONFIG.career.costs.hardCapMargin,
              surcharge: CONFIG.career.costs.physicalSurcharge,
              age: CONFIG.career.costs.physicalAge,
            })}
          </p>
        </Disclosure>
      </div>
      {block && <p className="mt-3 rounded-control bg-surface-soft p-3 text-sm">{block}</p>}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <p className="mt-3 text-xs text-muted max-[700px]:hidden">{c.profile.keyboard}</p>
      {phone && (
        <div
          role="tablist"
          aria-label={c.profile.groupTabs}
          className="mt-4 grid gap-1 rounded-control bg-surface-soft p-1"
          style={{ gridTemplateColumns: `repeat(${groups.trained.length}, minmax(0, 1fr))` }}
        >
          {groups.trained.map(({ group }, index) => (
            <button
              key={group}
              id={`attribute-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={index === shownTab}
              aria-controls={`group-panel-${group}`}
              tabIndex={index === shownTab ? 0 : -1}
              onClick={() => setTab(index)}
              onKeyDown={(event) => onTabKey(event, index)}
              className={cx(
                'min-h-11 rounded-chip px-1 text-sm transition-colors',
                index === shownTab
                  ? 'bg-accent font-bold text-on-accent'
                  : 'font-semibold text-ink hover:bg-surface',
              )}
            >
              {c.profile.groups[group]}
            </button>
          ))}
        </div>
      )}
      {/* One readable list in a narrow panel (tablets beside the sidebar); a column per group
          once each can hold its labels, values and buttons. Phones show one group at a time. */}
      <div
        ref={list}
        className={cx(
          'mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-5',
          groups.trained.length === 3 ? '@min-[34rem]:grid-cols-3' : '@min-[34rem]:grid-cols-2',
        )}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          const buttons = Array.from(
            list.current?.querySelectorAll<HTMLButtonElement>('button[data-attribute]') ?? [],
          ).filter((button) => button.offsetParent !== null);
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : buttons.length - 1;
          buttons[(index + step) % buttons.length]?.focus();
        }}
      >
        {groups.trained.map(({ group, keys }, index) => (
          <div
            key={group}
            id={`group-panel-${group}`}
            role={phone ? 'tabpanel' : 'group'}
            aria-labelledby={phone ? `attribute-tab-${index}` : `group-${group}`}
            hidden={phone && index !== shownTab}
            className="min-w-0"
          >
            <h3
              id={`group-${group}`}
              className="mb-1 text-xs font-extrabold tracking-[0.12em] text-muted uppercase max-[700px]:sr-only"
            >
              {c.profile.groups[group]}
            </h3>
            <ul className="grid">
              {keys.map((key) => {
                const value = attributeValue(player, key);
                const cap = careerCap(player, key, age);
                const cost = attributeCost(world, key);
                const affordable = cost !== null && cost <= points;
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
                      : '';
                return (
                  <li
                    key={key}
                    data-attribute-row={key}
                    className="flex items-center gap-2.5 border-b border-line/70 py-1.5 last:border-b-0"
                  >
                    <AttributeBar
                      className="min-w-0 flex-1"
                      label={attributeName(key)}
                      value={value}
                      softCap={Math.min(99, cap)}
                      capLabel={status}
                      note={
                        cost !== null && cost > CONFIG.career.costs.belowCap
                          ? format(c.profile.cost, { cost })
                          : undefined
                      }
                    />
                    <button
                      type="button"
                      data-attribute={key}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-line bg-surface text-sm font-extrabold text-accent transition-colors hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:text-muted disabled:opacity-60 disabled:hover:border-line disabled:hover:bg-surface"
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
    </section>
  );
}

/**
 * Phones: the points to spend stay in view above the tab bar while the list scrolls. It sits
 * at the end of the page, so it rests there once the page is read to the bottom.
 */
function PointsBar({ points }: { points: number }) {
  const phone = usePhone();
  // `--tabbar` is the tab bar's nominal height; large text can make it taller.
  const [bottom, setBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const nav = document.querySelector('.bottom-nav');
    if (!phone || !nav) return;
    const update = () => setBottom(nav.getBoundingClientRect().height + 12);
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    update();
    return () => observer.disconnect();
  }, [phone]);
  if (!phone || !points) return null;
  const openRules = () => {
    const details = document.querySelector<HTMLDetailsElement>('#cost-rules details');
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ block: 'center' });
    details.querySelector('summary')?.focus({ preventScroll: true });
  };
  return (
    <aside
      aria-label={c.profile.available}
      style={bottom !== null ? { bottom } : undefined}
      className="sticky bottom-[calc(var(--tabbar)+0.75rem)] z-20 flex items-center gap-3 rounded-panel border border-gold bg-surface py-2.5 pr-2.5 pl-3 shadow-overlay"
    >
      <span
        aria-hidden="true"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-gold font-display text-[1.875rem] leading-none text-on-gold"
      >
        {points}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block font-extrabold">
          {plural(points, c.profile.pointsAvailableOne, c.profile.pointsAvailable)}
        </strong>
        <span className="block text-xs text-muted">{c.profile.pointsSave}</span>
      </span>
      <button type="button" className="text-button shrink-0 text-[0.8125rem]" onClick={openRules}>
        {c.profile.costRules}
      </button>
    </aside>
  );
}

/** Unlocked skills as medals, and the next one to aim for. */
function Traits({ world, career }: { world: World; career: Career }) {
  const link = useSaveLink();
  const unlocked = career.skills.flatMap((id) => (SKILL_BY_ID[id] ? [SKILL_BY_ID[id]] : []));
  const states = SKILLS.map((skill) => ({ skill, state: skillState(world, skill.id) }));
  const next =
    states.find((entry) => entry.state === 'available') ??
    states
      .filter((entry) => entry.state === 'locked')
      .sort((a, b) => a.skill.tier - b.skill.tier)[0];
  const nextLine = (() => {
    if (!next) return '';
    const { skill, state } = next;
    if (state === 'available') return format(c.profile.traitAvailable, { cost: skill.pointCost });
    const missing = skill.prerequisites.filter((id) => !career.skills.includes(id));
    if (missing.length)
      return format(c.profile.traitLocked, { names: missing.map(skillName).join(', ') });
    return format(c.profile.traitFrom, { level: skill.minimumLevel, cost: skill.pointCost });
  })();
  return (
    <Panel aria-labelledby="traits-heading" padding="compact">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <CardTitle id="traits-heading">{c.profile.traits}</CardTitle>
        <Link
          to={link(next ? `/career/skills?skill=${next.skill.id}` : '/career/skills')}
          className="inline-flex min-h-11 items-center text-[0.8125rem] font-semibold text-accent underline underline-offset-4"
        >
          <span className="sm:hidden">{c.profile.traitsLinkLong}</span>
          <span className="max-sm:hidden">{c.profile.traitsLink}</span>
        </Link>
      </div>
      {!unlocked.length && <p className="mt-1 text-sm text-muted">{c.profile.traitsEmpty}</p>}
      <ul className="mt-3 grid grid-cols-2 gap-2.5">
        {unlocked.map((skill) => (
          <li
            key={skill.id}
            className="flex min-w-0 items-center gap-2.5 rounded-control bg-surface-soft p-2.5"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-field text-gold shadow-[inset_0_0_0_3px_var(--color-gold)]">
              <SkillGlyph branch={skill.branch} />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.8125rem] leading-tight font-bold break-words">
                {skillName(skill.id)}
              </span>
              <span className="block text-[0.6875rem] text-muted">{c.branches[skill.branch]}</span>
            </span>
          </li>
        ))}
        {next && (
          <li className="flex min-w-0 items-center gap-2.5 rounded-control border border-dashed border-line p-2.5">
            <span
              className={cx(
                'grid h-10 w-10 shrink-0 place-items-center rounded-full',
                next.state === 'available'
                  ? 'bg-art-gold text-gold-ink'
                  : 'bg-surface-soft text-muted',
              )}
            >
              {next.state === 'available' ? (
                <SkillGlyph branch={next.skill.branch} />
              ) : (
                <Icon name="lock" className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.6875rem] font-bold text-muted">
                {c.profile.traitNext}
              </span>
              <span className="block text-[0.8125rem] leading-tight font-bold break-words">
                {skillName(next.skill.id)}
              </span>
              <span className="block text-[0.6875rem] text-muted">{nextLine}</span>
            </span>
          </li>
        )}
      </ul>
    </Panel>
  );
}

function ContractCard({ world, player }: { world: World; player: Player }) {
  const contract = player.contractId ? world.contracts[player.contractId] : undefined;
  const scouting = world.scouting.filter((entry) => entry.playerId === player.id).length;
  const ends = contract
    ? calendarDate(contract.end.season, contract.end.week, contract.end.day)
    : null;
  return (
    <Panel aria-labelledby="contract-heading" padding="compact">
      <CardTitle id="contract-heading">{c.profile.contract}</CardTitle>
      {contract && ends ? (
        <dl className="mt-3 grid grid-cols-2 gap-3">
          {[
            [c.profile.contractRole, c.profile.roles[contract.role]],
            [
              c.profile.contractWage,
              format(mk.perWeek, { amount: integer.format(contract.weeklyWage) }),
            ],
            [
              c.profile.contractEnds,
              format(c.profile.contractDate, {
                month: calendarText.months[ends.month - 1] ?? '',
                year: ends.year,
              }),
            ],
            [
              c.profile.contractGoalBonus,
              format(mk.money, { amount: integer.format(contract.goalBonus) }),
            ],
          ].map(([term, value]) => (
            <div key={term} className="min-w-0">
              <dt className="text-xs text-muted">{term}</dt>
              <dd className="font-bold break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted">{c.profile.noContract}</p>
      )}
      {scouting > 0 && (
        <p className="mt-3 rounded-control bg-art-gold px-3 py-2.5 text-[0.8125rem] font-semibold text-gold-ink">
          {plural(scouting, c.profile.scoutingOne, c.profile.scouting)}
        </p>
      )}
    </Panel>
  );
}

/** This season at a glance, on the night chrome so it reads as the match record. */
function SeasonCard({ world, career, player }: { world: World; career: Career; player: Player }) {
  const line = seasonLine(career, world.date.season);
  const cols = c.profile.columns;
  const keeper = player.primaryPosition === 'GK';
  const stats: [string, string | number][] = [
    [cols.apps, line.apps],
    keeper ? [cols.cleanSheets, line.cleanSheets] : [cols.goals, line.goals],
    [cols.assists, line.assists],
    [cols.avg, line.apps ? line.rating.toFixed(1) : '–'],
  ];
  return (
    <Panel tone="dark" padding="compact" aria-labelledby="season-heading">
      <CardTitle id="season-heading" className="text-night-ink">
        {format(c.profile.seasonTitle, { season: world.date.season })}
      </CardTitle>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        {stats.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col-reverse">
            <dt className="text-[0.6875rem] font-bold tracking-[0.04em] text-night-muted uppercase">
              {label}
            </dt>
            <dd className="font-display text-[2.5rem] leading-none text-gold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {!line.apps && <p className="mt-2 text-xs text-night-muted">{c.profile.seasonEmpty}</p>}
    </Panel>
  );
}

function Positions({ player }: { player: Player }) {
  const link = useSaveLink();
  return (
    <Panel aria-labelledby="positions-heading" className="min-w-0 flex-[1_1_22rem]">
      <CardTitle id="positions-heading">{c.profile.positions}</CardTitle>
      <ul className="mt-4 grid gap-3">
        {positionsOf(player).map((entry) => {
          const level = familiarityLevel(entry.familiarity);
          return (
            <li key={entry.position} className="flex items-center gap-3.5">
              <span
                className={cx(
                  'grid h-11 w-13 shrink-0 place-items-center rounded-control font-display text-[1.375rem]',
                  entry.primary ? 'bg-accent text-on-accent' : 'bg-surface-soft',
                )}
              >
                {entry.position}
              </span>
              <Meter
                className="min-w-0 flex-1"
                label={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{c.positions[entry.position]}</span>
                    <Chip
                      tone={entry.primary ? 'gold-soft' : level === 'learning' ? 'info' : 'accent'}
                      className="min-h-5 px-2 text-[0.6875rem]"
                    >
                      {c.profile.familiarityLevels[level]}
                    </Chip>
                  </span>
                }
                ariaLabel={c.positions[entry.position]}
                value={entry.familiarity}
                tone={level === 'learning' ? 'info' : 'accent'}
                valueText={
                  entry.primary
                    ? c.profile.primary
                    : format(c.profile.familiarity, { value: entry.familiarity })
                }
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[0.8125rem] text-muted">
        {c.profile.learnPosition}{' '}
        <Link
          to={link('/career/training')}
          className="font-semibold text-accent underline underline-offset-4"
        >
          {c.profile.planTraining}
        </Link>
      </p>
    </Panel>
  );
}

function Hidden({ player }: { player: Player }) {
  const { appearances, order } = CONFIG.career.reveal;
  const played = player.stats.appearances;
  return (
    <Panel aria-labelledby="hidden-heading" className="min-w-0 flex-[1_1_22rem]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <CardTitle id="hidden-heading">{c.profile.hidden}</CardTitle>
        <span className="text-[0.8125rem] font-semibold text-muted">
          {plural(played, c.profile.hiddenCountOne, c.profile.hiddenCount)}
        </span>
      </div>
      <p className={ui.helper}>{c.profile.hiddenBody}</p>
      <ul className="mt-3.5 grid gap-2">
        {order.map((key, index) => {
          const revealed = player.hidden.revealed.includes(key);
          return (
            <li
              key={key}
              className={cx(
                'flex min-h-12 items-center justify-between gap-3 rounded-control px-3.5 py-2',
                revealed ? 'bg-surface-soft' : 'border border-dashed border-line',
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5 text-sm font-bold">
                <span
                  aria-hidden="true"
                  className={cx(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full',
                    revealed ? 'bg-accent text-on-accent' : 'bg-surface-soft text-muted',
                  )}
                >
                  <Icon name={revealed ? 'check' : 'lock'} className="h-3.5 w-3.5" />
                </span>
                {c.profile.hiddenNames[key]}
              </span>
              {revealed ? (
                <span className="font-display text-[1.75rem] leading-none">
                  <span className="sr-only">{c.profile.revealed}: </span>
                  {player.hidden[key]}
                </span>
              ) : (
                <span className="text-right text-xs text-muted">
                  {format(c.profile.revealAt, { count: appearances[index]! })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Untrained({ player }: { player: Player }) {
  const { untrained } = attributeGroups(player);
  return (
    <Panel aria-labelledby="untrained-heading">
      <CardTitle id="untrained-heading">{c.profile.untrainedTitle}</CardTitle>
      <p className={ui.helper}>{c.profile.untrainedBody}</p>
      <Disclosure
        className="mt-3"
        summary={player.primaryPosition === 'GK' ? c.profile.untrained : c.profile.untrainedKeeper}
      >
        <ul className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-6">
          {untrained.map((key) => (
            <li
              key={key}
              className="flex justify-between gap-2 border-b border-line/70 py-1.5 text-sm text-muted"
            >
              <span className="min-w-0 break-words">{attributeName(key)}</span>
              <span className="shrink-0 font-bold text-ink">{attributeValue(player, key)}</span>
            </li>
          ))}
        </ul>
      </Disclosure>
    </Panel>
  );
}

function ResultScore({ match }: { match: CareerMatchRecord }) {
  return (
    <span className="inline-flex items-center gap-2">
      <ResultChip result={RESULT[match.result]} size="sm" />
      <span className="font-bold">
        {match.score[0]}–{match.score[1]}
      </span>
      {match.decided && (
        <span className="text-xs text-muted">{c.profile.decided[match.decided]}</span>
      )}
    </span>
  );
}

function AutoTag({ match }: { match: CareerMatchRecord }) {
  if (!match.auto) return null;
  return (
    <span title={c.profile.autoLabel} className="ml-2 inline-block">
      <Chip tone="info" className="min-h-5 px-2 text-[0.6875rem] tracking-[0.06em] uppercase">
        {c.profile.auto}
        <span className="sr-only">: {c.profile.autoLabel}</span>
      </Chip>
    </span>
  );
}

function History({ world, career }: { world: World; career: Career }) {
  const [shown, setShown] = useState(PAGE);
  const matches = [...career.matches].reverse();
  const lines = seasonLines(career);
  const cols = c.profile.columns;
  const visible = matches.slice(0, shown);
  const cell = 'px-1.5 py-2.5 sm:px-2';
  if (!matches.length)
    return (
      <Panel aria-labelledby="history-heading">
        <CardTitle id="history-heading">{c.profile.history}</CardTitle>
        <p className={cx(ui.muted, 'mt-2.5')}>{c.profile.historyEmpty}</p>
      </Panel>
    );
  return (
    <Panel aria-labelledby="history-heading">
      <CardTitle id="history-heading">{c.profile.history}</CardTitle>
      <h3 className="mt-4 text-[0.8125rem] font-bold text-muted">{c.profile.seasons}</h3>
      <div className="relative mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums sm:min-w-[34rem]">
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
              <tr
                key={line.season}
                className={cx(
                  'border-b border-line/60',
                  line.season === world.date.season && 'bg-accent-soft',
                )}
              >
                <th scope="row" className={`${cell} text-left font-extrabold`}>
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
      <h3 className="mt-6 text-[0.8125rem] font-bold text-muted">{c.profile.matches}</h3>
      {/* Phones: one stacked row per match, so score, rating and XP are never cut off. */}
      <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] sm:hidden">
        {visible.map((match) => {
          const opponent = world.clubs[match.opponentId];
          return (
            <li key={match.fixtureId} className="border-b border-line/60 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex shrink-0 items-center whitespace-nowrap">
                  <ResultScore match={match} />
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">
                  {opponent?.name ?? match.opponentId}
                  <span className="ml-1 text-xs font-normal text-muted">
                    ({match.home ? c.common.home : c.common.away})
                  </span>
                </span>
                <span className="shrink-0 font-display text-xl leading-none">
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
        <table className="w-full min-w-[44rem] border-collapse text-sm tabular-nums">
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
                  <th scope="row" className="px-2 py-1.5 text-left font-bold">
                    <span className="flex items-center gap-2.5">
                      {opponent && (
                        <CrestImage crest={opponent.crest} alt="" className="h-6 w-6 shrink-0" />
                      )}
                      <span className="truncate">
                        {opponent?.name ?? match.opponentId}
                        <span className="ml-1 text-xs font-medium text-muted">
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
                  <td className="px-2 py-2 font-bold">{match.rating.toFixed(1)}</td>
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
          type="button"
          className="button secondary mt-4"
          onClick={() => setShown((value) => value + PAGE)}
        >
          {format(c.profile.showMore, { count: Math.min(PAGE, matches.length - shown) })}
        </button>
      )}
    </Panel>
  );
}
