import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Agent, Club, InboxMessage, World } from '../../model/domain';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { marketText as m } from '../../i18n/market';
import { Icon } from '../../ui/Icon';
import { ButtonLink, CardTitle, Chip, cx, panelClass } from '../../ui/kit';
import { CareerPage, CrestImage, ui } from './shared';
import {
  ActionError,
  AgentPortrait,
  BlockNote,
  messageText,
  money,
  useMarketAction,
} from './marketUi';
import { deadlineItems, type Priority } from './agenda';
import { Glyph, type GlyphName } from './honoursUi';

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
    <CareerPage title={m.titles.inbox} description={m.inbox.description}>
      {({ world }) => <InboxContent world={world} />}
    </CareerPage>
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
  if (message.subjectKey.startsWith('promise-'))
    return { to: join('/career/club'), label: m.inbox.goClub };
  if (message.subjectKey.startsWith('agent-'))
    return { to: join('/career/agent'), label: m.inbox.goAgent };
  if (message.subjectKey === 'new-manager' || message.subjectKey === 'welcome-market') return null;
  return { to: join('/career/transfers'), label: m.inbox.goTransfers };
}

/** Which kind of message this is, from its subject: the chip on each row. */
export type MessageKind = keyof typeof m.inbox.kinds;
export function messageKind(subjectKey: string): MessageKind {
  if (subjectKey.startsWith('agent-')) return 'agent';
  if (subjectKey === 'press-request') return 'press';
  if (subjectKey === 'call-up' || subjectKey === 'tournament') return 'national';
  if (subjectKey.startsWith('sponsor-')) return 'sponsor';
  if (subjectKey.startsWith('story-')) return 'story';
  if (subjectKey === 'rival-transfer') return 'rival';
  if (subjectKey === 'welcome-market') return 'market';
  if (
    [
      'award',
      'golden-ball',
      'trophy',
      'record',
      'ambition-achieved',
      'farewell',
      'testimonial',
      'retirement-due',
    ].includes(subjectKey)
  )
    return 'honours';
  if (
    ['experience', 'legacy-project', 'investment-lost', 'asset-sold', 'fame-level'].includes(
      subjectKey,
    )
  )
    return 'lifestyle';
  if (
    subjectKey.startsWith('renewal-') ||
    subjectKey.startsWith('transfer-request') ||
    ['contract-extended', 'loan-request', 'promise-broken'].includes(subjectKey)
  )
    return 'contract';
  if (
    subjectKey.startsWith('offer-') ||
    subjectKey.startsWith('pre-contract-') ||
    subjectKey.startsWith('loan-') ||
    ['release-clause', 'transfer-complete', 'free-transfer'].includes(subjectKey)
  )
    return 'transfer';
  return 'club';
}

/** Messages written by your club, naming it in a parameter. */
const FROM_CLUB: Record<string, string> = {
  'offer-terms': 'parent',
  'offer-rejected': 'parent',
  'renewal-offer': 'club',
  'renewal-improved': 'club',
  'renewal-refused': 'club',
  'contract-extended': 'club',
  'transfer-request': 'club',
  'transfer-request-withdrawn': 'club',
  'loan-request': 'club',
  'promise-broken': 'club',
  'new-manager': 'club',
};
const FROM_AGENT = new Set(['agent-hired', 'agent-pitch', 'agent-push', 'agent-renewal']);

interface Sender {
  label: string;
  club?: Club;
  agent?: Agent;
}
/** Who sent a message, where the message itself says so. */
function messageSender(
  world: World,
  message: InboxMessage,
  clubs: Map<string, Club>,
): Sender | null {
  const clubParam = FROM_CLUB[message.subjectKey];
  if (clubParam && typeof message.params[clubParam] === 'string') {
    const name = String(message.params[clubParam]);
    return { label: format(m.inbox.sender.club, { name }), club: clubs.get(name) };
  }
  if (FROM_AGENT.has(message.subjectKey) && typeof message.params.agent === 'string') {
    const name = message.params.agent;
    return {
      label: format(m.inbox.sender.agent, { name }),
      agent: Object.values(world.agents).find((agent) => agent.name === name),
    };
  }
  if (message.subjectKey === 'press-request' && typeof message.params.outlet === 'string')
    return { label: format(m.inbox.sender.press, { name: message.params.outlet }) };
  return null;
}

/** The last week to answer, when the message's item still waits for the player. */
function messageDeadline(world: World, message: InboxMessage): Priority['deadline'] {
  if (!message.actionId) return null;
  const item = deadlineItems(world).find(
    (entry) => entry.id.slice(entry.id.indexOf(':') + 1) === message.actionId,
  );
  return item?.deadline ?? null;
}

