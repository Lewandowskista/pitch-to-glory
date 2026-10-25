import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Career, ChronicleEntry, Id, Player, World } from '../../model/domain';
import { Artwork } from '../../ui/Artwork';
import { momentLink } from '../../engine/career/honours/clip';
import { platform } from '../../platform';
import { track } from '../../analytics';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { Button, ButtonLink, CardTitle, Panel, StatusLine, cx } from '../../ui/kit';
import { CrestImage, PlayerPortrait, useSaveLink } from './shared';
import { CHRONICLE_GLYPH, chronicleSentence, counted, Glyph, EXPAND_CHEVRON } from './honoursUi';
import { POSTER_HIGHLIGHTS, posterFonts, posterPng, posterSvg } from './chroniclePoster';

/** Highlighted entries: bold in the timeline and on the poster. */
const HIGHLIGHT = POSTER_HIGHLIGHTS;
/** Gold badges for silverware and records; the rest use the accent. */
const GOLD = new Set<ChronicleEntry['kind']>(['trophy', 'award', 'record', 'tournament']);
/** Signings and moves carry the club's crest instead of an icon. */
const CREST = new Set<ChronicleEntry['kind']>(['start', 'move']);
/** With more seasons than this, the quieter seasons in between fold into summary rows. */
const FOLD_AFTER = 4;

type Tone = 'crest' | 'gold' | 'accent' | 'soft';
const toneOf = (entry: ChronicleEntry): Tone =>
  CREST.has(entry.kind) && entry.clubId
    ? 'crest'
    : GOLD.has(entry.kind)
      ? 'gold'
      : HIGHLIGHT.has(entry.kind)
        ? 'accent'
        : 'soft';
const TONE_CLASS: Record<Exclude<Tone, 'crest'>, string> = {
  gold: 'bg-gold text-on-gold',
  accent: 'bg-accent text-on-accent',
  soft: 'bg-surface-soft text-accent shadow-[inset_0_0_0_1px_var(--line)]',
};

/** The entry's club crest for signings and moves, otherwise an icon for its kind. */
function EntryBadge({
  world,
  entry,
  small,
}: {
  world: World;
  entry: ChronicleEntry;
  small?: boolean;
}) {
  const tone = toneOf(entry);
  const crest = entry.clubId ? world.clubs[entry.clubId]?.crest : undefined;
  const size = small ? 'h-[1.625rem] w-[1.625rem]' : 'h-11 w-11';
  if (tone === 'crest' && crest)
    return (
      <span
        aria-hidden="true"
        className={cx(
          'grid shrink-0 place-items-center rounded-full bg-surface-soft shadow-[inset_0_0_0_2px_var(--accent)]',
          size,
        )}
      >
        <CrestImage
          crest={crest}
          alt=""
          className={small ? 'h-[1.0625rem] w-[0.9375rem]' : 'h-[1.8125rem] w-[1.625rem]'}
        />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid shrink-0 place-items-center rounded-full',
        size,
        TONE_CLASS[tone === 'crest' ? 'accent' : tone],
      )}
    >
      <Glyph
        name={CHRONICLE_GLYPH[entry.kind]}
        className={small ? 'h-3.5 w-3.5' : 'h-[1.375rem] w-[1.375rem]'}
      />
    </span>
  );
}

/** The season's most telling entry, for a folded summary row. */
const notable = (entries: ChronicleEntry[]) =>
  entries.find((entry) => GOLD.has(entry.kind)) ??
  entries.find((entry) => CREST.has(entry.kind)) ??
  entries.find((entry) => HIGHLIGHT.has(entry.kind)) ??
  entries[0]!;

interface SeasonBlock {
  season: number;
  entries: ChronicleEntry[];
  clubId: Id | undefined;
}

/**
 * The player's club in each season: from the season's league matches when the career still
 * holds them, otherwise carried forward from signings and moves.
 */
