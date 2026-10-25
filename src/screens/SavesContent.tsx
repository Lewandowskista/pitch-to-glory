import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SlotId, World } from '../model/domain';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store';
import { saves } from '../persistence/runtime';
import {
  autosave,
  deleteSlot,
  errorCode,
  exportBackupGeneration,
  exportSlotBackup,
  exportSlotRecovery,
  exportUnsavedCopy,
  importSlot,
  loadSlot,
  restoreSlot,
  saveSlot,
} from '../persistence/session';
import type { SlotListing } from '../persistence/localRepository';
import type { BackupInfo, BackupKind, BackupListing, BackupSkip } from '../persistence/backups';
import { formatDate, formatInteger } from '../i18n/locale';
import { backupFileName, backupType, recoveryFileName } from '../persistence/files';
import type { BackupFile } from '../persistence/backup';
import { summaryPortrait, type CareerSummary } from '../persistence/summary';
import { platform } from '../platform';
import { track } from '../analytics';
import { errorText, format, t } from '../i18n';
import { Icon, type IconName } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
import { Dialog } from '../ui/Dialog';
import { Button, ButtonLink, CardTitle, Chip, Panel, StatusLine, buttonClass, cx } from '../ui/kit';
import { generateGallery } from '../engine/assets/gallery';
import { renderCrest } from '../engine/assets/crest';
import { clubDress, renderAvatar } from '../engine/assets/avatar';
import { ART } from '../engine/assets/shared';

/** A restore whose backup did not pass its checks: the slot still will not open. */
class RestoreFailed extends Error {
  constructor(readonly slot: SlotId) {
    super('invalid');
  }
}
type Ready = Extract<SlotListing, { status: 'ready' }>;
type Damaged = Extract<SlotListing, { status: 'error' }>;
const KINDS: readonly BackupKind[] = ['season', 'day', 'salvage'];
const backupDate = (iso: string) => formatDate(iso, { dateStyle: 'medium', timeStyle: 'short' });
/** A backup in words: when in the game (`when`), and what and when on the device (`detail`). */
function describeBackup(backup: BackupInfo) {
  return {
    when:
      backup.season === null
        ? backupDate(backup.takenAt)
        : format(t.saves.backupWhen, { season: backup.season, week: backup.week ?? 1 }),
    detail: format(t.saves.backupDetail, {
      kind: t.saves.backupKinds[backup.kind],
      date: backupDate(backup.takenAt),
    }),
  };
}
/** What the per-slot buttons need from the screen. */
interface SlotActions {
  blocked: boolean;
  nameMissing: boolean;
  saveLabel: string;
  replaceLabel: string;
  load: (slot: SlotId) => void;
  store: (slot: SlotId, occupied: boolean) => void;
  exportSlot: (slot: SlotId) => void;
  /** Download a slot's stored records unchecked, for a slot that will not load. */
  exportRecovery: (slot: SlotId) => void;
  /** Restore a slot that will not load from one of its automatic backups (after confirming). */
  restore: (slot: SlotId, backup: BackupKind) => void;
  /** Download one automatic backup as a file. */
  exportGeneration: (slot: SlotId, backup: BackupInfo) => void;
  importFile: (file: File | undefined, slot: SlotId) => void;
  remove: (slot: SlotId) => void;
}

