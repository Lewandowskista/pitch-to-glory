import type { TrainingFocus } from '../../model/domain';
import { format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';

/** A training focus in the player's words: a group, a single attribute, a position or recovery. */
export function focusLabel(focus: TrainingFocus): string {
  if (focus === 'recovery') return c.training.recovery;
  if (focus.startsWith('position:'))
    return format(c.training.positionFocus, {
      position: c.positions[focus.slice('position:'.length) as keyof typeof c.positions] ?? focus,
    });
  return (
    c.training.groupNames[focus as keyof typeof c.training.groupNames] ??
    t.world.attributes[focus as keyof typeof t.world.attributes] ??
    focus
  );
}
