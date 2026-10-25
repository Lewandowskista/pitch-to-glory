import { useEffect, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { setConsentInvitation, track } from '../analytics';
import { updateConsent, useAnalyticsConsent } from '../analytics/consent';
import { privacyText } from '../i18n/privacy';
import { Icon } from './Icon';
import { buttonClass } from './kit/Button';

/**
 * The one-time invitation to share play over time (tier 2, docs/ANALYTICS.md), after the first
 * finished match. It never blocks play and never takes focus: a card in the corner that keyboard
 * and screen-reader users reach in the normal order, announced politely. Answering or
 * dismissing it is remembered on this device, and Settings can change the answer at any time.
 */
export default function ConsentInvitation() {
  const p = privacyText.invitation;
  const consent = useAnalyticsConsent();
  const answered = consent.prompted || consent.personal || !consent.anonymous;
  useEffect(() => {
    if (answered) setConsentInvitation(false);
  }, [answered]);
  if (answered) return null;
  const answer = (personal: boolean) => {
    track('consent_prompt', { answer: personal ? 'accept' : 'decline' });
    updateConsent({ personal, prompted: true });
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Escape here dismisses the card rather than leaving the page.
    event.stopPropagation();
    answer(false);
  };
  return (
    <m.section
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      aria-live="polite"
      onKeyDown={escape}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      // Like the update prompt: under the app bar on phones, clear of the tab bar and fixed
      // footers; in the bottom corner on wider screens.
      className="fixed top-[calc(env(safe-area-inset-top,0px)+4.5rem)] right-4 left-4 z-40 flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 shadow-overlay min-[701px]:top-auto min-[701px]:right-5 min-[701px]:bottom-5 min-[701px]:left-auto min-[701px]:w-[24rem]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"
        >
          <Icon name="info" />
        </span>
        <div className="min-w-0">
          <h2 id="consent-title" className="m-0 text-base font-extrabold text-ink">
            {p.title}
          </h2>
          <p id="consent-body" className="m-0 mt-1 text-sm leading-relaxed text-muted">
            {p.body}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass('primary')} onClick={() => answer(true)}>
          {p.accept}
        </button>
        <button type="button" className={buttonClass('secondary')} onClick={() => answer(false)}>
          {p.decline}
        </button>
        <Link className="text-button ml-auto text-sm" to="/privacy">
          {p.more}
        </Link>
      </div>
    </m.section>
  );
}