/** The save slots: loaded as its own chunk, with the save system, after the page heading. */
export default function SavesContent() {
  const active = useAppStore((s) => s.activeSave);
  // What is loaded, as plain values: the page does not re-render for every change to the world.
  const current = useAppStore(useShallow(currentContent));
  const worldJob = useAppStore((s) => s.worldJob);
  const replaceLabel =
    current.kind === 'career'
      ? t.saves.replaceCareer
      : current.kind === 'world'
        ? t.saves.replaceWorld
        : t.saves.replace;
  const saveLabel =
    current.kind === 'career'
      ? t.saves.saveCareer
      : current.kind === 'world'
        ? t.saves.saveWorld
        : t.saves.save;
  const content =
    current.kind === 'career'
      ? t.saves.careerContent
      : current.kind === 'world'
        ? t.saves.worldContent
        : t.saves.galleryContent;
  const [collections, setCollections] = useState<SlotListing[] | null>(null);
  // The automatic backups and the storage estimate, read again whenever the slots change.
  const [backups, setBackups] = useState<BackupListing | null>(null);
  // The last action failed because storage is full: the alert offers an export.
  const [full, setFull] = useState(false);
  const [name, setName] = useState<string>(t.saves.defaultName);
  const [busy, setBusy] = useState(false);
  const blocked = busy || !collections || Boolean(worldJob);
  const [error, setError] = useState('');
  // The slot whose load or export just failed its checks: the alert offers a recovery copy.
  const [unreadable, setUnreadable] = useState<SlotId | null>(null);
  const [notice, setNotice] = useState('');
  const [protection, setProtection] = useState<'granted' | 'refused' | null>(null);
  // A picked backup file awaiting confirmation; read only by the persistence worker.
  const [pending, setPending] = useState<Blob | null>(null);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const opened = useRef(false);
  const [reviewed, setReviewed] = useState<{
    slot: SlotId;
    revision: number | null;
    name: string;
  } | null>(null);
  const action = params.get('action');
  const slot = Number(params.get('slot'));
  const valid = [1, 2, 3].includes(slot);
  // The backup a restore confirmation is about, while it is still kept.
  const restoring =
    action === 'restore'
      ? backups?.backups.find(
          (backup) => backup.slot === slot && backup.kind === params.get('backup'),
        )
      : undefined;
  const close = () => {
    setPending(null);
    if (opened.current) {
      opened.current = false;
      navigate(-1);
    } else setParams({}, { replace: true });
  };
  useEffect(() => {
    let current = true;
    void platform.isStoragePersistent().then((persistent) => {
      if (current && persistent) setProtection('granted');
    });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    // The list follows every committed change, from this tab or another.
    return saves.watch(setCollections, () => setError(t.errors.storage));
  }, []);
  useEffect(() => {
    if (!collections) return;
    let current = true;
    saves
      .backups()
      .then((listing) => {
        if (current) setBackups(listing);
      })
      // Backups are a safety net: without their list the slots work as before.
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [collections]);
  useEffect(() => {
    if (valid && action && collections && !reviewed) {
      const current = collections[slot - 1];
      setReviewed({
        slot: slot as SlotId,
        revision: current && current.status !== 'empty' ? current.revision : null,
        name: (current && current.status !== 'empty' ? current.name : null) ?? t.saves.unsaved,
      });
    }
    if (!action && reviewed) setReviewed(null);
  }, [valid, action, collections, reviewed, slot]);
  /** `large`: what a too-large error means for this action (an export's differs from a file's). */
  const run = async (operation: () => Promise<void>, target?: SlotId, large?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    setUnreadable(null);
    setFull(false);
    try {
      await operation();
    } catch (error) {
      const code = errorCode(error);
      if (error instanceof RestoreFailed) {
        setError(t.saves.restoreFailed);
        setUnreadable(error.slot);
      }
      // A stored slot that fails its checks is not a bad file: say so, and offer what still works.
      else if (target && code === 'invalid') {
        const restorable = backups?.backups.some((backup) => backup.slot === target);
        setError(
          format(restorable ? t.saves.unreadableBackup : t.saves.unreadable, { slot: target }),
        );
        setUnreadable(target);
      } else {
        setError(code === 'large' && large ? large : errorText(code));
        // Storage is full (step 4.6): keep what is open in a file before freeing space.
        setFull(code === 'quota');
      }
    } finally {
      setBusy(false);
    }
  };
  /** Download a backup; one that nears the import limit says so, without stopping. */
  const download = async (backup: BackupFile, name: string, done: string) => {
    await platform.saveFile(name, backup.file, backupType(backup.compressed));
    setNotice(
      backup.nearLimit
        ? `${done} ${format(t.saves.exportNearLimit, { size: Math.round(backup.bytes / 2 ** 20) })}`
        : done,
    );
  };
  const exportRecovery = (target: SlotId) =>
    void run(
      async () => {
        const backup = await exportSlotRecovery(target);
        await download(
          backup,
          recoveryFileName(`slot-${target}`, backup.compressed),
          t.saves.recoveryExported,
        );
      },
      undefined,
      t.saves.exportLarge,
    );
  const open = async (action: string, slot: SlotId, extra: Record<string, string> = {}) => {
    // Settle this tab's pending edits before pinning what the player reviews.
    await autosave.flush();
    const current = (await saves.list())[slot - 1];
    setReviewed({
      slot,
      revision: current && current.status !== 'empty' ? current.revision : null,
      name: (current && current.status !== 'empty' ? current.name : null) ?? t.saves.unsaved,
    });
    opened.current = true;
    setParams({ action, slot: String(slot), ...extra });
  };
  const importFile = async (file: File | undefined, target: SlotId) => {
    if (!file) return;
    await run(async () => {
      // Plain JSON or gzip: the persistence worker reads and checks it, not this thread.
      const backup = await platform.readFileBlob(file);
      await saves.validateFile(backup);
      const listing = collections?.[target - 1];
      // Ask before replacing an occupied (or unreadable) slot; an empty one imports directly.
      if (listing && listing.status !== 'empty') {
        setPending(backup);
        await open('import', target);
      } else {
        if (await importSlot(target, backup, null)) setNotice(t.saves.imported);
      }
    });
  };
  const confirm = () =>
    void run(async () => {
      if (!reviewed) return;
      const target = reviewed.slot;
      if (action === 'delete') {
        if (!(await deleteSlot(target, reviewed.revision))) return;
        setNotice(t.saves.deleted);
      } else if (action === 'replace') {
        if (!(await saveSlot(target, name.trim(), reviewed.revision))) return;
        setNotice(t.saves.created);
      } else if (action === 'import' && pending) {
        if (!(await importSlot(target, pending, reviewed.revision))) return;
        setNotice(t.saves.imported);
      } else if (action === 'restore' && restoring) {
        try {
          if (!(await restoreSlot(target, restoring.kind, reviewed.revision))) return;
        } catch (error) {
          if (errorCode(error) !== 'invalid') throw error;
          // The backup did not pass the checks either: back to the slot's other choices.
          close();
          throw new RestoreFailed(target);
        }
        setNotice(t.saves.restored);
      }
      close();
    });
  const actions: SlotActions = {
    blocked,
    nameMissing: !name.trim(),
    saveLabel,
    replaceLabel,
    load: (target) =>
      void run(async () => {
        if (await loadSlot(target)) setNotice(t.saves.loaded);
      }, target),
    store: (target, occupied) => {
      if (occupied) void run(() => open('replace', target));
      else
        void run(async () => {
          if (await saveSlot(target, name.trim(), null)) setNotice(t.saves.created);
        });
    },
    exportSlot: (target) =>
      void run(
        async () => {
          const backup = await exportSlotBackup(target);
          await download(
            backup,
            backupFileName(`slot-${target}`, backup.compressed),
            t.saves.exported,
          );
          track('export_done', { what: 'save' });
        },
        target,
        t.saves.exportLarge,
      ),
    exportRecovery,
    restore: (target, backup) => void run(() => open('restore', target, { backup })),
    exportGeneration: (target, backup) =>
      void run(
        async () => {
          const file = await exportBackupGeneration(target, backup.kind);
          await download(
            file,
            recoveryFileName(`slot-${target}-${backup.kind}-backup`, file.compressed),
            t.saves.backupDownloaded,
          );
        },
        undefined,
        t.saves.exportLarge,
      ),
    importFile: (file, target) => void importFile(file, target),
    remove: (target) => void run(() => open('delete', target)),
  };
  const actionTitle =
    action === 'delete'
      ? t.saves.deleteTitle
      : action === 'import'
        ? t.saves.importTitle
        : action === 'restore'
          ? t.saves.restoreTitle
          : t.saves.replaceTitle;
  // A slot that cannot be opened: its confirmations point to the recovery copy first.
  const reviewedDamaged =
    reviewed !== null &&
    (collections?.[reviewed.slot - 1]?.status === 'error' || action === 'restore') &&
    action !== 'import';
  const actionBody =
    action === 'delete'
      ? reviewedDamaged
        ? t.saves.deleteDamagedBody
        : t.saves.deleteBody
      : action === 'import'
        ? t.saves.importBody
        : action === 'restore'
          ? t.saves.restoreBody
          : reviewedDamaged
            ? t.saves.replaceDamagedBody
            : t.saves.replaceBody;
  const storage = backups?.storage;
  return (
    <div className="flex max-w-[77.5rem] flex-col gap-5">
      {/* What a save button stores, and the name it is stored under. */}
      <Panel
        aria-labelledby="save-current-heading"
        className="flex flex-wrap items-center gap-x-7 gap-y-4.5"
      >
        <div className="flex min-w-0 flex-[1_1_20rem] items-center gap-4">
          <CurrentArt />
          <div className="save-current-copy min-w-0">
            <CardTitle id="save-current-heading">{t.saves.current}</CardTitle>
            <p className="mt-1 text-muted">
              {current.kind === 'career'
                ? format(t.saves.currentCareer, { name: current.name })
                : current.kind === 'world'
                  ? format(t.saves.currentWorld, {
                      season: current.season,
                      week: current.week,
                    })
                  : t.saves.currentGallery}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1">
          <label htmlFor="collection-name" className="text-[0.8125rem] font-bold">
            {t.saves.name}
          </label>
          <input
            id="collection-name"
            className="w-full font-semibold"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            required
            aria-invalid={!name.trim() || undefined}
            aria-describedby="collection-name-hint"
          />
          <small id="collection-name-hint" className="text-xs text-muted">
            {t.saves.nameHint}
          </small>
        </div>
      </Panel>
      {worldJob && <StatusLine tone="warning">{t.errors.busy}</StatusLine>}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 rounded-control border border-danger bg-danger-soft px-3.5 py-1 text-[0.8125rem] font-semibold text-danger"
        >
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-[1_1_15rem] py-2.5">{error}</span>
          {unreadable && (
            <Button
              variant="text"
              className="text-danger"
              disabled={blocked}
              onClick={() => exportRecovery(unreadable)}
            >
              {t.saves.exportRecovery}
            </Button>
          )}
          {full && active && (
            <Button
              variant="text"
              className="text-danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const copy = await exportUnsavedCopy();
                  if (copy) await download(copy.backup, copy.name, t.saves.exported);
                })
              }
            >
              {t.app.exportUnsaved}
            </Button>
          )}
          <Button
            variant="text"
            className="text-danger"
            onClick={() => void run(async () => setCollections(await saves.list()))}
          >
            {t.app.retry}
          </Button>
        </div>
      )}
      <StatusLine tone="success" className="notice mt-0 self-start">
        {notice}
      </StatusLine>
      <div
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-stretch gap-5"
        aria-busy={!collections}
      >
        {([1, 2, 3] as const).map((target) => (
          <SlotCard
            key={target}
            target={target}
            listing={collections ? (collections[target - 1] ?? null) : undefined}
            current={active?.slot === target}
            failed={unreadable === target}
            backups={backups?.backups.filter((backup) => backup.slot === target) ?? []}
            skipped={backups?.skipped.find((skip) => skip.slot === target)}
            actions={actions}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        {active && (
          <ButtonLink
            variant="secondary"
            iconEnd="arrow"
            to={
              current.kind === 'career'
                ? '/career'
                : current.kind === 'world'
                  ? '/world'
                  : '/gallery'
            }
          >
            {current.kind === 'career'
              ? format(t.menu.continueCareer, { name: current.name })
              : current.kind === 'world'
                ? t.saves.loadWorld
                : t.saves.loadGallery}
          </ButtonLink>
        )}
        <Panel
          tone="blue"
          aria-labelledby="protect-heading"
          className="flex flex-[1_1_32rem] flex-wrap items-center gap-x-5 gap-y-3.5"
        >
          <span
            aria-hidden="true"
            className="grid h-13 w-13 shrink-0 place-items-center rounded-control bg-surface text-info"
          >
            <ShieldGlyph />
          </span>
          <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
            <CardTitle id="protect-heading" size="sm">
              {t.saves.protectTitle}
            </CardTitle>
            <p>{t.saves.protectBody}</p>
            {storage && (
              <p className="text-[0.8125rem] text-muted">
                {format(t.saves.storageUse, {
                  used: formatInteger(Math.max(1, Math.round(storage.usage / 2 ** 20))),
                  quota: formatInteger(Math.round(storage.quota / 2 ** 20)),
                })}
              </p>
            )}
            <StatusLine
              tone={protection === 'granted' ? 'success' : 'warning'}
              className="mt-1.5 self-start"
            >
              {protection === 'granted'
                ? t.saves.protected
                : protection === 'refused'
                  ? t.saves.notProtected
                  : ''}
            </StatusLine>
          </div>
          {protection !== 'granted' && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setProtection(
                    (await platform.requestPersistentStorage()) ? 'granted' : 'refused',
                  ),
                )
              }
            >
              {t.saves.protect}
            </Button>
          )}
        </Panel>
      </div>
      {valid &&
        ['delete', 'replace', 'import', 'restore'].includes(action ?? '') &&
        (action !== 'restore' || restoring) &&
        reviewed && (
          <Dialog
            cancelLabel={t.saves.cancel}
            title={actionTitle}
            body={
              action === 'import' && !pending
                ? t.saves.wrongFile
                : format(actionBody, {
                    slot,
                    name: reviewed.name,
                    content,
                    ...(restoring ? describeBackup(restoring) : {}),
                  })
            }
            confirmLabel={
              action === 'delete'
                ? t.saves.confirmDelete
                : action === 'import'
                  ? t.saves.confirmImport
                  : action === 'restore'
                    ? t.saves.confirmRestore
                    : replaceLabel
            }
            onConfirm={action === 'import' && !pending ? undefined : confirm}
            busy={busy}
            danger={action === 'delete'}
            onClose={close}
          >
            {reviewedDamaged && (
              <Button
                variant="tool"
                icon="download"
                className="justify-self-start"
                disabled={busy}
                onClick={() => exportRecovery(reviewed.slot)}
              >
                {t.saves.exportRecovery}
              </Button>
            )}
          </Dialog>
        )}
    </div>
  );
}

