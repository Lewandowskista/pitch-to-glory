import { useId, useState } from 'react';
import type { World } from '../../model/domain';
import {
  benchHazard,
  canComeOff,
  demandTrust,
  motivateLift,
  onBench,
  ownMargin,
  requestableRoles,
  roleAgainstScore,
  roleRefusal,
  shootoutTally,
  type MatchCommand,
  type MatchSession,
} from '../../engine/match';
import { CONFIG } from '../../engine/config';
import { matchText as m, matchFormat } from '../../i18n/match';
import { careerText as c } from '../../i18n/career';
import { occasionsText as o } from '../../i18n/occasions';
import { plural } from '../../i18n/locale';
import { cx } from '../../ui/kit';
import { selectedSide, surname } from './cam';

/*
 * The occasions of a match-22 session on the match screen (release 1.0 step 5.4), loaded
 * apart from the live screen: the half-time talk with its trade-offs, the answer to being
 * substituted, the knock that asks "play on or come off", the bench, and over the pitch the
 * added-time board and the shootout. Every option says what it does, so the choice is the
 * player's to weigh.
 */
const O = CONFIG.match.occasions;
const roleName = (role: string) => (m.roles as Record<string, string>)[role] ?? role;
const percent = (value: number) => (value * 100).toFixed(value < 0.1 ? 1 : 0);
/** "45+2′", or "45′" outside added time. */
export const clockLabel = (minute: number, added?: number) =>
  added ? `${minute}+${added}′` : `${minute}′`;

/** What a match-22 session waits on, or shows, in the main column. */
export function OccasionPanels({
  session,
  world,
  simulationOnly,
  onCommand,
}: {
  session: MatchSession;
  world: World | null;
  simulationOnly: boolean;
  onCommand: (command: MatchCommand) => void;
}) {
  const s = session.state;
  return (
    <>
      {s.match.status === 'halftime' && (
        <HalfTimeTalk session={session} world={world} onCommand={onCommand} />
      )}
      {s.injuryDecisionPending && <KnockPanel session={session} onCommand={onCommand} />}
      {!s.injuryDecisionPending && s.knock && s.substituted && <KnockResult session={session} />}
      {s.substituted && !s.knock && <SubstitutionTalk session={session} onCommand={onCommand} />}
      {s.bench && s.match.status !== 'finished' && <BenchPanel session={session} />}
      {s.roleRequest && s.match.status === 'live' && s.match.minute <= 52 && (
        <RoleResult session={session} />
      )}
      {simulationOnly && s.penaltyShootout && <ShootoutBoard session={session} placement="panel" />}
    </>
  );
}

/** Over the live pitch: the added-time board as it goes up, and the shootout as it goes. */
export function PitchOccasions({ session }: { session: MatchSession }) {
  const s = session.state;
  const board = s.stoppage?.at(-1);
  const raised = board && board.minutes > 0 && board.at === s.match.minute && !s.added;
  return (
    <>
      {raised && !s.penaltyShootout && s.match.status === 'live' && (
        <div
          className="absolute right-3 top-3 z-10 grid justify-items-center rounded-control bg-night px-3 py-1.5 font-display text-night-ink shadow-surface motion-safe:animate-[match-board_0.5s_ease-out]"
          role="img"
          aria-label={plural(board.minutes, o.stoppage.board)}
          data-testid="added-time-board"
        >
          <span className="text-3xl leading-none text-gold">
            {matchFormat(o.stoppage.chip, { minutes: board.minutes })}
          </span>
        </div>
      )}
      {s.penaltyShootout && <ShootoutBoard session={session} placement="pitch" />}
    </>
  );
}

