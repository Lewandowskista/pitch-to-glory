import type { AmbitionId } from '../../model/domain';
import { CONFIG } from '../../engine/config';
import { format } from '../../i18n';
import { ambitionsText } from '../../i18n/ambitions';

const A = CONFIG.career.honours.ambitions;
/** An ambition in words, e.g. "Score 150 career goals" or "Play for North London Cannons". */
export function ambitionName(
  id: AmbitionId,
  params: { club?: string | number; target?: string | number } = {},
): string {
  const targets = A.targets as Record<string, number>;
  return format(ambitionsText.names[id] ?? id, {
    target: params.target ?? targets[id] ?? '',
    club: params.club ?? '',
  });
}
