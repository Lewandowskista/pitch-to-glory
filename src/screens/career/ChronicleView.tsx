import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChronicleEntry, Player, World } from '../../model/domain';
import { renderAvatar } from '../../engine/assets/avatar';
import { renderCrest } from '../../engine/assets/crest';
import { Artwork } from '../../ui/Artwork';
import { momentLink } from '../../engine/career/honours/clip';
import { platform } from '../../platform';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { ui } from './shared';
import { chronicleSentence } from './honoursUi';

const MARK: Partial<Record<ChronicleEntry['kind'], string>> = {
  trophy: '★',
  award: '✦',
  record: '◆',
  tournament: '★',
  move: '→',
  injury: '+',
  retirement: '■',
};
const HIGHLIGHT = new Set([
  'trophy',
  'award',
  'record',
  'tournament',
  'move',
  'hat-trick',
  'goal-milestone',
  'cap',
  'retirement',
  'debut',
]);

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

/** A shareable poster of the career: portrait, numbers and highlights, as SVG. */
function posterSvg(world: World, player: Player, entries: ChronicleEntry[]): string {
  const age = Math.min(60, world.date.season - player.birthSeason);
  const portrait = `data:image/svg+xml,${encodeURIComponent(renderAvatar(player.avatar, age))}`;
  const nation = world.countries[player.nationalityId]?.name ?? '';
  const highlights = entries.filter((entry) => HIGHLIGHT.has(entry.kind)).slice(-9);
  const lines = highlights
    .map(
      (entry, index) =>
        `<text x="96" y="${760 + index * 56}" font-size="30" fill="#f9f5e9">${escape(`${entry.date.season} · ${chronicleSentence(world, entry)}`).slice(0, 120)}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#0b3d2c"/><rect x="40" y="40" width="1000" height="1270" rx="40" fill="#075e45"/><image href="${portrait}" x="96" y="96" width="300" height="300"/><text x="440" y="200" font-family="sans-serif" font-size="76" font-weight="800" fill="#f1cf58">${escape(player.name)}</text><text x="440" y="260" font-family="sans-serif" font-size="34" fill="#f9f5e9">${escape(`${c.positions[player.primaryPosition]} · ${nation}`)}</text><text x="440" y="330" font-family="sans-serif" font-size="34" fill="#f9f5e9">${escape(format(h.chronicle.poster.stats, { apps: player.stats.appearances, goals: player.stats.goals, caps: entries.filter((e) => e.kind === 'cap').length }))}</text><text x="96" y="690" font-family="sans-serif" font-size="40" font-weight="800" fill="#f1cf58">${escape(h.chronicle.poster.highlights)}</text><g font-family="sans-serif">${lines}</g><text x="96" y="1270" font-family="sans-serif" font-size="30" fill="#f1cf58">${escape(h.chronicle.poster.footer)}</text></svg>`;
}

async function posterPng(svg: string): Promise<Blob> {
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png'),
  );
}

function EntryArt({
  world,
  entry,
  player,
}: {
  world: World;
  entry: ChronicleEntry;
  player: Player;
}) {
  const age = entry.date.season - player.birthSeason;
  const crest = entry.clubId ? world.clubs[entry.clubId]?.crest : undefined;
  const svg = useMemo(
    () =>
      crest && ['move', 'trophy', 'start'].includes(entry.kind)
        ? renderCrest(crest)
        : renderAvatar(player.avatar, Math.max(16, age)),
    [crest, entry.kind, player.avatar, age],
  );
  return <Artwork svg={svg} alt="" className="h-12 w-12 shrink-0 rounded-full bg-art-blue" />;
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
    <section aria-labelledby="chronicle-heading" className={`${ui.panel}`}>
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
              const blob = await posterPng(posterSvg(world, player, entries));
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
        return (
          <div key={season} className="mt-6">
            <h3 className="font-display text-2xl leading-none">
              {format(h.chronicle.season, { season })}
            </h3>
            {matches.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                {format(h.chronicle.seasonLine, {
                  apps: matches.length,
                  goals: matches.reduce((sum, m) => sum + m.goals, 0),
                  assists: matches.reduce((sum, m) => sum + m.assists, 0),
                })}
              </p>
            )}
            <ol className="mt-3 grid gap-3 border-l-2 border-line pl-4">
              {own.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3">
                  <EntryArt world={world} entry={entry} player={player} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">
                      {format(c.common.week, { week: entry.date.week })}
                      {MARK[entry.kind] ? (
                        <span aria-hidden="true"> {MARK[entry.kind]}</span>
                      ) : null}
                    </p>
                    <p className={`text-sm ${HIGHLIGHT.has(entry.kind) ? 'font-semibold' : ''}`}>
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
