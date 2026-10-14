import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChronicleEntry, World } from '../../model/domain';
import { renderCrest } from '../../engine/assets/crest';
import { Artwork } from '../../ui/Artwork';
import { momentLink } from '../../engine/career/honours/clip';
import { platform } from '../../platform';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { ui } from './shared';
import { CHRONICLE_GLYPH, chronicleSentence, counted, Glyph } from './honoursUi';
import { POSTER_HIGHLIGHTS, posterFonts, posterPng, posterSvg } from './chroniclePoster';

/** Highlighted entries: bold in the timeline and on the poster. */
const HIGHLIGHT = POSTER_HIGHLIGHTS;
/** Gold badges for silverware and records; the rest use the accent. */
const GOLD = new Set<ChronicleEntry['kind']>(['trophy', 'award', 'record', 'tournament']);

/** The entry's club crest for signings and moves, otherwise an icon for its kind. */
function EntryArt({ world, entry }: { world: World; entry: ChronicleEntry }) {
  const crest = entry.clubId ? world.clubs[entry.clubId]?.crest : undefined;
  const svg = useMemo(
    () => (crest && (entry.kind === 'move' || entry.kind === 'start') ? renderCrest(crest) : ''),
    [crest, entry.kind],
  );
  if (svg)
    return (
      <Artwork
        svg={svg}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full bg-surface-soft p-1 ring-2 ring-accent"
      />
    );
  const tone = GOLD.has(entry.kind)
    ? 'bg-gold text-on-gold'
    : HIGHLIGHT.has(entry.kind)
      ? 'bg-accent text-on-accent'
      : 'bg-surface-soft text-accent';
  return (
    <span
      aria-hidden="true"
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${tone}`}
    >
      <Glyph name={CHRONICLE_GLYPH[entry.kind]} className="h-6 w-6" />
    </span>
  );
}

/** The Chronicle of one player, grouped by season, with export to an image. */
export function ChronicleView({ world, playerId }: { world: World; playerId: string }) {
  const player = world.players[playerId];
  const [status, setStatus] = useState('');
  const entries = world.chronicle.filter((entry) => entry.playerId === playerId);
  const seasons = [...new Set(entries.map((entry) => entry.date.season))];
  const career = world.career?.playerId === playerId ? world.career : undefined;
  const moments = new Map(world.moments.map((moment) => [moment.id, moment]));
  if (!player) return null;
  return (
    <section
      aria-labelledby="chronicle-heading"
      className={`${ui.panel} chronicle-story max-w-5xl`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="chronicle-heading" className={ui.heading}>
            {h.chronicle.title}
          </h2>
          <p className={`${ui.muted} mt-1`}>{h.chronicle.body}</p>
        </div>
        <button
          className="button secondary"
          disabled={!entries.length}
          onClick={async () => {
            setStatus(h.chronicle.exporting);
            try {
              const fonts = await posterFonts();
              const blob = await posterPng(posterSvg(world, player, entries, fonts));
              await platform.shareFile(
                `${player.name.replace(/\s+/g, '-').toLowerCase()}-chronicle.png`,
                blob,
                'image/png',
              );
              setStatus(h.chronicle.exported);
            } catch {
              setStatus(h.chronicle.exportFailed);
            }
          }}
        >
          {h.chronicle.export}
        </button>
      </div>
      <p role="status" className="mt-2 text-sm font-semibold text-accent empty:hidden">
        {status}
      </p>
      {!entries.length && <p className={`${ui.muted} mt-4`}>{h.chronicle.empty}</p>}
      {seasons.map((season) => {
        const own = entries.filter((entry) => entry.date.season === season);
        const matches = career?.matches.filter((m) => m.season === season) ?? [];
        const C = h.chronicle.counts;
        return (
          <div
            key={season}
            className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-line pt-5 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-6"
          >
            <div className="lg:sticky lg:top-6 lg:self-start">
              <h3 className="font-display text-3xl leading-none">
                {format(h.chronicle.season, { season })}
              </h3>
              {matches.length > 0 && (
                <p className="mt-1 text-sm text-muted">
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
            </div>
            <ol className="relative grid max-w-3xl gap-4 before:absolute before:top-2 before:bottom-2 before:left-[1.35rem] before:w-0.5 before:bg-line">
              {own.map((entry) => (
                <li key={entry.id} className="relative flex items-start gap-3">
                  <EntryArt world={world} entry={entry} />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-xs text-muted">
                      {format(c.common.week, { week: entry.date.week })}
                    </p>
                    <p
                      className={
                        HIGHLIGHT.has(entry.kind) ? 'font-semibold text-ink' : 'text-sm text-ink'
                      }
                    >
                      {chronicleSentence(world, entry)}
                    </p>
                    {moments.has(entry.momentId ?? '') && (
                      <Link
                        className="text-xs font-semibold text-accent underline"
                        to={
                          career
                            ? `/career/moments?moment=${encodeURIComponent(entry.momentId!)}`
                            : `/moment#${momentLink(moments.get(entry.momentId!)!)}`
                        }
                      >
                        {h.chronicle.watch}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}