function seasonBlocks(
  world: World,
  entries: ChronicleEntry[],
  career: Career | undefined,
  player: Player,
): SeasonBlock[] {
  const seasons = [...new Set(entries.map((entry) => entry.date.season))].sort((a, b) => a - b);
  let carried: Id | undefined;
  return seasons.map((season) => {
    const own = entries.filter((entry) => entry.date.season === season);
    for (const entry of own) if (CREST.has(entry.kind) && entry.clubId) carried = entry.clubId;
    const last = career?.matches.filter((m) => m.season === season).at(-1);
    const fixture = last ? world.fixtures[last.fixtureId] : undefined;
    const fromMatch = fixture ? (last!.home ? fixture.homeId : fixture.awayId) : undefined;
    const current = career && season === world.date.season ? player.clubId : null;
    return { season, entries: own, clubId: current ?? fromMatch ?? carried };
  });
}

/** Which seasons stay open when the Chronicle folds: the first, the latest and the best. */
function openSeasons(blocks: SeasonBlock[]): Set<number> {
  const open = new Set<number>();
  if (blocks.length <= FOLD_AFTER) return new Set(blocks.map((block) => block.season));
  open.add(blocks[0]!.season);
  open.add(blocks.at(-1)!.season);
  let best: SeasonBlock | undefined;
  let most = 0;
  for (const block of blocks.slice(1, -1)) {
    const gold = block.entries.filter((entry) => GOLD.has(entry.kind)).length;
    if (gold > 0 && gold >= most) {
      best = block;
      most = gold;
    }
  }
  if (best) open.add(best.season);
  return open;
}

/** Open seasons stand alone; consecutive folded seasons group into one run. */
type Part = { kind: 'season'; block: SeasonBlock } | { kind: 'run'; blocks: SeasonBlock[] };
function parts(blocks: SeasonBlock[], open: Set<number>): Part[] {
  const out: Part[] = [];
  for (const block of blocks) {
    const last = out.at(-1);
    if (open.has(block.season)) out.push({ kind: 'season', block });
    else if (last?.kind === 'run') last.blocks.push(block);
    else out.push({ kind: 'run', blocks: [block] });
  }
  return out;
}

const rangeLabel = (blocks: SeasonBlock[]) => {
  const from = blocks[0]!.season;
  const to = blocks.at(-1)!.season;
  if (from === to) return format(h.chronicle.season, { season: from });
  return format(blocks.length === 2 ? h.chronicle.pair : h.chronicle.range, { from, to });
};
const entryCount = (blocks: SeasonBlock[]) =>
  blocks.reduce((sum, block) => sum + block.entries.length, 0);

/**
 * The Chronicle of one player, grouped by season, with export to an image. On its own page it
 * folds quiet seasons and shows the poster; `embedded` (the Legacy page) opens on the latest
 * season with the rest one click away.
 */
