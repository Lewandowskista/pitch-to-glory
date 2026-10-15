import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Club, Hex, League, Player, World } from '../model/domain';
import { useAppStore } from '../store';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
import { kitArt } from '../ui/kitArt';
import {
  Button,
  ButtonLink,
  CardTitle,
  Chip,
  PageHeader,
  Panel,
  StatusLine,
  buttonClass,
  cx,
} from '../ui/kit';
import { foundedYear, renderCrest } from '../engine/assets/crest';
import { renderKit } from '../engine/assets/kit';
import { clubDress, renderAvatar } from '../engine/assets/avatar';
import { chooseMatchKits, safeDifference } from '../engine/assets/clash';
import { CONFIG } from '../engine/config';
import {
  applyEditAction,
  applyEditPack,
  cleanColors,
  cleanName,
  exportEdits,
  NAME_LIMIT,
  parseEditPack,
  type EditAction,
} from '../engine/world/edits';
import { platform } from '../platform';
import { format, t } from '../i18n';
import { careerText as c } from '../i18n/career';
import { editText as e } from '../i18n/edit';
import { CrestImage, plural, useEditBlock, useRestoredWorld } from './career/shared';

type Kind = 'clubs' | 'leagues' | 'players';
const KINDS: Kind[] = ['clubs', 'leagues', 'players'];
const LIMIT = 60;
/** Fields share one look; invalid values get the danger outline and tint over the utilities. */
const field =
  'min-h-11 w-full rounded-control border border-line bg-surface px-3 text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft';
const eyebrow = 'text-xs font-extrabold uppercase tracking-[0.14em] text-muted';
/** A titled block inside the club editor, set off by a hairline. */
const SECTION = 'flex flex-col gap-3 border-t border-line pt-5';
const fieldLabel = 'text-[0.8125rem] font-bold';
const rowId = (id: string) => `edit-row-${id}`;

/** Apply an edit to the loaded world; the autosave writes it like any other change. */
function useEdit() {
  const block = useEditBlock();
  return {
    block,
    run(action: EditAction): string | null {
      const world = useAppStore.getState().world;
      if (!world || block) return block;
      try {
        useAppStore.getState().setWorld(applyEditAction(world, action));
        return null;
      } catch {
        return e.nameInvalid;
      }
    },
  };
}

export default function EditMode() {
  const world = useAppStore((s) => s.world);
  const { loading, error } = useRestoredWorld();
  return (
    <Page>
      <PageHeader title={t.app.edit} description={e.description} />
      {error && (
        <StatusLine tone="error" className="mb-5">
          {error}
        </StatusLine>
      )}
      {loading ? (
        <p role="status" className="text-muted">
          {c.common.loading}
        </p>
      ) : world ? (
        <Editor world={world} />
      ) : (
        <NoWorld />
      )}
    </Page>
  );
}

function NoWorld() {
  return (
    <Panel
      tone="green"
      aria-labelledby="edit-no-world"
      className="flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-4 sm:p-7"
    >
      <span
        aria-hidden="true"
        className="grid h-18 w-18 shrink-0 place-items-center rounded-panel bg-surface text-accent"
      >
        <Icon name="edit" className="h-9 w-9" />
      </span>
      <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1.5">
        <h2 id="edit-no-world" className="font-display text-[2.25rem] leading-none font-normal">
          {e.empty.title}
        </h2>
        <p>{e.empty.body}</p>
        <div className="mt-1.5 flex flex-wrap gap-2.5">
          <ButtonLink to="/world" iconEnd="arrow">
            {e.empty.world}
          </ButtonLink>
          <ButtonLink to="/saves" variant="secondary">
            {e.empty.saves}
          </ButtonLink>
        </div>
      </div>
    </Panel>
  );
}

const WIDE = '(min-width: 80rem)';
function subscribeWide(change: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
}
/** True when the editor sits beside the list (Tailwind `xl`). */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

interface Row {
  id: string;
  name: string;
  meta: string;
  countryId: string;
  edited: boolean;
  club?: Club;
  player?: Player;
  age?: number;
}

