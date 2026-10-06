import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Page } from '../../ui/Page';
import { Icon } from '../../ui/Icon';
import { Artwork } from '../../ui/Artwork';
import { renderAvatar, generateAvatar, AVATAR_OPTIONS } from '../../engine/assets/avatar';
import { createRng } from '../../engine/rng';
import { CONFIG } from '../../engine/config';
import { REAL_COUNTRY_NAMES } from '../../engine/world/catalog';
import { ARCHETYPES, ARCHETYPE_BY_ID } from '../../engine/career/catalogue';
import { trialOffers, validateDraft, type CareerDraft } from '../../engine/career/create';
import { startWorldJob } from '../../workers/client';
import { saveSlot, errorCode } from '../../persistence/session';
import { saves } from '../../persistence/runtime';
import type { Avatar, Club, Foot, Position, SlotId, World } from '../../model/domain';
import { errorText, format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { CrestImage, JobProgress, ui } from './shared';
import { POSITIONS } from './selectors';

const STEPS = ['identity', 'appearance', 'position', 'world', 'trial', 'confirm'] as const;
type Step = (typeof STEPS)[number];
const PARTS = Object.keys(AVATAR_OPTIONS) as (keyof Avatar)[];
const STORAGE_KEY = 'pitch-to-glory:career-draft';
const [MIN_AGE, MAX_AGE] = CONFIG.career.start.ageRange;
const AGES = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, index) => MIN_AGE + index);

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
}
const defaultDraft = (): WizardDraft => ({
  name: '',
  nationalityId: 'country:0',
  age: 17,
  foot: 'right',
  avatar: generateAvatar(createRng('pitch-to-glory:career-avatar:0')),
  avatarRoll: 0,
  position: 'ST',
  archetype: 'finisher',
  seed: 'pitch-to-glory',
  clubId: null,
  saveSlot: null,
});
function readDraft(): WizardDraft {
  try {
    const stored = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<WizardDraft>;
    if (stored && typeof stored === 'object') return { ...defaultDraft(), ...stored };
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
const familyOf = (position: Position) => (position === 'GK' ? 'keeper' : 'outfield');
const attributeName = (key: string) =>
  t.world.attributes[key as keyof typeof t.world.attributes] ?? key;
const careerSeed = (world: World) => `${world.seed}:career`;

export default function CareerNew() {
  const world = useAppStore((s) => s.world);
  const job = useAppStore((s) => s.worldJob);
  const notice = useAppStore((s) => s.worldNotice);
  const worldError = useAppStore((s) => s.worldError);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
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
  const countries = usable
    ? Object.values(usable.countries).map((country) => ({ id: country.id, name: country.name }))
    : REAL_COUNTRY_NAMES.map((name, index) => ({ id: `country:${index}`, name }));
  const offers = useMemo(
    () => (usable ? trialOffers(usable, draft.nationalityId, careerSeed(usable)) : []),
    [usable, draft.nationalityId],
  );
  const valid: Record<Step, boolean> = {
    identity:
      draft.name.trim().length > 0 &&
      draft.name.trim().length <= 40 &&
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
    if (step !== requested && !job) {
      const next = new URLSearchParams(params);
      next.set('step', step);
      setParams(next, { replace: true });
    }
  }, [step, requested, job, params, setParams]);
  const go = (target: Step) => {
    setError('');
    const next = new URLSearchParams(params);
    next.set('step', target);
    setParams(next);
  };
  // After signing: save to the chosen slot (if any) and open the career hub.
  useEffect(() => {
    if (!creating.current || job) return;
    if (notice === 'careerCreated' && world?.career) {
      creating.current = false;
      const slot = draft.saveSlot;
      writeDraft(null);
      if (slot && !useAppStore.getState().activeSave) {
        void saveSlot(slot, format(c.wizard.saveName, { name: draft.name.trim() }), null)
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
  return (
    <Page>
      <header className="page-heading">
        <p className={ui.eyebrow}>{c.wizard.eyebrow}</p>
        <h1>{c.wizard.title}</h1>
        <p>{c.wizard.description}</p>
      </header>
      <nav aria-label={c.wizard.progressLabel} className="mb-6">
        <p className="mb-2 text-sm font-semibold text-muted">
          {format(c.wizard.progress, { step: index + 1, total: STEPS.length })}
        </p>
        <ol className="grid grid-cols-6 gap-1.5 sm:gap-2">
          {STEPS.map((item, position) => {
            const done = position < index;
            const reachableStep = STEPS.slice(0, position).every((previous) => valid[previous]);
            const content = (
              <>
                <span
                  className={`block h-1.5 rounded-full ${
                    position <= index ? 'bg-accent' : 'bg-surface-soft'
                  }`}
                />
                <span
                  className={`mt-1.5 hidden text-xs font-semibold sm:block ${
                    position === index ? 'text-ink' : 'text-muted'
                  }`}
                >
                  {position + 1}. {c.wizard.steps[item]}
                </span>
                <span className="sr-only sm:hidden">
                  {position + 1}. {c.wizard.steps[item]}
                </span>
              </>
            );
            return (
              <li key={item}>
                {(done || reachableStep) && position !== index && !job ? (
                  <Link
                    to={`?step=${item}`}
                    className="block min-h-11 rounded-md pt-1 hover:opacity-80"
                    aria-label={`${position + 1}. ${c.wizard.steps[item]}`}
                  >
                    {content}
                  </Link>
                ) : (
                  <span
                    className="block min-h-11 pt-1"
                    aria-current={position === index ? 'step' : undefined}
                  >
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form onSubmit={submit} className={`${ui.panel} flex flex-col gap-6`} noValidate>
          {step === 'identity' && (
            <IdentityStep draft={draft} update={update} countries={countries} />
          )}
          {step === 'appearance' && <AppearanceStep draft={draft} update={update} />}
          {step === 'position' && <PositionStep draft={draft} update={update} />}
          {step === 'world' && <WorldStep draft={draft} update={update} />}
          {step === 'trial' && usable && (
            <TrialStep draft={draft} update={update} world={usable} offers={offers} />
          )}
          {step === 'confirm' && usable && (
            <ConfirmStep draft={draft} update={update} world={usable} club={club} />
          )}
          {(step === 'trial' || step === 'confirm') && !usable && (
            <p role="status" className="font-display text-3xl">
              {c.wizard.signing}
            </p>
          )}
          {(error || (worldError && !creating.current && step !== 'world')) && (
            <p role="alert" className="inline-error">
              {error || errorText(worldError!)}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            {index > 0 ? (
              <button
                type="button"
                className="button secondary"
                disabled={Boolean(job)}
                onClick={() => go(STEPS[index - 1]!)}
              >
                {c.common.back}
              </button>
            ) : (
              <span />
            )}
            <button className="button min-w-44" disabled={!valid[step] || Boolean(job)}>
              {step === 'confirm' && club
                ? format(c.wizard.sign, { name: club.name, club: club.name })
                : c.common.next}
              <Icon name="arrow" />
            </button>
          </div>
        </form>
        <Summary draft={draft} club={club} countries={countries} />
      </div>
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
        className="font-display text-[2.2rem] leading-none outline-none"
        tabIndex={-1}
      >
        {title}
      </h2>
      <p className={`${ui.muted} mt-2 max-w-prose`}>{body}</p>
    </div>
  );
}
function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  children,
  className = '',
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`relative flex min-h-11 cursor-pointer rounded-control border p-3 transition hover:border-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
        checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
      } ${className}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {children}
    </label>
  );
}

type StepProps = { draft: WizardDraft; update: (patch: Partial<WizardDraft>) => void };

function IdentityStep({
  draft,
  update,
  countries,
}: StepProps & { countries: { id: string; name: string }[] }) {
  return (
    <>
      <StepHeading title={c.wizard.identityTitle} body={c.wizard.identityBody} />
      <div className="max-w-md">
        <label htmlFor="career-name" className="mb-1.5 block">
          {c.wizard.name}
        </label>
        <input
          id="career-name"
          value={draft.name}
          maxLength={40}
          required
          autoComplete="off"
          aria-describedby="career-name-hint"
          onChange={(event) => update({ name: event.target.value })}
        />
        <p id="career-name-hint" className="mt-1 text-xs text-muted">
          {draft.name.trim() ? c.wizard.nameHint : c.wizard.nameRequired}
        </p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{c.wizard.nationality}</legend>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {countries.map((country) => (
            <ChoiceCard
              key={country.id}
              name="nationality"
              value={country.id}
              checked={draft.nationalityId === country.id}
              onChange={() => update({ nationalityId: country.id, clubId: null })}
            >
              <span>
                <strong className="block">{country.name}</strong>
                <span className="text-xs text-muted">{c.countries[country.id]}</span>
              </span>
            </ChoiceCard>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-6 md:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{c.wizard.age}</legend>
          <div className="grid gap-2">
            {AGES.map((age) => (
              <ChoiceCard
                key={age}
                name="age"
                value={String(age)}
                checked={draft.age === age}
                onChange={() => update({ age })}
              >
                <span>
                  <strong className="block">{format(c.wizard.ageValue, { age })}</strong>
                  <span className="text-xs text-muted">{c.wizard.ageHint[age]}</span>
                </span>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{c.wizard.foot}</legend>
          <div className="grid gap-2">
            {(['left', 'right', 'both'] as const).map((foot) => (
              <ChoiceCard
                key={foot}
                name="foot"
                value={foot}
                checked={draft.foot === foot}
                onChange={() => update({ foot })}
              >
                <strong className="self-center">{c.feet[foot]}</strong>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
      </div>
    </>
  );
}

function AppearanceStep({ draft, update }: StepProps) {
  const [part, setPart] = useState<keyof Avatar>('hair');
  const previews = useMemo(
    () =>
      Array.from({ length: AVATAR_OPTIONS[part] }, (_, option) =>
        renderAvatar({ ...draft.avatar, [part]: option }, draft.age),
      ),
    [draft.avatar, draft.age, part],
  );
  const ages = [draft.age, 28, 38];
  return (
    <>
      <StepHeading title={c.wizard.appearanceTitle} body={c.wizard.appearanceBody} />
      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-3">
          <Artwork
            svg={renderAvatar(draft.avatar, draft.age)}
            alt={format(c.wizard.previewAlt, { age: draft.age })}
            className="h-52 w-52 rounded-full bg-art-blue shadow-surface"
          />
          <button
            type="button"
            className="button secondary w-full"
            onClick={() => {
              const roll = draft.avatarRoll + 1;
              update({
                avatarRoll: roll,
                avatar: generateAvatar(createRng(`pitch-to-glory:career-avatar:${roll}`)),
              });
            }}
          >
            <Icon name="refresh" />
            {c.wizard.randomize}
          </button>
          <div className="w-full">
            <p className="mb-1 text-center text-xs font-semibold text-muted">
              {c.wizard.ageingPreview}
            </p>
            <div className="flex justify-center gap-2">
              {ages.map((age) => (
                <figure key={age} className="text-center">
                  <Artwork
                    svg={renderAvatar(draft.avatar, age)}
                    alt={format(c.wizard.previewAlt, { age })}
                    className="h-14 w-14 rounded-full bg-surface-soft"
                  />
                  <figcaption className="text-[0.65rem] text-muted">{age}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div role="group" aria-label={c.wizard.feature} className="flex flex-wrap gap-2">
            {PARTS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={part === item}
                onClick={() => setPart(item)}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
                  part === item
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-line bg-surface hover:border-accent'
                }`}
              >
                {c.wizard.parts[item]}
              </button>
            ))}
          </div>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold">
              {format(c.wizard.optionsLabel, { feature: c.wizard.parts[part] })}
            </legend>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {previews.map((svg, option) => (
                <label
                  key={option}
                  className={`relative cursor-pointer rounded-control border-2 p-1 transition hover:border-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                    draft.avatar[part] === option ? 'border-accent bg-accent-soft' : 'border-line'
                  }`}
                >
                  <input
                    type="radio"
                    name={`avatar-${part}`}
                    className="sr-only"
                    checked={draft.avatar[part] === option}
                    onChange={() => update({ avatar: { ...draft.avatar, [part]: option } })}
                  />
                  <Artwork
                    svg={svg}
                    alt=""
                    className="aspect-square w-full rounded-[0.55rem] bg-art-blue"
                  />
                  <span className="sr-only">
                    {format(c.wizard.option, { feature: c.wizard.parts[part], number: option + 1 })}
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute top-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-surface text-[0.65rem] font-bold"
                  >
                    {option + 1}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </>
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
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{c.wizard.position}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {POSITIONS.map((position) => (
            <ChoiceCard
              key={position}
              name="position"
              value={position}
              checked={draft.position === position}
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
              <span>
                <strong className="block font-display text-2xl leading-none">{position}</strong>
                <span className="text-xs text-muted">{c.positions[position]}</span>
              </span>
            </ChoiceCard>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">{c.wizard.archetype}</legend>
        <p className="mb-2 text-xs text-muted">
          {format(c.wizard.archetypeHint, { family: c.wizard.families[family] })}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {archetypes.map((archetype) => (
            <ChoiceCard
              key={archetype.id}
              name="archetype"
              value={archetype.id}
              checked={draft.archetype === archetype.id}
              onChange={() => update({ archetype: archetype.id })}
            >
              <span className="flex min-w-0 flex-col gap-2">
                <strong className="font-display text-2xl leading-none">
                  {c.archetypes[archetype.id]?.name}
                </strong>
                <span className="text-sm">{c.archetypes[archetype.id]?.body}</span>
                <span className="text-xs text-muted">
                  {format(c.wizard.suited, { positions: archetype.positions.join(', ') })}
                </span>
                <span className="flex flex-wrap gap-1.5" aria-label={c.wizard.emphasis}>
                  {Object.entries(archetype.emphasis).map(([key, value]) => (
                    <span key={key} className={ui.chip}>
                      +{Math.round(value! * CONFIG.career.start.emphasisScale)} {attributeName(key)}
                    </span>
                  ))}
                </span>
                <span className="text-xs">
                  <span className="font-semibold">{c.wizard.startingSkill}:</span>{' '}
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
  const build = () => {
    if (!draft.seed.trim() || job) return;
    update({ clubId: null });
    void startWorldJob('generate', { seed: draft.seed.trim() });
  };
  return (
    <>
      <StepHeading title={c.wizard.worldTitle} body={c.wizard.worldBody} />
      {usable && (
        <div className="rounded-control border-2 border-accent bg-accent-soft p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="check" className="text-accent" />
            {c.wizard.useLoaded}
          </p>
          <p className="mt-1 text-sm">
            {format(c.wizard.useLoadedBody, {
              season: usable.date.season,
              week: usable.date.week,
            })}{' '}
            {active?.payload.kind === 'world' &&
              format(c.wizard.useLoadedSaved, { slot: active.slot })}
          </p>
          <p className="mt-1 text-sm text-muted">
            {format(c.wizard.built, {
              clubs: Object.keys(usable.clubs).length.toLocaleString('en'),
              players: Object.keys(usable.players).length.toLocaleString('en'),
            })}
          </p>
        </div>
      )}
      {world?.career && <p className="text-sm font-semibold">{c.wizard.careerLoaded}</p>}
      <div className="rounded-control border border-line p-4">
        <p className="font-semibold">{usable ? c.wizard.rebuild : c.wizard.generate}</p>
        <p className="mt-1 text-sm text-muted">{c.wizard.generateBody}</p>
        {world && (
          <p className="mt-2 text-sm">{active ? c.wizard.replaceNote : c.wizard.unsavedLoss}</p>
        )}
        <label htmlFor="career-world-seed" className="mt-4 mb-1.5 block">
          {c.wizard.seed}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="career-world-seed"
            value={draft.seed}
            maxLength={120}
            disabled={Boolean(job)}
            onChange={(event) => update({ seed: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                build();
              }
            }}
          />
          <button
            type="button"
            className={`button ${usable ? 'secondary' : ''} shrink-0`}
            disabled={Boolean(job) || !draft.seed.trim()}
            onClick={build}
          >
            {usable ? c.wizard.rebuild : c.wizard.build}
          </button>
        </div>
      </div>
      <JobProgress />
      {error && !job && (
        <p role="alert" className="inline-error">
          {errorText(error)}
        </p>
      )}
      {!usable && !job && <p className={ui.muted}>{c.wizard.worldNeeded}</p>}
    </>
  );
}

function TrialStep({ draft, update, world, offers }: StepProps & { world: World; offers: Club[] }) {
  const country = world.countries[draft.nationalityId];
  return (
    <>
      <StepHeading
        title={c.wizard.trialTitle}
        body={format(c.wizard.trialBody, { country: country?.name ?? '' })}
      />
      {offers.length ? (
        <fieldset>
          <legend className="sr-only">{c.wizard.steps.trial}</legend>
          <div className="grid gap-3 lg:grid-cols-3">
            {offers.map((club) => {
              const league = world.leagues[club.leagueId];
              const manager = world.managers[club.managerId];
              return (
                <ChoiceCard
                  key={club.id}
                  name="trial"
                  value={club.id}
                  checked={draft.clubId === club.id}
                  onChange={() => update({ clubId: club.id })}
                  className="flex-col"
                >
                  <span className="flex flex-col gap-3">
                    <span className="flex items-center gap-3">
                      <CrestImage crest={club.crest} alt="" className="h-16 w-16 shrink-0" />
                      <strong className="font-display text-2xl leading-none break-words">
                        {club.name}
                      </strong>
                    </span>
                    <dl className="grid gap-1 text-sm">
                      {[
                        [c.wizard.trialLeague, league?.name ?? ''],
                        [
                          c.wizard.trialStadium,
                          `${club.stadium.name} · ${format(c.wizard.capacity, {
                            count: club.stadium.capacity.toLocaleString('en'),
                          })}`,
                        ],
                        [c.wizard.trialReputation, String(club.reputation)],
                        [
                          c.wizard.trialStyle,
                          t.world.styles[club.playingStyle as keyof typeof t.world.styles] ??
                            club.playingStyle,
                        ],
                        [c.wizard.trialManager, manager?.name ?? ''],
                      ].map(([label, value]) => (
                        <div key={label} className="flex flex-col">
                          <dt className="text-xs font-semibold text-muted">{label}</dt>
                          <dd className="min-w-0 break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </span>
                </ChoiceCard>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className={ui.muted}>{c.wizard.noOffers}</p>
      )}
    </>
  );
}

function ConfirmStep({
  draft,
  update,
  world,
  club,
}: StepProps & { world: World; club: Club | undefined }) {
  const active = useAppStore((s) => s.activeSave);
  const job = useAppStore((s) => s.worldJob);
  const [empty, setEmpty] = useState<SlotId[] | null>(null);
  useEffect(() => {
    if (active) return;
    let current = true;
    void saves
      .list()
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
  return (
    <>
      <StepHeading title={c.wizard.confirmTitle} body={c.wizard.confirmBody} />
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {[
          [c.wizard.name, draft.name.trim(), 'identity'],
          [c.wizard.nationality, world.countries[draft.nationalityId]?.name ?? '', 'identity'],
          [c.wizard.age, format(c.wizard.ageValue, { age: draft.age }), 'identity'],
          [c.wizard.foot, c.feet[draft.foot], 'identity'],
          [c.wizard.position, `${draft.position} · ${c.positions[draft.position]}`, 'position'],
          [c.wizard.archetype, archetype ? c.archetypes[archetype.id]!.name : '', 'position'],
          [c.wizard.steps.trial, club?.name ?? '', 'trial'],
          [c.wizard.trialLeague, club ? (world.leagues[club.leagueId]?.name ?? '') : '', 'trial'],
        ].map(([label, value, step]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-control bg-surface-soft p-3"
          >
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-muted">{label}</dt>
              <dd className="break-words font-semibold">{value}</dd>
            </div>
            <Link
              to={`?step=${step}`}
              className="text-button shrink-0"
              aria-label={`${c.wizard.edit}: ${label}`}
            >
              {c.wizard.edit}
            </Link>
          </div>
        ))}
      </dl>
      {active?.payload.kind === 'world' ? (
        <p className="text-sm">{format(c.wizard.autosaved, { slot: active.slot })}</p>
      ) : (
        <fieldset>
          <legend className="text-sm font-semibold">{c.wizard.saveTo}</legend>
          <p className="mb-2 text-xs text-muted">{c.wizard.saveToBody}</p>
          {!empty ? (
            <p role="status" className={ui.muted}>
              {t.saves.loading}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {empty.map((slot) => (
                <ChoiceCard
                  key={slot}
                  name="save-slot"
                  value={String(slot)}
                  checked={draft.saveSlot === slot}
                  onChange={() => update({ saveSlot: slot })}
                >
                  <strong className="self-center">{format(c.wizard.saveSlot, { slot })}</strong>
                </ChoiceCard>
              ))}
              <ChoiceCard
                name="save-slot"
                value="0"
                checked={draft.saveSlot === 0}
                onChange={() => update({ saveSlot: 0 })}
              >
                <strong className="self-center">{c.wizard.saveLater}</strong>
              </ChoiceCard>
              {!empty.length && <p className="text-sm sm:col-span-2">{c.wizard.slotsFull}</p>}
            </div>
          )}
        </fieldset>
      )}
      {job?.type === 'create-career' && <JobProgress />}
    </>
  );
}

function Summary({
  draft,
  club,
  countries,
}: {
  draft: WizardDraft;
  club: Club | undefined;
  countries: { id: string; name: string }[];
}) {
  const archetype = ARCHETYPE_BY_ID[draft.archetype];
  return (
    <aside
      aria-label={c.wizard.summary}
      className="self-start overflow-hidden rounded-panel border border-line bg-surface shadow-surface lg:sticky lg:top-6"
    >
      <div className="relative bg-field px-5 pt-6 pb-4 text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.12] [background:repeating-linear-gradient(90deg,transparent_0_40px,white_40px_80px)]"
        />
        <div className="relative flex items-end gap-4">
          <Artwork
            svg={renderAvatar(draft.avatar, draft.age)}
            alt={format(c.wizard.previewAlt, { age: draft.age })}
            className="h-24 w-24 shrink-0 rounded-full bg-art-blue ring-4 ring-white/30"
          />
          {club && <CrestImage crest={club.crest} alt={club.name} className="ml-auto h-14 w-14" />}
        </div>
      </div>
      <div className="p-5">
        <p className={ui.eyebrow}>{c.wizard.summary}</p>
        <p className="mt-1 font-display text-[2rem] leading-none break-words">
          {draft.name.trim() || c.wizard.name}
        </p>
        <p className="mt-2 text-sm text-muted">
          {draft.position} · {c.positions[draft.position]} ·{' '}
          {format(c.common.age, { age: draft.age })}
        </p>
        <p className="text-sm text-muted">
          {countries.find((country) => country.id === draft.nationalityId)?.name} ·{' '}
          {c.feet[draft.foot]}
        </p>
        {archetype && (
          <p className="mt-3 text-sm">
            <span className="font-semibold">{c.archetypes[archetype.id]?.name}</span> ·{' '}
            {c.skillNames[archetype.startingSkill]}
          </p>
        )}
        {club && <p className="mt-2 text-sm font-semibold">{club.name}</p>}
      </div>
    </aside>
  );
}
