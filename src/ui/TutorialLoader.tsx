import { useEffect, useState, type ComponentProps } from 'react';
import { useAppStore } from '../store';
import type { Tutorial as TutorialCard } from './Tutorial';

type Props = ComponentProps<typeof TutorialCard>;
let loaded: typeof TutorialCard | null = null;

/**
 * The guided tour, loaded only for a player who has not finished its track: most visits never
 * need it, so the hub and the match screen do not carry it. The tour is non-modal and optional,
 * so a failed download shows nothing rather than an error.
 */
export function Tutorial(props: Props) {
  const seen = useAppStore((s) => s.settings.tutorial[props.track]);
  const [Card, setCard] = useState(() => loaded);
  useEffect(() => {
    if (seen || Card) return;
    let current = true;
    import('./Tutorial').then(
      (module) => {
        loaded = module.Tutorial;
        if (current) setCard(() => module.Tutorial);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [seen, Card]);
  return Card ? <Card {...props} /> : null;
}
