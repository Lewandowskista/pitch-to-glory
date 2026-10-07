import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Club, Hex, League, Player, World } from '../model/domain';
import { useAppStore } from '../store';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
import { renderCrest } from '../engine/assets/crest';
import { renderKit } from '../engine/assets/kit';
import { renderAvatar } from '../engine/assets/avatar';
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
import { format } from '../i18n';
import { careerText as c } from '../i18n/career';
import { editText as e } from '../i18n/edit';
import { plural, ui, useEditBlock, useRestoredWorld } from './career/shared';

type Kind = 'clubs' | 'leagues' | 'players';
const KINDS: Kind[] = ['clubs', 'leagues', 'players'];
const LIMIT = 60;
const field =
  'min-h-11 w-full rounded-control border border-line bg-surface px-3 text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent';

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
      <header className="page-heading">
        <p className={ui.eyebrow}>{e.eyebrow}</p>
        <h1>{e.title}</h1>
        <p>{e.description}</p>
      </header>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className={ui.muted}>
          {c.common.loading}
        </p>
      ) : world ? (
        <Editor world={world} />
      ) : (
        <section className={`${ui.panel} flex flex-col gap-4 bg-art-green`}>
          <h2 className="font-display text-[2.2rem] leading-none">{e.empty.title}</h2>
          <p className="max-w-prose text-muted">{e.empty.body}</p>
          <div className="flex flex-wrap gap-2">
            <Link className="button" to="/world">
              {e.empty.world}
              <Icon name="arrow" />
            </Link>
            <Link className="button secondary" to="/saves">
              {e.empty.saves}
            </Link>
          </div>
        </section>
      )}
    </Page>
  );
}