const KIND_GLYPH: Record<MessageKind, GlyphName> = {
  transfer: 'transfer',
  contract: 'contract',
  agent: 'contract',
  press: 'fame',
  national: 'flag',
  honours: 'trophy',
  sponsor: 'star',
  lifestyle: 'star',
  club: 'flag',
  story: 'moment',
  rival: 'rival',
  market: 'transfer',
};

/** The sender's crest or portrait, or the message type's icon. Decorative. */
function SenderMark({
  sender,
  kind,
  size = 'sm',
}: {
  sender: Sender | null;
  kind: MessageKind;
  size?: 'sm' | 'md';
}) {
  if (sender?.club)
    return (
      <CrestImage
        crest={sender.club.crest}
        alt=""
        className={size === 'md' ? 'h-9 w-8 shrink-0' : 'h-[2.4rem] w-[2.125rem] shrink-0'}
      />
    );
  if (sender?.agent)
    return (
      <span aria-hidden="true" className="shrink-0 overflow-hidden rounded-full leading-none">
        <AgentPortrait
          avatar={sender.agent.avatar}
          name={sender.agent.name}
          className={size === 'md' ? 'h-12 w-12' : 'h-10 w-10'}
        />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid shrink-0 place-items-center rounded-control',
        size === 'md' ? 'h-12 w-12' : 'h-10 w-10',
        kind === 'honours' || kind === 'sponsor' || kind === 'lifestyle'
          ? 'bg-art-gold text-gold-ink'
          : kind === 'press' || kind === 'national'
            ? 'bg-art-blue text-info'
            : 'bg-accent-soft text-accent',
      )}
    >
      <Glyph name={KIND_GLYPH[kind]} />
    </span>
  );
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
  const clubs = useMemo(
    () => new Map(Object.values(world.clubs).map((club) => [club.name, club] as const)),
    [world.clubs],
  );
  // Opening a message marks it as read.
  useEffect(() => {
    if (selected && !selected.read && !block) run({ type: 'read', messageId: selected.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.read, block]);
  const unreadText = format(m.inbox.unread, { count: unread });
  return (
    <div className="flex flex-wrap items-start gap-5">
      <section
        aria-labelledby="inbox-list-heading"
        // With no messages at all the list is the whole page: one card, no empty reader.
        className={cx(
          panelClass(),
          'flex min-w-0 flex-[5_1_21.25rem] flex-col gap-2.5',
          selected && 'hidden lg:flex',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle id="inbox-list-heading">{m.inbox.list}</CardTitle>
          <Chip tone={unread ? 'accent' : 'neutral'}>
            <span className="sm:hidden">{format(m.inbox.newestFirst, { unread: unreadText })}</span>
            <span className="max-sm:hidden">{unreadText}</span>
          </Chip>
        </div>
        <BlockNote block={block} />
        <ActionError error={error} />
        {unread > 0 && (
          <div>
            <button
              type="button"
              className="text-button -ml-3"
              disabled={Boolean(block)}
              onClick={() => run({ type: 'read-all' })}
            >
              {m.inbox.markAll}
            </button>
          </div>
        )}
        {messages.length ? (
          <>
            <ul
              className="-mx-1 grid grid-cols-[minmax(0,1fr)] gap-1.5 px-1 py-1 lg:max-h-[calc(100dvh-18rem)] lg:min-h-80 lg:overflow-y-auto lg:overscroll-contain"
              aria-label={m.inbox.list}
            >
              {messages.map((message) => {
                const text = messageText(message);
                const active = message.id === shown?.id;
                const kind = messageKind(message.subjectKey);
                const sender = messageSender(world, message, clubs);
                return (
                  <li key={message.id}>
                    <button
                      type="button"
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
                      className={cx(
                        'flex min-h-14 w-full items-start gap-3 rounded-control border p-3 text-left transition-colors max-sm:min-h-20 max-sm:items-center max-sm:gap-2.5 max-sm:pl-2',
                        active
                          ? 'border-accent bg-accent-soft'
                          : message.read
                            ? 'border-transparent hover:border-line hover:bg-surface-soft max-sm:bg-surface-soft'
                            : 'border-transparent hover:border-line hover:bg-surface-soft',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cx(
                          'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full max-sm:mt-0 max-sm:h-2 max-sm:w-2',
                          message.read ? 'bg-transparent' : 'bg-accent',
                        )}
                      />
                      <span className="hidden w-10 shrink-0 place-items-center max-sm:grid">
                        <SenderMark sender={sender} kind={kind} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {sender && (
                          <span className="truncate text-xs font-bold text-muted sm:hidden">
                            {sender.label}
                          </span>
                        )}
                        <span
                          className={cx(
                            'line-clamp-2 text-sm leading-snug max-sm:text-[0.9375rem]',
                            message.read ? 'font-medium' : 'font-extrabold',
                          )}
                        >
                          {text.subject}
                        </span>
                        <span className="text-xs text-muted">
                          {format(c.common.seasonWeek, {
                            season: message.date.season,
                            week: message.date.week,
                          })}
                          {!message.read && (
                            <span className="sr-only">
                              {' '}
                              · {format(m.inbox.unread, { count: 1 })}
                            </span>
                          )}
                        </span>
                        {/* A one-line preview where the list stands alone (the reader is not
                            beside it), so the text is never in the page twice. */}
                        {text.body && !wide && !selected && (
                          <span className="truncate text-[0.8125rem] text-muted sm:hidden">
                            {text.body}
                          </span>
                        )}
                      </span>
                      <span
                        className={cx(
                          'mt-px shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold text-muted max-sm:hidden',
                          active ? 'bg-surface' : 'bg-surface-soft',
                        )}
                      >
                        {m.inbox.kinds[kind]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted max-sm:hidden">{m.inbox.keys}</p>
          </>
        ) : (
          <p className="flex flex-col items-start gap-2 rounded-control bg-surface-soft p-4.5 text-sm text-muted">
            <Icon name="inbox" className="h-8 w-8" />
            {m.inbox.empty}
          </p>
        )}
      </section>
      {messages.length > 0 && (
        <section
          aria-labelledby="inbox-reader-heading"
          className={cx(
            panelClass(),
            'min-w-0 flex-[7_1_27.5rem] lg:sticky lg:top-6 lg:p-8',
            selected ? '' : 'hidden lg:block',
          )}
        >
          {shown ? (
            <Reader
              world={world}
              message={shown}
              sender={messageSender(world, shown, clubs)}
              onBack={closeReader}
            />
          ) : (
            <div className="grid min-h-44 place-items-center text-center">
              <div className="flex flex-col items-center gap-2.5">
                <h2 id="inbox-reader-heading" className="sr-only">
                  {m.inbox.reader}
                </h2>
                <Icon name="inbox" className="h-9 w-9 text-muted" />
                <p className={ui.muted}>{m.inbox.selectPrompt}</p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Reader({
  world,
  message,
  sender,
  onBack,
}: {
  world: World;
  message: InboxMessage;
  sender: Sender | null;
  onBack: () => void;
}) {
  const [params] = useSearchParams();
  const text = messageText(message);
  const kind = messageKind(message.subjectKey);
  const link = messageLink(world, message, params.get('save'));
  const deadline = messageDeadline(world, message);
  const offer = message.actionId
    ? world.offers.find((entry) => entry.id === message.actionId)
    : undefined;
  const offerClub = offer ? world.clubs[offer.clubId] : undefined;
  const date = format(c.common.seasonWeek, {
    season: message.date.season,
    week: message.date.week,
  });
  return (
    <article className="flex flex-col gap-4 sm:gap-4.5">
      <button type="button" className="button secondary self-start lg:hidden" onClick={onBack}>
        <Icon name="chevron" className="rotate-180" />
        {m.inbox.back}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {sender && <SenderMark sender={sender} kind={kind} size="md" />}
          <div className="min-w-0">
            {sender && <p className="text-[0.8125rem] font-bold break-words">{sender.label}</p>}
            <p className="text-xs text-muted">{date}</p>
          </div>
        </div>
        {deadline && (
          <Chip tone="gold-soft" icon="alert">
            {deadline.season === world.date.season && deadline.week <= world.date.week
              ? m.inbox.deadlineNow
              : format(m.inbox.deadline, { week: deadline.week })}
          </Chip>
        )}
      </div>
      <h2
        id="inbox-reader-heading"
        className="font-display text-[2.125rem] leading-[0.95] break-words sm:text-[2.75rem]"
      >
        {text.subject}
      </h2>
      {text.body && <p className="max-w-prose text-base leading-relaxed">{text.body}</p>}
      {offer && offerClub && (offer.status === 'terms' || offer.status === 'agreed') && (
        <div className="flex flex-wrap items-center gap-4 rounded-control bg-surface-soft p-4">
          <CrestImage crest={offerClub.crest} alt="" className="h-[3.9rem] w-14 shrink-0" />
          <div className="min-w-0 flex-[1_1_12.5rem]">
            <p className="text-[0.9375rem] font-extrabold break-words">{offerClub.name}</p>
            <p className="text-[0.8125rem] text-muted">
              {offer.fee > 0
                ? format(m.inbox.offerLine, {
                    kind: m.kinds[offer.kind] ?? offer.kind,
                    fee: money(offer.fee),
                  })
                : (m.kinds[offer.kind] ?? offer.kind)}
            </p>
          </div>
        </div>
      )}
      {link && (
        <div className="max-sm:grid">
          <ButtonLink to={link.to} iconEnd="arrow" className="max-sm:w-full">
            {link.label}
          </ButtonLink>
        </div>
      )}
    </article>
  );
}