/** The shootout, five rounds and sudden death: each side's kicks as they are taken. */
export function ShootoutBoard({
  session,
  placement,
}: {
  session: MatchSession;
  placement: 'pitch' | 'panel';
}) {
  const { setup, state } = session;
  const shootout = state.penaltyShootout!;
  const { goals, taken } = shootoutTally(shootout.kicks);
  const rounds = Math.max(O.shootout.rounds, taken[0], taken[1]);
  const id = useId();
  const row = (side: 0 | 1) => {
    const club = side === 0 ? setup.home : setup.away;
    const kicks = shootout.kicks.filter((kick) => kick.side === side);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-14 shrink-0 truncate text-xs font-bold uppercase" title={club.name}>
          {club.name}
        </span>
        <ol className="flex flex-wrap gap-1" aria-label={club.name}>
          {Array.from({ length: rounds }, (_, index) => {
            const kick = kicks[index];
            const taker = kick ? setup.players[kick.takerId] : undefined;
            const mine =
              kick &&
              (kick.takerId === setup.selectedPlayerId || kick.keeperId === setup.selectedPlayerId);
            const result = !kick
              ? o.shootout.pending
              : kick.scored
                ? o.shootout.scored
                : o.shootout.missed;
            return (
              <li
                key={index}
                className={cx(
                  'grid h-5 w-5 place-items-center rounded-full border-2 text-[0.65rem] font-black',
                  !kick && 'border-night-line',
                  kick?.scored && 'border-mint bg-mint text-night',
                  kick && !kick.scored && 'border-card-red bg-card-red text-white',
                  mine && 'outline outline-2 outline-offset-1 outline-gold',
                )}
                aria-label={
                  kick
                    ? matchFormat(o.shootout.kick, {
                        kick: index + 1,
                        player: taker ? surname(taker.name) : '',
                        result,
                      })
                    : `${index + 1}: ${result}`
                }
                title={taker ? `${taker.name}: ${result}` : result}
              >
                <span aria-hidden="true">{!kick ? '' : kick.scored ? '✓' : '✕'}</span>
              </li>
            );
          })}
        </ol>
        <strong className="ml-auto font-display text-xl">{goals[side]}</strong>
      </div>
    );
  };
  return (
    <section
      className={cx(
        'grid gap-1.5 rounded-control bg-night/95 p-2.5 text-night-ink shadow-surface',
        placement === 'pitch'
          ? 'absolute inset-x-2 bottom-2 z-10 sm:inset-x-auto sm:right-3 sm:w-80'
          : 'match-panel',
      )}
      aria-labelledby={`${id}-title`}
      data-testid="shootout-board"
    >
      <h2
        id={`${id}-title`}
        className="flex items-center gap-2 text-xs font-bold uppercase text-mint"
      >
        {o.shootout.title}
        {Math.min(taken[0], taken[1]) >= O.shootout.rounds && (
          <span className="text-gold">· {o.shootout.suddenDeath}</span>
        )}
      </h2>
      <p className="sr-only" role="status" aria-live="polite">
        {matchFormat(o.shootout.tally, {
          home: setup.home.name,
          away: setup.away.name,
          homeGoals: goals[0],
          awayGoals: goals[1],
        })}
      </p>
      {row(0)}
      {row(1)}
    </section>
  );
}