interface Row {
  id: string;
  name: string;
  meta: string;
  countryId: string;
  edited: boolean;
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
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function Editor({ world }: { world: World }) {
  const [params, setParams] = useSearchParams();
  const kind = (KINDS.find((k) => k === params.get('kind')) ?? 'clubs') as Kind;
  // Typed and ticked values live in local state (the URL updates in a transition, which
  // would make controlled inputs lag); the URL mirrors them for back, forward and refresh.
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const country = params.get('country') ?? '';
  const [editedOnly, setEditedOnly] = useState(() => params.get('edited') === '1');
  const selected = params.get('id');
  const { block } = useEdit();
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      {block && (
        <p role="status" className="inline-error xl:col-span-2">
          {block}
        </p>
      )}
      <EditFile world={world} />
      <section
        aria-labelledby="edit-list-heading"
        className={`${ui.panel} flex min-w-0 flex-col gap-4`}
      >
        <h2 id="edit-list-heading" className="sr-only">
          {e.kindsLabel}
        </h2>
        <div
          ref={tabs}
          role="tablist"
          aria-label={e.kindsLabel}
          className="grid grid-cols-3 gap-1 rounded-control bg-surface-soft p-1"
        >
          {KINDS.map((k) => (
            <button
              key={k}
              role="tab"
              id={`edit-tab-${k}`}
              aria-selected={kind === k}
              aria-controls="edit-results"
              tabIndex={kind === k ? 0 : -1}
              onKeyDown={onTabKey}
              onClick={() => set({ kind: k, id: null }, true)}
              className={`min-h-11 rounded-[0.6rem] text-sm font-semibold transition-colors ${ui.focus} ${
                kind === k ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'
              }`}
            >
              {e.kinds[k]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="grid gap-1 text-sm font-semibold">
            {e.search}
            <input
              type="search"
              className={field}
              value={query}
              placeholder={e.searchPlaceholder}
              onChange={(event) => {
                setQuery(event.target.value);
                set({ q: event.target.value || null });
              }}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {e.country}
            <select
              className={field}
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
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
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
        <div id="edit-results" role="tabpanel" aria-labelledby={`edit-tab-${kind}`}>
          <p className="mb-2 text-xs text-muted" aria-live="polite">
            {matches.length > LIMIT
              ? format(e.resultsMore, { shown: LIMIT, total: matches.length })
              : format(e.results, { shown: matches.length, total: all.length })}
          </p>
          {shown.length ? (
            <ul className="grid max-h-[32rem] gap-1.5 overflow-y-auto pr-1">
              {shown.map((row) => (
                <li key={row.id}>
                  <button
                    aria-current={row.id === selected ? 'true' : undefined}
                    onClick={() => set({ id: row.id }, true)}
                    className={`flex min-h-12 w-full min-w-0 items-center gap-2 rounded-control border px-3 py-2 text-left ${ui.focus} ${
                      row.id === selected
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-surface-soft hover:border-accent'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{row.name}</strong>
                      <span className="block truncate text-xs text-muted">{row.meta}</span>
                    </span>
                    {row.edited && <span className={ui.chip}>{e.edited}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={ui.muted}>{e.noResults}</p>
          )}
        </div>
      </section>
      <div className="order-first min-w-0 xl:order-none">
        {entity && kind === 'clubs' ? (
          <ClubEditor key={entity.id} world={world} club={entity as Club} />
        ) : entity && kind === 'leagues' ? (
          <NameEditor key={entity.id} world={world} kind="leagues" entity={entity as League} />
        ) : entity ? (
          <NameEditor key={entity.id} world={world} kind="players" entity={entity as Player} />
        ) : (
          <section className={`${ui.panel} hidden xl:block`}>
            <p className={ui.muted}>{e.choose}</p>
          </section>
        )}
      </div>
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
    <form onSubmit={submit} noValidate className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {e.name}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          className={`${field} flex-1 basis-56`}
          value={name}
          maxLength={NAME_LIMIT}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setName(event.target.value)}
        />
        <button className="button" disabled={disabled || name === value}>
          {e.rename}
        </button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted">
        {original ? format(e.original, { name: original }) : e.nameHint}
      </p>
      <p role="status" className="text-sm font-semibold text-accent empty:hidden">
        {status}
      </p>
    </form>
  );
}

function RevertButton({ onRevert, disabled }: { onRevert: () => void; disabled: boolean }) {
  return (
    <button className="button secondary" disabled={disabled} onClick={onRevert}>
      <Icon name="refresh" />
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
  const portrait = useMemo(
    () => (player ? renderAvatar(player.avatar, Math.max(16, Math.min(60, age))) : ''),
    [player, age],
  );
  return (
    <section aria-labelledby="editor-heading" className={`${ui.panel} flex flex-col gap-5`}>
      <div className="flex flex-wrap items-center gap-4">
        {player && <Artwork svg={portrait} alt="" className="h-20 w-20 rounded-full bg-art-blue" />}
        <div className="min-w-0 flex-1">
          <p className={ui.eyebrow}>{e.kinds[kind]}</p>
          <h2 id="editor-heading" className={`${ui.heading} break-words`}>
            {entity.name}
          </h2>
          <p className="text-sm text-muted">
            {player
              ? `${format(e.player.meta, {
                  position: c.positions[player.primaryPosition] ?? '',
                  club: player.clubId ? (world.clubs[player.clubId]?.name ?? '') : e.player.free,
                })} · ${format(e.player.age, { age })}`
              : league
                ? `${format(e.league.country, {
                    country: world.countries[league.countryId]?.name ?? '',
                    tier: league.tier,
                  })} · ${format(e.league.clubs, { count: league.clubIds.length })}`
                : ''}
          </p>
        </div>
        {edit && <span className={ui.chip}>{e.edited}</span>}
      </div>
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
          <span role="status" className="text-sm font-semibold text-accent">
            {status}
          </span>
        </div>
      )}
    </section>
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
  const crestSvg = useMemo(() => renderCrest(preview.crest), [preview.crest]);
  const kitSvgs = useMemo(
    () => (['home', 'away', 'third'] as const).map((k) => [k, renderKit(preview.kits[k])] as const),
    [preview.kits],
  );
  return (
    <section aria-labelledby="editor-heading" className={`${ui.panel} flex flex-col gap-6`}>
      <div className="flex flex-wrap items-center gap-4">
        <Artwork
          svg={crestSvg}
          alt={format(e.crestAlt, { club: club.name })}
          className="h-24 w-24 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className={ui.eyebrow}>{e.kinds.clubs}</p>
          <h2 id="editor-heading" className={`${ui.heading} break-words`}>
            {club.name}
          </h2>
          <p className="text-sm text-muted">
            {club.city} · {world.leagues[club.leagueId]?.name}
          </p>
        </div>
        {edit && <span className={ui.chip}>{e.edited}</span>}
      </div>
      <NameForm
        id={`name-${club.id}`}
        value={club.name}
        original={edit?.name ? edit.original.name : null}
        disabled={Boolean(block)}
        onSave={(name) => run({ type: 'rename-club', id: club.id, name })}
      />
      <div className="grid gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{e.colours}</h3>
        <p className="text-sm text-muted">{e.coloursBody}</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
          {colors.map((color, index) => {
            const label = e.colourNames[index]!;
            const ok = /^#[0-9a-f]{6}$/i.test(color);
            return (
              <div key={label} className="grid gap-1">
                <label htmlFor={`colour-${index}`} className="text-sm font-semibold">
                  {label}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`colour-${index}`}
                    type="color"
                    value={ok ? color.toLowerCase() : '#000000'}
                    className={`h-11 w-14 shrink-0 cursor-pointer rounded-control border border-line bg-surface p-1 ${ui.focus}`}
                    onChange={(event) =>
                      setColors(colors.map((c2, i) => (i === index ? event.target.value : c2)))
                    }
                  />
                  <input
                    aria-label={format(e.colourHex, { name: label })}
                    className={`${field} min-w-0 font-mono`}
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
        {!valid && (
          <p role="alert" className="inline-error">
            {e.coloursInvalid}
          </p>
        )}
        <div>
          <button
            className="button"
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
          </button>
        </div>
      </div>
      <div className="grid gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{e.kits}</h3>
        <ul className="grid grid-cols-3 gap-3">
          {kitSvgs.map(([k, svg]) => (
            <li
              key={k}
              className="grid justify-items-center gap-1 rounded-control bg-surface-soft p-3"
            >
              <Artwork
                svg={svg}
                alt={format(e.kitAlt, { club: club.name, kit: e.kitNames[k].toLowerCase() })}
                className="h-20 w-20"
              />
              <span className="text-xs font-semibold">{e.kitNames[k]}</span>
            </li>
          ))}
        </ul>
        <ClashCheck world={world} club={preview} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="button secondary"
          disabled={Boolean(block)}
          onClick={() => setStatus(run({ type: 'regenerate-crest', id: club.id }) ?? e.crestSaved)}
        >
          <Icon name="refresh" />
          {e.regenerate}
        </button>
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
      <p role="status" className="text-sm font-semibold text-accent empty:hidden">
        {status}
      </p>
    </section>
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
    <div className="grid gap-2 rounded-control border border-line p-4">
      <h4 className="text-sm font-bold">{e.clash.title}</h4>
      <p className="text-xs text-muted">{e.clash.body}</p>
      <p className={`text-sm ${ownSafe ? '' : 'font-semibold text-danger'}`}>
        <span aria-hidden="true">{ownSafe ? '✓ ' : '! '}</span>
        {ownSafe
          ? e.clash.ownSafe
          : format(e.clash.ownClash, { vision: e.clash.visions[own.vision] })}
      </p>
      <p className={`text-sm ${clashes.length ? 'font-semibold text-danger' : ''}`}>
        <span aria-hidden="true">{clashes.length ? '! ' : '✓ '}</span>
        {clashes.length
          ? format(e.clash.leagueClash, { count: clashes.length })
          : e.clash.leagueSafe}
      </p>
      {clashes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {clashes.slice(0, 8).map((other) => (
            <li key={other.id} className={ui.chip}>
              {other.name}
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
    <section
      aria-labelledby="edit-file-heading"
      className={`${ui.panel} flex flex-wrap items-center gap-4 xl:col-span-2`}
    >
      <div className="min-w-0 flex-1 basis-72">
        <h2 id="edit-file-heading" className={ui.heading}>
          {e.file.title}
        </h2>
        <p className="mt-1 text-sm font-semibold">
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
        <p className="mt-1 max-w-prose text-xs text-muted">{e.file.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="button secondary"
          disabled={!any}
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
          <Icon name="download" />
          {e.file.export}
        </button>
        <label
          className={`button secondary ${block ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
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
      <p
        role={failed ? 'alert' : 'status'}
        className={`basis-full text-sm font-semibold empty:hidden ${failed ? 'text-danger' : 'text-accent'}`}
      >
        {status}
      </p>
    </section>
  );
}
