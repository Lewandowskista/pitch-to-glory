import type { ReactNode } from 'react';

/**
 * The page frame. Its entrance is a CSS animation (styles/shell.css) that starts visible, so
 * the first paint never waits for script; reduced motion turns it off globally.
 */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`page ${className}`}>{children}</div>;
}
