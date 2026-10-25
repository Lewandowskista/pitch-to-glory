import type { InboxMessage, World } from '../../model/domain';
import type { InboxKind } from '../../engine/career/market/records';
import { marketText as m } from '../../i18n/market';

/** Where a message can take the player: a page, the hub's story card, or nowhere. */
type Destination =
  | 'transfers'
  | 'club'
  | 'agent'
  | 'media'
  | 'rival'
  | 'lifestyle'
  | 'wardrobe'
  | 'trophies'
  | 'national'
  | 'story'
  | null;

/**
 * Every kind of message mapped on purpose (review U7): to the page where it is answered or
 * where what it reports lives. News with nothing to do next has no button; a subject not listed
 * here (from an older save) has none either.
 */
export const MESSAGE_DESTINATIONS: Record<InboxKind, Destination> = {
  'welcome-market': null,
  // Bids, offers and contracts: answered under Transfers (live talks open directly).
  'offer-terms': 'transfers',
  'offer-rejected': 'transfers',
  'release-clause': 'transfers',
  'loan-offer': 'transfers',
  'loan-purchase': 'transfers',
  'pre-contract-offer': 'transfers',
  'pre-contract-agreed': 'transfers',
  'renewal-offer': 'transfers',
  'renewal-improved': 'transfers',
  'renewal-refused': 'transfers',
  'renewal-signed': 'transfers',
  'offer-expired': 'transfers',
  'contract-decision': 'transfers',
  'contract-extended': 'transfers',
  'transfer-request': 'transfers',
  'transfer-request-withdrawn': 'transfers',
  'loan-request': 'transfers',
  // A new club: Club life is where you meet it.
  'transfer-complete': 'club',
  'pre-contract-complete': 'club',
  'free-transfer': 'club',
  'loan-start': 'club',
  'loan-end': 'club',
  relocated: 'club',
  // Selection: the team sheet and the ban are on the Club page.
  dropped: 'club',
  suspended: 'club',
  // The manager's promises and challenges are answered on the Club page.
  'promise-broken': 'club',
  'promise-offer': 'club',
  'promise-achieved': 'club',
  'promise-missed': 'club',
  'promise-cancelled': 'club',
  'new-manager': null,
  'mentee-manager': null,
  'agent-hired': 'agent',
  'agent-released': 'agent',
  'agent-pitch': 'agent',
  'agent-push': 'agent',
  'agent-renewal': 'agent',
  'press-request': 'media',
  'rival-transfer': 'rival',
  'sponsor-offer': 'lifestyle',
  'sponsor-signed': 'lifestyle',
  'sponsor-completed': 'lifestyle',
  'sponsor-failed': 'lifestyle',
  'sponsor-dropped': 'lifestyle',
  'sponsor-clawback': 'lifestyle',
  'sponsor-renewal': 'lifestyle',
  'investment-lost': 'lifestyle',
  experience: 'lifestyle',
  'asset-sold': 'lifestyle',
  'legacy-project': 'lifestyle',
  'fame-level': 'wardrobe',
  'call-up': 'national',
  tournament: 'national',
  qualified: 'national',
  'missed-qualification': 'national',
  award: 'trophies',
  'golden-ball': 'trophies',
  trophy: 'trophies',
  record: 'trophies',
  // Dressing-room and other stories are decided on the hub's story card while they are open.
  'story-offer': 'story',
  'story-outcome': null,
  'season-ambition-met': null,
  'season-ambition-missed': null,
  'ambition-achieved': null,
  'retirement-due': null,
  farewell: null,
  testimonial: null,
};

const PAGES: Record<Exclude<Destination, 'story' | null>, { path: string; label: string }> = {
  transfers: { path: '/career/transfers', label: m.inbox.goTransfers },
  club: { path: '/career/club', label: m.inbox.goClub },
  agent: { path: '/career/agent', label: m.inbox.goAgent },
  media: { path: '/career/media', label: m.inbox.goMedia },
  rival: { path: '/career/rival', label: m.inbox.goRival },
  lifestyle: { path: '/career/lifestyle', label: m.inbox.goLifestyle },
  wardrobe: { path: '/career/wardrobe', label: m.inbox.goWardrobe },
  trophies: { path: '/career/trophies', label: m.inbox.goTrophies },
  national: { path: '/career/national', label: m.inbox.goNational },
};

/** Where a message's action leads: open talks, the page that answers it, or nowhere. */
export function messageLink(
  world: World,
  message: InboxMessage,
  save: string | null,
): { to: string; label: string } | null {
  const suffix = save ? `save=${save}` : '';
  const join = (path: string, query = '', hash = '') =>
    `${path}${query || suffix ? '?' : ''}${[query, suffix].filter(Boolean).join('&')}${hash}`;
  if (message.actionId) {
    const offer = world.offers.find((entry) => entry.id === message.actionId);
    if (offer && (offer.status === 'terms' || offer.status === 'agreed'))
      return {
        to: join('/career/transfers', `offer=${encodeURIComponent(offer.id)}`),
        label: m.inbox.goTalks,
      };
  }
  const destination = Object.hasOwn(MESSAGE_DESTINATIONS, message.subjectKey)
    ? MESSAGE_DESTINATIONS[message.subjectKey as InboxKind]
    : null;
  if (!destination) return null;
  if (destination === 'story') {
    // Only while the story waits for an answer: the hub shows its card until then.
    const story = world.career?.stories?.find((entry) => entry.id === message.actionId);
    return story && story.status !== 'resolved'
      ? { to: join('/career', '', '#story'), label: m.inbox.goStory }
      : null;
  }
  const page = PAGES[destination];
  return {
    to: join(
      page.path,
      message.subjectKey === 'golden-ball' ? `ceremony=${message.params.season}` : '',
    ),
    label: page.label,
  };
}
