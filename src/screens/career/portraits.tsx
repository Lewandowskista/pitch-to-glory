import { useMemo } from 'react';
import type { Club, Crest, Player } from '../../model/domain';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
import { renderCrest } from '../../engine/assets/crest';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { Artwork } from '../../ui/Artwork';

// Kept apart from shared.tsx (which re-exports them), so the match screen draws portraits and
// crests without the career shell, its navigation and its copy.
/** A bust portrait in the club's home kit and crest, or the neutral shirt without a club. */
export function PlayerPortrait({
  player,
  age,
  club,
  className = '',
}: {
  player: Player;
  age: number;
  club?: Club | null;
  className?: string;
}) {
  const svg = useMemo(
    () => renderAvatar(player.avatar, age, clubDress(club)),
    [player.avatar, age, club],
  );
  return <Artwork svg={svg} alt={format(c.wizard.previewAlt, { age })} className={className} />;
}
export function CrestImage({
  crest,
  alt,
  className = '',
  founded,
}: {
  crest: Crest;
  alt: string;
  className?: string;
  /** Show the club's founding-year ribbon (large crests on club pages only). */
  founded?: number;
}) {
  const svg = useMemo(
    () => renderCrest(crest, founded === undefined ? {} : { founded }),
    [crest, founded],
  );
  return <Artwork svg={svg} alt={alt} className={className} />;
}
