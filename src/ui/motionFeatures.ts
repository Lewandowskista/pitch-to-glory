import { domAnimation } from 'framer-motion';

/**
 * Framer Motion's animation features, loaded lazily by the shell's LazyMotion: components use
 * the small `m` element, so the animation engine stays off every page's critical path.
 */
export default domAnimation;