function rows(world: World, kind: Kind): Row[] {
  const edits = world.edits;
  const country = (id: string) => world.countries[id]?.name ?? '';
  if (kind === 'clubs')
    return Object.values(world.clubs)
      .map((club) => ({
        id: club.id,
        name: club.name,
        meta: `${world.leagues[club.leagueId]?.name ?? ''} · ${country(club.countryId)}`,
        countryId: club.countryId,
        edited: Boolean(edits?.clubs[club.id]),
        club,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  if (kind === 'leagues')
    return Object.values(world.leagues)
      .map((league) => ({
        id: league.id,
        name: league.name,
        meta: format(e.league.country, { country: country(league.countryId), tier: league.tier }),
        countryId: league.countryId,
        edited: Boolean(edits?.leagues[league.id]),
        tier: league.tier,
      }))
      .sort((a, b) => a.countryId.localeCompare(b.countryId) || a.tier - b.tier);
  return Object.values(world.players)
    .map((player) => {
      const club = player.clubId ? world.clubs[player.clubId] : undefined;
      return {
        id: player.id,
        name: player.name,
        meta: format(e.player.meta, {
          position: c.positions[player.primaryPosition] ?? '',
          club: club?.name ?? e.player.free,
        }),
        countryId: club?.countryId ?? player.nationalityId,
        edited: Boolean(edits?.players[player.id]),
        player,
        club,
        age: world.date.season - player.birthSeason,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The picture at the start of a list row: the crest, the portrait or the league's cup. */
const RowArt = memo(function RowArt({ row }: { row: Row }) {
  const portrait = useMemo(
    () =>
      row.player
        ? renderAvatar(
            row.player.avatar,
            Math.max(16, Math.min(60, row.age ?? 16)),
            clubDress(row.club),
            'row',
          )
        : '',
    [row.player, row.age, row.club],
  );
  if (row.player) return <Artwork svg={portrait} alt="" className="h-9 w-9 shrink-0" />;
  if (row.club)
    return (
      <CrestImage crest={row.club.crest} alt="" className="h-[2.125rem] w-[1.875rem] shrink-0" />
    );
  return (
    <span
      aria-hidden="true"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-art-blue text-info"
    >
      <Icon name="history" className="h-5 w-5" />
    </span>
  );
});

function Editor({ world }: { world: World }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const kind = (KINDS.find((k) => k === params.get('kind')) ?? 'clubs') as Kind;
  // Typed and ticked values live in local state (the URL updates in a transition, which
  // would make controlled inputs lag); the URL mirrors them for back, forward and refresh.
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const country = params.get('country') ?? '';
  const [editedOnly, setEditedOnly] = useState(() => params.get('edited') === '1');
  const { block: blocked } = useEdit();
  // Beside the list (wide screens), open the first result instead of an empty pane.
  const wide = useWide();
  const set = (patch: Record<string, string | null>, push = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch))
      if (value) next.set(key, value);
      else next.delete(key);
    setParams(next, { replace: !push });
  };
  const all = useMemo(() => rows(world, kind), [world, kind]);
  const needle = query.trim().toLowerCase();
  const matches = all.filter(
    (row) =>
      (!needle || row.name.toLowerCase().includes(needle)) &&
      (!country || row.countryId === country) &&
      (!editedOnly || row.edited),
  );
  const shown = matches.slice(0, LIMIT);
  const firstId = shown[0]?.id ?? null;
  const selected = params.get('id') ?? (wide ? firstId : null);
  // Pin the opened item in the URL, so a rename that re-sorts the list keeps it open.
  const pinned = Boolean(params.get('id'));
  useEffect(() => {
    if (wide && !pinned && firstId) {
      const next = new URLSearchParams(params);
      next.set('id', firstId);
      setParams(next, { replace: true });
    }
  }, [wide, pinned, firstId, params, setParams]);
  // On narrower screens the list and the editor take turns. Opening an item adds a history
  // entry, so Back (the button or the browser's) returns to the list; focus follows the swap.
  const opened = useRef(false);
  const pushed = useRef(false);
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (selected && opened.current) document.getElementById('edit-back')?.focus();
    if (!selected && returnTo.current) document.getElementById(rowId(returnTo.current))?.focus();
    opened.current = false;
    if (!selected) {
      returnTo.current = null;
      pushed.current = false;
    }
  }, [selected]);
  const open = (id: string) => {
    opened.current = !wide;
    pushed.current = true;
    set({ id }, true);
  };
  const back = () => {
    returnTo.current = selected;
    if (pushed.current) navigate(-1);
    else set({ id: null });
  };
  const tabs = useRef<HTMLDivElement>(null);
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = KINDS.indexOf(kind);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? KINDS.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : KINDS.length - 1)) % KINDS.length;
    set({ kind: KINDS[next]!, id: null }, true);
    tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const entity =
    selected && kind === 'clubs'
      ? world.clubs[selected]
      : selected && kind === 'leagues'
        ? world.leagues[selected]
        : selected
          ? world.players[selected]
          : undefined;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start">
      {blocked && (
        <StatusLine tone="warning" className="xl:col-span-2">
          {blocked}
        </StatusLine>
      )}
      <EditFile world={world} />
      <Panel
        aria-labelledby="edit-list-heading"
        padding="none"
        className={cx('flex flex-col gap-3.5 p-5', entity && 'max-xl:hidden')}
      >
        <h2 id="edit-list-heading" className="sr-only">
          {e.kindsLabel}
        </h2>
        <div
          ref={tabs}
          role="tablist"
          aria-label={e.kindsLabel}
          className="segmented-tabs segmented-tabs-fill"
        >
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`edit-tab-${k}`}
              aria-selected={kind === k}
              aria-controls="edit-results"
              tabIndex={kind === k ? 0 : -1}
              onKeyDown={onTabKey}
              onClick={() => set({ kind: k, id: null }, true)}
            >
              {e.kinds[k]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className={cx('grid gap-1', fieldLabel)}>
            {e.search}
            <span className="relative block">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-muted"
              >
                <path
                  d="M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14ZM16 16L20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="search"
                className={cx(field, 'pl-10 font-normal')}
                value={query}
                placeholder={e.searchPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  set({ q: event.target.value || null });
                }}
              />
            </span>
          </label>
          <label className={cx('grid gap-1', fieldLabel)}>
            {e.country}
            <select
              className={cx(field, 'font-semibold')}
              value={country}
              onChange={(event) => set({ country: event.target.value || null })}
            >
              <option value="">{e.allCountries}</option>
              {Object.values(world.countries).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={cx('flex min-h-11 cursor-pointer items-center gap-2.5', fieldLabel)}>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--accent)]"
            checked={editedOnly}
            onChange={(event) => {
              setEditedOnly(event.target.checked);
              set({ edited: event.target.checked ? '1' : null });
            }}
          />
          {e.editedOnly}
        </label>
        <div
          id="edit-results"
          role="tabpanel"
          aria-labelledby={`edit-tab-${kind}`}
          className="flex flex-col gap-2"
        >
          <p className="text-xs text-muted" aria-live="polite">
            {matches.length > LIMIT
              ? format(e.resultsMore, { shown: LIMIT, total: matches.length })
              : format(e.results, { shown: matches.length, total: all.length })}
          </p>
          {shown.length ? (
            <ul className="flex flex-col gap-1.5 xl:max-h-[38.75rem] xl:overflow-y-auto xl:pr-1">
              {shown.map((row) => {
                const current = row.id === selected;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      id={rowId(row.id)}
                      aria-current={current ? 'true' : undefined}
                      onClick={() => open(row.id)}
                      className={cx(
                        'flex min-h-13 w-full min-w-0 items-center gap-2.5 rounded-control px-3 py-1.5 text-left text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        current
                          ? 'border-2 border-accent bg-accent-soft'
                          : 'border border-line bg-surface-soft hover:border-accent',
                      )}
                    >
                      <RowArt row={row} />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{row.name}</strong>
                        <span className="block truncate text-xs text-muted">{row.meta}</span>
                      </span>
                      {row.edited && (
                        <Chip tone="gold-soft" className="shrink-0">
                          {e.edited}
                        </Chip>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-control border border-dashed border-line px-3.5 py-3 text-muted">
              {e.noResults}
            </p>
          )}
        </div>
      </Panel>
      <div className={cx('flex min-w-0 flex-col gap-3', !entity && 'max-xl:hidden')}>
        {entity && (
          <button
            type="button"
            id="edit-back"
            className={cx(buttonClass('secondary'), 'self-start xl:hidden')}
            onClick={back}
          >
            <Icon name="chevron" className="rotate-180" />
            {e.back}
          </button>
        )}
        {entity && kind === 'clubs' ? (
          <ClubEditor key={entity.id} world={world} club={entity as Club} />
        ) : entity && kind === 'leagues' ? (
          <NameEditor key={entity.id} world={world} kind="leagues" entity={entity as League} />
        ) : entity ? (
          <NameEditor key={entity.id} world={world} kind="players" entity={entity as Player} />
        ) : (
          <div className="flex items-center gap-3.5 rounded-panel border border-dashed border-line bg-surface p-7 text-muted">
            <Icon name="chevron" className="h-7 w-7 shrink-0 rotate-180" />
            <p>{e.choose}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The editor's title row: a picture, the kind as an eyebrow, the name and one line of facts. */
function EditorHeading({
  art,
  kind,
  name,
  meta,
  edited,
  large = false,
}: {
  art: ReactNode;
  kind: Kind;
  name: string;
  meta: string;
  edited: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 sm:gap-4.5">
      {art}
      <div className="min-w-0 flex-[1_1_13.75rem]">
        <p className={eyebrow}>{e.kinds[kind]}</p>
        <h2
          id="editor-heading"
          className={cx(
            'mt-0.5 font-display leading-[0.95] font-normal break-words',
            large ? 'text-[2.5rem] sm:text-[3rem]' : 'text-[2.25rem] sm:text-[2.5rem]',
          )}
        >
          {name}
        </h2>
        <p className="mt-0.5 text-muted">{meta}</p>
      </div>
      {edited && <Chip tone="gold-soft">{e.edited}</Chip>}
    </div>
  );
}

function NameForm({
  id,
  value,
  original,
  onSave,
  disabled,
}: {
  id: string;
  value: string;
  original: string | null;
  onSave: (name: string) => string | null;
  disabled: boolean;
}) {
  const [name, setName] = useState(value);
  const [status, setStatus] = useState('');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setName(value), [value]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      cleanName(name);
    } catch {
      setInvalid(true);
      setStatus(e.nameInvalid);
      return;
    }
    const error = onSave(name);
    setInvalid(Boolean(error));
    setStatus(error ?? e.savedName);
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1.5">
      <label htmlFor={id} className={fieldLabel}>
        {e.name}
      </label>
      <div className="flex flex-wrap gap-2.5">
        <input
          id={id}
          className={cx(field, 'min-h-12 flex-[1_1_15rem] text-[0.9375rem] font-semibold')}
          value={name}
          maxLength={NAME_LIMIT}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={disabled || name === value}>
          {e.rename}
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted">
        {original ? format(e.original, { name: original }) : e.nameHint}
      </p>
      <StatusLine tone={invalid ? 'error' : 'success'}>{status}</StatusLine>
    </form>
  );
}

function RevertButton({ onRevert, disabled }: { onRevert: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className={buttonClass('secondary')}
      disabled={disabled}
      onClick={onRevert}
    >
      <Icon name="refresh" className="-scale-x-100" />
      {e.revert}
    </button>
  );
}

function NameEditor({
  world,
  kind,
  entity,
}: {
  world: World;
  kind: 'leagues' | 'players';
  entity: League | Player;
}) {
  const { run, block } = useEdit();
  const [status, setStatus] = useState('');
  const edit = world.edits?.[kind][entity.id];
  const player = kind === 'players' ? (entity as Player) : undefined;
  const league = kind === 'leagues' ? (entity as League) : undefined;
  const age = player ? world.date.season - player.birthSeason : 0;
  const club = player?.clubId ? world.clubs[player.clubId] : undefined;
  const portrait = useMemo(
    () =>
      player ? renderAvatar(player.avatar, Math.max(16, Math.min(60, age)), clubDress(club)) : '',
    [player, age, club],
  );
  const meta = player
    ? `${format(e.player.meta, {
        position: c.positions[player.primaryPosition] ?? '',
        club: player.clubId ? (world.clubs[player.clubId]?.name ?? '') : e.player.free,
      })} · ${format(e.player.age, { age })}`
    : league
      ? `${format(e.league.country, {
          country: world.countries[league.countryId]?.name ?? '',
          tier: league.tier,
        })} · ${format(e.league.clubs, { count: league.clubIds.length })}`
      : '';
  return (
    <Panel aria-labelledby="editor-heading" className="flex flex-col gap-5">
      <EditorHeading
        kind={kind}
        name={entity.name}
        meta={meta}
        edited={Boolean(edit)}
        art={
          player ? (
            <Artwork svg={portrait} alt="" className="h-20 w-20 shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className="grid h-16 w-16 shrink-0 place-items-center rounded-panel bg-art-blue text-info"
            >
              <Icon name="history" className="h-8 w-8" />
            </span>
          )
        }
      />
      <NameForm
        id={`name-${entity.id}`}
        value={entity.name}
        original={edit?.original ?? null}
        disabled={Boolean(block)}
        onSave={(name) =>
          run({ type: kind === 'leagues' ? 'rename-league' : 'rename-player', id: entity.id, name })
        }
      />
      {edit && (
        <div className="flex flex-wrap items-center gap-3">
          <RevertButton
            disabled={Boolean(block)}
            onRevert={() => {
              const error = run({
                type: kind === 'leagues' ? 'revert-league' : 'revert-player',
                id: entity.id,
              });
              setStatus(error ?? e.reverted);
            }}
          />
        </div>
      )}
      <StatusLine tone="success">{status}</StatusLine>
    </Panel>
  );
}

function ClubEditor({ world, club }: { world: World; club: Club }) {
  const { run, block } = useEdit();
  const edit = world.edits?.clubs[club.id];
  const [colors, setColors] = useState<string[]>(edit?.colors ?? club.kits.home.colors);
  const [status, setStatus] = useState('');
  const valid = (() => {
    try {
      return cleanColors(colors);
    } catch {
      return null;
    }
  })();
  // Preview the colours being chosen before they are applied.
  const preview: Club = useMemo(() => {
    if (!valid) return club;
    const [a, b, c2] = valid;
    return {
      ...club,
      crest: { ...club.crest, colors: [a, b, c2] },
      kits: {
        home: { ...club.kits.home, colors: [a, b, c2] },
        away: { ...club.kits.away, colors: [c2, a, b] },
        third: { ...club.kits.third, colors: [b, c2, a] },
      },
    };
  }, [club, valid?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = valid && valid.join() !== club.kits.home.colors.join();
  const founded = foundedYear(club);
  const crestSvg = useMemo(() => renderCrest(preview.crest, { founded }), [preview.crest, founded]);
  const kitSvgs = useMemo(
    () =>
      (['home', 'away', 'third'] as const).map(
        (k) => [k, renderKit(preview.kits[k], kitArt(preview.kits[k], preview.crest))] as const,
      ),
    [preview.kits, preview.crest],
  );
  return (
    <Panel aria-labelledby="editor-heading" className="flex flex-col gap-6 sm:px-6.5">
      <EditorHeading
        kind="clubs"
        name={club.name}
        meta={`${club.city} · ${world.leagues[club.leagueId]?.name ?? ''}`}
        edited={Boolean(edit)}
        large
        art={
          <span className="shrink-0 rounded-panel bg-surface-soft px-3.5 py-2.5">
            <Artwork
              svg={crestSvg}
              alt={format(e.crestAlt, { club: club.name })}
              className="aspect-[160/180] w-24"
            />
          </span>
        }
      />
      <NameForm
        id={`name-${club.id}`}
        value={club.name}
        original={edit?.name ? edit.original.name : null}
        disabled={Boolean(block)}
        onSave={(name) => run({ type: 'rename-club', id: club.id, name })}
      />
      <div className={SECTION}>
        <h3 className={eyebrow}>{e.colours}</h3>
        <p className="text-[0.8125rem] text-muted">{e.coloursBody}</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11.875rem),1fr))] gap-3">
          {colors.map((color, index) => {
            const label = e.colourNames[index]!;
            const ok = /^#[0-9a-f]{6}$/i.test(color);
            return (
              <div key={label} className="flex flex-col gap-1">
                <label htmlFor={`colour-${index}`} className={fieldLabel}>
                  {label}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`colour-${index}`}
                    type="color"
                    value={ok ? color.toLowerCase() : '#000000'}
                    className="h-11 w-14 shrink-0 cursor-pointer rounded-control border border-line bg-surface p-1 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onChange={(event) =>
                      setColors(colors.map((c2, i) => (i === index ? event.target.value : c2)))
                    }
                  />
                  <input
                    aria-label={format(e.colourHex, { name: label })}
                    className={cx(field, 'min-w-0 flex-1 font-mono text-sm')}
                    value={color}
                    maxLength={7}
                    spellCheck={false}
                    aria-invalid={!ok}
                    onChange={(event) =>
                      setColors(colors.map((c2, i) => (i === index ? event.target.value : c2)))
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
        {!valid && <StatusLine tone="error">{e.coloursInvalid}</StatusLine>}
        <Button
          className="self-start"
          disabled={Boolean(block) || !valid || !changed}
          onClick={() => {
            if (!valid) return;
            setStatus(
              run({ type: 'recolour-club', id: club.id, colors: valid as [Hex, Hex, Hex] }) ??
                e.coloursSaved,
            );
          }}
        >
          {e.applyColours}
        </Button>
      </div>
      <div className={SECTION}>
        <h3 className={eyebrow}>{e.kits}</h3>
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          {kitSvgs.map(([k, svg]) => (
            <li
              key={k}
              className="flex min-w-0 flex-col items-center gap-1 rounded-control bg-surface-soft px-2 pt-3 pb-2.5"
            >
              <Artwork
                svg={svg}
                alt={format(e.kitAlt, { club: club.name, kit: e.kitNames[k].toLowerCase() })}
                className="aspect-square w-full max-w-24"
              />
              <span className="text-xs font-bold">{e.kitNames[k]}</span>
            </li>
          ))}
        </ul>
        <ClashCheck world={world} club={preview} />
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-5">
        <Button
          variant="secondary"
          icon="refresh"
          disabled={Boolean(block)}
          onClick={() => setStatus(run({ type: 'regenerate-crest', id: club.id }) ?? e.crestSaved)}
        >
          {e.regenerate}
        </Button>
        {edit && (
          <RevertButton
            disabled={Boolean(block)}
            onRevert={() => {
              const error = run({ type: 'revert-club', id: club.id });
              if (!error) setColors(edit.original.kits.home.colors);
              setStatus(error ?? e.reverted);
            }}
          />
        )}
      </div>
      <StatusLine tone="success" className="-mt-2">
        {status}
      </StatusLine>
    </Panel>
  );
}

/** One line of the clash check: a tick or an exclamation mark in a disc, then the words. */
function ClashLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p className={cx('flex items-start gap-2.5 text-[0.8125rem]', !ok && 'font-bold text-danger')}>
      <span
        aria-hidden="true"
        className={cx(
          'grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full text-[0.8125rem] font-extrabold',
          ok ? 'bg-accent-soft text-accent' : 'bg-danger text-on-danger',
        )}
      >
        {ok ? '✓' : '!'}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Whether this club's kits stay distinct for every viewer, at home and against its league. */
function ClashCheck({ world, club }: { world: World; club: Club }) {
  const own = safeDifference(club.kits.home.colors[0], club.kits.away.colors[0]);
  const league = world.leagues[club.leagueId];
  const clashes = (league?.clubIds ?? [])
    .filter((id) => id !== club.id && world.clubs[id])
    .map((id) => world.clubs[id]!)
    .filter((other) => chooseMatchKits(club, other).clash || chooseMatchKits(other, club).clash);
  const ownSafe = own.difference >= CONFIG.accessibility.kitClash;
  return (
    <div className="flex flex-col gap-2 rounded-control border border-line p-4">
      <h4 className="text-sm font-extrabold">{e.clash.title}</h4>
      <p className="text-xs text-muted">{e.clash.body}</p>
      <ClashLine ok={ownSafe}>
        {ownSafe
          ? e.clash.ownSafe
          : format(e.clash.ownClash, { vision: e.clash.visions[own.vision] })}
      </ClashLine>
      <ClashLine ok={!clashes.length}>
        {clashes.length
          ? format(e.clash.leagueClash, { count: clashes.length })
          : e.clash.leagueSafe}
      </ClashLine>
      {clashes.length > 0 && (
        <ul className="ml-8 flex flex-wrap gap-1.5">
          {clashes.slice(0, 8).map((other) => (
            <li
              key={other.id}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-danger-soft py-0.5 pr-2.5 pl-1 text-xs font-bold text-danger"
            >
              <CrestImage crest={other.crest} alt="" className="h-5 w-[1.125rem] shrink-0" />
              <span className="truncate">{other.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditFile({ world }: { world: World }) {
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const block = useEditBlock();
  const edits = world.edits;
  const counts = {
    clubs: Object.keys(edits?.clubs ?? {}).length,
    leagues: Object.keys(edits?.leagues ?? {}).length,
    players: Object.keys(edits?.players ?? {}).length,
  };
  const any = counts.clubs + counts.leagues + counts.players > 0;
  return (
    // Before any edit this is a compact strip, so the editor starts in the first view.
    <Panel
      aria-labelledby="edit-file-heading"
      padding={any ? 'normal' : 'compact'}
      className="flex flex-wrap items-center gap-x-6 gap-y-3.5 xl:col-span-2"
    >
      <div className="min-w-0 flex-[1_1_23.75rem]">
        <CardTitle
          id="edit-file-heading"
          size={any ? 'md' : 'sm'}
          className={any ? undefined : 'text-[1.375rem]'}
        >
          {e.file.title}
        </CardTitle>
        <p className="mt-1 font-bold">
          {any
            ? format(e.file.summary, {
                list: [
                  plural(counts.clubs, e.file.counts.club, e.file.counts.clubs),
                  plural(counts.leagues, e.file.counts.league, e.file.counts.leagues),
                  plural(counts.players, e.file.counts.player, e.file.counts.players),
                ].join(' · '),
              })
            : e.file.none}
        </p>
        <p className="mt-1 max-w-[38.75rem] text-[0.8125rem] text-muted">{e.file.body}</p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {any && (
          <Button
            variant="secondary"
            icon="download"
            onClick={async () => {
              const slug = world.seed
                .replace(/[^a-z0-9]+/gi, '-')
                .toLowerCase()
                .slice(0, 40);
              await platform.saveFile(
                `${slug || 'world'}-edits.json`,
                JSON.stringify(exportEdits(world), null, 2),
                'application/json',
              );
              setFailed(false);
              setStatus(e.file.exported);
            }}
          >
            {e.file.export}
          </Button>
        )}
        <label
          className={cx(
            buttonClass('secondary'),
            'relative focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-accent',
            block ? 'pointer-events-none opacity-60' : 'cursor-pointer',
          )}
          aria-disabled={block ? true : undefined}
        >
          <Icon name="upload" />
          {e.file.import}
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label={e.file.importLabel}
            disabled={Boolean(block)}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              try {
                const pack = parseEditPack(JSON.parse(await platform.readFile(file)));
                const current = useAppStore.getState().world;
                if (!current) return;
                const result = applyEditPack(current, pack);
                useAppStore.getState().setWorld(result.world);
                setFailed(false);
                setStatus(
                  result.skipped
                    ? format(e.file.importedSkipped, {
                        applied: result.applied,
                        skipped: result.skipped,
                      })
                    : format(e.file.imported, { applied: result.applied }),
                );
              } catch {
                setFailed(true);
                setStatus(e.file.invalid);
              }
            }}
          />
        </label>
      </div>
      <StatusLine tone={failed ? 'error' : 'success'} className="basis-full">
        {status}
      </StatusLine>
    </Panel>
  );
}
