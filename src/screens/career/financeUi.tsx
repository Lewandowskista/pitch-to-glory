import { CONFIG } from '../../engine/config';
import { format, t } from '../../i18n';

/** A club under financial strain (review phase 4) and what it means, in numbers. */
export function StrainNote({
  strain,
  className = 'mb-2',
}: {
  strain: 'stretched' | 'debt';
  className?: string;
}) {
  const E = CONFIG.world.background.economy;
  return (
    <p className={`rounded-control bg-danger-soft px-3 py-2 text-sm ${className}`} role="note">
      <strong>{t.world.strain[strain]}.</strong>{' '}
      {format(t.world.strainEffects[strain], {
        cut: E.renewalCut[strain],
        wage: Math.round(E.renewalWage[strain] * 100),
        support: Math.round(E.support[strain] * 100),
      })}
    </p>
  );
}
