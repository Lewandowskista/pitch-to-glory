import bebasNeue from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url';
import interVariable from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import type { ChronicleEntry, Player, World } from '../../model/domain';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
import { renderCrest } from '../../engine/assets/crest';
import { careerTotals } from '../../engine/career/honours/retirement';
import { tournamentPart } from '../../engine/career/honours/trophies';
import { TONE, uid } from '../../engine/assets/illustration';
import { trophyKindFor, trophyShapes, type TrophyKind } from '../../engine/assets/trophies';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { chronicleSentence, counted } from './honoursUi';

/** Chronicle kinds that make the poster's highlights. */
export const POSTER_HIGHLIGHTS = new Set<ChronicleEntry['kind']>([
  'start',
  'debut',
  'first-goal',
  'trophy',
  'award',
  'record',
  'tournament',
  'move',
  'hat-trick',
  'goal-milestone',
  'clean-sheet-milestone',
  'assist-milestone',
  'cap',
  'retirement',
]);

const WIDTH = 1080;
const HEIGHT = 1350;
const DISPLAY = `'Bebas Neue', 'Arial Narrow', sans-serif`;
const BODY = `Inter, 'Segoe UI', Arial, sans-serif`;
const TROPHY_SIZE = 76;
const TROPHY_GAP = 8;
const TROPHIES_PER_ROW = 10;

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const clip = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
const image = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** The player's silverware in the order it was won: club trophies, awards, tournaments. */
function posterTrophies(world: World, player: Player): TrophyKind[] {
  const won: { season: number; kind: TrophyKind }[] = [
    ...world.trophies
      .filter((trophy) => trophy.playerIds.includes(player.id))
      .map((trophy) => ({ season: trophy.season, kind: trophyKindFor(trophy.competitionId) })),
    ...world.awards
      .filter((award) => award.winnerIds.includes(player.id))
      .map((award) => ({ season: award.season, kind: trophyKindFor(award.kind) })),
    ...(world.international?.tournaments ?? [])
      .filter((t) => {
        const part = tournamentPart(world, player.id, t);
        return part?.inSquad && part.stage === 'winner';
      })
      .map((t) => ({ season: t.year, kind: trophyKindFor(t.kind) })),
  ];
  return won.sort((a, b) => a.season - b.season).map((entry) => entry.kind);
}

/**
 * A shareable 1080 × 1350 poster of a career (redesign A9) as SVG: portrait, current club
 * crest, numbers, a row of trophies and the latest highlights, in the design tokens. `fonts`
 * is the `<style>` from `posterFonts()`; without it the text falls back to system fonts.
 */
