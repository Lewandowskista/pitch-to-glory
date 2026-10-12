import { motion, useReducedMotion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import type { World } from '../../model/domain';
import { seasonReview, type ReviewLine } from '../../engine/career/review';
import { useAppStore } from '../../store';
import { format } from '../../i18n';
import { reviewText as r } from '../../i18n/review';
import { honoursText as h } from '../../i18n/honours';
import { ambitionName } from './ambitionText';
import { competitionName } from './selectors';
import { ordinal } from './honoursUi';
import { withSave } from './agenda';
import { ui } from './shared';

const STATS: (keyof ReviewLine)[] = ['apps', 'goals', 'assists', 'cleanSheets', 'rating'];

function Change({ now, before, stat }: { now: number; before: number; stat: keyof ReviewLine }) {
  const delta =
    Math.round((now - before) * (stat === 'rating' ? 100 : 1)) / (stat === 'rating' ? 100 : 1);
  if (!delta) return null;
  return (
    <span className={`text-xs font-semibold ${delta > 0 ? 'text-accent' : 'text-danger'}`}>
      {format(r.change, {
        sign: delta > 0 ? '+' : '−',
        value: Math.abs(delta).toFixed(stat === 'rating' ? 2 : 0),
      })}
    </span>
  );
}

/**
 * The season just completed, on the hub until the next one starts: a grade and its verdict,
 * the club's title, promotion or relegation, the player's numbers against last season, the
 * honours, the rival's verdict and the ambitions reached.
 */
export function SeasonReviewPanel({ world, className = '' }: { world: World; className?: string }) {
  const review = seasonReview(world);
  const systemReduced = useReducedMotion();
  const reduced = useAppStore((s) => s.settings.reducedMotion) || Boolean(systemReduced);
  const [params] = useSearchParams();
  if (!review) return null;
  const club = world.clubs[review.clubId]!;
  const back = ['GK', 'CB', 'LB', 'RB', 'DM'].includes(
    world.players[world.career!.playerId]!.primaryPosition,
  );
  const stats = STATS.filter((stat) => (back ? stat !== 'assists' : stat !== 'cleanSheets'));
  const celebrate = review.outcome === 'champions' || review.outcome === 'promoted';
  const leagueParams = review.league
    ? {
        club: club.name,
        league: review.league.name,
        rank: ordinal(review.league.rank),
        of: review.league.of,
      }
    : null;
  return (
    <section
      aria-labelledby="season-review-heading"
      className={`${ui.panel} flex flex-col gap-5 ${className}`}
      data-testid="season-review"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={ui.eyebrow}>{format(r.eyebrow, { season: review.season })}</p>
          <h2 id="season-review-heading" className={`${ui.heading} mt-1`}>
            {r.verdicts[review.grade]}
          </h2>
          {leagueParams && (
            <p className="mt-2 text-sm">
              {review.outcome
                ? format(r.outcomeBody[review.outcome], leagueParams)
                : format(r.finish, leagueParams)}
            </p>
          )}
        </div>
        <motion.div
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gold text-on-gold shadow-surface"
          role="img"
          aria-label={format(r.gradeLabel, { grade: review.grade })}
        >
          <span className="font-display text-4xl leading-none">{review.grade}</span>
        </motion.div>
      </div>
      {review.outcome && (
        <motion.p
          initial={reduced || !celebrate ? false : { y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className={`rounded-control px-4 py-3 font-display text-3xl leading-none ${
            celebrate ? 'bg-accent text-on-accent' : 'bg-danger-soft text-danger'
          }`}
        >
          {r.outcomes[review.outcome]}
        </motion.p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat} className="rounded-control bg-surface-soft px-3 py-2.5">
            <p className="text-xs font-semibold text-muted">{r.stats[stat]}</p>
            <p className="font-display text-3xl leading-none tabular-nums">
              {stat === 'rating'
                ? review.line.rating
                  ? review.line.rating.toFixed(2)
                  : '–'
                : review.line[stat]}
            </p>
            {review.previous && (
              <Change now={review.line[stat]} before={review.previous[stat]} stat={stat} />
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">
        {format(r.share, { percent: Math.round(review.share * 100) })}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold">{r.honours}</h3>
          {review.trophies.length || review.awards.length ? (
            <ul className="mt-1 grid gap-1 text-sm">
              {review.trophies.map((trophy) => (
                <li key={trophy.id}>
                  <span aria-hidden="true">🏆 </span>
                  {trophy.name ?? competitionName(world, trophy.competitionId)}
                </li>
              ))}
              {review.awards.map((award) => (
                <li key={award.id}>
                  <span aria-hidden="true">★ </span>
                  {h.awards.kinds[award.kind as keyof typeof h.awards.kinds] ?? award.kind}
                  {award.month ? ` (${format(h.awards.monthLabel, { month: award.month })})` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">{r.noHonours}</p>
          )}
          {review.ambitions.length > 0 && (
            <>
              <h3 className="mt-3 text-sm font-bold">{r.ambitions}</h3>
              <ul className="mt-1 grid gap-1 text-sm">
                {review.ambitions.map((id) => {
                  const ambition = world.career!.ambitions!.list.find((a) => a.id === id)!;
                  return (
                    <li key={id}>
                      <span aria-hidden="true">★ </span>
                      {ambitionName(id, {
                        club: ambition.clubId ? world.clubs[ambition.clubId]?.name : undefined,
                      })}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        {review.rival && (
          <div>
            <h3 className="text-sm font-bold">{format(r.rival, { rival: review.rival.name })}</h3>
            <p className="mt-1 text-sm">
              {format(
                review.rival.goals === review.rival.rivalGoals
                  ? r.rivalLevel
                  : review.rival.goals > review.rival.rivalGoals
                    ? r.rivalAhead
                    : r.rivalBehind,
                {
                  rival: review.rival.name,
                  goals: review.rival.goals,
                  rivalGoals: review.rival.rivalGoals,
                  rating: review.rival.rating.toFixed(2),
                  rivalRating: review.rival.rivalRating.toFixed(2),
                },
              )}
            </p>
          </div>
        )}
      </div>
      <div className={ui.actions}>
        <Link className="button secondary" to={withSave('/career/chronicle', params.get('save'))}>
          {r.chronicle}
        </Link>
        <Link
          className="text-sm font-semibold underline underline-offset-4"
          to={withSave('/career/trophies', params.get('save'))}
        >
          {r.cabinet}
        </Link>
      </div>
    </section>
  );
}
