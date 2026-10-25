import { useAppStore } from '../../store';
import { cancelWorldJob } from '../../workers/client';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { Button } from '../../ui/kit/Button';

// Kept apart from shared.tsx (which re-exports it), so the match screen carries only this.
/** Live progress of a world job with its cancel control. */
export function JobProgress() {
  const job = useAppStore((s) => s.worldJob);
  if (!job || job.type === 'commit-match') return null;
  const total = Math.max(1, job.totalWeeks);
  return (
    <section
      aria-label={c.hub.simulating}
      className="flex flex-wrap items-center gap-4 rounded-control border border-line bg-surface-soft p-4"
    >
      <div className="min-w-0 flex-1 basis-48">
        <strong className="block text-sm" role="status">
          {job.cancelling
            ? c.hub.cancelling
            : job.type === 'generate'
              ? c.wizard.building
              : job.type === 'create-career'
                ? c.wizard.signing
                : job.type === 'tournament'
                  ? c.hub.tournament.simulating
                  : c.hub.simulating}
        </strong>
        {job.totalWeeks > 1 && (
          <span className="text-xs text-muted">
            {format(c.hub.progress, { completed: job.completedWeeks, total: job.totalWeeks })}
          </span>
        )}
        <div
          role="progressbar"
          aria-label={c.hub.simulating}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(total, job.completedWeeks)}
          className="mt-2 h-2 overflow-hidden rounded-full bg-line"
        >
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.min(100, (job.completedWeeks / total) * 100)}%` }}
          />
        </div>
      </div>
      {job.type !== 'create-career' && (
        <Button variant="secondary" disabled={job.cancelling} onClick={cancelWorldJob}>
          {c.hub.cancel}
        </Button>
      )}
    </section>
  );
}