/** A shield with a tick: storage the browser keeps. */
function ShieldGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
      <path
        d="M12 3L19 6V12Q19 18 12 21Q5 18 5 12V6ZM9 12L11 14L15 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** What is loaded in this tab, in plain values (compared shallowly). */
function currentContent(state: { world: World | null }) {
  const world = state.world;
  const player = world?.career ? world.players[world.career.playerId] : undefined;
  return {
    kind: world?.career ? 'career' : world ? 'world' : null,
    name: player?.name ?? '',
    season: world?.date.season ?? 0,
    week: world?.date.week ?? 0,
  } as const;
}

/** Who or what the save buttons store: the career player, or the world or gallery mark. */
function CurrentArt() {
  const { player, club, season, hasWorld } = useAppStore(
    useShallow((s) => {
      const world = s.world;
      const player = world?.career ? world.players[world.career.playerId] : undefined;
      return {
        player,
        club: player?.clubId ? world?.clubs[player.clubId] : undefined,
        season: world?.date.season ?? 0,
        hasWorld: world !== null,
      };
    }),
  );
  const svg = useMemo(() => {
    if (!player) return null;
    try {
      return renderAvatar(player.avatar, season - player.birthSeason, clubDress(club), 'current');
    } catch {
      return null;
    }
  }, [player, season, club]);
  if (svg) return <Artwork svg={svg} alt="" className="h-16 w-16 shrink-0 rounded-full" />;
  return (
    <span
      aria-hidden="true"
      className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
    >
      <Icon name={hasWorld ? 'globe' : 'gallery'} className="h-7 w-7" />
    </span>
  );
}

