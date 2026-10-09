import { useId, useMemo, useState } from 'react';
import type { AmbitionId, World } from '../../model/domain';
import { CONFIG } from '../../engine/config';
import {
  ambitionProgress,
  ambitionsFor,
  canChangeAmbitions,
  dreamClubs,
  setAmbitions,
} from '../../engine/career/honours/ambitions';
import { liveHallOfFame } from '../../engine/career/honours/retirement';
import { useAppStore } from '../../store';
import { format } from '../../i18n';
import { ambitionsText as a } from '../../i18n/ambitions';
import { ambitionName } from './ambitionText';
import { ordinal } from './honoursUi';
import { ui, useEditBlock } from './shared';
import { useUrlDialog } from './useUrlDialog';

const A = CONFIG.career.honours.ambitions;

/** Where the career stands in the Hall of Fame right now, and the next name to pass. */
function HallOfFameLine({ world }: { world: World }) {
  // Ranking reads every player the world remembers: once per world state.
  const standing = useMemo(() => liveHallOfFame(world), [world]);
  return (
    <div className="rounded-control bg-surface-soft px-3 py-2.5" data-testid="hall-of-fame-live">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">{a.hallOfFame.title}</span>
        {standing.score > 0 && (
          <span className="font-display text-xl leading-none tabular-nums">
            {format(a.hallOfFame.rank, {
              rank: ordinal(standing.rank),
              of: standing.of.toLocaleString('en'),
            })}
          </span>
        )}
      </p>
      <p className="mt-1 text-xs text-muted">
        {standing.score <= 0
          ? a.hallOfFame.unranked
          : standing.next
            ? format(a.hallOfFame.next, {
                points: Math.max(1, Math.ceil(standing.next.score - standing.score)),
                name: standing.next.name,
              })
            : a.hallOfFame.top}
      </p>
    </div>
  );
}

function AmbitionRow({ world, index }: { world: World; index: number }) {
  const ambition = world.career!.ambitions!.list[index]!;
  const club = ambition.clubId ? world.clubs[ambition.clubId]?.name : undefined;
  const name = ambitionName(ambition.id, { club });
  const progress = ambitionProgress(world, ambition);
  const done = Boolean(ambition.achieved);
  const percent = Math.round((done ? 1 : progress.share) * 100);
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">
          {done && (
            <span aria-hidden="true" className="mr-1 text-meter-gold">
              ★
            </span>
          )}
          {name}
        </span>
        <span className="shrink-0 text-xs font-semibold text-muted tabular-nums">
          {done
            ? format(a.achieved, { season: ambition.achieved!.season })
            : ambition.id === 'hall-of-fame'
              ? format(a.rank, { rank: ordinal(progress.value) })
              : progress.target === 1
                ? a.notYet
                : format(a.progress, { value: progress.value, target: progress.target })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <span
          className={`block h-full rounded-full ${done ? 'bg-meter-gold' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </li>
  );
}

/** Pick up to three ambitions (achieved ones stay), with a dream club when that is chosen. */
function AmbitionChooser({ world, onDone }: { world: World; onDone: () => void }) {
  const block = useEditBlock();
  const id = useId();
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const achieved = (career.ambitions?.list ?? []).filter((entry) => entry.achieved);
  const current = (career.ambitions?.list ?? []).filter((entry) => !entry.achieved);
  const [picked, setPicked] = useState<AmbitionId[]>(current.map((entry) => entry.id));
  const clubs = useMemo(() => dreamClubs(world), [world]);
  const [dream, setDream] = useState<string>(
    current.find((entry) => entry.id === 'dream-club')?.clubId ?? '',
  );
  const options = ambitionsFor(player.primaryPosition).filter(
    (option) => !achieved.some((entry) => entry.id === option),
  );
  const [error, setError] = useState<string | null>(null);
  const toggle = (option: AmbitionId) =>
    setPicked((list) =>
      list.includes(option)
        ? list.filter((entry) => entry !== option)
        : list.length < A.count
          ? [...list, option]
          : list,
    );
  const needsClub = picked.includes('dream-club') && !dream;
  const save = () => {
    const state = useAppStore.getState();
    if (!state.world || block) return;
    try {
      state.setWorld(setAmbitions(state.world, { ids: picked, dreamClubId: dream || null }));
      onDone();
    } catch {
      setError(a.dreamClubNeeded);
    }
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold">
          {format(a.legend, { count: A.count })}{' '}
          <span className="font-normal text-muted">
            · {format(a.picked, { count: picked.length, limit: A.count })}
          </span>
        </legend>
        {options.map((option) => {
          const checked = picked.includes(option);
          const full = !checked && picked.length >= A.count;
          return (
            <label
              key={option}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 text-sm hover:bg-surface-soft ${full ? 'opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={checked}
                disabled={full}
                onChange={() => toggle(option)}
              />
              {ambitionName(option, { club: option === 'dream-club' ? '…' : undefined })}
            </label>
          );
        })}
      </fieldset>
      {picked.includes('dream-club') && (
        <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor={`${id}-club`}>
          {a.dreamClub}
          <select
            id={`${id}-club`}
            className="min-h-11 w-full rounded-control border border-line bg-surface px-3 font-normal text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
            value={dream}
            onChange={(event) => setDream(event.target.value)}
          >
            <option value="">{a.dreamClubHint}</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {(error || needsClub) && (
        <p role="alert" className="text-sm text-danger">
          {a.dreamClubNeeded}
        </p>
      )}
      <p className={ui.muted}>{a.changeNote}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="button"
          disabled={Boolean(block) || needsClub || (!picked.length && !achieved.length)}
        >
          {a.save}
        </button>
        <button type="button" className="button secondary" onClick={onDone}>
          {a.cancel}
        </button>
      </div>
    </form>
  );
}

/**
 * The career's ambitions on the hub: the live Hall of Fame standing, each chosen ambition with
 * its progress, and the chooser (in the URL, so Back closes it).
 */
export function AmbitionsCard({ world }: { world: World }) {
  const career = world.career!;
  const list = career.ambitions?.list ?? [];
  const dialog = useUrlDialog('ambitions');
  const changeable = canChangeAmbitions(world);
  const choosing = dialog.value === 'choose' && changeable;
  return (
    <section
      id="ambitions"
      aria-labelledby="ambitions-heading"
      className={`${ui.panel} flex flex-col gap-3`}
    >
      <h2 id="ambitions-heading" className={ui.heading}>
        {a.title}
      </h2>
      <HallOfFameLine world={world} />
      {choosing ? (
        <AmbitionChooser world={world} onDone={dialog.close} />
      ) : (
        <>
          {list.length ? (
            <ul className="flex flex-col gap-3">
              {list.map((entry, index) => (
                <AmbitionRow key={entry.id} world={world} index={index} />
              ))}
            </ul>
          ) : (
            <p className={ui.muted}>{format(a.intro, { count: A.count })}</p>
          )}
          <p className="text-xs text-muted">
            {format(a.reward, { fame: A.reward.fame, xp: A.reward.xp })}
          </p>
          {changeable ? (
            <div>
              <button
                type="button"
                className={list.length ? 'button secondary' : 'button'}
                onClick={() => dialog.open('choose')}
              >
                {list.length ? a.change : a.choose}
              </button>
            </div>
          ) : (
            <p className={ui.muted}>{a.locked}</p>
          )}
        </>
      )}
    </section>
  );
}