export function ChronicleView({
  world,
  playerId,
  embedded = false,
}: {
  world: World;
  playerId: string;
  embedded?: boolean;
}) {
  const player = world.players[playerId];
  const chronicle = world.chronicle;
  const entries = useMemo(
    () => chronicle.filter((entry) => entry.playerId === playerId),
    [chronicle, playerId],
  );
  const career = world.career?.playerId === playerId ? world.career : undefined;
  const blocks = useMemo(
    () => (player ? seasonBlocks(world, entries, career, player) : []),
    [world, entries, career, player],
  );
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [everything, setEverything] = useState(false);
  if (!player) return null;
  const toggle = (season: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });

  const timeline = (
    <Panel
      aria-labelledby="chronicle-heading"
      className={cx('flex min-w-0 flex-col gap-1.5', !embedded && 'flex-[2.4_1_37.5rem]')}
    >
      <ChronicleHeader world={world} player={player} entries={entries} embedded={embedded} />
      {!entries.length && <ChronicleEmpty world={world} player={player} career={career} />}
      {entries.length > 0 && !embedded && <Legend />}
      {embedded ? (
        <>
          {blocks.length > 1 && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-soft py-2 pr-2 pl-4">
              <span className="text-[0.8125rem] text-muted">
                <b className="text-ink">{rangeLabel(blocks)}</b>
                {' · '}
                {counted(blocks.length, h.chronicle.seasons)}
                {' · '}
                {counted(entryCount(blocks), h.chronicle.entriesCount)}
              </span>
              <Button
                variant="secondary"
                aria-expanded={everything}
                iconEnd="chevron"
                className={EXPAND_CHEVRON}
                onClick={() => setEverything((value) => !value)}
              >
                {everything ? h.chronicle.latestOnly : h.chronicle.earlier}
              </Button>
            </div>
          )}
          {(everything ? blocks : blocks.slice(-1)).map((block) => (
            <Season
              key={block.season}
              world={world}
              player={player}
              block={block}
              career={career}
            />
          ))}
        </>
      ) : (
        parts(blocks, openSeasons(blocks)).map((part) =>
          part.kind === 'season' ? (
            <Season
              key={part.block.season}
              world={world}
              player={player}
              block={part.block}
              career={career}
            />
          ) : (
            <Folded
              key={part.blocks[0]!.season}
              world={world}
              blocks={part.blocks}
              open={expanded.has(part.blocks[0]!.season)}
              onToggle={() => toggle(part.blocks[0]!.season)}
            >
              {part.blocks.map((block) => (
                <Season
                  key={block.season}
                  world={world}
                  player={player}
                  block={block}
                  career={career}
                />
              ))}
            </Folded>
          ),
        )
      )}
    </Panel>
  );
  if (embedded || !entries.length) return timeline;
  return (
    <div className="flex flex-wrap items-start gap-5">
      {timeline}
      <PosterPreview world={world} player={player} entries={entries} />
    </div>
  );
}

/** Title, export button and the export's status line. */
function ChronicleHeader({
  world,
  player,
  entries,
  embedded,
}: {
  world: World;
  player: Player;
  entries: ChronicleEntry[];
  embedded: boolean;
}) {
  const [status, setStatus] = useState<{ tone: 'neutral' | 'success' | 'error'; text: string }>({
    tone: 'neutral',
    text: '',
  });
  const busy = status.text === h.chronicle.exporting;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-[1_1_18rem]">
        <CardTitle id="chronicle-heading" size="lg">
          {h.chronicle.title}
        </CardTitle>
        <p className="mt-1 text-muted">{h.chronicle.body}</p>
      </div>
      <div className="flex flex-col items-end gap-1.5 max-sm:w-full max-sm:items-stretch">
        <Button
          variant={embedded ? 'secondary' : 'primary'}
          icon="download"
          busy={busy}
          disabled={!entries.length}
          onClick={async () => {
            setStatus({ tone: 'neutral', text: h.chronicle.exporting });
            try {
              const fonts = await posterFonts();
              const blob = await posterPng(posterSvg(world, player, entries, fonts));
              await platform.shareFile(
                `${player.name.replace(/\s+/g, '-').toLowerCase()}-chronicle.png`,
                blob,
                'image/png',
              );
              track('shared', { what: 'chronicle', method: 'file' });
              setStatus({ tone: 'success', text: h.chronicle.exported });
            } catch {
              setStatus({ tone: 'error', text: h.chronicle.exportFailed });
            }
          }}
        >
          {h.chronicle.export}
        </Button>
        <StatusLine tone={status.tone} className="max-w-[20rem] py-2">
          {status.text}
        </StatusLine>
      </div>
    </div>
  );
}

