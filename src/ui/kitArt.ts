import type { Crest, Kit } from '../model/domain';
import type { KitOptions } from '../engine/assets/kit';
import { t } from '../i18n';

/** Shirt artwork options: the club crest as the badge and the sponsor named by the kit. */
export function kitArt(kit: Kit, crest?: Crest): KitOptions {
  const sponsorName = t.art.sponsors[kit.sponsor];
  return { ...(crest ? { crest } : {}), ...(sponsorName ? { sponsorName } : {}) };
}