const slotEyebrow = 'text-xs font-extrabold tracking-[0.12em] text-muted uppercase';
const slotTitle =
  'font-display text-[1.875rem] leading-none font-normal tracking-[0.01em] [overflow-wrap:anywhere]';

/**
 * One save slot in every state: reading, empty (a dashed outline waiting to be filled), a
 * career (crest on mowing stripes, the Career tag and the player's portrait), a world or a
 * gallery (three crests), unreadable, or saved by a newer version. The active slot carries the
 * accent outline and the "Active save" tag.
 */
function SlotCard({
  target,
  listing,
  current,
  failed,
  backups,
  skipped,
  actions,
}: {
  target: SlotId;
  /** `undefined` while the slots are being read. */
  listing: SlotListing | null | undefined;
  current: boolean;
  /** Its load just failed its checks, though its record reads. */
  failed: boolean;
  /** The slot's automatic backups, and the latest one skipped. */
  backups: BackupInfo[];
  skipped: BackupSkip | undefined;
  actions: SlotActions;
}) {
  const slotName = format(t.saves.slot, { slot: target });
  const collection: Ready | undefined = listing?.status === 'ready' ? listing : undefined;
  const damaged: Damaged | undefined = listing?.status === 'error' ? listing : undefined;
  const loading = listing === undefined;
  const empty = !loading && !collection && !damaged;
  const occupied = Boolean(collection || damaged);
  const career = collection?.world?.career;
  // A slot that will not open offers its backups (one saved by a newer version does not).
  const restorable =
    failed || damaged?.code === 'invalid'
      ? KINDS.flatMap((kind) => backups.filter((backup) => backup.kind === kind))
      : [];
  const latest = backups.reduce<BackupInfo | null>(
    (newest, backup) =>
      !newest || Date.parse(backup.takenAt) > Date.parse(newest.takenAt) ? backup : newest,
    null,
  );
  const paused =
    skipped && (!latest || Date.parse(skipped.at) > Date.parse(latest.takenAt)) ? skipped : null;
  const state = loading
    ? t.saves.loadingState
    : damaged
      ? damaged.code === 'future'
        ? t.saves.futureState
        : t.saves.damagedState
      : current
        ? t.saves.activeState
        : empty
          ? t.saves.emptyState
          : null;
  const tone = damaged
    ? damaged.code === 'future'
      ? 'border-2 border-info bg-surface shadow-surface'
      : 'border-2 border-danger bg-surface shadow-surface'
    : current
      ? 'border-2 border-accent bg-surface shadow-surface'
      : empty
        ? 'border-2 border-dashed border-line'
        : 'border border-line bg-surface shadow-surface';
  return (
    <article
      className={cx('slot-card flex min-w-0 flex-col gap-3.5 rounded-panel p-4.5', tone)}
      aria-label={state ? format(t.saves.slotState, { slot: slotName, state }) : slotName}
      aria-busy={loading || undefined}
    >
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <span className={slotEyebrow}>{slotName}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {collection && !career && (
            <Chip tone={collection.world ? 'info' : 'neutral'}>
              {collection.world ? t.saves.worldType : t.saves.collectionType}
            </Chip>
          )}
          {current && (
            <Chip tone="solid" icon="check" className="active-label">
              {t.saves.active}
            </Chip>
          )}
        </span>
      </div>
      <SlotArt collection={collection} damaged={damaged} loading={loading} />
      <div className="flex flex-1 flex-col gap-1">
        <h2 className={slotTitle}>
          {loading
            ? t.saves.loading
            : (collection?.name ?? damaged?.name ?? (damaged ? t.saves.damaged : t.saves.empty))}
        </h2>
        <p className="text-[0.8125rem] text-muted">
          {loading
            ? t.saves.loadingBody
            : collection
              ? format(t.saves.savedAt, {
                  date: new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(collection.updatedAt)),
                })
              : damaged
                ? damaged.code === 'future'
                  ? t.saves.futureBody
                  : t.saves.damagedBody
                : t.saves.emptyBody}
        </p>
        {career && (
          <p className="mt-1.5 text-sm font-bold">
            {format(t.menu.careerSummary, { name: career.name, level: career.level })}
            <span className="block text-xs font-medium text-muted">{career.clubName}</span>
          </p>
        )}
        {collection && !failed && (paused || latest) && (
          <p
            className={cx(
              'slot-backup mt-1 text-xs',
              paused ? 'font-semibold text-warning' : 'text-muted',
            )}
          >
            {paused
              ? paused.reason === 'space'
                ? t.saves.backupsPaused
                : t.saves.backupFailed
              : format(t.saves.backedUp, { date: backupDate(latest!.takenAt) })}
          </p>
        )}
        {collection && (
          <p className="slot-seed mt-1.5 self-start rounded-chip bg-surface-soft px-2 py-0.5 text-xs font-semibold text-muted [overflow-wrap:anywhere]">
            {collection.world
              ? format(t.saves.worldSummary, {
                  season: collection.world.season,
                  week: collection.world.week,
                  clubs: collection.world.clubs,
                })
              : format(t.saves.seed, { seed: collection.gallerySeed })}
          </p>
        )}
      </div>
      {restorable.length > 0 && (
        <section
          aria-label={`${t.saves.restoreHeading} — ${slotName}`}
          className="slot-restore flex flex-col gap-2 rounded-control bg-surface-soft p-3"
        >
          <p className={slotEyebrow}>{t.saves.restoreHeading}</p>
          {restorable.map((backup) => {
            const { when, detail } = describeBackup(backup);
            return (
              <div key={backup.id} className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  icon="history"
                  className="h-auto min-w-0 flex-1 justify-start py-2 text-left"
                  disabled={actions.blocked}
                  aria-label={format(t.saves.restoreLabel, { when, detail, slot: slotName })}
                  onClick={() => actions.restore(target, backup.kind)}
                >
                  <span className="flex min-w-0 flex-col items-start">
                    <span>{format(t.saves.restore, { when })}</span>
                    <span className="text-xs font-medium text-muted">{detail}</span>
                  </span>
                </Button>
                <Button
                  variant="tool"
                  icon="download"
                  disabled={actions.blocked}
                  aria-label={format(t.saves.downloadBackup, { when, detail, slot: slotName })}
                  title={format(t.saves.downloadBackup, { when, detail, slot: slotName })}
                  onClick={() => actions.exportGeneration(target, backup)}
                />
              </div>
            );
          })}
        </section>
      )}
      {loading ? (
        <span aria-hidden="true" className="block h-12 rounded-control bg-surface-soft" />
      ) : (
        <div className="flex flex-col gap-2">
          {collection && (
            <Button
              block
              iconEnd="arrow"
              disabled={actions.blocked}
              onClick={() => actions.load(target)}
            >
              {career
                ? t.saves.continueCareer
                : collection.kind === 'world'
                  ? t.saves.loadWorldAction
                  : t.saves.load}
            </Button>
          )}
          <Button
            block
            variant={occupied ? 'secondary' : 'primary'}
            icon={occupied ? undefined : 'save'}
            disabled={actions.blocked || actions.nameMissing}
            onClick={() => actions.store(target, occupied)}
          >
            {occupied ? actions.replaceLabel : actions.saveLabel}
          </Button>
          <div className="flex flex-wrap gap-1.5 border-t border-line pt-2.5">
            {collection && (
              <Button
                variant="tool"
                icon="download"
                disabled={actions.blocked}
                onClick={() => actions.exportSlot(target)}
              >
                {t.saves.export}
              </Button>
            )}
            {damaged && (
              <Button
                variant="tool"
                icon="download"
                disabled={actions.blocked}
                aria-label={`${t.saves.exportRecovery} — ${slotName}`}
                onClick={() => actions.exportRecovery(target)}
              >
                {t.saves.exportRecovery}
              </Button>
            )}
            <label
              className={cx(
                buttonClass('tool'),
                'relative has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus-ring',
                actions.blocked ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
              )}
            >
              <Icon name="upload" />
              {t.saves.import}
              <input
                type="file"
                accept=".json,.gz,application/json,application/gzip,application/x-gzip"
                disabled={actions.blocked}
                aria-label={`${t.saves.import} — ${slotName}`}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  actions.importFile(file, target);
                }}
              />
            </label>
            {occupied && (
              <Button
                variant="tool"
                icon="trash"
                className="ml-auto text-danger"
                disabled={actions.blocked}
                onClick={() => actions.remove(target)}
              >
                {t.saves.delete}
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/** The picture at the top of a slot card, by state. */
function SlotArt({
  collection,
  damaged,
  loading,
}: {
  collection: Ready | undefined;
  damaged: Damaged | undefined;
  loading: boolean;
}) {
  const career = collection?.world?.career;
  const gallerySeed = collection && !collection.world ? collection.gallerySeed : null;
  const crests = useMemo(
    () =>
      collection?.world
        ? collection.world.crests.slice(0, 3)
        : gallerySeed !== null
          ? generateGallery(gallerySeed)
              .clubs.slice(0, 3)
              .map((club) => club.crest)
          : [],
    [collection?.world, gallerySeed],
  );
  if (loading)
    return (
      <span
        aria-hidden="true"
        className="block h-24 rounded-control bg-[repeating-linear-gradient(120deg,var(--surface-soft)_0_18px,var(--bg)_18px_36px)]"
      />
    );
  if (damaged) {
    const future = damaged.code === 'future';
    return (
      <StateArt
        icon={future ? 'refresh' : 'warning'}
        className={future ? 'bg-art-blue text-info' : 'bg-danger-soft text-danger'}
      />
    );
  }
  if (career)
    return (
      <div className="relative flex h-32 items-center gap-4 overflow-hidden rounded-control bg-field-stripes px-5">
        <Artwork
          svg={renderCrest(career.crest)}
          alt={career.clubName}
          className="h-[5.9rem] w-[5.25rem] shrink-0"
        />
        <Chip tone="gold" className="relative z-[1]">
          {t.saves.careerTag}
        </Chip>
        <SlotPortrait summary={collection!.world!} />
      </div>
    );
  if (collection)
    return (
      <div className="flex h-32 items-center justify-center gap-2.5 rounded-control bg-surface-soft">
        {crests.map((crest, index) => (
          <Artwork key={index} svg={renderCrest(crest)} alt="" className="h-[4.5rem] w-16" />
        ))}
      </div>
    );
  // Empty: a dashed frame with the save mark; phones skip it so empty slots stay compact.
  return (
    <span
      aria-hidden="true"
      className="hidden h-32 place-items-center rounded-control border border-dashed border-line text-muted sm:grid"
    >
      <Icon name="save" className="h-11 w-11" />
    </span>
  );
}
function StateArt({ icon, className }: { icon: IconName; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('grid h-24 place-items-center rounded-control', className)}
    >
      <Icon name={icon} className="h-10 w-10" />
    </span>
  );
}

/** The career player on a save card; older slot records without a portrait show none. */
function SlotPortrait({ summary }: { summary: { season: number; career?: CareerSummary } }) {
  const svg = useMemo(() => {
    const portrait = summaryPortrait(summary);
    if (!portrait) return null;
    try {
      return renderAvatar(
        portrait.avatar,
        portrait.age,
        { kit: portrait.kit, crest: portrait.crest, background: ART.fieldStripe },
        'slot',
      );
    } catch {
      // An index record from another version of the avatar model: the crest alone is enough.
      return null;
    }
  }, [summary]);
  if (!svg) return null;
  return <Artwork svg={svg} alt="" className="absolute right-3 bottom-0 h-24 w-24" />;
}
