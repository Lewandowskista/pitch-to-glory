import { useReducedMotion } from 'framer-motion';
import { useAppStore } from '../store';

/** Reduced motion from the system setting or the in-game switch. */
export function useReducedMotionSetting(): boolean {
  const system = useReducedMotion();
  const setting = useAppStore((s) => s.settings.reducedMotion);
  return Boolean(system) || setting;
}
