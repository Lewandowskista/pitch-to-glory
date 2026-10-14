import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Icon } from './Icon';
import { Artwork } from './Artwork';

/**
 * The career player's portrait for the sidebar's save card, drawn from the loaded world. The
 * avatar renderer loads on demand (it is already in memory on career pages), so the app shell
 * itself never carries the art code. Falls back to the save icon without a career.
 */
export function ShellPortrait({ className = '' }: { className?: string }) {
  const player = useAppStore((s) =>
    s.world?.career ? s.world.players[s.world.career.playerId] : undefined,
  );
  const season = useAppStore((s) => s.world?.date.season ?? 0);
  const club = useAppStore((s) => {
    const id = s.world?.career ? s.world.players[s.world.career.playerId]?.clubId : null;
    return id ? s.world!.clubs[id] : undefined;
  });
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!player) {
      setSvg(null);
      return;
    }
    let current = true;
    void import('../engine/assets/avatar')
      .then(({ renderAvatar, clubDress }) => {
        if (current)
          setSvg(renderAvatar(player.avatar, season - player.birthSeason, clubDress(club), 'side'));
      })
      .catch(() => current && setSvg(null));
    return () => {
      current = false;
    };
  }, [player, season, club]);
  if (!player || !svg)
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center rounded-full bg-accent-soft text-accent ${className}`}
      >
        <Icon name="save" />
      </span>
    );
  return <Artwork svg={svg} alt="" className={`shrink-0 rounded-full ${className}`} />;
}
