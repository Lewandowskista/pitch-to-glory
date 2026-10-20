import { useMemo } from 'react';
import type { Fixture, World } from '../../model/domain';
import { matchPlan, type MatchPlan } from '../../engine/career/brief';
import { renderAvatar } from '../../engine/assets/avatar';
import { Artwork } from '../../ui/Artwork';
import { format } from '../../i18n';
import { briefText as b } from '../../i18n/brief';
import { cx } from '../../ui/kit';

/** The plan in words: the bold role line, the instruction, and the closing note (if any). */
export function planText(plan: MatchPlan): { headline: string; instruction: string; note: string } {
  const where = b.where[plan.position];
  const params = {
    opponent: plan.params.opponent,
    side: plan.params.side ? b.sides[plan.params.side] : '',
    target: plan.params.target ?? b.fallback.target[plan.group],
    danger: plan.params.danger ?? b.fallback.danger,
  };
  return {
    headline: format(b.roles[plan.role], { where }),
    instruction: format(b.plans[plan.key] ?? '', params),
    note: plan.note ? format(b.notes[plan.note], params) : '',
  };
}

/**
 * The manager's plan on the next-match hero: their portrait, where they expect to play you,
 * and what they want from you in this fixture. Read from the world as it stands, so it
 * follows selection and the opponent's eleven through the week.
 */
export function ManagerPlan({
  world,
  fixture,
  className,
}: {
  world: World;
  fixture: Fixture;
  className?: string;
}) {
  const plan = useMemo(() => matchPlan(world, fixture), [world, fixture]);
  const manager = plan ? world.managers[plan.managerId] : undefined;
  const portrait = useMemo(
    () => (manager ? renderAvatar(manager.avatar, manager.age, {}, 'plan') : null),
    [manager],
  );
  if (!plan) return null;
  const text = planText(plan);
  return (
    <div
      className={cx('flex items-center gap-3 rounded-control bg-black/25 px-4 py-3', className)}
      data-testid="manager-plan"
    >
      {portrait && manager && (
        <Artwork
          svg={portrait}
          alt={manager.name}
          className="h-11 w-11 shrink-0 rounded-full bg-[rgb(255_247_228/0.14)]"
        />
      )}
      <div className="min-w-0">
        <p className="font-bold">{text.headline}</p>
        <p className="text-[0.8125rem] text-hero-muted">
          {[text.instruction, text.note].filter(Boolean).join(' ')}
        </p>
      </div>
    </div>
  );
}
