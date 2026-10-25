import { useEffect, useState, type ComponentProps } from 'react';
import { useAppStore } from '../store';
import type { Tutorial as TutorialCard, TutorialStep } from './Tutorial';
import type { tutorialText } from '../i18n/tutorial';

type Props = Omit<ComponentProps<typeof TutorialCard>, 'steps'> & {
  /** The steps, from the tour's copy, which loads with the tour. */
  steps: (text: typeof tutorialText) => TutorialStep[];
};
type Loaded = { Card: typeof TutorialCard; text: typeof tutorialText };
let loaded: Loaded | null = null;

/**
 * The guided tour, loaded with its copy only for a player who has not finished its track: most
 * visits never need it, so the hub and the match screen do not carry it. The tour is
 * non-modal and optional, so a failed download shows nothing rather than an error.
 */
export function Tutorial({ steps, ...props }: Props) {
  const seen = useAppStore((s) => s.settings.tutorial[props.track]);
  const [tour, setTour] = useState(() => loaded);
  useEffect(() => {
    if (seen || tour) return;
    let current = true;
    Promise.all([import('./Tutorial'), import('../i18n/tutorial')]).then(
      ([card, copy]) => {
        loaded = { Card: card.Tutorial, text: copy.tutorialText };
        if (current) setTour(loaded);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [seen, tour]);
  return tour ? <tour.Card {...props} steps={steps(tour.text)} /> : null;
}