export function posterSvg(
  world: World,
  player: Player,
  entries: ChronicleEntry[],
  fonts = '',
): string {
  const age = Math.min(60, world.date.season - player.birthSeason);
  const clubId = player.clubId ?? [...entries].reverse().find((entry) => entry.clubId)?.clubId;
  const club = clubId ? world.clubs[clubId] : undefined;
  const nation = world.countries[player.nationalityId]?.name ?? '';
  const pitch = uid('poster-pitch');
  const portrait = uid('poster-portrait');
  const stripes = Array.from(
    { length: 9 },
    (_, index) =>
      `<rect x="${40 + index * 120}" y="40" width="60" height="1270" fill="${TONE.fieldStripe}"/>`,
  ).join('');
  // Bebas Neue is condensed: about 0.42em a character keeps the name clear of the crest.
  const nameSize = Math.min(104, Math.floor(408 / (Math.max(1, player.name.length) * 0.42)));
  // Totals from the career's record or the legacy: Chronicle entries are landmarks (one cap
  // entry per national level), never totals.
  const totals = careerTotals(world, player.id);
  const stats = format(h.chronicle.poster.stats, {
    apps: counted(totals.appearances, h.chronicle.counts.apps),
    goals: counted(totals.goals, h.chronicle.counts.goals),
    caps: counted(totals.caps, h.chronicle.counts.caps),
  });
  const won = posterTrophies(world, player);
  const capacity = TROPHIES_PER_ROW * 2;
  const shown = won.length > capacity ? won.slice(-(capacity - 1)) : won;
  const extra = won.length - shown.length;
  const discs = [...(extra ? ['more' as const] : []), ...shown]
    .map((kind, index) => {
      const x = 96 + (index % TROPHIES_PER_ROW) * (TROPHY_SIZE + TROPHY_GAP);
      const y = 440 + Math.floor(index / TROPHIES_PER_ROW) * (TROPHY_SIZE + TROPHY_GAP);
      const disc = `<circle cx="32" cy="32" r="31" fill="${TONE.gold}"/><circle cx="32" cy="32" r="27.5" fill="${TONE.plate}"/>`;
      const art =
        kind === 'more'
          ? `<text x="32" y="41" text-anchor="middle" font-family="${BODY}" font-size="24" font-weight="800" fill="${TONE.gold}">${escape(format(h.chronicle.poster.more, { count: extra }))}</text>`
          : `<g transform="translate(4.5 4.5) scale(.86)">${trophyShapes(kind)}</g>`;
      return `<g transform="translate(${x} ${y}) scale(${TROPHY_SIZE / 64})">${disc}${art}</g>`;
    })
    .join('');
  const rows = Math.ceil((shown.length + (extra ? 1 : 0)) / TROPHIES_PER_ROW);
  // The highlights follow the trophies: up to two rows of them, or none.
  const top = 440 + rows * (TROPHY_SIZE + TROPHY_GAP) + (rows ? 64 : 24);
  const highlights = entries.filter((entry) => POSTER_HIGHLIGHTS.has(entry.kind)).slice(-9);
  const lines = highlights
    .map(
      (entry, index) =>
        `<text x="96" y="${top + 66 + index * 56}" font-size="28"><tspan font-weight="800" fill="${TONE.gold}">${entry.date.season}</tspan><tspan fill="${TONE.heroInk}"> · ${escape(clip(chronicleSentence(world, entry), 54))}</tspan></text>`,
    )
    .join('');
  const crest = club
    ? `<image href="${image(renderCrest(club.crest))}" x="872" y="92" width="112" height="112"/>`
    : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<defs>${fonts}<clipPath id="${pitch}"><rect x="40" y="40" width="1000" height="1270" rx="40"/></clipPath><clipPath id="${portrait}"><circle cx="246" cy="246" r="146"/></clipPath></defs>`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${TONE.plate}"/>`,
    `<g clip-path="url(#${pitch})"><rect x="40" y="40" width="1000" height="1270" fill="${TONE.field}"/>${stripes}</g>`,
    `<circle cx="246" cy="246" r="150" fill="${TONE.fieldStripe}" stroke="${TONE.gold}" stroke-width="8"/>`,
    `<image href="${image(renderAvatar(player.avatar, age, clubDress(club)))}" x="96" y="80" width="300" height="330" clip-path="url(#${portrait})"/>`,
    crest,
    `<text x="440" y="${110 + nameSize * 0.85}" font-family="${DISPLAY}" font-size="${nameSize}" fill="${TONE.gold}">${escape(format(h.chronicle.poster.title, { name: player.name }))}</text>`,
    `<g font-family="${BODY}">`,
    `<text x="440" y="292" font-size="34" font-weight="600" fill="${TONE.heroInk}">${escape(format(h.chronicle.poster.subtitle, { position: c.positions[player.primaryPosition] ?? player.primaryPosition, nation }))}</text>`,
    `<text x="440" y="346" font-size="28" fill="${TONE.heroMuted}">${escape(stats)}</text>`,
    club
      ? `<text x="440" y="392" font-size="28" fill="${TONE.heroMuted}">${escape(club.name)}</text>`
      : '',
    discs,
    `<text x="96" y="${top}" font-size="26" font-weight="800" letter-spacing="4" fill="${TONE.gold}">${escape(h.chronicle.poster.highlights.toUpperCase())}</text>`,
    lines,
    `</g>`,
    `<text x="96" y="1262" font-family="${DISPLAY}" font-size="56" fill="${TONE.gold}">${escape(h.chronicle.poster.footer)}</text>`,
    `</svg>`,
  ].join('');
}

async function embedFont(url: string, family: string, descriptors: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('font');
  const buffer = await response.arrayBuffer();
  // Prove the bytes are a usable font before the poster relies on them.
  await new FontFace(`${family} poster`, buffer).load();
  const uri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('font'));
    reader.readAsDataURL(new Blob([buffer], { type: 'font/woff2' }));
  });
  return `@font-face{font-family:'${family}';${descriptors}src:url(${uri}) format('woff2')}`;
}

/**
 * The self-hosted Bebas Neue and Inter as data-URI font faces for the poster: an SVG drawn as
 * an image cannot reach the page's fonts. Both are already cached for offline play. Resolves
 * to an empty string if either cannot be loaded, and the poster uses system fonts.
 */
export async function posterFonts(): Promise<string> {
  try {
    const faces = await Promise.all([
      embedFont(bebasNeue, 'Bebas Neue', 'font-weight:400;'),
      embedFont(interVariable, 'Inter', 'font-weight:100 900;'),
    ]);
    return `<style>${faces.join('')}</style>`;
  } catch {
    return '';
  }
}

/** Draw the poster to a PNG. */
export async function posterPng(svg: string): Promise<Blob> {
  const picture = new Image();
  picture.src = image(svg);
  await picture.decode();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  context.drawImage(picture, 0, 0);
  // Some engines apply an SVG image's embedded fonts just after decoding: draw once more a
  // moment later so the export always carries them.
  await new Promise((resolve) => setTimeout(resolve, 60));
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(picture, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png'),
  );
}
