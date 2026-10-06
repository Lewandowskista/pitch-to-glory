import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { SlotId } from '../model/domain';
import { useAppStore } from '../store';
import { saves } from '../persistence/runtime';
import {
  autosave,
  deleteSlot,
  errorCode,
  exportSlotJSON,
  importSlot,
  loadSlot,
  saveSlot,
} from '../persistence/session';
import type { SlotListing } from '../persistence/localRepository';
import { platform } from '../platform';
import { errorText, format, t } from '../i18n';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
import { Dialog } from '../ui/Dialog';
import { generateGallery } from '../engine/assets/gallery';
import { renderCrest } from '../engine/assets/crest';
export default function Saves() {
  const active = useAppStore((s) => s.activeSave);
  const world = useAppStore((s) => s.world);
  const worldJob = useAppStore((s) => s.worldJob);
  const [collections, setCollections] = useState<SlotListing[] | null>(null);
  const [name, setName] = useState<string>(t.saves.defaultName);
  const [busy, setBusy] = useState(false);
  const blocked = busy || !collections || Boolean(worldJob);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [protection, setProtection] = useState('');
  const [pending, setPending] = useState<string | null>(null);
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
      if (current && persistent) setProtection(t.saves.protected);
    });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    const subscription = liveQuery(() => saves.list()).subscribe({
      next: setCollections,
      error: () => setError(t.errors.storage),
    });
    return () => subscription.unsubscribe();
  }, []);
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
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (error) {
      setError(errorText(errorCode(error)));
    } finally {
      setBusy(false);
    }
  };
  const open = async (action: string, slot: SlotId) => {
    // Settle this tab's pending edits before pinning what the player reviews.
    await autosave.flush();
    const current = (await saves.list())[slot - 1];
    setReviewed({
      slot,
      revision: current && current.status !== 'empty' ? current.revision : null,
      name: (current && current.status !== 'empty' ? current.name : null) ?? t.saves.unsaved,
    });
    opened.current = true;
    setParams({ action, slot: String(slot) });
  };
  const importFile = async (file: File | undefined, target: SlotId) => {
    if (!file) return;
    await run(async () => {
      const json = await platform.readFile(file);
      await saves.validateJSON(json);
      const listing = collections?.[target - 1];
      // Ask before replacing an occupied (or unreadable) slot; an empty one imports directly.
      if (listing && listing.status !== 'empty') {
        setPending(json);
        await open('import', target);
      } else {
        await importSlot(target, json, null);
        setNotice(t.saves.imported);
      }
    });
  };
  const confirm = () =>
    void run(async () => {
      if (!reviewed) return;
      const target = reviewed.slot;
      if (action === 'delete') {
        await deleteSlot(target, reviewed.revision);
        setNotice(t.saves.deleted);
      } else if (action === 'replace') {
        await saveSlot(target, name.trim(), reviewed.revision);
        setNotice(t.saves.created);
      } else if (action === 'import' && pending) {
        await importSlot(target, pending, reviewed.revision);
        setNotice(t.saves.imported);
      }
      close();
    });
  const actionTitle =
    action === 'delete'
      ? t.saves.deleteTitle
      : action === 'import'
        ? t.saves.importTitle
        : t.saves.replaceTitle;
  const actionBody =
    action === 'delete'
      ? t.saves.deleteBody
      : action === 'import'
        ? t.saves.importBody
        : t.saves.replaceBody;
  return (
    <Page>
      <div className="page-heading">
        <h1>{t.saves.title}</h1>
        <p>{t.saves.description}</p>
      </div>
      <div className="collection-name">
        <label htmlFor="collection-name">{t.saves.name}</label>
        <input
          id="collection-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          required
        />
      </div>
      {worldJob && (
        <p role="status" className="inline-error">
          {t.errors.busy}
        </p>
      )}
      {error && (
        <div role="alert" className="inline-error">
          {error}
          <button
            className="text-button"
            onClick={() => void run(async () => setCollections(await saves.list()))}
          >
            {t.app.retry}
          </button>
        </div>
      )}
      <p role="status" className="notice">
        {notice || (!collections && !error ? t.saves.loading : '')}
      </p>
      <div className="slot-grid" aria-busy={!collections}>
        {([1, 2, 3] as const).map((target) => {
          const listing = collections?.[target - 1];
          const collection = listing?.status === 'ready' ? listing : undefined;
          const damaged = listing?.status === 'error' ? listing : undefined;
          const occupied = Boolean(collection || damaged);
          const current = active?.slot === target;
          return (
            <article className={`slot-card ${current ? 'active-slot' : ''}`} key={target}>
              <div className="slot-header">
                <span>{format(t.saves.slot, { slot: target })}</span>
                {current && (
                  <span className="active-label">
                    <Icon name="check" />
                    {t.saves.active}
                  </span>
                )}
              </div>
              <div className="slot-art">
                {collection ? (
                  (collection.world
                    ? collection.world.crests.map((crest, index) => ({ id: String(index), crest }))
                    : generateGallery(collection.gallerySeed).clubs.slice(0, 3)
                  ).map((club) => <Artwork key={club.id} svg={renderCrest(club.crest)} alt="" />)
                ) : (
                  <Icon name="save" />
                )}
              </div>
              <div className="slot-copy">
                <h2>
                  {!collections
                    ? t.saves.loading
                    : (collection?.name ??
                      damaged?.name ??
                      (damaged ? t.saves.damaged : t.saves.empty))}
                </h2>
                <p>
                  {!collections
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
                {collection && (
                  <p className="slot-seed">
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
              <div className="slot-actions">
                {collection && (
                  <button
                    className="button"
                    disabled={blocked}
                    onClick={() =>
                      void run(async () => {
                        await loadSlot(target);
                        setNotice(t.saves.loaded);
                      })
                    }
                  >
                    {collection.kind === 'world' ? t.saves.loadWorldAction : t.saves.load}
                    <Icon name="arrow" />
                  </button>
                )}
                <button
                  className={`button ${occupied ? 'secondary' : ''}`}
                  disabled={blocked || !name.trim()}
                  onClick={() => {
                    if (occupied) void run(() => open('replace', target));
                    else
                      void run(async () => {
                        await saveSlot(target, name.trim(), null);
                        setNotice(t.saves.created);
                      });
                  }}
                >
                  {world
                    ? occupied
                      ? t.saves.replaceWorld
                      : t.saves.saveWorld
                    : occupied
                      ? t.saves.replace
                      : t.saves.save}
                </button>
                <div className="slot-tools">
                  {collection && (
                    <button
                      title={t.saves.export}
                      disabled={blocked}
                      onClick={() =>
                        void run(async () => {
                          const save = await exportSlotJSON(target);
                          await platform.saveFile(
                            `pitch-to-glory-slot-${target}.json`,
                            save.json,
                            'application/json',
                          );
                          setNotice(t.saves.exported);
                        })
                      }
                    >
                      <Icon name="download" />
                      {t.saves.export}
                    </button>
                  )}
                  <label className={blocked ? 'file-button disabled' : 'file-button'}>
                    <Icon name="upload" />
                    {t.saves.import}
                    <input
                      type="file"
                      accept=".json,application/json"
                      disabled={blocked}
                      aria-label={`${t.saves.import} — ${format(t.saves.slot, { slot: target })}`}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void importFile(file, target);
                      }}
                    />
                  </label>
                  {occupied && (
                    <button
                      className="delete-tool"
                      title={t.saves.delete}
                      disabled={blocked}
                      onClick={() => void run(() => open('delete', target))}
                    >
                      <Icon name="trash" />
                      {t.saves.delete}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {active && (
        <Link className="button secondary open-gallery" to={world ? '/world' : '/gallery'}>
          {world ? t.saves.loadWorld : t.saves.loadGallery}
          <Icon name="arrow" />
        </Link>
      )}
      <section className="storage-panel">
        <Icon name="save" />
        <div>
          <h2>{t.saves.protectTitle}</h2>
          <p>{t.saves.protectBody}</p>
          <p role="status">{protection}</p>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              setProtection(
                (await platform.requestPersistentStorage())
                  ? t.saves.protected
                  : t.saves.notProtected,
              ),
            )
          }
        >
          {t.saves.protect}
        </button>
      </section>
      {valid && ['delete', 'replace', 'import'].includes(action ?? '') && reviewed && (
        <Dialog
          title={actionTitle}
          body={
            action === 'import' && !pending
              ? t.saves.wrongFile
              : format(actionBody, { slot, name: reviewed.name })
          }
          confirmLabel={
            action === 'delete'
              ? t.saves.confirmDelete
              : action === 'import'
                ? t.saves.confirmImport
                : t.saves.confirmReplace
          }
          onConfirm={action === 'import' && !pending ? undefined : confirm}
          busy={busy}
          danger={action === 'delete'}
          onClose={close}
        />
      )}
    </Page>
  );
}