/** Before the first entry: the player, their club and the way to the first match. */
function ChronicleEmpty({
  world,
  player,
  career,
}: {
  world: World;
  player: Player;
  career: Career | undefined;
}) {
  const link = useSaveLink();
  const club = player.clubId ? world.clubs[player.clubId] : undefined;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-control bg-surface-soft px-4.5 py-4">
      <PlayerPortrait
        player={player}
        age={world.date.season - player.birthSeason}
        club={club}
        className="h-16 w-16 shrink-0"
      />
      <div className="min-w-0 flex-[1_1_14rem]">
        <p className="text-base font-bold">{h.chronicle.empty}</p>
        {club && (
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            {format(h.chronicle.emptyLine, { season: world.date.season, club: club.name })}
          </p>
        )}
      </div>
      {career && (
        <ButtonLink to={link('/match')} iconEnd="arrow">
          {h.chronicle.play}
        </ButtonLink>
      )}
    </div>
  );
}

/** What each badge colour means, so the timeline never relies on colour alone. */
function Legend() {
  const L = h.chronicle.legend;
  const items: [string, string][] = [
    [L.clubs, 'bg-surface-soft shadow-[inset_0_0_0_2px_var(--accent)]'],
    [L.silverware, 'bg-gold'],
    [L.milestones, 'bg-accent'],
    [L.other, 'bg-surface-soft shadow-[inset_0_0_0_1px_var(--line)]'],
  ];
  return (
    <ul aria-label={L.label} className="mt-1.5 mb-1 flex flex-wrap gap-x-3 gap-y-1.5">
      {items.map(([label, swatch]) => (
        <li key={label} className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden="true" className={cx('h-3.5 w-3.5 rounded-full', swatch)} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** One season: a sticky column with its numbers and club, beside the timeline of entries. */
function Season({
  world,
  player,
  block,
  career,
}: {
  world: World;
  player: Player;
  block: SeasonBlock;
  career: Career | undefined;
}) {
  const moments = useMemo(
    () => new Map(world.moments.map((moment) => [moment.id, moment])),
    [world.moments],
  );
  const club = block.clubId ? world.clubs[block.clubId] : undefined;
  const matches = career?.matches.filter((m) => m.season === block.season) ?? [];
  const C = h.chronicle.counts;
  const now = career && block.season === world.date.season;
  return (
    <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3.5 border-t border-line pt-5">
      <div className="flex flex-[0_0_11rem] flex-col gap-1.5 max-sm:flex-[1_1_100%] sm:sticky sm:top-6 sm:self-start">
        <h3 className="font-display text-[2.125rem] leading-[0.95] font-normal">
          {format(h.chronicle.season, { season: block.season })}
        </h3>
        {matches.length > 0 && (
          <p className="text-[0.8125rem] text-muted">
            {format(h.chronicle.seasonLine, {
              apps: counted(matches.length, C.apps),
              goals: counted(
                matches.reduce((sum, m) => sum + m.goals, 0),
                C.goals,
              ),
              assists: counted(
                matches.reduce((sum, m) => sum + m.assists, 0),
                C.assists,
              ),
            })}
          </p>
        )}
        {club && (
          <span className="flex items-center gap-2 text-xs font-bold">
            <CrestImage crest={club.crest} alt="" className="h-[1.4375rem] w-5 shrink-0" />
            {format(h.chronicle.clubLine, {
              club: club.name,
              age: block.season - player.birthSeason,
            })}
          </span>
        )}
        {now && (
          <span className="self-start rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.6875rem] font-extrabold text-accent">
            {format(h.chronicle.inProgress, { week: world.date.week })}
          </span>
        )}
      </div>
      <ol className="relative flex min-w-0 max-w-[42.5rem] flex-[1_1_26rem] flex-col gap-4 before:absolute before:top-2.5 before:bottom-2.5 before:left-[1.3125rem] before:w-0.5 before:bg-line">
        {block.entries.map((entry) => {
          const tone = toneOf(entry);
          const moment = entry.momentId ? moments.get(entry.momentId) : undefined;
          return (
            <li key={entry.id} className="relative flex items-start gap-3.5">
              <EntryBadge world={world} entry={entry} />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs text-muted">
                  {format(c.common.week, { week: entry.date.week })}
                </p>
                <p
                  className={cx(
                    'mt-0.5 text-ink',
                    tone === 'soft' ? 'text-sm' : 'text-[0.9375rem] font-semibold',
                  )}
                >
                  {chronicleSentence(world, entry)}
                </p>
                {moment && (
                  <Link
                    className="mt-0.5 inline-flex min-h-8 items-center gap-1.5 text-[0.8125rem] font-bold text-accent underline underline-offset-4"
                    to={
                      career
                        ? `/career/moments?moment=${encodeURIComponent(moment.id)}`
                        : `/moment#${momentLink(moment)}`
                    }
                  >
                    <Glyph name="moment" className="h-4 w-4" />
                    {h.chronicle.watch}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Quiet seasons folded into one summary row each, opened together on request. */
function Folded({
  world,
  blocks,
  open,
  onToggle,
  children,
}: {
  world: World;
  blocks: SeasonBlock[];
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const label = rangeLabel(blocks);
  return (
    <div className="mt-4 flex flex-col gap-2.5 border-t border-line pt-4.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-[1.75rem] leading-none font-normal">{label}</h3>
        <Button
          variant="secondary"
          aria-expanded={open}
          iconEnd="chevron"
          className={EXPAND_CHEVRON}
          onClick={onToggle}
        >
          {open
            ? h.chronicle.hide
            : format(h.chronicle.show, {
                seasons: counted(blocks.length, h.chronicle.seasons),
                entries: counted(entryCount(blocks), h.chronicle.entriesCount),
              })}
        </Button>
      </div>
      {open ? (
        children
      ) : (
        <ul className="flex flex-col rounded-control bg-surface-soft px-3 py-2">
          {blocks.map((block) => {
            const entry = notable(block.entries);
            return (
              <li
                key={block.season}
                className="flex min-w-0 items-center gap-3 border-b border-line py-1.5 last:border-b-0"
              >
                <span className="w-11 shrink-0 font-display text-[1.375rem] leading-none">
                  {block.season}
                </span>
                <EntryBadge world={world} entry={entry} small />
                <span className="min-w-0 flex-1 text-[0.8125rem] font-semibold">
                  {chronicleSentence(world, entry)}
                </span>
                <span className="shrink-0 text-xs whitespace-nowrap text-muted max-sm:hidden">
                  {counted(block.entries.length, h.chronicle.entriesCount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A small preview of the exported poster, drawn by the same generator. */
function PosterPreview({
  world,
  player,
  entries,
}: {
  world: World;
  player: Player;
  entries: ChronicleEntry[];
}) {
  const [fonts, setFonts] = useState('');
  useEffect(() => {
    let live = true;
    posterFonts()
      .then((style) => {
        if (live) setFonts(style);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const svg = useMemo(
    () => posterSvg(world, player, entries, fonts),
    [world, player, entries, fonts],
  );
  const P = h.chronicle.preview;
  return (
    <Panel
      as="aside"
      aria-labelledby="poster-heading"
      className="flex min-w-0 flex-[1_1_20rem] flex-col gap-3.5 lg:sticky lg:top-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <CardTitle id="poster-heading" size="md">
          {P.title}
        </CardTitle>
        <span className="text-xs font-semibold text-muted">{P.size}</span>
      </div>
      <div className="self-center rounded-panel bg-night p-3 shadow-surface">
        <Artwork
          svg={svg}
          alt={format(P.alt, {
            name: player.name,
            position: c.positions[player.primaryPosition] ?? '',
            nation: world.countries[player.nationalityId]?.name ?? '',
          })}
          className="block aspect-[1080/1350] w-full max-w-[19.5rem] rounded-control"
        />
      </div>
      <p className="text-[0.8125rem] text-muted">{P.body}</p>
    </Panel>
  );
}
