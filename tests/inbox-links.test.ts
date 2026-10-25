import { describe, expect, it } from 'vitest';
import type { InboxMessage, World } from '../src/model/domain';
import type { InboxKind } from '../src/engine/career/market/records';
import { MESSAGE_DESTINATIONS, messageLink } from '../src/screens/career/inboxLinks';

/** Just what `messageLink` reads: the offers and the career's stories. */
const world = (stories: { id: string; status: string }[] = [], offers: unknown[] = []) =>
  ({ offers, career: { stories } }) as unknown as World;
const message = (subjectKey: string, actionId: string | null = null): InboxMessage => ({
  id: 'inbox:1',
  date: { season: 2026, week: 3, day: 0 },
  subjectKey,
  bodyKey: subjectKey,
  params: { season: 2026 },
  read: false,
  actionId,
});

describe('inbox message actions (review U7)', () => {
  it('sends an open story to its card on the hub, and a settled one nowhere', () => {
    const open = world([{ id: 'story:1', status: 'offered' }]);
    expect(messageLink(open, message('story-offer', 'story:1'), '1')).toEqual({
      to: '/career?save=1#story',
      label: 'Decide on the hub',
    });
    const settled = world([{ id: 'story:1', status: 'resolved' }]);
    expect(messageLink(settled, message('story-offer', 'story:1'), '1')).toBeNull();
    expect(messageLink(open, message('story-outcome', 'story:1'), '1')).toBeNull();
  });

  it('sends selection news to the Club page', () => {
    for (const kind of ['dropped', 'suspended'])
      expect(messageLink(world(), message(kind), '2')).toEqual({
        to: '/career/club?save=2',
        label: 'Go to Club life',
      });
  });

  it('shows no button for news with nothing to do, or a subject it does not know', () => {
    for (const kind of [
      'welcome-market',
      'new-manager',
      'ambition-achieved',
      'season-ambition-met',
      'retirement-due',
      'farewell',
      'testimonial',
      'an-old-subject',
    ])
      expect(messageLink(world(), message(kind), null)).toBeNull();
  });

  it('points to transfers only for bids, offers, contracts and requests', () => {
    const market =
      /^(offer-|loan-(offer|purchase|request)$|pre-contract-(offer|agreed)$|renewal-|contract-|transfer-request|release-clause$)/;
    for (const kind of Object.keys(MESSAGE_DESTINATIONS) as InboxKind[]) {
      const link = messageLink(world(), message(kind), null);
      expect(link?.to.startsWith('/career/transfers') ?? false, kind).toBe(market.test(kind));
    }
  });

  it('opens live talks from an offer, and the ceremony from the Golden Ball', () => {
    const talks = world([], [{ id: 'offer:7', status: 'terms' }]);
    expect(messageLink(talks, message('offer-terms', 'offer:7'), null)).toEqual({
      to: '/career/transfers?offer=offer%3A7',
      label: 'Go to the talks',
    });
    expect(messageLink(world(), message('golden-ball'), '1')?.to).toBe(
      '/career/trophies?ceremony=2026&save=1',
    );
  });
});