/** Half-time (match-22): three answers, each with what it does in this match. */
function HalfTimeTalk({
  session,
  world,
  onCommand,
}: {
  session: MatchSession;
  world: World | null;
  onCommand: (command: MatchCommand) => void;
}) {
  const { setup, state } = session;
  const id = useId();
  const benched = onBench(state);
  const roles = benched ? [] : requestableRoles(session);
  const [role, setRole] = useState(roles[0] ?? '');
  const own = selectedSide(setup) === 0 ? setup.home : setup.away;
  const manager = world?.managers[world.clubs[own.id]?.managerId ?? ''];
  const T = O.touchline;
  const margin = ownMargin(session);
  const context = o.halftime.context[margin < 0 ? 'behind' : margin > 0 ? 'ahead' : 'level'];
  const lift = motivateLift(session).toFixed(1);
  const trust = setup.trust ?? 50;
  const refusal = role ? roleRefusal(session, role) : 0;
  const against = role ? roleAgainstScore(session, role) : false;
  const demand = demandTrust(state.stats.rating);
  const verdict =
    demand === T.demand.earned ? 'earned' : demand === T.demand.poor ? 'poor' : 'fair';
  const option = 'match-talk-option grid content-start gap-1.5 text-left';
  return (
    <section
      className="match-panel match-interrupt"
      aria-labelledby={`${id}-ht`}
      data-testid="halftime-talk"
    >
      <div className="match-interrupt-head">
        <div className="min-w-0">
          <p className="match-interrupt-meta">
            <span className="match-pill">{m.halftime}</span>
            {matchFormat(o.halftime.meta, {
              home: setup.home.name,
              away: setup.away.name,
              homeScore: state.match.score[0],
              awayScore: state.match.score[1],
            })}
            {manager ? ` · ${manager.name}` : ''}
          </p>
          <h2 id={`${id}-ht`} className="match-interrupt-title">
            {benched ? o.halftime.benchTitle : o.halftime.title}
          </h2>
        </div>
      </div>
      <div className="match-talk">
        <button
          type="button"
          className={cx(option, 'is-motivate')}
          onClick={() => onCommand({ type: 'halftime', response: 'motivate' })}
        >
          <strong>{benched ? o.halftime.lift : o.halftime.motivate}</strong>
          <span>
            {matchFormat(benched ? o.halftime.liftBody : o.halftime.motivateBody, {
              lift,
              context,
              odds: (margin > 0 ? T.motivate.oddsAhead : T.motivate.odds).toFixed(3),
              trust: T.motivate.trust,
            })}
          </span>
        </button>
        {!benched && roles.length > 0 && (
          <div className={cx(option, 'is-role')}>
            <strong>{o.halftime.role}</strong>
            <label className="grid gap-1 text-sm">
              <span>{o.halftime.roleLabel}</span>
              <select
                className="min-h-11 rounded-control border border-line bg-surface px-2 text-ink"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                data-testid="halftime-role"
              >
                {roles.map((entry) => (
                  <option key={entry} value={entry}>
                    {roleName(entry)}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {matchFormat(o.halftime.roleBody, {
                chance: percent(refusal),
                reasons: [
                  matchFormat(o.halftime.roleReasons.trust, { trust }),
                  ...(against ? [o.halftime.roleReasons.against] : []),
                ].join(', '),
              })}{' '}
              {matchFormat(o.halftime.roleRefused, { odds: T.role.refusedOdds.toFixed(2) })}
            </span>
            <button
              type="button"
              className="button secondary justify-self-start"
              onClick={() => onCommand({ type: 'halftime', response: 'role', role })}
            >
              {matchFormat(o.halftime.roleSubmit, { role: roleName(role) })}
            </button>
          </div>
        )}
        <button
          type="button"
          className={cx(option, 'is-complain')}
          onClick={() => onCommand({ type: 'halftime', response: 'complain' })}
        >
          <strong>{benched ? o.halftime.ask : o.halftime.demand}</strong>
          <span>
            {benched
              ? matchFormat(o.halftime.askBody, { trust: O.bench.askTrust })
              : matchFormat(o.halftime.demandBody, {
                  trust: demand,
                  rating: state.stats.rating.toFixed(1),
                  verdict: o.halftime.demandVerdict[verdict],
                })}
          </span>
        </button>
      </div>
      <p className="match-card-note">{o.halftime.note}</p>
    </section>
  );
}

/** After half-time: whether the manager granted the role asked for. */
function RoleResult({ session }: { session: MatchSession }) {
  const request = session.state.roleRequest!;
  return (
    <p className="notice match-notice" role="status" data-testid="role-result">
      {request.granted
        ? matchFormat(o.roleResult.granted, { role: roleName(request.role) })
        : matchFormat(o.roleResult.refused, {
            roll: percent(request.roll),
            chance: percent(request.refusal),
          })}
    </p>
  );
}

/** Substituted (match-22): accept for trust, or rally the side for momentum. */
function SubstitutionTalk({
  session,
  onCommand,
}: {
  session: MatchSession;
  onCommand: (command: MatchCommand) => void;
}) {
  const { setup, state } = session;
  const id = useId();
  const player = setup.players[setup.selectedPlayerId]!;
  const off = state.match.events.findLast(
    (event) => event.kind === 'substitution' && event.playerId === player.id,
  );
  const incoming = off?.receiverId ? setup.players[off.receiverId] : undefined;
  const T = O.touchline.substitution;
  return (
    <section
      className="match-panel match-interrupt"
      role="status"
      aria-labelledby={`${id}-sub`}
      data-testid="substitution-talk"
    >
      <div className="match-interrupt-head">
        <div className="min-w-0">
          <p className="match-interrupt-meta">
            {incoming
              ? matchFormat(m.ui.substitutionMetaOn, {
                  minute: off?.minute ?? state.match.minute,
                  name: surname(player.name),
                  incoming: surname(incoming.name),
                })
              : matchFormat(m.ui.substitutionMeta, {
                  minute: off?.minute ?? state.match.minute,
                  name: surname(player.name),
                })}
          </p>
          <h2 id={`${id}-sub`} className="match-interrupt-title">
            {m.substitution}
          </h2>
        </div>
      </div>
      {state.substitutionDecisionPending ? (
        <>
          <div className="match-talk">
            <button
              type="button"
              className="match-talk-option grid content-start gap-1.5 text-left"
              onClick={() => onCommand({ type: 'substitution', response: 'accept' })}
            >
              <strong>{o.substitution.accept}</strong>
              <span>{matchFormat(o.substitution.acceptBody, { trust: T.acceptTrust })}</span>
            </button>
            <button
              type="button"
              className="match-talk-option grid content-start gap-1.5 text-left"
              onClick={() => onCommand({ type: 'substitution', response: 'encourage' })}
            >
              <strong>{o.substitution.rally}</strong>
              <span>{matchFormat(o.substitution.rallyBody, { momentum: T.momentum })}</span>
            </button>
          </div>
          <p className="match-card-note">{o.substitution.note}</p>
        </>
      ) : (
        <p className="match-card-note">{m.ui.substitutionNote}</p>
      )}
    </section>
  );
}

const injuryName = (kind: string) => c.injuries[kind as keyof typeof c.injuries] ?? kind;

/** A knock (match-22): play on, at a cost and a risk, or come off unhurt. */
function KnockPanel({
  session,
  onCommand,
}: {
  session: MatchSession;
  onCommand: (command: MatchCommand) => void;
}) {
  const { state } = session;
  const id = useId();
  const knock = state.knock!;
  const leave = canComeOff(session);
  const P = O.injuries.playOn;
  return (
    <section
      className="match-panel match-interrupt"
      aria-labelledby={`${id}-knock`}
      data-testid="injury-decision"
    >
      <div className="match-interrupt-head">
        <span className="match-card-chip is-large bg-danger" aria-hidden="true" />
        <div className="min-w-0">
          <p className="match-interrupt-meta">
            {matchFormat(o.injury.meta, {
              minute: clockLabel(knock.minute, knock.addedTime),
              kind: injuryName(knock.kind),
            })}
          </p>
          <h2 id={`${id}-knock`} className="match-interrupt-title">
            {o.injury.title}
          </h2>
        </div>
      </div>
      <p>{o.injury.body}</p>
      <div className="match-talk">
        <button
          type="button"
          className="match-talk-option grid content-start gap-1.5 text-left"
          onClick={() => onCommand({ type: 'injury', response: 'play-on' })}
        >
          <strong>{o.injury.playOn}</strong>
          <span>
            {matchFormat(o.injury.playOnBody, {
              fatigue: P.fatigue,
              chance: percent(P.aggravate),
              kind: injuryName(knock.kind),
            })}
          </span>
        </button>
        <button
          type="button"
          className="match-talk-option grid content-start gap-1.5 text-left"
          disabled={!leave}
          onClick={() => onCommand({ type: 'injury', response: 'off' })}
        >
          <strong>{o.injury.off}</strong>
          <span>{leave ? o.injury.offBody : o.injury.noChange}</span>
        </button>
      </div>
    </section>
  );
}

/** The knock's outcome once the player is off: injured, or off as a precaution. */
function KnockResult({ session }: { session: MatchSession }) {
  const knock = session.state.knock!;
  const id = useId();
  const injured = knock.serious || knock.aggravated;
  return (
    <section
      className="match-panel match-interrupt"
      role="status"
      aria-labelledby={`${id}-hurt`}
      data-testid="injury-result"
    >
      <h2 id={`${id}-hurt`} className="match-interrupt-title">
        {injured
          ? matchFormat(o.injury.injuredTitle, { kind: injuryName(knock.kind) })
          : o.injury.cameOff}
      </h2>
      {injured && <p>{o.injury.injuredBody}</p>}
    </section>
  );
}

/** On the bench (match-22): warming up, the manager's chance this minute, and coming on. */
function BenchPanel({ session }: { session: MatchSession }) {
  const { setup, state } = session;
  const id = useId();
  const on = state.bench?.on;
  const B = O.bench;
  const keeper = setup.players[setup.selectedPlayerId]!.primaryPosition === 'GK';
  if (on !== undefined) {
    // Shown for the minutes after coming on.
    if (state.match.minute > on + 3 || state.match.minute < on) return null;
    const sub = state.match.events.find(
      (event) => event.kind === 'substitution' && event.receiverId === setup.selectedPlayerId,
    );
    const replaced = sub?.playerId ? setup.players[sub.playerId] : undefined;
    return (
      <section
        className="match-panel match-interrupt"
        role="status"
        aria-labelledby={`${id}-on`}
        data-testid="bench-on"
      >
        <h2 id={`${id}-on`} className="match-interrupt-title">
          {matchFormat(o.bench.on, {
            minute: clockLabel(on),
            name: replaced ? surname(replaced.name) : '',
          })}
        </h2>
        <p>{plural(state.momentMinutes.length, o.bench.onBody)}</p>
      </section>
    );
  }
  const warming = state.match.minute >= B.warmFrom;
  const hazard = benchHazard(session);
  return (
    <section
      className="match-panel match-interrupt"
      role="status"
      aria-labelledby={`${id}-bench`}
      data-testid="bench-panel"
    >
      <div className="match-interrupt-head">
        <div className="min-w-0">
          <p className="match-interrupt-meta">
            <span className="match-pill">{warming ? o.bench.warming : o.bench.waiting}</span>
            {matchFormat(o.bench.meta, {
              role: o.bench.roles[setup.bench?.role ?? 'rotation'],
              from: B.from,
            })}
          </p>
          <h2 id={`${id}-bench`} className="match-interrupt-title">
            {o.bench.title}
          </h2>
        </div>
      </div>
      <p className="match-card-note">
        {keeper
          ? o.bench.keeper
          : hazard > 0
            ? matchFormat(o.bench.chance, { chance: percent(hazard) })
            : o.bench.chanceNone}
      </p>
      {state.bench?.asked && <p className="match-card-note">{o.bench.asked}</p>}
    </section>
  );
}
