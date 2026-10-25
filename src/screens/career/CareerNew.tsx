import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Page } from '../../ui/Page';
import { Icon } from '../../ui/Icon';
import { Artwork } from '../../ui/Artwork';
import { Button, ButtonLink, Chip, PageHeader, Spinner, StatusLine, cx } from '../../ui/kit';
import {
  renderAvatar,
  generateAvatar,
  isAvatar,
  resolveAvatar,
  AVATAR_OPTIONS,
  AVATAR_PARTS,
  clubDress,
  type AvatarPart,
} from '../../engine/assets/avatar';
import { counterpartOf, renderFlag } from '../../engine/assets/flags';
import { PALETTES } from '../../engine/assets/shared';
import { createRng } from '../../engine/rng';
import { CONFIG } from '../../engine/config';
import { REAL_COUNTRY_NAMES } from '../../engine/world/catalog';
import { ARCHETYPES, ARCHETYPE_BY_ID } from '../../engine/career/catalogue';
import { trialOffers, validateDraft, type CareerDraft } from '../../engine/career/create';
import { startWorldJob } from '../../workers/client';
import { errorCode } from '../../persistence/errors';
import { persistence } from '../../persistence/lazy';
import type {
  Avatar,
  Club,
  Counterpart,
  Foot,
  Hex,
  Legacy,
  Position,
  SlotId,
  World,
} from '../../model/domain';
import { errorText, format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { CrestImage, JobProgress, useRestoredWorld } from './shared';
import { POSITIONS } from './selectors';
import { track } from '../../analytics';

const STEPS = ['identity', 'appearance', 'position', 'world', 'trial', 'confirm'] as const;
type Step = (typeof STEPS)[number];
const STORAGE_KEY = 'pitch-to-glory:career-draft';
const [MIN_AGE, MAX_AGE] = CONFIG.career.start.ageRange;
const AGES = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, index) => MIN_AGE + index);
const NAME_MAX = 40;
/** The ages the appearance step previews: now, the prime and the veteran years. */
const PREVIEW_LATER = [28, 38] as const;

interface WizardDraft {
  name: string;
  nationalityId: string;
  age: number;
  foot: Foot;
  avatar: Avatar;
  avatarRoll: number;
  position: Position;
  archetype: string;
  seed: string;
  clubId: string | null;
  /** Slot to save the new career in; 0 keeps it in memory, null picks the first empty slot. */
  saveSlot: SlotId | 0 | null;
  /** The retired career this player is the child of, if any (milestone 8). */
  parentLegacyId: string | null;
}
const defaultDraft = (): WizardDraft => ({
  name: '',
  nationalityId: 'country:0',
  age: 17,
  foot: 'right',
  avatar: rollAvatar(0),
  avatarRoll: 0,
  position: 'ST',
  archetype: 'finisher',
  seed: 'pitch-to-glory',
  clubId: null,
  saveSlot: null,
  parentLegacyId: null,
});
/**
 * A random look with every part set, including eye colour, nose and mouth, so choosing one part
 * never changes another.
 */
function rollAvatar(roll: number): Avatar {
  return resolveAvatar(generateAvatar(createRng(`pitch-to-glory:career-avatar:${roll}`)));
}
function readDraft(): WizardDraft {
  try {
    const stored = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<WizardDraft>;
    if (stored && typeof stored === 'object') {
      const draft = { ...defaultDraft(), ...stored };
      // Drafts from older versions lack the newer parts; drafts with unknown options start over.
      draft.avatar = isAvatar(stored.avatar) ? resolveAvatar(stored.avatar) : rollAvatar(0);
      return draft;
    }
  } catch {
    // Storage may be unavailable (private mode); the wizard works from memory.
  }
  return defaultDraft();
}
function writeDraft(draft: WizardDraft | null): void {
  try {
    if (draft) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-essential convenience.
  }
}
/** The current wizard query with another step, keeping `save` and `parent`. */
const withStep = (params: URLSearchParams, step: Step) => {
  const next = new URLSearchParams(params);
  next.set('step', step);
  return next.toString();
};
const familyOf = (position: Position) => (position === 'GK' ? 'keeper' : 'outfield');
const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;
const careerSeed = (world: World) => `${world.seed}:career`;
const archetypeLine = (id: string) => {
  const archetype = ARCHETYPE_BY_ID[id];
  return archetype
    ? `${c.archetypes[archetype.id]?.name ?? ''} · ${c.skillNames[archetype.startingSkill] ?? ''}`
    : '';
};

