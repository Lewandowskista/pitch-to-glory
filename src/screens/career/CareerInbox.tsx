import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { InboxMessage, World } from '../../model/domain';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { marketText as m } from '../../i18n/market';
import { CareerPage, ui } from './shared';
import { ActionError, BlockNote, messageText, useMarketAction } from './marketUi';

/** The two-pane inbox, with the list and the reader side by side (Tailwind `lg`). */
const WIDE = '(min-width: 1024px)';
function useWide(): boolean {
  return useSyncExternalStore(
    (change) => {
      const list = window.matchMedia(WIDE);
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

export default function CareerInbox() {
  return (
    <CareerPage title={m.titles.inbox}>{({ world }) => <InboxContent world={world} />}</CareerPage>
  );
}

/** Where a message's action leads: open talks, the agent, or the transfers page. */
export function messageLink(
  world: World,
  message: InboxMessage,
  save: string | null,
): { to: string; label: string } | null {
  const suffix = save ? `save=${save}` : '';
  const join = (path: string, query = '') =>
    `${path}${query || suffix ? '?' : ''}${[query, suffix].filter(Boolean).join('&')}`;
  if (message.actionId) {
    const offer = world.offers.find((entry) => entry.id === message.actionId);
    if (offer && (offer.status === 'terms' || offer.status === 'agreed'))
      return {
        to: join('/career/transfers', `offer=${encodeURIComponent(offer.id)}`),
        label: m.inbox.goTalks,
      };
  }
  if (message.subjectKey === 'press-request')
    return { to: join('/career/media'), label: m.inbox.goMedia };
  if (message.subjectKey.startsWith('sponsor-') || message.subjectKey === 'asset-sold')
    return { to: join('/career/lifestyle'), label: m.inbox.goLifestyle };
  if (['award', 'golden-ball', 'trophy', 'record'].includes(message.subjectKey))
    return {
      to: join(
        '/career/trophies',
        message.subjectKey === 'golden-ball' ? `ceremony=${message.params.season}` : '',
      ),
      label: m.inbox.goTrophies,
    };
  if (message.subjectKey === 'call-up' || message.subjectKey === 'tournament')
    return { to: join('/career/national'), label: m.inbox.goNational };
  if (message.subjectKey === 'fame-level')
    return { to: join('/career/wardrobe'), label: m.inbox.goWardrobe };
  if (message.subjectKey === 'rival-transfer')
    return { to: join('/career/rival'), label: m.inbox.goRival };
  if (message.subjectKey.startsWith('agent-'))
    return { to: join('/career/agent'), label: m.inbox.goAgent };
  if (message.subjectKey === 'new-manager' || message.subjectKey === 'welcome-market') return null;
  return { to: join('/career/transfers'), label: m.inbox.goTransfers };
}

function InboxContent({ world }: { world: World }) {
  const { run, error, block } = useMarketAction();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const pushed = useRef(false);
  const selectedId = params.get('message');
  // The first message opened adds a history entry; switching messages replaces it, so back
  // always returns to the list.
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('message', id);
    if (!selectedId) pushed.current = true;
    setParams(next, { replace: Boolean(selectedId) });
  };
  const closeReader = () => {
    if (pushed.current) {
      pushed.current = false;
      navigate(-1);
    } else {
      const next = new URLSearchParams(params);
      next.delete('message');
      setParams(next, { replace: true });
    }
  };
  const wide = useWide();
  const messages = [...world.inbox].reverse();
  const selected = selectedId ? world.inbox.find((entry) => entry.id === selectedId) : undefined;
  // Beside the list there is room to read: with nothing chosen, the newest unread message (or
  // the newest one) is shown. It stays out of the URL and history, and stays unread until the
  // player opens it from the list.
  const shown =
    selected ??
    (wide && !selectedId ? (messages.find((message) => !message.read) ?? messages[0]) : undefined);
  const unread = world.inbox.filter((message) => !message.read).length;
  // Opening a message marks it as read.
  useEffect(() => {
    if (selected && !selected.read && !block) run({ type: 'read', messageId: selected.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.read, block]);
  const link = shown ? messageLink(world, shown, params.get('save')) : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
      <section
        aria-labelledby="inbox-list-heading"
        className={`${ui.panel} lg:col-span-5 ${selected ? 'hidden lg:block' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="inbox-list-heading" className={ui.heading}>
            {m.inbox.list}
          </h2>
          <span className={ui.chip}>{format(m.inbox.unread, { count: unread })}</span>
        </div>
        <div className="mt-3 grid gap-3">
          <BlockNote block={block} />
          <ActionError error={error} />
          {unread > 0 && (
            <div>
              <button
                className="text-button -ml-3"
                disabled={Boolean(block)}
                onClick={() => run({ type: 'read-all' })}
              >
                {m.inbox.markAll}
              </button>
            </div>
          )}
        </div>
        {messages.length ? (
          <ul
            className="-mx-1 mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5 px-1 py-1 lg:max-h-[calc(100dvh-18rem)] lg:min-h-80 lg:overflow-y-auto lg:overscroll-contain"
            aria-label={m.inbox.list}
          >
            {messages.map((message) => {
              const text = messageText(message);
              const active = message.id === shown?.id;
              return (
                <li key={message.id}>
                  <button
                    aria-current={active ? 'true' : undefined}
                    onClick={() => select(message.id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                      event.preventDefault();
                      const buttons = Array.from(
                        event.currentTarget.closest('ul')?.querySelectorAll('button') ?? [],
                      );
                      const index = buttons.indexOf(event.currentTarget);
                      buttons[
                        (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) %
                          buttons.length
                      ]?.focus();
                    }}
                    className={`flex min-h-14 w-full items-start gap-3 rounded-control border p-3 text-left transition ${
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-transparent hover:border-line hover:bg-surface-soft'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        message.read ? 'bg-transparent' : 'bg-accent'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm line-clamp-2 ${message.read ? '' : 'font-bold'}`}
                      >
                        {text.subject}
                      </span>
                      <span className="block text-xs text-muted">
                        {format(c.common.seasonWeek, {
                          season: message.date.season,
                          week: message.date.week,
                        })}
                        {!message.read && (
                          <span className="sr-only"> · {format(m.inbox.unread, { count: 1 })}</span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`${ui.muted} mt-4`}>{m.inbox.empty}</p>
        )}
      </section>
      <section
        aria-labelledby="inbox-reader-heading"
        className={`${ui.panel} lg:sticky lg:top-6 lg:col-span-7 lg:self-start ${selected ? '' : 'hidden lg:block'}`}
      >
        {shown ? (
          <article className="flex flex-col gap-4">
            <button className="button secondary self-start lg:hidden" onClick={closeReader}>
              {m.inbox.back}
            </button>
            <p className="text-xs text-muted">
              {format(c.common.seasonWeek, {
                season: shown.date.season,
                week: shown.date.week,
              })}
            </p>
            <h2 id="inbox-reader-heading" className="font-display text-[2.2rem] leading-none">
              {messageText(shown).subject}
            </h2>
            <p className="max-w-prose">{messageText(shown).body}</p>
            {link && (
              <div>
                <Link className="button" to={link.to}>
                  {link.label}
                </Link>
              </div>
            )}
          </article>
        ) : (
          <>
            <h2 id="inbox-reader-heading" className="sr-only">
              {m.inbox.reader}
            </h2>
            <p className={ui.muted}>{m.inbox.selectPrompt}</p>
          </>
        )}
      </section>
    </div>
  );
}