export default function CareerNew() {
  const world = useAppStore((s) => s.world);
  const job = useAppStore((s) => s.worldJob);
  const notice = useAppStore((s) => s.worldNotice);
  const worldError = useAppStore((s) => s.worldError);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // A wizard opened from a saved world (`?save=`) continues that world after a refresh; it
  // never falls back to generating a replacement while the save is still being opened.
  const restore = useRestoredWorld();
  const savedSlot = params.get('save');
  const waiting = restore.loading || Boolean(restore.error && savedSlot && !world);
  const [draft, setDraft] = useState<WizardDraft>(readDraft);
  const [error, setError] = useState('');
  const creating = useRef(false);
  const update = (patch: Partial<WizardDraft>) =>
    setDraft((current) => {
      const next = { ...current, ...patch };
      writeDraft(next);
      return next;
    });
  const usable = world && !world.career ? world : null;
  const parent = usable?.legacies.find(
    (legacy) => legacy.id === draft.parentLegacyId && !legacy.childPlayerId,
  );
  // `?parent=` arrives from a Legacy page: inherit the surname, nationality and colouring.
  const requestedParent = params.get('parent');
  useEffect(() => {
    if (!usable || !requestedParent || requestedParent === draft.parentLegacyId) return;
    const legacy = usable.legacies.find((entry) => entry.id === requestedParent);
    if (!legacy || legacy.childPlayerId) return;
    const surname = legacy.name.split(' ').slice(1).join(' ') || legacy.name;
    update({
      parentLegacyId: legacy.id,
      nationalityId: legacy.nationalityId,
      clubId: null,
      name: draft.name.trim().endsWith(surname) ? draft.name : surname,
      avatar: { ...draft.avatar, skin: legacy.avatar.skin, hairColor: legacy.avatar.hairColor },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applied once per requested parent
  }, [usable, requestedParent]);
  const countries: WizardCountry[] = usable
    ? Object.values(usable.countries)
        .filter((country) => !parent || country.id === parent.nationalityId)
        .map((country) => ({
          id: country.id,
          name: country.name,
          counterpart: country.counterpart,
          // Worlds with fictional countries: the national team's colours, as on the national page.
          colors: usable.international?.nations.find((nation) => nation.countryId === country.id)
            ?.colors,
        }))
    : REAL_COUNTRY_NAMES.map((name, index) => ({
        id: `country:${index}`,
        name,
        counterpart: counterpartOf(name) ?? undefined,
      }));
  const offers = useMemo(
    () => (usable ? trialOffers(usable, draft.nationalityId, careerSeed(usable)) : []),
    [usable, draft.nationalityId],
  );
  const valid: Record<Step, boolean> = {
    identity:
      draft.name.trim().length > 0 &&
      draft.name.trim().length <= NAME_MAX &&
      countries.some((country) => country.id === draft.nationalityId) &&
      AGES.includes(draft.age),
    appearance: true,
    position: ARCHETYPE_BY_ID[draft.archetype]?.family === familyOf(draft.position),
    world: Boolean(usable),
    trial: offers.some((club) => club.id === draft.clubId),
    confirm: true,
  };
  const requested = STEPS.find((step) => step === params.get('step')) ?? 'identity';
  const firstInvalid = STEPS.find((step) => !valid[step]);
  const reachable =
    firstInvalid && STEPS.indexOf(firstInvalid) < STEPS.indexOf(requested)
      ? firstInvalid
      : requested;
  const step: Step = creating.current ? 'confirm' : reachable;
  const index = STEPS.indexOf(step);
  useEffect(() => {
    if (step !== requested && !job && !waiting) {
      const next = new URLSearchParams(params);
      next.set('step', step);
      setParams(next, { replace: true });
    }
  }, [step, requested, job, waiting, params, setParams]);
  useEffect(() => track('wizard_step', { step, index }), [step, index]);
  const go = (target: Step) => {
    setError('');
    setParams(withStep(params, target));
  };
  // After signing: save to the chosen slot (if any) and open the career hub.
  useEffect(() => {
    if (!creating.current || job) return;
    if (notice === 'careerCreated' && world?.career) {
      creating.current = false;
      const slot = draft.saveSlot;
      writeDraft(null);
      if (slot && !useAppStore.getState().activeSave) {
        void persistence()
          .then((p) =>
            p.saveSlot(slot, format(c.wizard.saveName, { name: draft.name.trim() }), null),
          )
          .then(() => navigate(`/career?save=${slot}`, { replace: true }))
          .catch((cause: unknown) => {
            useAppStore.getState().worldFeedback(null, errorCode(cause));
            navigate('/career', { replace: true });
          });
      } else navigate('/career', { replace: true });
    } else if (worldError) {
      creating.current = false;
      setError(c.wizard.error);
    }
  }, [job, notice, world, worldError, draft.saveSlot, draft.name, navigate]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid[step]) return;
    if (step !== 'confirm') {
      go(STEPS[index + 1]!);
      return;
    }
    if (!usable || !draft.clubId) return;
    const careerDraft: CareerDraft = {
      name: draft.name.trim(),
      avatar: draft.avatar,
      nationalityId: draft.nationalityId,
      position: draft.position,
      foot: draft.foot,
      age: draft.age,
      archetype: draft.archetype,
      ...(parent ? { parentLegacyId: parent.id } : {}),
    };
    try {
      validateDraft(usable, careerDraft);
    } catch {
      setError(c.wizard.invalid);
      return;
    }
    setError('');
    creating.current = true;
    void startWorldJob('create-career', {
      career: { seed: careerSeed(usable), draft: careerDraft, clubId: draft.clubId },
    });
  };
  const club = usable && draft.clubId ? usable.clubs[draft.clubId] : undefined;
  const country = countries.find((entry) => entry.id === draft.nationalityId);
  const linkable = (position: number) =>
    position !== index &&
    !job &&
    !waiting &&
    (position < index || STEPS.slice(0, position).every((previous) => valid[previous]));
  const summary: SummaryProps = { draft, club, country, world: usable, step, valid, params };
  const signing = step === 'confirm' ? club : undefined;
  return (
    // No page entrance: a transformed page would carry the fixed phone footer with it.
    <Page className="career-page">
      <PageHeader
        eyebrow={
          <span className="font-extrabold tracking-[0.12em] text-accent uppercase">
            {c.wizard.eyebrow}
          </span>
        }
        title={c.wizard.title}
        description={c.wizard.description}
        className="max-[700px]:[&_p]:hidden"
      />
      <nav aria-label={c.wizard.progressLabel} className="mb-6 max-[700px]:mb-4">
        <p className="mb-2 text-[0.8125rem] font-bold text-muted max-[700px]:sr-only">
          {format(c.wizard.progress, { step: index + 1, total: STEPS.length })}
        </p>
        <ol className="grid grid-cols-6 gap-2 max-[700px]:flex max-[700px]:gap-0">
          {STEPS.map((item, position) => {
            const done = position < index;
            const current = position === index;
            const label = `${position + 1}. ${c.wizard.steps[item]}`;
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={cx(
                    'block h-2 rounded-full max-[700px]:hidden',
                    position <= index ? 'bg-accent' : 'bg-track',
                  )}
                />
                <span
                  className={cx(
                    'mt-2 block text-xs max-[700px]:sr-only',
                    current ? 'font-extrabold text-ink' : 'font-semibold',
                    !current && (linkable(position) ? 'text-accent' : 'text-muted'),
                  )}
                >
                  {label}
                </span>
                <span
                  aria-hidden="true"
                  className={cx(
                    'grid h-[1.875rem] w-[1.875rem] shrink-0 place-items-center rounded-full text-[0.8125rem] font-extrabold min-[701px]:hidden',
                    done
                      ? 'bg-accent text-on-accent'
                      : current
                        ? 'bg-gold text-on-gold ring-3 ring-art-gold'
                        : 'border border-line bg-surface text-muted',
                  )}
                >
                  {done ? <Icon name="check" className="h-4 w-4" /> : position + 1}
                </span>
              </>
            );
            return (
              <li
                key={item}
                className={cx(
                  'max-[700px]:flex max-[700px]:items-center',
                  position < STEPS.length - 1 && 'max-[700px]:flex-1',
                )}
              >
                {linkable(position) ? (
                  <Link
                    to={`?${withStep(params, item)}`}
                    className="block min-h-11 rounded-chip pt-1 hover:opacity-80 max-[700px]:grid max-[700px]:min-w-11 max-[700px]:place-items-center max-[700px]:pt-0"
                    aria-label={label}
                  >
                    {content}
                  </Link>
                ) : (
                  <span
                    className="block min-h-11 pt-1 max-[700px]:grid max-[700px]:min-w-11 max-[700px]:place-items-center max-[700px]:pt-0"
                    aria-current={current ? 'step' : undefined}
                  >
                    {content}
                  </span>
                )}
                {position < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cx(
                      'mx-0.5 h-[3px] flex-1 rounded-full min-[701px]:hidden',
                      done ? 'bg-accent' : 'bg-line',
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
        <p
          aria-hidden="true"
          className="mt-1.5 flex justify-between gap-3 text-xs font-bold min-[701px]:hidden"
        >
          <span className="text-accent">
            {format(c.wizard.stepOf, {
              step: index + 1,
              total: STEPS.length,
              name: c.wizard.steps[step],
            })}
          </span>
          {index < STEPS.length - 1 && (
            <span className="text-muted">
              {format(c.wizard.nextStep, { name: c.wizard.steps[STEPS[index + 1]!] })}
            </span>
          )}
        </p>
      </nav>
      {waiting ? (
        <section
          className="ui-card flex max-w-3xl flex-col gap-4 rounded-panel border border-line bg-surface p-panel shadow-surface sm:p-7"
          aria-live="polite"
        >
          {restore.loading ? (
            <p role="status" className="flex items-center gap-3 font-display text-3xl">
              <Spinner className="h-6 w-6 text-accent" />
              {c.wizard.restoring}
            </p>
          ) : (
            <>
              <h2 className="font-display text-[2.25rem] leading-none">{c.wizard.restoreFailed}</h2>
              <StatusLine tone="error">{restore.error}</StatusLine>
              <p className="max-w-prose text-sm text-muted">
                {format(c.wizard.restoreFailedBody, { slot: savedSlot ?? '' })}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button icon="refresh" onClick={restore.retry}>
                  {c.wizard.restoreRetry}
                </Button>
                <ButtonLink variant="secondary" to="/saves">
                  {c.common.openSaves}
                </ButtonLink>
              </div>
            </>
          )}
        </section>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <form
            onSubmit={submit}
            className="ui-card flex min-w-0 flex-[999_1_37.5rem] flex-col gap-[1.625rem] rounded-panel border border-line bg-surface p-panel shadow-surface sm:p-7 max-[700px]:mb-36"
            noValidate
          >
            {step === 'identity' && (
              <IdentityStep draft={draft} update={update} countries={countries} parent={parent} />
            )}
            {step === 'appearance' && <AppearanceStep draft={draft} update={update} club={club} />}
            {step === 'position' && <PositionStep draft={draft} update={update} />}
            {step === 'world' && <WorldStep draft={draft} update={update} />}
            {step === 'trial' && usable && (
              <TrialStep
                draft={draft}
                update={update}
                world={usable}
                offers={offers}
                identityLink={`?${withStep(params, 'identity')}`}
              />
            )}
            {step === 'confirm' && usable && (
              <ConfirmStep
                draft={draft}
                update={update}
                world={usable}
                club={club}
                params={params}
              />
            )}
            {(step === 'trial' || step === 'confirm') && !usable && (
              <p role="status" className="flex items-center gap-3 font-display text-3xl">
                <Spinner className="h-6 w-6 text-accent" />
                {c.wizard.signing}
              </p>
            )}
            {(error || (worldError && !creating.current && step !== 'world')) && (
              <StatusLine tone="error">{error || errorText(worldError!)}</StatusLine>
            )}
            <div
              className={cx(
                'mt-auto border-t border-line pt-5',
                'max-[700px]:fixed max-[700px]:inset-x-0 max-[700px]:bottom-[var(--tabbar)] max-[700px]:z-20 max-[700px]:m-0 max-[700px]:flex max-[700px]:flex-col max-[700px]:gap-2 max-[700px]:bg-surface max-[700px]:px-4 max-[700px]:pt-2.5 max-[700px]:pb-3 max-[700px]:shadow-[0_-8px_28px_rgb(27_48_33/0.08)]',
              )}
            >
              <PhoneSummary {...summary} />
              <div className="flex flex-wrap items-center justify-between gap-3 max-[700px]:flex-nowrap max-[700px]:gap-2">
                {index > 0 ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    disabled={Boolean(job)}
                    onClick={() => go(STEPS[index - 1]!)}
                    className="max-[700px]:min-h-12"
                  >
                    {c.common.back}
                  </Button>
                ) : (
                  <span className="max-[700px]:hidden" />
                )}
                <Button
                  type="submit"
                  variant={signing ? 'play' : 'primary'}
                  size="lg"
                  disabled={!valid[step] || Boolean(job)}
                  iconEnd="arrow"
                  className="min-w-44 max-[700px]:min-h-12 max-[700px]:min-w-0 max-[700px]:flex-1"
                >
                  {signing ? (
                    format(c.wizard.sign, { name: signing.name, club: signing.name })
                  ) : (
                    <>
                      <span className="max-[700px]:hidden">{c.common.next}</span>
                      <span className="min-[701px]:hidden">
                        {format(c.wizard.continueTo, {
                          name: c.wizard.steps[STEPS[Math.min(index + 1, STEPS.length - 1)]!],
                        })}
                      </span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
          <Summary {...summary} />
        </div>
      )}
    </Page>
  );
}

function StepHeading({ title, body }: { title: string; body: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Each step mounts its own heading: move focus there so keyboard and screen-reader users
  // start at the top of the new step.
  useEffect(() => {
    if (document.activeElement !== document.body && !document.activeElement?.closest('form'))
      return;
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div>
      <h2
        ref={heading}
        className="font-display text-[2.375rem] leading-[0.95] outline-none sm:text-[2.625rem]"
        tabIndex={-1}
      >
        {title}
      </h2>
      <p className="mt-2 max-w-[35rem] text-muted max-[700px]:text-[0.8125rem]">{body}</p>
    </div>
  );
}

/** The selected mark on a choice card: a filled disc with a tick. */
function Tick({ tone = 'accent' }: { tone?: 'accent' | 'gold' }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid h-6 w-6 shrink-0 place-items-center rounded-full',
        tone === 'gold' ? 'bg-gold text-on-gold' : 'bg-accent text-on-accent',
      )}
    >
      <Icon name="check" className="h-3.5 w-3.5 [stroke-width:3]" />
    </span>
  );
}

/** A radio choice drawn as a card: 2px line, the accent outline and tint when chosen. */
function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  children,
  className = '',
  tick = true,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  className?: string;
  /** Show the tick when chosen (cards with their own selected art leave it out). */
  tick?: boolean;
}) {
  return (
    <label
      className={cx(
        'relative flex min-w-0 cursor-pointer rounded-control border-2 transition-colors hover:border-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring',
        checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only top-1/2 left-1/2"
      />
      {children}
      {tick && checked && <Tick />}
    </label>
  );
}

const legendClass = 'mb-2.5 p-0 text-[0.8125rem] font-bold';

type StepProps = { draft: WizardDraft; update: (patch: Partial<WizardDraft>) => void };
type WizardCountry = {
  id: string;
  name: string;
  counterpart?: Counterpart | undefined;
  colors?: [Hex, Hex] | undefined;
};

/** The country's flag; worlds with fictional countries get a two-colour flag. Decorative. */
function CountryFlag({
  country,
  index,
  className = 'h-7 w-[2.625rem]',
}: {
  country: WizardCountry;
  index: number;
  className?: string;
}) {
  const svg = useMemo(
    () =>
      renderFlag(country.counterpart, {
        colors: country.colors ?? (PALETTES[index % PALETTES.length]!.slice(0, 2) as [Hex, Hex]),
      }),
    [country.counterpart, country.colors, index],
  );
  return <Artwork svg={svg} alt="" className={`shrink-0 rounded-[3px] ${className}`} />;
}

/** Two boots seen from above, the chosen foot (or both) filled. */
function FeetIcon({ foot }: { foot: Foot }) {
  const left = foot !== 'right';
  const right = foot !== 'left';
  return (
    <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true" className="shrink-0">
      <ellipse
        cx="15"
        cy="24"
        rx="7"
        ry="13"
        strokeWidth="2"
        className={cx('stroke-accent', left ? 'fill-accent' : 'fill-surface')}
      />
      <ellipse
        cx="29"
        cy="20"
        rx="7"
        ry="13"
        strokeWidth="2"
        className={cx('stroke-accent', right ? 'fill-accent' : 'fill-surface')}
      />
    </svg>
  );
}

function IdentityStep({
  draft,
  update,
  countries,
  parent,
}: StepProps & { countries: WizardCountry[]; parent: Legacy | undefined }) {
  const [touched, setTouched] = useState(false);
  const missing = touched && !draft.name.trim();
  const parentArt = useMemo(
    () => (parent ? renderAvatar(parent.avatar, parent.age, {}, 'parent') : null),
    [parent],
  );
  return (
    <>
      <StepHeading title={c.wizard.identityTitle} body={c.wizard.identityBody} />
      {parent && (
        <div className="flex flex-wrap items-center gap-3.5 rounded-control border-2 border-accent bg-accent-soft px-4 py-3.5">
          {parentArt && (
            <Artwork
              svg={parentArt}
              alt=""
              className="h-[3.25rem] w-[3.25rem] shrink-0 rounded-full"
            />
          )}
          <div className="min-w-0 flex-[1_1_15rem]">
            <strong className="block">{format(h.child.banner, { name: parent.name })}</strong>
            <p className="mt-0.5 text-[0.8125rem] text-muted">{h.child.body}</p>
          </div>
          <Button variant="secondary" onClick={() => update({ parentLegacyId: null })}>
            {h.child.clear}
          </Button>
        </div>
      )}
      <div className="max-w-[27.5rem]">
        <label htmlFor="career-name" className="mb-1.5 block text-[0.8125rem] font-bold">
          {c.wizard.name}
        </label>
        <input
          id="career-name"
          value={draft.name}
          maxLength={NAME_MAX}
          required
          autoComplete="off"
          aria-describedby="career-name-hint"
          aria-invalid={missing || undefined}
          className="min-h-[3.25rem] text-[1.0625rem] font-semibold"
          onBlur={() => setTouched(true)}
          onChange={(event) => {
            setTouched(true);
            update({ name: event.target.value });
          }}
        />
        <div className="mt-1.5 flex justify-between gap-3 text-xs text-muted">
          <span
            id="career-name-hint"
            className={cx(missing && 'flex items-center gap-1.5 font-bold text-danger')}
          >
            {missing && <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />}
            {draft.name.trim() ? c.wizard.nameHint : c.wizard.nameRequired}
          </span>
          <span aria-hidden="true" className="tabular-nums">
            {format(c.wizard.nameCount, { count: draft.name.length, max: NAME_MAX })}
          </span>
        </div>
      </div>
      <fieldset className="min-w-0">
        <legend className={legendClass}>{c.wizard.nationality}</legend>
        <p className="-mt-1.5 mb-2.5 text-xs text-muted">
          {parent ? c.wizard.parentCountry : c.wizard.nationalityHint}
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13.75rem),1fr))] gap-2.5">
          {countries.map((country, index) => (
            <ChoiceCard
              key={country.id}
              name="nationality"
              value={country.id}
              checked={draft.nationalityId === country.id}
              onChange={() => update({ nationalityId: country.id, clubId: null })}
              className="min-h-[3.75rem] items-center gap-3 px-3.5 py-2.5"
            >
              <CountryFlag country={country} index={index} />
              <span className="min-w-0 flex-1">
                <strong className="block break-words">{country.name}</strong>
                {country.counterpart && country.counterpart !== country.name && (
                  <span className="block text-xs text-muted">
                    {format(c.wizard.basedOn, { country: country.counterpart })}
                  </span>
                )}
              </span>
            </ChoiceCard>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-6">
        <fieldset className="min-w-0 flex-[1_1_17.5rem]">
          <legend className={legendClass}>{c.wizard.age}</legend>
          <div className="grid gap-2.5">
            {AGES.map((age) => (
              <ChoiceCard
                key={age}
                name="age"
                value={String(age)}
                checked={draft.age === age}
                onChange={() => update({ age })}
                className="min-h-[3.75rem] items-center gap-3 px-3.5 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-control font-display text-[1.75rem] leading-none',
                    draft.age === age ? 'bg-accent text-on-accent' : 'bg-surface-soft text-ink',
                  )}
                >
                  {age}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block">{format(c.wizard.ageValue, { age })}</strong>
                  <span className="block text-xs text-muted">{c.wizard.ageHint[age]}</span>
                </span>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0 flex-[1_1_17.5rem]">
          <legend className={legendClass}>{c.wizard.foot}</legend>
          <div className="grid gap-2.5">
            {(['left', 'right', 'both'] as const).map((foot) => (
              <ChoiceCard
                key={foot}
                name="foot"
                value={foot}
                checked={draft.foot === foot}
                onChange={() => update({ foot })}
                className="min-h-[3.75rem] items-center gap-3 px-3.5 py-2"
              >
                <FeetIcon foot={foot} />
                <strong className="flex-1">{c.feet[foot]}</strong>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
      </div>
    </>
  );
}

function AppearanceStep({ draft, update, club }: StepProps & { club: Club | undefined }) {
  const [part, setPart] = useState<AvatarPart>('hair');
  const [previewAge, setPreviewAge] = useState(draft.age);
  const chosen = resolveAvatar(draft.avatar)[part];
  const dress = useMemo(() => clubDress(club), [club]);
  const previews = useMemo(
    () =>
      Array.from({ length: AVATAR_OPTIONS[part] }, (_, option) =>
        renderAvatar({ ...draft.avatar, [part]: option }, draft.age, dress),
      ),
    [draft.avatar, draft.age, part, dress],
  );
  const ages = [draft.age, ...PREVIEW_LATER];
  const shown = ages.includes(previewAge) ? previewAge : draft.age;
  return (
    <>
      <StepHeading title={c.wizard.appearanceTitle} body={c.wizard.appearanceBody} />
      <div className="flex flex-wrap items-start gap-7">
        <div className="mx-auto flex min-w-0 flex-[0_1_14.5rem] flex-col items-center gap-3.5 max-[700px]:mx-0 max-[700px]:w-full max-[700px]:flex-[1_1_100%] max-[700px]:flex-row max-[700px]:gap-3.5 max-[700px]:rounded-panel max-[700px]:border max-[700px]:border-line max-[700px]:bg-surface max-[700px]:p-3 max-[700px]:shadow-surface">
          <Artwork
            svg={renderAvatar(draft.avatar, shown, dress, 'preview')}
            alt={format(c.wizard.previewAlt, { age: shown })}
            className="h-52 w-52 shrink-0 rounded-full shadow-surface max-[700px]:h-[7.5rem] max-[700px]:w-[7.5rem] max-[700px]:rounded-control max-[700px]:shadow-none"
          />
          <div className="flex w-full min-w-0 flex-col gap-3.5 max-[700px]:gap-2">
            <fieldset className="min-w-0 min-[701px]:hidden">
              <legend className="mb-1 text-xs font-bold text-muted">{c.wizard.previewAges}</legend>
              <div className="grid grid-cols-3 gap-[3px] rounded-control bg-surface-soft p-[3px]">
                {ages.map((age) => (
                  <label
                    key={age}
                    className={cx(
                      'relative grid min-h-11 cursor-pointer place-items-center rounded-chip text-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus-ring',
                      shown === age ? 'bg-accent font-extrabold text-on-accent' : 'font-semibold',
                    )}
                  >
                    <input
                      type="radio"
                      name="preview-age"
                      className="sr-only top-1/2 left-1/2"
                      checked={shown === age}
                      onChange={() => setPreviewAge(age)}
                    />
                    <span className="sr-only">{format(c.wizard.previewAge, { age })}</span>
                    <span aria-hidden="true">{age}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              variant="secondary"
              block
              icon="refresh"
              onClick={() => {
                const roll = draft.avatarRoll + 1;
                update({ avatarRoll: roll, avatar: rollAvatar(roll) });
              }}
            >
              {c.wizard.randomize}
            </Button>
            <div className="w-full rounded-control bg-surface-soft px-2.5 py-3 max-[700px]:hidden">
              <p className="mb-2 text-center text-xs font-bold text-muted">
                {c.wizard.ageingPreview}
              </p>
              <div className="flex justify-center gap-2.5">
                {ages.map((age) => (
                  <figure key={age} className="flex flex-col items-center gap-1">
                    <Artwork
                      svg={renderAvatar(draft.avatar, age, dress, `age-${age}`)}
                      alt={format(c.wizard.previewAlt, { age })}
                      className="h-14 w-14 rounded-full"
                    />
                    <figcaption className="text-xs font-bold text-muted">{age}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_23.75rem] flex-col gap-4">
          <div className="relative max-[700px]:-mx-panel">
            <div
              role="group"
              aria-label={c.wizard.feature}
              className="flex flex-wrap gap-2 max-[700px]:flex-nowrap max-[700px]:overflow-x-auto max-[700px]:px-panel max-[700px]:pb-1"
            >
              {AVATAR_PARTS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={part === item}
                  onClick={() => setPart(item)}
                  className={cx(
                    'min-h-11 shrink-0 rounded-full border px-4 text-[0.8125rem] font-bold whitespace-nowrap transition-colors',
                    part === item
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-line bg-surface text-ink hover:border-accent',
                  )}
                >
                  {c.wizard.parts[item]}
                </button>
              ))}
            </div>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-r from-transparent to-surface min-[701px]:hidden"
            />
          </div>
          <fieldset className="min-w-0">
            <legend className={legendClass}>
              {format(c.wizard.optionsLabel, { feature: c.wizard.parts[part] })}
            </legend>
            <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
              {previews.map((svg, option) => (
                <label
                  key={option}
                  className={cx(
                    'relative block cursor-pointer rounded-control border-2 p-1 transition-colors hover:border-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring',
                    chosen === option ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
                  )}
                >
                  <input
                    type="radio"
                    name={`avatar-${part}`}
                    className="sr-only top-1/2 left-1/2"
                    checked={chosen === option}
                    onChange={() => update({ avatar: { ...draft.avatar, [part]: option } })}
                  />
                  <Artwork svg={svg} alt="" className="aspect-square w-full rounded-chip" />
                  <span className="sr-only">
                    {format(c.wizard.option, { feature: c.wizard.parts[part], number: option + 1 })}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cx(
                      'absolute top-2 left-2 grid h-6 w-6 place-items-center rounded-full text-xs font-extrabold max-[700px]:top-1 max-[700px]:left-1 max-[700px]:h-5 max-[700px]:w-5',
                      chosen === option
                        ? 'bg-accent text-on-accent'
                        : 'bg-surface text-ink ring-1 ring-line',
                    )}
                  >
                    {option + 1}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted max-[700px]:hidden">{c.wizard.optionsTip}</p>
        </div>
      </div>
    </>
  );
}

/** Where each position stands on the little pitch (24 × 34, attacking upwards). */
const POSITION_SPOT: Record<Position, [number, number]> = {
  GK: [12, 30],
  CB: [12, 25],
  LB: [4.5, 23],
  RB: [19.5, 23],
  DM: [12, 20],
  CM: [12, 16],
  AM: [12, 11],
  LW: [4.5, 8],
  RW: [19.5, 8],
  ST: [12, 5],
};

function PositionPitch({ position, chosen }: { position: Position; chosen: boolean }) {
  const [x, y] = POSITION_SPOT[position] ?? [12, 17];
  const line = chosen ? 'stroke-mint' : 'stroke-accent';
  return (
    <svg viewBox="0 0 24 34" width="26" height="36" aria-hidden="true" className="shrink-0">
      <rect
        x="1"
        y="1"
        width="22"
        height="32"
        rx="3"
        strokeWidth="1.2"
        className={cx(line, chosen ? 'fill-field' : 'fill-accent-soft')}
      />
      <path
        d="M1 17 H23 M8 1 V5 H16 V1 M8 33 V29 H16 V33"
        fill="none"
        strokeWidth="1.2"
        className={line}
      />
      <circle cx={x} cy={y} r="3.4" className={chosen ? 'fill-gold' : 'fill-accent'} />
    </svg>
  );
}

function PositionStep({ draft, update }: StepProps) {
  const family = familyOf(draft.position);
  const archetypes = ARCHETYPES.filter((archetype) => archetype.family === family).sort(
    (a, b) =>
      Number(b.positions.includes(draft.position)) - Number(a.positions.includes(draft.position)),
  );
  return (
    <>
      <StepHeading title={c.wizard.positionTitle} body={c.wizard.positionBody} />
      <fieldset className="min-w-0">
        <legend className={legendClass}>{c.wizard.position}</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,7.75rem),1fr))] gap-2.5">
          {POSITIONS.map((position) => (
            <ChoiceCard
              key={position}
              name="position"
              value={position}
              checked={draft.position === position}
              tick={false}
              className="min-h-16 items-center gap-2.5 px-3 py-2.5"
              onChange={() => {
                const current = ARCHETYPE_BY_ID[draft.archetype];
                const keep = current?.family === familyOf(position);
                const fallback =
                  ARCHETYPES.find(
                    (archetype) =>
                      archetype.family === familyOf(position) &&
                      archetype.positions.includes(position),
                  ) ?? ARCHETYPES.find((archetype) => archetype.family === familyOf(position))!;
                update({ position, archetype: keep ? draft.archetype : fallback.id });
              }}
            >
              <PositionPitch position={position} chosen={draft.position === position} />
              <span className="min-w-0">
                <strong className="block font-display text-[1.75rem] leading-none font-normal">
                  {position}
                </strong>
                <span className="block text-xs leading-tight text-muted">
                  {c.positions[position]}
                </span>
              </span>
            </ChoiceCard>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="p-0 text-[0.8125rem] font-bold">{c.wizard.archetype}</legend>
        <p className="mt-0.5 mb-2.5 text-xs text-muted">
          {format(c.wizard.archetypeHint, { family: c.wizard.families[family] })}
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18.75rem),1fr))] gap-3">
          {archetypes.map((archetype) => (
            <ChoiceCard
              key={archetype.id}
              name="archetype"
              value={archetype.id}
              checked={draft.archetype === archetype.id}
              tick={false}
              className="min-h-11 flex-col gap-2 p-4"
              onChange={() => update({ archetype: archetype.id })}
            >
              <span className="flex items-start justify-between gap-2.5">
                <strong className="font-display text-[1.75rem] leading-none font-normal">
                  {c.archetypes[archetype.id]?.name}
                </strong>
                {archetype.positions.includes(draft.position) && (
                  <Chip tone="gold-soft" className="shrink-0">
                    {c.wizard.suitsPosition}
                  </Chip>
                )}
              </span>
              <span className="block text-sm">{c.archetypes[archetype.id]?.body}</span>
              <span className="block text-xs text-muted">
                {format(c.wizard.suited, { positions: archetype.positions.join(', ') })}
              </span>
              <span className="flex flex-wrap gap-1.5">
                <span className="sr-only">{c.wizard.emphasis}:</span>
                {Object.entries(archetype.emphasis).map(([key, value]) => (
                  <Chip key={key}>
                    +{Math.round(value! * CONFIG.career.start.emphasisScale)} {attributeName(key)}
                  </Chip>
                ))}
              </span>
              <span className="flex items-center gap-2 border-t border-line pt-2.5 text-[0.8125rem]">
                <span
                  aria-hidden="true"
                  className="grid h-[1.625rem] w-[1.625rem] shrink-0 place-items-center rounded-full bg-field text-gold"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <path
                      d="M12 3 L14.6 9 L21 9.5 L16 13.6 L17.6 20 L12 16.6 L6.4 20 L8 13.6 L3 9.5 L9.4 9Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span>
                  <span className="font-bold">{c.wizard.startingSkill}:</span>{' '}
                  {c.skillNames[archetype.startingSkill]}
                </span>
              </span>
            </ChoiceCard>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function WorldStep({ draft, update }: StepProps) {
  const world = useAppStore((s) => s.world);
  const job = useAppStore((s) => s.worldJob);
  const active = useAppStore((s) => s.activeSave);
  const error = useAppStore((s) => s.worldError);
  const usable = world && !world.career ? world : null;
  const careerClub = world?.career
    ? world.clubs[world.players[world.career.playerId]?.clubId ?? '']
    : undefined;
  const build = () => {
    if (!draft.seed.trim() || job) return;
    update({ clubId: null });
    void startWorldJob('generate', { seed: draft.seed.trim() });
  };
  return (
    <>
      <StepHeading title={c.wizard.worldTitle} body={c.wizard.worldBody} />
      {usable && (
        <section
          aria-labelledby="wizard-loaded-world"
          className="flex flex-col gap-3 rounded-panel border-2 border-accent bg-accent-soft px-[1.375rem] py-5"
        >
          <div className="flex items-center gap-3">
            <Tick />
            <h3
              id="wizard-loaded-world"
              className="font-display text-[1.875rem] leading-none font-normal"
            >
              {c.wizard.useLoaded}
            </h3>
          </div>
          <p>
            {format(c.wizard.useLoadedBody, {
              season: usable.date.season,
              week: usable.date.week,
            })}{' '}
            {active?.payload.kind === 'world' &&
              format(c.wizard.useLoadedSaved, { slot: active.slot })}
          </p>
          <ul aria-label={c.wizard.worldCountries} className="flex flex-wrap gap-2">
            {Object.values(usable.countries).map((country, index) => (
              <li
                key={country.id}
                className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1.5 text-xs font-bold"
              >
                <CountryFlag
                  index={index}
                  className="h-4 w-6"
                  country={{
                    id: country.id,
                    name: country.name,
                    counterpart: country.counterpart,
                    colors: usable.international?.nations.find(
                      (nation) => nation.countryId === country.id,
                    )?.colors,
                  }}
                />
                {country.name}
              </li>
            ))}
          </ul>
          <p className="text-[0.8125rem] text-muted">
            {format(c.wizard.built, {
              clubs: Object.keys(usable.clubs).length.toLocaleString('en'),
              players: Object.keys(usable.players).length.toLocaleString('en'),
            })}
          </p>
        </section>
      )}
      {world?.career && (
        <p className="flex items-center gap-2.5 font-bold">
          {careerClub && (
            <CrestImage crest={careerClub.crest} alt="" className="h-9 w-8 shrink-0" />
          )}
          {c.wizard.careerLoaded}
        </p>
      )}
      <section
        aria-labelledby="wizard-new-world"
        className="flex flex-col gap-2.5 rounded-panel border border-line px-[1.375rem] py-5"
      >
        <h3 id="wizard-new-world" className="text-base font-extrabold">
          {usable ? c.wizard.rebuild : c.wizard.generate}
        </h3>
        <p className="text-muted">{c.wizard.generateBody}</p>
        {world &&
          (active ? (
            <p
              role="note"
              className="flex items-start gap-2 rounded-control bg-art-blue px-3 py-2.5 text-[0.8125rem] font-semibold text-info"
            >
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
              {c.wizard.replaceNote}
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-control border border-danger bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-bold text-danger">
              <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />
              {c.wizard.unsavedLoss}
            </p>
          ))}
        <label htmlFor="career-world-seed" className="mt-1.5 block text-[0.8125rem] font-bold">
          {c.wizard.seed}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="career-world-seed"
            value={draft.seed}
            maxLength={120}
            disabled={Boolean(job)}
            className="min-w-0 flex-[1_1_15rem]"
            onChange={(event) => update({ seed: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                build();
              }
            }}
          />
          <Button
            variant={usable ? 'secondary' : 'primary'}
            className="shrink-0"
            disabled={Boolean(job) || !draft.seed.trim()}
            onClick={build}
          >
            {usable ? c.wizard.rebuild : c.wizard.build}
          </Button>
        </div>
      </section>
      <JobProgress />
      {error && !job && <StatusLine tone="error">{errorText(error)}</StatusLine>}
      {!usable && !job && <p className="text-muted">{c.wizard.worldNeeded}</p>}
    </>
  );
}

function TrialStep({
  draft,
  update,
  world,
  offers,
  identityLink,
}: StepProps & { world: World; offers: Club[]; identityLink: string }) {
  const country = world.countries[draft.nationalityId];
  return (
    <>
      <StepHeading
        title={c.wizard.trialTitle}
        body={format(c.wizard.trialBody, { country: country?.name ?? '' })}
      />
      {offers.length ? (
        <fieldset className="min-w-0">
          <legend className="sr-only">{c.wizard.steps.trial}</legend>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12.5rem),1fr))] gap-3">
            {offers.map((club) => {
              const league = world.leagues[club.leagueId];
              const manager = world.managers[club.managerId];
              const chosen = draft.clubId === club.id;
              return (
                <label
                  key={club.id}
                  className={cx(
                    'relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-panel border-2 bg-surface transition-colors hover:border-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring',
                    chosen ? 'border-accent shadow-surface' : 'border-line',
                  )}
                >
                  <input
                    type="radio"
                    name="trial"
                    value={club.id}
                    checked={chosen}
                    onChange={() => update({ clubId: club.id })}
                    className="sr-only top-1/2 left-1/2"
                  />
                  <span
                    className={cx(
                      'relative flex items-center gap-3 p-4',
                      chosen ? 'bg-field-stripes text-hero-ink' : 'bg-surface-soft text-ink',
                    )}
                  >
                    <CrestImage crest={club.crest} alt="" className="h-[4.5rem] w-16 shrink-0" />
                    <strong className="min-w-0 flex-1 pr-7 font-display text-[1.75rem] leading-[0.95] font-normal break-words">
                      {club.name}
                    </strong>
                    {chosen && (
                      <span className="absolute top-3 right-3">
                        <Tick tone="gold" />
                      </span>
                    )}
                  </span>
                  <dl className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4 text-[0.8125rem]">
                    <TrialFact label={c.wizard.trialLeague}>{league?.name ?? ''}</TrialFact>
                    <TrialFact label={c.wizard.trialStadium}>
                      {`${club.stadium.name} · ${format(c.wizard.capacity, {
                        count: club.stadium.capacity.toLocaleString('en'),
                      })}`}
                    </TrialFact>
                    <TrialFact label={c.wizard.trialReputation}>
                      <span className="flex items-center gap-2">
                        <span className="w-6 font-extrabold tabular-nums">{club.reputation}</span>
                        <span
                          aria-hidden="true"
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-track"
                        >
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${Math.max(0, Math.min(100, club.reputation))}%` }}
                          />
                        </span>
                      </span>
                    </TrialFact>
                    <TrialFact label={c.wizard.trialStyle}>
                      {t.world.styles[club.playingStyle as keyof typeof t.world.styles] ??
                        club.playingStyle}
                    </TrialFact>
                    <TrialFact label={c.wizard.trialManager}>{manager?.name ?? ''}</TrialFact>
                  </dl>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <svg viewBox="0 0 72 80" width="72" height="80" aria-hidden="true" className="shrink-0">
              <path
                d="M36 4 L66 15 V38 Q66 62 36 76 Q6 62 6 38 V15Z"
                strokeWidth="3"
                strokeDasharray="7 6"
                className="fill-surface-soft stroke-line"
              />
              <path
                d="M28 32 L44 48 M44 32 L28 48"
                strokeWidth="3"
                strokeLinecap="round"
                className="stroke-muted"
              />
            </svg>
            <p className="min-w-0 flex-[1_1_18.75rem] text-[0.9375rem]">{c.wizard.noOffers}</p>
          </div>
          <div>
            <ButtonLink variant="secondary" to={identityLink}>
              {c.wizard.changeNationality}
            </ButtonLink>
          </div>
        </div>
      )}
    </>
  );
}

function TrialFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

const SLOT_ICON = 'M5 4 H16 L20 8 V20 H4 V4Z M8 4 V9 H15 V4 M8 20 V14 H16 V20';
const MEMORY_ICON = 'M4 7 H20 V17 H4Z M8 11 H16';

function SlotIcon({ path, chosen }: { path: string; chosen: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid h-9 w-9 shrink-0 place-items-center rounded-control',
        chosen ? 'bg-accent text-on-accent' : 'bg-surface-soft text-accent',
      )}
    >
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ConfirmStep({
  draft,
  update,
  world,
  club,
  params,
}: StepProps & { world: World; club: Club | undefined; params: URLSearchParams }) {
  const active = useAppStore((s) => s.activeSave);
  const job = useAppStore((s) => s.worldJob);
  const [empty, setEmpty] = useState<SlotId[] | null>(null);
  useEffect(() => {
    if (active) return;
    let current = true;
    void persistence()
      .then((p) => p.saves.list())
      .then((list) => {
        if (!current) return;
        const slots = list.filter((slot) => slot.status === 'empty').map((slot) => slot.slot);
        setEmpty(slots);
        if (draft.saveSlot === null || (draft.saveSlot && !slots.includes(draft.saveSlot)))
          update({ saveSlot: slots[0] ?? 0 });
      })
      .catch(() => current && setEmpty([]));
    return () => {
      current = false;
    };
    // The slot list is read once when the step opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const archetype = ARCHETYPE_BY_ID[draft.archetype];
  const league = club ? world.leagues[club.leagueId] : undefined;
  const manager = club ? world.managers[club.managerId] : undefined;
  const edit = (target: Step) => `?${withStep(params, target)}`;
  const rows: [string, string, Step][] = [
    [c.wizard.name, draft.name.trim(), 'identity'],
    [c.wizard.nationality, world.countries[draft.nationalityId]?.name ?? '', 'identity'],
    [c.wizard.age, format(c.wizard.ageValue, { age: draft.age }), 'identity'],
    [c.wizard.foot, c.feet[draft.foot], 'identity'],
    [c.wizard.position, `${draft.position} · ${c.positions[draft.position]}`, 'position'],
    [c.wizard.archetype, archetype ? c.archetypes[archetype.id]!.name : '', 'position'],
  ];
  return (
    <>
      <StepHeading title={c.wizard.confirmTitle} body={c.wizard.confirmBody} />
      <dl className="flex flex-col gap-2.5">
        {club && (
          <div className="flex flex-wrap items-center gap-4 rounded-panel bg-field-stripes px-5 py-4 text-hero-ink">
            <CrestImage crest={club.crest} alt="" className="h-[4.5rem] w-16 shrink-0" />
            <div className="min-w-0 flex-[1_1_13.75rem]">
              <dt className="text-xs font-bold text-hero-muted">
                {c.wizard.steps.trial} · {c.wizard.trialLeague}
              </dt>
              <dd>
                <span className="block font-display text-[2.125rem] leading-[0.95] break-words">
                  {club.name}
                </span>
                <span className="block text-[0.8125rem] text-hero-muted">
                  {[league?.name, club.stadium.name, manager?.name].filter(Boolean).join(' · ')}
                </span>
              </dd>
            </div>
            <Link
              to={edit('trial')}
              aria-label={`${c.wizard.edit}: ${c.wizard.steps.trial}`}
              className="inline-flex min-h-11 items-center rounded-control px-3.5 font-bold text-hero-ink underline underline-offset-4 hover:bg-white/10"
            >
              {c.wizard.edit}
            </Link>
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16.25rem),1fr))] gap-2.5">
          {rows.map(([label, value, target]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 rounded-control bg-surface-soft py-2.5 pr-1.5 pl-3.5"
            >
              <div className="min-w-0">
                <dt className="text-xs font-bold text-muted">{label}</dt>
                <dd className="font-bold break-words">{value}</dd>
              </div>
              <Link
                to={edit(target)}
                className="inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-[0.8125rem] font-bold text-accent underline underline-offset-4 hover:bg-surface"
                aria-label={`${c.wizard.edit}: ${label}`}
              >
                {c.wizard.edit}
              </Link>
            </div>
          ))}
        </div>
      </dl>
      {active?.payload.kind === 'world' ? (
        <p className="flex items-center gap-2.5 rounded-control bg-art-blue px-3.5 py-3 font-bold text-info">
          <Icon name="save" className="h-5 w-5 shrink-0" />
          {format(c.wizard.autosaved, { slot: active.slot })}
        </p>
      ) : (
        <fieldset className="min-w-0">
          <legend className="p-0 text-[0.8125rem] font-bold">{c.wizard.saveTo}</legend>
          <p className="mt-0.5 mb-2.5 text-xs text-muted">{c.wizard.saveToBody}</p>
          {!empty ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="text-accent" />
              {t.saves.loading}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12.5rem),1fr))] gap-2.5">
                {empty.map((slot) => (
                  <ChoiceCard
                    key={slot}
                    name="save-slot"
                    value={String(slot)}
                    checked={draft.saveSlot === slot}
                    onChange={() => update({ saveSlot: slot })}
                    className="min-h-[3.75rem] items-center gap-3 px-3.5 py-2.5"
                  >
                    <SlotIcon path={SLOT_ICON} chosen={draft.saveSlot === slot} />
                    <strong className="flex-1">{format(c.wizard.saveSlot, { slot })}</strong>
                  </ChoiceCard>
                ))}
                <ChoiceCard
                  name="save-slot"
                  value="0"
                  checked={draft.saveSlot === 0}
                  onChange={() => update({ saveSlot: 0 })}
                  className="min-h-[3.75rem] items-center gap-3 px-3.5 py-2.5"
                >
                  <SlotIcon path={MEMORY_ICON} chosen={draft.saveSlot === 0} />
                  <strong className="flex-1">{c.wizard.saveLater}</strong>
                </ChoiceCard>
              </div>
              {!empty.length && <StatusLine tone="warning">{c.wizard.slotsFull}</StatusLine>}
            </div>
          )}
        </fieldset>
      )}
      {job?.type === 'create-career' && <JobProgress />}
    </>
  );
}

interface SummaryProps {
  draft: WizardDraft;
  club: Club | undefined;
  country: WizardCountry | undefined;
  world: World | null;
  step: Step;
  valid: Record<Step, boolean>;
  params: URLSearchParams;
}

/** The footballer so far, beside the form on wide screens. */
function Summary({ draft, club, country }: SummaryProps) {
  const portrait = useMemo(
    () => renderAvatar(draft.avatar, draft.age, clubDress(club), 'summary'),
    [draft.avatar, draft.age, club],
  );
  return (
    <aside
      aria-label={c.wizard.summary}
      className="ui-card min-w-0 max-w-[23.75rem] flex-[1_1_18.75rem] self-start overflow-hidden rounded-panel border border-line bg-surface shadow-surface max-[700px]:hidden min-[701px]:sticky min-[701px]:top-6"
    >
      <div className="flex items-end gap-4 bg-field-stripes px-5 pt-6 pb-[1.125rem]">
        <Artwork
          svg={portrait}
          alt={format(c.wizard.previewAlt, { age: draft.age })}
          className="h-24 w-24 shrink-0 rounded-full ring-4 ring-white/30"
        />
        {club ? (
          <CrestImage crest={club.crest} alt={club.name} className="ml-auto h-16 w-14" />
        ) : (
          <span
            aria-hidden="true"
            className="ml-auto grid h-[3.625rem] w-[3.25rem] place-items-center rounded-control border-2 border-dashed border-hero-ink/50 font-display text-[1.625rem] text-hero-muted"
          >
            ?
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-5">
        <p className="text-xs font-extrabold tracking-[0.12em] text-accent uppercase">
          {c.wizard.summary}
        </p>
        <p
          className={cx(
            'mt-0.5 font-display text-[2.25rem] leading-[0.95] break-words',
            !draft.name.trim() && 'text-muted',
          )}
        >
          {draft.name.trim() || c.wizard.name}
        </p>
        <p className="mt-1.5 text-sm text-muted">
          {draft.position} · {c.positions[draft.position]} ·{' '}
          {format(c.common.age, { age: draft.age })}
        </p>
        <p className="text-sm text-muted">
          {country?.name} · {c.feet[draft.foot]}
        </p>
        <div className="mt-3 flex flex-col gap-2 text-[0.8125rem]">
          <div className="flex justify-between gap-2 rounded-control bg-surface-soft px-3 py-2.5">
            <span className="text-muted">{c.wizard.archetype}</span>
            <span className="text-right font-bold">{archetypeLine(draft.archetype)}</span>
          </div>
          {club ? (
            <div className="flex justify-between gap-2 rounded-control bg-accent-soft px-3 py-2.5 text-accent">
              <span>{c.wizard.club}</span>
              <span className="text-right font-extrabold">{club.name}</span>
            </div>
          ) : (
            <div className="flex justify-between gap-2 rounded-control border border-dashed border-line px-3 py-2.5 text-muted">
              <span>{c.wizard.club}</span>
              <span className="text-right font-bold">
                {format(c.wizard.clubPending, { step: STEPS.indexOf('trial') + 1 })}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * Phones: the footballer so far, folded into a bar above the step buttons; it opens into a
 * sheet listing every step with its answer and a way back to edit it.
 */
function PhoneSummary({ draft, club, country, world, step, valid, params }: SummaryProps) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  // Moving to another step folds the sheet away.
  useEffect(() => setOpen(false), [step]);
  const thumb = useMemo(
    () => renderAvatar(draft.avatar, draft.age, clubDress(club), 'sheet'),
    [draft.avatar, draft.age, club],
  );
  const name = draft.name.trim() || c.wizard.name;
  const current = STEPS.indexOf(step);
  const values: Record<Exclude<Step, 'confirm'>, string> = {
    identity: [draft.name.trim(), country?.name, c.feet[draft.foot]].filter(Boolean).join(' · '),
    appearance: c.wizard.summaryLook,
    position: `${c.positions[draft.position]} · ${c.archetypes[draft.archetype]?.name ?? ''}`,
    world: world
      ? format(c.wizard.summaryWorld, { season: world.date.season, week: world.date.week })
      : c.wizard.summaryTodo,
    trial: club?.name ?? c.wizard.summaryTrialTodo,
  };
  return (
    <div className="min-[701px]:hidden">
      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-x-0 top-0 bottom-[var(--tabbar)] -z-10 bg-scrim"
          onClick={() => setOpen(false)}
        />
      )}
      {open ? (
        <section
          id="wizard-summary-sheet"
          aria-labelledby="wizard-summary-title"
          className="-mx-4 -mt-2.5 mb-1 flex max-h-[60dvh] flex-col gap-3 overflow-y-auto rounded-t-sheet bg-surface px-4 pt-2.5 pb-1 shadow-overlay"
        >
          <span aria-hidden="true" className="h-1 w-10 self-center rounded-full bg-line" />
          <div className="flex items-center justify-between">
            <h2 id="wizard-summary-title" className="font-display text-[1.875rem] leading-none">
              {c.wizard.summary}
            </h2>
            <button
              ref={toggle}
              type="button"
              aria-expanded="true"
              aria-controls="wizard-summary-sheet"
              className="min-h-11 px-1 font-bold text-accent underline underline-offset-4"
              onClick={() => setOpen(false)}
            >
              {c.wizard.summaryHide}
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-control bg-art-gold px-3 py-2.5">
            <Artwork svg={thumb} alt="" className="h-16 w-16 shrink-0 rounded-control" />
            <div className="min-w-0">
              <p className="font-display text-[1.75rem] leading-[0.95] break-words">{name}</p>
              <p className="text-[0.8125rem] font-semibold text-gold-ink">
                {[country?.name, format(c.common.age, { age: draft.age }), c.feet[draft.foot]].join(
                  ' · ',
                )}
              </p>
            </div>
          </div>
          <dl className="flex flex-col">
            {(Object.keys(values) as (keyof typeof values)[]).map((item) => {
              const position = STEPS.indexOf(item);
              const now = position === current;
              const done = !now && valid[item];
              return (
                <div
                  key={item}
                  className="flex min-h-[3.25rem] items-center gap-3 border-b border-line"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold',
                      done
                        ? 'bg-accent text-on-accent'
                        : now
                          ? 'bg-gold text-on-gold'
                          : 'border border-dashed border-line',
                    )}
                  >
                    {done ? <Icon name="check" className="h-3.5 w-3.5" /> : now ? '•' : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-xs font-bold text-muted">{c.wizard.steps[item]}</dt>
                    <dd
                      className={cx('text-sm', done || now ? 'font-bold text-ink' : 'text-muted')}
                    >
                      {done || now
                        ? values[item] || c.wizard.summaryTodo
                        : item === 'trial'
                          ? c.wizard.summaryTrialTodo
                          : c.wizard.summaryTodo}
                    </dd>
                  </div>
                  {now ? (
                    <Chip tone="gold">{c.wizard.summaryNow}</Chip>
                  ) : done ? (
                    <Link
                      to={`?${withStep(params, item)}`}
                      aria-label={`${c.wizard.edit}: ${c.wizard.steps[item]}`}
                      className="inline-flex min-h-11 items-center px-1.5 text-[0.8125rem] font-bold text-accent underline underline-offset-4"
                    >
                      {c.wizard.edit}
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </dl>
          <p className="text-xs text-muted">{c.wizard.summaryRevisit}</p>
        </section>
      ) : (
        <button
          ref={toggle}
          type="button"
          aria-expanded="false"
          aria-controls="wizard-summary-sheet"
          className="flex min-h-11 w-full items-center gap-2.5 rounded-control bg-surface-soft py-1.5 pr-3 pl-1.5 text-left"
          onClick={() => setOpen(true)}
        >
          <Artwork svg={thumb} alt="" className="h-8 w-8 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
            <b>{c.wizard.summary}</b>
            <span className="sr-only">: {c.wizard.summaryShow}</span>
            {' · '}
            {[name, draft.age, country?.name].filter(Boolean).join(' · ')}
          </span>
          <Icon name="chevron" className="h-[1.125rem] w-[1.125rem] shrink-0 -rotate-90" />
        </button>
      )}
    </div>
  );
}
